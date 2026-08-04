import redisConnection from "../redis";

// ----------------------------------------------------
// USER PROFILE NATURAL 60-SECOND REDIS CACHING
// ----------------------------------------------------

export async function getCachedProfile(email: string): Promise<any | null> {
  try {
    const data = await redisConnection.get(`user:profile:${email.toLowerCase()}`);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("❌ Redis getCachedProfile error:", err);
    return null;
  }
}

export async function setCachedProfile(email: string, profile: any): Promise<void> {
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

export async function getCachedHighlights(interests: string[], country?: string | null, state?: string | null): Promise<any[] | null> {
  try {
    const sortedInterests = [...interests].sort();
    const key = `highlights:v2:${country || "all"}:${state || "all"}:${sortedInterests.join(",")}`;
    const data = await redisConnection.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("❌ Redis getCachedHighlights error:", err);
    return null;
  }
}

export async function setCachedHighlights(interests: string[], highlights: any[], country?: string | null, state?: string | null): Promise<void> {
  try {
    const sortedInterests = [...interests].sort();
    const key = `highlights:v2:${country || "all"}:${state || "all"}:${sortedInterests.join(",")}`;
    await redisConnection.set(
      key,
      JSON.stringify(highlights),
      "EX",
      30 // Natural 30-Second TTL for 100M+ Scale Optimization
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
