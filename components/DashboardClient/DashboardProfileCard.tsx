"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Avatar from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { resolveAtwTier, getAtwBalanceLimit } from "@/lib/attentionTierEngine";
import { UserProfile } from "./types";
import styles from "./page.module.css";

interface DashboardProfileCardProps {
  user: UserProfile;
  formatCurrency: (amount: number | string) => string;
  onSelectTab: (tab: string) => void;
}

export default function DashboardProfileCard({
  user,
  formatCurrency,
  onSelectTab,
}: DashboardProfileCardProps) {
  const [showAtwTooltip, setShowAtwTooltip] = useState(false);

  const clicksCount = user.monetization_clicks ?? 0;
  const isMonetized = Boolean(
    user.monetized === "yes" ||
      user.monetized === "true" ||
      user.monetized === true ||
      clicksCount >= 300
  );
  const progressPct = Math.min(100, Math.round((clicksCount / 300) * 100));

  const ago = (() => {
    if (!user.lastUpdated) return "Recently";
    const diffMs = Date.now() - new Date(user.lastUpdated).getTime();
    if (isNaN(diffMs) || diffMs < 0) return "Recently";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(user.lastUpdated).toLocaleDateString();
  })();

  // ATW Tier calculations
  const score = Number(user.attention_worth_score ?? 0);
  const tier = resolveAtwTier(score);
  const balanceCap = getAtwBalanceLimit(tier.code);
  const currentBal = Number(user.balance ?? 0);
  const ratio = Math.min(1, Math.max(0, currentBal / (balanceCap || 30000)));
  const pct = Math.round(ratio * 100);

  let stateColor = "var(--foreground)";
  if (ratio >= 0.9) {
    stateColor = "#ef4444";
  } else if (ratio >= 0.6) {
    stateColor = "var(--text-muted)";
  }

  // Circular gauge geometry
  const radius = 7;
  const circ = 2 * Math.PI * radius;
  const strokeOffset = circ - ratio * circ;

  return (
    <div className={styles.profileCard}>
      <div className={styles.profileBanner}></div>
      <div className={styles.avatarRow}>
        <div className={styles.profileImgContainer}>
          <Avatar
            src={user.profileImage}
            name={user.business_name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username}
            email={user.email}
            size={70}
            alt="Profile picture"
            gender={user.gender}
          />
        </div>
        <Link href="/logged-in" onClick={() => onSelectTab("profile")} className={styles.editProfileBtn}>
          Edit profile
        </Link>
      </div>

      <div className={styles.profileInfo}>
        <h4 className={styles.profileName}>
          <span>
            {user.business_name && user.business_name.trim() !== ""
              ? user.business_name
              : `${user.firstName} ${user.lastName}`}
          </span>
          {isMonetized && <VerifiedBadge size={21} title="Verified Partner" />}
        </h4>
        <p className={styles.usernameText}>@{user.username.split("@")[0]}</p>

        {user.business_name && user.business_name.trim() !== "" && (
          <p className={styles.detailItem}>
            Representative: {user.firstName} {user.lastName}
          </p>
        )}

        <p className={styles.profileBio}>{user.bio || "No bio set yet."}</p>

        <div className={styles.profileDetails}>
          <div className={styles.detailItem}>
            <svg viewBox="0 0 24 24" className={styles.detailIcon}>
              <path
                d="M19.708 7.375c-.11-.58-.345-1.13-.683-1.605l.015.018c-.675-.86-1.72-1.39-2.89-1.39h-8.3c-1.17 0-2.215.53-2.89 1.39l.015-.018c-.338.475-.573 1.025-.683 1.605l-.015-.008v9.25c0 1.93 1.57 3.5 3.5 3.5h8.3c1.93 0 3.5-1.57 3.5-3.5v-9.25l-.015.008zM9.15 5.88h5.7c.69 0 1.25.56 1.25 1.25s-.56 1.25-1.25 1.25h-5.7c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25zm6.55 12.24h-7.4c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25h7.4c.69 0 1.25.56 1.25 1.25s-.56 1.25-1.25 1.25zm0-3.5h-7.4c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25h7.4c.69 0 1.25.56 1.25 1.25s-.56 1.25-1.25 1.25z"
                fill="currentColor"
              />
            </svg>
            <span>Last updated: {ago}</span>
          </div>
          {user.country && user.country !== "PLACEHOLDER" && (
            <div className={styles.detailItem}>
              <svg viewBox="0 0 24 24" className={styles.detailIcon}>
                <path
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                  fill="currentColor"
                />
              </svg>
              <span>
                {user.state ? `${user.state}, ` : ""}
                {user.country}
              </span>
            </div>
          )}
          <div className={styles.detailItem}>
            <svg viewBox="0 0 24 24" className={styles.detailIcon}>
              <path
                d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
                fill="currentColor"
              />
            </svg>
            <span>Mutuals: {user.mutual_count} / 50</span>
          </div>

          {/* ATW Level */}
          <div className={`${styles.detailItem} ${styles.detailItemCenter}`}>
            <svg viewBox="0 0 24 24" className={styles.detailIcon}>
              <path
                d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"
                fill="currentColor"
              />
            </svg>
            <span>
              <strong className={styles.atwTierCode}>{tier.code}</strong>
            </span>

            {/* Circular Gauge & Interactive Tooltip */}
            <div
              className={styles.atwGaugeContainer}
              onMouseEnter={() => setShowAtwTooltip(true)}
              onMouseLeave={() => setShowAtwTooltip(false)}
              onClick={() => setShowAtwTooltip((prev) => !prev)}
              title={`ATW Capacity: ${pct}%`}
              role="button"
              tabIndex={0}
              aria-label={`Withdrawal limit gauge: ${pct}% capacity`}
            >
              <div className={styles.atwGaugeWrapper}>
                <svg className={styles.atwGaugeSvg} width="20" height="20" viewBox="0 0 20 20">
                  <circle className={styles.atwGaugeTrack} cx="10" cy="10" r={radius} strokeWidth="2.4" fill="none" />
                  <motion.circle
                    className={styles.atwGaugeFill}
                    cx="10"
                    cy="10"
                    r={radius}
                    strokeWidth="2.4"
                    fill="none"
                    stroke={stateColor}
                    strokeDasharray={circ}
                    initial={{ strokeDashoffset: circ }}
                    animate={{ strokeDashoffset: strokeOffset }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <AnimatePresence>
                {showAtwTooltip && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ duration: 0.18 }}
                    className={styles.atwTooltipBox}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className={styles.atwTooltipHeader}>
                      <span>ATW Holding Capacity</span>
                      <span className={styles.atwPct} style={{ color: stateColor }}>
                        {pct}%
                      </span>
                    </div>
                    <p className={styles.atwTooltipText}>
                      Holding limit: {formatCurrency(balanceCap)} ({tier.code}). Current: {formatCurrency(currentBal)}.
                    </p>
                    <span className={styles.atwTooltipHint} style={{ color: stateColor }}>
                      {ratio >= 0.9
                        ? "Max holding reached! Please withdraw your funds."
                        : ratio >= 0.6
                        ? "Balance is filling up. Prepare to withdraw soon."
                        : "Safe holding balance. All systems nominal."}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {isMonetized && (
            <div className={styles.detailItem}>
              <VerifiedBadge
                size={14}
                color="var(--text-muted)"
                checkColor="var(--background, #ffffff)"
                title="Monetized Account"
              />
              <span>Monetized</span>
            </div>
          )}
        </div>

        {!isMonetized && (
          <div className={styles.renewalSection}>
            <div className={styles.monetizeProgressHeader}>
              <span>Monetization Progress</span>
              <span className={styles.monetizeProgressValue}>{clicksCount} / 300 clicks</span>
            </div>
            <div className={styles.monetizeProgressTrack}>
              <div className={styles.monetizeProgressFill} style={{ width: `${progressPct}%` }} />
            </div>
            <p className={styles.monetizeProgressNote}>
              {Math.max(0, 300 - clicksCount)} clicks remaining to unlock monetization.
            </p>
            <Link
              href="/logged-in"
              onClick={() => onSelectTab("monetize")}
              className={`${styles.renewBtn} ${styles.monetizeProgressLink}`}
            >
              View Monetization Details
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
