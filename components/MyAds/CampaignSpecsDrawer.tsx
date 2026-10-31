"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  SlidersHorizontal,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Check,
  Target,
  ShoppingCart,
  Phone,
  MessageSquare,
  Globe,
  Mail,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { Ad, parseTargetingList, formatAgeRange } from "./types";
import styles from "./page.module.css";

interface CampaignSpecsDrawerProps {
  ad: Ad;
  isOpen: boolean;
  reportsCount: number;
  dismissalsCount: number;
  advertiserBlockCount: number;
  daysInfo: { remaining: number; isRollover: boolean; rolloverDays: number };
}

export default function CampaignSpecsDrawer({
  ad,
  isOpen,
  reportsCount,
  dismissalsCount,
  advertiserBlockCount,
  daysInfo,
}: CampaignSpecsDrawerProps) {
  const geoText = ad.country ? `${ad.country}${ad.state ? ` • ${ad.state}` : ""}${ad.province ? ` • ${ad.province}` : ""}` : "Global Delivery";
  const ageRangeText = formatAgeRange(ad.age_range);

  const industryList = parseTargetingList(ad.industry);
  const interestList = parseTargetingList(ad.interest);
  const lifestyleList = parseTargetingList(ad.lifestyle);
  const behaviorList = parseTargetingList(ad.behavior);
  const personalityList = parseTargetingList(ad.personality);
  const employmentList = parseTargetingList(ad.employment_status);

  const totalCategoriesCount =
    industryList.length +
    interestList.length +
    lifestyleList.length +
    behaviorList.length +
    personalityList.length;

  const phoneClicks = ad.clicks_phone || 0;
  const whatsappClicks = ad.clicks_whatsapp || 0;
  const websiteClicks = ad.clicks_website || 0;
  const emailClicks = ad.clicks_email || 0;
  const productCtaClicks = ad.clicks_product_cta || 0;
  const iosClicks = ad.clicks_ios || 0;
  const androidClicks = ad.clicks_android || 0;
  const watchNowClicks = ad.clicks_watch_now || 0;
  const readMoreClicks = ad.clicks_read_more || 0;
  const clicksCount =
    phoneClicks +
    whatsappClicks +
    websiteClicks +
    emailClicks +
    productCtaClicks +
    iosClicks +
    androidClicks +
    watchNowClicks +
    readMoreClicks;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={styles.specsDrawer}
        >
          <div className={styles.specsHeading}>
            <span className={styles.specsHeadingInner}>
              <SlidersHorizontal size={15} color="#1d9bf0" /> Advertiser Campaign Specifications & Budget Breakdown
            </span>
          </div>

          <div className={styles.specsGrid}>
            <div className={styles.specItem}>
              <span className={styles.specLabel}>Total Campaign Budget</span>
              <span className={styles.specVal}>
                {formatCurrency((ad.impressions || 1000) * (ad.cost_per_impression || 25), ad.country)}
              </span>
            </div>

            <div className={styles.specItem}>
              <span className={styles.specLabel}>Daily Budget Rate</span>
              <span className={styles.specVal}>
                {formatCurrency(
                  ((ad.impressions || 1000) * (ad.cost_per_impression || 25)) / (ad.campaign_days || 1),
                  ad.country
                )}{" "}
                / day
              </span>
            </div>

            <div className={styles.specItem}>
              <span className={styles.specLabel}>Frequency Cap (Per Viewer)</span>
              <span className={styles.specVal}>
                Max {ad.user_frequency_cap || 1} view / viewer / day
              </span>
            </div>

            <div className={styles.specItem}>
              <span className={styles.specLabel}>Rollover & Schedule Status</span>
              <div>
                {daysInfo.isRollover ? (
                  <span className={`${styles.rolloverActiveBadge} ${styles.rolloverBadgeInner}`}>
                    <Clock size={12} color="var(--primary)" /> Rollover Active (+{daysInfo.rolloverDays}d exceeded)
                  </span>
                ) : (
                  <span className={`${styles.rolloverNormalBadge} ${styles.rolloverBadgeInner}`}>
                    <CheckCircle2 size={12} color="#10b981" /> On Schedule ({daysInfo.remaining}d remaining)
                  </span>
                )}
              </div>
            </div>

            <div className={styles.specItem}>
              <span className={styles.specLabel}>Ad Health & Shield Report</span>
              <span className={`${styles.specVal} ${reportsCount > 0 ? styles.specValRed : styles.specValGreen}`}>
                {reportsCount > 0 ? (
                  <>
                    <AlertTriangle size={13} color="#ef4444" /> {reportsCount} Reports ({dismissalsCount} Dismissals)
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} color="#10b981" /> Clean ({dismissalsCount} Dismissals, {advertiserBlockCount} Account Blocks)
                  </>
                )}
              </span>
            </div>

            <div className={styles.specItem}>
              <span className={styles.specLabel}>Target Location</span>
              <span className={styles.specVal}>{geoText}</span>
            </div>

            <div className={styles.specItem}>
              <span className={styles.specLabel}>Target Gender & Age</span>
              <span className={styles.specVal}>
                {ad.gender
                  ? ad.gender.toLowerCase() === "both"
                    ? "All Genders"
                    : ad.gender.charAt(0).toUpperCase() + ad.gender.slice(1)
                  : "All Genders"}{" "}
                • {ageRangeText}
              </span>
            </div>

            <div className={styles.specItem}>
              <span className={styles.specLabel}>Targeting Scope</span>
              <span className={styles.specVal}>
                {totalCategoriesCount > 0 ? `${totalCategoriesCount} Categories Configured` : "Broad Delivery"}
              </span>
            </div>

            <div className={styles.specItem}>
              <span className={styles.specLabel}>Mutual+ Settings</span>
              <span className={styles.specVal}>
                {ad.display_mutual_button ? (
                  <span className={styles.mutualEnabledSpan}>
                    <Check size={13} color="#10b981" /> Enabled ({ad.mutual_adds_count ?? 0} gained)
                  </span>
                ) : (
                  "Disabled"
                )}
              </span>
            </div>
          </div>

          {/* Complete Audience Targeting Specifications Matrix */}
          <div className={styles.targetingMatrixBox}>
            <span className={styles.targetingMatrixTitle}>
              <Target size={14} color="var(--primary)" /> Complete Audience Targeting Specifications
            </span>

            <div className={styles.targetingMatrixGrid}>
              {/* Industry Categories */}
              <div className={styles.targetingCard}>
                <div className={styles.targetingCardHeader}>
                  <span className={styles.targetingCardLabel}>Industry Categories</span>
                  <span className={styles.targetingCardCount}>{industryList.length} selected</span>
                </div>
                <div className={styles.targetingChipsRow}>
                  {industryList.length > 0 ? (
                    industryList.map((item, idx) => (
                      <span key={idx} className={styles.targetingChip}>
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className={styles.targetingEmpty}>Broad (All Industries)</span>
                  )}
                </div>
              </div>

              {/* Interest Categories */}
              <div className={styles.targetingCard}>
                <div className={styles.targetingCardHeader}>
                  <span className={styles.targetingCardLabel}>Interest Categories</span>
                  <span className={styles.targetingCardCount}>{interestList.length} selected</span>
                </div>
                <div className={styles.targetingChipsRow}>
                  {interestList.length > 0 ? (
                    interestList.map((item, idx) => (
                      <span key={idx} className={styles.targetingChip}>
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className={styles.targetingEmpty}>Broad (All Interests)</span>
                  )}
                </div>
              </div>

              {/* Lifestyle Profiles */}
              <div className={styles.targetingCard}>
                <div className={styles.targetingCardHeader}>
                  <span className={styles.targetingCardLabel}>Lifestyle Profiles</span>
                  <span className={styles.targetingCardCount}>{lifestyleList.length} selected</span>
                </div>
                <div className={styles.targetingChipsRow}>
                  {lifestyleList.length > 0 ? (
                    lifestyleList.map((item, idx) => (
                      <span key={idx} className={styles.targetingChip}>
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className={styles.targetingEmpty}>Broad (All Lifestyles)</span>
                  )}
                </div>
              </div>

              {/* Consumer Behaviors */}
              <div className={styles.targetingCard}>
                <div className={styles.targetingCardHeader}>
                  <span className={styles.targetingCardLabel}>Consumer Behaviors</span>
                  <span className={styles.targetingCardCount}>{behaviorList.length} selected</span>
                </div>
                <div className={styles.targetingChipsRow}>
                  {behaviorList.length > 0 ? (
                    behaviorList.map((item, idx) => (
                      <span key={idx} className={styles.targetingChip}>
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className={styles.targetingEmpty}>Broad (All Behaviors)</span>
                  )}
                </div>
              </div>

              {/* Personality Types */}
              <div className={styles.targetingCard}>
                <div className={styles.targetingCardHeader}>
                  <span className={styles.targetingCardLabel}>Personality Types</span>
                  <span className={styles.targetingCardCount}>{personalityList.length} selected</span>
                </div>
                <div className={styles.targetingChipsRow}>
                  {personalityList.length > 0 ? (
                    personalityList.map((item, idx) => (
                      <span key={idx} className={styles.targetingChip}>
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className={styles.targetingEmpty}>Broad (All Personalities)</span>
                  )}
                </div>
              </div>

              {/* Demographics & Employment */}
              <div className={styles.targetingCard}>
                <div className={styles.targetingCardHeader}>
                  <span className={styles.targetingCardLabel}>Demographics & Employment</span>
                  <span className={styles.targetingCardCount}>
                    {[ad.gender, ageRangeText, employmentList.length > 0 ? `${employmentList.length} status` : null].filter(Boolean).length} configured
                  </span>
                </div>
                <div className={styles.targetingChipsRow}>
                  <span className={styles.targetingChip}>
                    Gender: {ad.gender ? (ad.gender.toLowerCase() === "both" ? "All Genders" : ad.gender.charAt(0).toUpperCase() + ad.gender.slice(1)) : "All Genders"}
                  </span>
                  <span className={styles.targetingChip}>Age: {ageRangeText}</span>
                  {employmentList.length > 0 ? (
                    employmentList.map((emp, idx) => (
                      <span key={idx} className={styles.targetingChip}>
                        {emp}
                      </span>
                    ))
                  ) : (
                    <span className={styles.targetingChip}>Employment: All</span>
                  )}
                </div>
              </div>

              {/* Geographic Delivery */}
              <div className={styles.targetingCard}>
                <div className={styles.targetingCardHeader}>
                  <span className={styles.targetingCardLabel}>Geographic Delivery</span>
                  <span className={styles.targetingCardCount}>{ad.country || "Global"}</span>
                </div>
                <div className={styles.targetingChipsRow}>
                  <span className={styles.targetingChip}>Country: {ad.country || "All / Global"}</span>
                  {ad.state && <span className={styles.targetingChip}>State: {ad.state}</span>}
                  {ad.province && <span className={styles.targetingChip}>Locations: {ad.province}</span>}
                </div>
              </div>
            </div>
          </div>

          {clicksCount > 0 && (
            <div className={styles.clickBreakdownBox}>
              <span className={styles.clickBreakdownTitle}>Detailed Click Type Breakdown</span>
              <div className={styles.clickBreakdownRow}>
                {productCtaClicks > 0 ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <ShoppingCart size={13} /> Product CTA: <strong>{productCtaClicks}</strong>
                  </span>
                ) : null}
                {phoneClicks > 0 ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Phone size={13} /> Calls: <strong>{phoneClicks}</strong>
                  </span>
                ) : null}
                {whatsappClicks > 0 ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <MessageSquare size={13} /> WhatsApp: <strong>{whatsappClicks}</strong>
                  </span>
                ) : null}
                {websiteClicks > 0 ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Globe size={13} /> Website: <strong>{websiteClicks}</strong>
                  </span>
                ) : null}
                {emailClicks > 0 ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Mail size={13} /> Email: <strong>{emailClicks}</strong>
                  </span>
                ) : null}
                {iosClicks > 0 ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Globe size={13} /> iOS App: <strong>{iosClicks}</strong>
                  </span>
                ) : null}
                {androidClicks > 0 ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Globe size={13} /> Android App: <strong>{androidClicks}</strong>
                  </span>
                ) : null}
                {watchNowClicks > 0 ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Globe size={13} /> Watch Now: <strong>{watchNowClicks}</strong>
                  </span>
                ) : null}
                {readMoreClicks > 0 ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Globe size={13} /> Read More: <strong>{readMoreClicks}</strong>
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
