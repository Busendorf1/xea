import redisConnection from "../redis";

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
    if (!profile) return;
    await redisConnection.set(
      `user:profile:${email.toLowerCase()}`,
      JSON.stringify(profile),
      "EX",
      600 // 10 minutes cache TTL
    );
  } catch (err) {
    console.error("❌ Redis setCachedProfile error:", err);
  }
}

export async function invalidateCachedProfile(email: string): Promise<void> {
  try {
    await redisConnection.del(`user:profile:${email.toLowerCase()}`);
    console.log(`🧹 Redis cache invalidated for profile: ${email.toLowerCase()}`);
  } catch (err) {
    console.error("❌ Redis invalidateCachedProfile error:", err);
  }
}

export async function getCachedHighlights(interests: string[]): Promise<any[] | null> {
  try {
    const sortedInterests = [...interests].sort();
    const key = `highlights:interests:${sortedInterests.join(",")}`;
    const data = await redisConnection.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("❌ Redis getCachedHighlights error:", err);
    return null;
  }
}

export async function setCachedHighlights(interests: string[], highlights: any[]): Promise<void> {
  try {
    const sortedInterests = [...interests].sort();
    const key = `highlights:interests:${sortedInterests.join(",")}`;
    await redisConnection.set(
      key,
      JSON.stringify(highlights),
      "EX",
      3600 // 1 hour cache TTL
    );
  } catch (err) {
    console.error("❌ Redis setCachedHighlights error:", err);
  }
}

export async function invalidateAllHighlights(): Promise<void> {
  try {
    const keys = await redisConnection.keys("highlights:interests:*");
    if (keys.length > 0) {
      await redisConnection.del(...keys);
      console.log(`🧹 Redis cache cleared for highlights keys: ${keys.length}`);
    }
  } catch (err) {
    console.error("❌ Redis invalidateAllHighlights error:", err);
  }
}
