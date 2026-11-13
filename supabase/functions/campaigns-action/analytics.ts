export interface EdgeAnalyticsPoint {
  date: string;
  views: number;
  clicks: number;
  ctr: number;
}

export interface EdgeAnalyticsSummary {
  totalSpend: number;
  totalViews: number;
  totalClicks: number;
  avgCtr: number;
  effectiveCpc: number;
  effectiveCpv: number;
}

const CLICK_COLUMNS = [
  "clicks_phone",
  "clicks_whatsapp",
  "clicks_website",
  "clicks_email",
  "clicks_product_cta",
  "clicks_ios",
  "clicks_android",
  "clicks_watch_now",
  "clicks_read_more",
] as const;

export function getTotalAdClicksEdge(item: Record<string, unknown> | null | undefined): number {
  if (!item) return 0;
  let total = 0;
  for (const col of CLICK_COLUMNS) {
    total += Math.max(0, Number(item[col] || 0));
  }
  return total;
}

export function computeAdSpendMetricsEdge(item: Record<string, unknown> | null | undefined): {
  total_spend: number;
  effective_cpc: number | null;
  total_clicks: number;
} {
  if (!item) {
    return { total_spend: 0, effective_cpc: null, total_clicks: 0 };
  }
  const totalClicks = getTotalAdClicksEdge(item);
  if (item.is_admin_post) {
    return { total_spend: 0, effective_cpc: null, total_clicks: totalClicks };
  }
  const baseCost = Math.max(0, Number(item.total_cost || 0));
  const boostedCost = Math.max(0, Number(item.boosted_amount || 0));
  const totalSpend = Number((baseCost + boostedCost).toFixed(2));
  const effectiveCpc = totalClicks > 0 ? Number((totalSpend / totalClicks).toFixed(2)) : null;

  return {
    total_spend: totalSpend,
    effective_cpc: effectiveCpc,
    total_clicks: totalClicks,
  };
}

function createEmptyBucketMap(dates: string[]): Map<string, { views: number; clicks: number }> {
  const map = new Map<string, { views: number; clicks: number }>();
  for (const date of dates) {
    map.set(date, { views: 0, clicks: 0 });
  }
  return map;
}

function allocateClicksToBuckets(
  dates: string[],
  bucketMap: Map<string, { views: number; clicks: number }>,
  totalClicks: number,
  todayUtc: string,
): void {
  if (totalClicks <= 0) return;
  const todayBucket = bucketMap.get(todayUtc)!;
  const bucketedViewsTotal = dates.reduce((sum, d) => sum + (bucketMap.get(d)?.views || 0), 0);

  if (bucketedViewsTotal > 0) {
    let assigned = 0;
    for (const date of dates) {
      const b = bucketMap.get(date)!;
      const share = Math.floor((totalClicks * b.views) / bucketedViewsTotal);
      b.clicks += share;
      assigned += share;
    }
    const remainder = totalClicks - assigned;
    if (remainder > 0) {
      todayBucket.clicks += remainder;
    }
  } else {
    todayBucket.clicks += totalClicks;
  }
}

function bucketsToSeries(
  dates: string[],
  bucketMap: Map<string, { views: number; clicks: number }>,
): EdgeAnalyticsPoint[] {
  return dates.map((date) => {
    const b = bucketMap.get(date)!;
    const ctr = b.views > 0 ? Number(((b.clicks / b.views) * 100).toFixed(2)) : 0;
    return { date, views: b.views, clicks: b.clicks, ctr };
  });
}

export async function buildEdgeCampaignAnalyticsPayload(params: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  adIds: string[];
  adsQueue: Array<Record<string, unknown>>;
  adsActive: Array<Record<string, unknown>>;
}): Promise<{
  analyticsSeries: EdgeAnalyticsPoint[];
  analyticsSummary: EdgeAnalyticsSummary;
  adAnalyticsMap: Record<string, EdgeAnalyticsPoint[]>;
}> {
  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  const dates: string[] = [];
  for (let offset = 13; offset >= 0; offset--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    dates.push(d.toISOString().slice(0, 10));
  }
  const windowStartIso = `${dates[0]}T00:00:00.000Z`;

  const bucketMap = createEmptyBucketMap(dates);
  const perAdBucketMap = new Map<string, Map<string, { views: number; clicks: number }>>();
  const perAdHasDbRows = new Set<string>();

  let hasDbImpressionRows = false;
  if (params.adIds.length > 0 && params.supabase?.from) {
    try {
      const { data: impRows } = await params.supabase
        .from("ad_impressions")
        .select("ad_id, view_count, last_viewed_at, created_at")
        .in("ad_id", params.adIds)
        .gte("last_viewed_at", windowStartIso)
        .limit(5000);

      if (Array.isArray(impRows) && impRows.length > 0) {
        for (const row of impRows) {
          const ts = row?.last_viewed_at || row?.created_at;
          if (!ts) continue;
          const dateKey = String(ts).slice(0, 10);
          const bucket = bucketMap.get(dateKey);
          if (!bucket) continue;
          const views = Math.max(0, Number(row.view_count ?? 1));
          if (views > 0) {
            bucket.views += views;
            hasDbImpressionRows = true;

            const adId = row?.ad_id ? String(row.ad_id) : "";
            if (adId) {
              let adMap = perAdBucketMap.get(adId);
              if (!adMap) {
                adMap = createEmptyBucketMap(dates);
                perAdBucketMap.set(adId, adMap);
              }
              const adBucket = adMap.get(dateKey);
              if (adBucket) {
                adBucket.views += views;
                perAdHasDbRows.add(adId);
              }
            }
          }
        }
      }
    } catch {
      // Fall back cleanly to aggregate counters
    }
  }

  const allCampaigns = [...params.adsActive, ...params.adsQueue];
  let totalSpend = 0;
  let totalViews = 0;
  let totalClicks = 0;
  let todayActiveDailyViews = 0;
  const adAnalyticsMap: Record<string, EdgeAnalyticsPoint[]> = {};

  for (const ad of allCampaigns) {
    if (!ad) continue;
    const adId = ad.id ? String(ad.id) : "";
    const { total_spend, total_clicks } = computeAdSpendMetricsEdge(ad);
    const adViews = Math.max(0, Number(ad.impression_count || 0));
    totalSpend += total_spend;
    totalViews += adViews;
    totalClicks += total_clicks;

    const resetDate = ad.last_reset_date ? String(ad.last_reset_date).slice(0, 10) : todayUtc;
    const adTodayDailyViews = resetDate === todayUtc ? Math.max(0, Number(ad.daily_impression_count || 0)) : 0;
    todayActiveDailyViews += adTodayDailyViews;

    if (adId) {
      const adBuckets = perAdBucketMap.get(adId) || createEmptyBucketMap(dates);
      const adTodayBucket = adBuckets.get(todayUtc)!;
      if (!perAdHasDbRows.has(adId) && adViews > 0) {
        adTodayBucket.views = Math.max(adTodayBucket.views, adTodayDailyViews, adViews);
      } else {
        adTodayBucket.views = Math.max(adTodayBucket.views, adTodayDailyViews);
      }
      allocateClicksToBuckets(dates, adBuckets, total_clicks, todayUtc);
      adAnalyticsMap[adId] = bucketsToSeries(dates, adBuckets);
    }
  }

  const todayBucket = bucketMap.get(todayUtc)!;
  if (!hasDbImpressionRows && totalViews > 0) {
    todayBucket.views = Math.max(todayBucket.views, todayActiveDailyViews, totalViews);
  } else {
    todayBucket.views = Math.max(todayBucket.views, todayActiveDailyViews);
  }

  allocateClicksToBuckets(dates, bucketMap, totalClicks, todayUtc);

  const analyticsSeries = bucketsToSeries(dates, bucketMap);
  const roundedSpend = Number(totalSpend.toFixed(2));
  const analyticsSummary: EdgeAnalyticsSummary = {
    totalSpend: roundedSpend,
    totalViews,
    totalClicks,
    avgCtr: totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(2)) : 0,
    effectiveCpc: totalClicks > 0 ? Number((roundedSpend / totalClicks).toFixed(2)) : 0,
    effectiveCpv: totalViews > 0 ? Number((roundedSpend / totalViews).toFixed(2)) : 0,
  };

  return { analyticsSeries, analyticsSummary, adAnalyticsMap };
}
