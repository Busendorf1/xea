"use client";

import React from "react";
import { adRates } from "./types";
import styles from "./page.module.css";

interface Step0CategoryProps {
  adType: string;
  setAdType: (type: string) => void;
  formatCurrency: (amount: number | string) => string;
}

export default function Step0Category({
  adType,
  setAdType,
  formatCurrency,
}: Step0CategoryProps) {
  return (
    <div className={styles.modernSectionCard}>
      <div className={styles.modernSectionHeader}>
        <span className={styles.modernSectionTitle}>Select Distribution Track (DaaS)</span>
        <span className={styles.modernSectionBadge}>
          {adType === "product_sales" ? "Product Sales" : adType.charAt(0).toUpperCase() + adType.slice(1)} ·{" "}
          {formatCurrency(adRates[adType] || 0)}/node
        </span>
      </div>
      <div className={styles.modernSectionBody}>
        <p className={styles.categoryDescription}>
          Select your demographic distribution track to deploy directly into verified attention nodes.
        </p>
        <div className={`${styles.adTypeGrid} ${styles.adTypeGridSpaced}`}>
          {Object.keys(adRates).map((key) => {
            const isSelected = adType === key;
            const rate = adRates[key];
            const displayName =
              key === "product_sales" ? "Product Sales" : key.charAt(0).toUpperCase() + key.slice(1);
            return (
              <div
                key={key}
                className={`${styles.adTypeCard} ${isSelected ? styles.adTypeCardActive : ""}`}
                onClick={() => setAdType(key)}
              >
                <div className={styles.adTypeCardTitle}>{displayName}</div>
                <div className={styles.adTypeCardBadge}>{formatCurrency(rate)} / attention</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
