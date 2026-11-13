import { CanonicalClickType, CLICK_TYPE_TO_COLUMN } from "../impressionBuffer";

export interface CampaignAnalyticsPoint {
  date: string;
  views: number;
  clicks: number;
  ctr: number;
}

export interface CampaignAnalyticsSummary {
  totalSpend: number;
  totalViews: number;
  totalClicks: number;
  avgCtr: number;
  effectiveCpc: number;
  effectiveCpv: number;
}

const CLICK_COLUMNS = Object.values(CLICK_TYPE_TO_COLUMN);

/**
 * Sums all canonical CTA click counters on an ad record.
 */
export function getTotalAdClicks(item: Record<string, any> | null | undefined): number {
  if (!item) return 0;
  let total = 0;
  for (const col of CLICK_COLUMNS) {
    total += Math.max(0, Number(item[col] || 0));
  }
  return total;
}

/**
 * Computes per-ad total spend (initial cost + boost spend, 0 for admin platform posts)
 * and effective CPC (`total_spend / totalClicks`, or `null` when 0 clicks).
 */
export function computeAdSpendMetrics(item: Record<string, any> | null | undefined): {
  total_spend: number;
  effective_cpc: number | null;
  total_clicks: number;
} {
  if (!item) {
    return { total_spend: 0, effective_cpc: null, total_clicks: 0 };
  }
  const totalClicks = getTotalAdClicks(item);
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
  pendingClicksToday: number,
  todayUtc: string
): void {
  if (totalClicks <= 0) return;
  const todayBucket = bucketMap.get(todayUtc)!;
  const bucketedViewsTotal = dates.reduce((sum, d) => sum + (bucketMap.get(d)?.views || 0), 0);
  const liveTodayClicks = Math.min(totalClicks, pendingClicksToday);
  const distributableClicks = Math.max(0, totalClicks - liveTodayClicks);

  if (bucketedViewsTotal > 0 && distributableClicks > 0) {
    let assigned = 0;
    for (const date of dates) {
      const b = bucketMap.get(date)!;
      const share = Math.floor((distributableClicks * b.views) / bucketedViewsTotal);
      b.clicks += share;
      assigned += share;
    }
    const remainder = distributableClicks - assigned;
    if (remainder > 0) {
      todayBucket.clicks += remainder;
    }
  } else {
    todayBucket.clicks += distributableClicks;
  }
  todayBucket.clicks += liveTodayClicks;
}

function bucketsToSeries(
  dates: string[],
  bucketMap: Map<string, { views: number; clicks: number }>
): CampaignAnalyticsPoint[] {
  return dates.map((date) => {
    const b = bucketMap.get(date)!;
    const ctr = b.views > 0 ? Number(((b.clicks / b.views) * 100).toFixed(2)) : 0;
    return {
      date,
      views: b.views,
      clicks: b.clicks,
      ctr,
    };
  });
}

/**
 * Builds 14-day UTC time-series analytics (`analyticsSeries`, per-ad `adAnalyticsMap`) and
 * summary KPIs (`analyticsSummary`) for `/api/campaigns`, combining bounded `ad_impressions`
 * rows with live campaign/Redis deltas.
 */
export async function buildCampaignAnalyticsPayload(params: {
  supabase: any;
  adIds: string[];
  adsQueue: Array<Record<string, any>>;
  adsActive: Array<Record<string, any>>;
  pendingImpressionDeltas?: Record<string, number>;
  pendingClickDeltas?: Record<string, Partial<Record<CanonicalClickType, number>>>;
}): Promise<{
  analyticsSeries: CampaignAnalyticsPoint[];
  analyticsSummary: CampaignAnalyticsSummary;
  adAnalyticsMap: Record<string, CampaignAnalyticsPoint[]>;
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
      // Gracefully degrade to campaign counters without failing /api/campaigns
    }
  }

  const allCampaigns = [...params.adsActive, ...params.adsQueue];
  let totalSpend = 0;
  let totalViews = 0;
  let totalClicks = 0;
  let todayActiveDailyViews = 0;
  const adAnalyticsMap: Record<string, CampaignAnalyticsPoint[]> = {};

  for (const ad of allCampaigns) {
    if (!ad) continue;
    const adId = ad.id ? String(ad.id) : "";
    const { total_spend, total_clicks } = computeAdSpendMetrics(ad);
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
      const adPendingViews = Math.max(0, Number(params.pendingImpressionDeltas?.[adId] || 0));
      let adPendingClicks = 0;
      const adPendingClickObj = params.pendingClickDeltas?.[adId];
      if (adPendingClickObj) {
        for (const c of Object.values(adPendingClickObj)) {
          adPendingClicks += Math.max(0, Number(c || 0));
        }
      }

      if (!perAdHasDbRows.has(adId) && adViews > 0) {
        adTodayBucket.views = Math.max(adTodayBucket.views, adTodayDailyViews + adPendingViews, adViews);
      } else {
        adTodayBucket.views = Math.max(adTodayBucket.views, adTodayDailyViews, adPendingViews);
      }

      allocateClicksToBuckets(dates, adBuckets, total_clicks, adPendingClicks, todayUtc);
      adAnalyticsMap[adId] = bucketsToSeries(dates, adBuckets);
    }
  }

  let pendingViewsToday = 0;
  if (params.pendingImpressionDeltas) {
    for (const v of Object.values(params.pendingImpressionDeltas)) {
      pendingViewsToday += Math.max(0, Number(v || 0));
    }
  }

  let pendingClicksToday = 0;
  if (params.pendingClickDeltas) {
    for (const perType of Object.values(params.pendingClickDeltas)) {
      if (!perType) continue;
      for (const c of Object.values(perType)) {
        pendingClicksToday += Math.max(0, Number(c || 0));
      }
    }
  }

  const todayBucket = bucketMap.get(todayUtc)!;
  if (!hasDbImpressionRows && totalViews > 0) {
    todayBucket.views = Math.max(todayBucket.views, todayActiveDailyViews + pendingViewsToday, totalViews);
  } else {
    todayBucket.views = Math.max(todayBucket.views, todayActiveDailyViews, pendingViewsToday);
  }

  // Attribute campaign clicks across active 14-day view buckets while guaranteeing today reflects live/pending clicks
  allocateClicksToBuckets(dates, bucketMap, totalClicks, pendingClicksToday, todayUtc);

  const analyticsSeries = bucketsToSeries(dates, bucketMap);

  const roundedSpend = Number(totalSpend.toFixed(2));
  const analyticsSummary: CampaignAnalyticsSummary = {
    totalSpend: roundedSpend,
    totalViews,
    totalClicks,
    avgCtr: totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(2)) : 0,
    effectiveCpc: totalClicks > 0 ? Number((roundedSpend / totalClicks).toFixed(2)) : 0,
    effectiveCpv: totalViews > 0 ? Number((roundedSpend / totalViews).toFixed(2)) : 0,
  };

  return { analyticsSeries, analyticsSummary, adAnalyticsMap };
}
