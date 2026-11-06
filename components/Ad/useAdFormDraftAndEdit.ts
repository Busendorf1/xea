"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AdFormSelections } from "./types";

export const initialFormSelections: AdFormSelections = {
  industry: [],
  interest: [],
  lifestyle: [],
  behavior: [],
  personality: [],
  ageRange: [18, 65],
  targetingAll: false,
  impressions: 1000,
  campaignDays: 5,
  userFrequencyCap: 1,
  country: "",
  state: "",
  province: "",
  targetLocations: [],
  gender: "",
  employmentStatus: [],
  adMediaType: "",
  adContent: "",
  adMediaFiles: [],
  existingMedia: "",
  adActionButtons: [],
  actionDetails: {
    phone: "",
    whatsapp: "",
    website: "",
    email: "",
    ios: "",
    android: "",
    watch_now: "",
  },
  displayMutualButton: false,
  productName: "",
  productPrice: "",
  productCtaType: "Buy",
  productCtaLink: "",
  customSponsorName: "",
  customSponsorHandle: "",
  customSponsorLogo: "",
};

export function useAdFormDraftAndEdit() {
  const searchParams = useSearchParams();
  const editAdId = searchParams ? searchParams.get("id") : null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeliveringActive, setIsDeliveringActive] = useState<boolean>(false);
  const [originalTotalCost, setOriginalTotalCost] = useState<number>(0);

  const [step, setStep] = useState(0);
  const [isAiContent, setIsAiContent] = useState(false);
  const [adType, setAdType] = useState("politics");
  const [isBiddingEnabled, setIsBiddingEnabled] = useState(false);
  const [bidPrice, setBidPrice] = useState(0);
  const [formSelections, setFormSelections] = useState<AdFormSelections>(initialFormSelections);

  // Restore saved draft state on mount
  useEffect(() => {
    if (editingId) return;
    try {
      const saved = localStorage.getItem("paayh_draft_ad_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.step === "number") setStep(parsed.step);
        if (parsed.adType) setAdType(parsed.adType);
        if (typeof parsed.isBiddingEnabled === "boolean") setIsBiddingEnabled(parsed.isBiddingEnabled);
        if (parsed.bidPrice) setBidPrice(parsed.bidPrice);
        if (typeof parsed.isAiContent === "boolean") setIsAiContent(parsed.isAiContent);
        if (parsed.formSelections) {
          setFormSelections((prev) => ({
            ...prev,
            ...parsed.formSelections,
            adMediaFiles: [],
          }));
        }
      }
    } catch {}
  }, [editingId]);

  // Autosave draft state on changes (debounced 400ms)
  useEffect(() => {
    if (editingId) return;
    const timer = setTimeout(() => {
      try {
        const { adMediaFiles, ...restSelections } = formSelections;
        const draft = {
          step,
          adType,
          isBiddingEnabled,
          bidPrice,
          isAiContent,
          formSelections: restSelections,
        };
        localStorage.setItem("paayh_draft_ad_v1", JSON.stringify(draft));
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [step, adType, isBiddingEnabled, bidPrice, isAiContent, formSelections, editingId]);

  const loadAdForEdit = async (targetId: string) => {
    if (!targetId) return;
    try {
      setEditingId(targetId);
      setStep(0);
      const res = await fetch(`/api/campaigns/details?id=${targetId}`);
      const data = await res.json();
      if (data.success && data.ad) {
        const ad = data.ad;
        setIsDeliveringActive(!!data.isDeliveringActive);
        setOriginalTotalCost(Number(data.originalTotalCost || ad.total_cost || 0));
        if (ad.ad_type) setAdType(ad.ad_type);
        setFormSelections((prev) => ({
          ...prev,
          industry: Array.isArray(ad.industry) ? ad.industry : ad.industry ? [ad.industry] : [],
          interest: Array.isArray(ad.interest) ? ad.interest : ad.interest ? [ad.interest] : [],
          lifestyle: Array.isArray(ad.lifestyle) ? ad.lifestyle : ad.lifestyle ? [ad.lifestyle] : [],
          behavior: Array.isArray(ad.behavior) ? ad.behavior : ad.behavior ? [ad.behavior] : [],
          personality: Array.isArray(ad.personality) ? ad.personality : ad.personality ? [ad.personality] : [],
          ageRange: ad.age_range || [18, 65],
          targetingAll: !!ad.targeting_all,
          impressions: ad.impressions || 1000,
          campaignDays: ad.campaign_days || 5,
          userFrequencyCap: ad.user_frequency_cap || 1,
          country: ad.country || "",
          state: ad.state || "",
          province: ad.province || "",
          targetLocations: ad.province ? ad.province.split("; ") : [],
          gender: ad.gender || "",
          employmentStatus: ad.employment_status ? ad.employment_status.split(", ") : [],
          adMediaType: ad.ad_media_type || "text",
          adContent: ad.ad_content || "",
          adMediaFiles: [],
          existingMedia: ad.ad_media && ad.ad_media !== "text" ? ad.ad_media : "",
          adActionButtons: ad.ad_action_buttons || [],
          actionDetails: {
            phone: ad.action_phone || "",
            whatsapp: ad.action_whatsapp || "",
            website: ad.action_website || "",
            email: ad.action_email || "",
            ios: ad.action_ios || "",
            android: ad.action_android || "",
            watch_now: ad.action_watch_now || "",
          },
          displayMutualButton: !!ad.display_mutual_button,
          productName: ad.product_name || "",
          productPrice: ad.product_price ? String(ad.product_price) : "",
          productCtaType: ad.product_cta_type || "Buy",
          productCtaLink: ad.product_cta_link || "",
          customSponsorName: ad.custom_sponsor_name || "",
          customSponsorHandle: ad.custom_sponsor_handle || "",
        }));
      }
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("paayh_edit_ad_id");
      }
    } catch (err) {
      console.error("Error fetching ad details for edit:", err);
    }
  };

  useEffect(() => {
    const searchId = editAdId;
    const storedEditId = typeof window !== "undefined" ? sessionStorage.getItem("paayh_edit_ad_id") : null;
    const targetId = searchId || storedEditId;
    if (targetId) {
      loadAdForEdit(targetId);
    }

    const handleEditAdEvent = (e: any) => {
      const adId = e.detail?.adId;
      if (adId) {
        loadAdForEdit(adId);
      }
    };

    window.addEventListener("paayh_edit_ad", handleEditAdEvent);
    return () => {
      window.removeEventListener("paayh_edit_ad", handleEditAdEvent);
    };
  }, [editAdId]);

  // Clear targeting selections ONLY whenever user switches ad type
  const prevAdTypeRef = useRef<string>(adType);
  useEffect(() => {
    if (prevAdTypeRef.current !== adType) {
      prevAdTypeRef.current = adType;
      setFormSelections((prev) => ({
        ...prev,
        industry: [],
        interest: [],
        lifestyle: [],
        behavior: [],
        personality: [],
      }));
    }
  }, [adType]);

  const resetForm = () => {
    setEditingId(null);
    setIsDeliveringActive(false);
    setOriginalTotalCost(0);
    setStep(0);
    setFormSelections(initialFormSelections);
  };

  return {
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
  };
}

export default useAdFormDraftAndEdit;
