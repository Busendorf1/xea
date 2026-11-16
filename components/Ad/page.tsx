"use client";

import { useEffect, useState, useMemo } from "react";
import { AlertCircle } from "lucide-react";
import styles from "./page.module.css";
import FormStepProgress from "@/components/ui/FormStepProgress";
import { categoryTargetingMap, TARGETING_DIMENSIONS, type AdCategory } from "@/lib/categoryTargetingMap";
import { adAudienceSchema, adCreativeSchema, adCreativeProductSchema } from "@/lib/validationSchemas";
import { isAdminEmail } from "@/lib/adminHelper";
import { showAppleAlert } from "@/components/ui/AppleAlert";
import { formatCurrency as globalFormatCurrency, getLocalizedAdFloorRate } from "@/lib/utils/currency";
import NoticeModal from "@/components/MyAds/NoticeModal";

import {
  Session,
  MultiStepAdFormProps,
  AdComposerInitialProfile,
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
import { useAdCapacityCheck } from "@/lib/hooks/useAdCapacityCheck";

export type { Session, MultiStepAdFormProps };

type AdFormUserProfile = AdComposerInitialProfile & {
  mutual_count: number;
  mutuals: string[];
  balance: number;
};

function normalizeAdInitialProfile(
  profile: AdComposerInitialProfile | null | undefined,
  fallbackEmail?: string | null
): AdFormUserProfile | null {
  if (!profile) return null;
  return {
    ...profile,
    mutual_count: profile.mutual_count ?? 0,
    mutuals: profile.mutuals ?? [],
    last_mutual_spent: profile.last_mutual_spent,
    balance: profile.balance ?? 0,
    country: profile.country ?? null,
    profileImage: profile.profileImage ?? null,
    logo: profile.logo ?? null,
    avatar_url: profile.avatar_url ?? null,
    firstName: profile.firstName ?? null,
    lastName: profile.lastName ?? null,
    username: profile.username ?? null,
    business_name: profile.business_name ?? null,
    monetized: profile.monetized ?? false,
    monetization_clicks: profile.monetization_clicks,
    has_cancelled_monetization: profile.has_cancelled_monetization,
    is_career: profile.is_career,
    is_affiliate: profile.is_affiliate,
    affiliate_role: profile.affiliate_role,
    isExemptFromBarriersAndInactivity: profile.isExemptFromBarriersAndInactivity,
    gender: profile.gender ?? null,
    email: profile.email ?? fallbackEmail ?? null,
  };
}

export default function MultiStepAdForm({ session, initialProfile }: MultiStepAdFormProps) {
  const effectiveEmail = session?.user?.email || initialProfile?.email || null;

  const isAdmin = useMemo(() => {
    return Boolean((session?.user as any)?.isAdmin ?? isAdminEmail(effectiveEmail));
  }, [session?.user, effectiveEmail]);

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
    clearDraft,
    discardDraft,
    exitEditMode,
    hasDraft,
  } = useAdFormDraftAndEdit(effectiveEmail);

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

  const [userProfile, setUserProfile] = useState<AdFormUserProfile | null>(() =>
    normalizeAdInitialProfile(initialProfile, effectiveEmail)
  );

  const advertiserCountry = userProfile?.country || null;
  const formatCurrency = (amount: number | string) => globalFormatCurrency(amount, advertiserCountry);

  const [adAccountRestriction, setAdAccountRestriction] = useState<{
    restricted: boolean;
    status: string;
    reason: string;
    until: string | null;
  }>({ restricted: false, status: "", reason: "", until: null });

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (effectiveEmail) {
        try {
          const res = await fetch("/api/profile");
          if (res.ok) {
            const data = await res.json();
            setUserProfile((prev) => ({
              ...(prev || {}),
              mutual_count: data.mutual_count ?? prev?.mutual_count ?? 0,
              mutuals: data.mutuals ?? prev?.mutuals ?? [],
              last_mutual_spent: data.last_mutual_spent ?? prev?.last_mutual_spent,
              balance: data.balance ?? prev?.balance ?? 0,
              country: data.country ?? prev?.country ?? null,
              profileImage: data.profileImage ?? prev?.profileImage ?? null,
              logo: data.logo ?? prev?.logo ?? null,
              avatar_url: data.avatar_url ?? prev?.avatar_url ?? null,
              firstName: data.firstName ?? prev?.firstName ?? null,
              lastName: data.lastName ?? prev?.lastName ?? null,
              username: data.username ?? prev?.username ?? null,
              business_name: data.business_name ?? prev?.business_name ?? null,
              monetized: data.monetized ?? prev?.monetized ?? false,
              monetization_clicks: data.monetization_clicks ?? prev?.monetization_clicks,
              has_cancelled_monetization:
                data.has_cancelled_monetization ?? prev?.has_cancelled_monetization,
              is_career: data.is_career ?? prev?.is_career,
              is_affiliate: data.is_affiliate ?? prev?.is_affiliate,
              affiliate_role: data.affiliate_role ?? prev?.affiliate_role,
              isExemptFromBarriersAndInactivity:
                data.isExemptFromBarriersAndInactivity ??
                prev?.isExemptFromBarriersAndInactivity,
              gender: data.gender ?? prev?.gender ?? null,
              email: data.email ?? effectiveEmail ?? null,
            }));

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
    const floorRate = getLocalizedAdFloorRate(adType, advertiserCountry);
    let baseRate = floorRate;
    if (isBiddingEnabled && bidPrice > 0) {
      baseRate = Math.max(floorRate, bidPrice);
    }
    if (adType === "product_sales" && isSubsidizedLink(formSelections.productCtaLink)) {
      return Number((baseRate * 0.7).toFixed(2)); // 30% discount
    }
    return baseRate;
  };

  const calculateTotalCost = () => {
    if (isAdmin) return 0;
    return Number((calculateTotalCostPerImpression() * formSelections.impressions).toFixed(2));
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
    onDraftClear: () => clearDraft(true),
  });

  const { capacity, checkingCapacity, retryCapacityCheck } = useAdCapacityCheck({
    enabled: !isAdmin && (step === 2 || step === 4 || step === 5),
    impressions: formSelections.impressions,
    campaignDays: formSelections.campaignDays,
    userFrequencyCap: formSelections.userFrequencyCap,
    targetingAll: formSelections.targetingAll,
    country: formSelections.country,
    state: formSelections.state,
    province:
      formSelections.targetLocations && formSelections.targetLocations.length > 0
        ? formSelections.targetLocations.join("; ")
        : formSelections.province,
    gender: formSelections.gender,
    ageRange: formSelections.ageRange,
    employmentStatus: formSelections.employmentStatus,
    industry: formSelections.industry,
    interest: formSelections.interest,
    lifestyle: formSelections.lifestyle,
    behavior: formSelections.behavior,
    personality: formSelections.personality,
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
    if (!Number.isFinite(formSelections.impressions) || formSelections.impressions < 100) {
      setStepError("Minimum 100 attentions");
      return false;
    }
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
    if (!isAdmin && capacity?.telemetryAvailable && !capacity.allowed) {
      setStepError(capacity.message);
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
        setStepError("You can upload at most 2 videos (up to 3 minutes / 180 seconds each).");
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
                onClick={exitEditMode}
                className={styles.switchCampaignBtn}
              >
                Switch to Create New Campaign
              </button>
            </div>
          )}

          {!editingId && hasDraft && (
            <div className={styles.editingSwitchWrapper}>
              <button
                type="button"
                onClick={discardDraft}
                className={styles.switchCampaignBtn}
              >
                Discard Draft
              </button>
            </div>
          )}

          <AdPendingLimitBanner pendingLimitReached={pendingLimitReached} editingId={editingId} />

          

          {step === 0 && (
            <Step0Category adType={adType} setAdType={setAdType} formatCurrency={formatCurrency} country={advertiserCountry} />
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
              capacity={isAdmin ? null : capacity}
              checkingCapacity={isAdmin ? false : checkingCapacity}
              onRetryCapacity={isAdmin ? undefined : retryCapacityCheck}
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
              country={advertiserCountry}
              userProfile={userProfile}
              formatCurrency={formatCurrency}
              calculateTotalCostPerImpression={calculateTotalCostPerImpression}
              calculateTotalCost={calculateTotalCost}
              isBiddingEnabled={isBiddingEnabled}
              setIsBiddingEnabled={setIsBiddingEnabled}
              bidPrice={bidPrice}
              setBidPrice={setBidPrice}
              capacity={isAdmin ? null : capacity}
              onApplyCapacityCap={(maxCap) =>
                setFormSelections((prev) => ({ ...prev, impressions: maxCap }))
              }
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
              sessionImage={session?.user?.image || null}
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
