"use client";

import React from "react";
import styles from "../Feed/page.module.css";

interface PullIndicatorProps {
  pullDistance: number;
  isPullRefreshing: boolean;
  isActivelyPulling: boolean;
}

export const FeedPullIndicator: React.FC<PullIndicatorProps> = ({
  pullDistance,
  isPullRefreshing,
  isActivelyPulling,
}) => {
  if (pullDistance <= 0 && !isPullRefreshing) return null;

  return (
    <div
      className={styles.pullIndicator}
      style={{
        transform: `translate3d(-50%, ${Math.min(pullDistance, 70)}px, 0)`,
        opacity: isPullRefreshing ? 1 : Math.min(pullDistance / 35, 1),
        transition: isActivelyPulling
          ? "none"
          : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease",
      }}
      aria-hidden="true"
    >
      <div className={styles.pullBubble}>
        {isPullRefreshing ? (
          <div className={styles.pullSpinner} />
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: `rotate(${Math.min(pullDistance * 4.5, 360)}deg)`,
              transition: isActivelyPulling ? "none" : "transform 0.2s ease",
            }}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        )}
      </div>
    </div>
  );
};

export const FeedErrorState: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className={styles.errorContainer}>
    <p className={`${styles.error} ${styles.errorMessage}`}>Unable to load ads right now.</p>
    <button
      onClick={onRetry}
      className={`${styles.loadMoreBtn} ${styles.errorRetryBtn}`}
    >
      Try Again
    </button>
  </div>
);

export const FeedLocationSkippedState: React.FC = () => (
  <div style={{ textAlign: "center", padding: "48px 20px" }}>
    <p className={styles.noAds} style={{ fontSize: "1.05rem", fontWeight: 600 }}>
      Enable location to see your feed
    </p>
    <p
      style={{
        fontSize: "0.85rem",
        color: "var(--muted-foreground, #888)",
        marginTop: "8px",
        maxWidth: "420px",
        marginLeft: "auto",
        marginRight: "auto",
        lineHeight: 1.5,
      }}
    >
      Sponsored content and local community offers are matched to your area. You skipped location
      verification, so your feed is empty. Tap below to enable location.
    </p>
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          try {
            localStorage.removeItem("paayh_proof_of_location_active");
            sessionStorage.removeItem("paayh_location_skipped");
          } catch {}
          window.dispatchEvent(new CustomEvent("paayh:open_location_modal"));
        }
      }}
      style={{
        marginTop: "16px",
        padding: "10px 24px",
        borderRadius: "9999px",
        background: "var(--foreground, #111)",
        color: "var(--background, #fff)",
        fontSize: "0.85rem",
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      Enable Location
    </button>
  </div>
);

export const FeedSharedAdBanner: React.FC<{
  onExit: () => void;
}> = ({ onExit }) => (
  <div
    data-testid="shared-ad-banner"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      padding: "10px 14px",
      marginBottom: "12px",
      borderRadius: "12px",
      border: "1px solid var(--border, rgba(128,128,128,0.22))",
      background: "var(--muted, rgba(128,128,128,0.08))",
      fontSize: "0.85rem",
    }}
  >
    <span style={{ fontWeight: 600 }}>Viewing shared ad</span>
    <button
      type="button"
      onClick={onExit}
      style={{
        padding: "6px 14px",
        borderRadius: "9999px",
        background: "var(--foreground, #111)",
        color: "var(--background, #fff)",
        fontSize: "0.8rem",
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
      }}
    >
      Browse full feed
    </button>
  </div>
);

export const FeedSharedAdUnavailableState: React.FC<{
  onBrowseFeed: () => void;
}> = ({ onBrowseFeed }) => (
  <div
    data-testid="shared-ad-unavailable"
    style={{
      textAlign: "center",
      padding: "48px 20px",
      borderRadius: "16px",
      border: "1px solid var(--border, rgba(128,128,128,0.2))",
      marginTop: "12px",
    }}
  >
    <p className={styles.noAds} style={{ fontSize: "1.05rem", fontWeight: 600 }}>
      This ad is no longer available
    </p>
    <p
      style={{
        fontSize: "0.85rem",
        color: "var(--muted-foreground, #888)",
        marginTop: "8px",
        maxWidth: "420px",
        marginLeft: "auto",
        marginRight: "auto",
        lineHeight: 1.5,
      }}
    >
      This shared campaign may have expired, completed, or been paused by the advertiser.
    </p>
    <button
      type="button"
      onClick={onBrowseFeed}
      style={{
        marginTop: "16px",
        padding: "10px 24px",
        borderRadius: "9999px",
        background: "var(--foreground, #111)",
        color: "var(--background, #fff)",
        fontSize: "0.85rem",
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      Browse full feed
    </button>
  </div>
);

export const FeedEmptyInventoryState: React.FC = () => (
  <div style={{ textAlign: "center", padding: "48px 20px" }}>
    <p className={styles.noAds} style={{ fontSize: "1.05rem", fontWeight: 600 }}>
      No active ad campaigns available right now.
    </p>
    <p
      style={{
        fontSize: "0.85rem",
        color: "var(--muted-foreground, #888)",
        marginTop: "8px",
        maxWidth: "420px",
        marginLeft: "auto",
        marginRight: "auto",
        lineHeight: 1.5,
      }}
    >
      You&apos;re all caught up! Check back soon for new campaigns targeted to your area.
    </p>
  </div>
);

export const FeedScrollTopButton: React.FC<{ visible: boolean; onClick: () => void }> = ({
  visible,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`${styles.scrollTopBtn} ${visible ? styles.scrollTopBtnVisible : ""}`}
    aria-label="Scroll to top (latest feed)"
    title="Back to top"
  >
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  </button>
);
