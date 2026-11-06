"use client";

import { useEffect, useState, useMemo } from "react";
import { AlertCircle } from "lucide-react";
import styles from "./page.module.css";
import FormStepProgress from "@/components/ui/FormStepProgress";
import { categoryTargetingMap, TARGETING_DIMENSIONS, type AdCategory } from "@/lib/categoryTargetingMap";
import { adAudienceSchema, adCreativeSchema, adCreativeProductSchema } from "@/lib/validationSchemas";
import { isAdminEmail } from "@/lib/adminHelper";
import { showAppleAlert } from "@/components/ui/AppleAlert";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";
import NoticeModal from "@/components/MyAds/NoticeModal";

import {
  Session,
  MultiStepAdFormProps,
  adRates,
  steps,
  Category,
} from "./types";
import Step0Category from "./Step0Category";
import Step1Targeting from "./Step1Targeting";
import Step2Budget from "./Step2Budget";
import Step3Creative from "./Step3Creative";
import Step4Summary from "./Step4Summary";
import Step5Launch from "./Step5Launch";
import AdAccountSuspendedCard from "./AdAccountSuspendedCard";
import AdPendingLimitBanner from "./AdPendingLimitBanner";
import { useAdFormDraftAndEdit } from "./useAdFormDraftAndEdit";
import { useAdSubmission } from "./useAdSubmission";

export type { Session, MultiStepAdFormProps };

export default function MultiStepAdForm({ session }: MultiStepAdFormProps) {
  const isAdmin = useMemo(() => {
    return Boolean((session?.user as any)?.isAdmin ?? isAdminEmail(session?.user?.email));
  }, [session?.user]);

  const {
    editingId,
    setEditingId,
    isDeliveringActive,
    setIsDeliveringActive,
    originalTotalCost,
    setOriginalTotalCost,
    step,
    setStep,
    adType,
    setAdType,
    isBiddingEnabled,
    setIsBiddingEnabled,
    bidPrice,
    setBidPrice,
    isAiContent,
    setIsAiContent,
    formSelections,
    setFormSelections,
    resetForm,
  } = useAdFormDraftAndEdit();

  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "wallet">("card");

  // Derive targeting options from selected ad category
  const optionsMap = useMemo(
    () => categoryTargetingMap[adType as AdCategory] ?? categoryTargetingMap["individual"],
    [adType]
  );

  const activeCategories = useMemo(
    () => TARGETING_DIMENSIONS.filter((dim) => optionsMap[dim]?.length > 0),
    [optionsMap]
  );

  const [userProfile, setUserProfile] = useState<{
    mutual_count: number;
    mutuals: string[];
    last_mutual_spent?: string;
    balance: number;
  } | null>(null);

  const formatCurrency = (amount: number | string) => globalFormatCurrency(amount, formSelections.country);

  const [adAccountRestriction, setAdAccountRestriction] = useState<{
    restricted: boolean;
    status: string;
    reason: string;
    until: string | null;
  }>({ restricted: false, status: "", reason: "", until: null });

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (session?.user?.email) {
        try {
          const res = await fetch("/api/profile");
          if (res.ok) {
            const data = await res.json();
            setUserProfile({
              mutual_count: data.mutual_count ?? 0,
              mutuals: data.mutuals ?? [],
              last_mutual_spent: data.last_mutual_spent,
              balance: data.balance ?? 0,
            });

            const status = data.ad_account_status;
            const until = data.ad_ban_until;
            const reason = data.ad_ban_reason || "";
            const isTempBanned = status === "temp_banned" && until && new Date(until).getTime() > Date.now();
            const isPermBanned = status === "perm_banned";
            const isDeactivated = status === "deactivated";

            if (isTempBanned || isPermBanned || isDeactivated) {
              setAdAccountRestriction({
                restricted: true,
                status: isTempBanned ? "temp_banned" : isPermBanned ? "perm_banned" : "deactivated",
                reason,
                until,
              });
            }
          }
        } catch (e) {
          console.error("Error fetching user profile:", e);
        }
      }
    };
    fetchUserProfile();
  }, [session]);

  const toggleSelection = (type: Category, value: string) => {
    setFormSelections((prev) => {
      const list = prev[type] || [];
      const updated = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [type]: updated };
    });
  };

  const toggleEmploymentStatus = (status: string) => {
    setFormSelections((prev) => {
      const currentList = Array.isArray(prev.employmentStatus)
        ? prev.employmentStatus
        : prev.employmentStatus
        ? (prev.employmentStatus as string).split(",").map((s) => s.trim())
        : [];

      let updated: string[];
      if (currentList.includes(status)) {
        updated = currentList.filter((s) => s !== status);
      } else {
        if (currentList.length >= 4) {
          showAppleAlert("You can select up to 4 employment statuses.", "warning");
          return prev;
        }
        updated = [...currentList, status];
      }
      return { ...prev, employmentStatus: updated };
    });
  };

  const handleTargetAll = (cat: Category, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const allOptions = optionsMap[cat] ?? [];
    setFormSelections((prev) => {
      const currentList = prev[cat] || [];
      const isAllSelected = allOptions.length > 0 && allOptions.every((opt) => currentList.includes(opt));
      return {
        ...prev,
        [cat]: isAllSelected ? [] : [...allOptions],
      };
    });
  };

  const [activeSubscribers, setActiveSubscribers] = useState<string[]>(["baggyt.com"]);

  useEffect(() => {
    let isMounted = true;
    const CACHE_KEY = "paayh_active_subscribers_v1";
    const FIVE_MINS = 5 * 60 * 1000;

    const fetchActiveSubscribers = async () => {
      try {
        if (typeof window !== "undefined") {
          const cachedRaw = sessionStorage.getItem(CACHE_KEY);
          if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            if (parsed?.ts && Date.now() - parsed.ts < FIVE_MINS && Array.isArray(parsed.domains)) {
              if (isMounted) setActiveSubscribers(parsed.domains);
              return;
            }
          }
        }

        const res = await fetch("/api/business/subscribe");
        if (res.ok) {
          const data = await res.json();
          if (data.subscribers && Array.isArray(data.subscribers) && isMounted) {
            const domains = data.subscribers
              .filter((s: any) => s.status === "active" && (s.payment_status === "paid" || s.domain === "baggyt.com"))
              .map((s: any) => s.domain.toLowerCase().trim())
              .filter(Boolean);
            const deduped = Array.from(new Set(["baggyt.com", ...domains]));
            setActiveSubscribers(deduped);
            if (typeof window !== "undefined") {
              try {
                sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), domains: deduped }));
              } catch {}
            }
          }
        }
      } catch (e) {}
    };
    fetchActiveSubscribers();
    return () => {
      isMounted = false;
    };
  }, []);

  const isSubsidizedLink = (link?: string) => {
    if (!link) return false;
    const cleaned = link.toLowerCase().trim();
    return activeSubscribers.some((domain) => cleaned.includes(domain));
  };

  const calculateTotalCostPerImpression = () => {
    if (isAdmin) return 0;
    let baseRate = adRates[adType] || 55;
    if (isBiddingEnabled && bidPrice > 0) {
      baseRate = bidPrice;
    }
    if (adType === "product_sales" && isSubsidizedLink(formSelections.productCtaLink)) {
      return baseRate * 0.7; // 30% discount
    }
    return baseRate;
  };

  const calculateTotalCost = () => {
    if (isAdmin) return 0;
    return calculateTotalCostPerImpression() * formSelections.impressions;
  };

  const {
    isSubmitting,
    stepError,
    setStepError,
    noticeModal,
    setNoticeModal,
    pendingLimitReached,
    setPendingLimitReached,
    handleInitiateSubmit,
    submitAd,
  } = useAdSubmission({
    session,
    isAdmin,
    editingId,
    isDeliveringActive,
    originalTotalCost,
    formSelections,
    adType,
    isBiddingEnabled,
    bidPrice,
    isAiContent,
    paymentMethod,
    userProfile,
    agreedToPolicy,
    calculateTotalCost,
    calculateTotalCostPerImpression,
    formatCurrency,
  });

  useEffect(() => {
    if (editingId) return;
    fetch("/api/campaigns")
      .then((res) => res.json())
      .then((data) => {
        const queueList = data?.adsQueue || data?.reviewAds;
        if (queueList && Array.isArray(queueList)) {
          const approvedUnpaidCount = queueList.filter((ad: any) => {
            if (ad.admin_statement?.startsWith("APPROVED:")) {
              const parts = ad.admin_statement.split("APPROVED:");
              if (parts[1]) {
                const approvedTime = new Date(parts[1].trim()).getTime();
                if (!isNaN(approvedTime) && Date.now() - approvedTime > 72 * 60 * 60 * 1000) {
                  return false;
                }
              }
              return true;
            }
            return false;
          }).length;
          if (approvedUnpaidCount >= 2) {
            setPendingLimitReached(true);
          }
        }
      })
      .catch(() => {});
  }, [editingId, setPendingLimitReached]);

  /** Step 2 — audience / budget validation */
  const validateStep2 = (): boolean => {
    setStepError("");
    const result = adAudienceSchema.safeParse({
      impressions: formSelections.impressions,
      campaignDays: formSelections.campaignDays,
      userFrequencyCap: formSelections.userFrequencyCap,
      minAge: formSelections.ageRange[0],
      maxAge: formSelections.ageRange[1],
    });
    if (!result.success) {
      setStepError(result.error.issues[0]?.message ?? "Please fix the audience details.");
      return false;
    }
    return true;
  };

  /** Step 3 — creative validation */
  const validateStep3 = (): boolean => {
    setStepError("");
    if (!formSelections.adMediaType) {
      setStepError("Please select an ad media type.");
      return false;
    }
    if (
      formSelections.adMediaType !== "text" &&
      formSelections.adMediaFiles.length === 0 &&
      !formSelections.existingMedia
    ) {
      setStepError("Please upload at least one media file.");
      return false;
    }

    if (formSelections.adMediaFiles.length > 0) {
      const imagesCount = formSelections.adMediaFiles.filter(
        (f) => f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f.name)
      ).length;
      const videosCount = formSelections.adMediaFiles.filter(
        (f) => f.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(f.name)
      ).length;

      if (formSelections.adMediaFiles.length > 4) {
        setStepError("Total media files cannot exceed 4 combinations.");
        return false;
      }
      if (videosCount > 2) {
        setStepError("You can upload at most 2 videos (up to 60 minutes each).");
        return false;
      }
      if (formSelections.adMediaType === "mixed" && (imagesCount === 0 || videosCount === 0)) {
        setStepError("Mixed Media requires at least 1 image and 1 video (up to 4 files total, max 2 videos).");
        return false;
      }
    }

    const hasPrimaryCta = Boolean(formSelections.productCtaLink?.trim()) || adType === "product_sales";
    const maxButtons = hasPrimaryCta ? 2 : 3;
    if (formSelections.adActionButtons.length > maxButtons) {
      setStepError(
        hasPrimaryCta
          ? `When a primary CTA ("${formSelections.productCtaType || "Comment"}") is active, you can select at most ${maxButtons} contact buttons to ensure clean mobile spacing.`
          : `For ${adType.replace("_", " ")} ads, you can select at most ${maxButtons} contact buttons.`
      );
      return false;
    }

    if (adType === "product_sales") {
      const result = adCreativeProductSchema.safeParse({
        adContent: formSelections.adContent,
        productName: formSelections.productName,
        productPrice: formSelections.productPrice,
        productCtaLink: formSelections.productCtaLink,
        actionDetails: formSelections.actionDetails,
      });
      if (!result.success) {
        setStepError(result.error.issues[0]?.message ?? "Please fix the ad creative.");
        return false;
      }
    } else {
      const result = adCreativeSchema.safeParse({
        adContent: formSelections.adContent,
        adMediaType: formSelections.adMediaType,
        actionDetails: formSelections.actionDetails,
        adActionButtons: formSelections.adActionButtons,
      });
      if (!result.success) {
        setStepError(result.error.issues[0]?.message ?? "Please fix the ad content.");
        return false;
      }
    }
    return true;
  };

  if (adAccountRestriction.restricted) {
    return <AdAccountSuspendedCard adAccountRestriction={adAccountRestriction} />;
  }

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.adFormContainer}>
          <FormStepProgress
            className={styles.adStepProgress}
            steps={steps}
            currentStep={step}
            onStepClick={(idx) => {
              setStepError("");
              setStep(idx);
            }}
          />

          <div className={styles.pageHeaderGroup}>
            <h1 className={styles.pageHeading}>
              {editingId ? "Edit Campaign" : "New Campaign"}
            </h1>
            <p className={styles.pageSubtitle}>
              {editingId ? "Update targeting, creative, or duration." : "Target verified audiences across the feed."}
            </p>
          </div>

          {editingId && (
            <div className={styles.editingSwitchWrapper}>
              <button
                type="button"
                onClick={resetForm}
                className={styles.switchCampaignBtn}
              >
                Switch to Create New Campaign
              </button>
            </div>
          )}

          <AdPendingLimitBanner pendingLimitReached={pendingLimitReached} editingId={editingId} />

          

          {step === 0 && (
            <Step0Category adType={adType} setAdType={setAdType} formatCurrency={formatCurrency} />
          )}

          {step === 1 && (
            <Step1Targeting
              adType={adType}
              activeCategories={activeCategories as Category[]}
              optionsMap={optionsMap}
              formSelections={formSelections}
              toggleSelection={toggleSelection}
              handleTargetAll={handleTargetAll}
            />
          )}

          {step === 2 && (
            <Step2Budget
              formSelections={formSelections}
              setFormSelections={setFormSelections}
              userProfile={userProfile}
              toggleEmploymentStatus={toggleEmploymentStatus}
            />
          )}

          {step === 3 && (
            <Step3Creative
              formSelections={formSelections}
              setFormSelections={setFormSelections}
              adType={adType}
              isAdmin={isAdmin}
            />
          )}

          {step === 4 && (
            <Step4Summary
              formSelections={formSelections}
              adType={adType}
              userProfile={userProfile}
              formatCurrency={formatCurrency}
              calculateTotalCostPerImpression={calculateTotalCostPerImpression}
              calculateTotalCost={calculateTotalCost}
              isBiddingEnabled={isBiddingEnabled}
              setIsBiddingEnabled={setIsBiddingEnabled}
              bidPrice={bidPrice}
              setBidPrice={setBidPrice}
            />
          )}

          {step === 5 && (
            <Step5Launch
              formSelections={formSelections}
              adType={adType}
              isAdmin={isAdmin}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              userProfile={userProfile}
              formatCurrency={formatCurrency}
              isAiContent={isAiContent}
              setIsAiContent={setIsAiContent}
              agreedToPolicy={agreedToPolicy}
              setAgreedToPolicy={setAgreedToPolicy}
              isSubmitting={isSubmitting}
              handleInitiateSubmit={handleInitiateSubmit}
              showPaymentConfirmModal={showPaymentConfirmModal}
              setShowPaymentConfirmModal={setShowPaymentConfirmModal}
              submitAd={submitAd}
              calculateTotalCost={calculateTotalCost}
            />
          )}

          <div className={styles.buttonGroup}>
            {step > 0 && (
              <button
                onClick={() => {
                  setStepError("");
                  setStep(step - 1);
                }}
              >
                Back
              </button>
            )}
            {stepError && !stepError.includes("limit of 2") && (
              <span className={styles.stepValidationError}>
                <AlertCircle size={14} color="#ef4444" /> {stepError}
              </span>
            )}
            {step < 5 && (
              <button
                onClick={() => {
                  if (step === 2 && !validateStep2()) return;
                  if (step === 3 && !validateStep3()) return;
                  setStepError("");
                  setStep(step + 1);
                }}
              >
                Next
              </button>
            )}
          </div>
        </div>
        <NoticeModal notice={noticeModal} onClose={() => setNoticeModal(null)} />
      </div>
    );
  }
