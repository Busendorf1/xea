"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Edit3,
  Rocket,
  ShieldAlert,
  AlertCircle,
} from "lucide-react";
import styles from "./page.module.css";
import FormStepProgress from "@/components/ui/FormStepProgress";
import { v4 as uuidv4 } from "uuid";
import supabase from "@/lib/utils/db";
import { categoryTargetingMap, TARGETING_DIMENSIONS, type AdCategory } from "@/lib/categoryTargetingMap";
import { adAudienceSchema, adCreativeSchema, adCreativeProductSchema } from "@/lib/validationSchemas";
import { isAdminEmail } from "@/lib/adminHelper";
import { resizeImageToMax1080p } from "@/lib/utils/mediaOptimizer";
import { clearUserCampaignsCache } from "@/lib/campaignsClient";
import { showAppleAlert } from "@/components/ui/AppleAlert";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

import {
  Session,
  MultiStepAdFormProps,
  adRates,
  steps,
  Category,
  AdFormSelections,
} from "./types";
import Step0Category from "./Step0Category";
import Step1Targeting from "./Step1Targeting";
import Step2Budget from "./Step2Budget";
import Step3Creative from "./Step3Creative";
import Step4Summary from "./Step4Summary";
import Step5Launch from "./Step5Launch";

export type { Session, MultiStepAdFormProps };

export default function MultiStepAdForm({ session }: MultiStepAdFormProps) {
  const isAdmin = useMemo(() => {
    return Boolean((session?.user as any)?.isAdmin ?? isAdminEmail(session?.user?.email));
  }, [session?.user]);
  const searchParams = useSearchParams();
  const editAdId = searchParams ? searchParams.get("id") : null;
  const [editingId, setEditingId] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false);
  const [isAiContent, setIsAiContent] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "wallet">("card");
  const [adType, setAdType] = useState("politics");
  const [isBiddingEnabled, setIsBiddingEnabled] = useState(false);
  const [bidPrice, setBidPrice] = useState(0);

  // Derive targeting options from selected ad category
  const optionsMap = useMemo(
    () => categoryTargetingMap[adType as AdCategory] ?? categoryTargetingMap["individual"],
    [adType]
  );

  const activeCategories = useMemo(
    () => TARGETING_DIMENSIONS.filter((dim) => optionsMap[dim]?.length > 0),
    [optionsMap]
  );

  const [formSelections, setFormSelections] = useState<AdFormSelections>({
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
  });

  const [stepError, setStepError] = useState("");
  const [userProfile, setUserProfile] = useState<{
    mutual_count: number;
    mutuals: string[];
    last_mutual_spent?: string;
    balance: number;
  } | null>(null);

  const formatCurrency = (amount: number | string) => globalFormatCurrency(amount, formSelections.country);

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

  // Autosave draft state on changes (debounced 400ms to prevent main-thread INP jank on keystrokes)
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

  const handleInitiateSubmit = () => {
    if (isSubmitting) return;
    setStepError("");
    if (!session || !session.user?.email) {
      setStepError("User not authenticated. Please log in.");
      return;
    }

    const totalCost = calculateTotalCost();

    if (!isAdmin && paymentMethod === "wallet" && userProfile && userProfile.balance < totalCost) {
      setStepError(
        `Insufficient wallet balance. Your balance is ${formatCurrency(userProfile.balance)} but this campaign costs ${formatCurrency(totalCost)}.`
      );
      return;
    }

    if (isAdmin || totalCost <= 0) {
      submitAd();
      return;
    }

    setShowPaymentConfirmModal(true);
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
          }

          let fileData: Blob | File = optimizedFile;
          try {
            const buffer = await optimizedFile.arrayBuffer();
            fileData = new Blob([buffer], { type: file.type || (isVid ? "video/mp4" : "image/jpeg") });
          } catch (e) {
            console.warn("ArrayBuffer fallback, using raw file:", e);
          }

          const { error: uploadError } = await supabase.storage
            .from("ad-media")
            .upload(uniqueFileName, fileData, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type || (isVid ? "video/mp4" : "image/jpeg"),
            });

          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage.from("ad-media").getPublicUrl(uniqueFileName);

          return publicUrlData?.publicUrl || null;
        });

        const uploadedUrls = await Promise.all(uploadPromises);
        mediaUrlString = uploadedUrls.filter(Boolean).join(",");
      }

      let paymentUrl = "/api/payments/initialize";
      if (isAdmin || paymentMethod === "wallet") {
        paymentUrl = "/api/payments/wallet-pay";
      }

      const paymentResponse = await fetch(paymentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ad",
          amount: totalCost,
          metadata: {
            type: "ad",
            user_email: session.user.email?.toLowerCase(),
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
          },
          callbackUrl: `${window.location.origin}/logged-in`,
        }),
      });

      const paymentData = await paymentResponse.json();
      if (!paymentResponse.ok || (!paymentData.success && !paymentData.status)) {
        throw new Error(paymentData.error || "Failed to process payment");
      }

      sessionStorage.setItem("paayh_active_tab", "statement");
      clearUserCampaignsCache(session?.user?.email || "");
      try {
        localStorage.removeItem("paayh_draft_ad_v1");
      } catch {}

      const authUrl = paymentData.authorization_url || paymentData.data?.authorization_url;
      if (isAdmin || paymentMethod === "wallet") {
        window.location.href = "/logged-in";
      } else if (authUrl) {
        window.location.href = authUrl;
      } else {
        window.location.href = "/logged-in";
      }
      setIsSubmitting(false);
    } catch (err: any) {
      console.error("❌ Submit error details:", err);
      showAppleAlert(err?.message || "An unexpected error occurred during submission. Please try again.", "error");
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
      <div className={styles.suspendedCard}>
        <div className={styles.suspendedIconWrap}>
          <ShieldAlert size={32} />
        </div>
        <h2 className={styles.suspendedTitle}>Advertising and Highlight Account Disabled</h2>
        <p className={styles.suspendedBody}>
          {adAccountRestriction.status === "temp_banned" ? (
            <>
              Your advertising account is temporarily suspended for{" "}
              <strong>{getCountdownStr(adAccountRestriction.until)}</strong>.
            </>
          ) : adAccountRestriction.status === "perm_banned" ? (
            <>Your advertising account has been permanently suspended due to policy violations.</>
          ) : (
            <>Your advertising account has been deactivated by administration.</>
          )}
        </p>
        {adAccountRestriction.reason && (
          <div className={styles.suspendedReasonBox}>
            <strong>Reason for decision:</strong> {adAccountRestriction.reason}
          </div>
        )}
        <p className={styles.suspendedNote}>
          If you believe this restriction is an error, you may submit an appeal to our Help Center support team.
        </p>
        <a
          href="/help?category=Suspended%20Account&subject=Appeal%20Ad%20Account%20Suspension"
          className={styles.appealBtn}
        >
          Appeal via Help Center
        </a>
      </div>
    );
  }

  return (
    <main className={styles.pageWapper}>
      <div className={styles.pageWrapper}>
        <div className={styles.adFormContainer}>
          <FormStepProgress
            steps={steps}
            currentStep={step}
            onStepClick={(idx) => {
              setStepError("");
              setStep(idx);
            }}
          />

          <h1 className={`${styles.summaryTitle} ${styles.pageHeading}`}>
            {editingId ? (
              <>
                <Edit3 size={20} color="#818cf8" /> Edit Distribution Wave
              </>
            ) : (
              <>
                <Rocket size={20} color="#1d9bf0" /> Launch Distribution Wave (DaaS)
              </>
            )}
          </h1>
          <p className={styles.pageSubtitle}>
            {editingId
              ? "Update your target audience nodes, locations, and creative. Edits will be submitted for verification."
              : "Deploy product distribution directly to verified human demographic nodes."}
          </p>

          {editingId && (
            <div className={styles.editingSwitchWrapper}>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setStep(0);
                  setFormSelections({
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
                  });
                }}
                className={styles.switchCampaignBtn}
              >
                Switch to Create New Campaign
              </button>
            </div>
          )}

          <h2 className={`${styles.summaryTitle} ${styles.stepTitle}`}>{steps[step]}</h2>

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
            {stepError && (
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
      </div>
    </main>
  );
}
