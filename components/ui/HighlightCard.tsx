import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./AdCard.module.css";
import { Ad } from "./AdCard";

interface HighlightCardProps {
  ad: Ad;
  style?: React.CSSProperties;
  formatTimestamp: (timestamp: string | null | undefined) => string;
}

const HighlightCard: React.FC<HighlightCardProps> = ({ ad, style, formatTimestamp }) => {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [swipeOffsetY, setSwipeOffsetY] = useState(0);
  const touchStartYRef = React.useRef<number | null>(null);

  useEffect(() => {
    if (ad.is_highlight && ad.id) {
      const recordedKey = `hl_impression_${ad.id}`;
      if (typeof window !== "undefined" && !sessionStorage.getItem(recordedKey)) {
        sessionStorage.setItem(recordedKey, "1");
        fetch("/api/highlights/impression", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ highlightId: ad.id }),
        }).catch((err) => console.error("Failed to record highlight impression:", err));
      }
    }
  }, [ad.is_highlight, ad.id]);

  useEffect(() => {
    if (!isLightboxOpen || typeof window === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsLightboxOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLightboxOpen]);

  const [aspectRatio, setAspectRatio] = React.useState<number>(1.0);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  React.useEffect(() => {
    if (!ad.ad_media) return;
    const applyRatio = (w: number, h: number) => {
      if (w > 0 && h > 0) {
        const rawRatio = w / h;
        const clamped = Math.min(Math.max(rawRatio, 0.8), 2.0);
        setAspectRatio((prev) => (prev === clamped ? prev : clamped));
        return true;
      }
      return false;
    };

    if (imgRef.current && imgRef.current.complete) {
      if (applyRatio(imgRef.current.naturalWidth, imgRef.current.naturalHeight)) {
        return;
      }
    }

    const probe = new Image();
    probe.src = ad.ad_media;
    if (probe.complete) {
      applyRatio(probe.naturalWidth, probe.naturalHeight);
    } else {
      probe.onload = () => {
        applyRatio(probe.naturalWidth, probe.naturalHeight);
      };
    }
  }, [ad.ad_media]);

  return (
    <div key={`hl-${ad.id}`} className={styles.card} style={style}>
      {/* Left Column: Avatar Icon */}
      <div className={styles.avatarCol}>
        <div className={`${styles.avatar} ${styles.highlightAvatar}`}>
          HL
        </div>
      </div>

      {/* Right Column: Content */}
      <div className={styles.contentCol}>
        <div className={styles.tweetHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.sponsorName}>{ad.title}</span>
            <span className={styles.dot}>·</span>
            <span className={styles.adTime}>
              {formatTimestamp(ad.created_at)}
            </span>
            {(ad.is_ai_content || (ad as any).is_ai || (ad as any).isAiContent) && (
              <>
                <span className={styles.dot}>·</span>
                <span className={styles.aiBadge} title="AI-generated or AI-assisted content">
                  AI Content
                </span>
              </>
            )}
          </div>
          <span className={`${styles.sponsorLabel} ${styles.highlightLabel}`}>
            Highlight
          </span>
        </div>

        <p className={styles.adText}>{ad.ad_content}</p>

        {ad.ad_media && (
          <div
            className={styles.mediaBox}
            style={{ aspectRatio: `${aspectRatio}`, cursor: "pointer" }}
            role="button"
            tabIndex={0}
            aria-label="Open highlight media viewer"
            onClick={(e) => {
              e.stopPropagation();
              setIsLightboxOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setIsLightboxOpen(true);
              }
            }}
          >
            <img
              ref={imgRef}
              src={ad.ad_media}
              alt="Highlight Cover"
              className={styles.adImgElement}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  const rawRatio = img.naturalWidth / img.naturalHeight;
                  const clamped = Math.min(Math.max(rawRatio, 0.8), 2.0);
                  setAspectRatio(clamped);
                }
              }}
            />
          </div>
        )}
      </div>

      {isLightboxOpen &&
        ad.ad_media &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={styles.lightboxOverlay}
            role="dialog"
            aria-modal="true"
            aria-label="Highlight media viewer"
            onClick={() => setIsLightboxOpen(false)}
          >
            <div
              className={styles.lightboxDialog}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.lightboxTopBar}>
                <button
                  type="button"
                  className={styles.lightboxIconBtn}
                  onClick={() => setIsLightboxOpen(false)}
                  aria-label="Back to feed"
                  title="Close"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                </button>
                <span className={styles.lightboxSlidePill}>Highlight</span>
                <div style={{ width: 42 }} />
              </div>

              <div
                className={styles.lightboxStage}
                style={{
                  transform:
                    swipeOffsetY !== 0
                      ? `translate3d(0, ${swipeOffsetY}px, 0) scale(${Math.max(0.86, 1 - Math.abs(swipeOffsetY) / 900)})`
                      : undefined,
                  opacity: swipeOffsetY !== 0 ? Math.max(0.35, 1 - Math.abs(swipeOffsetY) / 380) : 1,
                  transition: swipeOffsetY === 0 ? "transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s ease" : "none",
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setSwipeOffsetY(0);
                    setIsLightboxOpen(false);
                  }
                }}
                onTouchStart={(e) => {
                  if (e.touches.length === 1) {
                    touchStartYRef.current = e.touches[0].clientY;
                  }
                }}
                onTouchMove={(e) => {
                  if (touchStartYRef.current !== null && e.touches.length === 1) {
                    const dy = e.touches[0].clientY - touchStartYRef.current;
                    if (Math.abs(dy) > 10) setSwipeOffsetY(dy);
                  }
                }}
                onTouchEnd={(e) => {
                  if (touchStartYRef.current !== null && e.changedTouches.length > 0) {
                    const dy = e.changedTouches[0].clientY - touchStartYRef.current;
                    touchStartYRef.current = null;
                    if (Math.abs(dy) > 65) {
                      setSwipeOffsetY(0);
                      setIsLightboxOpen(false);
                      return;
                    }
                    setSwipeOffsetY(0);
                  }
                }}
              >
                <img
                  src={ad.ad_media}
                  alt={ad.title || "Highlight Media"}
                  className={styles.lightboxImage}
                />
              </div>

              <div className={styles.lightboxBottomBar}>
                <div className={styles.lightboxBottomInner}>
                  {ad.ad_content && (
                    <p className={styles.lightboxCaption}>{ad.ad_content}</p>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default React.memo(HighlightCard);
