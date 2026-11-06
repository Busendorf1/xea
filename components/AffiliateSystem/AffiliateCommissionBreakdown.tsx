"use client";

import React, { useState } from "react";
import { PieChart, Info } from "lucide-react";
import styles from "./AffiliateSystem.module.css";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

export interface AffiliateCommissionBreakdownProps {
  sampleCpi?: number;
  country?: string | null;
}

export function AffiliateCommissionBreakdown({
  sampleCpi = 50,
  country,
}: AffiliateCommissionBreakdownProps) {
  const [cpiValue, setCpiValue] = useState<number>(sampleCpi);

  const formatCurrency = (amount: number | string) =>
    globalFormatCurrency(amount, country);

  const earnerAmount = Math.round(cpiValue * 0.5 * 100) / 100;
  const affiliateAmount = Math.round(cpiValue * 0.1 * 100) / 100;
  const platformAmount = Math.round(cpiValue * 0.4 * 100) / 100;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.titleGroup}>
          <PieChart size={20} color="#6366f1" />
          <div>
            <h4 className={styles.title}>Revenue Split Architecture</h4>
            <p className={styles.subtitle}>50% Earner / 10% Affiliate Pool / 40% Platform Reserve</p>
          </div>
        </div>
        <div className={styles.titleGroup}>
          <Info size={15} color="var(--text-muted)" />
          <span className={styles.metricSubtext}>Lock-free Atomic Yield</span>
        </div>
      </div>

      <div className={styles.breakdownBarWrap}>
        <div className={styles.barEarner} title={`Earner: 50% (${formatCurrency(earnerAmount)})`} />
        <div className={styles.barAffiliate} title={`Affiliate: 10% (${formatCurrency(affiliateAmount)})`} />
        <div className={styles.barPlatform} title={`Platform: 40% (${formatCurrency(platformAmount)})`} />
      </div>

      <div className={styles.legendGrid}>
        <div className={styles.legendItem}>
          <span className={styles.legendColorEarner} />
          <span className={styles.legendLabel}>Consumer / Earner</span>
          <span className={styles.legendShare}>50% ({formatCurrency(earnerAmount)})</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendColorAffiliate} />
          <span className={styles.legendLabel}>Affiliate Pool</span>
          <span className={styles.legendShare}>10% ({formatCurrency(affiliateAmount)})</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendColorPlatform} />
          <span className={styles.legendLabel}>Platform Reserve</span>
          <span className={styles.legendShare}>40% ({formatCurrency(platformAmount)})</span>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>
          Simulate Ad CPI (Cost Per Interaction)
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={cpiValue}
          onChange={(e) => setCpiValue(Math.max(1, Number(e.target.value) || 1))}
          className={styles.input}
        />
      </div>
    </div>
  );
}

export default AffiliateCommissionBreakdown;
