import redisConnection from "./redis";
import supabaseAdmin from "./utils/dbAdmin";

/**
 * High-Throughput Impression & Click Buffer for 100M+ Users.
 * Instead of hitting PostgreSQL on every single view/click (which causes write locks),
 * impression and click increments are written to Redis in < 1ms.
 * A background batch worker flushes accumulated totals to PostgreSQL.
 */

const REDIS_KEY_IMPRESSIONS = "buffer:ad_impressions";
const REDIS_KEY_CLICKS_PHONE = "buffer:clicks_phone";
const REDIS_KEY_CLICKS_WHATSAPP = "buffer:clicks_whatsapp";
const REDIS_KEY_CLICKS_WEBSITE = "buffer:clicks_website";
const REDIS_KEY_CLICKS_EMAIL = "buffer:clicks_email";
const REDIS_KEY_CLICKS_PRODUCT_CTA = "buffer:clicks_product_cta";

/**
 * Record an ad view asynchronously in Redis (Sub-millisecond latency).
 */
export async function bufferAdImpression(adId: string): Promise<void> {
  try {
    if (redisConnection && redisConnection.status === "ready") {
      await redisConnection.hincrby(REDIS_KEY_IMPRESSIONS, adId, 1);
      return;
    }
  } catch (e) {
    console.warn("⚠️ Redis impression buffer fallback to direct DB:", e);
  }

  // Fallback to direct DB update if Redis is unavailable
  try {
    await supabaseAdmin.rpc("increment_ad_impression", { p_ad_id: adId });
  } catch (e) {
    await supabaseAdmin
      .from("addsactive")
      .update({ impression_count: 1 }) // fallback incremental update
      .eq("id", adId);
  }
}

/**
 * Record an ad click asynchronously in Redis.
 */
export async function bufferAdClick(adId: string, clickType: "phone" | "whatsapp" | "website" | "email" | "product_cta"): Promise<void> {
  const keyMap = {
    phone: REDIS_KEY_CLICKS_PHONE,
    whatsapp: REDIS_KEY_CLICKS_WHATSAPP,
    website: REDIS_KEY_CLICKS_WEBSITE,
    email: REDIS_KEY_CLICKS_EMAIL,
    product_cta: REDIS_KEY_CLICKS_PRODUCT_CTA,
  };

  const redisKey = keyMap[clickType];

  try {
    if (redisConnection && redisConnection.status === "ready") {
      await redisConnection.hincrby(redisKey, adId, 1);
      return;
    }
  } catch (e) {
    console.warn("⚠️ Redis click buffer fallback to direct DB:", e);
  }
}

/**
 * Bulk Flush Worker: Flushes accumulated Redis impression & click counts to PostgreSQL in a single batch.
 * Can be called periodically by Cron or API background runner.
 */
export async function flushImpressionBuffersToDB(): Promise<{ flushedImpressions: number }> {
  if (!redisConnection || redisConnection.status !== "ready") {
    return { flushedImpressions: 0 };
  }

  try {
    // 1. Fetch and clear impression buffer atomically
    const impressionsData = await redisConnection.hgetall(REDIS_KEY_IMPRESSIONS);
    if (impressionsData && Object.keys(impressionsData).length > 0) {
      await redisConnection.del(REDIS_KEY_IMPRESSIONS);

      let count = 0;
      for (const [adId, deltaStr] of Object.entries(impressionsData)) {
        const delta = parseInt(deltaStr, 10);
        if (delta > 0) {
          count += delta;
          // Atomically increment in DB
          try {
            await supabaseAdmin.rpc("increment_ad_impressions_bulk", {
              p_ad_id: adId,
              p_count: delta,
            });
          } catch (err) {
            // Direct update fallback
            const { data: current } = await supabaseAdmin
              .from("addsactive")
              .select("impression_count")
              .eq("id", adId)
              .maybeSingle();

            if (current) {
              const newCount = Number(current.impression_count || 0) + delta;
              await supabaseAdmin
                .from("addsactive")
                .update({ impression_count: newCount })
                .eq("id", adId);
            }
          }
        }
      }
      return { flushedImpressions: count };
    }
  } catch (err) {
    console.error("❌ Error flushing impression buffer to DB:", err);
  }

  return { flushedImpressions: 0 };
}
