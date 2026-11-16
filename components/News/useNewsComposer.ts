"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import supabase from "@/lib/utils/db";
import { showAppleAlert } from "@/components/ui/AppleAlert";
import { newsSchema } from "@/lib/validationSchemas";
import { isAdminEmail } from "@/lib/adminHelper";
import { resizeImageToMax1080p } from "@/lib/utils/mediaOptimizer";
import { clearUserCampaignsCache } from "@/lib/campaignsClient";
import { globalFormatCurrency } from "./newsCurrencyHelper";
import { NoticeModalData } from "@/components/MyAds/NoticeModal";
import { NewsSession, AdAccountRestriction, capitalizeFirst } from "./newsUtils";
import type { ProfileDisplayLike } from "@/lib/utils/profileDisplay";
import {
  LEGACY_NEWS_DRAFT_KEY,
  NEWS_DRAFT_STORAGE_PREFIX,
  clearDraftMediaFiles,
  getScopedDraftStorageKey,
  getScopedMediaId,
  loadDraftMediaFiles,
  readScopedJsonDraft,
  removeScopedJsonDraft,
  saveDraftMediaFiles,
  writeScopedJsonDraft,
} from "../../lib/utils/composerDraftStorage";

interface StoredNewsDraft {
  step?: number;
  title?: string;
  content?: string;
  interest?: string;
  country?: string;
  state?: string;
  province?: string;
  campaignDays?: number;
  scheduledStartAt?: string;
  isBiddingEnabled?: boolean;
  bidPrice?: number;
  isAiContent?: boolean;
  customSponsorName?: string;
  customSponsorHandle?: string;
  mediaPreview?: string | null;
  updatedAt?: number;
}

function hasPendingNewsEditSession(editingId: string | null): boolean {
  if (editingId) return true;
  if (typeof window !== "undefined") {
    try {
      return !!sessionStorage.getItem("paayh_edit_news_id");
    } catch {}
  }
  return false;
}

function createPreviewUrlFromFile(file: File): Promise<string | null> {
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    try {
      return Promise.resolve(URL.createObjectURL(file));
    } catch {}
  }
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } catch {
        resolve(null);
      }
    });
  }
  return Promise.resolve(null);
}

function normalizeInitialNewsProfile(
  profile: ProfileDisplayLike | null | undefined,
  fallbackEmail?: string | null
): ProfileDisplayLike | null {
  if (!profile) return null;
  return {
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

export function useNewsComposer(session: NewsSession, initialProfile?: ProfileDisplayLike | null) {
  const effectiveEmail = session?.user?.email || initialProfile?.email || null;

  const isAdmin = useMemo(() => {
    return Boolean((session?.user as any)?.isAdmin ?? isAdminEmail(effectiveEmail));
  }, [session?.user, effectiveEmail]);

  const [customSponsorName, setCustomSponsorName] = useState("");
  const [customSponsorHandle, setCustomSponsorHandle] = useState("");

  const [step, setStepState] = useState(0);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [interest, setInterest] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [state, setState] = useState("");
  const [province, setProvince] = useState("");
  const [campaignDays, setCampaignDays] = useState(1);
  const [scheduledStartAt, setScheduledStartAt] = useState("");
  const [isBiddingEnabled, setIsBiddingEnabled] = useState(false);
  const [bidPrice, setBidPrice] = useState(1500);
  const [highestBid, setHighestBid] = useState<number>(1000);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState<boolean>(false);
  const [isDeliveringActive, setIsDeliveringActive] = useState<boolean>(false);
  const [originalTotalCost, setOriginalTotalCost] = useState<number>(0);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [noticeModal, setNoticeModal] = useState<NoticeModalData | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [isAiContent, setIsAiContent] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [pendingLimitReached, setPendingLimitReached] = useState(false);

  const [adAccountRestriction, setAdAccountRestriction] = useState<AdAccountRestriction>({
    restricted: false,
    status: "",
    reason: "",
    until: null,
  });

  const [userProfile, setUserProfile] = useState<ProfileDisplayLike | null>(() =>
    normalizeInitialNewsProfile(initialProfile, effectiveEmail)
  );

  const isSubmittingRef = useRef(false);
  const scopeKey = getScopedDraftStorageKey(NEWS_DRAFT_STORAGE_PREFIX, effectiveEmail);
  const mediaScopeId = getScopedMediaId("news", effectiveEmail);

  const hydratedScopeRef = useRef<string | null>(null);
  const hasLoadedMediaRef = useRef<boolean>(false);
  const submittedRef = useRef<boolean>(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStepRef = useRef<number>(step);
  const lastSavedMediaPresentRef = useRef<boolean>(false);
  const preservedBidInterestRef = useRef<string | null>(null);
  const draftEmailRef = useRef<string | null>(effectiveEmail);
  const mediaScopeIdRef = useRef<string>(mediaScopeId);
  draftEmailRef.current = effectiveEmail;
  mediaScopeIdRef.current = mediaScopeId;

  const scrollSmoothToTop = useCallback(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const setStep = useCallback(
    (next: number) => {
      setStepState(next);
      scrollSmoothToTop();
    },
    [scrollSmoothToTop]
  );

  const showError = useCallback(
    (msg: string) => {
      setStepError(msg);
      scrollSmoothToTop();
    },
    [scrollSmoothToTop]
  );

  useEffect(() => {
    if (editingId) return;
    fetch("/api/campaigns")
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json().catch(() => null);
      })
      .then((data) => {
        const queueList = data?.highlightsQueue;
        if (queueList && Array.isArray(queueList)) {
          const approvedUnpaidCount = queueList.filter((hl: any) => {
            if (hl.admin_statement?.startsWith("APPROVED:")) {
              const parts = hl.admin_statement.split("APPROVED:");
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
  }, [editingId]);

  const loadHighlightForEdit = useCallback(async (targetId: string) => {
    if (!targetId) return;
    setIsLoadingEdit(true);
    setStepError(null);
    try {
      setEditingId(targetId);
      setStepState(0);
      const res = await fetch(`/api/highlights/details?id=${encodeURIComponent(targetId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.highlight) {
        throw new Error(data.error || "Unable to load highlight details for editing.");
      }
      const hl = data.highlight;
      setIsDeliveringActive(!!data.isDeliveringActive);
      setOriginalTotalCost(Number(data.originalTotalCost || 0));
      setTitle(hl.title || "");
      setContent(hl.content || "");
      if (hl.interest) {
        if (hl.is_bidded && hl.bid_price) {
          preservedBidInterestRef.current = hl.interest;
        }
        setInterest(hl.interest);
      } else {
        setInterest("");
      }
      if (hl.country) setCountry(hl.country);
      if (hl.state) setState(hl.state);
      if (hl.province) setProvince(hl.province);
      if (hl.campaign_days) setCampaignDays(Math.max(1, Math.min(90, Number(hl.campaign_days))));
      if (hl.scheduled_start_at) setScheduledStartAt(String(hl.scheduled_start_at).slice(0, 10));
      if (hl.is_bidded) {
        setIsBiddingEnabled(true);
        if (hl.bid_price) setBidPrice(Number(hl.bid_price));
      }
      if (hl.custom_sponsor_name) setCustomSponsorName(hl.custom_sponsor_name);
      if (hl.custom_sponsor_handle) setCustomSponsorHandle(hl.custom_sponsor_handle);
      setIsAiContent(!!hl.is_ai_content);
      if (hl.image_url) {
        setExistingImageUrl(hl.image_url);
        setMediaPreview(hl.image_url);
      }
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("paayh_edit_news_id");
      }
    } catch (err: any) {
      console.error("Error loading highlight for edit:", err);
      setStepError(err?.message || "Failed to load highlight for editing.");
    } finally {
      setIsLoadingEdit(false);
    }
  }, []);

  useEffect(() => {
    const storedEditId = typeof window !== "undefined" ? sessionStorage.getItem("paayh_edit_news_id") : null;
    if (storedEditId) {
      loadHighlightForEdit(storedEditId);
    }

    const handleEditNewsEvent = (e: any) => {
      const newsId = e.detail?.newsId;
      if (newsId) {
        loadHighlightForEdit(newsId);
      }
    };

    window.addEventListener("paayh_edit_news", handleEditNewsEvent);
    return () => window.removeEventListener("paayh_edit_news", handleEditNewsEvent);
  }, [loadHighlightForEdit]);

  useEffect(() => {
    const fetchProfileStatus = async () => {
      if (!effectiveEmail) return;
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        setUserProfile((prev) => ({
          ...(prev || {}),
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
            data.isExemptFromBarriersAndInactivity ?? prev?.isExemptFromBarriersAndInactivity,
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
      } catch (e) {
        console.error("Failed to fetch profile balance:", e);
      }
    };
    fetchProfileStatus();
  }, [effectiveEmail]);

  const hydrateDraftForScope = useCallback(
    (force = false) => {
      if (!force && hasPendingNewsEditSession(editingId)) return;
      if (!force && hydratedScopeRef.current === scopeKey) return;

      hasLoadedMediaRef.current = false;
      submittedRef.current = false;

      const { draft } = readScopedJsonDraft<StoredNewsDraft>(
        NEWS_DRAFT_STORAGE_PREFIX,
        LEGACY_NEWS_DRAFT_KEY,
        effectiveEmail
      );

      if (draft) {
        if (typeof draft.step === "number") {
          prevStepRef.current = draft.step;
          setStepState(draft.step);
        }
        if (draft.title) setTitle(draft.title);
        if (draft.content) setContent(draft.content);
        if (draft.interest && (typeof draft.bidPrice === "number" || typeof draft.isBiddingEnabled === "boolean")) {
          preservedBidInterestRef.current = draft.interest;
        }
        if (draft.interest) setInterest(draft.interest);
        if (draft.country) setCountry(draft.country);
        if (draft.state) setState(draft.state);
        if (draft.province) setProvince(draft.province);
        if (draft.campaignDays) {
          setCampaignDays(Math.max(1, Math.min(90, Number(draft.campaignDays))));
        }
        if (typeof draft.scheduledStartAt === "string") {
          setScheduledStartAt(draft.scheduledStartAt);
        }
        if (typeof draft.isBiddingEnabled === "boolean") {
          setIsBiddingEnabled(draft.isBiddingEnabled);
        }
        if (typeof draft.bidPrice === "number" && Number.isFinite(draft.bidPrice)) {
          setBidPrice(draft.bidPrice);
        }
        if (typeof draft.isAiContent === "boolean") {
          setIsAiContent(draft.isAiContent);
        }
        if (draft.customSponsorName) setCustomSponsorName(draft.customSponsorName);
        if (draft.customSponsorHandle) setCustomSponsorHandle(draft.customSponsorHandle);
        if (
          draft.mediaPreview &&
          (draft.mediaPreview.startsWith("http") || draft.mediaPreview.startsWith("data:"))
        ) {
          setMediaPreview(draft.mediaPreview);
        } else {
          setMediaPreview(null);
        }
      }

      hydratedScopeRef.current = scopeKey;

      let cancelled = false;
      const targetMediaScope = mediaScopeId;
      void loadDraftMediaFiles(targetMediaScope).then(async (restoredFiles) => {
        if (cancelled) return;
        if (mediaScopeIdRef.current !== targetMediaScope) return;
        if (submittedRef.current) return;
        if (hasPendingNewsEditSession(editingId)) return;

        const restoredFile = restoredFiles[0] || null;
        if (restoredFile) {
          lastSavedMediaPresentRef.current = true;
          setMediaFile(restoredFile);
          const restoredUrl = await createPreviewUrlFromFile(restoredFile);
          if (!cancelled && mediaScopeIdRef.current === targetMediaScope && restoredUrl) {
            setMediaPreview(restoredUrl);
          }
        }
        hasLoadedMediaRef.current = true;
      });

      return () => {
        cancelled = true;
      };
    },
    [editingId, effectiveEmail, mediaScopeId, scopeKey]
  );

  useEffect(() => {
    if (hasPendingNewsEditSession(editingId)) return;
    return hydrateDraftForScope(false);
  }, [editingId, hydrateDraftForScope]);

  const isDefaultState =
    step === 0 &&
    title === "" &&
    content === "" &&
    interest === "" &&
    country === "Nigeria" &&
    state === "" &&
    province === "" &&
    campaignDays === 1 &&
    scheduledStartAt === "" &&
    !isBiddingEnabled &&
    bidPrice === 1500 &&
    !isAiContent &&
    customSponsorName === "" &&
    customSponsorHandle === "" &&
    !mediaFile &&
    !mediaPreview;

  const serializableMediaPreview =
    mediaPreview && !mediaPreview.startsWith("blob:") ? mediaPreview : null;

  const latestSnapshotRef = useRef({
    editingId,
    effectiveEmail,
    scopeKey,
    hydratedScope: hydratedScopeRef.current,
    isDefaultState,
    draft: {
      step,
      title,
      content,
      interest,
      country,
      state,
      province,
      campaignDays,
      scheduledStartAt,
      isBiddingEnabled,
      bidPrice,
      isAiContent,
      customSponsorName,
      customSponsorHandle,
      mediaPreview: serializableMediaPreview,
      updatedAt: Date.now(),
    } as StoredNewsDraft,
  });

  latestSnapshotRef.current = {
    editingId,
    effectiveEmail,
    scopeKey,
    hydratedScope: hydratedScopeRef.current,
    isDefaultState,
    draft: {
      step,
      title,
      content,
      interest,
      country,
      state,
      province,
      campaignDays,
      scheduledStartAt,
      isBiddingEnabled,
      bidPrice,
      isAiContent,
      customSponsorName,
      customSponsorHandle,
      mediaPreview: serializableMediaPreview,
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
    if (hasPendingNewsEditSession(snap.editingId)) return;
    if (snap.hydratedScope !== snap.scopeKey) return;
    if (snap.isDefaultState) return;

    writeScopedJsonDraft(NEWS_DRAFT_STORAGE_PREFIX, snap.effectiveEmail, snap.draft);
  }, []);

  useEffect(() => {
    if (hasPendingNewsEditSession(editingId)) return;
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
    editingId,
    scopeKey,
    isDefaultState,
    step,
    title,
    content,
    interest,
    country,
    state,
    province,
    campaignDays,
    scheduledStartAt,
    isBiddingEnabled,
    bidPrice,
    isAiContent,
    customSponsorName,
    customSponsorHandle,
    mediaFile,
    mediaPreview,
    flushJsonDraftNow,
  ]);

  // Persist binary highlight cover file immediately (memory + IndexedDB)
  useEffect(() => {
    if (hasPendingNewsEditSession(editingId)) return;
    if (!hasLoadedMediaRef.current || submittedRef.current) return;

    if (mediaFile) {
      lastSavedMediaPresentRef.current = true;
      void saveDraftMediaFiles(mediaScopeId, [mediaFile]);
    } else if (lastSavedMediaPresentRef.current) {
      lastSavedMediaPresentRef.current = false;
      void clearDraftMediaFiles(mediaScopeId);
    }
  }, [mediaFile, editingId, mediaScopeId]);

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

  useEffect(() => {
    if (!interest) return;
    const preserveBid = preservedBidInterestRef.current === interest;
    if (!preserveBid) {
      preservedBidInterestRef.current = null;
    }
    let cancelled = false;
    const fetchTopBid = async () => {
      try {
        const res = await fetch(`/api/highlights?highestBid=true&interest=${encodeURIComponent(interest)}`);
        if (res.ok && !cancelled) {
          const data = await res.json().catch(() => ({}));
          const top = Number(data.highestBid || 1000);
          setHighestBid(top);
          if (!preserveBid) {
            setBidPrice((prev) => (top >= prev ? top + 200 : prev));
          }
        }
      } catch {}
    };
    fetchTopBid();
    return () => {
      cancelled = true;
    };
  }, [interest]);

  useEffect(() => {
    return () => {
      if (mediaPreview && mediaPreview.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(mediaPreview);
        } catch {}
      }
    };
  }, [mediaPreview]);

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStepError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/") || /\.(heic|heif|jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
    if (!isImage) {
      showError("Only image files are allowed for highlights (videos are not permitted).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showError("Cover image must be smaller than 8MB.");
      return;
    }

    setMediaFile(file);
    try {
      setMediaPreview((prev) => {
        if (prev && prev.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(prev);
          } catch {}
        }
        return URL.createObjectURL(file);
      });
    } catch {
      const reader = new FileReader();
      reader.onload = () => setMediaPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    setStepError(null);
    setStatusNotice(null);
    if (!session || !session.user?.email) {
      showError("User not authenticated. Please log in.");
      return;
    }

    const clampedDays = Math.max(1, Math.min(90, Number(campaignDays) || 1));
    const validationResult = newsSchema.safeParse({
      title,
      content,
      interest,
      country,
      campaignDays: clampedDays,
      bidPrice: isBiddingEnabled ? bidPrice : undefined,
    });

    const hasCoverImage = !!mediaFile || !!existingImageUrl;
    if (!hasCoverImage || !validationResult.success) {
      const errorMsg = !hasCoverImage
        ? "Please select a cover image for your highlight."
        : validationResult.error?.issues[0]?.message || "Please check your highlight form fields.";
      showError(errorMsg);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    let uploadedFilename: string | null = null;

    try {
      let finalImageUrl = existingImageUrl;

      if (mediaFile) {
        const filename = `${Date.now()}_${mediaFile.name.replace(/[^\w.-]/g, "_")}`;
        let optimizedFile: Blob | File = mediaFile;
        if (mediaFile instanceof File) {
          try {
            optimizedFile = await resizeImageToMax1080p(mediaFile);
          } catch (optErr) {
            console.warn("Highlight cover 1080p optimization notice:", optErr);
          }
        }

        const resolvedContentType = mediaFile.type || "image/jpeg";
        let uploadedViaSigned = false;

        try {
          const signRes = await fetch("/api/campaigns/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bucket: "news", fileName: filename }),
          });
          if (signRes.ok) {
            const signJson = await signRes.json().catch(() => null);
            if (signJson?.path && signJson?.token) {
              const { error: signedUpErr } = await supabase.storage
                .from("news")
                .uploadToSignedUrl(signJson.path, signJson.token, optimizedFile, {
                  cacheControl: "3600",
                  contentType: resolvedContentType,
                });
              if (!signedUpErr && signJson.publicUrl) {
                uploadedFilename = signJson.path;
                finalImageUrl = signJson.publicUrl;
                uploadedViaSigned = true;
              }
            }
          }
        } catch {}

        if (!uploadedViaSigned) {
          const { error: uploadError } = await supabase.storage
            .from("news")
            .upload(filename, optimizedFile, {
              cacheControl: "3600",
              upsert: false,
              contentType: resolvedContentType,
            });

          if (uploadError) throw uploadError;
          uploadedFilename = filename;

          const { data: urlData } = supabase.storage.from("news").getPublicUrl(filename);
          finalImageUrl = urlData.publicUrl;
        }
      }

      if (!finalImageUrl) {
        throw new Error("Missing highlight cover image.");
      }

      const submitResponse = await fetch("/api/highlights/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editingId,
          highlightData: {
            title: capitalizeFirst(title),
            content: content.trim(),
            image_url: finalImageUrl,
            interest,
            country,
            state: state || null,
            province: province || null,
            campaignDays: clampedDays,
            scheduledStartAt: scheduledStartAt || null,
            isBidded: isBiddingEnabled,
            bidPrice: isBiddingEnabled ? bidPrice : null,
            customSponsorName: customSponsorName || null,
            customSponsorHandle: customSponsorHandle || null,
            isAiContent,
          },
        }),
      });

      const submitData = await submitResponse.json().catch(() => ({}));
      if (!submitResponse.ok || submitData.error) {
        const errMsg = submitData.error || `Failed to submit highlight (${submitResponse.status}).`;
        if (submitData.limitReached) {
          setPendingLimitReached(true);
          setStepError(null);
          showAppleAlert(errMsg, "warning");
        } else {
          showError(errMsg);
        }
        return;
      }

      clearUserCampaignsCache(session?.user?.email || "");
      if (!editingId) {
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        submittedRef.current = true;
        lastSavedMediaPresentRef.current = false;
        removeScopedJsonDraft(NEWS_DRAFT_STORAGE_PREFIX, LEGACY_NEWS_DRAFT_KEY, draftEmailRef.current);
        void clearDraftMediaFiles(mediaScopeIdRef.current);
      } else if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("paayh_edit_news_id");
        } catch {}
      }

      sessionStorage.setItem("paayh_active_tab", "myads");
      sessionStorage.setItem("paayh_publications_subtab", "highlights");
      if (editingId) {
        sessionStorage.setItem("paayh_mynews_filter_tab", "pending");
      }
      document.cookie = "paayh_active_tab=myads; path=/; max-age=604800; SameSite=Lax";
      window.dispatchEvent(
        new CustomEvent("paayh_campaign_resubmitted", {
          detail: {
            id: submitData.highlightId || editingId,
            type: "highlight",
            wasEditing: !!editingId,
          },
        })
      );
      window.dispatchEvent(new CustomEvent("paayh_tab_change", { detail: { tab: "mynews" } }));
      setStatusNotice(
        isDeliveringActive
          ? "Highlight updates submitted for moderation review! Your live highlight continues running."
          : editingId
          ? "Highlight readjusted and placed back in review! Waiting for approval."
          : "Highlight submitted for moderation review! You will be notified once approved to publish."
      );
      scrollSmoothToTop();
      setTimeout(() => {
        window.location.href = "/logged-in?view=myads&tab=highlights";
      }, 900);

      setStepState(0);
      setEditingId(null);
      setIsDeliveringActive(false);
      setOriginalTotalCost(0);
      setExistingImageUrl(null);
      setMediaFile(null);
      setMediaPreview(null);
      setTitle("");
      setContent("");
      setInterest("");
    } catch (err: any) {
      console.error(err);
      if (uploadedFilename) {
        await supabase.storage.from("news").remove([uploadedFilename]).catch(() => {});
      }
      showError(err?.message || "An error occurred while submitting highlight.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleInitiateSubmit = () => {
    if (isSubmitting || isSubmittingRef.current) return;
    setStepError(null);
    setStatusNotice(null);
    if (!session || !session.user?.email) {
      showError("User not authenticated. Please log in.");
      return;
    }

    const clampedDays = Math.max(1, Math.min(90, Number(campaignDays) || 1));
    const validationResult = newsSchema.safeParse({
      title,
      content,
      interest,
      country,
      campaignDays: clampedDays,
      bidPrice: isBiddingEnabled ? bidPrice : undefined,
    });

    const hasCoverImage = !!mediaFile || !!existingImageUrl;
    if (!hasCoverImage || !validationResult.success) {
      const errorMsg = !hasCoverImage
        ? "Please select a cover image for your highlight."
        : validationResult.error?.issues[0]?.message || "Please check your highlight form fields.";
      showError(errorMsg);
      return;
    }

    if (!agreedToPolicy) {
      showError("Please confirm your agreement to Paayh's Promotion Policies and Non-Refundable Terms.");
      return;
    }

    const currentRate = isBiddingEnabled && bidPrice ? Number(bidPrice) : 1000;
    const currentTotalCost = currentRate * clampedDays;

    if (isDeliveringActive && currentTotalCost < originalTotalCost) {
      setNoticeModal({
        title: "Budget Reduction Notice",
        message: `You are reducing your highlight budget from ${globalFormatCurrency(originalTotalCost, country)} to ${globalFormatCurrency(currentTotalCost, country)}. Because advertising payments are strictly non-refundable, reducing your budget will not result in a refund of previously paid funds. Your highlight will continue delivering under the updated settings until complete, after which it will be archived.`,
        confirmText: "Proceed",
        cancelText: "Not Now",
        onConfirm: async () => {
          setNoticeModal(null);
          await handleSubmit();
        },
      });
      return;
    }

    handleSubmit();
  };

  const canNavigateToStep = (targetStep: number) => {
    if (isSubmitting) return false;
    if (targetStep <= step) return true;
    const hasCover = !!mediaFile || !!existingImageUrl;
    if (!hasCover) {
      showError("Please select a cover image for your highlight.");
      return false;
    }
    if (targetStep >= 2 && title.trim().length < 3) {
      showError("Title must be at least 3 characters.");
      return false;
    }
    if (targetStep >= 3 && content.trim().length < 10) {
      showError("Content must be at least 10 characters.");
      return false;
    }
    return true;
  };

  const discardDraft = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    submittedRef.current = false;
    lastSavedMediaPresentRef.current = false;
    preservedBidInterestRef.current = null;
    removeScopedJsonDraft(NEWS_DRAFT_STORAGE_PREFIX, LEGACY_NEWS_DRAFT_KEY, draftEmailRef.current);
    void clearDraftMediaFiles(mediaScopeIdRef.current);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("paayh_edit_news_id");
        sessionStorage.removeItem("paayh_edit_news");
      } catch {}
    }
    setEditingId(null);
    setIsDeliveringActive(false);
    setOriginalTotalCost(0);
    setExistingImageUrl(null);
    setMediaFile(null);
    setMediaPreview(null);
    prevStepRef.current = 0;
    setStepState(0);
    setTitle("");
    setContent("");
    setInterest("");
    setCountry("Nigeria");
    setState("");
    setProvince("");
    setCampaignDays(1);
    setScheduledStartAt("");
    setIsBiddingEnabled(false);
    setBidPrice(1500);
    setIsAiContent(false);
    setCustomSponsorName("");
    setCustomSponsorHandle("");
    setAgreedToPolicy(false);
    setStepError(null);
    setStatusNotice(null);
    hydratedScopeRef.current = scopeKey;
    hasLoadedMediaRef.current = true;
  }, [scopeKey]);

  const hasDraft = !editingId && !isDefaultState;

  return {
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
    userProfile,
    handleMediaChange,
    handleInitiateSubmit,
    canNavigateToStep,
    discardDraft,
    flushDraft: flushJsonDraftNow,
    hasDraft,
  };
}
