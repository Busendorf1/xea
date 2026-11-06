"use client";

import React from "react";
import { Star } from "lucide-react";
import styles from "./AffiliateSystem.module.css";

export interface AffiliateBadgeDisplayProps {
  roleTitle?: string | null;
  size?: number;
  className?: string;
  showTooltip?: boolean;
}

export function AffiliateBadgeDisplay({
  roleTitle = "Platform Affiliate",
  size = 14,
  className = "",
  showTooltip = true,
}: AffiliateBadgeDisplayProps) {
  const displayTitle = roleTitle?.trim() || "Platform Affiliate";

  return (
    <span
      className={`${styles.badgeWrap} ${className}`}
      aria-label={displayTitle}
      tabIndex={0}
    >
      <Star size={size} className={styles.starIcon} />
      {showTooltip && (
        <span className={styles.tooltip} role="tooltip">
          {displayTitle}
        </span>
      )}
    </span>
  );
}

export default AffiliateBadgeDisplay;
