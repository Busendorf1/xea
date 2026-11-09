import redisConnection, { isRedisReady } from "../redis";
import supabaseAdmin from "./dbAdmin";

// ----------------------------------------------------
// ATOMIC REDIS LUA EARNING MULTI-DEVICE DEDUPLICATION
// ----------------------------------------------------

export async function atomicCheckAndAcquireEarnLock(
  email: string,
  adId: string,
  lockTtlSeconds = 15
): Promise<{ allowed: boolean; code: "OK" | "ALREADY_EARNED" | "CONCURRENT_CLAIM" }> {
  if (!isRedisReady()) return { allowed: true, code: "OK" };

  const emailLower = email.toLowerCase().trim();
  const earnLockKey = `lock:earn:${emailLower}:${adId}`;

  try {
    const acquired = await redisConnection.set(earnLockKey, "1", "EX", lockTtlSeconds, "NX");
    if (!acquired) {
      return { allowed: false, code: "CONCURRENT_CLAIM" };
    }
    return { allowed: true, code: "OK" };
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis atomicCheckAndAcquireEarnLock warning:", err.message || err);
    }
    return { allowed: true, code: "OK" };
  }
}

export async function releaseEarnLock(email: string, adId: string): Promise<void> {
  if (!isRedisReady()) return;
  const emailLower = email.toLowerCase().trim();
  const earnLockKey = `lock:earn:${emailLower}:${adId}`;
  try {
    await redisConnection.del(earnLockKey);
  } catch {}
}

export async function publishLiveBalanceUpdate(
  email: string,
  event: { delta: number; newBalance: number; clicks?: number; earnedAdId?: string }
): Promise<void> {
  if (!email) return;
  const emailLower = email.toLowerCase().trim();

  // 1. Redis Pub/Sub for Server-Sent Events (SSE) Stream
  if (isRedisReady()) {
    try {
      await redisConnection.publish(
        `live:balance:${emailLower}`,
        JSON.stringify({
          type: "LIVE_BALANCE_UPDATE",
          email: emailLower,
          delta: event.delta,
          newBalance: event.newBalance,
          clicks: event.clicks,
          earnedAdId: event.earnedAdId,
          timestamp: Date.now(),
        })
      );
    } catch (err: any) {
      if (err?.message !== "Connection is closed.") {
        console.warn("⚠️ Redis publishLiveBalanceUpdate notice:", err.message || err);
      }
    }
  }

  // 2. Supabase Realtime WebSocket Broadcast (0ms cross-device delivery to mobile & web)
  try {
    const supabaseAdmin = (await import("./dbAdmin")).default;
    const channelName = `realtime:user:${emailLower.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const channel = supabaseAdmin.channel(channelName);
    await channel.send({
      type: "broadcast",
      event: "balance_update",
      payload: {
        balance: event.newBalance,
        delta: event.delta,
        monetization_clicks: event.clicks,
        monetized: event.clicks !== undefined ? event.clicks >= 300 : undefined,
        earnedAdId: event.earnedAdId,
        email: emailLower,
        timestamp: Date.now(),
      },
    });
  } catch (sbErr) {
    console.warn("⚠️ Supabase Realtime WebSocket broadcast notice:", sbErr);
  }
}

// ----------------------------------------------------
// TWO-TIER (L1 IN-MEMORY LRU + L2 REDIS) USER PROFILE CACHING
// ----------------------------------------------------

const l1ProfileCache = new Map<string, { data: any; expiresAt: number }>();
const MAX_L1_PROFILES = 5000;
const L1_PROFILE_TTL_MS = 60 * 1000;

function setL1Profile(emailLower: string, profile: any) {
  if (l1ProfileCache.size >= MAX_L1_PROFILES && !l1ProfileCache.has(emailLower)) {
    const firstKey = l1ProfileCache.keys().next().value;
    if (firstKey) l1ProfileCache.delete(firstKey);
  }
  l1ProfileCache.set(emailLower, {
    data: profile,
    expiresAt: Date.now() + L1_PROFILE_TTL_MS,
  });
}

function getL1Profile<T = any>(emailLower: string): T | null {
  const entry = l1ProfileCache.get(emailLower);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    l1ProfileCache.delete(emailLower);
    return null;
  }
  return entry.data as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCachedProfile<T = any>(email: string): Promise<T | null> {
  if (!email) return null;
  const emailLower = email.toLowerCase().trim();

  // 1. Sub-millisecond L1 In-Memory hit (works even if Redis is offline or over quota)
  const l1Hit = getL1Profile<T>(emailLower);
  if (l1Hit) return l1Hit;

  if (!isRedisReady()) return null;
  try {
    const data = await redisConnection.get(`user:profile:${emailLower}`);
    if (data) {
      const parsed = JSON.parse(data) as T;
      setL1Profile(emailLower, parsed);
      return parsed;
    }
    return null;
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis getCachedProfile notice:", err.message || err);
    }
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setCachedProfile<T = any>(email: string, profile: T): Promise<void> {
  if (!email) return;
  const emailLower = email.toLowerCase().trim();
  setL1Profile(emailLower, profile);

  if (!isRedisReady()) return;
  try {
    const serialized = JSON.stringify(profile);
    const pipe = redisConnection.pipeline();
    pipe.set(`user:profile:${emailLower}`, serialized, "EX", 60);
    pipe.set(`profile:${emailLower}`, serialized, "EX", 60);
    await pipe.exec();
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis setCachedProfile notice:", err.message || err);
    }
  }
}

export async function incrementCachedProfileBalance(email: string, delta: number): Promise<void> {
  if (!email || !delta) return;
  const emailLower = email.toLowerCase().trim();

  const l1 = getL1Profile<any>(emailLower);
  if (l1) {
    l1.balance = Math.max(0, Math.round(((l1.balance || 0) + delta) * 100) / 100);
    setL1Profile(emailLower, l1);
  }

  if (!isRedisReady()) return;
  try {
    const raw = await redisConnection.get(`user:profile:${emailLower}`);
    if (raw) {
      const profile = JSON.parse(raw);
      profile.balance = Math.max(0, Math.round(((profile.balance || 0) + delta) * 100) / 100);
      setL1Profile(emailLower, profile);
      await redisConnection.set(
        `user:profile:${emailLower}`,
        JSON.stringify(profile),
        "EX",
        60
      );
    }
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis incrementCachedProfileBalance notice:", err.message || err);
    }
  }
}

export async function incrementCachedMutualCount(email: string): Promise<void> {
  if (!email) return;
  const emailLower = email.toLowerCase().trim();

  const l1 = getL1Profile<any>(emailLower);
  if (l1) {
    l1.mutual_count = Math.min(50, (l1.mutual_count || 0) + 1);
    setL1Profile(emailLower, l1);
  }

  if (!isRedisReady()) return;
  try {
    const raw = await redisConnection.get(`user:profile:${emailLower}`);
    if (raw) {
      const profile = JSON.parse(raw);
      profile.mutual_count = Math.min(50, (profile.mutual_count || 0) + 1);
      setL1Profile(emailLower, profile);
      await redisConnection.set(
        `user:profile:${emailLower}`,
        JSON.stringify(profile),
        "EX",
        60
      );
    }
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis incrementCachedMutualCount notice:", err.message || err);
    }
  }
}

export async function incrementCachedMonetizationClicks(email: string, count: number = 1): Promise<number> {
  if (!email) return 0;
  const emailLower = email.toLowerCase().trim();
  l1ProfileCache.delete(emailLower);

  if (!isRedisReady()) return 0;
  try {
    const liveKey = `user:live_clicks:v2:${emailLower}`;
    const exists = await redisConnection.exists(liveKey).catch(() => 0);
    let liveClicks = 0;
    if (!exists) {
      let base = 0;
      try {
        const { data: u } = await supabaseAdmin.from("users").select("monetization_clicks").ilike("email", emailLower).maybeSingle();
        base = Number(u?.monetization_clicks || 0);
      } catch {}
      liveClicks = base + count;
      await redisConnection.set(liveKey, String(liveClicks), "EX", 86400 * 30).catch(() => {});
    } else {
      liveClicks = await redisConnection.incrby(liveKey, count);
      await redisConnection.expire(liveKey, 86400 * 30); // 30-day retention
    }

    // Invalidate profile & monetize status cache to force fresh real-time calculation
    await Promise.all([
      redisConnection.del(`monetize:status:v2:${emailLower}`),
      redisConnection.del(`monetize:status:${emailLower}`),
      redisConnection.del(`user:profile:${emailLower}`),
      redisConnection.del(`profile:${emailLower}`),
    ]);

    return liveClicks;
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis incrementCachedMonetizationClicks notice:", err.message || err);
    }
    return 0;
  }
}

export async function invalidateCachedProfile(email: string): Promise<void> {
  if (!email) return;
  const emailLower = email.toLowerCase().trim();
  l1ProfileCache.delete(emailLower);

  if (!isRedisReady()) return;
  try {
    await Promise.all([
      redisConnection.del(`user:profile:${emailLower}`),
      redisConnection.del(`profile:${emailLower}`),
      redisConnection.del(`user:recipient:${emailLower}`),
      redisConnection.del(`monetize:status:${emailLower}`),
      redisConnection.del(`statement:payments:${emailLower}`),
      redisConnection.del(`statement:withdrawals:${emailLower}`),
      redisConnection.del(`statement:all:${emailLower}`),
    ]);
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis invalidateCachedProfile notice:", err.message || err);
    }
  }
}

// ----------------------------------------------------
// RECIPIENT ACCOUNT READ-THROUGH REDIS CACHING (P2P TRANSFER SPEED & SCALE)
// ----------------------------------------------------

export interface CachedRecipientInfo {
  id: string;
  email: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export async function getCachedRecipient(identifier: string): Promise<CachedRecipientInfo | null | "NOT_FOUND"> {
  if (!identifier) return null;
  const clean = identifier.toLowerCase().trim().replace(/^@/, "");
  const isEmail = clean.includes("@") && clean.includes(".");
  const specificKey = isEmail ? `user:recipient:email:${clean}` : `user:recipient:username:${clean}`;

  // Check L1 profile cache first if it's an email
  if (isEmail) {
    const l1Prof = getL1Profile<any>(clean);
    if (l1Prof && l1Prof.id) {
      return {
        id: l1Prof.id,
        email: l1Prof.email || clean,
        username: l1Prof.username || null,
        firstName: l1Prof.firstName || null,
        lastName: l1Prof.lastName || null,
      };
    }
  }

  if (!isRedisReady()) return null;
  try {
    // Check specific namespace key first
    const raw = await redisConnection.get(specificKey);
    if (raw) {
      if (raw === "__NOT_FOUND__") return "NOT_FOUND";
      return JSON.parse(raw) as CachedRecipientInfo;
    }

    // Check legacy key: user:recipient:${clean}
    const legacyRaw = await redisConnection.get(`user:recipient:${clean}`);
    if (legacyRaw) {
      if (legacyRaw === "__NOT_FOUND__") return "NOT_FOUND";
      return JSON.parse(legacyRaw) as CachedRecipientInfo;
    }

    // Secondary cache hit: check if the full profile is already cached in Redis (by email)
    if (isEmail) {
      const profileRaw = await redisConnection.get(`user:profile:${clean}`);
      if (profileRaw) {
        const profile = JSON.parse(profileRaw);
        if (profile && profile.id) {
          const info: CachedRecipientInfo = {
            id: profile.id,
            email: profile.email || clean,
            username: profile.username || null,
            firstName: profile.firstName || null,
            lastName: profile.lastName || null,
          };
          await setCachedRecipient(clean, info, 300);
          return info;
        }
      }
    }

    return null;
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis getCachedRecipient notice:", err.message || err);
    }
    return null;
  }
}

export async function setCachedRecipient(
  identifier: string,
  recipient: CachedRecipientInfo | null,
  ttlSeconds = 300 // 5-minute standard TTL for verified recipient accounts
): Promise<void> {
  if (!isRedisReady() || !identifier) return;
  const clean = identifier.toLowerCase().trim().replace(/^@/, "");
  const isEmail = clean.includes("@") && clean.includes(".");
  const primaryKey = isEmail ? `user:recipient:email:${clean}` : `user:recipient:username:${clean}`;

  try {
    if (!recipient) {
      const pipeline = redisConnection.pipeline();
      pipeline.set(primaryKey, "__NOT_FOUND__", "EX", 30);
      pipeline.set(`user:recipient:${clean}`, "__NOT_FOUND__", "EX", 30);
      await pipeline.exec();
    } else {
      const payload = JSON.stringify(recipient);
      const pipeline = redisConnection.pipeline();
      pipeline.set(primaryKey, payload, "EX", ttlSeconds);
      pipeline.set(`user:recipient:${clean}`, payload, "EX", ttlSeconds);
      if (recipient.email) {
        const cleanEmail = recipient.email.toLowerCase().trim();
        pipeline.set(`user:recipient:email:${cleanEmail}`, payload, "EX", ttlSeconds);
        pipeline.set(`user:recipient:${cleanEmail}`, payload, "EX", ttlSeconds);
      }
      if (recipient.username) {
        const cleanUsername = recipient.username.toLowerCase().trim().replace(/^@/, "");
        pipeline.set(`user:recipient:username:${cleanUsername}`, payload, "EX", ttlSeconds);
        pipeline.set(`user:recipient:${cleanUsername}`, payload, "EX", ttlSeconds);
      }
      await pipeline.exec();
    }
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis setCachedRecipient notice:", err.message || err);
    }
  }
}

export async function invalidateCachedRecipient(email: string): Promise<void> {
  if (!email || !isRedisReady()) return;
  const emailLower = email.toLowerCase().trim();
  try {
    await redisConnection.del(`user:recipient:${emailLower}`);
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis invalidateCachedRecipient notice:", err.message || err);
    }
  }
}

// ----------------------------------------------------
// TWO-TIER (L1 IN-MEMORY + L2 REDIS) HIGHLIGHTS CACHING
// ----------------------------------------------------

const l1HighlightsCache = new Map<string, { data: any[]; expiresAt: number }>();
const MAX_L1_HIGHLIGHT_KEYS = 500;
const L1_HIGHLIGHTS_TTL_MS = 60 * 1000;

export async function getCachedHighlights<T = Record<string, unknown>>(
  interests: string[],
  country?: string | null,
  state?: string | null
): Promise<T[] | null> {
  const sortedInterests = [...interests].map((s) => s.toLowerCase().trim()).sort();
  const key = `highlights:v2:${(country || "all").toLowerCase()}:${(state || "all").toLowerCase()}:${sortedInterests.join(",")}`;

  const l1 = l1HighlightsCache.get(key);
  if (l1) {
    if (Date.now() <= l1.expiresAt) {
      return l1.data as T[];
    }
    l1HighlightsCache.delete(key);
  }

  if (!isRedisReady()) return null;
  try {
    const data = await redisConnection.get(key);
    if (data) {
      const parsed = JSON.parse(data) as T[];
      if (l1HighlightsCache.size >= MAX_L1_HIGHLIGHT_KEYS) {
        const firstKey = l1HighlightsCache.keys().next().value;
        if (firstKey) l1HighlightsCache.delete(firstKey);
      }
      l1HighlightsCache.set(key, { data: parsed, expiresAt: Date.now() + L1_HIGHLIGHTS_TTL_MS });
      return parsed;
    }
    return null;
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis getCachedHighlights notice:", err.message || err);
    }
    return null;
  }
}

export async function setCachedHighlights<T = Record<string, unknown>>(
  interests: string[],
  highlights: T[],
  country?: string | null,
  state?: string | null
): Promise<void> {
  const sortedInterests = [...interests].map((s) => s.toLowerCase().trim()).sort();
  const key = `highlights:v2:${(country || "all").toLowerCase()}:${(state || "all").toLowerCase()}:${sortedInterests.join(",")}`;

  if (l1HighlightsCache.size >= MAX_L1_HIGHLIGHT_KEYS && !l1HighlightsCache.has(key)) {
    const firstKey = l1HighlightsCache.keys().next().value;
    if (firstKey) l1HighlightsCache.delete(firstKey);
  }
  l1HighlightsCache.set(key, { data: highlights, expiresAt: Date.now() + L1_HIGHLIGHTS_TTL_MS });

  if (!isRedisReady()) return;
  try {
    await redisConnection.set(
      key,
      JSON.stringify(highlights),
      "EX",
      300 // 5-Minute TTL for 100M+ Scale High-Performance Edge Offloading
    );
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis setCachedHighlights notice:", err.message || err);
    }
  }
}

// Rely 100% on Natural TTL Expiry across the entire app
export async function invalidateTargetedHighlightCache(_interest?: string, _country?: string | null, _state?: string | null): Promise<void> {
  l1HighlightsCache.clear();
}

export async function invalidateAllHighlights(): Promise<void> {
  l1HighlightsCache.clear();
}

// ----------------------------------------------------
// USER CAMPAIGNS & CAMPAIGN ANALYTICS CACHING
// ----------------------------------------------------

const l1CampaignsCache = new Map<string, { data: any; expiresAt: number }>();

export async function getCachedUserCampaigns<T = Record<string, unknown>>(
  email: string
): Promise<T | null> {
  if (!email) return null;
  const emailLower = email.toLowerCase().trim();
  const l1 = l1CampaignsCache.get(`camp:${emailLower}`);
  if (l1 && Date.now() <= l1.expiresAt) return l1.data as T;

  if (!isRedisReady()) return null;
  try {
    const data = await redisConnection.get(`user:campaigns:${emailLower}`);
    if (data) {
      const parsed = JSON.parse(data) as T;
      l1CampaignsCache.set(`camp:${emailLower}`, { data: parsed, expiresAt: Date.now() + 30000 });
      return parsed;
    }
    return null;
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis getCachedUserCampaigns notice:", err.message || err);
    }
    return null;
  }
}

export async function setCachedUserCampaigns<T = Record<string, unknown>>(
  email: string,
  campaigns: T
): Promise<void> {
  if (!email) return;
  const emailLower = email.toLowerCase().trim();
  l1CampaignsCache.set(`camp:${emailLower}`, { data: campaigns, expiresAt: Date.now() + 30000 });

  if (!isRedisReady()) return;
  try {
    await redisConnection.set(
      `user:campaigns:${emailLower}`,
      JSON.stringify(campaigns),
      "EX",
      30
    );
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis setCachedUserCampaigns notice:", err.message || err);
    }
  }
}

export async function invalidateCachedUserCampaigns(email?: string): Promise<void> {
  if (email) {
    const emailLower = email.toLowerCase().trim();
    l1CampaignsCache.delete(`camp:${emailLower}`);
    l1CampaignsCache.delete(`analytics:${emailLower}`);
  } else {
    l1CampaignsCache.clear();
  }
  if (!isRedisReady()) return;
  try {
    if (email) {
      const emailLower = email.toLowerCase().trim();
      await Promise.all([
        redisConnection.del(`user:campaigns:${emailLower}`),
        redisConnection.del(`user:campaign_analytics:${emailLower}`),
      ]);
    }
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis invalidateCachedUserCampaigns notice:", err.message || err);
    }
  }
}

export async function getCachedUserCampaignAnalytics<T = Record<string, unknown>>(
  email: string
): Promise<T | null> {
  if (!email) return null;
  const emailLower = email.toLowerCase().trim();
  const l1 = l1CampaignsCache.get(`analytics:${emailLower}`);
  if (l1 && Date.now() <= l1.expiresAt) return l1.data as T;

  if (!isRedisReady()) return null;
  try {
    const data = await redisConnection.get(`user:campaign_analytics:${emailLower}`);
    if (data) {
      const parsed = JSON.parse(data) as T;
      l1CampaignsCache.set(`analytics:${emailLower}`, { data: parsed, expiresAt: Date.now() + 60000 });
      return parsed;
    }
    return null;
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis getCachedUserCampaignAnalytics notice:", err.message || err);
    }
    return null;
  }
}

export async function setCachedUserCampaignAnalytics<T = Record<string, unknown>>(
  email: string,
  analytics: T
): Promise<void> {
  if (!email) return;
  const emailLower = email.toLowerCase().trim();
  l1CampaignsCache.set(`analytics:${emailLower}`, { data: analytics, expiresAt: Date.now() + 60000 });

  if (!isRedisReady()) return;
  try {
    await redisConnection.set(
      `user:campaign_analytics:${emailLower}`,
      JSON.stringify(analytics),
      "EX",
      60
    );
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis setCachedUserCampaignAnalytics notice:", err.message || err);
    }
  }
}

// ----------------------------------------------------
// L1 FEED & HIGHLIGHTS POOL EVICTION CALLBACK REGISTRY
// ----------------------------------------------------
let l1FeedEvictionHandler: ((adId?: string) => void) | null = null;
let l1HighlightsEvictionHandler: (() => void) | null = null;

export function registerL1FeedEvictionHandler(fn: (adId?: string) => void) {
  l1FeedEvictionHandler = fn;
}

export function registerL1HighlightsEvictionHandler(fn: () => void) {
  l1HighlightsEvictionHandler = fn;
}

export function evictAdFromL1FeedCaches(adId?: string) {
  if (l1FeedEvictionHandler) {
    try {
      l1FeedEvictionHandler(adId);
    } catch {}
  }
}

export function invalidateSharedHighlightsPool() {
  if (l1HighlightsEvictionHandler) {
    try {
      l1HighlightsEvictionHandler();
    } catch {}
  }
  if (isRedisReady()) {
    redisConnection.del("highlights:active_pool:v3").catch(() => {});
  }
}
