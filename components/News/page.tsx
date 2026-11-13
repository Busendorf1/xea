"use client";

import React from "react";
import { AnimatePresence } from "framer-motion";
import FormStepProgress from "@/components/ui/FormStepProgress";
import NoticeModal from "@/components/MyAds/NoticeModal";
import { globalFormatCurrency } from "./newsCurrencyHelper";
import { NEWS_STEPS, NewsSession, capitalizeFirst } from "./newsUtils";
import { useNewsComposer } from "./useNewsComposer";
import {
  RestrictedAccountCard,
  PendingLimitBanner,
  NewsStepMedia,
  NewsStepTitle,
  NewsStepContent,
} from "./NewsBasicSteps";
import { NewsStepTargeting, NewsStepPreview } from "./NewsSteps";
import styles from "./page.module.css";

type NewsProps = {
  session: NewsSession;
};

export default function News({ session }: NewsProps) {
  const composer = useNewsComposer(session);
  const {
    isAdmin,
    customSponsorName,
    setCustomSponsorName,
    customSponsorHandle,
    setCustomSponsorHandle,
    step,
    setStep,
    mediaFile,
    setMediaFile,
    mediaPreview,
    setMediaPreview,
    title,
    setTitle,
    content,
    setContent,
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
    editingId,
    isLoadingEdit,
    existingImageUrl,
    setExistingImageUrl,
    noticeModal,
    setNoticeModal,
    isSubmitting,
    agreedToPolicy,
    setAgreedToPolicy,
    isAiContent,
    setIsAiContent,
    stepError,
    setStepError,
    statusNotice,
    pendingLimitReached,
    adAccountRestriction,
    handleMediaChange,
    handleInitiateSubmit,
    canNavigateToStep,
  } = composer;

  if (adAccountRestriction.restricted) {
    return <RestrictedAccountCard restriction={adAccountRestriction} />;
  }

  return (
    <div className={styles.pageWrapper}>
      <FormStepProgress
        steps={NEWS_STEPS}
        currentStep={step}
        onStepClick={(idx) => {
          if (canNavigateToStep(idx)) {
            setStepError(null);
            setStep(idx);
          }
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1>{editingId ? "Edit Highlight" : "New Highlight"}</h1>
        {editingId && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              try {
                sessionStorage.removeItem("paayh_edit_news_id");
                sessionStorage.removeItem("paayh_edit_news");
              } catch {}
              window.location.href = "/myAds";
            }}
            className={styles.secondaryNavBtn}
            style={{ padding: "6px 14px", fontSize: "0.85rem" }}
          >
            Cancel Edit
          </button>
        )}
      </div>

      {pendingLimitReached && !editingId && <PendingLimitBanner />}

      {isLoadingEdit && (
        <div className={styles.statusAlert}>Loading highlight details for editing…</div>
      )}

      {stepError && <div className={styles.errorAlert} role="alert">{stepError}</div>}

      {statusNotice && <div className={styles.statusAlert}>{statusNotice}</div>}

      <div className={styles.adFormContainer}>
        <AnimatePresence mode="wait">
          {step === 0 && (
            <NewsStepMedia
              mediaPreview={mediaPreview}
              hasCover={!!mediaFile || !!existingImageUrl}
              onMediaChange={handleMediaChange}
              onClearMedia={() => {
                setMediaFile(null);
                setMediaPreview(null);
                setExistingImageUrl(null);
              }}
              onNext={() => setStep(1)}
            />
          )}

          {step === 1 && (
            <NewsStepTitle
              title={title}
              setTitle={setTitle}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <NewsStepContent
              content={content}
              setContent={setContent}
              clearError={() => stepError && setStepError(null)}
              setError={(msg) => setStepError(msg)}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}

          {step === 3 && (
            <NewsStepTargeting
              isAdmin={isAdmin}
              customSponsorName={customSponsorName}
              setCustomSponsorName={setCustomSponsorName}
              customSponsorHandle={customSponsorHandle}
              setCustomSponsorHandle={setCustomSponsorHandle}
              interest={interest}
              setInterest={setInterest}
              country={country}
              setCountry={setCountry}
              state={state}
              setState={setState}
              province={province}
              setProvince={setProvince}
              campaignDays={campaignDays}
              setCampaignDays={setCampaignDays}
              scheduledStartAt={scheduledStartAt}
              setScheduledStartAt={setScheduledStartAt}
              isBiddingEnabled={isBiddingEnabled}
              setIsBiddingEnabled={setIsBiddingEnabled}
              bidPrice={bidPrice}
              setBidPrice={setBidPrice}
              highestBid={highestBid}
              formatCurrency={(amount) => globalFormatCurrency(amount, country)}
              setStep={setStep}
            />
          )}

          {step === 4 && (
            <NewsStepPreview
              mediaPreview={mediaPreview}
              setMediaPreview={setMediaPreview}
              interest={interest}
              title={title}
              content={content}
              country={country}
              state={state}
              campaignDays={campaignDays}
              isBiddingEnabled={isBiddingEnabled}
              bidPrice={bidPrice}
              isAdmin={isAdmin}
              isAiContent={isAiContent}
              setIsAiContent={setIsAiContent}
              agreedToPolicy={agreedToPolicy}
              setAgreedToPolicy={setAgreedToPolicy}
              isSubmitting={isSubmitting}
              setStep={setStep}
              handleInitiateSubmit={handleInitiateSubmit}
              capitalizeFirst={capitalizeFirst}
            />
          )}
        </AnimatePresence>
      </div>

      <NoticeModal notice={noticeModal} onClose={() => setNoticeModal(null)} />
    </div>
  );
}
