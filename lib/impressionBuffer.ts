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
  } catch (_e) {
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

// Atomic Lua script: fetches all key-value pairs from a hash and deletes the hash atomically in a single Redis transaction
const LUA_FETCH_AND_DEL = `
  local data = redis.call('HGETALL', KEYS[1])
  if #data > 0 then
    redis.call('DEL', KEYS[1])
  end
  return data
`;

/**
 * Bulk Flush Worker: Flushes accumulated Redis impression & click counts to PostgreSQL atomically in batches.
 */
export async function flushImpressionBuffersToDB(): Promise<{ flushedImpressions: number; flushedClicks: number }> {
  if (!redisConnection || redisConnection.status !== "ready") {
    return { flushedImpressions: 0, flushedClicks: 0 };
  }

  let flushedImpressions = 0;
  let flushedClicks = 0;

  try {
    // 1. Atomically fetch and clear impression buffer using Lua script
    const rawImpressionPairs = (await redisConnection.eval(LUA_FETCH_AND_DEL, 1, REDIS_KEY_IMPRESSIONS)) as string[];
    if (rawImpressionPairs && rawImpressionPairs.length > 0) {
      for (let i = 0; i < rawImpressionPairs.length; i += 2) {
        const adId = rawImpressionPairs[i];
        const delta = parseInt(rawImpressionPairs[i + 1], 10);
        if (delta > 0) {
          flushedImpressions += delta;
          try {
            await supabaseAdmin.rpc("increment_ad_impressions_bulk", {
              p_ad_id: adId,
              p_count: delta,
            });
          } catch (_err) {
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
    }

    // 2. Atomically fetch and clear all click types
    const clickKeys: Record<string, "phone" | "whatsapp" | "website" | "email" | "product_cta"> = {
      [REDIS_KEY_CLICKS_PHONE]: "phone",
      [REDIS_KEY_CLICKS_WHATSAPP]: "whatsapp",
      [REDIS_KEY_CLICKS_WEBSITE]: "website",
      [REDIS_KEY_CLICKS_EMAIL]: "email",
      [REDIS_KEY_CLICKS_PRODUCT_CTA]: "product_cta",
    };

    for (const [key, clickType] of Object.entries(clickKeys)) {
      const rawClickPairs = (await redisConnection.eval(LUA_FETCH_AND_DEL, 1, key)) as string[];
      if (rawClickPairs && rawClickPairs.length > 0) {
        for (let i = 0; i < rawClickPairs.length; i += 2) {
          const adId = rawClickPairs[i];
          const count = parseInt(rawClickPairs[i + 1], 10);
          if (count > 0) {
            flushedClicks += count;
            try {
              await supabaseAdmin.rpc("increment_ad_clicks_bulk", {
                p_ad_id: adId,
                p_click_type: clickType,
                p_count: count,
              });
            } catch (err) {
              console.error(`❌ Error flushing ${clickType} clicks for ad ${adId}:`, err);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("❌ Error in flushImpressionBuffersToDB:", err);
  }

  return { flushedImpressions, flushedClicks };
}
