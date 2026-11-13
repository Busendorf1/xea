import { NextRequest } from "next/server";
import { auth0 } from "./auth0";
import { jwtVerify, createRemoteJWKSet } from "jose";

const auth0Domain = process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL || "auth.paayh.com";
const cleanDomain = auth0Domain.replace(/^https?:\/\//, "");

// Local bounded cache for validated access tokens to prevent redundant userinfo HTTP calls
const MAX_CACHE_SIZE = 5000;
const tokenCache = new Map<string, { email: string; expiresAt: number; iatMs?: number }>();

const PERMANENT_BAN_REASONS = new Set(["admin_perm_banned", "perm_banned"]);

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

export async function isEmailPermanentlyBanned(email: string): Promise<boolean> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return false;
  try {
    const { default: redisConnection, isRedisReady } = await import("./redis");
    if (isRedisReady()) {
      const banned = await redisConnection.get(`perm_banned:${cleanEmail}`);
      if (banned) return true;
    }
  } catch {}

  try {
    const { default: supabaseAdmin } = await import("./utils/dbAdmin");
    const [{ data: deact }, { data: userRow }] = await Promise.all([
      supabaseAdmin
        .from("deactivated_users")
        .select("email, reason")
        .ilike("email", cleanEmail)
        .maybeSingle(),
      supabaseAdmin
        .from("users")
        .select("ad_account_status")
        .ilike("email", cleanEmail)
        .maybeSingle(),
    ]);

    const reason = String((deact as any)?.reason || "").toLowerCase().trim();
    if (PERMANENT_BAN_REASONS.has(reason) || userRow?.ad_account_status === "perm_banned") {
      try {
        const { default: redisConnection, isRedisReady } = await import("./redis");
        if (isRedisReady()) {
          await redisConnection.set(`perm_banned:${cleanEmail}`, "1", "EX", 315360000).catch(() => {});
        }
      } catch {}
      return true;
    }
  } catch {}

  return false;
}

/**
 * Clears non-ban self-deactivation or 60-day dormancy tombstones when a user signs in
 * again with a fresh identity so they can recreate a clean account via profile setup.
 * Permanent admin bans (`perm_banned` / `admin_perm_banned`) are NEVER cleared.
 */
export async function clearSelfDeactivationForRejoin(
  email: string
): Promise<{ allowed: boolean; permanentlyBanned: boolean }> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return { allowed: false, permanentlyBanned: false };

  if (await isEmailPermanentlyBanned(cleanEmail)) {
    return { allowed: false, permanentlyBanned: true };
  }

  try {
    const { default: redisConnection, isRedisReady } = await import("./redis");
    if (isRedisReady()) {
      await redisConnection.del(`deactivated:${cleanEmail}`).catch(() => {});
    }
  } catch {}

  try {
    const { default: supabaseAdmin } = await import("./utils/dbAdmin");
    await supabaseAdmin
      .from("deactivated_users")
      .delete()
      .ilike("email", cleanEmail);

    const { data: leftoverUser } = await supabaseAdmin
      .from("users")
      .select("id, ad_account_status")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (leftoverUser && leftoverUser.ad_account_status === "deactivated") {
      const { error: delErr } = await supabaseAdmin
        .from("users")
        .delete()
        .eq("id", leftoverUser.id);

      if (delErr) {
        const ts = Date.now();
        await supabaseAdmin
          .from("users")
          .update({
            ad_account_status: "active",
            has_updated_profile: false,
            country: "PLACEHOLDER",
            state: "PLACEHOLDER",
            location: "PLACEHOLDER",
            phone: `PLACEHOLDER_PHONE_${ts}`,
            passphrase: `PLACEHOLDER_PASS_${ts}`,
            balance: 0,
            monetized: "false",
            monetization_clicks: 0,
            is_agent: false,
            referred_by: null,
          })
          .eq("id", leftoverUser.id);
      }
    }
  } catch {}

  try {
    const { invalidateCachedProfile } = await import("./utils/cache");
    await invalidateCachedProfile(cleanEmail).catch(() => {});
  } catch {}

  return { allowed: true, permanentlyBanned: false };
}

async function isTokenIssuedBeforeRevocation(email: string, iatMs?: number): Promise<boolean> {
  if (!iatMs) return false;
  try {
    const { default: redisConnection, isRedisReady } = await import("./redis");
    if (isRedisReady()) {
      const raw = await redisConnection.get(`revoked_before:${email.toLowerCase().trim()}`);
      if (raw && iatMs < Number(raw)) {
        return true;
      }
    }
  } catch {}
  return false;
}

async function checkDeactivatedOrAllowFreshBearer(email: string, iatMs?: number): Promise<boolean> {
  const cleanEmail = email.toLowerCase().trim();
  if (await isEmailPermanentlyBanned(cleanEmail)) return true;
  if (await isTokenIssuedBeforeRevocation(cleanEmail, iatMs)) return true;

  if (iatMs) {
    try {
      const { default: supabaseAdmin } = await import("./utils/dbAdmin");
      const { data: deact } = await supabaseAdmin
        .from("deactivated_users")
        .select("deactivated_at, reason")
        .ilike("email", cleanEmail)
        .maybeSingle();

      const reason = String((deact as any)?.reason || "").toLowerCase().trim();
      if (deact && !PERMANENT_BAN_REASONS.has(reason)) {
        const deactMs = deact.deactivated_at ? new Date(deact.deactivated_at).getTime() : 0;
        if (!Number.isNaN(deactMs) && iatMs > deactMs + 1000) {
          await clearSelfDeactivationForRejoin(cleanEmail);
          return false;
        }
      }
    } catch {}
  }

  return await isEmailDeactivated(cleanEmail);
}

// Helper to check deactivated tombstone without pulling ioredis into client bundles
export async function isEmailDeactivated(email: string): Promise<boolean> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return false;
  try {
    const { default: redisConnection, isRedisReady } = await import("./redis");
    if (isRedisReady()) {
      const [isBanned, isDeactivated] = await Promise.all([
        redisConnection.get(`perm_banned:${cleanEmail}`),
        redisConnection.get(`deactivated:${cleanEmail}`),
      ]);
      if (isBanned || isDeactivated) return true;
    }
  } catch {}

  try {
    const { default: supabaseAdmin } = await import("./utils/dbAdmin");
    const { data: deact } = await supabaseAdmin
      .from("deactivated_users")
      .select("email")
      .ilike("email", cleanEmail)
      .maybeSingle();
    if (deact) return true;

    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("ad_account_status")
      .ilike("email", cleanEmail)
      .maybeSingle();
    if (userRow?.ad_account_status === "deactivated" || userRow?.ad_account_status === "perm_banned") {
      return true;
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
        if (await checkDeactivatedOrAllowFreshBearer(cached.email, cached.iatMs)) {
          tokenCache.delete(token);
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
            if (await checkDeactivatedOrAllowFreshBearer(normalizedRedisEmail)) {
              tokenCache.delete(token);
              await redisConnection.del(redisTokenKey).catch(() => {});
              return null;
            }
            tokenCache.set(token, { email: normalizedRedisEmail, expiresAt: Date.now() + 900_000 });
            return normalizedRedisEmail;
          }
        }
      } catch {}

      let email: string | undefined = undefined;
      let expiresAt = Date.now() + 3600000; // default 1 hour
      let tokenIatMs: number | undefined = undefined;

      try {
        // 2. Local cryptographic verification of RS256 signature using Auth0 JWKS
        const { payload } = await jwtVerify(token, JWKS, {
          issuer: `https://${cleanDomain}/`,
        });

        email = (payload["https://xea.app/email"] || payload.email) as string | undefined;
        if (!email && payload.sub && String(payload.sub).startsWith("apple|")) {
          const sanitizedSub = String(payload.sub)
            .replace(/^apple\|/, "")
            .replace(/[^a-zA-Z0-9._-]/g, "_");
          email = `${sanitizedSub}@privaterelay.appleid.com`.toLowerCase();
        }
        if (payload.exp) {
          expiresAt = payload.exp * 1000;
        }
        if (typeof payload.iat === "number") {
          tokenIatMs = payload.iat * 1000;
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
              email = userInfo.email || userInfo["https://xea.app/email"];
              if (!email && userInfo.sub && String(userInfo.sub).startsWith("apple|")) {
                const sanitizedSub = String(userInfo.sub)
                  .replace(/^apple\|/, "")
                  .replace(/[^a-zA-Z0-9._-]/g, "_");
                email = `${sanitizedSub}@privaterelay.appleid.com`.toLowerCase();
              }
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
        if (await checkDeactivatedOrAllowFreshBearer(normalizedEmail, tokenIatMs)) {
          return null;
        }
        tokenCache.set(token, { email: normalizedEmail, expiresAt, iatMs: tokenIatMs });

        try {
          const { default: redisConnection, isRedisReady } = await import("./redis");
          if (isRedisReady()) {
            const ttlSeconds = Math.max(60, Math.min(3600, Math.floor((expiresAt - Date.now()) / 1000)));
            await redisConnection.set(redisTokenKey, normalizedEmail, "EX", ttlSeconds);
          }
        } catch {}

        return normalizedEmail;
      }
    }
  }

  // 4. Resolve Web Cookie Session (try cookies() first for App Router, fallback to req)
  let resolvedCookieEmail: string | null = null;
  let resolvedCookieLoginAt: number | undefined;
  try {
    const session = await auth0.getSession();
    if (session?.user?.email) {
      resolvedCookieEmail = session.user.email.toLowerCase().trim();
      const loginAt = (session.user as Record<string, unknown>)?.loginAt;
      if (typeof loginAt === "number" && Number.isFinite(loginAt)) {
        resolvedCookieLoginAt = loginAt;
      }
    }
  } catch {}

  if (!resolvedCookieEmail) {
    try {
      const sessionWithReq = await (
        auth0 as unknown as {
          getSession: (r?: NextRequest) => Promise<{ user?: { email?: string; loginAt?: unknown } } | null>;
        }
      ).getSession(req);
      if (sessionWithReq?.user?.email) {
        resolvedCookieEmail = sessionWithReq.user.email.toLowerCase().trim();
        if (typeof sessionWithReq.user.loginAt === "number" && Number.isFinite(sessionWithReq.user.loginAt)) {
          resolvedCookieLoginAt = sessionWithReq.user.loginAt;
        }
      }
    } catch {}
  }

  if (resolvedCookieEmail) {
    if (await isEmailDeactivated(resolvedCookieEmail)) {
      if (resolvedCookieLoginAt && !(await isEmailPermanentlyBanned(resolvedCookieEmail))) {
        try {
          const { default: supabaseAdmin } = await import("./utils/dbAdmin");
          const [{ data: deact }, { data: userRow }] = await Promise.all([
            supabaseAdmin.from("deactivated_users").select("deactivated_at").ilike("email", resolvedCookieEmail).maybeSingle(),
            supabaseAdmin.from("users").select("ad_account_status").ilike("email", resolvedCookieEmail).maybeSingle(),
          ]);
          const deactMs = deact?.deactivated_at ? new Date(deact.deactivated_at).getTime() : 0;
          const dbCleared = !deact && userRow?.ad_account_status !== "deactivated";
          const newerLogin = Boolean(deact && !Number.isNaN(deactMs) && resolvedCookieLoginAt > deactMs + 1000);
          if (dbCleared || newerLogin) {
            await clearSelfDeactivationForRejoin(resolvedCookieEmail);
            return resolvedCookieEmail;
          }
        } catch {}
      }
      return null;
    }
    return resolvedCookieEmail;
  }

  // 5. Mobile client fallback using x-user-email header (ONLY when explicitly permitted in dev/test)
  const isTestOrDev = process.env.NODE_ENV !== "production";
  const allowUnverifiedHeader =
    options?.allowMobileHeader === true &&
    (isTestOrDev || process.env.ALLOW_UNVERIFIED_MOBILE_HEADER === "true");

  if (allowUnverifiedHeader) {
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

