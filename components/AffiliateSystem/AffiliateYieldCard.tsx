"use client";

import React from "react";
import { TrendingUp, ShieldCheck } from "lucide-react";
import styles from "./AffiliateSystem.module.css";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

export interface AffiliateYieldCardProps {
  affiliateEarnedTotal: number;
  balance?: number;
  roleTitle?: string | null;
  currencyCountry?: string | null;
  shardCount?: number;
}

export function AffiliateYieldCard({
  affiliateEarnedTotal,
  balance,
  roleTitle = "Platform Affiliate",
  currencyCountry,
  shardCount = 64,
}: AffiliateYieldCardProps) {
  const formatCurrency = (amount: number | string) =>
    globalFormatCurrency(amount, currencyCountry);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.titleGroup}>
          <TrendingUp size={20} className={styles.metricHighlight} />
          <div>
            <h4 className={styles.title}>Affiliate Yield &amp; Platform Share</h4>
            <p className={styles.subtitle}>{roleTitle || "Platform Affiliate"}</p>
          </div>
        </div>
        <div className={styles.titleGroup}>
          <ShieldCheck size={16} className={styles.metricHighlight} />
          <span className={styles.metricSubtext}>{shardCount}-Shard Atomic Engine</span>
        </div>
      </div>

      <div className={styles.metricsGrid}>
        <div className={metricBoxClass(styles.metricBox)}>
          <span className={styles.metricLabel}>Total Affiliate Yield</span>
          <span className={`${styles.metricValue} ${styles.metricHighlight}`}>
            {formatCurrency(affiliateEarnedTotal || 0)}
          </span>
          <span className={styles.metricSubtext}>Lifetime accrued from 10% platform share</span>
        </div>

        {typeof balance === "number" && (
          <div className={styles.metricBox}>
            <span className={styles.metricLabel}>Available Balance</span>
            <span className={styles.metricValue}>{formatCurrency(balance || 0)}</span>
            <span className={styles.metricSubtext}>Ready for instant withdrawal</span>
          </div>
        )}

        <div className={styles.metricBox}>
          <span className={styles.metricLabel}>Platform Allocation</span>
          <span className={styles.metricValue}>10.0%</span>
          <span className={styles.metricSubtext}>Distributed per ad CPI conversion</span>
        </div>
      </div>
    </div>
  );
}

function metricBoxClass(base: string) {
  return base;
}

export default AffiliateYieldCard;
