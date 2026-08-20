import React, { useEffect } from "react";
import styles from "./AdCard.module.css";
import { Ad } from "./AdCard";

interface HighlightCardProps {
  ad: Ad;
  style?: React.CSSProperties;
  formatTimestamp: (timestamp: string | null | undefined) => string;
}

const HighlightCard: React.FC<HighlightCardProps> = ({ ad, style, formatTimestamp }) => {
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

  const [aspectRatio, setAspectRatio] = React.useState<number>(1.777);

  return (
    <div key={`hl-${ad.id}`} className={styles.card} style={style}>
      {/* Left Column: Avatar Icon */}
      <div className={styles.avatarCol}>
        <div
          className={styles.avatar}
          style={{
            backgroundColor: "var(--primary)",
            color: "#ffffff",
            fontWeight: "800",
          }}
        >
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
          </div>
          <span
            className={styles.sponsorLabel}
            style={{ color: "var(--primary)", fontWeight: "700" }}
          >
            Highlight
          </span>
        </div>

        <p className={styles.adText}>{ad.ad_content}</p>

        {ad.ad_media && (
          <div className={styles.mediaBox} style={{ aspectRatio: `${aspectRatio}` }}>
            <img
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
    </div>
  );
};

export default React.memo(HighlightCard);
