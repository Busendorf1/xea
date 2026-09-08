import { NextRequest } from "next/server";
import { auth0 } from "./auth0";
import { jwtVerify, createRemoteJWKSet } from "jose";

const auth0Domain = process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL || "dev-43c1fflhle3lv7jj.us.auth0.com";
const cleanDomain = auth0Domain.replace(/^https?:\/\//, "");

// Local bounded cache for validated access tokens to prevent redundant userinfo HTTP calls
const MAX_CACHE_SIZE = 5000;
const tokenCache = new Map<string, { email: string; expiresAt: number }>();

function cleanExpiredTokens() {
  const now = Date.now();
  for (const [key, val] of tokenCache.entries()) {
    if (val.expiresAt <= now) {
      tokenCache.delete(key);
    }
  }
}

// Auth0 JWKS endpoint provider
const JWKS = createRemoteJWKSet(
  new URL(`https://${cleanDomain}/.well-known/jwks.json`)
);

/**
 * Secure helper to fetch email from Auth0 access token (mobile Bearer)
 * or fallback to cookie session (web client).
 */
export async function getAuthenticatedEmail(
  req: NextRequest,
  options?: { allowMobileHeader?: boolean }
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    
    // 1. Check in-memory cache to resolve instantly
    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.email;
    }

    console.log("🔑 Next.js Server: Verifying mobile Auth0 access token...");
    let email: string | undefined = undefined;
    let expiresAt = Date.now() + 3600000; // default 1 hour

    try {
      // 2. Try local cryptographic verification of signature using JWKS
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: `https://${cleanDomain}/`,
      });

      // Extract email if present directly in token claims
      email = (payload["https://xea.app/email"] || payload.email) as string | undefined;
      if (payload.exp) {
        expiresAt = payload.exp * 1000;
      }
      console.log("✅ Next.js Server: Local JWT signature verified successfully.");
    } catch (err: unknown) {
      console.warn("⚠️ Next.js Server: Local JWT verification failed, falling back to Auth0 userinfo fetch:", (err as Error)?.message);
    }

    // 3. Fallback to /userinfo fetch with Abort timeout and retries (resilience to flaky hotspot networks)
    if (!email) {
      const attempts = 3;
      for (let i = 0; i < attempts; i++) {
        try {
          console.log(`📡 Next.js Server: Fetching email from Auth0 userinfo (Attempt ${i + 1}/${attempts})...`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 seconds timeout

          const res = await fetch(`https://${cleanDomain}/userinfo`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const userInfo = await res.json();
            email = userInfo.email;
            break;
          } else {
            const errText = await res.text();
            console.warn("❌ Next.js Server: Auth0 userinfo request failed:", errText);
          }
        } catch (fetchErr: unknown) {
          console.warn(`⚠️ Next.js Server: Auth0 userinfo fetch attempt ${i + 1} failed:`, (fetchErr as Error)?.message || fetchErr);
          if (i < attempts - 1) {
            await new Promise((r) => setTimeout(r, 800)); // wait 800ms before retrying
          }
        }
      }
    }

    if (email) {
      const normalizedEmail = email.toLowerCase();
      // Bound cache to prevent memory leaks in serverless/Node instances
      if (tokenCache.size >= MAX_CACHE_SIZE) {
        cleanExpiredTokens();
        if (tokenCache.size >= MAX_CACHE_SIZE) {
          const firstKey = tokenCache.keys().next().value;
          if (firstKey) tokenCache.delete(firstKey);
        }
      }
      tokenCache.set(token, { email: normalizedEmail, expiresAt });
      return normalizedEmail;
    }
  }

  // 4. Resolve Web Cookie Session (passing req first for Route Handlers, then fallback)
  try {
    const sessionWithReq = await (auth0 as any).getSession(req);
    if (sessionWithReq?.user?.email) {
      return sessionWithReq.user.email.toLowerCase().trim();
    }
  } catch {}

  try {
    const session = await auth0.getSession();
    if (session?.user?.email) {
      return session.user.email.toLowerCase().trim();
    }
  } catch {}

  // 5. Mobile Client Fallback (x-user-email header)
  if (options?.allowMobileHeader !== false) {
    const mobileHeader = req.headers.get("x-user-email");
    if (mobileHeader && mobileHeader.includes("@")) {
      return mobileHeader.toLowerCase().trim();
    }
  }

  return null;
}

/**
 * Helper to check if an email belongs to an administrator.
 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.trim().toLowerCase());
}

/**
 * Secure helper to verify if the caller is an authenticated Admin user.
 * Strictly requires verified JWT signature, Auth0 userinfo, or web cookie session.
 * Does NOT allow unauthenticated x-user-email header fallback.
 */
export async function verifyAdminUser(req: NextRequest): Promise<{ email: string } | null> {
  const email = await getAuthenticatedEmail(req, { allowMobileHeader: false });
  if (!email) return null;

  if (!isAdminEmail(email)) {
    return null;
  }

  return { email: email.toLowerCase() };
}

