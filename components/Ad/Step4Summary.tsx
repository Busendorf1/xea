"use client";

import React from "react";
import dynamic from "next/dynamic";
import { AdFormSelections } from "./types";
import styles from "./page.module.css";

const AttentionMarketTicker = dynamic(() => import("./AttentionMarketTicker"), { ssr: false });

interface Step4SummaryProps {
  formSelections: AdFormSelections;
  adType: string;
  userProfile: {
    mutual_count: number;
    mutuals: string[];
    last_mutual_spent?: string;
    balance: number;
  } | null;
  formatCurrency: (amount: number | string) => string;
  calculateTotalCostPerImpression: () => number;
  calculateTotalCost: () => number;
  isBiddingEnabled: boolean;
  setIsBiddingEnabled: (val: boolean) => void;
  bidPrice: number;
  setBidPrice: (val: number) => void;
}

export default function Step4Summary({
  formSelections,
  adType,
  userProfile,
  formatCurrency,
  calculateTotalCostPerImpression,
  calculateTotalCost,
  isBiddingEnabled,
  setIsBiddingEnabled,
  bidPrice,
  setBidPrice,
}: Step4SummaryProps) {
  return (
    <div className={styles.summaryContainer}>
      <div className={styles.summaryHeader}>
        <h2 className={styles.summaryTitle}>Campaign summary</h2>
        <p className={styles.summarySubtitle}>
          Verify parameters before preview.
        </p>
      </div>

      <div className={styles.summaryGrid}>
        {/* Left Column: Configuration details */}
        <div className={styles.summarySection}>
          <h3 className={styles.sectionTitle}>Targeting details</h3>
          <div className={styles.detailsList}>
            <div className={styles.detailsRow}>
              <span className={styles.detailsKey}>Audience type</span>
              <span className={styles.detailsVal}>Custom targeted audience</span>
            </div>

            {formSelections.gender && (
              <div className={styles.detailsRow}>
                <span className={styles.detailsKey}>Gender</span>
                <span className={styles.detailsVal}>
                  {formSelections.gender.charAt(0).toUpperCase() + formSelections.gender.slice(1)}
                </span>
              </div>
            )}
            {formSelections.ageRange && (
              <div className={styles.detailsRow}>
                <span className={styles.detailsKey}>Age range</span>
                <span className={styles.detailsVal}>
                  {formSelections.ageRange[0]} – {formSelections.ageRange[1]} years
                </span>
              </div>
            )}
            {(formSelections.country || formSelections.state || formSelections.province) && (
              <div className={styles.detailsRow}>
                <span className={styles.detailsKey}>Target location</span>
                <span className={styles.detailsVal}>
                  {[formSelections.province, formSelections.state, formSelections.country]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            )}
            {formSelections.industry.length > 0 && (
              <div className={styles.detailsRow}>
                <span className={styles.detailsKey}>Industries</span>
                <span className={styles.detailsVal}>{formSelections.industry.join(", ")}</span>
              </div>
            )}
            {formSelections.interest.length > 0 && (
              <div className={styles.detailsRow}>
                <span className={styles.detailsKey}>Interests</span>
                <span className={styles.detailsVal}>{formSelections.interest.join(", ")}</span>
              </div>
            )}
            {formSelections.behavior.length > 0 && (
              <div className={styles.detailsRow}>
                <span className={styles.detailsKey}>Behaviors</span>
                <span className={styles.detailsVal}>{formSelections.behavior.join(", ")}</span>
              </div>
            )}
            {formSelections.lifestyle.length > 0 && (
              <div className={styles.detailsRow}>
                <span className={styles.detailsKey}>Lifestyles</span>
                <span className={styles.detailsVal}>{formSelections.lifestyle.join(", ")}</span>
              </div>
            )}
            {formSelections.personality.length > 0 && (
              <div className={styles.detailsRow}>
                <span className={styles.detailsKey}>Personality traits</span>
                <span className={styles.detailsVal}>{formSelections.personality.join(", ")}</span>
              </div>
            )}
          </div>

          <h3 className={`${styles.sectionTitle} ${styles.sectionTitleMt}`}>Delivery controls</h3>
          <div className={styles.detailsList}>
            <div className={styles.detailsRow}>
              <span className={styles.detailsKey}>Campaign duration</span>
              <span className={styles.detailsVal}>
                {formSelections.campaignDays} day{formSelections.campaignDays > 1 ? "s" : ""}
              </span>
            </div>
            <div className={styles.detailsRow}>
              <span className={styles.detailsKey}>Frequency cap</span>
              <span className={styles.detailsVal}>
                {formSelections.userFrequencyCap} view{formSelections.userFrequencyCap > 1 ? "s" : ""} per user
              </span>
            </div>
            <div className={styles.detailsRow}>
              <span className={styles.detailsKey}>Daily attention cap</span>
              <span className={styles.detailsVal}>
                ~
                {Math.ceil(
                  (formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0
                    ? formSelections.impressions + userProfile.mutual_count
                    : formSelections.impressions) / formSelections.campaignDays
                ).toLocaleString()}{" "}
                attentions/day
              </span>
            </div>
          </div>

          {adType === "product_sales" ? (
            <>
              <h3 className={`${styles.sectionTitle} ${styles.sectionTitleMt}`}>Product details</h3>
              <div className={styles.detailsList}>
                <div className={styles.detailsRow}>
                  <span className={styles.detailsKey}>Product name</span>
                  <span className={styles.detailsVal}>{formSelections.productName}</span>
                </div>
                <div className={styles.detailsRow}>
                  <span className={styles.detailsKey}>Product price</span>
                  <span className={styles.detailsVal}>{formatCurrency(formSelections.productPrice)}</span>
                </div>
                {formSelections.productCtaLink && (
                  <div className={styles.detailsRow}>
                    <span className={styles.detailsKey}>CTA action</span>
                    <span className={styles.detailsVal}>
                      {formSelections.productCtaType} ·{" "}
                      <span className={styles.ctaLinkMuted}>{formSelections.productCtaLink}</span>
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            formSelections.productCtaLink && (
              <>
                <h3 className={`${styles.sectionTitle} ${styles.sectionTitleMt}`}>Action &amp; Feedback CTA</h3>
                <div className={styles.detailsList}>
                  <div className={styles.detailsRow}>
                    <span className={styles.detailsKey}>CTA button</span>
                    <span className={styles.detailsVal}>{formSelections.productCtaType || "Comment"}</span>
                  </div>
                  <div className={styles.detailsRow}>
                    <span className={styles.detailsKey}>Target link</span>
                    <span className={styles.detailsVal}>
                      <span className={styles.ctaLinkMuted}>{formSelections.productCtaLink}</span>
                    </span>
                  </div>
                </div>
              </>
            )
          )}
        </div>

        {/* Right Column: Pricing breakdown (Stripe Invoice/Receipt Card) */}
        <div className={styles.costCard}>
          <h3 className={styles.costCardTitle}>Pricing details</h3>

          <div className={styles.costRows}>
            <div className={styles.costRow}>
              <span className={styles.costKey}>Paid attention</span>
              <span className={styles.costVal}>
                {formSelections.impressions.toLocaleString()} views
              </span>
            </div>

            {formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0 && (
              <div className={`${styles.costRow} ${styles.costRowGreen}`}>
                <span className={`${styles.costKey} ${styles.costKeyGreen}`}>Free mutual attention</span>
                <span className={styles.costVal}>+{userProfile.mutual_count.toLocaleString()} views</span>
              </div>
            )}

            <div className={styles.divider}></div>

            <div className={styles.costRow}>
              <span className={styles.costKey}>Total target views</span>
              <span className={`${styles.costVal} ${styles.costValBold}`}>
                {(formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0
                  ? formSelections.impressions + userProfile.mutual_count
                  : formSelections.impressions
                ).toLocaleString()}{" "}
                views
              </span>
            </div>

            <div className={styles.costRow}>
              <span className={styles.costKey}>Cost per attention</span>
              <span className={styles.costVal}>{formatCurrency(calculateTotalCostPerImpression())}</span>
            </div>
          </div>

          <div className={styles.totalSection}>
            <span className={styles.totalLabel}>Total cost</span>
            <span className={styles.totalAmount}>{formatCurrency(calculateTotalCost())}</span>
          </div>
        </div>
      </div>

      {/* Attention Economy Bidding Market Ticker */}
      <AttentionMarketTicker
        selectedCategory={adType}
        isBiddingEnabled={isBiddingEnabled}
        onToggleBidding={setIsBiddingEnabled}
        bidPrice={bidPrice}
        onBidPriceChange={setBidPrice}
        impressions={formSelections.impressions}
      />
    </div>
  );
}
