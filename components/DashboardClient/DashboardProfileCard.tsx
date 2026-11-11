"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Clock } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import RoleStarBadges from "@/components/ui/RoleStarBadges";
import { AgentProfileStats } from "@/components/AgentSystem/AgentSystem";
import { computeAtwTierDetails } from "@/lib/attentionTierEngine";
import { isExemptFromBarriersAndInactivity } from "@/lib/adminHelper";
import { UserProfile } from "./types";
import Skeleton from "@/components/ui/Skeleton";
import styles from "./page.module.css";

export function ProfileCardSkeleton() {
  return (
    <div className={styles.profileCard} aria-busy="true" aria-label="Loading profile details">
      <div className={styles.profileBanner}>
        <Skeleton variant="rect" width="100%" height={85} />
      </div>
      <div className={styles.avatarRow}>
        <div className={styles.profileImgContainer}>
          <Skeleton variant="avatar" width={70} height={70} style={{ borderRadius: "50%" }} />
        </div>
        <Skeleton variant="rect" width={90} height={32} style={{ borderRadius: 9999 }} />
      </div>

      <div className={styles.profileInfo}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Skeleton variant="title" width={140} height={20} />
          <Skeleton variant="rect" width={18} height={18} style={{ borderRadius: "50%" }} />
        </div>
        <div style={{ marginTop: 6 }}>
          <Skeleton variant="text" width={90} height={14} />
        </div>

        <div style={{ marginTop: 12 }}>
          <Skeleton variant="text" width="90%" height={13} />
          <Skeleton variant="text" width="60%" height={13} style={{ marginTop: 4 }} />
        </div>

        <div className={styles.profileMetaRow} style={{ marginTop: 14 }}>
          <Skeleton variant="text" width={110} height={14} />
          <Skeleton variant="text" width={90} height={14} />
        </div>

        <div className={styles.profileStatsRow} style={{ marginTop: 14 }}>
          <Skeleton variant="text" width={60} height={16} />
          <span className={styles.profileStatDot}>·</span>
          <Skeleton variant="text" width={60} height={16} />
          <span className={styles.profileStatDot}>·</span>
          <Skeleton variant="text" width={55} height={16} />
          <span className={styles.profileStatDot}>·</span>
          <Skeleton variant="text" width={70} height={16} />
        </div>

        <div className={styles.renewalSection} style={{ marginTop: 16 }}>
          <div className={styles.monetizeProgressHeader}>
            <Skeleton variant="text" width={130} height={13} />
            <Skeleton variant="text" width={80} height={13} />
          </div>
          <div className={styles.monetizeProgressTrack} style={{ marginTop: 8 }}>
            <Skeleton variant="rect" width="100%" height={6} style={{ borderRadius: 9999 }} />
          </div>
          <div style={{ marginTop: 8 }}>
            <Skeleton variant="text" width="70%" height={12} />
          </div>
        </div>
      </div>
    </div>
  );
}

interface DashboardProfileCardProps {
  user?: UserProfile | null;
  formatCurrency: (amount: number | string) => string;
  onSelectTab: (tab: string) => void;
  isLoading?: boolean;
}

export default function DashboardProfileCard({
  user,
  formatCurrency,
  onSelectTab,
  isLoading = false,
}: DashboardProfileCardProps) {
  const [showAtwTooltip, setShowAtwTooltip] = useState(false);

  if (isLoading || !user || !user.email) {
    return <ProfileCardSkeleton />;
  }

  const clicksCount = Number(user.monetization_clicks ?? 0);
  const isExempt = isExemptFromBarriersAndInactivity(user.email, user);
  const isMonetized = Boolean(
    !user.has_cancelled_monetization &&
      (isExempt || clicksCount >= 300)
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

  // ATW Tier & Balance Holding Cap calculations (driven by live 300-click steps & Unlimited for admins)
  const tierDetails = computeAtwTierDetails(clicksCount, user.atw_tier, isExempt);
  const balanceCap = tierDetails.holdingCap;
  const currentBal = Number(user.balance ?? 0);
  const ratio = tierDetails.isUnlimited
    ? 0
    : Math.min(1, Math.max(0, currentBal / (balanceCap || 30000)));
  const pct = tierDetails.isUnlimited ? 0 : Math.round(ratio * 100);

  let stateColor = "var(--foreground)";
  let stateColorClass = styles.stateColorNormal;
  if (!isExempt) {
    if (ratio >= 0.9) {
      stateColor = "#ef4444";
      stateColorClass = styles.stateColorDanger;
    } else if (ratio >= 0.6) {
      stateColor = "var(--text-muted)";
      stateColorClass = styles.stateColorWarn;
    }
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
                : user.firstName && user.lastName
                ? `${user.firstName} ${user.lastName}`
                : user.firstName || (user.username ? `@${user.username.replace(/^@/, "")}` : `@${(user.email || "").split("@")[0]}`)}
            </span>
            {isMonetized && <VerifiedBadge size={19} title="Verified Partner" />}
            <RoleStarBadges
              email={user.email}
              isCareer={user.is_career}
              isAffiliate={user.is_affiliate}
              affiliateRole={user.affiliate_role}
              size={17}
            />
          </h4>
        <p className={styles.usernameText}>@{user.username ? user.username.replace(/^@/, "") : (user.email || "").split("@")[0]}</p>

        {user.business_name && user.business_name.trim() !== "" && (
          <p className={styles.representativeBadge}>
            Representative: <strong>{user.firstName} {user.lastName}</strong>
          </p>
        )}

        <p className={styles.profileBio}>{user.bio || "No bio set yet."}</p>

        {/* X / Bluesky Horizontal Metadata Row (Location + Last Updated) */}
        <div className={styles.profileMetaRow}>
          {user.country && user.country !== "PLACEHOLDER" && (
            <div className={styles.detailItem}>
              <MapPin size={14} strokeWidth={2} className={styles.detailIcon} />
              <span>
                {user.state ? `${user.state}, ` : ""}
                {user.country}
              </span>
            </div>
          )}
          <div className={styles.detailItem}>
            <Clock size={14} strokeWidth={2} className={styles.detailIcon} />
            <span>Updated {ago}</span>
          </div>
        </div>

        {/* X / Bluesky Bold Social Stats & Badges Row (Mutuals · Invites · Agent · ATW Tier Gauge · Monetized) */}
        <div className={styles.profileStatsRow}>
          <AgentProfileStats
            mutualCount={user.mutual_count}
            formatCurrency={formatCurrency}
            onSelectTab={onSelectTab}
          />

          <span className={styles.profileStatDot}>·</span>

          {/* ATW Level + Interactive Circular Gauge & Tooltip */}
          <div className={`${styles.profileStatItem} ${styles.detailItemCenter}`}>
            <strong className={styles.atwTierCode}>{tierDetails.tierCode}</strong>
            <span className={styles.profileStatLabel}>Tier</span>

            <div
              className={styles.atwGaugeContainer}
              onMouseEnter={() => setShowAtwTooltip(true)}
              onMouseLeave={() => setShowAtwTooltip(false)}
              onClick={() => setShowAtwTooltip((prev) => !prev)}
              title={
                tierDetails.isUnlimited
                  ? "ATW Capacity: Unlimited"
                  : `ATW Capacity: ${pct}%`
              }
              role="button"
              tabIndex={0}
              aria-label={`Withdrawal limit gauge: ${
                tierDetails.isUnlimited ? "Unlimited" : `${pct}% capacity`
              }`}
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
            </div>
          </div>

          <AnimatePresence>
            {showAtwTooltip && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className={styles.atwTooltipBox}
                onMouseEnter={() => setShowAtwTooltip(true)}
                onMouseLeave={() => setShowAtwTooltip(false)}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.atwTooltipHeader}>
                  <span>ATW Holding Capacity</span>
                  <span className={`${styles.atwPct} ${stateColorClass}`}>
                    {tierDetails.isUnlimited ? "Unlimited" : `${pct}%`}
                  </span>
                </div>
                <p className={styles.atwTooltipText}>
                  {tierDetails.isUnlimited
                    ? "Holding limit: Unlimited (Unlimited Tier)."
                    : `Holding limit: ${formatCurrency(balanceCap)} (${tierDetails.tierCode} • ${clicksCount} clicks).`}
                </p>
                <span className={`${styles.atwTooltipHint} ${stateColorClass}`}>
                  {tierDetails.isUnlimited
                    ? "Unlimited holding balance cap active."
                    : ratio >= 0.9
                    ? "Max holding reached! Please withdraw your funds."
                    : ratio >= 0.6
                    ? "Balance is filling up. Prepare to withdraw soon."
                    : "Safe holding balance."}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {user.has_cancelled_monetization ? (
            <>
              <span className={styles.profileStatDot}>·</span>
              <Link
                href="/logged-in"
                onClick={() => onSelectTab("monetize")}
                className={styles.profileStatItem}
                style={{ textDecoration: "none" }}
              >
                <strong className={styles.profileStatValue} style={{ color: "#f59e0b" }}>Opted Out</strong>
                <span className={styles.profileStatLabel}>Status</span>
              </Link>
            </>
          ) : isMonetized ? (
            <>
              <span className={styles.profileStatDot}>·</span>
              <div className={styles.profileStatItem}>
                <VerifiedBadge
                  size={14}
                  color="var(--text-muted)"
                  checkColor="var(--background, #ffffff)"
                  title="Monetized Account"
                />
                <strong className={styles.profileStatValue}>Monetized</strong>
              </div>
            </>
          ) : null}
        </div>

        {typeof user.monetization_clicks !== "number" ? (
          <div className={styles.renewalSection} aria-busy="true">
            <div className={styles.monetizeProgressHeader}>
              <Skeleton variant="text" width={130} height={13} />
              <Skeleton variant="text" width={75} height={13} />
            </div>
            <div className={styles.monetizeProgressTrack} style={{ marginTop: 8 }}>
              <Skeleton variant="rect" width="100%" height={6} style={{ borderRadius: 9999 }} />
            </div>
          </div>
        ) : user.has_cancelled_monetization ? (
          <div className={styles.renewalSection}>
            <div className={styles.monetizeProgressHeader}>
              <span style={{ color: "#f59e0b", fontWeight: 700 }}>Monetization Opted Out</span>
              <span className={styles.monetizeProgressValue}>Browsing Only</span>
            </div>
            <p className={styles.monetizeProgressNote}>
              You have voluntarily opted out of monetization. Your wallet balance is preserved. You can reapply anytime.
            </p>
            <Link
              href="/logged-in"
              onClick={() => onSelectTab("monetize")}
              className={`${styles.renewBtn} ${styles.monetizeProgressLink}`}
            >
              Reapply in Monetization Hub
            </Link>
          </div>
        ) : !isMonetized && (
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
