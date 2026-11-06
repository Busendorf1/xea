"use client";

import React from "react";
import TermsAgreementCheckbox from "@/components/ui/TermsAgreementCheckbox/TermsAgreementCheckbox";
import dynamic from "next/dynamic";
import PaymentConfirmationModal from "@/components/ui/PaymentConfirmationModal";
import { AdFormSelections } from "./types";
import styles from "./page.module.css";

const AdPreviewCard = dynamic(() => import("../Adreview/page"));

interface Step5LaunchProps {
  formSelections: AdFormSelections;
  adType: string;
  isAdmin: boolean;
  paymentMethod: "card" | "wallet";
  setPaymentMethod: (m: "card" | "wallet") => void;
  userProfile: {
    mutual_count: number;
    mutuals: string[];
    last_mutual_spent?: string;
    balance: number;
  } | null;
  formatCurrency: (amount: number | string) => string;
  isAiContent: boolean;
  setIsAiContent: (val: boolean) => void;
  agreedToPolicy: boolean;
  setAgreedToPolicy: (val: boolean) => void;
  isSubmitting: boolean;
  handleInitiateSubmit: () => void;
  showPaymentConfirmModal: boolean;
  setShowPaymentConfirmModal: (val: boolean) => void;
  submitAd: () => void;
  calculateTotalCost: () => number;
}

export default function Step5Launch({
  formSelections,
  adType,
  isAdmin,
  paymentMethod,
  setPaymentMethod,
  userProfile,
  formatCurrency,
  isAiContent,
  setIsAiContent,
  agreedToPolicy,
  setAgreedToPolicy,
  isSubmitting,
  handleInitiateSubmit,
  showPaymentConfirmModal,
  setShowPaymentConfirmModal,
  submitAd,
  calculateTotalCost,
}: Step5LaunchProps) {
  return (
    <>
      <h2 className={styles.centeredHeading}>Ad Preview</h2>

      <AdPreviewCard
        mediaFiles={formSelections.adMediaFiles}
        mediaType={formSelections.adMediaType}
        existingMedia={formSelections.existingMedia}
        adContent={formSelections.adContent}
        actionButtons={formSelections.adActionButtons}
        actionDetails={formSelections.actionDetails}
        displayMutualButton={formSelections.displayMutualButton}
        adType={adType}
        productName={formSelections.productName}
        productPrice={formSelections.productPrice}
        productCtaType={formSelections.productCtaType}
        productCtaLink={formSelections.productCtaLink}
      />

      {isAdmin ? (
        <div className={styles.adminFreeBanner}>
          <p className={styles.adminFreeHeading}>
            Admin: Free Publishing
          </p>
          <p className={styles.adminFreeSubtext}>
            No charge or wallet deduction required.
          </p>
        </div>
      ) : (
        <div style={{ margin: "1.25rem 0 1rem", textAlign: "left" }}>
          <h4 style={{ margin: "0 0 0.25rem", fontSize: "0.925rem", fontWeight: 600, color: "var(--foreground)" }}>
            Pay on Approval
          </h4>
          <p style={{ margin: 0, fontSize: "0.825rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
            Once approved, pay and launch from My Ads.
          </p>
        </div>
      )}

      {/* AI Content Disclosure Toggle */}
      <div className={styles.aiDisclosureBox}>
        <div className={styles.aiDisclosureTextContainer}>
          <span className={styles.aiDisclosureTitle}>AI-generated content</span>
          <span className={styles.aiDisclosureDesc}>
            Enable if ad uses AI-generated media or copy.
          </span>
        </div>
        <label className={styles.aiSwitch}>
          <input
            type="checkbox"
            checked={isAiContent}
            onChange={(e) => setIsAiContent(e.target.checked)}
            className={styles.aiSwitchInput}
          />
          <span className={`${styles.aiSwitchSlider} ${isAiContent ? styles.aiSwitchSliderActive : ""}`}>
            <span className={`${styles.aiSwitchThumb} ${isAiContent ? styles.aiSwitchThumbActive : ""}`} />
          </span>
        </label>
      </div>

      <TermsAgreementCheckbox
        id="adTermsPolicyCheckbox"
        checked={agreedToPolicy}
        onChange={setAgreedToPolicy}
        instruction="Review advertising terms and policies:"
        terms={[
          { label: "Terms of Service", href: "/terms" },
          { label: "Advertising Guidelines", href: "/advertiser-guidelines" },
          { label: "Non-Refundable Policy", href: "/terms" },
          { label: "Privacy Policy", href: "/privacy" },
        ]}
        checkboxLabel="I accept the Advertising Policies and Non-Refundable Terms, and confirm this ad complies with guidelines."
        required
      />

      <button
        className={`${styles.submitButton} ${styles.submitButtonContent}`}
        onClick={handleInitiateSubmit}
        disabled={isSubmitting || !agreedToPolicy}
      >
        {isSubmitting ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span className="btnSpinner" aria-hidden="true" />
            <span>Submitting for Review...</span>
          </span>
        ) : isAdmin ? (
          <>Publish (Admin)</>
        ) : (
          <>Submit for Review</>
        )}
      </button>

      <PaymentConfirmationModal
        isOpen={showPaymentConfirmModal}
        onClose={() => setShowPaymentConfirmModal(false)}
        onConfirm={submitAd}
        serviceTitle="Sponsored Ad Campaign"
        amountFormatted={formatCurrency(calculateTotalCost())}
        paymentMethodText={paymentMethod === "wallet" ? "Wallet Balance" : "Card / Bank Transfer"}
        summaryItems={[
          { label: "Target Attention", value: `${formSelections.impressions.toLocaleString()} views` },
          {
            label: "Duration",
            value: `${formSelections.campaignDays} ${formSelections.campaignDays === 1 ? "day" : "days"}`,
          },
          { label: "Ad Type", value: adType === "product_sales" ? "Product Sales" : "Standard Promo" },
        ]}
        isSubmitting={isSubmitting}
      />
    </>
  );
}
