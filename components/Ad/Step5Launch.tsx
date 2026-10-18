"use client";

import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Crown, Rocket } from "lucide-react";
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
      <h2 className={styles.centeredHeading}>Preview Your Ad</h2>

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
            <Crown size={18} color="var(--primary)" /> Admin Privilege: 100% Free Campaign Publishing (₦0.00 Total)
          </p>
          <p className={styles.adminFreeSubtext}>
            No payment gateway or wallet balance deduction required.
          </p>
        </div>
      ) : (
        <div className={styles.paymentSection}>
          <div className={styles.paymentTitle}>Payment Method</div>
          <div className={styles.paymentOptions}>
            <div
              className={`${styles.paymentOptionCard} ${paymentMethod === "card" ? styles.paymentOptionCardActive : ""}`}
              onClick={() => setPaymentMethod("card")}
            >
              <div className={styles.paymentOptionName}>Card / Bank</div>
              <div className={styles.paymentOptionSub}>Debit Card, USSD, Bank Transfer</div>
            </div>
            <div
              className={`${styles.paymentOptionCard} ${paymentMethod === "wallet" ? styles.paymentOptionCardActive : ""}`}
              onClick={() => setPaymentMethod("wallet")}
            >
              <div className={styles.paymentOptionName}>Wallet Balance</div>
              <div className={styles.paymentOptionSub}>Available: {formatCurrency(userProfile?.balance ?? 0)}</div>
            </div>
          </div>
        </div>
      )}

      {/* AI Content Disclosure Toggle */}
      <div className={styles.aiDisclosureBox}>
        <div className={styles.aiDisclosureTextContainer}>
          <span className={styles.aiDisclosureTitle}>AI-generated content</span>
          <span className={styles.aiDisclosureDesc}>
            Turn this on if your ad contains media or text generated or altered using AI tools.
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

      <div className={styles.termsPolicyBox}>
        <input
          type="checkbox"
          id="adTermsPolicyCheckbox"
          checked={agreedToPolicy}
          onChange={(e) => setAgreedToPolicy(e.target.checked)}
          className={styles.termsCheckbox}
        />
        <label htmlFor="adTermsPolicyCheckbox" className={styles.termsLabel}>
          I have reviewed my ad details and agree to Paayh&apos;s{" "}
          <Link href="/terms" target="_blank" className={styles.termsLink}>
            Terms of Service
          </Link>
          ,{" "}
          <Link href="/advertiser-guidelines" target="_blank" className={styles.termsLink}>
            Advertising Guidelines
          </Link>
          , and{" "}
          <Link href="/privacy" target="_blank" className={styles.termsLink}>
            Privacy Policy
          </Link>
          .
        </label>
      </div>

      <button
        className={`${styles.submitButton} ${styles.submitButtonContent}`}
        onClick={handleInitiateSubmit}
        disabled={isSubmitting || !agreedToPolicy}
      >
        {isSubmitting ? (
          "Processing..."
        ) : isAdmin ? (
          <>
            <Rocket size={16} /> Publish (Admin)
          </>
        ) : (
          "Submit"
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
