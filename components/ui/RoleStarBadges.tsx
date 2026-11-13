"use client";

import React, { useEffect, useRef, useState } from "react";
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
  onBadgeClick?: (roleKey: "career" | "affiliate", label: string) => void;
  suppressTooltip?: boolean;
}

/**
 * Renders small, crisp vector Star icons (via Lucide React) for:
 * - Career Badge: Purple Star (earns 0%)
 * - Affiliate Badge: Yellow / Gold Star (earns 10% platform share)
 *
 * Only the stars are shown by default (no inline text pills).
 * The role title is revealed on hover via a floating tooltip, or via onBadgeClick
 * when rendered inside constrained modals.
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
  onBadgeClick,
  suppressTooltip = false,
}: RoleStarBadgesProps) {
  const [activeRole, setActiveRole] = useState<"career" | "affiliate" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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

  const handleActivate = (
    e: React.MouseEvent | React.KeyboardEvent,
    roleKey: "career" | "affiliate",
    label: string
  ) => {
    e.stopPropagation();
    if (onBadgeClick) {
      onBadgeClick(roleKey, label);
      return;
    }
    if (suppressTooltip) return;
    setActiveRole((prev) => (prev === roleKey ? null : roleKey));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setActiveRole((prev) => (prev === roleKey ? null : prev));
    }, 2500);
  };

  return (
    <span
      className={`${styles.container} ${className}`.trim()}
      style={style}
      aria-label="Account Badges"
    >
      {/* Career Badge: Purple Star (earns 0%) */}
      {resolved.isCareer && (
        <span
          className={`${styles.starItem} ${!suppressTooltip && activeRole === "career" ? styles.starItemActive : ""}`.trim()}
          title="Career"
          aria-label="Career"
          role="button"
          tabIndex={0}
          onClick={(e) => handleActivate(e, "career", "Career")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleActivate(e, "career", "Career");
            }
          }}
        >
          <Star
            size={effectiveSize}
            className={styles.starPurple}
            aria-hidden="true"
          />
          {!suppressTooltip && (
            <span className={styles.tooltip} role="tooltip">
              Career
            </span>
          )}
          {showLabels && <span className={styles.labelPurple}>Career</span>}
        </span>
      )}

      {/* Affiliate Badge: Yellow Star (earns 10% platform share) */}
      {resolved.isAffiliate && (
        <span
          className={`${styles.starItem} ${!suppressTooltip && activeRole === "affiliate" ? styles.starItemActive : ""}`.trim()}
          title={roleText}
          aria-label={roleText}
          role="button"
          tabIndex={0}
          onClick={(e) => handleActivate(e, "affiliate", roleText)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleActivate(e, "affiliate", roleText);
            }
          }}
        >
          <Star
            size={effectiveSize}
            className={styles.starGold}
            aria-hidden="true"
          />
          {!suppressTooltip && (
            <span className={styles.tooltip} role="tooltip">
              {roleText}
            </span>
          )}
          {showLabels && <span className={styles.labelGold}>{roleText}</span>}
        </span>
      )}
    </span>
  );
}
