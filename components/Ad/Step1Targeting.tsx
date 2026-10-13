"use client";

import React from "react";
import { Category, AdFormSelections } from "./types";
import styles from "./page.module.css";

interface Step1TargetingProps {
  adType: string;
  activeCategories: Category[];
  optionsMap: Record<string, string[]>;
  formSelections: AdFormSelections;
  toggleSelection: (category: Category, item: string) => void;
  handleTargetAll: (category: Category, e: React.MouseEvent) => void;
}

export default function Step1Targeting({
  adType,
  activeCategories,
  optionsMap,
  formSelections,
  toggleSelection,
  handleTargetAll,
}: Step1TargetingProps) {
  return (
    <>
      <p className={styles.targetingNote}>
        Showing targeting options for{" "}
        <strong>
          {adType === "product_sales" ? "Product Sales" : adType.charAt(0).toUpperCase() + adType.slice(1)}
        </strong>{" "}
        ads. Switch category in Step 0 to see different options.
      </p>

      {activeCategories.map((cat) => {
        const items = optionsMap[cat] || [];
        const selectedList = formSelections[cat] || [];
        const isAllSelected = items.length > 0 && items.every((item) => selectedList.includes(item));
        const selectedCount = selectedList.length;

        return (
          <div key={cat} className={`${styles.dropdownContainer} ${styles.modernSectionCard}`}>
            <details open>
              <summary className={`${styles.modernSectionHeader} ${styles.categorySummaryHeader}`}>
                <span className={styles.modernSectionTitle}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  {selectedCount > 0 && (
                    <span className={styles.modernSectionBadge}>{selectedCount} selected</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleTargetAll(cat, e)}
                  className={`${styles.targetAllBtn} ${isAllSelected ? styles.targetAllBtnActive : ""}`}
                >
                  {isAllSelected ? "Deselect All" : "Target All"}
                </button>
              </summary>
              <div className={`${styles.modernSectionBody} ${styles.categoryGridBody}`}>
                {items.map((item, i) => (
                  <label key={i} className={styles.categoryItemLabel}>
                    <input
                      type="checkbox"
                      checked={selectedList.includes(item)}
                      onChange={() => toggleSelection(cat, item)}
                    />
                    {item}
                  </label>
                ))}
              </div>
            </details>
          </div>
        );
      })}
      {activeCategories.length === 0 && (
        <p className={styles.targetingNote}>
          No granular targeting available for Individual ads — your ad will reach a broad general audience.
        </p>
      )}
    </>
  );
}
