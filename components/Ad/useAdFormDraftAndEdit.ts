"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AdFormSelections } from "./types";
import {
  AD_DRAFT_STORAGE_PREFIX,
  LEGACY_AD_DRAFT_KEY,
  clearDraftMediaFiles,
  getScopedDraftStorageKey,
  getScopedMediaId,
  loadDraftMediaFiles,
  readScopedJsonDraft,
  removeScopedJsonDraft,
  saveDraftMediaFiles,
  writeScopedJsonDraft,
} from "../../lib/utils/composerDraftStorage";

export const initialFormSelections: AdFormSelections = {
  industry: [],
  interest: [],
  lifestyle: [],
  behavior: [],
  personality: [],
  ageRange: [18, 65],
  targetingAll: false,
  impressions: 100,
  campaignDays: 5,
  scheduledStartAt: "",
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

interface StoredAdDraft {
  step?: number;
  adType?: string;
  isBiddingEnabled?: boolean;
  bidPrice?: number;
  isAiContent?: boolean;
  formSelections?: Partial<Omit<AdFormSelections, "adMediaFiles">>;
  updatedAt?: number;
}

function createInitialFormSelections(): AdFormSelections {
  return {
    ...initialFormSelections,
    ageRange: [...initialFormSelections.ageRange] as [number, number],
    actionDetails: { ...initialFormSelections.actionDetails },
    industry: [],
    interest: [],
    lifestyle: [],
    behavior: [],
    personality: [],
    targetLocations: [],
    employmentStatus: [],
    adMediaFiles: [],
    adActionButtons: [],
  };
}

function isDefaultAdFormSelections(selections: AdFormSelections): boolean {
  if (selections.adMediaFiles.length > 0) return false;
  const { adMediaFiles: _files, ...rest } = selections;
  const { adMediaFiles: _initFiles, ...initRest } = initialFormSelections;
  return JSON.stringify(rest) === JSON.stringify(initRest);
}

function hasPendingEditSession(editingId: string | null, editAdId: string | null): boolean {
  if (editingId || editAdId) return true;
  if (typeof window !== "undefined") {
    try {
      return !!sessionStorage.getItem("paayh_edit_ad_id");
    } catch {}
  }
  return false;
}

export function useAdFormDraftAndEdit(draftEmail?: string | null) {
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
  const [formSelections, setFormSelections] = useState<AdFormSelections>(createInitialFormSelections);

  const scopeKey = getScopedDraftStorageKey(AD_DRAFT_STORAGE_PREFIX, draftEmail);
  const mediaScopeId = getScopedMediaId("ad", draftEmail);

  const prevAdTypeRef = useRef<string>(adType);
  const hydratedScopeRef = useRef<string | null>(null);
  const hasLoadedMediaRef = useRef<boolean>(false);
  const submittedRef = useRef<boolean>(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStepRef = useRef<number>(step);
  const lastSavedMediaCountRef = useRef<number>(0);
  const draftEmailRef = useRef<string | null | undefined>(draftEmail);
  const mediaScopeIdRef = useRef<string>(mediaScopeId);
  const editingIdRef = useRef<string | null>(editingId);
  const editAdIdRef = useRef<string | null>(editAdId);
  draftEmailRef.current = draftEmail;
  mediaScopeIdRef.current = mediaScopeId;
  editingIdRef.current = editingId;
  editAdIdRef.current = editAdId;

  const hydrateDraftForScope = useCallback(
    (force = false) => {
      if (!force && hasPendingEditSession(editingIdRef.current, editAdIdRef.current)) return;
      if (!force && hydratedScopeRef.current === scopeKey) return;

      hasLoadedMediaRef.current = false;
      submittedRef.current = false;

      const { draft } = readScopedJsonDraft<StoredAdDraft>(
        AD_DRAFT_STORAGE_PREFIX,
        LEGACY_AD_DRAFT_KEY,
        draftEmail
      );

      if (draft) {
        if (typeof draft.step === "number") {
          prevStepRef.current = draft.step;
          setStep(draft.step);
        }
        if (draft.adType) {
          prevAdTypeRef.current = draft.adType;
          setAdType(draft.adType);
        }
        if (typeof draft.isBiddingEnabled === "boolean") {
          setIsBiddingEnabled(draft.isBiddingEnabled);
        }
        if (typeof draft.bidPrice === "number") {
          setBidPrice(draft.bidPrice);
        }
        if (typeof draft.isAiContent === "boolean") {
          setIsAiContent(draft.isAiContent);
        }
        if (draft.formSelections) {
          const restoredSelections = draft.formSelections;
          setFormSelections((prev) => ({
            ...prev,
            ...restoredSelections,
            actionDetails: {
              ...initialFormSelections.actionDetails,
              ...(restoredSelections.actionDetails || {}),
            },
            adMediaFiles: prev.adMediaFiles,
          }));
        }
      }

      hydratedScopeRef.current = scopeKey;

      let cancelled = false;
      const targetMediaScope = mediaScopeId;
      void loadDraftMediaFiles(targetMediaScope).then((restoredFiles) => {
        if (cancelled) return;
        if (mediaScopeIdRef.current !== targetMediaScope) return;
        if (submittedRef.current) return;
        if (hasPendingEditSession(editingIdRef.current, editAdIdRef.current)) return;

        if (restoredFiles.length > 0) {
          lastSavedMediaCountRef.current = restoredFiles.length;
          setFormSelections((prev) => ({
            ...prev,
            adMediaFiles: restoredFiles,
          }));
        }
        hasLoadedMediaRef.current = true;
      });

      return () => {
        cancelled = true;
      };
    },
    [draftEmail, mediaScopeId, scopeKey]
  );

  // Restore saved draft state on mount and when user scope settles
  useEffect(() => {
    if (hasPendingEditSession(editingIdRef.current, editAdIdRef.current)) return;
    return hydrateDraftForScope(false);
  }, [editingId, editAdId, hydrateDraftForScope]);

  const isDefaultState =
    step === 0 &&
    adType === "politics" &&
    !isBiddingEnabled &&
    bidPrice === 0 &&
    !isAiContent &&
    isDefaultAdFormSelections(formSelections);

  const { adMediaFiles, ...serializableSelections } = formSelections;

  const latestSnapshotRef = useRef({
    editingId,
    editAdId,
    draftEmail,
    scopeKey,
    hydratedScope: hydratedScopeRef.current,
    isDefaultState,
    draft: {
      step,
      adType,
      isBiddingEnabled,
      bidPrice,
      isAiContent,
      formSelections: serializableSelections,
      updatedAt: Date.now(),
    } as StoredAdDraft,
  });

  latestSnapshotRef.current = {
    editingId,
    editAdId,
    draftEmail,
    scopeKey,
    hydratedScope: hydratedScopeRef.current,
    isDefaultState,
    draft: {
      step,
      adType,
      isBiddingEnabled,
      bidPrice,
      isAiContent,
      formSelections: serializableSelections,
      updatedAt: Date.now(),
    },
  };

  const flushJsonDraftNow = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const snap = latestSnapshotRef.current;
    if (submittedRef.current) return;
    if (hasPendingEditSession(snap.editingId, snap.editAdId)) return;
    if (snap.hydratedScope !== snap.scopeKey) return;

    if (snap.isDefaultState) {
      return;
    }
    writeScopedJsonDraft(AD_DRAFT_STORAGE_PREFIX, snap.draftEmail, snap.draft);
  }, []);

  // Autosave JSON draft on changes (immediate on step changes, debounced 350ms for typing)
  useEffect(() => {
    if (hasPendingEditSession(editingId, editAdId)) return;
    if (hydratedScopeRef.current !== scopeKey) return;
    if (submittedRef.current) return;

    if (isDefaultState) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }

    if (prevStepRef.current !== step) {
      prevStepRef.current = step;
      flushJsonDraftNow();
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      flushJsonDraftNow();
    }, 350);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [
    step,
    adType,
    isBiddingEnabled,
    bidPrice,
    isAiContent,
    formSelections,
    editingId,
    editAdId,
    scopeKey,
    isDefaultState,
    flushJsonDraftNow,
  ]);

  // Persist binary File objects immediately (memory + IndexedDB) without clearing pre-restore files
  useEffect(() => {
    if (hasPendingEditSession(editingId, editAdId)) return;
    if (!hasLoadedMediaRef.current || submittedRef.current) return;

    if (adMediaFiles.length > 0) {
      lastSavedMediaCountRef.current = adMediaFiles.length;
      void saveDraftMediaFiles(mediaScopeId, adMediaFiles);
    } else if (lastSavedMediaCountRef.current > 0) {
      lastSavedMediaCountRef.current = 0;
      void clearDraftMediaFiles(mediaScopeId);
    }
  }, [adMediaFiles, editingId, editAdId, mediaScopeId]);

  // Flush pending JSON draft on unmount, tab hide, pagehide, or beforeunload
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        flushJsonDraftNow();
      }
    };
    const handlePageHide = () => {
      flushJsonDraftNow();
    };
    const handleBeforeUnload = () => {
      flushJsonDraftNow();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", handlePageHide);
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", handlePageHide);
        window.removeEventListener("beforeunload", handleBeforeUnload);
      }
      flushJsonDraftNow();
    };
  }, [flushJsonDraftNow]);

  const loadAdForEdit = async (targetId: string) => {
    if (!targetId) return;
    try {
      editingIdRef.current = targetId;
      setEditingId(targetId);
      setStep(0);
      const res = await fetch(`/api/campaigns/details?id=${targetId}`);
      const data = await res.json();
      if (data.success && data.ad) {
        const ad = data.ad;
        setIsDeliveringActive(!!data.isDeliveringActive);
        setOriginalTotalCost(Number(data.originalTotalCost || ad.total_cost || 0));
        if (ad.ad_type) {
          prevAdTypeRef.current = ad.ad_type;
          setAdType(ad.ad_type);
        }
        if (typeof ad.is_ai_content === "boolean") {
          setIsAiContent(ad.is_ai_content);
        }
        setFormSelections((prev) => ({
          ...prev,
          industry: Array.isArray(ad.industry) ? ad.industry : ad.industry ? [ad.industry] : [],
          interest: Array.isArray(ad.interest) ? ad.interest : ad.interest ? [ad.interest] : [],
          lifestyle: Array.isArray(ad.lifestyle) ? ad.lifestyle : ad.lifestyle ? [ad.lifestyle] : [],
          behavior: Array.isArray(ad.behavior) ? ad.behavior : ad.behavior ? [ad.behavior] : [],
          personality: Array.isArray(ad.personality) ? ad.personality : ad.personality ? [ad.personality] : [],
          ageRange: ad.age_range || [18, 65],
          targetingAll: !!ad.targeting_all,
          impressions: ad.impressions || 100,
          campaignDays: Math.max(1, Math.min(90, Number(ad.campaign_days || 5))),
          scheduledStartAt: ad.scheduled_start_at ? String(ad.scheduled_start_at).slice(0, 10) : "",
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
          customSponsorLogo: ad.custom_sponsor_logo || "",
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

  const clearDraft = useCallback((markSubmitted = true) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (markSubmitted) {
      submittedRef.current = true;
    }
    lastSavedMediaCountRef.current = 0;
    removeScopedJsonDraft(AD_DRAFT_STORAGE_PREFIX, LEGACY_AD_DRAFT_KEY, draftEmailRef.current);
    void clearDraftMediaFiles(mediaScopeIdRef.current);
  }, []);

  const resetForm = useCallback(() => {
    clearDraft(false);
    submittedRef.current = false;
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("paayh_edit_ad_id");
      } catch {}
    }
    editingIdRef.current = null;
    setEditingId(null);
    setIsDeliveringActive(false);
    setOriginalTotalCost(0);
    prevStepRef.current = 0;
    setStep(0);
    prevAdTypeRef.current = "politics";
    setAdType("politics");
    setIsBiddingEnabled(false);
    setBidPrice(0);
    setIsAiContent(false);
    setFormSelections(createInitialFormSelections());
    hydratedScopeRef.current = scopeKey;
    hasLoadedMediaRef.current = true;
  }, [clearDraft, scopeKey]);

  const exitEditMode = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("paayh_edit_ad_id");
      } catch {}
    }
    editingIdRef.current = null;
    lastSavedMediaCountRef.current = 0;
    setEditingId(null);
    setIsDeliveringActive(false);
    setOriginalTotalCost(0);
    prevStepRef.current = 0;
    setStep(0);
    prevAdTypeRef.current = "politics";
    setAdType("politics");
    setIsBiddingEnabled(false);
    setBidPrice(0);
    setIsAiContent(false);
    setFormSelections(createInitialFormSelections());
    hydratedScopeRef.current = null;
    hydrateDraftForScope(true);
  }, [hydrateDraftForScope]);

  const hasDraft = !editingId && !isDefaultState;

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
    clearDraft,
    flushDraft: flushJsonDraftNow,
    resetForm,
    discardDraft: resetForm,
    exitEditMode,
    hasDraft,
  };
}

export default useAdFormDraftAndEdit;
