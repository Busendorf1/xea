"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import styles from "./page.module.css";

export interface AdPendingLimitBannerProps {
  pendingLimitReached: boolean;
  editingId: string | null;
}

export function AdPendingLimitBanner({ pendingLimitReached, editingId }: AdPendingLimitBannerProps) {
  if (!pendingLimitReached || editingId) return null;

  return (
    <div className={styles.pendingLimitBanner}>
      <div className={styles.pendingLimitBannerContent}>
        <AlertCircle size={18} color="#ef4444" className={styles.pendingLimitIcon} />
        <div>
          <strong className={styles.pendingLimitTitle}>
            Pending Payment Limit Reached (2/2)
          </strong>
          <p className={styles.pendingLimitText}>
            You have 2 approved campaigns awaiting payment. Make payment or delete an existing campaign in My Ads to submit a new one.
          </p>
        </div>
      </div>
      <a href="/logged-in?view=myads" className={styles.pendingLimitActionBtn}>
        Go to My Ads &rarr;
      </a>
    </div>
  );
}

export default AdPendingLimitBanner;
