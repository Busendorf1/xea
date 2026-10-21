"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket,
  Trash2,
  Video,
  Image as ImageIcon,
  Clock,
  Zap,
  Info,
  Globe,
  Tag,
  Calendar,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  ChevronUp,
  FileText,
  Pencil,
  Pause,
  Play,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { HighlightItem, getHighlightScheduleInfo } from "./types";
import MultimediaCarousel from "../MyAds/MultimediaCarousel";
import styles from "../MyAds/page.module.css";

interface MyHighlightCardProps {
  item: HighlightItem;
  status: "review" | "active";
  isSpecsOpen: boolean;
  onToggleSpecs: () => void;
  onTogglePause: (item: HighlightItem) => void;
  onEdit: (id: string) => void;
  onExportCsv: (item: HighlightItem) => void;
  actionLoading: boolean;
  onOpenBooster?: (item: HighlightItem) => void;
  onPublish?: (item: HighlightItem) => void;
  onDelete?: (id: string) => void;
  timeNow: number;
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

function MyHighlightCard({
  item,
  status,
  isSpecsOpen,
  onToggleSpecs,
  onTogglePause,
  onEdit,
  onExportCsv,
  actionLoading,
  onOpenBooster,
  onPublish,
  onDelete,
  timeNow,
}: MyHighlightCardProps) {
  const rawMediaUrl = item.image_url || "";
  const isVideoMedia = /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(rawMediaUrl);
  const isBidded = !!item.is_bidded || Number(item.bid_price || 0) > 1000;
  const dailyRate = isBidded ? Number(item.bid_price || 1500) : 1000;
  const scheduleInfo = getHighlightScheduleInfo(item, timeNow);
  const totalCost = dailyRate * scheduleInfo.scheduledDays;

  const geoText =
    [item.province, item.state, item.country].filter(Boolean).join(" • ") ||
    (item.country ? item.country : "Global");

  const isExpired = status === "active" && scheduleInfo.isExpired;
  const isDeliveringLive = status === "active" && !item.is_paused && !isExpired;

  // Moderation & Approval State
  const isApproved = !!(item.admin_statement && item.admin_statement.startsWith("APPROVED:"));
  const isRejected = !!(item.admin_statement && item.admin_statement.startsWith("REJECTED:"));
  const rejectionFeedback = isRejected ? item.admin_statement?.replace("REJECTED:", "").trim() : null;
  const adminCustomNote = getAdminCustomNote(item.admin_statement);

  let approvedCountdownText: string | null = null;
  let isApprovedExpired = false;

  if (isApproved && item.admin_statement) {
    const approvedTimestamp = item.admin_statement.replace("APPROVED:", "").trim();
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

  return (
    <motion.div
      key={item.id}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={styles.card}
    >
      {/* Main Horizontal Row Body */}
      <div className={styles.rowBody}>
        {/* Cover Image / Video Thumbnail Column */}
        <div className={styles.mediaCol}>
          <MultimediaCarousel
            rawMedia={rawMediaUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60"}
            adMediaType={isVideoMedia ? "video" : "image"}
          />
        </div>

        {/* Main Content & Schedule Column */}
        <div className={styles.mainInfoCol}>
          {/* Top Badges Strip */}
          <div className={styles.tagsRow}>
            <span className={`${styles.tagPill} ${styles.tagPillMediaType}`}>
              {isVideoMedia ? "Video Highlight" : "Daily Highlight"}
            </span>

            {/* The single status badge */}
            {status === "active" ? (
              item.is_paused ? (
                <span className={`${styles.tagPill} ${styles.tagPillReview}`}>
                  Paused
                </span>
              ) : isExpired ? (
                <span className={`${styles.tagPill} ${styles.tagPillReview}`}>
                  Ended
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

            {isBidded && (
              <span
                className={`${styles.tagPill} ${styles.tagPillBidded}`}
                title="Priority Spotlight Auction: Contests for the #1 top carousel slot."
              >
                Spotlight Bid • {formatCurrency(dailyRate, item.country)}/day
              </span>
            )}

            {item.is_ai_content && (
              <span className={`${styles.tagPill} ${styles.tagPillAi}`} title="AI-generated content">
                AI
              </span>
            )}
          </div>

          {/* Highlight Title & Story Copy */}
          <h4
            style={{
              margin: 0,
              fontSize: "1.02rem",
              fontWeight: 700,
              color: "var(--foreground)",
              lineHeight: 1.35,
            }}
          >
            {item.title}
          </h4>
          <p className={styles.adDescription} style={{ fontWeight: 400, color: "var(--text-muted)" }}>
            {item.content}
          </p>

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
              <Tag size={12} /> {item.interest || "General"}
            </span>
            <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
              <Globe size={12} /> {geoText}
            </span>
            <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
              <Calendar size={12} /> {scheduleInfo.scheduledDays}d Schedule
            </span>
            <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
              {isBidded ? "25–30m Hold / Viewer" : "10m Hold / Viewer"}
            </span>
            <button
              type="button"
              onClick={onToggleSpecs}
              className={`${styles.tagPill} ${styles.tagPillInteractive}`}
              title="Click to inspect highlight budget & targeting specs"
            >
              <SlidersHorizontal size={12} /> Inspect Specs
            </button>
          </div>

          {/* Live Spotlight Window Progress */}
          <div className={styles.deliveryProgressWrapper}>
            <div className={styles.deliveryProgressRow}>
              <span className={styles.deliveryLabel}>
                {status === "review"
                  ? `Campaign Window • ${scheduleInfo.scheduledDays}d Schedule`
                  : `Spotlight Window • ${scheduleInfo.elapsedPercent}% elapsed`}
              </span>
              <span className={styles.deliveryCountText}>
                {status === "review"
                  ? `${scheduleInfo.scheduledDays}d window starts on live publish`
                  : `${scheduleInfo.remainingText} (${scheduleInfo.totalHours}h total)`}
              </span>
            </div>
            <div className={styles.deliveryProgressTrack}>
              <motion.div
                className={styles.deliveryProgressFill}
                initial={{ width: 0 }}
                animate={{ width: status === "review" ? "100%" : `${scheduleInfo.elapsedPercent}%` }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        </div>

        {/* Key Metrics 2x2 Bento Panel */}
        <div className={styles.metricsCol}>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Audience Category</span>
            <span className={styles.metricVal}>{item.interest || "General"}</span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Viewer Retention</span>
            <span className={styles.metricVal}>{isBidded ? "25–30m Hold" : "10m Hold"}</span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Daily Rate</span>
            <span className={styles.metricVal}>
              {formatCurrency(dailyRate, item.country)}
              <span className={styles.metricSubVal}>/d</span>
            </span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Duration</span>
            <span className={styles.metricVal}>{scheduleInfo.scheduledDays} Day(s)</span>
          </div>
        </div>
      </div>

      {/* Action Row Footer */}
      <div className={styles.rowFooter}>
        <div className={`${styles.footerLeftGroup} ${styles.footerLeftGroupInner}`}>
          <span className={styles.postedTime}>
            {status === "review"
              ? `Submitted ${formatTimestamp(item.created_at)}`
              : `Posted ${formatTimestamp(item.created_at)}`}
          </span>
        </div>

        <div className={styles.footerRightGroup}>
          <button type="button" className={styles.toggleSpecsBtn} onClick={onToggleSpecs}>
            {isSpecsOpen ? (
              <span className={styles.specsBtnInner}>
                <ChevronUp size={13} /> Hide Specs
              </span>
            ) : (
              <span className={styles.specsBtnInner}>
                <SlidersHorizontal size={13} /> Specs &amp; Budget
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
                  }}
                  onClick={() => onPublish && onPublish(item)}
                  title={item.is_admin_post || Number((item as any).total_cost || 0) <= 0 ? "Publish highlight live" : "Make payment and publish highlight live"}
                >
                  {item.is_admin_post || Number((item as any).total_cost || 0) <= 0 ? "Publish" : "Publish & Pay"}
                </button>
              )}

              {isRejected && (
                <a
                  href="/logged-in"
                  className={`${styles.shareAdBtn} ${styles.editAdBtn}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onEdit(item.id);
                  }}
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
                    onEdit(item.id);
                  }}
                >
                  Edit
                </a>
              )}

              <button
                type="button"
                onClick={() => onDelete?.(item.id)}
                className={`${styles.cancelBtn} ${styles.cancelBtnStyling}`}
                title="Delete highlight draft"
              >
                Delete
              </button>
            </>
          )}

          {status === "active" && !isExpired && (
            <>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onTogglePause(item)}
                className={item.is_paused ? styles.resumeBtn : styles.pauseBtn}
              >
                {item.is_paused ? (
                  <>
                    Resume
                  </>
                ) : (
                  <>
                    Pause
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={actionLoading || !!item.is_paused}
                onClick={() => onOpenBooster?.(item)}
                className={styles.boostBtn}
                title={item.is_paused ? "Resume highlight to boost" : "Boost highlight priority bid and duration"}
              >
                Boost
              </button>
            </>
          )}

          <a
            href="/logged-in"
            className={`${styles.shareAdBtn} ${styles.editAdBtn}`}
            onClick={(e) => {
              e.preventDefault();
              onEdit(item.id);
            }}
          >
            <Pencil size={12} /> Edit
          </a>

          <button
            type="button"
            onClick={() => onExportCsv(item)}
            className={styles.shareAdBtn}
            title="Download Highlight CSV Report"
          >
            CSV
          </button>
        </div>
      </div>

      {/* Expandable Full Highlight Specs & Budget Drawer */}
      <AnimatePresence>
        {isSpecsOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={styles.specsDrawer}
          >
            <div className={styles.specsHeading}>
              <span className={styles.specsHeadingInner}>
                <SlidersHorizontal size={15} color="#1d9bf0" /> Highlight Specifications &amp; Budget Breakdown
              </span>
            </div>

            <div className={styles.specsGrid}>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Highlight ID</span>
                <span className={styles.specVal}>#{item.id.slice(0, 8)}</span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Moderation &amp; Delivery Status</span>
                <span className={styles.specVal}>
                  {status === "review"
                    ? "Pending Moderation Review"
                    : item.is_paused
                    ? "Approved (Currently Paused)"
                    : isDeliveringLive
                    ? "Approved & Actively Delivering"
                    : "Approved (Window Completed)"}
                </span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Total Highlight Budget</span>
                <span className={styles.specVal}>{formatCurrency(totalCost, item.country)}</span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Daily Rate</span>
                <span className={styles.specVal}>{formatCurrency(dailyRate, item.country)} / day</span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Placement Tier</span>
                <span className={styles.specVal}>
                  {isBidded ? "Priority Spotlight Auction (#1 Contest)" : "Standard Carousel Rotation"}
                </span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Target Interest Category</span>
                <span className={styles.specVal}>{item.interest || "General"}</span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Target Location</span>
                <span className={styles.specVal}>{geoText}</span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Carousel Hold Guarantee</span>
                <span className={styles.specVal}>
                  {isBidded ? "25–30 mins per viewer" : "10 mins per viewer"}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default React.memo(MyHighlightCard);
