"use client";

import React from "react";
import { ShieldAlert } from "lucide-react";
import styles from "./page.module.css";

export interface AdAccountSuspendedCardProps {
  adAccountRestriction: {
    restricted: boolean;
    status: string;
    reason: string;
    until: string | null;
  };
}

export function AdAccountSuspendedCard({ adAccountRestriction }: AdAccountSuspendedCardProps) {
  const getCountdownStr = (untilStr: string | null) => {
    if (!untilStr) return "";
    const diffMs = new Date(untilStr).getTime() - Date.now();
    if (diffMs <= 0) return "Expired";
    const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    return `${days} day${days > 1 ? "s" : ""}`;
  };

  return (
    <div className={styles.suspendedCard}>
      <div className={styles.suspendedIconWrap}>
        <ShieldAlert size={32} />
      </div>
      <h2 className={styles.suspendedTitle}>Advertising and Highlight Account Disabled</h2>
      <p className={styles.suspendedBody}>
        {adAccountRestriction.status === "temp_banned" ? (
          <>
            Your advertising account is temporarily suspended for{" "}
            <strong>{getCountdownStr(adAccountRestriction.until)}</strong>.
          </>
        ) : adAccountRestriction.status === "perm_banned" ? (
          <>Your advertising account has been permanently suspended due to policy violations.</>
        ) : (
          <>Your advertising account has been deactivated by administration.</>
        )}
      </p>
      {adAccountRestriction.reason && (
        <div className={styles.suspendedReasonBox}>
          <strong>Reason for decision:</strong> {adAccountRestriction.reason}
        </div>
      )}
      <p className={styles.suspendedNote}>
        If you believe this restriction is an error, you may submit an appeal to our Help Center support team.
      </p>
      <a
        href="/help?category=Suspended%20Account&subject=Appeal%20Ad%20Account%20Suspension"
        className={styles.appealBtn}
      >
        Appeal via Help Center
      </a>
    </div>
  );
}

export default AdAccountSuspendedCard;
