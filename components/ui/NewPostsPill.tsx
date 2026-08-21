"use client";

import React from "react";
import styles from "./NewPostsPill.module.css";

interface NewPostsPillProps {
  count: number;
  label?: string;
  onClick: () => void;
}

/**
 * Minimalist Floating Indicator Pill for Real-Time Incoming Feed Posts
 * Strict clean typography — zero emojis, zero icons.
 */
export default function NewPostsPill({ count, label, onClick }: NewPostsPillProps) {
  if (count <= 0) return null;

  const displayLabel = label || (count >= 3 ? "3+ Ads" : `${count} New ${count === 1 ? "Ad" : "Ads"}`);

  return (
    <div className={styles.pillContainer}>
      <button
        type="button"
        className={styles.pillButton}
        onClick={onClick}
        aria-label={displayLabel}
      >
        {displayLabel}
      </button>
    </div>
  );
}
