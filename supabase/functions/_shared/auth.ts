// supabase/functions/_shared/auth.ts
// Zero-trust cryptographic caller verification for XEA Supabase Edge Functions

const AUTH0_DOMAIN = Deno.env.get("AUTH0_DOMAIN") || "auth.paayh.com";
const cleanDomain = AUTH0_DOMAIN.replace(/^https?:\/\//, "").replace(/\/+$/, "");

interface CachedUser {
  email: string;
  expiresAt: number;
}

const MAX_EDGE_TOKEN_CACHE = 5000;
const tokenCache = new Map<string, CachedUser>();
const jwksKeyCache = new Map<string, { key: CryptoKey; expiresAt: number }>();

function setEdgeTokenCache(token: string, entry: CachedUser) {
  if (tokenCache.size >= MAX_EDGE_TOKEN_CACHE) {
    const oldest = tokenCache.keys().next().value;
    if (oldest) tokenCache.delete(oldest);
  }
  tokenCache.set(token, entry);
}

export interface EdgeAccountBlockStatus {
  blocked: boolean;
  blockType?: "temporary" | "permanent";
  blockedUntil?: string | null;
  reason?: string | null;
  message?: string;
}

/**
 * Checks whether an authenticated user is temporarily or permanently blocked by an admin.
 */
export async function checkAccountBlockedEdge(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  email: string
): Promise<EdgeAccountBlockStatus> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail || cleanEmail === "service_role") return { blocked: false };

  try {
    const [{ data: deact }, { data: userRow }] = await Promise.all([
      supabase
        .from("deactivated_users")
        .select("reason")
        .ilike("email", cleanEmail)
        .maybeSingle(),
      supabase
        .from("users")
        .select("id, ad_account_status, suspended_until, ad_ban_reason")
        .ilike("email", cleanEmail)
        .maybeSingle(),
    ]);

    const deactReason = String(deact?.reason || "").toLowerCase().trim();
    const status = String(userRow?.ad_account_status || "").toLowerCase().trim();
    const banReason = userRow?.ad_ban_reason ? String(userRow.ad_ban_reason).trim() : null;
    const reasonSuffix = banReason ? ` Reason: ${banReason}` : "";

    if (
      deactReason === "admin_perm_banned" ||
      deactReason === "perm_banned" ||
      status === "perm_banned" ||
      status === "banned"
    ) {
      return {
        blocked: true,
        blockType: "permanent",
        blockedUntil: null,
        reason: banReason,
        message: `Your account has been permanently blocked from accessing Paayh.${reasonSuffix}`,
      };
    }

    if (status === "temp_blocked" || status === "suspended") {
      const rawUntil = userRow?.suspended_until || null;
      const untilMs = rawUntil ? new Date(rawUntil).getTime() : NaN;
      if (Number.isFinite(untilMs) && untilMs <= Date.now()) {
        // Auto-expire finished temporary block
        if (userRow?.id) {
          await supabase
            .from("users")
            .update({ ad_account_status: "active", suspended_until: null, ad_ban_reason: null })
            .eq("id", userRow.id);
        }
        return { blocked: false };
      }
      const untilLabel =
        rawUntil && Number.isFinite(untilMs)
          ? ` until ${new Date(untilMs).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}`
          : "";
      return {
        blocked: true,
        blockType: "temporary",
        blockedUntil: rawUntil,
        reason: banReason,
        message: `Your account has been temporarily blocked${untilLabel} and cannot access Paayh right now.${reasonSuffix}`,
      };
    }
  } catch {
    // Non-blocking lookup failure falls through
  }

  return { blocked: false };
}

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

        const allowedAudiences = [
          Deno.env.get("AUTH0_AUDIENCE"),
          Deno.env.get("AUTH0_CLIENT_ID"),
        ]
          .map((v) => (v || "").trim())
          .filter(Boolean);
        const tokenAudList = Array.isArray(claims.aud)
          ? claims.aud.map(String)
          : claims.aud
          ? [String(claims.aud)]
          : [];
        const audienceOk =
          allowedAudiences.length === 0 ||
          tokenAudList.some((a: string) => allowedAudiences.includes(a));

        if (issuer === expectedIss && audienceOk && claims.exp && claims.exp > nowSec) {
          if (claims.email_verified === false) {
            return null;
          }
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
                setEdgeTokenCache(token, {
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
      if (userInfo?.email_verified === false) {
        return null;
      }
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
        setEdgeTokenCache(token, {
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
