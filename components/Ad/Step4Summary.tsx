"use client";

import React from "react";
import dynamic from "next/dynamic";
import { AlertCircle, Info } from "lucide-react";
import type { AdCapacityAssessment } from "@/lib/hooks/useAdCapacityCheck";
import { AdFormSelections } from "./types";
import styles from "./page.module.css";

const AttentionMarketTicker = dynamic(() => import("./AttentionMarketTicker"), { ssr: false });

interface Step4SummaryProps {
  formSelections: AdFormSelections;
  adType: string;
  country?: string | null;
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
  capacity?: AdCapacityAssessment | null;
  onApplyCapacityCap?: (maxCap: number) => void;
}

export default function Step4Summary({
  formSelections,
  adType,
  country,
  userProfile,
  formatCurrency,
  calculateTotalCostPerImpression,
  calculateTotalCost,
  isBiddingEnabled,
  setIsBiddingEnabled,
  bidPrice,
  setBidPrice,
  capacity,
  onApplyCapacityCap,
}: Step4SummaryProps) {
  return (
    <div className={styles.summaryContainer}>
      <div className={styles.summaryHeader}>
        <h2 className={styles.summaryTitle}>Campaign Summary</h2>
      </div>

      <div className={styles.summaryGrid}>
        {/* Left Column: Configuration details */}
        <div className={styles.summarySection}>
          <h3 className={styles.sectionTitle}>Targeting Details</h3>
          <div className={styles.detailsList}>
            <div className={styles.detailsRow}>
              <span className={styles.detailsKey}>Audience</span>
              <span className={styles.detailsVal}>Targeted</span>
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
                <span className={styles.detailsKey}>Location</span>
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
                <span className={styles.detailsKey}>Traits</span>
                <span className={styles.detailsVal}>{formSelections.personality.join(", ")}</span>
              </div>
            )}
          </div>

          <h3 className={`${styles.sectionTitle} ${styles.sectionTitleMt}`}>Delivery Controls</h3>
          <div className={styles.detailsList}>
            <div className={styles.detailsRow}>
              <span className={styles.detailsKey}>Duration</span>
              <span className={styles.detailsVal}>
                {formSelections.campaignDays} day{formSelections.campaignDays > 1 ? "s" : ""}
              </span>
            </div>
            <div className={styles.detailsRow}>
              <span className={styles.detailsKey}>Frequency cap</span>
              <span className={styles.detailsVal}>
                {formSelections.userFrequencyCap} attention{formSelections.userFrequencyCap > 1 ? "s" : ""} / user
              </span>
            </div>
            <div className={styles.detailsRow}>
              <span className={styles.detailsKey}>Daily pace</span>
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
              <h3 className={`${styles.sectionTitle} ${styles.sectionTitleMt}`}>Product Details</h3>
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
                <h3 className={`${styles.sectionTitle} ${styles.sectionTitleMt}`}>Call to Action</h3>
                <div className={styles.detailsList}>
                  <div className={styles.detailsRow}>
                    <span className={styles.detailsKey}>Button</span>
                    <span className={styles.detailsVal}>{formSelections.productCtaType || "Comment"}</span>
                  </div>
                  <div className={styles.detailsRow}>
                    <span className={styles.detailsKey}>Target URL</span>
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
          <h3 className={styles.costCardTitle}>Pricing</h3>

          <div className={styles.costRows}>
            <div className={styles.costRow}>
              <span className={styles.costKey}>Paid attentions</span>
              <span className={styles.costVal}>
                {formSelections.impressions.toLocaleString()}
              </span>
            </div>

            {formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0 && (
              <div className={`${styles.costRow} ${styles.costRowGreen}`}>
                <span className={`${styles.costKey} ${styles.costKeyGreen}`}>Free mutuals</span>
                <span className={styles.costVal}>+{userProfile.mutual_count.toLocaleString()}</span>
              </div>
            )}

            <div className={styles.divider}></div>

            <div className={styles.costRow}>
              <span className={styles.costKey}>Total target attentions</span>
              <span className={`${styles.costVal} ${styles.costValBold}`}>
                {(formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0
                  ? formSelections.impressions + userProfile.mutual_count
                  : formSelections.impressions
                ).toLocaleString()}
              </span>
            </div>

            <div className={styles.costRow}>
              <span className={styles.costKey}>Rate / attention</span>
              <span className={styles.costVal}>{formatCurrency(calculateTotalCostPerImpression())}</span>
            </div>
          </div>

          <div className={styles.totalSection}>
            <span className={styles.totalLabel}>Total cost</span>
            <span className={styles.totalAmount}>{formatCurrency(calculateTotalCost())}</span>
          </div>

          {capacity && capacity.telemetryAvailable && capacity.status !== "optimal" && (
            <div
              style={{
                marginTop: 12,
                padding: "9px 11px",
                borderRadius: 8,
                border: `1px solid ${
                  capacity.status === "capped"
                    ? "rgba(239, 68, 68, 0.35)"
                    : "rgba(245, 158, 11, 0.35)"
                }`,
                background:
                  capacity.status === "capped"
                    ? "rgba(239, 68, 68, 0.08)"
                    : "rgba(245, 158, 11, 0.08)",
                fontSize: "0.78rem",
                display: "inline-flex",
                width: "fit-content",
                maxWidth: "100%",
                alignSelf: "flex-start",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                {capacity.status === "capped" ? (
                  <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                ) : (
                  <Info size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                )}
                <span>{capacity.message}</span>
              </div>
              {capacity.status === "capped" &&
                capacity.maxOrderableImpressions >= 100 &&
                onApplyCapacityCap && (
                  <button
                    type="button"
                    onClick={() => onApplyCapacityCap(capacity.maxOrderableImpressions)}
                    style={{
                      alignSelf: "flex-start",
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--card-border)",
                      background: "var(--card-bg)",
                      color: "var(--foreground)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Use {capacity.maxOrderableImpressions.toLocaleString()}
                  </button>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Attention Economy Bidding Market Ticker */}
      <AttentionMarketTicker
        selectedCategory={adType}
        country={country}
        isBiddingEnabled={isBiddingEnabled}
        onToggleBidding={setIsBiddingEnabled}
        bidPrice={bidPrice}
        onBidPriceChange={setBidPrice}
        impressions={formSelections.impressions}
      />
    </div>
  );
}
