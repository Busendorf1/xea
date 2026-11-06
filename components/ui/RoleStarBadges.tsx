"use client";

import React from "react";
import { Star } from "lucide-react";
import { getSpecialRoleProfile } from "@/lib/adminHelper";
import styles from "./RoleStarBadges.module.css";

export interface RoleStarBadgesProps {
  email?: string | null;
  isCareer?: boolean | null;
  isAffiliate?: boolean | null;
  affiliateRole?: string | null;
  size?: number;
  variant?: "profile" | "compact";
  showLabels?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders small, crisp vector Star icons (via Lucide React) for:
 * - Career Badge: Purple Star (earns 0%)
 * - Affiliate Badge: Yellow / Gold Star (earns 10% platform share)
 *
 * Only the stars are shown by default (no inline text pills).
 * The role title is revealed on hover via a floating tooltip.
 * Strictly used on User Profile Dashboards and Admin Dashboards (never on Advertiser Info Modal).
 */
export default function RoleStarBadges({
  email,
  isCareer,
  isAffiliate,
  affiliateRole,
  size,
  variant = "profile",
  showLabels = false,
  className = "",
  style = {},
}: RoleStarBadgesProps) {
  const resolved = getSpecialRoleProfile(email, {
    is_career: isCareer,
    is_affiliate: isAffiliate,
    affiliate_role: affiliateRole,
  });

  if (!resolved.isCareer && !resolved.isAffiliate) {
    return null;
  }

  const effectiveSize = size || (variant === "compact" ? 14 : 16);
  const roleText = (resolved.affiliateRole || "Platform Affiliate").trim();

  return (
    <span
      className={`${styles.container} ${className}`.trim()}
      style={style}
      aria-label="Account Badges"
    >
      {/* Career Badge: Purple Star (earns 0%) */}
      {resolved.isCareer && (
        <span
          className={styles.starItem}
          title="Career"
          aria-label="Career"
        >
          <Star
            size={effectiveSize}
            className={styles.starPurple}
            aria-hidden="true"
          />
          <span className={styles.tooltip} role="tooltip">
            Career
          </span>
          {showLabels && <span className={styles.labelPurple}>Career</span>}
        </span>
      )}

      {/* Affiliate Badge: Yellow Star (earns 10% platform share) */}
      {resolved.isAffiliate && (
        <span
          className={styles.starItem}
          title={roleText}
          aria-label={roleText}
        >
          <Star
            size={effectiveSize}
            className={styles.starGold}
            aria-hidden="true"
          />
          <span className={styles.tooltip} role="tooltip">
            {roleText}
          </span>
          {showLabels && <span className={styles.labelGold}>{roleText}</span>}
        </span>
      )}
    </span>
  );
}
