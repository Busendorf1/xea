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

export function useNewsComposer(session: NewsSession) {
  const isAdmin = useMemo(() => {
    return Boolean((session?.user as any)?.isAdmin ?? isAdminEmail(session?.user?.email));
  }, [session?.user]);

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

  const isSubmittingRef = useRef(false);

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
      setInterest(hl.interest || "");
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
      if (!session?.user?.email) return;
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
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
  }, [session?.user?.email]);

  useEffect(() => {
    if (editingId) return;
    if (typeof window !== "undefined" && sessionStorage.getItem("paayh_edit_news_id")) return;
    try {
      const saved = localStorage.getItem("paayh_draft_news_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.step === "number") setStepState(parsed.step);
        if (parsed.title) setTitle(parsed.title);
        if (parsed.content) setContent(parsed.content);
        if (parsed.interest) setInterest(parsed.interest);
        if (parsed.country) setCountry(parsed.country);
        if (parsed.state) setState(parsed.state);
        if (parsed.province) setProvince(parsed.province);
        if (parsed.campaignDays) setCampaignDays(Math.max(1, Math.min(90, Number(parsed.campaignDays))));
        if (typeof parsed.isBiddingEnabled === "boolean") setIsBiddingEnabled(parsed.isBiddingEnabled);
        if (parsed.bidPrice) setBidPrice(parsed.bidPrice);
        if (typeof parsed.isAiContent === "boolean") setIsAiContent(parsed.isAiContent);
        if (parsed.customSponsorName) setCustomSponsorName(parsed.customSponsorName);
        if (parsed.customSponsorHandle) setCustomSponsorHandle(parsed.customSponsorHandle);
        if (parsed.mediaPreview && !parsed.mediaPreview.startsWith("blob:") && parsed.mediaPreview.startsWith("http")) {
          setMediaPreview(parsed.mediaPreview);
        } else {
          setMediaPreview(null);
        }
      }
    } catch {}
  }, [editingId]);

  useEffect(() => {
    if (editingId) return;
    if (typeof window !== "undefined" && sessionStorage.getItem("paayh_edit_news_id")) return;
    const timer = setTimeout(() => {
      try {
        const draft = {
          step,
          title,
          content,
          interest,
          country,
          state,
          province,
          campaignDays,
          isBiddingEnabled,
          bidPrice,
          isAiContent,
          customSponsorName,
          customSponsorHandle,
          mediaPreview:
            mediaPreview && !mediaPreview.startsWith("blob:") && !mediaPreview.startsWith("data:")
              ? mediaPreview
              : null,
        };
        localStorage.setItem("paayh_draft_news_v1", JSON.stringify(draft));
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [
    editingId,
    step,
    title,
    content,
    interest,
    country,
    state,
    province,
    campaignDays,
    isBiddingEnabled,
    bidPrice,
    isAiContent,
    customSponsorName,
    customSponsorHandle,
    mediaPreview,
  ]);

  useEffect(() => {
    if (!interest) return;
    const fetchTopBid = async () => {
      try {
        const res = await fetch(`/api/highlights?highestBid=true&interest=${encodeURIComponent(interest)}`);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const top = Number(data.highestBid || 1000);
          setHighestBid(top);
          setBidPrice((prev) => (top >= prev ? top + 200 : prev));
        }
      } catch {}
    };
    fetchTopBid();
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
      try {
        localStorage.removeItem("paayh_draft_news_v1");
      } catch {}

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
    handleMediaChange,
    handleInitiateSubmit,
    canNavigateToStep,
  };
}
