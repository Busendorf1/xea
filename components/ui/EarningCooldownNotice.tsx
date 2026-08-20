"use client";

import React, { useState, useEffect } from "react";
import styles from "./AdCard.module.css";

export interface EarningCooldownNoticeProps {
  cooldownUntil: string | Date | null;
  cooldownType?: "pacing_15m" | "review_hours" | null;
  className?: string;
}

/**
 * Dedicated, modular component for rendering real-time live ticking
 * earning cooldown status notices.
 * 
 * Adheres strictly to requirements:
 * - NO icons or emojis
 * - Ultra-compact, clean typography designed to fit within the action bar
 * - Dynamic live countdown (15m...1m...shortly, 48h...12h...1h)
 */
export default function EarningCooldownNotice({
  cooldownUntil,
  cooldownType,
  className,
}: EarningCooldownNoticeProps) {
  const [timeLeftText, setTimeLeftText] = useState<string>("");

  useEffect(() => {
    if (!cooldownUntil) {
      setTimeLeftText("");
      return;
    }

    const calculateRemainingTime = () => {
      const targetTime = new Date(cooldownUntil).getTime();
      const now = Date.now();
      const diffMs = targetTime - now;

      if (diffMs <= 0) {
        setTimeLeftText("Earning resumes shortly.");
        return;
      }

      const totalMinutes = Math.ceil(diffMs / (1000 * 60));
      const totalHours = Math.ceil(diffMs / (1000 * 60 * 60));

      if (cooldownType === "pacing_15m" || totalMinutes <= 60) {
        if (totalMinutes <= 1) {
          setTimeLeftText("Pacing limit reached. Earning resumes in 1m.");
        } else {
          setTimeLeftText(`Pacing limit reached. Earning resumes in ${totalMinutes}m.`);
        }
      } else {
        // Extended review mode (hours format: 12-72h)
        if (totalHours <= 1) {
          setTimeLeftText("Account under review. Earning paused for 1h.");
        } else {
          setTimeLeftText(`Account under review. Earning paused for ${totalHours}h.`);
        }
      }
    };

    // Calculate immediately on mount
    calculateRemainingTime();

    // Update every 10 seconds for live accuracy
    const interval = setInterval(calculateRemainingTime, 10000);
    return () => clearInterval(interval);
  }, [cooldownUntil, cooldownType]);

  if (!timeLeftText) return null;

  return (
    <div className={`${styles.cooldownNoticeBox} ${className || ""}`} title="Earning Cooldown Active">
      <span className={styles.cooldownNoticeText}>{timeLeftText}</span>
    </div>
  );
}
