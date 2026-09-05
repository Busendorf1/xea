import redisConnection, { isRedisReady } from "../redis";

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
// USER PROFILE NATURAL 60-SECOND REDIS CACHING
// ----------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCachedProfile<T = any>(email: string): Promise<T | null> {
  if (!isRedisReady()) return null;
  try {
    const data = await redisConnection.get(`user:profile:${email.toLowerCase()}`);
    return data ? (JSON.parse(data) as T) : null;
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis getCachedProfile notice:", err.message || err);
    }
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setCachedProfile<T = any>(email: string, profile: T): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await redisConnection.set(
      `user:profile:${email.toLowerCase()}`,
      JSON.stringify(profile),
      "EX",
      60 // Natural 60-Second TTL for 100M+ Scale Optimization
    );
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis setCachedProfile notice:", err.message || err);
    }
  }
}

export async function incrementCachedProfileBalance(email: string, delta: number): Promise<void> {
  if (!email || !delta || !isRedisReady()) return;
  const emailLower = email.toLowerCase().trim();
  try {
    const raw = await redisConnection.get(`user:profile:${emailLower}`);
    if (raw) {
      const profile = JSON.parse(raw);
      profile.balance = Math.max(0, Math.round(((profile.balance || 0) + delta) * 100) / 100);
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
  if (!email || !isRedisReady()) return;
  const emailLower = email.toLowerCase().trim();
  try {
    const raw = await redisConnection.get(`user:profile:${emailLower}`);
    if (raw) {
      const profile = JSON.parse(raw);
      profile.mutual_count = Math.min(50, (profile.mutual_count || 0) + 1);
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
  if (!email || !isRedisReady()) return 0;
  const emailLower = email.toLowerCase().trim();
  try {
    const liveKey = `user:live_clicks:${emailLower}`;
    const liveClicks = await redisConnection.incrby(liveKey, count);
    await redisConnection.expire(liveKey, 86400 * 30); // 30-day retention

    // Invalidate profile & monetize status cache to force fresh real-time calculation
    await Promise.all([
      redisConnection.del(`monetize:status:${emailLower}`),
      redisConnection.del(`user:profile:${emailLower}`),
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
  if (!email || !isRedisReady()) return;
  const emailLower = email.toLowerCase().trim();
  try {
    await Promise.all([
      redisConnection.del(`user:profile:${emailLower}`),
      redisConnection.del(`monetize:status:${emailLower}`),
      redisConnection.del(`statement:payments:${emailLower}`),
      redisConnection.del(`statement:withdrawals:${emailLower}`),
    ]);
  } catch (err: any) {
    if (err?.message !== "Connection is closed.") {
      console.warn("⚠️ Redis invalidateCachedProfile notice:", err.message || err);
    }
  }
}

// ----------------------------------------------------
// DAILY HIGHLIGHTS NATURAL 30-SECOND REDIS CACHING
// ----------------------------------------------------

export async function getCachedHighlights<T = Record<string, unknown>>(
  interests: string[],
  country?: string | null,
  state?: string | null
): Promise<T[] | null> {
  if (!isRedisReady()) return null;
  try {
    const sortedInterests = [...interests].sort();
    const key = `highlights:v2:${country || "all"}:${state || "all"}:${sortedInterests.join(",")}`;
    const data = await redisConnection.get(key);
    return data ? (JSON.parse(data) as T[]) : null;
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
  if (!isRedisReady()) return;
  try {
    const sortedInterests = [...interests].sort();
    const key = `highlights:v2:${country || "all"}:${state || "all"}:${sortedInterests.join(",")}`;
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
  // No-op: relying on natural 30-second TTL expiry to eliminate write-path Redis churn
}

export async function invalidateAllHighlights(): Promise<void> {
  // No-op: relying on natural 30-second TTL expiry to eliminate write-path Redis churn
}

