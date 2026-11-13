"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp } from "lucide-react";
import styles from "./page.module.css";
import LocationSelector from "../LocationSelector";
import CustomSelect from "@/components/ui/CustomSelect";
import RollingCounter from "@/components/ui/RollingCounter";
import TermsAgreementCheckbox from "@/components/ui/TermsAgreementCheckbox/TermsAgreementCheckbox";
import { ALL_INTERESTS as interests } from "@/lib/categoryTargetingMap";

export interface NewsStepTargetingProps {
  isAdmin: boolean;
  customSponsorName: string;
  setCustomSponsorName: (v: string) => void;
  customSponsorHandle: string;
  setCustomSponsorHandle: (v: string) => void;
  interest: string;
  setInterest: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  state: string;
  setState: (v: string) => void;
  province: string;
  setProvince: (v: string) => void;
  campaignDays: number;
  setCampaignDays: (v: number) => void;
  scheduledStartAt: string;
  setScheduledStartAt: (v: string) => void;
  isBiddingEnabled: boolean;
  setIsBiddingEnabled: (v: boolean) => void;
  bidPrice: number;
  setBidPrice: (v: number) => void;
  highestBid: number;
  formatCurrency: (amount: number | string) => string;
  setStep: (step: number) => void;
}

export const NewsStepTargeting = React.memo(function NewsStepTargeting({
  isAdmin,
  customSponsorName,
  setCustomSponsorName,
  customSponsorHandle,
  setCustomSponsorHandle,
  interest,
  setInterest,
  country,
  setCountry,
  state,
  setState,
  province,
  setProvince,
  campaignDays,
  setCampaignDays,
  scheduledStartAt,
  setScheduledStartAt,
  isBiddingEnabled,
  setIsBiddingEnabled,
  bidPrice,
  setBidPrice,
  highestBid,
  formatCurrency,
  setStep,
}: NewsStepTargetingProps) {
  return (
    <motion.div
      key="step-3"
      initial={{ opacity: 0, x: 15 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -15 }}
      transition={{ duration: 0.22 }}
      className={`${styles.formGroup} ${styles.targetingGroup}`}
    >
      {isAdmin && (
        <div className={`${styles.modernSectionCard} ${styles.adminSectionCard}`}>
          <div className={`${styles.modernSectionHeader} ${styles.adminSectionHeader}`}>
            <span className={`${styles.modernSectionTitle} ${styles.adminSectionTitle}`}>
              Admin: Custom Branding
            </span>
            <span className={`${styles.modernSectionBadge} ${styles.adminSectionBadge}`}>
              Publishing Active
            </span>
          </div>
          <div className={styles.modernSectionBody}>
            <div className={styles.formGroup}>
              <label className={styles.adminFieldLabel}>Custom Sponsor Name (Optional)</label>
              <input
                type="text"
                placeholder="e.g. ABC News (defaults to Sponsored)"
                value={customSponsorName}
                onChange={(e) => setCustomSponsorName(e.target.value)}
                className={styles.inputBox}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.adminFieldLabel}>Custom Handle (Optional)</label>
              <input
                type="text"
                placeholder="e.g. @abc_news (defaults to @Sponsored)"
                value={customSponsorHandle}
                onChange={(e) => setCustomSponsorHandle(e.target.value)}
                className={styles.inputBox}
              />
            </div>
          </div>
        </div>
      )}

      {/* Category Card */}
      <div className={styles.modernSectionCard}>
        <div className={styles.modernSectionHeader}>
          <span className={styles.modernSectionTitle}>Category and Interest</span>
          <span className={styles.modernSectionBadge}>{interest || "Select Category"}</span>
        </div>
        <div className={styles.modernSectionBody}>
          <p className={styles.sectionDescription}>Select category.</p>
          <div className={styles.selectWrapper}>
            <CustomSelect
              value={interest}
              onChange={(val) => setInterest(val)}
              options={interests.map((cat) => ({
                value: cat,
                label: cat,
                icon: null,
              }))}
              placeholder="-- Search or select target category --"
            />
          </div>
        </div>
      </div>

      {/* Target Location Card */}
      <div className={styles.modernSectionCard}>
        <div className={styles.modernSectionHeader}>
          <span className={styles.modernSectionTitle}>Target Location &amp; Coverage</span>
          <span className={styles.modernSectionBadge}>
            {province || state || country || "All Locations"}
          </span>
        </div>
        <div className={styles.modernSectionBody}>
          <LocationSelector
            country={country}
            state={state}
            location={province}
            inputClass={styles.inputBox}
            labelClass={styles.fieldLabel}
            groupClass={styles.formGroup}
            cityLabel="Province"
            onChange={({ country: c, state: s, location: loc }) => {
              setCountry(c);
              setState(s);
              setProvince(loc);
            }}
          />
        </div>
      </div>

      {/* Duration Selector Card */}
      <div className={styles.modernSectionCard}>
        <div className={styles.modernSectionHeader}>
          <span className={styles.modernSectionTitle}>Campaign Duration &amp; Start Schedule</span>
          <span className={styles.modernSectionBadge}>
            {campaignDays} {campaignDays === 1 ? "Day" : "Days"}
          </span>
        </div>
        <div className={styles.modernSectionBody}>
          <p className={styles.sectionDescription}>
            Select highlight duration (1–90 days). Your highlight automatically expires after its scheduled duration.
          </p>
          <div className={styles.durationContainer}>
            {[1, 3, 5, 7, 14, 30].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setCampaignDays(num)}
                className={`${styles.durationBtn} ${campaignDays === num ? styles.durationBtnActive : ""}`}
              >
                {num} {num === 1 ? "Day" : "Days"}
              </button>
            ))}
          </div>
          <div className={styles.formGroup} style={{ marginTop: 10 }}>
            <label className={styles.fieldLabel} style={{ fontSize: "0.78rem" }}>
              Or enter custom duration (1–90 days)
            </label>
            <input
              type="number"
              min={1}
              max={90}
              value={campaignDays}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                if (isNaN(parsed)) {
                  setCampaignDays(1);
                } else {
                  setCampaignDays(Math.max(1, Math.min(90, parsed)));
                }
              }}
              className={styles.inputBox}
            />
          </div>

          <div className={styles.formGroup} style={{ marginTop: 14 }}>
            <label className={styles.fieldLabel}>When Highlight Should Start</label>
            <div className={styles.durationContainer} style={{ marginBottom: scheduledStartAt ? 10 : 0 }}>
              <button
                type="button"
                onClick={() => setScheduledStartAt("")}
                className={`${styles.durationBtn} ${!scheduledStartAt ? styles.durationBtnActive : ""}`}
              >
                Start Upon Approval
              </button>
              <button
                type="button"
                onClick={() => {
                  const defaultStart = new Date().toISOString().slice(0, 10);
                  setScheduledStartAt(scheduledStartAt ? scheduledStartAt.slice(0, 10) : defaultStart);
                }}
                className={`${styles.durationBtn} ${Boolean(scheduledStartAt) ? styles.durationBtnActive : ""}`}
              >
                Pick Start Date (Calendar)
              </button>
            </div>
            {scheduledStartAt && (
              <div style={{ marginTop: 8 }}>
                <label className={styles.fieldLabel} style={{ fontSize: "0.78rem" }}>Start Day</label>
                <input
                  type="date"
                  value={scheduledStartAt.slice(0, 10)}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setScheduledStartAt(e.target.value)}
                  className={styles.inputBox}
                />
              </div>
            )}
            {(() => {
              const daysCount = Math.max(1, Number(campaignDays) || 1);
              const startBase = scheduledStartAt
                ? new Date(`${scheduledStartAt.slice(0, 10)}T00:00:00`)
                : new Date();
              const validStart = isNaN(startBase.getTime()) ? new Date() : startBase;
              const endDate = new Date(validStart.getTime() + daysCount * 86_400_000);
              const fmt = (d: Date) =>
                d.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
              return (
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "var(--card-bg)",
                    border: "1px solid var(--card-border)",
                    fontSize: "0.82rem",
                    color: "var(--foreground)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div>
                    <strong>Start Day:</strong>{" "}
                    {scheduledStartAt ? fmt(validStart) : `${fmt(validStart)} (Upon Approval)`}
                  </div>
                  <div>
                    <strong>Scheduled Expiry:</strong>{" "}
                    <span style={{ color: "var(--primary)", fontWeight: 700 }}>{fmt(endDate)}</span>{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      ({daysCount} {daysCount === 1 ? "day" : "days"} scheduled window)
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Priority Spotlight Bidding Card */}
      <div className={`${styles.modernSectionCard} ${isBiddingEnabled ? styles.biddingCardActive : ""}`}>
        <div className={styles.modernSectionHeader}>
          <div className={styles.spotlightHeaderLeft}>
            <div className={styles.spotlightIconCircle}>
              <TrendingUp size={16} className={styles.spotlightZapIcon} />
            </div>
            <div className={styles.spotlightTitleCol}>
              <div className={styles.spotlightTitleRow}>
                <span className={styles.modernSectionTitle}>Priority Spotlight Auction</span>
                <span
                  className={`${styles.modernSectionBadge} ${
                    isBiddingEnabled ? styles.biddingBadgeActive : ""
                  }`}
                >
                  {isBiddingEnabled ? "Spotlight Active" : "Standard Feed"}
                </span>
              </div>
              <p className={styles.spotlightSubtitle}>Bid for top carousel position.</p>
            </div>
          </div>

          <label className={styles.spotlightSwitch} aria-label="Toggle Spotlight Bidding">
            <input
              type="checkbox"
              checked={isBiddingEnabled}
              onChange={(e) => setIsBiddingEnabled(e.target.checked)}
            />
            <span className={styles.spotlightSlider}></span>
          </label>
        </div>

        <AnimatePresence initial={false}>
          {isBiddingEnabled && (
            <motion.div
              key="news-bidding-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className={styles.modernSectionBody}
            >
              <div className={styles.spotlightContextBanner}>
                <div className={styles.spotlightContextItem}>
                  <span className={styles.spotlightContextLabel}>Target Category</span>
                  <span className={styles.spotlightContextValue}>{interest || "General News"}</span>
                </div>
                <div className={styles.spotlightContextDivider} />
                <div className={styles.spotlightContextItem}>
                  <span className={styles.spotlightContextLabel}>Standard Daily Rate</span>
                  <span className={styles.spotlightContextValue}>{formatCurrency(1000)}/day</span>
                </div>
                <div className={styles.spotlightContextDivider} />
                <div className={styles.spotlightContextItem}>
                  <span className={styles.spotlightContextLabel}>Current Top Bid</span>
                  <span className={`${styles.spotlightContextValue} ${styles.spotlightTopBidVal}`}>
                    {formatCurrency(highestBid)}/day
                  </span>
                </div>
              </div>

              {(() => {
                const isLead = bidPrice > highestBid;
                const isMatched = bidPrice === highestBid && bidPrice > 1000;
                return (
                  <div
                    className={`${styles.spotlightRankCard} ${
                      isLead
                        ? styles.rankCardSpotlight
                        : isMatched
                        ? styles.rankCardMatched
                        : styles.rankCardChallenger
                    }`}
                  >
                    <div className={styles.spotlightRankHeader}>
                      <div className={styles.spotlightRankCol}>
                        <span className={styles.spotlightRankTitle}>
                          {isLead ? "#1 Spotlight" : isMatched ? "Matched Top Bid" : "Challenger"}
                        </span>
                        <p className={styles.spotlightRankDesc}>
                          {isLead
                            ? "Top carousel placement."
                            : isMatched
                            ? "Shared top rotation."
                            : `Increase bid above ${formatCurrency(highestBid)}/day for top placement.`}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className={styles.spotlightPresets}>
                <span className={styles.spotlightSectionLabel}>Quick Outbid Presets</span>
                <div className={styles.spotlightPresetRow}>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    className={`${styles.spotlightPresetChip} ${
                      bidPrice === highestBid ? styles.presetChipActive : ""
                    }`}
                    onClick={() => setBidPrice(highestBid)}
                  >
                    <span>Match Top</span>
                    <strong>{formatCurrency(highestBid)}</strong>
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    className={`${styles.spotlightPresetChip} ${
                      bidPrice === highestBid + 200 ? styles.presetChipActive : ""
                    }`}
                    onClick={() => setBidPrice(highestBid + 200)}
                  >
                    <span>+₦200 Lead</span>
                    <strong>{formatCurrency(highestBid + 200)}</strong>
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    className={`${styles.spotlightPresetChip} ${
                      bidPrice === highestBid + 500 ? styles.presetChipActive : ""
                    }`}
                    onClick={() => setBidPrice(highestBid + 500)}
                  >
                    <span>+₦500 Outbid</span>
                    <strong>{formatCurrency(highestBid + 500)}</strong>
                  </motion.button>
                </div>
              </div>

              <div className={styles.formGroup}>
                <span className={styles.spotlightSectionLabel}>Your Bid Price Per Day (₦)</span>
                <input
                  type="number"
                  min={highestBid + 100}
                  step={100}
                  value={bidPrice}
                  onChange={(e) => setBidPrice(parseFloat(e.target.value) || 1000)}
                  className={styles.inputBox}
                />
              </div>

              <div className={styles.spotlightCalcSummary}>
                <div className={styles.spotlightCalcRow}>
                  <span>Campaign Duration:</span>
                  <strong>
                    {campaignDays} {campaignDays === 1 ? "day" : "days"}
                  </strong>
                </div>
                <div className={styles.spotlightCalcRow}>
                  <span>Daily Bid Rate:</span>
                  <strong>{formatCurrency(bidPrice)}/day</strong>
                </div>
                <div className={`${styles.spotlightCalcRow} ${styles.spotlightCalcTotal}`}>
                  <span>Total Campaign Cost:</span>
                  <div className={styles.spotlightTotalWrap}>
                    <RollingCounter
                      value={bidPrice * campaignDays}
                      currencyPrefix="₦"
                      decimals={0}
                      durationMs={600}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.stepActionsBetweenTight}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setStep(2)}
          className={styles.secondaryNavBtn}
        >
          Back
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          disabled={!interest}
          onClick={() => setStep(4)}
          className={styles.primaryNavBtn}
        >
          Continue to Preview
        </motion.button>
      </div>
    </motion.div>
  );
});

export interface NewsStepPreviewProps {
  mediaPreview: string | null;
  setMediaPreview: (v: string | null) => void;
  interest: string;
  title: string;
  content: string;
  country: string;
  state: string;
  campaignDays: number;
  isBiddingEnabled: boolean;
  bidPrice: number;
  isAdmin: boolean;
  isAiContent: boolean;
  setIsAiContent: (v: boolean) => void;
  agreedToPolicy: boolean;
  setAgreedToPolicy: (v: boolean) => void;
  isSubmitting: boolean;
  setStep: (step: number) => void;
  handleInitiateSubmit: () => void;
  capitalizeFirst: (txt: string) => string;
}

export const NewsStepPreview = React.memo(function NewsStepPreview({
  mediaPreview,
  setMediaPreview,
  interest,
  title,
  content,
  country,
  state,
  campaignDays,
  isBiddingEnabled,
  bidPrice,
  isAdmin,
  isAiContent,
  setIsAiContent,
  agreedToPolicy,
  setAgreedToPolicy,
  isSubmitting,
  setStep,
  handleInitiateSubmit,
  capitalizeFirst,
}: NewsStepPreviewProps) {
  return (
    <motion.div
      key="step-4"
      initial={{ opacity: 0, x: 15 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -15 }}
      transition={{ duration: 0.22 }}
      className={styles.formGroup}
    >
      <div className={styles.previewCard}>
        {mediaPreview ? (
          <img
            src={mediaPreview}
            alt="Preview"
            className={styles.previewImage}
            onError={() => setMediaPreview(null)}
          />
        ) : (
          <div className={styles.previewImageFallback}>
            <span>{interest ? `${interest} Highlight` : "Cover Image Preview"}</span>
          </div>
        )}
        <div className={styles.previewContent}>
          <span className={styles.previewBadge}>{interest}</span>
          <h3 className={styles.previewTitle}>{capitalizeFirst(title)}</h3>
          <p className={styles.previewText}>{content}</p>
          <div className={styles.previewTargeting}>
            Targeting: {country} {state ? `· ${state}` : ""} · {campaignDays}{" "}
            {campaignDays === 1 ? "Day" : "Days"}{" "}
            {isBiddingEnabled ? `· Bidded (₦${bidPrice}/day)` : ""}
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className={styles.adminPrivilegeBox}>
          <h4 className={styles.adminPrivilegeHeading}>Admin: Free Publishing</h4>
          <p className={styles.adminPrivilegeSubtext}>
            No payment gateway or wallet balance deduction required.
          </p>
        </div>
      ) : (
        <div style={{ margin: "1.25rem 0 1rem", textAlign: "left" }}>
          <h4
            style={{
              margin: "0 0 0.35rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              color: "var(--foreground)",
            }}
          >
            Review First • Pay on Approval
          </h4>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            No payment now. Once approved, click Publish &amp; Pay on My Ads to launch.
          </p>
        </div>
      )}

      <div className={styles.aiDisclosureBox}>
        <div className={styles.aiDisclosureTextContainer}>
          <span className={styles.aiDisclosureTitle}>AI-generated content</span>
          <span className={styles.aiDisclosureDesc}>Enable if content is AI-generated.</span>
        </div>
        <label className={styles.aiSwitch}>
          <input
            type="checkbox"
            checked={isAiContent}
            onChange={(e) => setIsAiContent(e.target.checked)}
            className={styles.aiSwitchInput}
          />
          <span
            className={`${styles.aiSwitchSlider} ${
              isAiContent ? styles.aiSwitchSliderActive : ""
            }`}
          >
            <span
              className={`${styles.aiSwitchThumb} ${
                isAiContent ? styles.aiSwitchThumbActive : ""
              }`}
            />
          </span>
        </label>
      </div>

      <TermsAgreementCheckbox
        id="newsTermsPolicyCheckbox"
        checked={agreedToPolicy}
        onChange={setAgreedToPolicy}
        instruction="Please read and review the highlight terms and policies below, and tick the box if you accept:"
        terms={[
          { label: "Terms of Service", href: "/terms" },
          { label: "Advertising Guidelines", href: "/advertiser-guidelines" },
          { label: "Non-Refundable Policy", href: "/terms" },
          { label: "Privacy Policy", href: "/privacy" },
        ]}
        checkboxLabel="I have read, reviewed, and accept the Highlight Promotion Policies and Non-Refundable Terms."
        required
      />

      <div className={styles.stepActionsBetween}>
        <button type="button" disabled={isSubmitting} onClick={() => setStep(3)} className={styles.secondaryNavBtn}>
          Back
        </button>
        <button
          type="button"
          disabled={isSubmitting || !agreedToPolicy}
          onClick={handleInitiateSubmit}
          className={styles.primaryNavBtn}
        >
          {isSubmitting ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="btnSpinner" aria-hidden="true" />
              <span>Submitting for Review...</span>
            </span>
          ) : isAdmin ? (
            <>Publish (Admin)</>
          ) : (
            "Submit Highlight for Review"
          )}
        </button>
      </div>
    </motion.div>
  );
});
