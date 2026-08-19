import redisConnection from "../redis";

// ----------------------------------------------------
// USER PROFILE NATURAL 60-SECOND REDIS CACHING
// ----------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCachedProfile<T = any>(email: string): Promise<T | null> {
  try {
    const data = await redisConnection.get(`user:profile:${email.toLowerCase()}`);
    return data ? (JSON.parse(data) as T) : null;
  } catch (err) {
    console.error("❌ Redis getCachedProfile error:", err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setCachedProfile<T = any>(email: string, profile: T): Promise<void> {
  try {
    await redisConnection.set(
      `user:profile:${email.toLowerCase()}`,
      JSON.stringify(profile),
      "EX",
      60 // Natural 60-Second TTL for 100M+ Scale Optimization
    );
  } catch (err) {
    console.error("❌ Redis setCachedProfile error:", err);
  }
}

export async function incrementCachedProfileBalance(email: string, delta: number): Promise<void> {
  if (!email || !delta) return;
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
  } catch (err) {
    console.error("❌ Redis incrementCachedProfileBalance error:", err);
  }
}

export async function incrementCachedMutualCount(email: string): Promise<void> {
  if (!email) return;
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
  } catch (err) {
    console.error("❌ Redis incrementCachedMutualCount error:", err);
  }
}

export async function invalidateCachedProfile(email: string): Promise<void> {
  if (!email) return;
  const emailLower = email.toLowerCase().trim();
  try {
    await Promise.all([
      redisConnection.del(`user:profile:${emailLower}`),
      redisConnection.del(`statement:payments:${emailLower}`),
      redisConnection.del(`statement:withdrawals:${emailLower}`),
    ]);
  } catch (err) {
    console.error("❌ Redis invalidateCachedProfile error:", err);
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
  try {
    const sortedInterests = [...interests].sort();
    const key = `highlights:v2:${country || "all"}:${state || "all"}:${sortedInterests.join(",")}`;
    const data = await redisConnection.get(key);
    return data ? (JSON.parse(data) as T[]) : null;
  } catch (err) {
    console.error("❌ Redis getCachedHighlights error:", err);
    return null;
  }
}

export async function setCachedHighlights<T = Record<string, unknown>>(
  interests: string[],
  highlights: T[],
  country?: string | null,
  state?: string | null
): Promise<void> {
  try {
    const sortedInterests = [...interests].sort();
    const key = `highlights:v2:${country || "all"}:${state || "all"}:${sortedInterests.join(",")}`;
    await redisConnection.set(
      key,
      JSON.stringify(highlights),
      "EX",
      300 // 5-Minute TTL for 100M+ Scale High-Performance Edge Offloading
    );
  } catch (err) {
    console.error("❌ Redis setCachedHighlights error:", err);
  }
}

// Rely 100% on Natural TTL Expiry across the entire app
export async function invalidateTargetedHighlightCache(_interest?: string, _country?: string | null, _state?: string | null): Promise<void> {
  // No-op: relying on natural 30-second TTL expiry to eliminate write-path Redis churn
}

export async function invalidateAllHighlights(): Promise<void> {
  // No-op: relying on natural 30-second TTL expiry to eliminate write-path Redis churn
}

