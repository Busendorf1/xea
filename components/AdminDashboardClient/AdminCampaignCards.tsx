"use client";

import React from "react";
import {
  Video,
  Image as ImageIcon,
  Megaphone,
  Clock,
  AlertCircle,
  Zap,
  AlertTriangle,
  CheckCircle,
  Trash2,
  Play,
  Pause,
  Edit3,
} from "lucide-react";
import styles from "./page.module.css";
import { AdminAdMediaBox } from "./AdminDashboardModals";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

const formatCurrency = (amount: number | string, country?: string | null) =>
  globalFormatCurrency(amount, country);

export const formatCampaignSchedule = (
  createdAt: string | null | undefined,
  days: number = 1,
  isHighlight = false
) => {
  const safeDays = Math.max(1, Number(days) || 1);
  const scheduledText = isHighlight
    ? safeDays === 1
      ? "24 hours"
      : `${safeDays} days`
    : safeDays === 1
    ? "1 day"
    : `${safeDays} days`;

  if (!createdAt) {
    return {
      scheduledText,
      remainingText: "Active",
      isEnded: false,
    };
  }

  const createdTime = new Date(createdAt).getTime();
  if (isNaN(createdTime)) {
    return {
      scheduledText,
      remainingText: "Active",
      isEnded: false,
    };
  }

  const durationMs = safeDays * 24 * 60 * 60 * 1000;
  const elapsedMs = Math.max(0, Date.now() - createdTime);
  const remainingMs = durationMs - elapsedMs;

  if (remainingMs <= 0) {
    return {
      scheduledText,
      remainingText: "Schedule ended",
      isEnded: true,
    };
  }

  const remDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const remHours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const remMins = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  let remainingText = "";
  if (remDays > 0) {
    remainingText = `${remDays}d ${remHours}h remaining`;
  } else if (remHours > 0) {
    remainingText = `${remHours}h ${remMins}m remaining`;
  } else {
    remainingText = `${Math.max(1, remMins)}m remaining`;
  }

  return {
    scheduledText,
    remainingText,
    isEnded: false,
  };
};

export function renderAdDetails(ad: any) {
  const formatList = (val: any) => {
    if (!val) return "None";
    if (Array.isArray(val)) return val.join(", ");
    return val.toString();
  };

  return (
    <div className={styles.adminCls_35}>
      <div className={styles.adminCls_36}>
        <div><strong>Category Type:</strong> <span className={styles.textForeground}>{ad.ad_type}</span></div>
        <div><strong>Frequency Cap:</strong> <span className={styles.textForeground}>{ad.user_frequency_cap || 1} view(s)/user</span></div>
        <div><strong>Target Views:</strong> <span className={styles.textForeground}>{ad.impressions}</span></div>
        <div><strong>Views Delivered:</strong> <span className={styles.textForeground}>{ad.impression_count ?? 0}</span></div>
        <div><strong>Campaign Duration:</strong> <span className={styles.textForeground}>{ad.campaign_days || 5} Days</span></div>
        <div><strong>Cost/Impression:</strong> <span className={styles.textForeground}>{formatCurrency(ad.cost_per_impression || ad.impression || 0)}</span></div>
        <div><strong>Total Budget:</strong> <span className={styles.textForeground}>{formatCurrency(ad.total_cost || ad.cost || 0)}</span></div>
        <div><strong>Gained Mutuals:</strong> <span className={styles.textForeground}>{ad.mutual_adds_count ?? 0}</span></div>
        <div><strong>Display Mutual+:</strong> <span style={{ color: ad.display_mutual_button ? "#10b981" : "#ef4444" }}>{ad.display_mutual_button ? "Enabled" : "Disabled"}</span></div>
        <div><strong>Target Gender:</strong> <span className={styles.textForeground}>{ad.gender || "Both"}</span></div>
      </div>

      <div className={styles.adminCls_37}>
        <div><strong>Targeting Age:</strong> <span className={styles.textForeground}>{ad.age_range ? `${ad.age_range[0]} - ${ad.age_range[1]} years` : "18 - 65 years"}</span></div>
        <div><strong>Targeting Geo:</strong> <span className={styles.textForeground}>{[ad.province, ad.state, ad.country].filter(Boolean).join(", ") || "Global"}</span></div>
        <div><strong>Targeting Employment:</strong> <span className={styles.textForeground}>{formatList(ad.employment_status)}</span></div>
        <div><strong>Targeting Industries:</strong> <span className={styles.textForeground}>{formatList(ad.industry)}</span></div>
        <div><strong>Targeting Interests:</strong> <span className={styles.textForeground}>{formatList(ad.interest)}</span></div>
        <div><strong>Targeting Lifestyle:</strong> <span className={styles.textForeground}>{formatList(ad.lifestyle)}</span></div>
        <div><strong>Targeting Behavior:</strong> <span className={styles.textForeground}>{formatList(ad.behavior)}</span></div>
        <div><strong>Targeting Personality:</strong> <span className={styles.textForeground}>{formatList(ad.personality)}</span></div>
        {ad.mutual_targets && ad.mutual_targets.length > 0 && (
          <div><strong>Mutual Targets:</strong> <span className={styles.textForeground}>{ad.mutual_targets.join(", ")}</span></div>
        )}
      </div>
    </div>
  );
}

export interface AdminAdCardProps {
  ad: any;
  isQueue?: boolean;
  campaignActionLoading: string | null;
  handleApproveAd: (ad: any) => void;
  handleRejectAd: (ad: any) => void;
  handleDeleteAd: (ad: any) => void;
  handleTogglePauseAd: (ad: any) => void;
  handleDeactivateAd: (ad: any) => void;
  setEditAdData: (ad: any) => void;
}

export const AdminAdCard = React.memo(function AdminAdCard({
  ad,
  isQueue = false,
  campaignActionLoading,
  handleApproveAd,
  handleRejectAd,
  handleDeleteAd,
  handleTogglePauseAd,
  handleDeactivateAd,
  setEditAdData,
}: AdminAdCardProps) {
  const seenCount = ad.impression_count ?? 0;
  const targetImpressions = ad.impressions ?? 1000;
  const deliveryPercent = Math.min(100, Math.round((seenCount / targetImpressions) * 100));
  const isCompleted = !!ad.completed_at || seenCount >= targetImpressions;

  const isApproved = (ad.admin_statement || "").toUpperCase().startsWith("APPROVED:") || ad.status === "approved";
  const isRejected = (ad.admin_statement || "").toUpperCase().startsWith("REJECTED:");
  const scheduleInfo = formatCampaignSchedule(ad.created_at, ad.campaign_days, false);

  const mediaUrls = ad.ad_media ? ad.ad_media.split(",").map((u: string) => u.trim()).filter(Boolean) : [];
  const hasMedia = mediaUrls.length > 0;
  const isVideo = ad.ad_media_type === "video" || (hasMedia && /\.(mp4|webm)$/i.test(mediaUrls[0]));

  return (
    <div
      className={styles.card}
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: "1.25rem",
        padding: "1.25rem",
        borderRadius: "14px",
        backgroundColor: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        opacity: ad.is_paused ? 0.82 : 1,
        marginBottom: "1.25rem",
      }}
    >
      <div className={styles.adminCls_5}>
        <AdminAdMediaBox adMedia={ad.ad_media} adMediaType={ad.ad_media_type} />
      </div>

      <div className={styles.adminCls_6}>
        <div className={styles.adminCls_7}>
          <span className={styles.adminCls_8}>
            {hasMedia ? (isVideo ? <Video size={13} /> : <ImageIcon size={13} />) : <Megaphone size={13} />}
            {hasMedia ? (isVideo ? "Video Ad" : "Image Ad") : "Text Only Ad"}
          </span>

          {isQueue ? (
            isApproved ? (
              <span className={styles.badgeApprovedPending}>
                <Clock size={13} /> Approved • Pending Payment
              </span>
            ) : isRejected ? (
              <span className={styles.badgeRejected}>
                <AlertCircle size={13} /> Rejected
              </span>
            ) : (
              <span className={styles.adminCls_9}>
                <Clock size={13} /> Status: Pending review
              </span>
            )
          ) : isCompleted ? (
            <span className={styles.badgeCompleted}>
              Approved • Paid • Completed
            </span>
          ) : ad.is_paused ? (
            <span className={styles.badgePaused}>
              Approved • Paid • Paused
            </span>
          ) : (
            <span className={styles.badgeLiveDelivering}>
              Approved • Paid &amp; Live • Delivering
            </span>
          )}

          <span className={styles.adminCls_13}>{ad.ad_type}</span>

          {(!!ad.is_bidded || Number(ad.cost_per_impression || 0) > 25) && (
            <span className={styles.adminCls_14}>
              <Zap size={13} color="#f59e0b" /> {ad.is_bidded ? "Bidded Priority" : "Boosted"} (₦{ad.cost_per_impression || ad.impression || 25}/view)
            </span>
          )}
        </div>

        <p className={styles.adminCls_15}>{ad.ad_content}</p>

        <div className={styles.adminCls_16}>
          <span>
            Publisher:{" "}
            <strong className={styles.textForeground}>
              {ad.publisher_name ? `${ad.publisher_name} (` : ""}
              {ad.publisher_handle || ad.custom_sponsor_handle || (ad.user_email ? `@${ad.user_email.split("@")[0]}` : "@user")}
              {ad.publisher_name ? ")" : ""}
            </strong>
            {ad.user_email && <span className={styles.adminCls_17}>• {ad.user_email}</span>}
          </span>
          <span>ID: <code className={styles.adminCls_18}>{ad.id}</code></span>
          <span>Created: {ad.created_at ? new Date(ad.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}</span>
        </div>

        {!isQueue && (
          <div className={styles.scheduleBox}>
            <div className={styles.scheduleItem}>
              <span>Scheduled for:</span>
              <strong>{scheduleInfo.scheduledText}</strong>
            </div>
            <div className={styles.scheduleItem}>
              <span>Remaining:</span>
              <strong style={{ color: scheduleInfo.isEnded ? "var(--text-muted)" : "#10b981" }}>
                {scheduleInfo.remainingText}
              </strong>
            </div>
            <div className={styles.scheduleItem}>
              <span>Views:</span>
              <strong>{seenCount} / {targetImpressions} ({deliveryPercent}%)</strong>
            </div>
          </div>
        )}

        <div className={styles.adminCls_19}>
          <div className={styles.adminCls_20}>
            <span>Delivery Progress</span>
            <span>{deliveryPercent}% ({seenCount} / {targetImpressions} views)</span>
          </div>
          <div className={styles.adminCls_21}>
            <div style={{ height: "100%", backgroundColor: "#1d9bf0", width: `${deliveryPercent}%`, borderRadius: "3px" }} />
          </div>
        </div>

        {ad.admin_statement && (
          <div className={styles.adminCls_22}>
            <strong className={styles.adminCls_23}>
              <AlertTriangle size={14} /> Admin Statement / Reason:
            </strong>
            {ad.admin_statement}
          </div>
        )}

        {renderAdDetails(ad)}

        <div className={styles.adminCls_24}>
          {isQueue ? (
            <>
              {isApproved ? (
                <button
                  disabled
                  className={styles.btnApprovedDisabled}
                  title="Ad is already approved and waiting for advertiser payment"
                >
                  <CheckCircle size={14} />
                  <span>Approved • Pending Payment</span>
                </button>
              ) : (
                <button
                  onClick={() => handleApproveAd(ad)}
                  disabled={!!campaignActionLoading}
                  className={styles.btnSubmit}
                  style={{ padding: "0.45rem 1.25rem", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "6px", opacity: campaignActionLoading ? 0.7 : 1 }}
                >
                  {campaignActionLoading === `approve-ad-${ad.id}` && <span className="btnSpinner" />}
                  <span>{campaignActionLoading === `approve-ad-${ad.id}` ? "Approving..." : "Approve Campaign"}</span>
                </button>
              )}
              <button
                onClick={() => handleRejectAd(ad)}
                disabled={!!campaignActionLoading}
                className={`${styles.btnAction} ${styles.btnWarning}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0.45rem 1rem", fontSize: "0.82rem", opacity: campaignActionLoading ? 0.7 : 1 }}
                title="Reject ad with feedback reason for advertiser to adjust"
              >
                {campaignActionLoading === `reject-ad-${ad.id}` && <span className="btnSpinner" />}
                <span>{campaignActionLoading === `reject-ad-${ad.id}` ? "Rejecting..." : "Reject"}</span>
              </button>
              <button
                onClick={() => handleDeleteAd(ad)}
                disabled={!!campaignActionLoading}
                className={`${styles.btnAction} ${styles.btnDanger}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0.45rem 1rem", fontSize: "0.82rem", opacity: campaignActionLoading ? 0.7 : 1 }}
                title="Permanently delete ad"
              >
                <Trash2 size={14} />
                <span>{campaignActionLoading === `delete-ad-${ad.id}` ? "Deleting..." : "Delete"}</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleTogglePauseAd(ad)}
                disabled={isCompleted || !!campaignActionLoading}
                className={styles.btnAction}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0.45rem 0.85rem", fontSize: "0.82rem", opacity: isCompleted || campaignActionLoading ? 0.7 : 1 }}
              >
                {ad.is_paused ? <Play size={14} /> : <Pause size={14} />}
                <span>{campaignActionLoading === `pause-ad-${ad.id}` ? "Updating..." : ad.is_paused ? "Resume" : "Pause"}</span>
              </button>

              <button
                onClick={() => handleDeactivateAd(ad)}
                disabled={isCompleted || !!campaignActionLoading}
                className={`${styles.btnAction} ${styles.btnDanger}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0.45rem 0.85rem", fontSize: "0.82rem", backgroundColor: "rgba(239, 68, 68, 0.12)", color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.3)", opacity: isCompleted || campaignActionLoading ? 0.7 : 1 }}
                title="Deactivate campaign and set statement for advertiser"
              >
                <AlertCircle size={14} />
                <span>{campaignActionLoading === `deactivate-ad-${ad.id}` ? "Deactivating..." : "Deactivate Ad"}</span>
              </button>

              <button onClick={() => setEditAdData(ad)} disabled={!!campaignActionLoading} className={`${styles.btnAction} ${styles.adminCls_25}`} title="Edit campaign settings">
                <Edit3 size={14} />
                <span>Edit</span>
              </button>

              <button
                onClick={() => handleDeleteAd(ad)}
                disabled={!!campaignActionLoading}
                className={`${styles.btnAction} ${styles.btnDanger}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0.45rem 0.85rem", fontSize: "0.82rem", opacity: campaignActionLoading ? 0.7 : 1 }}
                title="Permanently delete campaign"
              >
                <Trash2 size={14} />
                <span>{campaignActionLoading === `delete-ad-${ad.id}` ? "Deleting..." : "Delete"}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export interface AdminHighlightCardProps {
  highlight: any;
  isQueue?: boolean;
  campaignActionLoading: string | null;
  handleApproveHighlight: (hl: any) => void;
  handleRejectHighlight: (hl: any) => void;
  handleDeleteHighlight: (hl: any) => void;
  handleTogglePauseHighlight: (hl: any) => void;
  setEditHighlightData: (hl: any) => void;
}

export const AdminHighlightCard = React.memo(function AdminHighlightCard({
  highlight,
  isQueue = false,
  campaignActionLoading,
  handleApproveHighlight,
  handleRejectHighlight,
  handleDeleteHighlight,
  handleTogglePauseHighlight,
  setEditHighlightData,
}: AdminHighlightCardProps) {
  const isApproved = (highlight.admin_statement || "").toUpperCase().startsWith("APPROVED:") || highlight.status === "approved";
  const isRejected = (highlight.admin_statement || "").toUpperCase().startsWith("REJECTED:");
  const scheduleInfo = formatCampaignSchedule(highlight.created_at, highlight.campaign_days || 1, true);

  return (
    <div className={styles.card} style={{ opacity: highlight.is_paused ? 0.75 : 1 }}>
      <div className={styles.mediaBox}>
        <img
          src={highlight.image_url || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60"}
          alt="Highlight cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60";
          }}
        />
        <span className={styles.badgeCategory}>{highlight.interest}</span>

        {isQueue ? (
          isApproved ? (
            <span className={`${styles.badgeStatus} ${styles.badgeApprovedPending}`} style={{ top: "0.85rem", right: "0.85rem" }}>
              Approved • Pending Payment
            </span>
          ) : isRejected ? (
            <span className={`${styles.badgeStatus} ${styles.badgeRejected}`} style={{ top: "0.85rem", right: "0.85rem" }}>
              Rejected
            </span>
          ) : (
            <span className={`${styles.badgeStatus} ${styles.adminCls_26}`} style={{ top: "0.85rem", right: "0.85rem" }}>
              Status: Pending review
            </span>
          )
        ) : highlight.is_paused ? (
          <span className={`${styles.badgeStatus} ${styles.badgePaused}`} style={{ top: "0.85rem", right: "0.85rem" }}>
            Approved • Paid • Paused
          </span>
        ) : scheduleInfo.isEnded ? (
          <span className={`${styles.badgeStatus} ${styles.badgeCompleted}`} style={{ top: "0.85rem", right: "0.85rem" }}>
            Approved • Paid • Completed
          </span>
        ) : (
          <span className={`${styles.badgeStatus} ${styles.badgeLiveDelivering}`} style={{ top: "0.85rem", right: "0.85rem" }}>
            Approved • Paid &amp; Live • Delivering
          </span>
        )}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.adminCls_29}>
          <h4 className={`${styles.cardTitle} ${styles.mZero}`}>{highlight.title}</h4>
          {(!!highlight.is_bidded || Number(highlight.bid_price || 0) > 1000) && (
            <span className={styles.adminCls_30}>
              <Zap size={10} color="#f59e0b" /> ₦{highlight.bid_price || 1500}/day
            </span>
          )}
        </div>
        <p className={`${styles.cardText} ${styles.adminCls_31}`}>{highlight.content}</p>

        {!isQueue && (
          <div className={styles.scheduleBox}>
            <div className={styles.scheduleItem}>
              <span>Scheduled:</span>
              <strong>{scheduleInfo.scheduledText}</strong>
            </div>
            <div className={styles.scheduleItem}>
              <span>Remaining:</span>
              <strong style={{ color: scheduleInfo.isEnded ? "var(--text-muted)" : "#10b981" }}>
                {scheduleInfo.remainingText}
              </strong>
            </div>
          </div>
        )}

        {highlight.admin_statement && (
          <div className={styles.adminCls_32}>
            <strong>Notice:</strong> {highlight.admin_statement}
          </div>
        )}

        <div className={styles.adminCls_33}>
          <span>
            Publisher:{" "}
            <strong className={styles.textForeground}>
              {highlight.publisher_name ? `${highlight.publisher_name} (` : ""}
              {highlight.publisher_handle || highlight.custom_sponsor_handle || (highlight.user_email ? `@${highlight.user_email.split("@")[0]}` : "@user")}
              {highlight.publisher_name ? ")" : ""}
            </strong>
            {highlight.user_email && <span className={styles.adminCls_17}>• {highlight.user_email}</span>}
          </span>
          <span>{highlight.created_at ? `Created: ${new Date(highlight.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""} · {highlight.country || "Global"} {highlight.state ? `(${highlight.state}${highlight.province ? `, ${highlight.province}` : ""})` : ""}</span>
        </div>
      </div>

      <div className={styles.cardFooterActions}>
        {isQueue ? (
          <>
            {isApproved ? (
              <button
                disabled
                className={styles.btnApprovedDisabled}
                style={{ flex: 1 }}
                title="Highlight is already approved and waiting for advertiser payment"
              >
                <CheckCircle size={14} />
                <span>Approved • Pending Payment</span>
              </button>
            ) : (
              <button
                onClick={() => handleApproveHighlight(highlight)}
                disabled={!!campaignActionLoading}
                className={styles.btnSubmit}
                style={{ flex: 1, padding: "0.5rem", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", opacity: campaignActionLoading ? 0.7 : 1 }}
              >
                {campaignActionLoading === `approve-hl-${highlight.id}` && <span className="btnSpinner" />}
                <span>{campaignActionLoading === `approve-hl-${highlight.id}` ? "Approving..." : "Approve Highlight"}</span>
              </button>
            )}
            <button
              onClick={() => handleRejectHighlight(highlight)}
              disabled={!!campaignActionLoading}
              className={`${styles.btnAction} ${styles.btnWarning}`}
              style={{ padding: "0.5rem 0.9rem", display: "inline-flex", alignItems: "center", gap: "4px", opacity: campaignActionLoading ? 0.7 : 1 }}
              title="Reject highlight with feedback reason for advertiser to adjust"
            >
              {campaignActionLoading === `reject-hl-${highlight.id}` && <span className="btnSpinner" />}
              <span>{campaignActionLoading === `reject-hl-${highlight.id}` ? "Rejecting..." : "Reject"}</span>
            </button>
            <button
              onClick={() => handleDeleteHighlight(highlight)}
              disabled={!!campaignActionLoading}
              className={`${styles.btnAction} ${styles.btnDanger}`}
              style={{ padding: "0.5rem 0.9rem", display: "inline-flex", alignItems: "center", gap: "4px", opacity: campaignActionLoading ? 0.7 : 1 }}
              title="Permanently delete highlight"
            >
              <Trash2 size={14} />
              <span>{campaignActionLoading === `delete-hl-${highlight.id}` ? "Deleting..." : "Delete"}</span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => handleTogglePauseHighlight(highlight)}
              disabled={!!campaignActionLoading}
              className={styles.btnAction}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", opacity: campaignActionLoading ? 0.7 : 1 }}
            >
              {highlight.is_paused ? <Play size={14} /> : <Pause size={14} />}
              <span>{campaignActionLoading === `pause-hl-${highlight.id}` ? "Updating..." : highlight.is_paused ? "Resume" : "Pause"}</span>
            </button>
            <button onClick={() => setEditHighlightData(highlight)} disabled={!!campaignActionLoading} className={`${styles.btnAction} ${styles.adminCls_34}`} title="Edit highlight">
              <Edit3 size={14} />
            </button>
            <button
              onClick={() => handleDeleteHighlight(highlight)}
              disabled={!!campaignActionLoading}
              className={`${styles.btnAction} ${styles.btnDanger}`}
              style={{ padding: "0.5rem", opacity: campaignActionLoading ? 0.7 : 1 }}
              title="Delete highlight"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
});
