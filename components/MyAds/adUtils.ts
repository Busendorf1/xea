import { Ad, AnalyticsSeriesPoint, AnalyticsSummary } from "./types";

export function getActionHref(type: string, value: string): string {
  switch (type) {
    case "action_phone":
      return `tel:${value}`;
    case "action_whatsapp":
      return `https://wa.me/${value}`;
    case "action_email":
      return `mailto:${value}`;
    case "action_website":
      return value.startsWith("http") ? value : `https://${value}`;
    default:
      return "#";
  }
}

export function formatAdTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return "Unknown time";
  const created = new Date(timestamp);
  if (isNaN(created.getTime())) return "Invalid date";

  return created.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getCampaignDaysInfo(ad: Ad, timeNow: number) {
  const scheduled = Math.max(1, Number(ad.campaign_days) || 1);
  if (!ad.created_at) {
    return { scheduled, remaining: scheduled, isRollover: false, rolloverDays: 0 };
  }
  const createdMs = new Date(ad.created_at).getTime();
  const scheduledStartMs = ad.scheduled_start_at ? new Date(ad.scheduled_start_at).getTime() : NaN;
  const startMs = !isNaN(scheduledStartMs) && scheduledStartMs > 0 ? Math.max(createdMs, scheduledStartMs) : createdMs;
  if (isNaN(startMs)) {
    return { scheduled, remaining: scheduled, isRollover: false, rolloverDays: 0 };
  }

  const isCompleted = !!ad.completed_at || (ad.impression_count !== null && ad.impression_count >= ad.impressions);
  if (isCompleted) {
    return { scheduled, remaining: 0, isRollover: false, rolloverDays: 0 };
  }

  const endMs = startMs + scheduled * 86_400_000;
  if (timeNow < startMs) {
    return { scheduled, remaining: scheduled, isRollover: false, rolloverDays: 0 };
  }

  if (timeNow >= endMs) {
    return {
      scheduled,
      remaining: 0,
      isRollover: true,
      rolloverDays: Math.max(1, Math.ceil((timeNow - endMs) / 86_400_000)),
    };
  }

  return {
    scheduled,
    remaining: Math.max(1, Math.ceil((endMs - timeNow) / 86_400_000)),
    isRollover: false,
    rolloverDays: 0,
  };
}

export function getDeletionCountdown(completedAt: string, timeNow: number): string | null {
  const completedTime = new Date(completedAt).getTime();
  const expiryTime = completedTime + 48 * 60 * 60 * 1000;
  const timeLeft = expiryTime - timeNow;

  if (timeLeft <= 0) return null;

  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getAdminCustomNote(stmt: string | null | undefined): string | null {
  if (!stmt) return null;
  const trimmed = stmt.trim();
  if (
    trimmed.startsWith("APPROVED:") ||
    trimmed.startsWith("REJECTED:") ||
    trimmed.startsWith("STATUS:") ||
    trimmed.startsWith("Status: Pending review") ||
    trimmed === "pending_review"
  ) {
    return null;
  }
  return trimmed;
}

export function getBoostUnavailableReason(ad: Ad, reportsCount: number): string | null {
  if (
    ad.payment_status === "unpaid" ||
    ad.status === "pending_review" ||
    ad.status === "approved_pending_publish"
  ) {
    return "Boosting is only available after your campaign has been approved, paid for, and published live to the feed.";
  }
  if (reportsCount > 0) {
    return "This campaign has been reported by viewers and is currently under content safety review. Please wait for the moderation review to complete.";
  }
  const isPausedByAdmin = Boolean(
    ad.admin_statement &&
    typeof ad.admin_statement === "string" &&
    ad.admin_statement.trim() !== "" &&
    !ad.admin_statement.startsWith("APPROVED:") &&
    !ad.admin_statement.toLowerCase().startsWith("status:") &&
    !ad.admin_statement.startsWith("REJECTED:")
  );
  if (isPausedByAdmin) {
    return `This campaign was paused by an administrator. Reason: "${getAdminCustomNote(ad.admin_statement) || ad.admin_statement}". Please resolve the notice or wait for admin review.`;
  }
  if (ad.is_paused) {
    return "This campaign is currently paused. Please resume the campaign first to boost it.";
  }
  return null;
}

export function parseApprovedCountdown(
  adminStatement: string | null | undefined,
  timeNow: number
): { isApproved: boolean; isApprovedExpired: boolean; approvedCountdownText: string | null } {
  const isApproved = !!(adminStatement && adminStatement.startsWith("APPROVED:"));
  let approvedCountdownText: string | null = null;
  let isApprovedExpired = false;

  if (isApproved && adminStatement) {
    const approvedTimestamp = adminStatement.replace("APPROVED:", "").trim();
    const approvedDate = new Date(approvedTimestamp);
    if (!isNaN(approvedDate.getTime())) {
      const expiresAt = approvedDate.getTime() + 72 * 60 * 60 * 1000;
      const diffMs = expiresAt - timeNow;
      if (diffMs <= 0) {
        isApprovedExpired = true;
        approvedCountdownText = "Expired";
      } else {
        const d = Math.floor(diffMs / (24 * 60 * 60 * 1000));
        const h = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const m = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
        approvedCountdownText = `${d > 0 ? `${d}d ` : ""}${h}h ${m}m remaining`;
      }
    }
  }

  return { isApproved, isApprovedExpired, approvedCountdownText };
}

export function getTotalAdClicks(ad: Ad): number {
  return (
    (ad.clicks_phone ?? 0) +
    (ad.clicks_whatsapp ?? 0) +
    (ad.clicks_website ?? 0) +
    (ad.clicks_email ?? 0) +
    (ad.clicks_product_cta ?? 0) +
    (ad.clicks_ios ?? 0) +
    (ad.clicks_android ?? 0) +
    (ad.clicks_watch_now ?? 0) +
    (ad.clicks_read_more ?? 0)
  );
}

export function getCampaignSpend(ad: Ad): number {
  if (ad.is_admin_post) return 0;
  if (typeof ad.total_spend === "number" && Number.isFinite(ad.total_spend)) {
    return Math.max(0, ad.total_spend);
  }
  const baseCost = Number(ad.total_cost || 0);
  const boosted = Number(ad.boosted_amount || 0);
  return Math.max(0, (Number.isFinite(baseCost) ? baseCost : 0) + (Number.isFinite(boosted) ? boosted : 0));
}

export function getCampaignEffectiveCpc(ad: Ad): number | null {
  if (ad.is_admin_post) return null;
  if (typeof ad.effective_cpc === "number" && Number.isFinite(ad.effective_cpc)) {
    return Math.max(0, ad.effective_cpc);
  }
  const clicks = getTotalAdClicks(ad);
  if (clicks <= 0) return null;
  return getCampaignSpend(ad) / clicks;
}

export function computeFallbackAnalyticsSummary(ads: Ad[]): AnalyticsSummary {
  const totalSpend = ads.reduce((sum, ad) => sum + getCampaignSpend(ad), 0);
  const totalViews = ads.reduce((sum, ad) => sum + Math.max(0, Number(ad.impression_count || 0)), 0);
  const totalClicks = ads.reduce((sum, ad) => sum + getTotalAdClicks(ad), 0);
  const avgCtr = totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(2)) : 0;
  const effectiveCpc = totalClicks > 0 ? Number((totalSpend / totalClicks).toFixed(2)) : 0;
  const effectiveCpv = totalViews > 0 ? Number((totalSpend / totalViews).toFixed(2)) : 0;

  return {
    totalSpend: Number(totalSpend.toFixed(2)),
    totalViews,
    totalClicks,
    avgCtr,
    effectiveCpc,
    effectiveCpv,
  };
}

/**
 * Builds a deterministic 14-day UTC time-series fallback directly from active ads
 * when `analyticsSeries` is omitted (e.g. cold client cache or legacy response).
 */
export function buildFallbackAnalyticsSeries(ads: Ad[], nowMs: number = Date.now()): AnalyticsSeriesPoint[] {
  const DAY_MS = 86_400_000;
  const todayUtcStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const dates: string[] = [];
  const viewBuckets = new Map<string, number>();
  const clickBuckets = new Map<string, number>();

  for (let offset = 13; offset >= 0; offset--) {
    const key = new Date(todayUtcStart - offset * DAY_MS).toISOString().slice(0, 10);
    dates.push(key);
    viewBuckets.set(key, 0);
    clickBuckets.set(key, 0);
  }

  const distributeMetric = (total: number, activeStartIdx: number, buckets: Map<string, number>) => {
    if (total <= 0) return;
    const span = dates.length - activeStartIdx;
    const base = Math.floor(total / span);
    let remainder = total % span;
    for (let i = dates.length - 1; i >= activeStartIdx; i--) {
      const bonus = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder--;
      const key = dates[i];
      buckets.set(key, (buckets.get(key) || 0) + base + bonus);
    }
  };

  for (const ad of ads) {
    const views = Math.max(0, Number(ad.impression_count || 0));
    const clicks = getTotalAdClicks(ad);
    if (views === 0 && clicks === 0) continue;

    const createdKey = ad.created_at ? new Date(ad.created_at).toISOString().slice(0, 10) : dates[dates.length - 1];
    const startIdx = Math.max(0, dates.findIndex((d) => d >= createdKey));
    const effectiveStartIdx = startIdx === -1 ? dates.length - 1 : startIdx;

    distributeMetric(views, effectiveStartIdx, viewBuckets);
    distributeMetric(clicks, effectiveStartIdx, clickBuckets);
  }

  return dates.map((date) => {
    const views = viewBuckets.get(date) || 0;
    const clicks = clickBuckets.get(date) || 0;
    const ctr = views > 0 ? Number(((clicks / views) * 100).toFixed(2)) : 0;
    return { date, views, clicks, ctr };
  });
}

export function exportCampaignToCsv(ad: Ad, timeNow: number) {
  const seenCount = ad.impression_count ?? 0;
  const targetImpressions = ad.impressions ?? 1000;
  const remaining = Math.max(0, targetImpressions - seenCount);
  const phoneClicks = ad.clicks_phone ?? 0;
  const whatsappClicks = ad.clicks_whatsapp ?? 0;
  const websiteClicks = ad.clicks_website ?? 0;
  const emailClicks = ad.clicks_email ?? 0;
  const productClicks = ad.clicks_product_cta ?? 0;
  const totalClicks = getTotalAdClicks(ad);
  const ctr = seenCount > 0 ? ((totalClicks / seenCount) * 100).toFixed(2) : "0.00";
  const totalSpend = getCampaignSpend(ad);
  const effectiveCpc = getCampaignEffectiveCpc(ad);
  const daysInfo = getCampaignDaysInfo(ad, timeNow);

  const headers = [
    "Campaign ID",
    "Created At",
    "Category",
    "Status",
    "Is Rollover",
    "Rollover Days",
    "Target Impressions",
    "Delivered Impressions",
    "Remaining Impressions",
    "Total Clicks",
    "CTR (%)",
    "Total Spend",
    "Effective CPC",
    "Phone Clicks",
    "WhatsApp Clicks",
    "Website Clicks",
    "Email Clicks",
    "Product CTA Clicks",
    "Cost Per View",
    "Country",
    "State",
    "Gender Target",
    "Content Preview",
  ];

  const values = [
    `"${ad.id}"`,
    `"${ad.created_at || ""}"`,
    `"${ad.ad_type || "General"}"`,
    `"${ad.completed_at ? "Completed" : ad.is_paused ? "Paused" : "Active"}"`,
    `"${daysInfo.isRollover ? "Yes" : "No"}"`,
    daysInfo.rolloverDays,
    targetImpressions,
    seenCount,
    remaining,
    totalClicks,
    `${ctr}%`,
    ad.is_admin_post ? "0.00" : totalSpend.toFixed(2),
    `"${effectiveCpc !== null ? effectiveCpc.toFixed(2) : "—"}"`,
    phoneClicks,
    whatsappClicks,
    websiteClicks,
    emailClicks,
    productClicks,
    ad.cost_per_impression || 25,
    `"${ad.country || "All"}"`,
    `"${ad.state || "All"}"`,
    `"${ad.gender || "All"}"`,
    `"${(ad.ad_content || "").replace(/"/g, '""')}"`,
  ];

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), values.join(",")].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `paayh_campaign_report_${ad.id.slice(0, 8)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
