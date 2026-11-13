"use client";

import React from "react";
import {
  Globe,
  CheckCircle2,
  Phone,
  MessageSquare,
  Mail,
  AlertTriangle,
  Star,
  Pencil,
} from "lucide-react";
import { Ad } from "./types";
import { formatAdTimestamp, getActionHref, getBoostUnavailableReason } from "./adUtils";
import styles from "./page.module.css";

function getActionIcon(type: string): React.ReactNode {
  switch (type) {
    case "action_phone":
      return <Phone size={13} />;
    case "action_whatsapp":
      return <MessageSquare size={13} />;
    case "action_email":
      return <Mail size={13} />;
    case "action_website":
    default:
      return <Globe size={13} />;
  }
}

interface MyAdCardFooterProps {
  ad: Ad;
  status: "review" | "active";
  isCompleted: boolean;
  isApproved: boolean;
  isApprovedExpired: boolean;
  isRejected: boolean;
  deletionCountdown: string | null;
  actionButtons: string[];
  reportsCount: number;
  isSpecsOpen: boolean;
  actionLoading?: boolean;
  ratedAdIds: Set<string>;
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
}

export default function MyAdCardFooter({
  ad,
  status,
  isCompleted,
  isApproved,
  isApprovedExpired,
  isRejected,
  deletionCountdown,
  actionButtons,
  reportsCount,
  isSpecsOpen,
  actionLoading = false,
  ratedAdIds,
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
}: MyAdCardFooterProps) {
  return (
    <div className={styles.rowFooter}>
      <div className={`${styles.footerLeftGroup} ${styles.footerLeftGroupInner}`}>
        {isCompleted && deletionCountdown && (
          <span className={styles.badgeCompleted}>
            Archiving in {deletionCountdown}
          </span>
        )}

        {(ad.is_paused || isCompleted) &&
          (ratedAdIds.has(ad.id) ? (
            <span className={styles.rateBtnDone}>
              <CheckCircle2 size={13} color="var(--primary)" /> Audience Rated
            </span>
          ) : (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => onOpenRating(ad.id)}
              className={`${styles.rateBtn} ${styles.rateBtnGlow}`}
              title="Rate campaign conversion outcomes to boost top-performing listener Attention Scores"
            >
              <Star size={12} fill="var(--primary)" color="var(--primary)" /> Rate Audience
            </button>
          ))}

        <span className={styles.postedTime}>
          {status === "review"
            ? `Submitted ${formatAdTimestamp(ad.created_at)}`
            : isCompleted && ad.completed_at
            ? `Posted ${formatAdTimestamp(ad.created_at)} • Completed ${formatAdTimestamp(ad.completed_at)}`
            : `Posted ${formatAdTimestamp(ad.created_at)}`}
        </span>
      </div>

      <div className={styles.footerRightGroup}>
        {actionButtons.length > 0 && (
          <div className={`${styles.actionButtons} ${styles.actionButtonsGroup}`}>
            {actionButtons.map((type) => (
              <a
                key={`${type}-${ad.id}`}
                href={getActionHref(type, ad[type as keyof Ad] as string)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.iconButton}
                title={type.replace("action_", "Test ")}
              >
                {getActionIcon(type)}
              </a>
            ))}
          </div>
        )}

        <button type="button" className={styles.toggleSpecsBtn} onClick={onToggleSpecs}>
          <span className={styles.specsBtnInner}>
            {isSpecsOpen ? "Hide Specs" : "Specs"}
          </span>
        </button>

        {status === "review" && (
          <>
            {isApproved && !isApprovedExpired && (
              <button
                type="button"
                disabled={actionLoading}
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
                  cursor: actionLoading ? "not-allowed" : "pointer",
                  opacity: actionLoading ? 0.65 : 1,
                  boxShadow: "0 2px 8px rgba(16, 185, 129, 0.35)",
                  transition: "transform 0.15s ease",
                }}
                onClick={() => onPublish && onPublish(ad)}
                title={
                  Number(ad.total_cost || 0) <= 0 || ad.is_admin_post
                    ? "Publish ad live to feed"
                    : "Make payment and publish ad live to feed"
                }
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
                  if (!actionLoading) onEdit(ad.id);
                }}
                title="Edit and resubmit campaign according to admin feedback"
              >
                Adjust &amp; Resubmit
              </a>
            )}

            {!isApproved && !isRejected && (
              <a
                href="/logged-in"
                className={`${styles.shareAdBtn} ${styles.editAdBtn}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (!actionLoading) onEdit(ad.id);
                }}
                title="Edit ad copy or targeting"
              >
                Edit
              </a>
            )}

            <button
              type="button"
              disabled={actionLoading}
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
              disabled={actionLoading}
              onClick={() => onTogglePause(ad.id, !!ad.is_paused, ad.admin_statement)}
              className={ad.is_paused ? styles.resumeBtn : styles.pauseBtn}
            >
              {actionLoading ? "Updating..." : ad.is_paused ? "Resume" : "Pause"}
            </button>
            {(() => {
              const reason = getBoostUnavailableReason(ad, reportsCount);
              if (reason) {
                return (
                  <div className={styles.boostTooltipWrapper}>
                    <button
                      type="button"
                      disabled={actionLoading}
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
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => onOpenBooster(ad)}
                  className={styles.boostBtn}
                >
                  Boost
                </button>
              );
            })()}
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => onShare(ad.id)}
              className={styles.shareAdBtn}
              title="Copy campaign share link"
            >
              Share
            </button>
            <a
              href="/logged-in"
              className={`${styles.shareAdBtn} ${styles.editAdBtn}`}
              onClick={(e) => {
                e.preventDefault();
                if (!actionLoading) onEdit(ad.id);
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
              disabled={actionLoading}
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
  );
}
