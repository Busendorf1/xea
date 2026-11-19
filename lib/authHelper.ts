import { NextRequest } from "next/server";
import { auth0 } from "./auth0";
import { jwtVerify, createRemoteJWKSet } from "jose";

const auth0Domain = process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL || "auth.paayh.com";
const cleanDomain = auth0Domain.replace(/^https?:\/\//, "");

// Local bounded cache for validated access tokens to prevent redundant userinfo HTTP calls
const MAX_CACHE_SIZE = 5000;
const tokenCache = new Map<string, { email: string; expiresAt: number; iatMs?: number }>();

export interface AccountAccessStatus {
  state: "active" | "temp_blocked" | "perm_banned" | "deactivated";
  blocked: boolean;
  blockType?: "temporary" | "permanent";
  blockedUntil?: string | null;
  reason?: string | null;
  message?: string;
}

const AUTH_STATUS_L1_TTL_MS = 60_000; // 60s L1 negative/positive auth status cache
const AUTH_STATUS_REDIS_TTL_S = 300; // 5m L2 Redis cache (explicitly invalidated on block/unblock/ban/deactivation)
const authStatusCache = new Map<string, { status: AccountAccessStatus; expiresAt: number }>();

const PERMANENT_BAN_REASONS = new Set(["admin_perm_banned", "perm_banned"]);

export function formatAccountBlockedMessage(params: {
  blockType: "temporary" | "permanent";
  blockedUntil?: string | null;
  reason?: string | null;
}): string {
  const cleanReason = params.reason ? String(params.reason).trim() : "";
  const reasonSuffix = cleanReason ? ` Reason: ${cleanReason}` : "";
  if (params.blockType === "temporary") {
    let untilLabel = "";
    if (params.blockedUntil) {
      const d = new Date(params.blockedUntil);
      if (!Number.isNaN(d.getTime())) {
        untilLabel = ` until ${d.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}`;
      }
    }
    return `Your account has been temporarily blocked${untilLabel} and cannot access Paayh right now.${reasonSuffix}`;
  }
  return `Your account has been permanently blocked from accessing Paayh.${reasonSuffix}`;
}

function setL1AuthStatus(cleanEmail: string, status: AccountAccessStatus) {
  if (authStatusCache.size >= MAX_CACHE_SIZE) {
    const oldest = authStatusCache.keys().next().value;
    if (oldest) authStatusCache.delete(oldest);
  }
  authStatusCache.set(cleanEmail, {
    status,
    expiresAt: Date.now() + AUTH_STATUS_L1_TTL_MS,
  });
}

export function revokeUserTokensLocally(email: string) {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return;
  authStatusCache.delete(cleanEmail);
  for (const [tok, val] of tokenCache.entries()) {
    if (val.email === cleanEmail) {
      tokenCache.delete(tok);
    }
  }
}

export async function invalidateAuthStatusCache(email: string): Promise<void> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return;
  revokeUserTokensLocally(cleanEmail);
  try {
    const { default: redisConnection, isRedisReady } = await import("./redis");
    if (isRedisReady()) {
      await redisConnection.del(`auth:status:${cleanEmail}`).catch(() => {});
    }
  } catch {}
}

/**
 * Resolves account access state (`active` | `temp_blocked` | `perm_banned` | `deactivated`)
 * with L1 (60s) + L2 Redis (5m) negative caching so 99%+ of active requests incur 0 DB reads.
 * Explicitly invalidated on admin block/unblock/ban/unban and user deactivation.
 */
export async function getAccountAccessStatus(email: string): Promise<AccountAccessStatus> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return { state: "active", blocked: false };

  const now = Date.now();

  // 1. Check L1 in-memory cache (<0.05ms)
  const l1 = authStatusCache.get(cleanEmail);
  if (l1 && l1.expiresAt > now) {
    if (l1.status.state === "temp_blocked" && l1.status.blockedUntil) {
      const untilMs = new Date(l1.status.blockedUntil).getTime();
      if (!Number.isNaN(untilMs) && untilMs <= now) {
        authStatusCache.delete(cleanEmail);
      } else {
        return l1.status;
      }
    } else {
      return l1.status;
    }
  }

  // 2. Check L2 Redis cache (single fast check across instances)
  try {
    const { default: redisConnection, isRedisReady } = await import("./redis");
    if (isRedisReady()) {
      const [isBanned, isDeactivated, cachedStatusRaw] = await Promise.all([
        redisConnection.get(`perm_banned:${cleanEmail}`),
        redisConnection.get(`deactivated:${cleanEmail}`),
        redisConnection.get(`auth:status:${cleanEmail}`),
      ]);

      if (cachedStatusRaw) {
        try {
          const parsed = JSON.parse(cachedStatusRaw) as AccountAccessStatus;
          if (parsed && parsed.state) {
            if (parsed.state === "temp_blocked" && parsed.blockedUntil) {
              const untilMs = new Date(parsed.blockedUntil).getTime();
              if (!Number.isNaN(untilMs) && untilMs <= now) {
                await redisConnection.del(`auth:status:${cleanEmail}`).catch(() => {});
              } else {
                setL1AuthStatus(cleanEmail, parsed);
                return parsed;
              }
            } else if (parsed.state === "active" && !isBanned && !isDeactivated) {
              setL1AuthStatus(cleanEmail, parsed);
              return parsed;
            } else if (parsed.state !== "active") {
              setL1AuthStatus(cleanEmail, parsed);
              return parsed;
            }
          }
        } catch {}
      }

      if (isBanned) {
        const st: AccountAccessStatus = {
          state: "perm_banned",
          blocked: true,
          blockType: "permanent",
          blockedUntil: null,
          reason: null,
          message: formatAccountBlockedMessage({ blockType: "permanent" }),
        };
        setL1AuthStatus(cleanEmail, st);
        return st;
      }

      if (isDeactivated) {
        const st: AccountAccessStatus = { state: "deactivated", blocked: false };
        setL1AuthStatus(cleanEmail, st);
        return st;
      }
    }
  } catch {}

  // 3. Cache miss -> single parallel DB lookup
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
        .select("id, ad_account_status, suspended_until, ad_ban_reason")
        .ilike("email", cleanEmail)
        .maybeSingle(),
    ]);

    const deactReason = String((deact as any)?.reason || "").toLowerCase().trim();
    const userStatus = String((userRow as any)?.ad_account_status || "").toLowerCase().trim();
    const banReason = (userRow as any)?.ad_ban_reason
      ? String((userRow as any).ad_ban_reason).trim()
      : null;

    let resolved: AccountAccessStatus = { state: "active", blocked: false };

    if (PERMANENT_BAN_REASONS.has(deactReason) || userStatus === "perm_banned" || userStatus === "banned") {
      resolved = {
        state: "perm_banned",
        blocked: true,
        blockType: "permanent",
        blockedUntil: null,
        reason: banReason,
        message: formatAccountBlockedMessage({ blockType: "permanent", reason: banReason }),
      };
    } else if (userStatus === "temp_blocked" || userStatus === "suspended") {
      const rawUntil = (userRow as any)?.suspended_until || null;
      const untilMs = rawUntil ? new Date(rawUntil).getTime() : NaN;
      if (Number.isFinite(untilMs) && untilMs <= now) {
        // Temporary block expired -> auto-restore cleanly in background
        if ((userRow as any)?.id) {
          supabaseAdmin
            .from("users")
            .update({ ad_account_status: "active", suspended_until: null, ad_ban_reason: null })
            .eq("id", (userRow as any).id)
            .then(() => {}, () => {});
        }
        resolved = { state: "active", blocked: false };
      } else {
        resolved = {
          state: "temp_blocked",
          blocked: true,
          blockType: "temporary",
          blockedUntil: rawUntil,
          reason: banReason,
          message: formatAccountBlockedMessage({
            blockType: "temporary",
            blockedUntil: rawUntil,
            reason: banReason,
          }),
        };
      }
    } else if (deact || userStatus === "deactivated") {
      resolved = { state: "deactivated", blocked: false };
    }

    setL1AuthStatus(cleanEmail, resolved);
    try {
      const { default: redisConnection, isRedisReady } = await import("./redis");
      if (isRedisReady()) {
        await redisConnection
          .set(`auth:status:${cleanEmail}`, JSON.stringify(resolved), "EX", AUTH_STATUS_REDIS_TTL_S)
          .catch(() => {});
        if (resolved.state === "perm_banned") {
          await redisConnection.set(`perm_banned:${cleanEmail}`, "1", "EX", 315360000).catch(() => {});
        }
      }
    } catch {}

    return resolved;
  } catch {
    return { state: "active", blocked: false };
  }
}

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
  const st = await getAccountAccessStatus(email);
  return st.state === "perm_banned";
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

  await invalidateAuthStatusCache(cleanEmail);

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

async function evaluateBearerOrSessionAccess(
  email: string,
  iatMs?: number
): Promise<{ allowed: boolean; blockedStatus?: AccountAccessStatus }> {
  const cleanEmail = email.toLowerCase().trim();
  if (await isTokenIssuedBeforeRevocation(cleanEmail, iatMs)) {
    return { allowed: false };
  }

  const status = await getAccountAccessStatus(cleanEmail);
  if (status.state === "perm_banned" || status.state === "temp_blocked") {
    return { allowed: false, blockedStatus: status };
  }

  if (status.state === "deactivated") {
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
            return { allowed: true };
          }
        }
      } catch {}
    }
    return { allowed: false };
  }

  return { allowed: true };
}

// Helper to check deactivated or blocked account status without pulling ioredis into client bundles
export async function isEmailDeactivated(email: string): Promise<boolean> {
  const status = await getAccountAccessStatus(email);
  return status.state !== "active";
}

import crypto from "crypto";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseCachedBearerRecord(raw: string): { email: string; iatMs?: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.email === "string" && parsed.email.includes("@")) {
        return {
          email: parsed.email.toLowerCase().trim(),
          iatMs: typeof parsed.iatMs === "number" ? parsed.iatMs : undefined,
        };
      }
    } catch {
      return null;
    }
  }
  if (trimmed.includes("@")) {
    return { email: trimmed.toLowerCase() };
  }
  return null;
}

/**
 * Resolves caller identity and, when an authenticated user is temporarily or permanently blocked
 * by an administrator, surfaces structured `blocked` metadata so UI endpoints (`/api/profile`,
 * `/api/feed`, `/logged-in`) can return HTTP 403 `ACCOUNT_BLOCKED` for the simple message modal.
 */
export async function getAuthenticatedEmailWithBlockInfo(
  req: NextRequest,
  options?: { allowMobileHeader?: boolean }
): Promise<{ email: string | null; blocked?: AccountAccessStatus }> {
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token) {
      // 1. Check L1 in-memory cache to resolve in <0.1ms
      const cached = tokenCache.get(token);
      if (cached && cached.expiresAt > Date.now()) {
        const access = await evaluateBearerOrSessionAccess(cached.email, cached.iatMs);
        if (!access.allowed) {
          tokenCache.delete(token);
          return { email: null, blocked: access.blockedStatus };
        }
        return { email: cached.email };
      }

      // 1b. Check L2 Redis cache across serverless instances to avoid Auth0 /userinfo rate limits
      const tokenDigest = hashToken(token);
      const redisTokenKey = `auth:bearer:${tokenDigest}`;
      try {
        const { default: redisConnection, isRedisReady } = await import("./redis");
        if (isRedisReady()) {
          const redisRaw = await redisConnection.get(redisTokenKey);
          const parsedRecord = redisRaw ? parseCachedBearerRecord(redisRaw) : null;
          if (parsedRecord) {
            const access = await evaluateBearerOrSessionAccess(parsedRecord.email, parsedRecord.iatMs);
            if (!access.allowed) {
              tokenCache.delete(token);
              await redisConnection.del(redisTokenKey).catch(() => {});
              return { email: null, blocked: access.blockedStatus };
            }
            tokenCache.set(token, {
              email: parsedRecord.email,
              expiresAt: Date.now() + 900_000,
              iatMs: parsedRecord.iatMs,
            });
            return { email: parsedRecord.email };
          }
        }
      } catch {}

      let email: string | undefined = undefined;
      let expiresAt = Date.now() + 3600000; // default 1 hour
      let tokenIatMs: number | undefined = undefined;

      try {
        // 2. Local cryptographic verification of RS256 signature using Auth0 JWKS
        const allowedAudiences = [
          process.env.AUTH0_AUDIENCE,
          process.env.AUTH0_CLIENT_ID,
        ]
          .map((v) => (v || "").trim())
          .filter((v) => v && v !== "placeholder-client-id");

        const { payload } = await jwtVerify(token, JWKS, {
          issuer: `https://${cleanDomain}/`,
          ...(allowedAudiences.length > 0 ? { audience: allowedAudiences } : {}),
        });

        if (payload.email_verified === false) {
          return { email: null };
        }

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
              if (userInfo?.email_verified === false) {
                return { email: null };
              }
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
        const access = await evaluateBearerOrSessionAccess(normalizedEmail, tokenIatMs);
        if (!access.allowed) {
          return { email: null, blocked: access.blockedStatus };
        }
        tokenCache.set(token, { email: normalizedEmail, expiresAt, iatMs: tokenIatMs });

        try {
          const { default: redisConnection, isRedisReady } = await import("./redis");
          if (isRedisReady()) {
            const ttlSeconds = Math.max(60, Math.min(3600, Math.floor((expiresAt - Date.now()) / 1000)));
            await redisConnection.set(
              redisTokenKey,
              JSON.stringify({ email: normalizedEmail, iatMs: tokenIatMs }),
              "EX",
              ttlSeconds
            );
          }
        } catch {}

        return { email: normalizedEmail };
      }
    }
  }

  // 4. Resolve Web Cookie Session (try cookies() first for App Router, fallback to req)
  let resolvedCookieEmail: string | null = null;
  let resolvedCookieLoginAt: number | undefined;
  try {
    const session = await auth0.getSession();
    if (session?.user?.email) {
      if ((session.user as Record<string, unknown>)?.email_verified === false) {
        return { email: null };
      }
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
          getSession: (
            r?: NextRequest
          ) => Promise<{ user?: { email?: string; loginAt?: unknown; email_verified?: boolean } } | null>;
        }
      ).getSession(req);
      if (sessionWithReq?.user?.email) {
        if (sessionWithReq.user.email_verified === false) {
          return { email: null };
        }
        resolvedCookieEmail = sessionWithReq.user.email.toLowerCase().trim();
        if (typeof sessionWithReq.user.loginAt === "number" && Number.isFinite(sessionWithReq.user.loginAt)) {
          resolvedCookieLoginAt = sessionWithReq.user.loginAt;
        }
      }
    } catch {}
  }

  if (resolvedCookieEmail) {
    const access = await evaluateBearerOrSessionAccess(resolvedCookieEmail, resolvedCookieLoginAt);
    if (!access.allowed) {
      return { email: null, blocked: access.blockedStatus };
    }
    return { email: resolvedCookieEmail };
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
      const access = await evaluateBearerOrSessionAccess(normalizedMobile);
      if (!access.allowed) {
        return { email: null, blocked: access.blockedStatus };
      }
      return { email: normalizedMobile };
    }
  }

  return { email: null };
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
  const { email } = await getAuthenticatedEmailWithBlockInfo(req, options);
  return email;
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

