"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
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

function MyHighlightCard({
  item,
  status,
  isSpecsOpen,
  onToggleSpecs,
  onTogglePause,
  onEdit,
  onExportCsv,
  actionLoading,
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
          {isVideoMedia ? (
            <video src={rawMediaUrl} controls className={styles.mediaVideo} />
          ) : (
            <img
              src={
                rawMediaUrl ||
                "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60"
              }
              alt={item.title || "Highlight cover"}
              className={styles.adImgElement}
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60";
              }}
            />
          )}
        </div>

        {/* Main Content & Schedule Column */}
        <div className={styles.mainInfoCol}>
          {/* Top Badges Strip */}
          <div className={styles.tagsRow}>
            <span className={`${styles.tagPill} ${styles.tagPillMediaType}`}>
              {isVideoMedia ? (
                <>
                  <Video size={12} /> Video Highlight
                </>
              ) : (
                <>
                  <ImageIcon size={12} /> Daily Highlight
                </>
              )}
            </span>

            {status === "review" ? (
              <span className={`${styles.tagPill} ${styles.tagPillReview}`}>
                <Clock size={12} /> Pending Approval
              </span>
            ) : (
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <CheckCircle2 size={12} color="#10b981" /> Approved
              </span>
            )}

            {isBidded && (
              <span
                className={`${styles.tagPill} ${styles.tagPillBidded}`}
                title="Priority Spotlight Auction: Contests for the #1 top carousel slot."
              >
                <Zap size={12} /> Spotlight Bid • {formatCurrency(dailyRate, item.country)}/day
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

          {item.admin_statement && (
            <div className={styles.adminNotice}>
              <strong className={styles.adminNoticeTitle}>
                <Info size={14} color="var(--primary)" /> Admin Notice:
              </strong>
              {item.admin_statement}
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
                {status === "review" ? (
                  <>
                    Moderation Status • <strong>Pending Review</strong>
                  </>
                ) : (
                  <>
                    Spotlight Window • <strong>{scheduleInfo.elapsedPercent}% elapsed</strong>
                  </>
                )}
              </span>
              <span className={styles.deliveryCountText}>
                {status === "review"
                  ? `${scheduleInfo.scheduledDays}d window starts on approval`
                  : `${scheduleInfo.remainingText} (${scheduleInfo.totalHours}h total)`}
              </span>
            </div>
            <div className={styles.deliveryProgressTrack}>
              <motion.div
                className={styles.deliveryProgressFill}
                initial={{ width: 0 }}
                animate={{ width: status === "review" ? "8%" : `${scheduleInfo.elapsedPercent}%` }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        </div>

        {/* Key Metrics 2x2 Bento Panel */}
        <div className={styles.metricsCol}>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Approval Status</span>
            {status === "active" ? (
              <span className={`${styles.metricVal} ${styles.metricValGreen}`}>
                <CheckCircle2 size={13} color="#10b981" /> Approved
              </span>
            ) : (
              <span className={styles.metricVal} style={{ color: "var(--badge-gold, #f59e0b)" }}>
                <Clock size={13} /> Pending
              </span>
            )}
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Delivery State</span>
            <span className={styles.metricVal}>
              {status === "review" ? (
                "In Queue"
              ) : item.is_paused ? (
                "Paused"
              ) : isExpired ? (
                "Ended"
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "#10b981" }}>
                  <span className={styles.liveDot} /> Active
                </span>
              )}
            </span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Daily Rate</span>
            <span className={styles.metricVal}>
              {formatCurrency(dailyRate, item.country)}
              <span className={styles.metricSubVal}>/d</span>
            </span>
          </div>
          <div className={styles.metricCell}>
            <span className={styles.metricTitle}>Safety Status</span>
            {item.admin_statement ? (
              <span className={`${styles.metricVal} ${styles.metricValRed}`}>
                <AlertTriangle size={13} color="#ef4444" /> Notice
              </span>
            ) : (
              <span className={`${styles.metricVal} ${styles.metricValGreen}`}>
                <CheckCircle2 size={13} color="#10b981" /> Clean
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Row Footer */}
      <div className={styles.rowFooter}>
        <div className={`${styles.footerLeftGroup} ${styles.footerLeftGroupInner}`}>
          {status === "review" ? (
            <span className={styles.badgeReview}>Pending Review</span>
          ) : item.is_paused ? (
            <span className={styles.badgePaused}>Paused</span>
          ) : isExpired ? (
            <span className={styles.badgeCompleted}>Completed • Window Ended</span>
          ) : (
            <span className={styles.badgeActive}>
              <span className={styles.liveDot} /> Approved • Active
            </span>
          )}

          <span className={styles.postedTime}>
            {status === "review"
              ? `Submitted ${formatTimestamp(item.created_at)}`
              : `Approved & Posted ${formatTimestamp(item.created_at)}`}
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

          {!isExpired && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => onTogglePause(item)}
              className={item.is_paused ? styles.resumeBtn : styles.pauseBtn}
            >
              {item.is_paused ? (
                <>
                  <Play size={12} /> Resume
                </>
              ) : (
                <>
                  <Pause size={12} /> Pause
                </>
              )}
            </button>
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
            <FileText size={12} /> CSV
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
