"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, XCircle } from "lucide-react";
import { showAppleAlert } from "@/components/ui/AppleAlert";
import styles from "./page.module.css";

interface AudienceRatingModalProps {
  ratingAdId: string | null;
  onClose: () => void;
  onSuccess: (adId: string) => void;
}

export default function AudienceRatingModal({
  ratingAdId,
  onClose,
  onSuccess,
}: AudienceRatingModalProps) {
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [ratingSubmitting, setRatingSubmitting] = useState<boolean>(false);

  return (
    <AnimatePresence>
      {ratingAdId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={styles.modalOverlay}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={`${styles.modalContent} ${styles.ratingModalContainer}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.ratingModalHeader}>
              <div className={styles.ratingModalHeaderLeft}>
                <Star size={20} fill="var(--primary)" color="var(--primary)" />
                <h3 className={styles.ratingModalTitle}>Rate Audience Engagement</h3>
              </div>
              <button className={styles.modalClose} onClick={onClose}>
                <XCircle size={22} />
              </button>
            </div>

            <p className={styles.ratingModalSubtitle}>
              How well did the audience engage with your ad? Your 1 to 5 star rating adds Attention Score points to all participating viewers.
            </p>

            {/* Interactive Star Picker (Google A11y & Material 3 Touch Standards) */}
            <div
              className={styles.starPicker}
              role="radiogroup"
              aria-label="Rate audience engagement"
              onMouseLeave={() => setHoveredStar(null)}
            >
              {[1, 2, 3, 4, 5].map((star) => {
                const effectiveStar = hoveredStar !== null ? hoveredStar : ratingStars;
                const isFilled = effectiveStar >= star;
                return (
                  <motion.button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={ratingStars === star}
                    aria-label={`${star} star${star > 1 ? "s" : ""}`}
                    onClick={() => {
                      setRatingStars(star);
                      try {
                        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                          navigator.vibrate(15);
                        }
                      } catch {}
                    }}
                    onMouseEnter={() => setHoveredStar(star)}
                    whileTap={{ scale: 1.25 }}
                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    className={`${styles.starBtn} ${isFilled ? styles.starSelected : ""}`}
                  >
                    <Star
                      size={32}
                      fill={isFilled ? "var(--primary)" : "transparent"}
                      color={isFilled ? "var(--primary)" : "var(--card-border)"}
                    />
                  </motion.button>
                );
              })}
            </div>

            <div className={styles.starLabel}>
              {hoveredStar !== null ? hoveredStar : ratingStars} Star{(hoveredStar !== null ? hoveredStar : ratingStars) > 1 ? "s" : ""} ({(hoveredStar !== null ? hoveredStar : ratingStars) * 20}% Engagement Quality)
            </div>

            <button
              type="button"
              className={`${styles.boostBtn} ${styles.boostLaunchBtn}`}
              disabled={ratingSubmitting}
              onClick={async () => {
                if (!ratingAdId) return;
                const targetAdId = ratingAdId;
                const starsToSubmit = ratingStars;

                // 1. Instant optimistic update + immediate modal close
                onSuccess(targetAdId);
                onClose();
                setHoveredStar(null);

                // 2. Dispatch non-blocking Top-Level Toast HUD with tactile haptics
                showAppleAlert(
                  `Submitted ${starsToSubmit}-Star rating. Audience Attention Scores updated!`,
                  "success",
                  "Audience Rated"
                );

                // 3. Asynchronously persist to server
                try {
                  setRatingSubmitting(true);
                  const res = await fetch("/api/campaigns/rate-listeners", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ad_id: targetAdId, star_rating: starsToSubmit }),
                  });
                  const data = await res.json();
                  if (!res.ok && res.status !== 409) {
                    throw new Error(data.error || "Failed to submit rating");
                  }
                } catch (err: any) {
                  console.warn("⚠️ Rating submission warning:", err?.message || err);
                } finally {
                  setRatingSubmitting(false);
                }
              }}
            >
              {ratingSubmitting ? "Submitting Rating..." : `Submit ${ratingStars}-Star Rating`}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
