"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Rocket,
  Trash2,
  Video,
  Image as ImageIcon,
  Megaphone,
  Clock,
  Zap,
  Info,
  Globe,
  Users,
  Target,
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
  Share2,
  Pencil,
  Pause,
  Play,
  XCircle,
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
  onPublish?: (ad: Ad) => void;
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
      return <Phone size={13} />;
    case "action_whatsapp":
      return <MessageSquare size={13} />;
    case "action_email":
      return <Mail size={13} />;
    case "action_website":
      return <Globe size={13} />;
    default:
      return <Globe size={13} />;
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
  // If approved and pending publish, or unpaid, boost is strictly unavailable until paid and live in feed
  if (
    ad.payment_status === "unpaid" ||
    ad.status === "pending_review" ||
    ad.status === "approved_pending_publish" ||
    (ad.admin_statement && (
      ad.admin_statement.startsWith("STATUS:") ||
      ad.admin_statement.startsWith("APPROVED:") ||
      ad.admin_statement.startsWith("REJECTED:")
    ))
  ) {
    return "Boosting is only available after your campaign has been approved, paid for, and published live to the feed.";
  }
  if (reportsCount > 0) {
    return "This campaign has been reported by viewers and is currently under content safety review. Please wait for the moderation review to complete.";
  }
  if (ad.admin_statement && ad.admin_statement.trim() !== "") {
    return `This campaign was paused by an administrator. Reason: "${getAdminCustomNote(ad.admin_statement) || ad.admin_statement}". Please resolve the notice or wait for admin review.`;
  }
  if (ad.is_paused) {
    return "This campaign is currently paused. Please resume the campaign first to boost it.";
  }
  return null;
}

function getAdminCustomNote(stmt: string | null | undefined): string | null {
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

function MyAdCard({
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
  onPublish,
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

  // Moderation & Approval State
  const isApproved = !!(ad.admin_statement && ad.admin_statement.startsWith("APPROVED:"));
  const isRejected = !!(ad.admin_statement && ad.admin_statement.startsWith("REJECTED:"));
  const rejectionFeedback = isRejected ? ad.admin_statement?.replace("REJECTED:", "").trim() : null;
  const adminCustomNote = getAdminCustomNote(ad.admin_statement);

  // 3-Day Countdown calculation for approved campaigns
  let approvedCountdownText: string | null = null;
  let isApprovedExpired = false;

  if (isApproved && ad.admin_statement) {
    const approvedTimestamp = ad.admin_statement.replace("APPROVED:", "").trim();
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
  const seenCount = ad.impression_count ?? 0;

  // Calculate click tracking counters
  const phoneClicks = ad.clicks_phone ?? 0;
  const whatsappClicks = ad.clicks_whatsapp ?? 0;
  const websiteClicks = ad.clicks_website ?? 0;
  const emailClicks = ad.clicks_email ?? 0;
  const productCtaClicks = ad.clicks_product_cta ?? 0;
  const clicksCount = phoneClicks + whatsappClicks + websiteClicks + emailClicks + productCtaClicks;
  const ctr = seenCount > 0 ? ((clicksCount / seenCount) * 100).toFixed(1) : "0.0";

  // Parse all targeting dimensions
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

  const isBiddedOrBoosted = !!ad.is_bidded || Number(ad.cost_per_impression || 25) > 25;

  return (
    <motion.div
      key={ad.id}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
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
          {/* Top Badges Strip */}
          <div className={styles.tagsRow}>
            <span className={`${styles.tagPill} ${styles.tagPillMediaType}`}>
              {hasValidMedia ? (
                mediaType === "video" ? (
                  <>
                    Video
                  </>
                ) : (
                  <>
                    Image
                  </>
                )
              ) : (
                <>
                  Text
                </>
              )}
            </span>

            {/* The single status badge */}
            {status === "active" ? (
              ad.is_paused ? (
                <span className={`${styles.tagPill} ${styles.tagPillReview}`}>
                  Paused
                </span>
              ) : isCompleted ? (
                <span className={`${styles.tagPill} ${styles.tagPillReview}`}>
                  Completed
                </span>
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
              <span className={`${styles.tagPill} ${styles.tagPillRejected}`}>
                Rejected
              </span>
            ) : (
              <span className={`${styles.tagPill} ${styles.tagPillReview}`}>
                Pending review
              </span>
            )}

            {isBiddedOrBoosted && (
              <span
                className={`${styles.tagPill} ${styles.tagPillBidded}`}
                title="Priority Bidded Ad: Higher bid per view guarantees top placement in feeds."
              >
                {ad.is_bidded ? "Priority" : "Boosted"} •{" "}
                {formatCurrency(ad.cost_per_impression, ad.country)}/view
              </span>
            )}

            {ad.display_mutual_button && (
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                Mutual+
              </span>
            )}

            {(ad.is_ai_content || (ad as any).isAiContent) && (
              <span className={`${styles.tagPill} ${styles.tagPillAi}`} title="AI-generated content">
                AI
              </span>
            )}
          </div>

          {/* Ad Copy Preview */}
          <p className={styles.adDescription}>{ad.ad_content}</p>

          {/* Single Rejection Reason Banner */}
          {isRejected && rejectionFeedback && (
            <div className={styles.statusReasonBanner}>
              <AlertTriangle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong style={{ color: "var(--foreground)" }}>Reason: </strong>
                <span style={{ color: "var(--text-muted)" }}>{rejectionFeedback}</span>
              </div>
            </div>
          )}

          {/* Single Admin Custom Note Banner (if any manual note was given) */}
          {adminCustomNote && (
            <div className={styles.statusReasonBanner}>
              <Info size={15} color="var(--primary)" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong style={{ color: "var(--foreground)" }}>Admin Note: </strong>
                <span style={{ color: "var(--text-muted)" }}>{adminCustomNote}</span>
              </div>
            </div>
          )}

          {/* Compact Targeting Summary Strip */}
          <div className={styles.targetTagsRow}>
            <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
              {geoText}
            </span>
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
            <span className={styles.tagPill}>{daysInfo.scheduled}d Schedule</span>
          </div>

          {/* Live Delivery Progress */}
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

          {/* CTA Conversion Breakdown Pills */}
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
          </div>
        </div>

        {/* Key Metrics 2x2 Bento Panel */}
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
            <span className={styles.metricTitle}>Safety Status</span>
            {reportsCount === 0 && advertiserBlockCount === 0 ? (
              <span className={`${styles.metricVal} ${styles.metricValGreen}`}>
                Clean
              </span>
            ) : (
              <span className={`${styles.metricVal} ${styles.metricValRed}`}>
                {reportsCount} Flags
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Row Footer - Aligned Single Horizontal Bar */}
      <div className={styles.rowFooter}>
        <div className={`${styles.footerLeftGroup} ${styles.footerLeftGroupInner}`}>
          {isCompleted && deletionCountdown && (
            <span className={styles.badgeCompleted}>
              Archiving in {deletionCountdown}
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
                <Star size={12} fill="var(--primary)" color="var(--primary)" /> Rate Audience
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
                  title={type.replace("action_", "Test ")}
                >
                  {getIcon(type)}
                </a>
              ))}
            </div>
          )}

          <button type="button" className={styles.toggleSpecsBtn} onClick={onToggleSpecs}>
            {isSpecsOpen ? (
              <span className={styles.specsBtnInner}>
                Hide Specs
              </span>
            ) : (
              <span className={styles.specsBtnInner}>
                Specs
              </span>
            )}
          </button>

          
          {status === "review" && (
            <>
              {isApproved && !isApprovedExpired && (
                <button
                  type="button"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "#10b981",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.42rem 0.95rem",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(16, 185, 129, 0.35)",
                    transition: "transform 0.15s ease",
                  }}
                  onClick={() => onPublish && onPublish(ad)}
                  title={Number(ad.total_cost || 0) <= 0 || ad.is_admin_post ? "Publish ad live to feed" : "Make payment and publish ad live to feed"}
                >
                  {Number(ad.total_cost || 0) <= 0 || ad.is_admin_post ? "Publish" : "Publish & Pay"}
                </button>
              )}

              {isRejected && (
                <a
                  href="/logged-in"
                  className={`${styles.shareAdBtn} ${styles.editAdBtn}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onEdit(ad.id);
                  }}
                  title="Edit ad according to admin feedback"
                >
                  Adjust
                </a>
              )}

              {!isApproved && !isRejected && (
                <a
                  href="/logged-in"
                  className={`${styles.shareAdBtn} ${styles.editAdBtn}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onEdit(ad.id);
                  }}
                  title="Edit ad copy or targeting"
                >
                  Edit
                </a>
              )}

              <button
                type="button"
                onClick={() => onCancel(ad.id)}
                className={`${styles.cancelBtn} ${styles.cancelBtnStyling}`}
                title="Delete campaign draft"
              >
                Delete
              </button>
            </>
          )}

          {status === "active" && !isCompleted && (
            <>
              <button
                type="button"
                onClick={() => onTogglePause(ad.id, !!ad.is_paused, ad.admin_statement)}
                className={ad.is_paused ? styles.resumeBtn : styles.pauseBtn}
              >
                {ad.is_paused ? (
                  <>
                    Resume
                  </>
                ) : (
                  <>
                    Pause
                  </>
                )}
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
                        <AlertTriangle size={13} color="var(--text-muted)" />
                        Boost Unavailable
                      </button>
                      <div className={styles.boostTooltipContent}>
                        <div className={styles.boostTooltipRow}>
                          <AlertTriangle size={13} />
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
              <button type="button" onClick={() => onShare(ad.id)} className={styles.shareAdBtn} title="Copy campaign share link">
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
                <Pencil size={12} /> Edit
              </a>
              <button
                type="button"
                onClick={() => onExportCsv(ad)}
                className={styles.shareAdBtn}
                title="Download CSV Performance Report"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => onCancel(ad.id)}
                className={`${styles.cancelBtn} ${styles.cancelBtnStyling}`}
                title="Stop and cancel campaign"
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

export default React.memo(MyAdCard);
