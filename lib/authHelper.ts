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

// Helper to check deactivated tombstone without pulling ioredis into client bundles
async function isEmailDeactivated(email: string): Promise<boolean> {
  try {
    const { default: redisConnection, isRedisReady } = await import("./redis");
    if (isRedisReady()) {
      const isDeactivated = await redisConnection.get(`deactivated:${email}`);
      return !!isDeactivated;
    }
  } catch {}
  return false;
}

import crypto from "crypto";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Secure helper to fetch email from Auth0 access/ID token (mobile Bearer)
 * or fallback to cookie session (web client).
 *
 * SECURITY: Never trusts raw `x-user-email` headers unless explicitly running
 * in a non-production test harness with ALLOW_UNVERIFIED_MOBILE_HEADER=true.
 */
export async function getAuthenticatedEmail(
  req: NextRequest,
  options?: { allowMobileHeader?: boolean }
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token) {
      // 1. Check L1 in-memory cache to resolve in <0.1ms
      const cached = tokenCache.get(token);
      if (cached && cached.expiresAt > Date.now()) {
        if (await isEmailDeactivated(cached.email)) {
          return null;
        }
        return cached.email;
      }

      // 1b. Check L2 Redis cache across serverless instances to avoid Auth0 /userinfo rate limits
      const tokenDigest = hashToken(token);
      const redisTokenKey = `auth:bearer:${tokenDigest}`;
      try {
        const { default: redisConnection, isRedisReady } = await import("./redis");
        if (isRedisReady()) {
          const redisEmail = await redisConnection.get(redisTokenKey);
          if (redisEmail && redisEmail.includes("@")) {
            const normalizedRedisEmail = redisEmail.toLowerCase().trim();
            tokenCache.set(token, { email: normalizedRedisEmail, expiresAt: Date.now() + 900_000 });
            if (await isEmailDeactivated(normalizedRedisEmail)) {
              return null;
            }
            return normalizedRedisEmail;
          }
        }
      } catch {}

      let email: string | undefined = undefined;
      let expiresAt = Date.now() + 3600000; // default 1 hour

      try {
        // 2. Local cryptographic verification of RS256 signature using Auth0 JWKS
        const { payload } = await jwtVerify(token, JWKS, {
          issuer: `https://${cleanDomain}/`,
        });

        email = (payload["https://xea.app/email"] || payload.email) as string | undefined;
        if (payload.exp) {
          expiresAt = payload.exp * 1000;
        }
      } catch {
        // Opaque access token: proceed to Auth0 /userinfo verification
      }

      // 3. Fallback to /userinfo fetch with Abort timeout and retries
      if (!email) {
        const attempts = 3;
        for (let i = 0; i < attempts; i++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const res = await fetch(`https://${cleanDomain}/userinfo`, {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (res.ok) {
              const userInfo = await res.json();
              email = userInfo.email;
              break;
            } else if (res.status === 401 || res.status === 403) {
              // Invalid or expired token; do not retry
              break;
            }
          } catch {
            if (i < attempts - 1) {
              await new Promise((r) => setTimeout(r, 500));
            }
          }
        }
      }

      if (email) {
        const normalizedEmail = email.toLowerCase().trim();
        if (tokenCache.size >= MAX_CACHE_SIZE) {
          cleanExpiredTokens();
          if (tokenCache.size >= MAX_CACHE_SIZE) {
            const firstKey = tokenCache.keys().next().value;
            if (firstKey) tokenCache.delete(firstKey);
          }
        }
        tokenCache.set(token, { email: normalizedEmail, expiresAt });

        try {
          const { default: redisConnection, isRedisReady } = await import("./redis");
          if (isRedisReady()) {
            const ttlSeconds = Math.max(60, Math.min(3600, Math.floor((expiresAt - Date.now()) / 1000)));
            await redisConnection.set(redisTokenKey, normalizedEmail, "EX", ttlSeconds);
          }
        } catch {}

        if (await isEmailDeactivated(normalizedEmail)) {
          return null;
        }
        return normalizedEmail;
      }
    }
  }

  // 4. Resolve Web Cookie Session (passing req first for Route Handlers, then fallback)
  let resolvedCookieEmail: string | null = null;
  try {
    const sessionWithReq = await (auth0 as unknown as { getSession: (r?: NextRequest) => Promise<{ user?: { email?: string } } | null> }).getSession(req);
    if (sessionWithReq?.user?.email) {
      resolvedCookieEmail = sessionWithReq.user.email.toLowerCase().trim();
    }
  } catch {}

  if (!resolvedCookieEmail) {
    try {
      const session = await auth0.getSession();
      if (session?.user?.email) {
        resolvedCookieEmail = session.user.email.toLowerCase().trim();
      }
    } catch {}
  }

  if (resolvedCookieEmail) {
    if (await isEmailDeactivated(resolvedCookieEmail)) {
      return null;
    }
    return resolvedCookieEmail;
  }

  // 5. Explicitly gated non-production test harness fallback ONLY
  if (
    options?.allowMobileHeader === true &&
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_UNVERIFIED_MOBILE_HEADER === "true"
  ) {
    const mobileHeader = req.headers.get("x-user-email");
    if (mobileHeader && mobileHeader.includes("@") && mobileHeader.length <= 254) {
      const normalizedMobile = mobileHeader.toLowerCase().trim();
      if (await isEmailDeactivated(normalizedMobile)) {
        return null;
      }
      return normalizedMobile;
    }
  }

  return null;
}

// Import and re-export isAdminEmail from lightweight adminHelper
import { isAdminEmail } from "./adminHelper";
export { isAdminEmail };

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

