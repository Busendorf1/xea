// supabase/functions/_shared/auth.ts
// Zero-trust cryptographic caller verification for XEA Supabase Edge Functions

const AUTH0_DOMAIN = Deno.env.get("AUTH0_DOMAIN") || "auth.paayh.com";
const cleanDomain = AUTH0_DOMAIN.replace(/^https?:\/\//, "").replace(/\/+$/, "");

interface CachedUser {
  email: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedUser>();
const jwksKeyCache = new Map<string, { key: CryptoKey; expiresAt: number }>();

function decodeBase64UrlToBytes(b64url: string): Uint8Array {
  const base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function decodeBase64UrlToJson(b64url: string): Record<string, any> | null {
  try {
    const bytes = decodeBase64UrlToBytes(b64url);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function getAuth0PublicKey(kid?: string): Promise<CryptoKey | null> {
  const cacheKey = kid || "default";
  const cached = jwksKeyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  try {
    const res = await fetch(`https://${cleanDomain}/.well-known/jwks.json`);
    if (!res.ok) return null;
    const jwks = await res.json();
    const keys: any[] = Array.isArray(jwks?.keys) ? jwks.keys : [];
    const matched =
      (kid ? keys.find((k) => k.kid === kid && k.kty === "RSA") : null) ||
      keys.find((k) => k.kty === "RSA" && (!k.use || k.use === "sig"));
    if (!matched) return null;

    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      matched,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    jwksKeyCache.set(cacheKey, {
      key: cryptoKey,
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour JWKS cache
    });
    return cryptoKey;
  } catch {
    return null;
  }
}

/**
 * Extracts and cryptographically/API-verifies user identity from the incoming request.
 * Checks:
 *   1. Internal service-role secret (for admin/cron tasks)
 *   2. `x-user-authorization: Bearer <token>` (Kong Gateway mobile forward)
 *   3. `authorization: Bearer <token>` (Standard Bearer)
 *
 * Verifies with Auth0 (/userinfo) or cryptographically verifies RS256 JWT signature against Auth0 JWKS.
 * Returns lowercase normalized email or null if unauthenticated.
 */
export async function getVerifiedUserEmail(req: Request): Promise<string | null> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apikey = req.headers.get("apikey") || "";
  const authHeader = req.headers.get("authorization") || "";

  // 1. Allow internal service-role calls (crons, backend worker jobs)
  if (
    serviceKey &&
    (apikey === serviceKey || authHeader === `Bearer ${serviceKey}`)
  ) {
    const internalEmail = req.headers.get("x-user-email") || "";
    return internalEmail ? internalEmail.toLowerCase().trim() : "service_role";
  }

  // 2. Extract Bearer token from x-user-authorization or authorization header
  const userAuthHeader =
    req.headers.get("x-user-authorization") ||
    req.headers.get("authorization");

  if (!userAuthHeader || !userAuthHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = userAuthHeader.substring(7).trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  // If the token is just the public anon key, it does not prove user identity
  if (!token || token === anonKey) {
    return null;
  }

  // 3. Fast In-Memory Cache Check (<0.1ms)
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.email;
  }

  // 4. Verify RS256 signed JWT via Auth0 JWKS first if it's a 3-part JWT (fast, 0 external calls after JWKS warm)
  const parts = token.split(".");
  if (parts.length === 3) {
    try {
      const header = decodeBase64UrlToJson(parts[0]);
      const claims = decodeBase64UrlToJson(parts[1]);
      if (header?.alg === "RS256" && claims) {
        const issuer = String(claims.iss || "").replace(/\/+$/, "");
        const expectedIss = `https://${cleanDomain}`;
        const nowSec = Math.floor(Date.now() / 1000);

        if (issuer === expectedIss && claims.exp && claims.exp > nowSec) {
          const pubKey = await getAuth0PublicKey(header.kid);
          if (pubKey) {
            const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
            const signature = decodeBase64UrlToBytes(parts[2]);
            const isValid = await crypto.subtle.verify(
              "RSASSA-PKCS1-v1_5",
              pubKey,
              signature,
              signedData
            );

            if (isValid) {
              let email = (
                claims.email ||
                claims["https://xea.app/email"] ||
                ""
              )
                .toLowerCase()
                .trim();

              if (!email && claims.sub && String(claims.sub).startsWith("apple|")) {
                const sanitizedSub = String(claims.sub)
                  .replace(/^apple\|/, "")
                  .replace(/[^a-zA-Z0-9._-]/g, "_");
                email = `${sanitizedSub}@privaterelay.appleid.com`.toLowerCase();
              }

              if (email) {
                tokenCache.set(token, {
                  email,
                  expiresAt: Math.min(claims.exp * 1000, Date.now() + 10 * 60 * 1000),
                });
                return email;
              }
            }
          }
        }
      }
    } catch (jwtErr) {
      console.warn("JWKS verification notice:", jwtErr);
    }
  }

  // 5. Verify opaque or access token via Auth0 /userinfo
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const userinfoRes = await fetch(`https://${cleanDomain}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (userinfoRes.ok) {
      const userInfo = await userinfoRes.json();
      let email = (
        userInfo?.email ||
        userInfo?.["https://xea.app/email"] ||
        ""
      )
        .toLowerCase()
        .trim();

      if (!email && userInfo?.sub && String(userInfo.sub).startsWith("apple|")) {
        const sanitizedSub = String(userInfo.sub)
          .replace(/^apple\|/, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_");
        email = `${sanitizedSub}@privaterelay.appleid.com`.toLowerCase();
      }

      if (email) {
        tokenCache.set(token, {
          email,
          expiresAt: Date.now() + 5 * 60 * 1000, // 5 min TTL
        });
        return email;
      }
    }
  } catch (err) {
    console.warn("Auth0 userinfo verification notice:", err);
  }

  return null;
}
