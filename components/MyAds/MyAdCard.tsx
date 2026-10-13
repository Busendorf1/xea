"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Video,
  Image as ImageIcon,
  Megaphone,
  Clock,
  Zap,
  Info,
  Globe,
  Users,
  Target,
  Tag,
  SlidersHorizontal,
  CheckCircle2,
  Phone,
  MessageSquare,
  Mail,
  ShoppingCart,
  AlertTriangle,
  Star,
  ChevronUp,
  FileText,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { Ad, parseTargetingList, formatAgeRange } from "./types";
import MultimediaCarousel from "./MultimediaCarousel";
import CampaignSpecsDrawer from "./CampaignSpecsDrawer";
import styles from "./page.module.css";

interface MyAdCardProps {
  ad: Ad;
  status: "review" | "active";
  reportsCount: number;
  dismissalsCount: number;
  advertiserBlockCount: number;
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
  ratedAdIds: Set<string>;
  timeNow: number;
}

function getHref(type: string, value: string): string {
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

function getIcon(type: string): React.ReactNode {
  switch (type) {
    case "action_phone":
      return <Phone size={14} />;
    case "action_whatsapp":
      return <MessageSquare size={14} />;
    case "action_email":
      return <Mail size={14} />;
    case "action_website":
      return <Globe size={14} />;
    default:
      return <Globe size={14} />;
  }
}

function formatTimestamp(timestamp: string | null | undefined): string {
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
  if (!ad.created_at) {
    return { scheduled: ad.campaign_days || 1, remaining: ad.campaign_days || 1, isRollover: false, rolloverDays: 0 };
  }
  const createdDate = new Date(ad.created_at);
  const createdDateOnly = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());

  const today = new Date(timeNow);
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const diffTime = todayDateOnly.getTime() - createdDateOnly.getTime();
  const daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  const scheduled = ad.campaign_days || 1;
  const isCompleted = !!ad.completed_at || (ad.impression_count !== null && ad.impression_count >= ad.impressions);

  if (isCompleted) {
    return { scheduled, remaining: 0, isRollover: false, rolloverDays: 0 };
  }

  if (daysPassed > scheduled) {
    return {
      scheduled,
      remaining: 0,
      isRollover: true,
      rolloverDays: daysPassed - scheduled,
    };
  } else {
    return {
      scheduled,
      remaining: Math.max(0, scheduled - daysPassed),
      isRollover: false,
      rolloverDays: 0,
    };
  }
}

function getDeletionCountdown(completedAt: string, timeNow: number): string | null {
  const completedTime = new Date(completedAt).getTime();
  const expiryTime = completedTime + 48 * 60 * 60 * 1000; // 48 Hours Archive Grace Window
  const timeLeft = expiryTime - timeNow;

  if (timeLeft <= 0) return null;

  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getBoostUnavailableReason(ad: Ad, reportsCount: number): string | null {
  if (reportsCount > 0) {
    return "This campaign has been reported by viewers and is currently under content safety review. Please wait for the moderation review to complete.";
  }
  if (ad.admin_statement && ad.admin_statement.trim() !== "") {
    return `This campaign was paused by an administrator. Reason: "${ad.admin_statement}". Please resolve the notice or wait for admin review.`;
  }
  if (ad.is_paused) {
    return "This campaign is currently paused. Please resume the campaign first to boost it.";
  }
  return null;
}

export default function MyAdCard({
  ad,
  status,
  reportsCount,
  dismissalsCount,
  advertiserBlockCount,
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
  ratedAdIds,
  timeNow,
}: MyAdCardProps) {
  const rawMediaString = ad.ad_media || ad.ad_media_url || "";
  const isVideoMedia = ad.ad_media_type === "video" || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(rawMediaString);
  const mediaType = isVideoMedia ? "video" : "image";

  const actionButtons = ["action_phone", "action_whatsapp", "action_email", "action_website"].filter(
    (key) => ad[key as keyof Ad]
  ) as string[];

  const daysInfo = getCampaignDaysInfo(ad, timeNow);
  const seenCount = ad.impression_count ?? 0;

  // Calculate click tracking counters
  const phoneClicks = ad.clicks_phone ?? 0;
  const whatsappClicks = ad.clicks_whatsapp ?? 0;
  const websiteClicks = ad.clicks_website ?? 0;
  const emailClicks = ad.clicks_email ?? 0;
  const productCtaClicks = ad.clicks_product_cta ?? 0;
  const clicksCount = phoneClicks + whatsappClicks + websiteClicks + emailClicks + productCtaClicks;
  const ctr = seenCount > 0 ? ((clicksCount / seenCount) * 100).toFixed(1) : "0.0";

  // Parse all targeting dimensions for rich targeting display
  const industryList = parseTargetingList(ad.industry);
  const interestList = parseTargetingList(ad.interest);
  const lifestyleList = parseTargetingList(ad.lifestyle);
  const behaviorList = parseTargetingList(ad.behavior);
  const personalityList = parseTargetingList(ad.personality);
  const employmentList = parseTargetingList(ad.employment_status);
  const ageRangeText = formatAgeRange(ad.age_range);
  const geoText = [ad.province, ad.state, ad.country].filter(Boolean).join(" • ") || (ad.country ? ad.country : "Global");
  const totalCategoriesCount =
    industryList.length + interestList.length + lifestyleList.length + behaviorList.length + personalityList.length;

  const targetImpressions = ad.impressions ?? 1000;
  const deliveryPercent = Math.min(100, Math.round((seenCount / targetImpressions) * 100));

  const isCompleted = !!ad.completed_at || seenCount >= targetImpressions;
  const deletionCountdown = ad.completed_at ? getDeletionCountdown(ad.completed_at, timeNow) : null;
  if (isCompleted && ad.completed_at && deletionCountdown === null) {
    // 48 hours grace window has passed -> automatically omit from UI
    return null;
  }

  const hasValidMedia =
    !!rawMediaString &&
    rawMediaString.trim() !== "" &&
    rawMediaString.toLowerCase() !== "text" &&
    rawMediaString.toLowerCase() !== "null";

  return (
    <motion.div
      key={ad.id}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25 }}
      className={styles.card}
    >
      {/* Main Horizontal Row Body */}
      <div className={styles.rowBody}>
        {/* Thumbnail / Media Column */}
        <div className={styles.mediaCol}>
          <MultimediaCarousel rawMedia={rawMediaString} adMediaType={ad.ad_media_type} />
        </div>

        {/* Main Content & Delivery Column */}
        <div className={styles.mainInfoCol}>
          <div className={styles.tagsRow}>
            <span className={`${styles.tagPill} ${styles.tagPillMediaType}`}>
              {hasValidMedia ? (
                mediaType === "video" ? (
                  <>
                    <Video size={13} /> Video Ad
                  </>
                ) : (
                  <>
                    <ImageIcon size={13} /> Image Ad
                  </>
                )
              ) : (
                <>
                  <Megaphone size={13} /> Text Ad
                </>
              )}
            </span>

            {status === "review" && (
              <span className={`${styles.tagPill} ${styles.tagPillReview}`}>
                <Clock size={13} /> PENDING REVIEW
              </span>
            )}

            {Number(ad.cost_per_impression || 25) > 25 && (
              <span
                className={`${styles.tagPill} ${styles.tagPillBidded}`}
                title="Priority Bidded Ad: Higher bid per view guarantees top placement in feeds. You can boost priority anytime."
              >
                <Zap size={13} color="var(--primary)" /> Bidded Priority Ad ({formatCurrency(ad.cost_per_impression, ad.country)}/view)
              </span>
            )}

            {(ad.is_ai_content || (ad as any).isAiContent) && (
              <span className={`${styles.tagPill} ${styles.tagPillAi}`} title="AI-generated content">
                AI Content
              </span>
            )}
          </div>

          <p className={styles.adDescription}>{ad.ad_content}</p>

          {ad.admin_statement && (
            <div className={styles.adminNotice}>
              <strong className={styles.adminNoticeTitle}>
                <Info size={15} color="var(--primary)" /> Important Notice / Reason:
              </strong>
              {ad.admin_statement}
            </div>
          )}

          {/* Target Specs Pills */}
          <div className={styles.targetTagsRow}>
            {(!!ad.is_bidded || Number(ad.cost_per_impression || 0) > 25) && (
              <span className={`${styles.tagPill} ${styles.tagPillBidded}`}>
                <Zap size={13} color="var(--primary)" /> {ad.is_bidded ? "Bidded Priority" : "Boosted"} ({formatCurrency(ad.cost_per_impression, ad.country)}/view)
              </span>
            )}
            <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
              <Globe size={13} /> Geo: {geoText}
            </span>
            <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
              <Users size={13} />{" "}
              {ad.gender
                ? ad.gender.toLowerCase() === "both"
                  ? "All Genders"
                  : ad.gender.charAt(0).toUpperCase() + ad.gender.slice(1)
                : "All Genders"}{" "}
              • {ageRangeText}
            </span>
            {industryList.length > 0 && (
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <Target size={13} /> Industry ({industryList.length}): {industryList.join(", ")}
              </span>
            )}
            {interestList.length > 0 && (
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <Tag size={13} /> Interests ({interestList.length}): {interestList.join(", ")}
              </span>
            )}
            {lifestyleList.length > 0 && (
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <SlidersHorizontal size={13} /> Lifestyle ({lifestyleList.length}): {lifestyleList.join(", ")}
              </span>
            )}
            {behaviorList.length > 0 && (
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <Target size={13} /> Behavior ({behaviorList.length}): {behaviorList.join(", ")}
              </span>
            )}
            {personalityList.length > 0 && (
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <Users size={13} /> Personality ({personalityList.length}): {personalityList.join(", ")}
              </span>
            )}
            {employmentList.length > 0 && (
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <Users size={13} /> Employment: {employmentList.join(", ")}
              </span>
            )}
            {totalCategoriesCount === 0 && (
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <Target size={13} /> Targeting: Broad Delivery
              </span>
            )}
            <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
              <Zap size={13} /> {ad.user_frequency_cap || 1} View/Viewer/Day
            </span>
            <span className={styles.tagPill}>{daysInfo.scheduled} Days Cap</span>
            {ad.display_mutual_button && (
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <CheckCircle2 size={13} color="var(--primary)" /> Mutual+ Enabled
              </span>
            )}
          </div>

          {/* Live Delivery Progress */}
          <div className={styles.deliveryProgressWrapper}>
            <div className={styles.deliveryProgressRow}>
              <span>Delivery Progress</span>
              <span>
                {deliveryPercent}% ({seenCount.toLocaleString()} / {targetImpressions.toLocaleString()} views)
              </span>
            </div>
            <div className={styles.deliveryProgressTrack}>
              <motion.div
                className={styles.deliveryProgressFill}
                initial={{ width: 0 }}
                animate={{ width: `${deliveryPercent}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>

          {/* CTA Buttons Click Counter Row */}
          <div className={styles.ctaClickRow}>
            <span className={styles.ctaClickItem}>
              <Phone size={13} /> Phone: <strong>{phoneClicks}</strong>
            </span>
            <span className={styles.ctaClickItem}>
              <MessageSquare size={13} /> WhatsApp: <strong>{whatsappClicks}</strong>
            </span>
            <span className={styles.ctaClickItem}>
              <Globe size={13} /> Website: <strong>{websiteClicks}</strong>
            </span>
            <span className={styles.ctaClickItem}>
              <Mail size={13} /> Email: <strong>{emailClicks}</strong>
            </span>
            {productCtaClicks > 0 && (
              <span className={styles.ctaClickItem}>
                <ShoppingCart size={13} /> Product CTA: <strong>{productCtaClicks}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Key Metrics Grid Column */}
        <div className={styles.metricsCol}>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Views Delivered</span>
            <span className={styles.metricVal}>{seenCount.toLocaleString()}</span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Clicks / CTR</span>
            <span className={styles.metricVal}>
              {clicksCount} ({ctr}%)
            </span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Mutual Adds</span>
            <span className={styles.metricVal}>{ad.mutual_adds_count ?? 0}</span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Ad Health</span>
            {reportsCount === 0 && advertiserBlockCount === 0 ? (
              <span className={`${styles.metricVal} ${styles.metricValGreen}`}>
                <CheckCircle2 size={13} color="var(--primary)" /> Clean
              </span>
            ) : (
              <span className={`${styles.metricVal} ${styles.metricValRed}`}>
                <AlertTriangle size={13} color="#ef4444" /> {reportsCount} Flags
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Row Footer - Aligned Single Horizontal Bar */}
      <div className={styles.rowFooter}>
        <div className={`${styles.footerLeftGroup} ${styles.footerLeftGroupInner}`}>
          {ad.is_paused ? (
            <span className={styles.badgePaused}>PAUSED</span>
          ) : isCompleted ? (
            <span className={styles.badgeCompleted} title="100% of paid impressions have been delivered and archived">
              COMPLETED {deletionCountdown ? `(Archiving in ${deletionCountdown})` : "(100% Delivered)"}
            </span>
          ) : daysInfo.isRollover ? (
            <span
              className={styles.badgeRollover}
              title="Campaign schedule passed but impressions remain unfulfilled. Actively delivering in Rollover mode."
            >
              ROLLOVER (+{daysInfo.rolloverDays}d)
            </span>
          ) : (
            <span className={status === "active" ? styles.badgeActive : styles.badgeReview}>
              {status === "active" ? "Active" : "In Review"}
            </span>
          )}

          {/* Rate Listeners Button - Renders ONLY when Completed or Paused */}
          {(ad.is_paused || isCompleted) &&
            (ratedAdIds.has(ad.id) ? (
              <span className={styles.rateBtnDone}>
                <CheckCircle2 size={13} color="var(--primary)" /> Audience Rated
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onOpenRating(ad.id)}
                className={`${styles.rateBtn} ${styles.rateBtnGlow}`}
                title="Rate campaign conversion outcomes to boost top-performing listener Attention Scores"
              >
                <Star size={13} fill="var(--primary)" color="var(--primary)" /> Rate Audience
              </button>
            ))}

          <span className={styles.postedTime}>
            {status === "review"
              ? `Submitted ${formatTimestamp(ad.created_at)}`
              : isCompleted && ad.completed_at
              ? `Posted ${formatTimestamp(ad.created_at)} • Completed ${formatTimestamp(ad.completed_at)}`
              : `Posted ${formatTimestamp(ad.created_at)}`}
          </span>
        </div>

        <div className={styles.footerRightGroup}>
          {actionButtons.length > 0 && (
            <div className={`${styles.actionButtons} ${styles.actionButtonsGroup}`}>
              {actionButtons.map((type) => (
                <a
                  key={`${type}-${ad.id}`}
                  href={getHref(type, ad[type as keyof Ad] as string)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.iconButton}
                  title={type}
                >
                  {getIcon(type)}
                </a>
              ))}
            </div>
          )}

          <button type="button" className={styles.toggleSpecsBtn} onClick={onToggleSpecs}>
            {isSpecsOpen ? (
              <span className={styles.specsBtnInner}>
                <ChevronUp size={13} /> Hide Specs
              </span>
            ) : (
              <span className={styles.specsBtnInner}>
                <SlidersHorizontal size={13} /> Specs and Budget
              </span>
            )}
          </button>

          {status === "active" && !isCompleted && (
            <>
              <button
                type="button"
                onClick={() => onTogglePause(ad.id, !!ad.is_paused, ad.admin_statement)}
                className={ad.is_paused ? styles.resumeBtn : styles.pauseBtn}
              >
                {ad.is_paused ? "Resume" : "Pause"}
              </button>
              {(() => {
                const reason = getBoostUnavailableReason(ad, reportsCount);
                if (reason) {
                  return (
                    <div className={styles.boostTooltipWrapper}>
                      <button
                        type="button"
                        onClick={() => onShowNotice("Boosting Unavailable", reason, ad.id)}
                        className={`${styles.boostBtn} ${styles.boostUnavailableBtn}`}
                      >
                        <AlertTriangle size={14} color="var(--text-muted)" />
                        Boosting Unavailable
                      </button>
                      <div className={styles.boostTooltipContent}>
                        <div className={styles.boostTooltipRow}>
                          <AlertTriangle size={14} />
                          Boosting Unavailable
                        </div>
                        {reason}
                      </div>
                    </div>
                  );
                }
                return (
                  <button type="button" onClick={() => onOpenBooster(ad)} className={styles.boostBtn}>
                    Boost
                  </button>
                );
              })()}
              <button type="button" onClick={() => onShare(ad.id)} className={styles.shareAdBtn}>
                Share
              </button>
              <a
                href="/logged-in"
                className={`${styles.shareAdBtn} ${styles.editAdBtn}`}
                onClick={(e) => {
                  e.preventDefault();
                  onEdit(ad.id);
                }}
              >
                Edit Ad
              </a>
              <button
                type="button"
                onClick={() => onExportCsv(ad)}
                className={styles.shareAdBtn}
                title="Download CSV Performance Report"
              >
                <FileText size={13} /> Export CSV
              </button>
              <button
                type="button"
                onClick={() => onCancel(ad.id)}
                className={`${styles.cancelBtn} ${styles.cancelBtnStyling}`}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expandable Full Campaign Specs & Budget Drawer */}
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
