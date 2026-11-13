"use client";

import React from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import CustomSelect from "@/components/ui/CustomSelect";
import {
  AdFormSelections,
  getCtaIcon,
  containsLink,
  isSubsidizedLink,
} from "./types";
import styles from "./page.module.css";

interface Step3OfferAndCopySectionProps {
  formSelections: AdFormSelections;
  setFormSelections: React.Dispatch<React.SetStateAction<AdFormSelections>>;
  adType: string;
  isAdmin: boolean;
}

const PRODUCT_CTA_OPTIONS = [
  "None",
  "Buy",
  "Shop",
  "Order",
  "Book",
  "Reserve",
  "Apply",
  "Comment",
  "Join",
  "Learn More",
  "Visit Website",
  "Custom",
];

const ENGAGEMENT_CTA_OPTIONS = [
  "None",
  "Comment",
  "Vote",
  "Donate",
  "Volunteer",
  "Book",
  "Reserve",
  "Apply",
  "Order",
  "Buy",
  "Shop",
  "Join",
  "Learn More",
  "Visit Website",
  "Custom",
];

const PRESET_CTA_SET = new Set([
  ...PRODUCT_CTA_OPTIONS.filter((c) => c !== "Custom"),
  ...ENGAGEMENT_CTA_OPTIONS.filter((c) => c !== "Custom"),
]);

function clampToMaxWords(rawText: string, maxWords: number) {
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  let count = 0;
  let cutIndex = rawText.length;
  let exceeded = false;

  while ((match = regex.exec(rawText)) !== null) {
    count++;
    if (count === maxWords) {
      cutIndex = match.index + match[0].length;
    } else if (count > maxWords) {
      exceeded = true;
      break;
    }
  }

  if (exceeded) {
    return { text: rawText.slice(0, cutIndex), wordCount: maxWords };
  }
  if (count === maxWords && rawText.length > cutIndex + 1) {
    return { text: rawText.slice(0, cutIndex + 1), wordCount: maxWords };
  }
  return { text: rawText, wordCount: count };
}

export default function Step3OfferAndCopySection({
  formSelections,
  setFormSelections,
  adType,
  isAdmin,
}: Step3OfferAndCopySectionProps) {
  const isLongFormAllowed =
    adType !== "product_sales" &&
    (formSelections.adMediaType === "text" ||
      formSelections.adActionButtons.includes("read_more"));

  const wordMatches = formSelections.adContent.trim().match(/\S+/g);
  const wordCount = wordMatches ? wordMatches.length : 0;
  const charLimit = adType === "product_sales" ? 200 : 220;

  return (
    <>
      {isAdmin && (
        <div className={`${styles.modernSectionCard} ${styles.adminPrivilegeCard}`}>
          <div className={`${styles.modernSectionHeader} ${styles.adminPrivilegeHeader}`}>
            <span className={`${styles.modernSectionTitle} ${styles.adminPrivilegeTitle}`}>
              <ShieldCheck size={16} color="var(--primary)" /> Admin Privilege: Custom Branding
            </span>
            <span className={`${styles.modernSectionBadge} ${styles.adminPrivilegeBadge}`}>
              Free Publishing Active
            </span>
          </div>
          <div className={styles.modernSectionBody}>
            <div className={styles.formGroup}>
              <label className={styles.fieldLabelBold}>Custom Sponsor Name (Optional)</label>
              <input
                type="text"
                placeholder="e.g. ABC Ltd (defaults to Sponsored)"
                value={formSelections.customSponsorName}
                onChange={(e) => setFormSelections((prev) => ({ ...prev, customSponsorName: e.target.value }))}
                className={styles.inputBox}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.fieldLabelBold}>Custom Handle (Optional)</label>
              <input
                type="text"
                placeholder="e.g. @abc_ltd (defaults to @Sponsored)"
                value={formSelections.customSponsorHandle}
                onChange={(e) => setFormSelections((prev) => ({ ...prev, customSponsorHandle: e.target.value }))}
                className={styles.inputBox}
              />
            </div>
          </div>
        </div>
      )}

      {adType === "product_sales" ? (
        <div className={styles.modernSectionCard}>
          <div className={styles.modernSectionHeader}>
            <span className={styles.modernSectionTitle}>Product Offer</span>
            <span className={styles.modernSectionBadge}>{formSelections.productCtaType || "Buy"}</span>
          </div>
          <div className={styles.modernSectionBody}>
            <div className={styles.formGroup}>
              <label className={styles.fieldLabelBold}>
                Product Name{" "}
                <span className={styles.charCount}>{formSelections.productName.length}/80</span>
              </label>
              <input
                type="text"
                maxLength={80}
                value={formSelections.productName}
                placeholder="Enter product name (max 80 characters)"
                onChange={(e) =>
                  setFormSelections((prev) => ({
                    ...prev,
                    productName: e.target.value,
                  }))
                }
                className={styles.inputBox}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.fieldLabelBold}>Product Price (₦)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formSelections.productPrice}
                placeholder="Enter product price in Naira"
                onChange={(e) =>
                  setFormSelections((prev) => ({
                    ...prev,
                    productPrice: e.target.value,
                  }))
                }
                className={styles.inputBox}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.fieldLabelBold}>Action Button</label>
              <CustomSelect
                value={
                  formSelections.productCtaType && !PRESET_CTA_SET.has(formSelections.productCtaType)
                    ? "Custom"
                    : formSelections.productCtaType || "Buy"
                }
                onChange={(val) =>
                  setFormSelections((prev) => ({
                    ...prev,
                    productCtaType: val === "Custom" ? "" : val,
                    ...(val === "None" ? { productCtaLink: "" } : {}),
                  }))
                }
                options={PRODUCT_CTA_OPTIONS.map((cta) => ({
                  value: cta,
                  label: cta,
                  icon: getCtaIcon(cta),
                }))}
                placeholder="Select Primary CTA"
              />
              {(formSelections.productCtaType === "" ||
                (formSelections.productCtaType && !PRESET_CTA_SET.has(formSelections.productCtaType))) && (
                <div style={{ marginTop: "8px" }}>
                  <input
                    type="text"
                    maxLength={10}
                    value={formSelections.productCtaType}
                    placeholder="Custom button label (max 10 chars)"
                    onChange={(e) =>
                      setFormSelections((prev) => ({
                        ...prev,
                        productCtaType: e.target.value.slice(0, 10),
                      }))
                    }
                    className={styles.inputBox}
                  />
                  <span className={styles.inputHelperText}>
                    {(formSelections.productCtaType || "").length}/10 characters
                  </span>
                </div>
              )}
              {formSelections.productCtaType !== "None" && (
                <div className={styles.ctaPreviewRow}>
                  <span className={styles.ctaPreviewLabel}>Preview:</span>
                  <span className={styles.ctaPreviewBtn}>
                    {getCtaIcon(formSelections.productCtaType || "Buy")}
                    <span>{formSelections.productCtaType || "Buy"}</span>
                  </span>
                </div>
              )}
            </div>

            {formSelections.productCtaType !== "None" && (
            <div className={styles.formGroup}>
              <div className={styles.ctaLabelRow}>
                <label className={styles.fieldLabelBold}>Target URL (https://)</label>
                <Link href="/business/subscribe" className={styles.premiumLink}>
                  E-commerce platform? Become a Premium Subscriber
                </Link>
              </div>
              <input
                type="text"
                value={formSelections.productCtaLink}
                placeholder="https://yourwebsite.com/product-page"
                onChange={(e) =>
                  setFormSelections((prev) => ({
                    ...prev,
                    productCtaLink: e.target.value,
                  }))
                }
                className={`${styles.inputBox} ${
                  formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://")
                    ? styles.inputError
                    : ""
                }`}
              />
              {formSelections.productCtaLink && isSubsidizedLink(formSelections.productCtaLink) && (
                <div className={styles.subsidyBanner}>
                  <span>30% Baggyt discount applied.</span>
                </div>
              )}
              {formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://") && (
                <p className={styles.error}>The link must be a secure link starting with https://</p>
              )}
            </div>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.modernSectionCard}>
          <div className={styles.modernSectionHeader}>
            <span className={styles.modernSectionTitle}>Call to Action</span>
            <span className={styles.modernSectionBadge}>{formSelections.productCtaType || "Comment"}</span>
          </div>
          <div className={styles.modernSectionBody}>
            <div className={styles.formGroup}>
              <label className={styles.fieldLabelBold}>Button Type</label>
              <CustomSelect
                value={
                  formSelections.productCtaType && !PRESET_CTA_SET.has(formSelections.productCtaType)
                    ? "Custom"
                    : formSelections.productCtaType || "Comment"
                }
                onChange={(val) =>
                  setFormSelections((prev) => ({
                    ...prev,
                    productCtaType: val === "Custom" ? "" : val,
                    ...(val === "None" ? { productCtaLink: "" } : {}),
                  }))
                }
                options={ENGAGEMENT_CTA_OPTIONS.map((cta) => ({
                  value: cta,
                  label: cta,
                  icon: getCtaIcon(cta),
                }))}
                placeholder="Select Engagement Action"
              />
              {(formSelections.productCtaType === "" ||
                (formSelections.productCtaType && !PRESET_CTA_SET.has(formSelections.productCtaType))) && (
                <div style={{ marginTop: "8px" }}>
                  <input
                    type="text"
                    maxLength={10}
                    value={formSelections.productCtaType}
                    placeholder="Custom button label (max 10 chars)"
                    onChange={(e) =>
                      setFormSelections((prev) => ({
                        ...prev,
                        productCtaType: e.target.value.slice(0, 10),
                      }))
                    }
                    className={styles.inputBox}
                  />
                  <span className={styles.inputHelperText}>
                    {(formSelections.productCtaType || "").length}/10 characters
                  </span>
                </div>
              )}
              {formSelections.productCtaType !== "None" && (
                <div className={styles.ctaPreviewRow}>
                  <span className={styles.ctaPreviewLabel}>Preview:</span>
                  <span className={styles.ctaPreviewBtn}>
                    {getCtaIcon(formSelections.productCtaType || "Comment")}
                    <span>{formSelections.productCtaType || "Comment"}</span>
                  </span>
                </div>
              )}
            </div>

            {formSelections.productCtaType !== "None" && (
            <div className={styles.formGroup}>
              <label className={styles.fieldLabelBold}>
                CTA Target Link (WhatsApp, Chat App, Email or Website)
              </label>
              <input
                type="text"
                value={formSelections.productCtaLink}
                placeholder="e.g. https://wa.me/234... or https://chat.whatsapp.com/... or https://yourlink.com"
                onChange={(e) =>
                  setFormSelections((prev) => ({
                    ...prev,
                    productCtaLink: e.target.value,
                  }))
                }
                className={`${styles.inputBox} ${
                  formSelections.productCtaLink &&
                  !formSelections.productCtaLink.startsWith("https://") &&
                  !formSelections.productCtaLink.startsWith("http://") &&
                  !formSelections.productCtaLink.startsWith("mailto:")
                    ? styles.inputError
                    : ""
                }`}
              />
              <span className={styles.inputHelperText}>Destination link for viewers who tap this button.</span>
              {formSelections.productCtaLink &&
                !formSelections.productCtaLink.startsWith("https://") &&
                !formSelections.productCtaLink.startsWith("http://") &&
                !formSelections.productCtaLink.startsWith("mailto:") && (
                  <p className={styles.error}>
                    Please enter a valid link starting with https:// or mailto:
                  </p>
                )}
            </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.modernSectionCard}>
        <div className={styles.modernSectionHeader}>
          <span className={styles.modernSectionTitle}>
            {adType === "product_sales" ? "Product Description" : "Ad Message Copy"}
          </span>
          <span className={styles.modernSectionBadge}>
            {isLongFormAllowed
              ? `${wordCount.toLocaleString()} / 1,500 words`
              : `${formSelections.adContent.length} / ${charLimit} chars`}
          </span>
        </div>
        <div className={styles.modernSectionBody}>
          <div className={styles.formGroup}>
            <div className={styles.textareaContainerWithCounter}>
              <textarea
                maxLength={isLongFormAllowed ? undefined : charLimit}
                rows={isLongFormAllowed ? 5 : 3}
                value={formSelections.adContent}
                placeholder={
                  adType === "product_sales"
                    ? "Write product description here (no links allowed)"
                    : "Ad message here"
                }
                onChange={(e) => {
                  let nextVal = e.target.value;
                  if (isLongFormAllowed) {
                    const clamped = clampToMaxWords(nextVal, 1500);
                    nextVal = clamped.text;
                  } else if (nextVal.length > charLimit) {
                    nextVal = nextVal.slice(0, charLimit);
                  }
                  setFormSelections((prev) => ({
                    ...prev,
                    adContent: nextVal,
                  }));
                }}
                className={`${styles.inputBox} ${styles.textareaAutoResize} ${
                  containsLink(formSelections.adContent) ? styles.inputError : ""
                }`}
              />
            </div>
            {containsLink(formSelections.adContent) && (
              <p className={styles.error}>Links are not allowed in the ad content.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
