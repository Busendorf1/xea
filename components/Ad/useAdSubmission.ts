"use client";

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import supabase from "@/lib/utils/db";
import { resizeImageToMax1080p, compressVideoIfHeavy } from "@/lib/utils/mediaOptimizer";
import { clearUserCampaignsCache } from "@/lib/campaignsClient";
import { showAppleAlert } from "@/components/ui/AppleAlert";
import { NoticeModalData } from "@/components/MyAds/NoticeModal";
import { AdFormSelections, Session } from "./types";

export interface UseAdSubmissionProps {
  session: Session | null;
  isAdmin: boolean;
  editingId: string | null;
  isDeliveringActive: boolean;
  originalTotalCost: number;
  formSelections: AdFormSelections;
  adType: string;
  isBiddingEnabled: boolean;
  bidPrice: number;
  isAiContent: boolean;
  paymentMethod: "card" | "wallet";
  userProfile: {
    balance: number;
    mutual_count?: number;
    mutuals?: string[];
  } | null;
  agreedToPolicy: boolean;
  calculateTotalCost: () => number;
  calculateTotalCostPerImpression: () => number;
  formatCurrency: (amount: number | string) => string;
}

export function useAdSubmission({
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
}: UseAdSubmissionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stepError, setStepError] = useState("");
  const [noticeModal, setNoticeModal] = useState<NoticeModalData | null>(null);
  const [pendingLimitReached, setPendingLimitReached] = useState(false);

  const handleInitiateSubmit = () => {
    if (isSubmitting) return;
    setStepError("");
    if (!session || !session.user?.email) {
      setStepError("User not authenticated. Please log in.");
      return;
    }

    if (!agreedToPolicy) {
      setStepError("Please confirm your agreement to Paayh's Advertising Guidelines and Terms of Service.");
      return;
    }

    const currentTotalCost = calculateTotalCost();
    if (isDeliveringActive && currentTotalCost < originalTotalCost) {
      setNoticeModal({
        title: "Budget Reduction Notice",
        message: `You are reducing your campaign budget from ${formatCurrency(originalTotalCost)} to ${formatCurrency(currentTotalCost)}. Because advertising payments are strictly non-refundable, reducing your budget will not result in a refund of previously paid funds. Your campaign will continue delivering under the updated settings until complete, after which it will be archived.`,
        confirmText: "Proceed",
        cancelText: "Not Now",
        onConfirm: async () => {
          setNoticeModal(null);
          await submitAd();
        },
      });
      return;
    }

    submitAd();
  };

  const submitAd = async () => {
    if (isSubmitting) return;
    setStepError("");
    if (!session || !session.user?.email) {
      setStepError("User not authenticated. Please log in.");
      return;
    }

    const adId = editingId || uuidv4();
    const costPerImpression = calculateTotalCostPerImpression();
    const totalCost = calculateTotalCost();

    if (!isAdmin && paymentMethod === "wallet" && userProfile && userProfile.balance < totalCost) {
      setStepError(
        `Insufficient wallet balance. Your balance is ${formatCurrency(userProfile.balance)} but this campaign costs ${formatCurrency(totalCost)}.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      let mediaUrlString: string | null = formSelections.existingMedia || null;

      if (formSelections.adMediaFiles && formSelections.adMediaFiles.length > 0) {
        const uploadPromises = formSelections.adMediaFiles.map(async (file, i) => {
          const sanitizedFileName = file.name.replace(/[^\w.-]/g, "_");
          const uniqueFileName = `${adId}_${i}_${sanitizedFileName}`;
          const isVid = file.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(file.name);

          let optimizedFile: File | Blob = file;
          if (!isVid && file instanceof File) {
            try {
              optimizedFile = await resizeImageToMax1080p(file);
            } catch (optErr) {
              console.warn("Image 1080p optimization notice:", optErr);
            }
          } else if (isVid && file instanceof File) {
            try {
              optimizedFile = await compressVideoIfHeavy(file);
            } catch (vidOptErr) {
              console.warn("Video compression notice:", vidOptErr);
            }
          }

          const resolvedContentType = file.type || (isVid ? "video/mp4" : "image/jpeg");

          // 1. Prefer Enterprise Server-Signed Upload URL (zero anon-key bucket exposure & streamable Blob)
          try {
            const signRes = await fetch("/api/campaigns/upload-url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bucket: "ad-media", fileName: uniqueFileName }),
            });
            if (signRes.ok) {
              const signJson = await signRes.json();
              if (signJson?.path && signJson?.token) {
                const { error: signedUpErr } = await supabase.storage
                  .from("ad-media")
                  .uploadToSignedUrl(signJson.path, signJson.token, optimizedFile, {
                    cacheControl: "3600",
                    contentType: resolvedContentType,
                  });
                if (!signedUpErr && signJson.publicUrl) {
                  return signJson.publicUrl as string;
                }
              }
            }
          } catch {}

          // 2. Direct fallback upload (using streamable File/Blob directly without double ArrayBuffer RAM copy)
          const { error: uploadError } = await supabase.storage
            .from("ad-media")
            .upload(uniqueFileName, optimizedFile, {
              cacheControl: "3600",
              upsert: false,
              contentType: resolvedContentType,
            });

          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage.from("ad-media").getPublicUrl(uniqueFileName);

          return publicUrlData?.publicUrl || null;
        });

        const uploadedUrls = await Promise.all(uploadPromises);
        mediaUrlString = uploadedUrls.filter(Boolean).join(",");
      }

      const submitResponse = await fetch("/api/campaigns/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editingId,
          adData: {
            id: adId,
            adType,
            industry: formSelections.industry,
            interest: formSelections.interest,
            lifestyle: formSelections.lifestyle,
            behavior: formSelections.behavior,
            personality: formSelections.personality,
            ageRange: formSelections.ageRange,
            targetingAll: formSelections.targetingAll ?? false,
            impressions: formSelections.impressions,
            campaignDays: formSelections.campaignDays,
            scheduledStartAt: formSelections.scheduledStartAt || null,
            userFrequencyCap: formSelections.userFrequencyCap,
            country: formSelections.country || null,
            state: formSelections.state || null,
            province: formSelections.province || null,
            gender: formSelections.gender || null,
            employmentStatus: Array.isArray(formSelections.employmentStatus)
              ? formSelections.employmentStatus.join(", ")
              : formSelections.employmentStatus || null,
            adMediaType: formSelections.adMediaType,
            adMedia: mediaUrlString,
            ad_media: mediaUrlString,
            adContent: formSelections.adContent,
            adActionButtons: formSelections.adActionButtons,
            actionPhone: formSelections.actionDetails.phone || null,
            actionWhatsapp: formSelections.actionDetails.whatsapp || null,
            actionWebsite: formSelections.actionDetails.website || null,
            actionEmail: formSelections.actionDetails.email || null,
            actionIos: formSelections.actionDetails.ios || null,
            actionAndroid: formSelections.actionDetails.android || null,
            actionWatchNow: formSelections.actionDetails.watch_now || null,
            displayMutualButton: formSelections.displayMutualButton ?? true,
            costPerImpression,
            totalCost,
            isBidded: isBiddingEnabled,
            bidPrice: isBiddingEnabled ? bidPrice : null,
            isAdminPost: isAdmin,
            customSponsorName: formSelections.customSponsorName || null,
            customSponsorHandle: formSelections.customSponsorHandle || null,
            productName: adType === "product_sales" ? formSelections.productName : null,
            productPrice: adType === "product_sales" ? parseFloat(formSelections.productPrice) : null,
            productCtaType: formSelections.productCtaLink ? formSelections.productCtaType : null,
            productCtaLink: formSelections.productCtaLink || null,
            isAiContent: isAiContent,
            is_ai_content: isAiContent,
          },
        }),
      });

      const submitData = await submitResponse.json();
      if (!submitResponse.ok || submitData.error) {
        setIsSubmitting(false);
        const errMsg = submitData.error || "Failed to submit campaign for review.";
        if (submitData.limitReached) {
          setPendingLimitReached(true);
          setStepError("");
        } else {
          setStepError(errMsg);
        }
        showAppleAlert(errMsg, "warning");
        return;
      }

      clearUserCampaignsCache(session?.user?.email || "");
      try {
        localStorage.removeItem("paayh_draft_ad_v1");
      } catch {}

      sessionStorage.setItem("paayh_active_tab", "myads");
      sessionStorage.setItem("paayh_publications_subtab", "ads");
      if (editingId) {
        sessionStorage.setItem("paayh_myads_filter_tab", "review");
      }
      document.cookie = "paayh_active_tab=myads; path=/; max-age=604800; SameSite=Lax";
      window.dispatchEvent(
        new CustomEvent("paayh_campaign_resubmitted", {
          detail: { id: adId, type: "ad", wasEditing: !!editingId },
        })
      );
      window.dispatchEvent(new CustomEvent("paayh_tab_change", { detail: { tab: "myads" } }));

      showAppleAlert(
        editingId
          ? "Campaign readjusted and placed back in review! Waiting for approval."
          : "Campaign submitted for review! You will be notified once approved to publish it from My Ads.",
        "success"
      );

      setTimeout(() => {
        window.location.href = "/logged-in?view=myads";
      }, 900);
      setIsSubmitting(false);
    } catch (err: any) {
      console.error("Submit error details:", err);
      showAppleAlert(err?.message || "An unexpected error occurred during submission. Please try again.", "error");
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    stepError,
    setStepError,
    noticeModal,
    setNoticeModal,
    pendingLimitReached,
    setPendingLimitReached,
    handleInitiateSubmit,
    submitAd,
  };
}

export default useAdSubmission;
