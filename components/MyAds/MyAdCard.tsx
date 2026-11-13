"use client";

import React from "react";
import { motion } from "framer-motion";
import { Info, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { Ad, AnalyticsSeriesPoint, parseTargetingList, formatAgeRange } from "./types";
import {
  formatAdTimestamp,
  getCampaignDaysInfo,
  getDeletionCountdown,
  getAdminCustomNote,
  parseApprovedCountdown,
  getTotalAdClicks,
  getCampaignSpend,
  getCampaignEffectiveCpc,
} from "./adUtils";
import MultimediaCarousel from "./MultimediaCarousel";
import AdPerformanceChart from "./AdPerformanceChart";
import CampaignSpecsDrawer from "./CampaignSpecsDrawer";
import MyAdCardFooter from "./MyAdCardFooter";
import AiContentTag from "@/components/ui/AiContentTag";
import styles from "./page.module.css";

export { getCampaignDaysInfo };

interface MyAdCardProps {
  ad: Ad;
  status: "review" | "active";
  reportsCount: number;
  dismissalsCount: number;
  advertiserBlockCount: number;
  analyticsSeries?: AnalyticsSeriesPoint[];
  isSpecsOpen: boolean;
  onToggleSpecs: () => void;
  onOpenBooster: (ad: Ad) => void;
  onOpenRating: (adId: string) => void;
  onTogglePause: (adId: string, currentPausedState: boolean, adminStatement?: string | null) => void;
  onShare: (adId: string) => void;
  onEdit: (adId: string) => void;
  onCancel: (adId: string) => void;
  onExportCsv: (ad: Ad) => void;
  onShowNotice: (title: string, message: string, adId?: string) => void;
  onPublish?: (ad: Ad) => void;
  actionLoading?: boolean;
  ratedAdIds: Set<string>;
  timeNow: number;
}

function MyAdCard({
  ad,
  status,
  reportsCount,
  dismissalsCount,
  advertiserBlockCount,
  analyticsSeries,
  isSpecsOpen,
  onToggleSpecs,
  onOpenBooster,
  onOpenRating,
  onTogglePause,
  onShare,
  onEdit,
  onCancel,
  onExportCsv,
  onShowNotice,
  onPublish,
  actionLoading = false,
  ratedAdIds,
  timeNow,
}: MyAdCardProps) {
  const rawMediaString = ad.ad_media || ad.ad_media_url || (ad as any).image_url || (ad as any).media_url || "";
  const isVideoMedia = ad.ad_media_type === "video" || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(rawMediaString);
  const mediaType = isVideoMedia ? "video" : "image";

  const actionButtons = ["action_phone", "action_whatsapp", "action_email", "action_website"].filter(
    (key) => ad[key as keyof Ad]
  ) as string[];

  const daysInfo = getCampaignDaysInfo(ad, timeNow);

  const { isApproved, isApprovedExpired, approvedCountdownText } = parseApprovedCountdown(ad.admin_statement, timeNow);
  const isRejected = !!(ad.admin_statement && ad.admin_statement.startsWith("REJECTED:"));
  const rejectionFeedback = isRejected ? ad.admin_statement?.replace("REJECTED:", "").trim() : null;
  const adminCustomNote = getAdminCustomNote(ad.admin_statement);

  const seenCount = ad.impression_count ?? 0;
  const phoneClicks = ad.clicks_phone ?? 0;
  const whatsappClicks = ad.clicks_whatsapp ?? 0;
  const websiteClicks = ad.clicks_website ?? 0;
  const emailClicks = ad.clicks_email ?? 0;
  const productCtaClicks = ad.clicks_product_cta ?? 0;
  const iosClicks = ad.clicks_ios ?? 0;
  const androidClicks = ad.clicks_android ?? 0;
  const watchNowClicks = ad.clicks_watch_now ?? 0;
  const readMoreClicks = ad.clicks_read_more ?? 0;
  const clicksCount = getTotalAdClicks(ad);
  const ctr = seenCount > 0 ? ((clicksCount / seenCount) * 100).toFixed(1) : "0.0";
  const totalSpend = getCampaignSpend(ad);
  const effectiveCpc = getCampaignEffectiveCpc(ad);

  const industryList = parseTargetingList(ad.industry);
  const interestList = parseTargetingList(ad.interest);
  const lifestyleList = parseTargetingList(ad.lifestyle);
  const behaviorList = parseTargetingList(ad.behavior);
  const personalityList = parseTargetingList(ad.personality);
  const employmentList = parseTargetingList(ad.employment_status);
  const ageRangeText = formatAgeRange(ad.age_range);
  const geoText =
    [ad.province, ad.state, ad.country].filter(Boolean).join(" • ") || (ad.country ? ad.country : "Global");
  const totalCategoriesCount =
    industryList.length +
    interestList.length +
    lifestyleList.length +
    behaviorList.length +
    personalityList.length +
    employmentList.length;

  const targetImpressions = ad.impressions ?? 1000;
  const remainingImpressions = Math.max(0, targetImpressions - seenCount);
  const deliveryPercent = Math.min(100, Math.round((seenCount / targetImpressions) * 100));

  const isCompleted = !!ad.completed_at || seenCount >= targetImpressions;
  const deletionCountdown = ad.completed_at ? getDeletionCountdown(ad.completed_at, timeNow) : null;
  if (isCompleted && ad.completed_at && deletionCountdown === null) {
    return null;
  }

  const hasValidMedia =
    !!rawMediaString &&
    rawMediaString.trim() !== "" &&
    rawMediaString.toLowerCase() !== "text" &&
    rawMediaString.toLowerCase() !== "null";

  const boostedAmount = Number((ad as any).boosted_amount || 0);
  const boostedAt = (ad as any).boosted_at as string | undefined;
  const isBoosted = Boolean((ad as any).is_boosted || boostedAmount > 0 || boostedAt);
  const isBiddedOrBoosted = isBoosted || !!ad.is_bidded || Number(ad.cost_per_impression || 25) > 25;

  return (
    <motion.div
      key={ad.id}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={styles.card}
    >
      <div className={styles.rowBody}>
        <div className={styles.mediaCol}>
          <MultimediaCarousel rawMedia={rawMediaString} adMediaType={ad.ad_media_type} />
        </div>

        <div className={styles.mainInfoCol}>
          <div className={styles.tagsRow}>
            <span className={`${styles.tagPill} ${styles.tagPillMediaType}`}>
              {hasValidMedia ? (mediaType === "video" ? "Video" : "Image") : "Text"}
            </span>

            {status === "active" ? (
              ad.is_paused ? (
                <span className={`${styles.tagPill} ${styles.tagPillReview}`}>Paused</span>
              ) : isCompleted ? (
                <span className={`${styles.tagPill} ${styles.tagPillReview}`}>Completed</span>
              ) : daysInfo.isRollover ? (
                <span className={`${styles.tagPill} ${styles.tagPillApproved}`}>
                  Rollover (+{daysInfo.rolloverDays}d)
                </span>
              ) : (
                <span className={`${styles.tagPill} ${styles.tagPillActive}`}>
                  <span className={styles.liveDot} /> Live
                </span>
              )
            ) : isApproved ? (
              <span className={`${styles.tagPill} ${styles.tagPillApproved}`}>
                Approved{approvedCountdownText ? ` • ${approvedCountdownText}` : ""}
              </span>
            ) : isRejected ? (
              <span className={`${styles.tagPill} ${styles.tagPillRejected}`}>Rejected</span>
            ) : (
              <span className={`${styles.tagPill} ${styles.tagPillReview}`}>Pending review</span>
            )}

            {isBiddedOrBoosted && (
              <span
                className={`${styles.tagPill} ${styles.tagPillBidded}`}
                title="Boosted Priority Ad: Higher priority guarantees top placement in feeds."
              >
                {isBoosted ? (
                  <>
                    Boosted •{" "}
                    {formatCurrency(boostedAmount > 0 ? boostedAmount : ad.cost_per_impression, ad.country)}
                    {boostedAt ? ` • ${formatAdTimestamp(boostedAt)}` : ""}
                  </>
                ) : (
                  <>
                    {ad.is_bidded ? "Priority" : "Boosted"} •{" "}
                    {formatCurrency(ad.cost_per_impression, ad.country)}/view
                  </>
                )}
              </span>
            )}

            {ad.display_mutual_button && (
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>Mutual+</span>
            )}

            {(ad.is_ai_content || (ad as any).isAiContent) && (
              <AiContentTag />
            )}
          </div>

          <p className={styles.adDescription}>{ad.ad_content}</p>

          {isRejected && rejectionFeedback && (
            <div className={styles.statusReasonBanner}>
              <AlertTriangle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong style={{ color: "var(--foreground)" }}>Reason: </strong>
                <span style={{ color: "var(--text-muted)" }}>{rejectionFeedback}</span>
              </div>
            </div>
          )}

          {adminCustomNote && (
            <div className={styles.statusReasonBanner}>
              <Info size={15} color="var(--primary)" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong style={{ color: "var(--foreground)" }}>Admin Note: </strong>
                <span style={{ color: "var(--text-muted)" }}>{adminCustomNote}</span>
              </div>
            </div>
          )}

          <div className={styles.targetTagsRow}>
            <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>{geoText}</span>
            <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
              {ad.gender
                ? ad.gender.toLowerCase() === "both"
                  ? "All Genders"
                  : ad.gender.charAt(0).toUpperCase() + ad.gender.slice(1)
                : "All Genders"}{" "}
              • {ageRangeText}
            </span>
            <button
              type="button"
              onClick={onToggleSpecs}
              className={`${styles.tagPill} ${styles.tagPillInteractive}`}
              title="Click to inspect full audience targeting matrix"
            >
              {totalCategoriesCount > 0 ? `${totalCategoriesCount} Segments` : "Broad Delivery"}
            </button>
            <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
              {ad.user_frequency_cap || 1}× / Viewer / Day
            </span>
            <span className={styles.tagPill}>
              {status === "active" && !isCompleted
                ? daysInfo.isRollover
                  ? `Rollover (+${daysInfo.rolloverDays}d)`
                  : `${daysInfo.remaining} ${daysInfo.remaining === 1 ? "day" : "days"} remaining`
                : `${daysInfo.scheduled} ${daysInfo.scheduled === 1 ? "day" : "days"}`}
            </span>
          </div>

          <div className={styles.deliveryProgressWrapper}>
            <div className={styles.deliveryProgressRow}>
              <span className={styles.deliveryLabel}>
                Delivery Progress • <strong>{deliveryPercent}%</strong>
              </span>
              <span className={styles.deliveryCountText}>
                {seenCount.toLocaleString()} / {targetImpressions.toLocaleString()} views
                {remainingImpressions > 0 ? ` (${remainingImpressions.toLocaleString()} left)` : ""}
              </span>
            </div>
            <div className={styles.deliveryProgressTrack}>
              <motion.div
                className={styles.deliveryProgressFill}
                initial={{ width: 0 }}
                animate={{ width: `${deliveryPercent}%` }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>

          <div className={styles.ctaClickRow}>
            <span className={styles.ctaClickItem}>
              Phone: <strong>{phoneClicks}</strong>
            </span>
            <span className={styles.ctaClickItem}>
              WhatsApp: <strong>{whatsappClicks}</strong>
            </span>
            <span className={styles.ctaClickItem}>
              Website: <strong>{websiteClicks}</strong>
            </span>
            <span className={styles.ctaClickItem}>
              Email: <strong>{emailClicks}</strong>
            </span>
            {productCtaClicks > 0 && (
              <span className={styles.ctaClickItem}>
                Product: <strong>{productCtaClicks}</strong>
              </span>
            )}
            {iosClicks > 0 && (
              <span className={styles.ctaClickItem}>
                iOS: <strong>{iosClicks}</strong>
              </span>
            )}
            {androidClicks > 0 && (
              <span className={styles.ctaClickItem}>
                Android: <strong>{androidClicks}</strong>
              </span>
            )}
            {watchNowClicks > 0 && (
              <span className={styles.ctaClickItem}>
                Watch: <strong>{watchNowClicks}</strong>
              </span>
            )}
            {readMoreClicks > 0 && (
              <span className={styles.ctaClickItem}>
                Read More: <strong>{readMoreClicks}</strong>
              </span>
            )}
          </div>
        </div>

        <div className={styles.metricsCol}>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Views Delivered</span>
            <span className={styles.metricVal}>{seenCount.toLocaleString()}</span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Clicks / CTR</span>
            <span className={styles.metricVal}>
              {clicksCount} <span className={styles.metricSubVal}>({ctr}%)</span>
            </span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Mutual Adds</span>
            <span className={styles.metricVal}>{(ad.mutual_adds_count ?? 0).toLocaleString()}</span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Total Spend</span>
            <span className={styles.metricVal}>
              {ad.is_admin_post
                ? `${formatCurrency(0, ad.country)} (Platform)`
                : formatCurrency(totalSpend, ad.country)}
            </span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Eff. CPC</span>
            <span className={styles.metricVal}>
              {effectiveCpc !== null ? formatCurrency(effectiveCpc, ad.country) : "—"}
            </span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Safety Status</span>
            {reportsCount === 0 && advertiserBlockCount === 0 ? (
              <span className={`${styles.metricVal} ${styles.metricValGreen}`}>Clean</span>
            ) : (
              <span className={`${styles.metricVal} ${styles.metricValRed}`}>{reportsCount} Flags</span>
            )}
          </div>
        </div>
      </div>

      {(status === "active" || (ad.impression_count || 0) > 0) && (
        <div className={styles.perAdChartSection}>
          <AdPerformanceChart ad={ad} series={analyticsSeries} timeNow={timeNow} />
        </div>
      )}

      <MyAdCardFooter
        ad={ad}
        status={status}
        isCompleted={isCompleted}
        isApproved={isApproved}
        isApprovedExpired={isApprovedExpired}
        isRejected={isRejected}
        deletionCountdown={deletionCountdown}
        actionButtons={actionButtons}
        reportsCount={reportsCount}
        isSpecsOpen={isSpecsOpen}
        actionLoading={actionLoading}
        ratedAdIds={ratedAdIds}
        onToggleSpecs={onToggleSpecs}
        onOpenBooster={onOpenBooster}
        onOpenRating={onOpenRating}
        onTogglePause={onTogglePause}
        onShare={onShare}
        onEdit={onEdit}
        onCancel={onCancel}
        onExportCsv={onExportCsv}
        onShowNotice={onShowNotice}
        onPublish={onPublish}
      />

      <CampaignSpecsDrawer
        ad={ad}
        isOpen={isSpecsOpen}
        reportsCount={reportsCount}
        dismissalsCount={dismissalsCount}
        advertiserBlockCount={advertiserBlockCount}
        daysInfo={daysInfo}
      />
    </motion.div>
  );
}

export default React.memo(MyAdCard);
