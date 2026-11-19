export interface SyncBiddedAdParams {
  adId: string;
  userEmail: string;
  adType?: string | null;
  industry?: unknown;
  costPerImpression?: number | string | null;
  bidPrice?: number | string | null;
  isBidded?: boolean | null;
  isAdminPost?: boolean | null;
}

export interface SyncBiddedAdOptions {
  redis?: any;
  isRedisReady?: () => boolean;
}

/**
 * Resolves the authoritative priority bid rate and keeps `bidded_ads` + Redis `bids:zset:*`
 * in sync whenever a bidded campaign is activated (`publish_ad` / `ad_payment`) or boosted.
 */
export async function syncBiddedAdActivation(
  supabaseAdmin: any,
  params: SyncBiddedAdParams,
  options: SyncBiddedAdOptions = {}
): Promise<{ synced: boolean; industry: string; bidPrice: number }> {
  const bidRate = Number(params.bidPrice || params.costPerImpression || 0);
  const isBidded =
    !params.isAdminPost &&
    Boolean(params.isBidded) &&
    Number.isFinite(bidRate) &&
    bidRate > 0;

  const firstIndustry = Array.isArray(params.industry)
    ? params.industry[0]
    : params.industry;
  const industry =
    String(params.adType || firstIndustry || "business")
      .trim()
      .toLowerCase() || "business";

  if (!isBidded || !params.adId) {
    return { synced: false, industry, bidPrice: 0 };
  }

  const emailLower = String(params.userEmail || "").toLowerCase().trim();

  try {
    await supabaseAdmin.from("bidded_ads").delete().eq("ad_id", params.adId);
    const { error: insertErr } = await supabaseAdmin.from("bidded_ads").insert({
      ad_id: params.adId,
      user_email: emailLower,
      industry,
      bid_price: bidRate,
      is_active: true,
    });
    if (insertErr) {
      console.warn("⚠️ bidded_ads sync warning:", insertErr);
    }
  } catch (dbErr) {
    console.warn("⚠️ bidded_ads sync error:", dbErr);
  }

  const redis = options.redis;
  const ready = options.isRedisReady ? options.isRedisReady() : Boolean(redis);
  if (redis && ready) {
    try {
      await Promise.allSettled([
        typeof redis.zadd === "function"
          ? redis.zadd(`bids:zset:${industry}`, bidRate, String(params.adId))
          : Promise.resolve(),
        typeof redis.del === "function"
          ? redis.del("attention:market_rates")
          : Promise.resolve(),
      ]);
    } catch (redisErr) {
      console.warn("⚠️ Redis ZSET sync warning:", redisErr);
    }
  }

  return { synced: true, industry, bidPrice: bidRate };
}
