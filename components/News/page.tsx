"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import supabase from "@/lib/utils/db";
import styles from "../News/page.module.css";
import LocationSelector from "../LocationSelector";
import TermsAgreementCheckbox from "@/components/ui/TermsAgreementCheckbox/TermsAgreementCheckbox";
import { showAppleAlert } from "@/components/ui/AppleAlert";
import { Zap, Calendar, ShieldAlert, Crown, Rocket, Sparkles, TrendingUp, Cpu, Landmark, Film, Trophy, Briefcase, GraduationCap, Activity, Atom, Globe, Tag, Info, Award } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import RollingCounter from "@/components/ui/RollingCounter";
import CustomSelect from "@/components/ui/CustomSelect";
import FormStepProgress from "@/components/ui/FormStepProgress";
import { ALL_INTERESTS as interests } from "@/lib/categoryTargetingMap";
import { newsSchema } from "@/lib/validationSchemas";
import { isAdminEmail } from "@/lib/adminHelper";
import { resizeImageToMax1080p } from "@/lib/utils/mediaOptimizer";
import { clearUserCampaignsCache } from "@/lib/campaignsClient";
import NoticeModal, { NoticeModalData } from "@/components/MyAds/NoticeModal";
import { NewsStepTargeting, NewsStepPreview } from "./NewsSteps";

interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

type NewsProps = {
  session: Session;
};

import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

const steps = ["Media", "Title", "Content", "Targeting", "Preview"];

const getCategoryIcon = (_category: string) => null;

export default function News({ session }: NewsProps) {
  const isAdmin = useMemo(() => {
    return Boolean((session?.user as any)?.isAdmin ?? isAdminEmail(session?.user?.email));
  }, [session?.user]);
  const [customSponsorName, setCustomSponsorName] = useState("");
  const [customSponsorHandle, setCustomSponsorHandle] = useState("");

  const [step, setStep] = useState(0);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [interest, setInterest] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [state, setState] = useState("");
  const [province, setProvince] = useState("");
  const [campaignDays, setCampaignDays] = useState(1);
  const [isBiddingEnabled, setIsBiddingEnabled] = useState(false);
  const [bidPrice, setBidPrice] = useState(1500);
  const [highestBid, setHighestBid] = useState<number>(1000);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeliveringActive, setIsDeliveringActive] = useState<boolean>(false);
  const [originalTotalCost, setOriginalTotalCost] = useState<number>(0);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [noticeModal, setNoticeModal] = useState<NoticeModalData | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false);
  const [isAiContent, setIsAiContent] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "wallet">("card");
  const [stepError, setStepError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const loadHighlightForEdit = async (targetId: string) => {
    if (!targetId) return;
    try {
      setEditingId(targetId);
      setStep(0);
      const res = await fetch(`/api/highlights/details?id=${targetId}`);
      const data = await res.json();
      if (data.success && data.highlight) {
        const hl = data.highlight;
        setIsDeliveringActive(!!data.isDeliveringActive);
        setOriginalTotalCost(Number(data.originalTotalCost || 0));
        setTitle(hl.title || "");
        setContent(hl.content || "");
        setInterest(hl.interest || "");
        if (hl.country) setCountry(hl.country);
        if (hl.state) setState(hl.state);
        if (hl.province) setProvince(hl.province);
        if (hl.campaign_days) setCampaignDays(hl.campaign_days);
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
      }
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("paayh_edit_news_id");
      }
    } catch (err) {
      console.error("Error loading highlight for edit:", err);
    }
  };

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
    return () => {
      window.removeEventListener("paayh_edit_news", handleEditNewsEvent);
    };
  }, []);

  const [adAccountRestriction, setAdAccountRestriction] = useState<{
    restricted: boolean;
    status: string;
    reason: string;
    until: string | null;
  }>({ restricted: false, status: "", reason: "", until: null });

  const formatCurrency = (amount: number | string) => globalFormatCurrency(amount, country);

  useEffect(() => {
    const fetchBalance = async () => {
      if (session?.user?.email) {
        try {
          const res = await fetch("/api/profile");
          if (res.ok) {
            const data = await res.json();
            setBalance(data.balance ?? 0);

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
          console.error("Failed to fetch profile balance:", e);
        }
      }
    };
    fetchBalance();
  }, [session]);

  // Restore saved draft state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("paayh_draft_news_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.step === "number") setStep(parsed.step);
        if (parsed.title) setTitle(parsed.title);
        if (parsed.content) setContent(parsed.content);
        if (parsed.interest) setInterest(parsed.interest);
        if (parsed.country) setCountry(parsed.country);
        if (parsed.state) setState(parsed.state);
        if (parsed.province) setProvince(parsed.province);
        if (parsed.campaignDays) setCampaignDays(parsed.campaignDays);
        if (typeof parsed.isBiddingEnabled === "boolean") setIsBiddingEnabled(parsed.isBiddingEnabled);
        if (parsed.bidPrice) setBidPrice(parsed.bidPrice);
        if (typeof parsed.isAiContent === "boolean") setIsAiContent(parsed.isAiContent);
        if (parsed.customSponsorName) setCustomSponsorName(parsed.customSponsorName);
        if (parsed.customSponsorHandle) setCustomSponsorHandle(parsed.customSponsorHandle);
        if (parsed.mediaPreview && !parsed.mediaPreview.startsWith("blob:") && parsed.mediaPreview.startsWith("http")) { setMediaPreview(parsed.mediaPreview); } else { setMediaPreview(null); }
      }
    } catch {}
  }, []);

  // Autosave draft state on changes (debounced 400ms; omit base64 data URLs to prevent QuotaExceededError & INP freezes)
  useEffect(() => {
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
          mediaPreview: mediaPreview && !mediaPreview.startsWith("blob:") && !mediaPreview.startsWith("data:") ? mediaPreview : null,
        };
        localStorage.setItem("paayh_draft_news_v1", JSON.stringify(draft));
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [
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
          const data = await res.json();
          setHighestBid(data.highestBid || 1000);
          if (data.highestBid && data.highestBid >= bidPrice) {
            setBidPrice(data.highestBid + 200);
          }
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
    if (file) {
      const isImage = file.type.startsWith("image/") || /\.(heic|heif|jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
      if (isImage) {
        if (file.size > 8 * 1024 * 1024) {
          setStepError("Cover image must be smaller than 8MB.");
          return;
        }
      } else {
        setStepError("Only image files are allowed for highlights (videos are not permitted).");
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
    }
  };

  const capitalizeFirst = (txt: string) =>
    txt.trim() ? txt.trim().charAt(0).toUpperCase() + txt.trim().slice(1) : "";

  const totalCost = isBiddingEnabled ? (bidPrice * campaignDays) : (1000 * campaignDays);

  const handleInitiateSubmit = () => {
    if (isSubmitting) return;
    setStepError(null);
    setStatusNotice(null);
    if (!session || !session.user?.email) {
      setStepError("User not authenticated. Please log in.");
      return;
    }

    const validationResult = newsSchema.safeParse({
      title,
      content,
      interest,
      country,
      campaignDays,
      bidPrice: isBiddingEnabled ? bidPrice : undefined,
    });

    const hasCoverImage = !!mediaFile || !!existingImageUrl;
    if (!hasCoverImage || !validationResult.success) {
      const errorMsg = !hasCoverImage
        ? "Please select a cover image for your highlight."
        : validationResult.error?.issues[0]?.message || "Please check your highlight form fields.";
      setStepError(errorMsg);
      return;
    }

    if (!agreedToPolicy) {
      setStepError("Please confirm your agreement to Paayh's Promotion Policies and Non-Refundable Terms.");
      return;
    }

    const currentRate = isBiddingEnabled && bidPrice ? Number(bidPrice) : 1000;
    const currentTotalCost = currentRate * campaignDays;

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

  const handleSubmit = async () => {
    setStepError(null);
    setStatusNotice(null);
    if (!session || !session.user?.email) {
      setStepError("User not authenticated. Please log in.");
      return;
    }

    const validationResult = newsSchema.safeParse({
      title,
      content,
      interest,
      country,
      campaignDays,
      bidPrice: isBiddingEnabled ? bidPrice : undefined,
    });

    const hasCoverImage = !!mediaFile || !!existingImageUrl;
    if (!hasCoverImage || !validationResult.success) {
      const errorMsg = !hasCoverImage
        ? "Please select a cover image for your highlight."
        : validationResult.error?.issues[0]?.message || "Please check your highlight form fields.";
      setStepError(errorMsg);
      return;
    }

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

        let fileData: Blob | File = optimizedFile;
        try {
          const buffer = await optimizedFile.arrayBuffer();
          fileData = new Blob([buffer], { type: mediaFile.type || "image/jpeg" });
        } catch (e) {
          console.warn("ArrayBuffer fallback for news image:", e);
        }

        const { error: uploadError } = await supabase.storage
          .from("news")
          .upload(filename, fileData, {
            cacheControl: "3600",
            upsert: false,
            contentType: mediaFile.type || "image/jpeg",
          });

        if (uploadError) throw uploadError;
        uploadedFilename = filename;

        const { data: urlData } = supabase.storage
          .from("news")
          .getPublicUrl(filename);

        finalImageUrl = urlData.publicUrl;
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
            campaignDays,
            isBidded: isBiddingEnabled,
            bidPrice: isBiddingEnabled ? bidPrice : null,
            customSponsorName: customSponsorName || null,
            customSponsorHandle: customSponsorHandle || null,
            isAiContent,
          },
        }),
      });

      const submitData = await submitResponse.json();
      if (!submitResponse.ok || submitData.error) {
        setIsSubmitting(false);
        const errMsg = submitData.error || "Failed to submit highlight for review.";
        if (submitData.limitReached) {
          setStepError(""); // Avoid duplicate message at the bottom
          showAppleAlert(errMsg, "warning");
        } else {
          setStepError(errMsg);
        }
        return;
      }

      sessionStorage.setItem("paayh_active_tab", "myads");
      sessionStorage.setItem("paayh_publications_subtab", "highlights");
      document.cookie = "paayh_active_tab=myads; path=/; max-age=604800; SameSite=Lax";
      window.dispatchEvent(new CustomEvent("paayh_tab_change", { detail: { tab: "mynews" } }));
      setStatusNotice(
        isDeliveringActive
          ? "Highlight updates submitted for moderation review! Your live highlight continues running."
          : "Highlight submitted for moderation review! You will be notified once approved to publish."
      );
      setTimeout(() => {
        window.location.href = "/logged-in?view=myads&tab=highlights";
      }, 1200);
      clearUserCampaignsCache(session?.user?.email || "");
      try {
        localStorage.removeItem("paayh_draft_news_v1");
      } catch {}
      
      setStep(0);
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
        await supabase.storage.from("news").remove([uploadedFilename]);
      }
      setStepError(err.message || "An error occurred while submitting highlight.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (adAccountRestriction.restricted) {
    const getCountdownStr = (untilStr: string | null) => {
      if (!untilStr) return "";
      const diffMs = new Date(untilStr).getTime() - Date.now();
      if (diffMs <= 0) return "Expired";
      const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      return `${days} day${days > 1 ? "s" : ""}`;
    };

    return (
      <div className={styles.disabledAccountCard}>
          <div className={styles.disabledAccountIcon}>
            <ShieldAlert size={32} />
          </div>
          <h2 className={styles.disabledAccountTitle}>
            Advertising & Highlight Account Disabled
          </h2>
          <p className={styles.disabledAccountDesc}>
            {adAccountRestriction.status === "temp_banned" ? (
              <>Your highlight account is temporarily suspended for <strong>{getCountdownStr(adAccountRestriction.until)}</strong>.</>
            ) : adAccountRestriction.status === "perm_banned" ? (
              <>Your highlight account has been permanently suspended due to policy violations.</>
            ) : (
              <>Your highlight account has been deactivated by administration.</>
            )}
          </p>
          {adAccountRestriction.reason && (
            <div className={styles.disabledAccountReason}>
              <strong>Reason for decision:</strong> {adAccountRestriction.reason}
            </div>
          )}
          <p className={styles.disabledAccountNote}>
            If you believe this restriction is an error, you may submit an appeal to our Help Center support team.
          </p>
          <a
            href="/help?category=Suspended%20Account&subject=Appeal%20Highlight%20Account%20Suspension"
            className={styles.disabledAccountBtn}
          >
            Appeal via Help Center
          </a>
        </div>
    );
  }

  const canNavigateToStep = (targetStep: number) => {
    if (targetStep <= step) return true;
    const hasCover = !!mediaFile || !!existingImageUrl;
    if (!hasCover) {
      setStepError("Please select a cover image for your highlight.");
      return false;
    }
    if (targetStep >= 2 && title.trim().length < 3) {
      setStepError("Title must be at least 3 characters.");
      return false;
    }
    if (targetStep >= 3 && content.trim().length < 10) {
      setStepError("Content must be at least 10 characters.");
      return false;
    }
    return true;
  };

  return (
    <div className={styles.pageWapper}>
        <div className={styles.pageWrapper}>
          {/* Progress Step Tracker */}
          <FormStepProgress
            steps={steps}
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
                onClick={() => {
                  try {
                    sessionStorage.removeItem("paayh_edit_news_id");
                    sessionStorage.removeItem("paayh_edit_news");
                  } catch (e) {}
                  window.location.href = "/myAds";
                }}
                className={styles.secondaryNavBtn}
                style={{ padding: "6px 14px", fontSize: "0.85rem" }}
              >
                Cancel Edit
              </button>
            )}
          </div>

          {stepError && (
            <div className={styles.errorAlert}>
              {stepError}
            </div>
          )}

          {statusNotice && (
            <div className={styles.statusAlert}>
              {statusNotice}
            </div>
          )}

          <div className={styles.adFormContainer}>
            <AnimatePresence mode="wait">
              {/* STEP 0: MEDIA */}
              {step === 0 && (
                <motion.div
                  key="step-0"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.22 }}
                  className={styles.formGroup}
                >
                  <label className={styles.fieldLabel}>Cover Image (Required)</label>
                  {mediaPreview ? (
                    <div className={styles.mediaPreviewContainer}>
                      <img
                        src={mediaPreview}
                        alt="Cover Preview"
                        className={styles.mediaPreviewImage}
                        onError={() => {
                          setMediaPreview(null);
                          setMediaFile(null);
                          setExistingImageUrl(null);
                        }}
                      />
                      <div className={styles.removeBtnContainer}>
                        <button
                          type="button"
                          onClick={() => {
                            setMediaFile(null);
                            setMediaPreview(null);
                            setExistingImageUrl(null);
                          }}
                          className={styles.removeBtn}
                        >
                          Remove Image
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className={styles.uploadZone}>
                      <input type="file" accept="image/*" onChange={handleMediaChange} hidden />
                      <p className={styles.uploadTitle}>Upload cover image</p>
                      <p className={styles.uploadSubtext}>PNG, JPG, or WEBP up to 5MB (1080p recommended)</p>
                      <span className={styles.uploadBrowseBtn}>Choose File</span>
                    </label>
                  )}
                  <div className={styles.stepActionsEnd}>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      whileHover={{ scale: 1.01 }}
                      disabled={!mediaFile && !existingImageUrl}
                      onClick={() => setStep(1)}
                      className={styles.primaryNavBtn}
                    >
                      Continue to Title
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* STEP 1: TITLE */}
              {step === 1 && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.22 }}
                  className={styles.formGroup}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className={styles.fieldLabel}>Highlight Title</label>
                    <span style={{
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: title.length >= 80 ? "#ef4444" : title.length >= 68 ? "var(--foreground)" : "var(--text-muted)",
                      transition: "color 0.2s ease"
                    }}>
                      {title.length} / 80
                    </span>
                  </div>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Grand Opening Sale 50% Off" className={styles.inputBox} maxLength={80} />
                  <div className={styles.stepActionsBetween}>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => setStep(0)} className={styles.secondaryNavBtn}>Back</motion.button>
                    <motion.button whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.01 }} disabled={!title.trim()} onClick={() => setStep(2)} className={styles.primaryNavBtn}>Continue to Content</motion.button>
                  </div>
                </motion.div>
              )}

              {/* STEP 2: CONTENT */}
              {step === 2 && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.22 }}
                  className={styles.formGroup}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className={styles.fieldLabel}>Highlight Details & Story</label>
                    <span style={{
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: content.length >= 1000 ? "#ef4444" : content.length >= 850 ? "var(--foreground)" : "var(--text-muted)",
                      transition: "color 0.2s ease"
                    }}>
                      {content.length} / 1000
                    </span>
                  </div>
                  <textarea
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      if (stepError) setStepError(null);
                    }}
                    placeholder="Share full details of your highlight announcement..."
                    className={styles.textareaBox}
                    rows={6}
                    maxLength={1000}
                  />
                  {content.trim().length > 0 && content.trim().length < 10 && (
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px", display: "flex", alignItems: "center", gap: "5px" }}>
                      Minimum 10 characters ({10 - content.trim().length} needed)
                    </span>
                  )}
                  <div className={styles.stepActionsBetween}>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => setStep(1)} className={styles.secondaryNavBtn}>Back</motion.button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      whileHover={{ scale: 1.01 }}
                      disabled={content.trim().length < 10}
                      onClick={() => {
                        if (content.trim().length < 10) {
                          setStepError("Content must be at least 10 characters.");
                          return;
                        }
                        setStepError(null);
                        setStep(3);
                      }}
                      className={styles.primaryNavBtn}
                    >
                      Continue to Targeting
                    </motion.button>
                  </div>
                </motion.div>
              )}

            {/* STEP 3: TARGETING, LOCATION & BIDDING */}
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
                isBiddingEnabled={isBiddingEnabled}
                setIsBiddingEnabled={setIsBiddingEnabled}
                bidPrice={bidPrice}
                setBidPrice={setBidPrice}
                highestBid={highestBid}
                formatCurrency={formatCurrency}
                setStep={setStep}
              />
            )}

            {/* STEP 4: PREVIEW & PAYMENT */}
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
      </div>
      <NoticeModal notice={noticeModal} onClose={() => setNoticeModal(null)} />
    </div>
  );
}
