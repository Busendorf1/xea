"use client";

import React from "react";
import { getLocalizedAdFloorRate } from "@/lib/utils/currency";
import { adRates } from "./types";
import styles from "./page.module.css";

interface Step0CategoryProps {
  adType: string;
  setAdType: (type: string) => void;
  formatCurrency: (amount: number | string) => string;
  country?: string | null;
}

export default function Step0Category({
  adType,
  setAdType,
  formatCurrency,
  country,
}: Step0CategoryProps) {
  const selectedName =
    adType === "product_sales" ? "Product Sales" : adType.charAt(0).toUpperCase() + adType.slice(1);
  const selectedRate = getLocalizedAdFloorRate(adType, country);

  return (
    <div className={styles.modernSectionCard}>
      <div className={styles.modernSectionHeader}>
        <span className={styles.modernSectionTitle}>Ad Category</span>
        <span className={styles.modernSectionBadge}>
          {selectedName} · {formatCurrency(selectedRate)}/attention
        </span>
      </div>
      <div className={styles.modernSectionBody}>
        <div className={`${styles.adTypeGrid} ${styles.adTypeGridSpaced}`}>
          {Object.keys(adRates).map((key) => {
            const isSelected = adType === key;
            const rate = getLocalizedAdFloorRate(key, country);
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
