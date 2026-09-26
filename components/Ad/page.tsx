
"use client";

import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Edit3,
  Rocket,
  ShieldAlert,
  Sparkles,
  Crown,
  AlertCircle,
  Phone,
  MessageCircle,
  Globe,
  Mail,
  Smartphone,
  PlayCircle,
  BookOpen,
  Layers,
  Image as ImageIcon,
  Video,
  FileText,
  ShoppingBag,
  ShoppingCart,
  Calendar,
  MessageSquare,
  CheckCircle2,
  Heart,
  Users,
  ExternalLink,
  Check,
  Zap,
  User,
  UserCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "../Ad/page.module.css";
import HeaderJoin from "../HeaderJoin/page";
import LocationSelector from "../LocationSelector";
import CustomSelect from "@/components/ui/CustomSelect";
import FormStepProgress from "@/components/ui/FormStepProgress";
import { v4 as uuidv4 } from "uuid";
import supabase from "@/lib/utils/db";
import dynamic from "next/dynamic";
const AdPreviewCard = dynamic(() => import("../Adreview/page"));
const AttentionMarketTicker = dynamic(() => import("./AttentionMarketTicker"), { ssr: false });
import { categoryTargetingMap, TARGETING_DIMENSIONS, type AdCategory } from "@/lib/categoryTargetingMap";
import { adAudienceSchema, adCreativeSchema, adCreativeProductSchema } from "@/lib/validationSchemas";
import { isAdminEmail } from "@/lib/adminHelper";
import { resizeImageToMax1080p } from "@/lib/utils/mediaOptimizer";
import { clearUserCampaignsCache } from "@/lib/campaignsClient";

interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

type MultiStepAdFormProps = {
  session: Session;
};

const adRates: Record<string, number> = {
  politics: 1500,
  business: 45,
  government: 2000,
  individual: 25,
  religion: 1500,
  product_sales: 55,
};
//we can pay 60%
const steps = [
  "Category",
  "Audience",
  "Budget",
  "Creative",
  "Summary",
  "Launch",
];

const getCtaIcon = (cta: string) => {
  switch (cta) {
    case "Buy":
    case "Shop":
      return <ShoppingBag size={15} />;
    case "Order":
      return <ShoppingCart size={15} />;
    case "Book":
    case "Reserve":
      return <Calendar size={15} />;
    case "Apply":
      return <FileText size={15} />;
    case "Comment":
      return <MessageSquare size={15} />;
    case "Vote":
      return <CheckCircle2 size={15} />;
    case "Donate":
      return <Heart size={15} />;
    case "Volunteer":
    case "Join":
      return <Users size={15} />;
    case "Learn More":
    case "Visit Website":
    default:
      return <ExternalLink size={15} />;
  }
};

import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

type Category =
  | "industry"
  | "interest"
  | "lifestyle"
  | "behavior"
  | "personality";
type AdMediaType = "text" | "image" | "video" | "mixed";

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
  const [isAiContent, setIsAiContent] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "wallet">("card");
  const [adType, setAdType] = useState("politics");
  const [isBiddingEnabled, setIsBiddingEnabled] = useState(false);
  const [bidPrice, setBidPrice] = useState(0);

  // Derive targeting options from the selected ad type — zero overlap guaranteed
  const optionsMap = useMemo(
    () => categoryTargetingMap[adType as AdCategory] ?? categoryTargetingMap["individual"],
    [adType]
  );

  // Only show dimensions that have options for this category
  const activeCategories = useMemo(
    () => TARGETING_DIMENSIONS.filter((dim) => optionsMap[dim]?.length > 0),
    [optionsMap]
  );

  const [formSelections, setFormSelections] = useState({
    industry: [] as string[],
    interest: [] as string[],
    lifestyle: [] as string[],
    behavior: [] as string[],
    personality: [] as string[],
    ageRange: [18, 65],
    targetingAll: false,
    impressions: 1000,
    campaignDays: 5,
    userFrequencyCap: 1,
    country: "",
    state: "",
    province: "",
    targetLocations: [] as string[],
    gender: "",
    employmentStatus: [] as string[],
    adMediaType: "" as AdMediaType | "",
    adContent: "",
    adMediaFiles: [] as File[],
    existingMedia: "",
    adActionButtons: [] as ("phone" | "whatsapp" | "website" | "email" | "ios" | "android" | "read_more" | "watch_now")[],
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

  const [mediaError, setMediaError] = useState("");
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

  // Autosave draft state on changes
  useEffect(() => {
    if (editingId) return;
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
          industry: Array.isArray(ad.industry) ? ad.industry : (ad.industry ? [ad.industry] : []),
          interest: Array.isArray(ad.interest) ? ad.interest : (ad.interest ? [ad.interest] : []),
          lifestyle: Array.isArray(ad.lifestyle) ? ad.lifestyle : (ad.lifestyle ? [ad.lifestyle] : []),
          behavior: Array.isArray(ad.behavior) ? ad.behavior : (ad.behavior ? [ad.behavior] : []),
          personality: Array.isArray(ad.personality) ? ad.personality : (ad.personality ? [ad.personality] : []),
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

  // Clear targeting selections ONLY whenever the user actively switches ad type
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
      const updated = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value];
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
          alert("You can select up to 4 employment statuses.");
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
    const fetchActiveSubscribers = async () => {
      try {
        const res = await fetch("/api/business/subscribe");
        if (res.ok) {
          const data = await res.json();
          if (data.subscribers && Array.isArray(data.subscribers) && isMounted) {
            const domains = data.subscribers
              .filter((s: any) => s.status === "active" && (s.payment_status === "paid" || s.domain === "baggyt.com"))
              .map((s: any) => s.domain.toLowerCase().trim())
              .filter(Boolean);
            setActiveSubscribers(Array.from(new Set(["baggyt.com", ...domains])));
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
      return baseRate * 0.7; // 30% discount (e.g. ₦55 -> ₦38.50)
    }
    return baseRate;
  };

  const calculateTotalCost = () => {
    if (isAdmin) return 0;
    return calculateTotalCostPerImpression() * formSelections.impressions;
  };

  const resetForm = () => {
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
      existingMedia: "",
    });
    setAdType("politics");
  };

  const containsLink = (text: string) => {
    return /(https?:\/\/|www\.|\.com|\.net|\.org|\.io|mailto:|tel:)/i.test(
      text
    );
  };

  /** Step 2 — audience / budget numeric validation */
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

  /** Step 3 — creative validation (media assets + copy and interactive actions) */
  const validateStep3 = (): boolean => {
    setStepError("");
    if (!formSelections.adMediaType) {
      setStepError("Please select an ad media type.");
      return false;
    }
    if (formSelections.adMediaType !== "text" && formSelections.adMediaFiles.length === 0 && !formSelections.existingMedia) {
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
      setStepError(`Insufficient wallet balance. Your balance is ${formatCurrency(userProfile.balance)} but this campaign costs ${formatCurrency(totalCost)}.`);
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

          // 1080p Standard Dimension Cap: Scale down high-resolution images (4K, 8K, iPhone ProRAW)
          let optimizedFile: File | Blob = file;
          if (!isVid && file instanceof File) {
            try {
              optimizedFile = await resizeImageToMax1080p(file);
            } catch (optErr) {
              console.warn("Image 1080p optimization notice:", optErr);
            }
          }

          // Force WebKit / iOS to resolve full iCloud asset download into memory buffer
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

          const { data: publicUrlData } = supabase.storage
            .from("ad-media")
            .getPublicUrl(uniqueFileName);

          return publicUrlData?.publicUrl || null;
        });

        const uploadedUrls = await Promise.all(uploadPromises);
        mediaUrlString = uploadedUrls.filter(Boolean).join(",");
      }

      // Initialize Paystack payment or wallet pay depending on selector
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
            }
          },
          callbackUrl: `${window.location.origin}/logged-in`
        })
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
      console.error("❌ Submit error details:", {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err
      });
      alert(err?.message || "An unexpected error occurred during submission. Please try again.");
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
          <h2 className={styles.suspendedTitle}>
            Advertising and Highlight Account Disabled
          </h2>
          <p className={styles.suspendedBody}>
            {adAccountRestriction.status === "temp_banned" ? (
              <>Your advertising account is temporarily suspended for <strong>{getCountdownStr(adAccountRestriction.until)}</strong>.</>
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
    <>
      <main className={styles.pageWapper}>
        <div className={styles.pageWrapper}>
          <div className={styles.adFormContainer}>
            {/* Sleek Multi-Step Wizard Progress Header (Standardized to /news) */}
            <FormStepProgress
              steps={steps}
              currentStep={step}
              onStepClick={(idx) => {
                setStepError("");
                setStep(idx);
              }}
            />

            <h1 className={`${styles.summaryTitle} ${styles.pageHeading}`}>
              {editingId ? <><Edit3 size={20} color="#818cf8" /> Edit Campaign</> : <><Rocket size={20} color="#1d9bf0" /> Create New Ad Campaign</>}
            </h1>
            <p className={styles.pageSubtitle}>
              {editingId ? "Update your target audience, locations, and creative. Edits will be submitted for verification." : "Reach active audiences with hyper-targeted ad delivery."}
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

            {/* Step 0 */}
            {step === 0 && (
              <div className={styles.modernSectionCard}>
                <div className={styles.modernSectionHeader}>
                  <span className={styles.modernSectionTitle}>Select Campaign Ad Category</span>
                  <span className={styles.modernSectionBadge}>
                    {adType === "product_sales" ? "Product Sales" : adType.charAt(0).toUpperCase() + adType.slice(1)} · {formatCurrency(adRates[adType] || 0)}/attention
                  </span>
                </div>
                <div className={styles.modernSectionBody}>
                  <p className={styles.categoryDescription}>
                    Choose the category that best matches your ad campaign. </p>
                  <div className={`${styles.adTypeGrid} ${styles.adTypeGridSpaced}`}>
                    {Object.keys(adRates).map((key) => {
                      const isSelected = adType === key;
                      const rate = adRates[key];
                      const displayName = key === "product_sales" ? "Product Sales" : key.charAt(0).toUpperCase() + key.slice(1);
                      return (
                        <div
                          key={key}
                          className={`${styles.adTypeCard} ${isSelected ? styles.adTypeCardActive : ""}`}
                          onClick={() => setAdType(key)}
                        >
                          <div className={styles.adTypeCardTitle}>{displayName}</div>
                          <div className={styles.adTypeCardBadge}>{formatCurrency(rate)} / attention</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Step 1 — targeting options scoped to the chosen ad category */}
            {step === 1 && (
              <>
                <p className={styles.targetingNote}>
                  Showing targeting options for{" "}
                  <strong>{adType === "product_sales" ? "Product Sales" : adType.charAt(0).toUpperCase() + adType.slice(1)}</strong>{" "}
                  ads. Switch category in Step 0 to see different options.
                </p>

                {activeCategories.map((cat) => {
                  const items = optionsMap[cat] || [];
                  const selectedList = formSelections[cat] || [];
                  const isAllSelected = items.length > 0 && items.every((item) => selectedList.includes(item));
                  const selectedCount = selectedList.length;

                  return (
                    <div key={cat} className={`${styles.dropdownContainer} ${styles.modernSectionCard}`}>
                      <details open>
                        <summary className={`${styles.modernSectionHeader} ${styles.categorySummaryHeader}`}>
                          <span className={styles.modernSectionTitle}>
                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                            {selectedCount > 0 && (
                              <span className={styles.modernSectionBadge}>
                                {selectedCount} selected
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleTargetAll(cat, e)}
                            className={`${styles.targetAllBtn} ${isAllSelected ? styles.targetAllBtnActive : ""}`}
                          >
                            {isAllSelected ? "Deselect All" : "Target All"}
                          </button>
                        </summary>
                        <div className={`${styles.modernSectionBody} ${styles.categoryGridBody}`}>
                          {items.map((item, i) => (
                            <label key={i} className={styles.categoryItemLabel}>
                              <input
                                type="checkbox"
                                checked={selectedList.includes(item)}
                                onChange={() => toggleSelection(cat, item)}
                              />
                              {item}
                            </label>
                          ))}
                        </div>
                      </details>
                    </div>
                  );
                })}
                {activeCategories.length === 0 && (
                  <p className={styles.targetingNote}>
                    No granular targeting available for Individual ads — your ad will reach a broad general audience.
                  </p>
                )}
              </>
            )}

            {/* Step 2: Budget & Reach */}
            {step === 2 && (
              <>
                {/* Audience Demographics */}
                <div className={styles.modernSectionCard}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>Audience Demographics</span>
                    <span className={styles.modernSectionBadge}>
                      {formSelections.ageRange[0]}–{formSelections.ageRange[1]} yrs · {formSelections.gender ? formSelections.gender.charAt(0).toUpperCase() + formSelections.gender.slice(1) : "All genders"}
                    </span>
                  </div>
                  <div className={styles.modernSectionBody}>
                    <div className={styles.formGroup}>
                      <label className={styles.fieldLabelBold}>Target Gender:</label>
                      <div className={styles.genderSegmentGroup}>
                        {[
                          { value: "", label: "All Genders", icon: <Users size={14} /> },
                          { value: "male", label: "Male Only", icon: <User size={14} /> },
                          { value: "female", label: "Female Only", icon: <UserCheck size={14} /> },
                        ].map((g) => {
                          const isSelected = formSelections.gender === g.value;
                          return (
                            <button
                              key={g.value}
                              type="button"
                              onClick={() =>
                                setFormSelections((prev) => ({
                                  ...prev,
                                  gender: g.value,
                                }))
                              }
                              className={`${styles.genderSegmentBtn} ${isSelected ? styles.genderSegmentBtnActive : ""}`}
                            >
                              {g.icon}
                              <span>{g.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    
                    <div className={styles.ageRangeRow}>
                      <div className={styles.ageRangeField}>
                        <label className={`${styles.ageRangeLabel} ${styles.fieldLabelBold}`}>Target Min Age</label>
                        <CustomSelect
                          value={String(formSelections.ageRange[0])}
                          onChange={(val) => {
                            const min = parseInt(val, 10);
                            setFormSelections((prev) => {
                              const max = Math.max(min, prev.ageRange[1]);
                              return {
                                ...prev,
                                ageRange: [min, max],
                              };
                            });
                          }}
                          options={Array.from({ length: 83 }, (_, i) => ({
                            value: String(i + 18),
                            label: `${i + 18} years`,
                          }))}
                          placeholder="Min Age"
                        />
                      </div>
                      <div className={styles.ageRangeField}>
                        <label className={`${styles.ageRangeLabel} ${styles.fieldLabelBold}`}>Target Max Age</label>
                        <CustomSelect
                          value={String(formSelections.ageRange[1])}
                          onChange={(val) => {
                            const max = parseInt(val, 10);
                            setFormSelections((prev) => {
                              const min = Math.min(max, prev.ageRange[0]);
                              return {
                                ...prev,
                                ageRange: [min, max],
                              };
                            });
                          }}
                          options={Array.from({ length: 83 }, (_, i) => ({
                            value: String(i + 18),
                            label: `${i + 18} years`,
                          }))}
                          placeholder="Max Age"
                        />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.fieldLabelBold}>Employment Status (Select up to 4):</label>
                      <div className={styles.checkboxGroup}>
                        {[
                          { value: "employed", label: "Employed" },
                          { value: "unemployed", label: "Unemployed" },
                          { value: "student", label: "Student" },
                          { value: "entrepreneur", label: "Entrepreneur" },
                          { value: "freelancer", label: "Freelancer" },
                          { value: "retired", label: "Retired" },
                        ].map((option) => {
                          const currentList = Array.isArray(formSelections.employmentStatus)
                            ? formSelections.employmentStatus
                            : formSelections.employmentStatus
                            ? (formSelections.employmentStatus as string).split(",").map((s) => s.trim())
                            : [];
                          const isChecked = currentList.includes(option.value);
                          return (
                            <label key={option.value} className={styles.checkboxLabel}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleEmploymentStatus(option.value)}
                              />
                              <span>{option.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Attention Volume & Delivery Controls */}
                <div className={styles.modernSectionCard}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>Attention Volume &amp; Delivery Controls</span>
                    <span className={styles.modernSectionBadge}>
                      {formSelections.impressions.toLocaleString()} views · {formSelections.campaignDays} day{formSelections.campaignDays > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className={styles.modernSectionBody}>
                    <div className={styles.formGroup}>
                      <label htmlFor="impression-input" className={`${styles.labelBlock} ${styles.fieldLabelBold}`}>
                        Audience or Real Human Attention
                      </label>
                      <div className={styles.impressionStack}>
                        <input
                          type="range"
                          id="impression"
                          min={1}
                          max={10000} /*as our user increases, we increase the targetable number so we can deliver on our capacity*/
                          step={1}
                          value={formSelections.impressions}
                          onChange={(e) =>
                            setFormSelections((prev) => ({
                              ...prev,
                              impressions: parseInt(e.target.value) || 1,
                            }))
                          }
                          className={styles.impressionSliderFull}
                        />
                        <div className={styles.impressionInputRow}>
                          <input
                            type="number"
                            id="impression-input"
                            min={1}
                            max={5000000}
                            value={formSelections.impressions}
                            onChange={(e) => {
                              let val = parseInt(e.target.value);
                              if (isNaN(val)) val = 1;
                              if (val > 5000000) val = 5000000;
                              setFormSelections((prev) => ({
                                ...prev,
                                impressions: val,
                              }));
                            }}
                            className={styles.impressionInput}
                          />
                        </div>
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={`${styles.labelBlock} ${styles.fieldLabelBold}`}>
                        Campaign Duration: {formSelections.campaignDays} day{formSelections.campaignDays > 1 ? "s" : ""}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={formSelections.campaignDays}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setFormSelections((prev) => ({
                            ...prev,
                            campaignDays: isNaN(val) || val < 1 ? 1 : val,
                          }));
                        }}
                        className={styles.inputBox}
                        placeholder="e.g. 5"
                      />
                      <p className={styles.hintText}>
                        Daily Attention Cap: ~{Math.ceil(formSelections.impressions / formSelections.campaignDays).toLocaleString()} attentions/day
                      </p>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={`${styles.labelBlock} ${styles.fieldLabelBold}`}>
                        Target Views Per User: {formSelections.userFrequencyCap} view{formSelections.userFrequencyCap > 1 ? "s" : ""}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={formSelections.userFrequencyCap}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setFormSelections((prev) => ({
                            ...prev,
                            userFrequencyCap: isNaN(val) || val < 1 ? 1 : val,
                          }));
                        }}
                        className={styles.inputBox}
                        placeholder="e.g. 3"
                      />
                      <p className={styles.hintText}>
                        A viewer can see this ad up to {formSelections.userFrequencyCap} time{formSelections.userFrequencyCap > 1 ? "s" : ""} before it stops showing for them.
                      </p>
                      <p className={styles.hintTextItalic}>
                        Tip: Ads shown 3 - 7 or more times are more likely to be remembered and increases likelihood of taking action than ads shown only once.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mutual Features */}
                <div className={styles.modernSectionCard}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>Mutual Attention Network</span>
                    <span className={styles.modernSectionBadge}>
                      {formSelections.displayMutualButton ? "Mutual+ Enabled" : "Optional"}
                    </span>
                  </div>
                  <div className={styles.modernSectionBody}>
                    <label className={styles.mutualLabel}>
                      <input
                        type="checkbox"
                        checked={formSelections.displayMutualButton}
                        onChange={(e) =>
                          setFormSelections((prev) => ({
                            ...prev,
                            displayMutualButton: e.target.checked,
                          }))
                        }
                      />
                      <span>Display &quot;Mutual+&quot; button on this ad (allow viewers to add you as a mutual)</span>
                    </label>

                    {formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0 && (
                      <div className={styles.mutualActivatedBox}>
                        <strong className={styles.mutualActivatedTitle}> Free Mutual Attention Activated!</strong>
                        <span>Ticking this box will add your <strong>{userProfile.mutual_count} mutuals</strong> as free attention to this campaign.</span>
                        <span className={styles.mutualActivatedHint}>
                          Total target: <strong>{(formSelections.impressions + userProfile.mutual_count).toLocaleString()} views</strong> (You only pay for {formSelections.impressions.toLocaleString()} views). Your {userProfile.mutual_count} mutuals will be targeted first, and your mutual count will be spent.
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Target Location & Geographies */}
                <div className={styles.modernSectionCard}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>Target Location &amp; Geographies</span>
                    <span className={styles.modernSectionBadge}>
                      {(formSelections.targetLocations && formSelections.targetLocations.length > 0)
                        ? `${formSelections.targetLocations.length} locations`
                        : formSelections.state || formSelections.country || "All locations"}
                    </span>
                  </div>
                  <div className={styles.modernSectionBody}>
                    <LocationSelector
                      country={formSelections.country}
                      state={formSelections.state}
                      location={formSelections.province}
                      multiLocation={true}
                      multiLocations={formSelections.targetLocations || []}
                      onChange={({ country, state, location, multiLocations }) =>
                        setFormSelections((prev) => ({
                          ...prev,
                          country: country || "",
                          state: state || "",
                          province: (multiLocations && multiLocations.length > 0) ? multiLocations.join("; ") : (location || ""),
                          targetLocations: multiLocations || [],
                        }))
                      }
                      cityLabel="Province"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Step 3: Creative (Media & Copy) */}
            {step === 3 && (
              <>
                <div className={styles.modernSectionCard}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>Ad Media &amp; Visual Assets</span>
                  <span className={styles.modernSectionBadge}>
                    {formSelections.adMediaType ? formSelections.adMediaType.toUpperCase() : "Select Format"}
                  </span>
                </div>
                <div className={styles.modernSectionBody}>
                  <div className={styles.formGroup}>
                    <label className={styles.fieldLabelBold}>Ad Media Format &amp; Visual Asset Type</label>
                    <div className={styles.mediaTypeGrid}>
                      {[
                        {
                          value: "text",
                          title: "Text Only",
                          badge: "Fastest Load",
                          desc: "Clean message copy & typography. No visual upload needed.",
                          icon: <FileText size={15} color="#3b82f6" />,
                        },
                        {
                          value: "image",
                          title: "Image(s)",
                          badge: "Up to 4 Photos",
                          desc: "High-resolution photos & banners (JPG, PNG, max 5MB each).",
                          icon: <ImageIcon size={15} color="#10b981" />,
                        },
                        {
                          value: "video",
                          title: "Video Only",
                          badge: "Max 5 Mins",
                          desc: "High-impact video storytelling (MP4, MOV, max 60MB).",
                          icon: <Video size={15} color="#f59e0b" />,
                        },
                        {
                          value: "mixed",
                          title: "Mixed Media",
                          badge: "Images + Video",
                          desc: "Up to 3 high-res images and 1 video for maximum engagement.",
                          icon: <Layers size={15} color="#8b5cf6" />,
                        },
                      ].map((format) => {
                        const isSelected = formSelections.adMediaType === format.value;
                        return (
                          <div
                            key={format.value}
                            onClick={() =>
                              setFormSelections((prev) => ({
                                ...prev,
                                adMediaType: format.value as AdMediaType,
                                adMediaFiles: [],
                              }))
                            }
                            className={`${styles.mediaTypeCard} ${isSelected ? styles.mediaTypeCardActive : ""}`}
                          >
                            <div className={styles.mediaTypeCardHeader}>
                              <div className={styles.mediaTypeCardIcon}>{format.icon}</div>
                              <span className={styles.mediaTypeCardBadge}>{format.badge}</span>
                            </div>
                            <h4 className={styles.mediaTypeCardTitle}>{format.title}</h4>
                            <p className={styles.mediaTypeCardDesc}>{format.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {formSelections.adMediaType && formSelections.adMediaType !== "text" && (
                    <div className={styles.formGroup}>
                      <label className={styles.fieldLabelBold}>Upload Files</label>
                      <input
                        type="file"
                        multiple={formSelections.adMediaType !== "video"}
                        accept={
                          formSelections.adMediaType === "video"
                            ? "video/*"
                            : formSelections.adMediaType === "image"
                            ? "image/*"
                            : "image/*,video/*"
                        }
                        onChange={async (e) => {
                          const files = e.target.files;
                          if (!files || files.length === 0) return;
                          const fileArray = Array.from(files);

                          // Separate images and videos
                          const images = fileArray.filter(f => f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f.name));
                          const videos = fileArray.filter(f => f.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(f.name));

                          // Validation checks
                          if (formSelections.adMediaType === "image") {
                            if (videos.length > 0) {
                              alert("Only images are allowed for this type.");
                              e.target.value = "";
                              return;
                            }
                            if (images.length > 4) {
                              alert("You can select up to 4 images only.");
                              e.target.value = "";
                              return;
                            }
                          } else if (formSelections.adMediaType === "video") {
                            if (images.length > 0) {
                              alert("Only videos are allowed for this type.");
                              e.target.value = "";
                              return;
                            }
                            if (videos.length > 1) {
                              alert("You can select only 1 video.");
                              e.target.value = "";
                              return;
                            }
                          } else if (formSelections.adMediaType === "mixed") {
                            if (videos.length > 1) {
                              alert("You can select at most 1 video.");
                              e.target.value = "";
                              return;
                            }
                            if (images.length > 3) {
                              alert("You can select at most 3 images.");
                              e.target.value = "";
                              return;
                            }
                            if (images.length + videos.length > 4) {
                              alert("Total number of files cannot exceed 4.");
                              e.target.value = "";
                              return;
                            }
                          }

                          // Size and video duration checks
                          for (const file of fileArray) {
                            const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
                            const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(file.name);

                            if (isImage) {
                              if (file.size > 5 * 1024 * 1024) {
                                alert(`Image ${file.name} exceeds 5MB limit.`);
                                e.target.value = "";
                                return;
                              }
                            } else if (isVideo) {
                              if (file.size > 60 * 1024 * 1024) {
                                alert(`Video ${file.name} exceeds 60MB limit.`);
                                e.target.value = "";
                                return;
                              }
                              // Gracefully check duration with iCloud streaming fallback
                              let durationOk = true;
                              try {
                                durationOk = await new Promise<boolean>((resolve) => {
                                  const videoEl = document.createElement("video");
                                  videoEl.preload = "metadata";
                                  const timer = setTimeout(() => {
                                    // If iCloud is still streaming/downloading, allow if file size is valid
                                    resolve(file.size <= 60 * 1024 * 1024);
                                  }, 3500);

                                  videoEl.onloadedmetadata = () => {
                                    clearTimeout(timer);
                                    resolve(videoEl.duration <= 300);
                                  };
                                  videoEl.onerror = () => {
                                    clearTimeout(timer);
                                    // On iOS iCloud offloaded assets, allow file by size
                                    resolve(file.size <= 60 * 1024 * 1024);
                                  };
                                  videoEl.src = URL.createObjectURL(file);
                                });
                              } catch {
                                durationOk = file.size <= 60 * 1024 * 1024;
                              }

                              if (!durationOk) {
                                alert(`Video ${file.name} must be less than or equal to 5 minutes.`);
                                e.target.value = "";
                                return;
                              }
                            }
                          }

                          setFormSelections(prev => ({
                            ...prev,
                            adMediaFiles: fileArray
                          }));
                        }}
                        className={styles.inputBox}
                      />
                      {formSelections.adMediaFiles.length > 0 && (
                        <div className={styles.selectedFilesHint}>
                          Selected: {formSelections.adMediaFiles.map(f => f.name).join(", ")}
                        </div>
                      )}
                      {formSelections.existingMedia && formSelections.adMediaFiles.length === 0 && (
                        <div className={styles.selectedFilesHint}>
                          Current campaign media preserved. Choose new file(s) above if you wish to replace it.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Copy & Interactive Actions */}
              <div className={styles.adCreativeSection}>
                {isAdmin && (
                  <div className={`${styles.modernSectionCard} ${styles.adminPrivilegeCard}`}>
                    <div className={`${styles.modernSectionHeader} ${styles.adminPrivilegeHeader}`}>
                      <span className={`${styles.modernSectionTitle} ${styles.adminPrivilegeTitle}`}>
                        <Crown size={16} color="var(--primary)" /> Admin Privilege: Custom Branding
                      </span>
                      <span className={`${styles.modernSectionBadge} ${styles.adminPrivilegeBadge}`}>
                        Free Publishing Active
                      </span>
                    </div>
                    <div className={styles.modernSectionBody}>
                      <div className={styles.formGroup}>
                        <label className={styles.fieldLabelBold}>Custom Sponsor Name (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. ABC Ltd (defaults to Sponsored)"
                          value={formSelections.customSponsorName}
                          onChange={(e) => setFormSelections((prev) => ({ ...prev, customSponsorName: e.target.value }))}
                          className={styles.inputBox}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.fieldLabelBold}>Custom Handle (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. @abc_ltd (defaults to @Sponsored)"
                          value={formSelections.customSponsorHandle}
                          onChange={(e) => setFormSelections((prev) => ({ ...prev, customSponsorHandle: e.target.value }))}
                          className={styles.inputBox}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {adType === "product_sales" ? (
                  <div className={styles.modernSectionCard}>
                    <div className={styles.modernSectionHeader}>
                      <span className={styles.modernSectionTitle}>Product Offer &amp; Primary Action</span>
                      <span className={styles.modernSectionBadge}>
                        {formSelections.productCtaType || "Buy"}
                      </span>
                    </div>
                    <div className={styles.modernSectionBody}>
                      <div className={styles.formGroup}>
                        <label className={styles.fieldLabelBold}>
                          Product Name{" "}
                          <span className={styles.charCount}>
                            {formSelections.productName.length}/80
                          </span>
                        </label>
                        <input
                          type="text"
                          maxLength={80}
                          value={formSelections.productName}
                          placeholder="Enter product name (max 80 characters)"
                          onChange={(e) =>
                            setFormSelections((prev) => ({
                              ...prev,
                              productName: e.target.value,
                            }))
                          }
                          className={styles.inputBox}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.fieldLabelBold}>Product Price (₦)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={formSelections.productPrice}
                          placeholder="Enter product price in Naira"
                          onChange={(e) =>
                            setFormSelections((prev) => ({
                              ...prev,
                              productPrice: e.target.value,
                            }))
                          }
                          className={styles.inputBox}
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.fieldLabelBold}>Primary CTA Button Text (Select 1 CTA)</label>
                        <CustomSelect
                          value={formSelections.productCtaType || "Buy"}
                          onChange={(val) =>
                            setFormSelections((prev) => ({
                              ...prev,
                              productCtaType: val,
                            }))
                          }
                          options={[
                            "Buy",
                            "Shop",
                            "Order",
                            "Book",
                            "Reserve",
                            "Apply",
                            "Comment",
                            "Join",
                            "Learn More",
                            "Visit Website",
                          ].map((cta) => ({
                            value: cta,
                            label: cta,
                            icon: getCtaIcon(cta),
                          }))}
                          placeholder="Select Primary CTA"
                        />
                        <div className={styles.ctaPreviewRow}>
                          <span className={styles.ctaPreviewLabel}>Live Feed Button:</span>
                          <span className={styles.ctaPreviewBtn}>
                            {getCtaIcon(formSelections.productCtaType || "Buy")}
                            <span>{formSelections.productCtaType || "Buy"}</span>
                          </span>
                        </div>
                      </div>

                      <div className={styles.formGroup}>
                        <div className={styles.ctaLabelRow}>
                          <label className={styles.fieldLabelBold}>Primary CTA Link (Secure HTTPS)</label>
                          <Link href="/business/subscribe" className={styles.premiumLink}>
                            E-commerce platform? Become a Premium Subscriber
                          </Link>
                        </div>
                        <input
                          type="text"
                          value={formSelections.productCtaLink}
                          placeholder="https://yourwebsite.com/product-page"
                          onChange={(e) =>
                            setFormSelections((prev) => ({
                              ...prev,
                              productCtaLink: e.target.value,
                            }))
                          }
                          className={`${styles.inputBox} ${
                            formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://")
                              ? styles.inputError
                              : ""
                          }`}
                        />
                        {formSelections.productCtaLink && isSubsidizedLink(formSelections.productCtaLink) && (
                          <div className={styles.subsidyBanner}>
                            <span>Baggyt is a premium subscriber, 30% Off your ad cost applies.</span>
                          </div>
                        )}
                        {formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://") && (
                          <p className={styles.error}>
                            The link must be a secure link starting with https://
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.modernSectionCard}>
                    <div className={styles.modernSectionHeader}>
                      <span className={styles.modernSectionTitle}>Action &amp; Engagement CTA</span>
                      <span className={styles.modernSectionBadge}>
                        {formSelections.productCtaType || "Comment"}
                      </span>
                    </div>
                    <div className={styles.modernSectionBody}>
                      <div className={styles.formGroup}>
                        <label className={styles.fieldLabelBold}>Action &amp; Engagement CTA (Select 1 CTA)</label>
                        <CustomSelect
                          value={formSelections.productCtaType || "Comment"}
                          onChange={(val) =>
                            setFormSelections((prev) => ({
                              ...prev,
                              productCtaType: val,
                            }))
                          }
                          options={[
                            "Comment",
                            "Vote",
                            "Donate",
                            "Volunteer",
                            "Book",
                            "Reserve",
                            "Apply",
                            "Order",
                            "Buy",
                            "Shop",
                            "Join",
                            "Learn More",
                            "Visit Website",
                          ].map((cta) => ({
                            value: cta,
                            label: cta,
                            icon: getCtaIcon(cta),
                          }))}
                          placeholder="Select Engagement Action"
                        />
                        <div className={styles.ctaPreviewRow}>
                          <span className={styles.ctaPreviewLabel}>Live Feed Button:</span>
                          <span className={styles.ctaPreviewBtn}>
                            {getCtaIcon(formSelections.productCtaType || "Comment")}
                            <span>{formSelections.productCtaType || "Comment"}</span>
                          </span>
                        </div>
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.fieldLabelBold}>CTA Target Link (WhatsApp, Chat App, Email or Website)</label>
                        <input
                          type="text"
                          value={formSelections.productCtaLink}
                          placeholder="e.g. https://wa.me/234... or https://chat.whatsapp.com/... or https://yourlink.com"
                          onChange={(e) =>
                            setFormSelections((prev) => ({
                              ...prev,
                              productCtaLink: e.target.value,
                            }))
                          }
                          className={`${styles.inputBox} ${
                            formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://") && !formSelections.productCtaLink.startsWith("http://") && !formSelections.productCtaLink.startsWith("mailto:")
                              ? styles.inputError
                              : ""
                          }`}
                        />
                        <span className={styles.inputHelperText}>
                          {(() => {
                            const cta = formSelections.productCtaType || "Comment";
                            switch (cta) {
                              case "Comment":
                                return "Directs viewers to drop opinions, comments, or leave feedback outside the app.";
                              case "Vote":
                                return "Directs viewers to voter registration, polling info, or campaign voting portals.";
                              case "Donate":
                                return "Directs viewers to contribute securely to your campaign or cause.";
                              case "Volunteer":
                                return "Directs viewers to sign up as a campaign volunteer, grassroots agent, or supporter.";
                              case "Book":
                                return "Directs viewers to book an appointment, session, ticket, or consultation outside the app.";
                              case "Reserve":
                                return "Directs viewers to make a reservation for a table, seat, or event outside the app.";
                              case "Apply":
                                return "Directs viewers to submit an application for a job, program, or offer outside the app.";
                              case "Order":
                                return "Directs viewers to place an order directly on your linked store, menu, or chat.";
                              case "Buy":
                              case "Shop":
                                return "Directs viewers to purchase your product or service on your linked store.";
                              case "Join":
                                return "Directs viewers to join your community, channel, group, or membership.";
                              case "Learn More":
                              case "Visit Website":
                              default:
                                return "Directs viewers to your external link to explore, learn more, or connect.";
                            }
                          })()}
                        </span>
                        {formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://") && !formSelections.productCtaLink.startsWith("http://") && !formSelections.productCtaLink.startsWith("mailto:") && (
                          <p className={styles.error}>
                            Please enter a valid link starting with https:// or mailto:
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className={styles.modernSectionCard}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>
                      {adType === "product_sales" ? "Product Description" : "Ad Message Copy"}
                    </span>
                    <span className={styles.modernSectionBadge}>
                      {formSelections.adContent.length}/{adType === "product_sales" ? 200 : (formSelections.adActionButtons.includes("read_more") ? 500 : 220)}
                    </span>
                  </div>
                  <div className={styles.modernSectionBody}>
                    <div className={styles.formGroup}>
                      <textarea
                        maxLength={adType === "product_sales" ? 200 : (formSelections.adActionButtons.includes("read_more") ? 500 : 220)}
                        value={formSelections.adContent}
                        placeholder={adType === "product_sales" ? "Write product description here (no links allowed)" : "Write your ad message here (no links allowed)"}
                        onChange={(e) => {
                          e.target.style.height = "auto";
                          e.target.style.height = `${e.target.scrollHeight}px`;
                          setFormSelections((prev) => ({
                            ...prev,
                            adContent: e.target.value,
                          }));
                        }}
                        className={`${styles.inputBox} ${styles.textareaAutoResize} ${
                          containsLink(formSelections.adContent)
                            ? styles.inputError
                            : ""
                        }`}
                      />
                      {containsLink(formSelections.adContent) && (
                        <p className={styles.error}>
                          Links are not allowed in the ad content.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.modernSectionCard}>
                  {(() => {
                    const hasPrimaryCta = Boolean(formSelections.productCtaLink?.trim()) || adType === "product_sales";
                    const maxButtons = hasPrimaryCta ? 2 : 3;

                    return (
                      <>
                        <div className={styles.modernSectionHeader}>
                          <span className={styles.modernSectionTitle}>Interactive Action Buttons</span>
                          <span className={styles.modernSectionBadge}>
                            {formSelections.adActionButtons.length}/{maxButtons} active
                          </span>
                        </div>
                        <div className={styles.modernSectionBody}>
                          {hasPrimaryCta && (
                            <p className={styles.actionSubHint}>
                              Reduced to max {maxButtons} buttons to ensure clean mobile card spacing alongside &quot;{formSelections.productCtaType || "Comment"}&quot;.
                            </p>
                          )}

                          <div className={styles.actionMeterRow}>
                            <span className={styles.actionMeterText}>
                              <Zap size={15} color="var(--primary)" /> Interactive Feed CTAs
                            </span>
                            <span className={styles.actionMeterBadge}>
                              {formSelections.adActionButtons.length} of {maxButtons} Selected
                              {formSelections.adActionButtons.length >= maxButtons && " (Max Limit)"}
                            </span>
                          </div>

                          <div className={styles.actionDeckGrid}>
                            {(() => {
                              const baseButtons: string[] = ["whatsapp", "phone", "website", "email"];
                              if (adType === "business" || adType === "government") {
                                baseButtons.push("ios", "android");
                              }
                              if (adType === "business" || adType === "government" || formSelections.adMediaType === "video") {
                                baseButtons.push("watch_now");
                              }
                              if (formSelections.adMediaType === "text") {
                                baseButtons.push("read_more");
                              }

                              const buttonMetaMap: Record<
                                string,
                                {
                                  title: string;
                                  subtitle: string;
                                  icon: React.ReactNode;
                                  color: string;
                                  bg: string;
                                  previewLabel: string;
                                  inputType: string;
                                  placeholder: string;
                                }
                              > = {
                                whatsapp: {
                                  title: "WhatsApp Direct",
                                  subtitle: "Direct 1-tap chat with your WhatsApp number",
                                  icon: <MessageCircle size={18} />,
                                  color: "#25D366",
                                  bg: "rgba(37, 211, 102, 0.14)",
                                  previewLabel: "WhatsApp",
                                  inputType: "tel",
                                  placeholder: "e.g. 234904567890 (no plus or spaces)",
                                },
                                phone: {
                                  title: "Direct Phone Call",
                                  subtitle: "Immediate phone dialer prompt on user device",
                                  icon: <Phone size={18} />,
                                  color: "#10b981",
                                  bg: "rgba(16, 185, 129, 0.14)",
                                  previewLabel: "Call Now",
                                  inputType: "tel",
                                  placeholder: "e.g. 234904567890",
                                },
                                website: {
                                  title: "External Website",
                                  subtitle: "Directs audience to your target web address",
                                  icon: <Globe size={18} />,
                                  color: "#0284c7",
                                  bg: "rgba(2, 132, 199, 0.14)",
                                  previewLabel: "Website",
                                  inputType: "url",
                                  placeholder: "e.g. https://yourwebsite.com",
                                },
                                email: {
                                  title: "Email Inquiry",
                                  subtitle: "Opens email composer with your recipient address",
                                  icon: <Mail size={18} />,
                                  color: "#8b5cf6",
                                  bg: "rgba(139, 92, 246, 0.14)",
                                  previewLabel: "Email Us",
                                  inputType: "email",
                                  placeholder: "e.g. hello@yourbrand.com",
                                },
                                ios: {
                                  title: "Install iOS App",
                                  subtitle: "App Store link for iPhone and iPad devices",
                                  icon: <Smartphone size={18} />,
                                  color: "#94a3b8",
                                  bg: "rgba(148, 163, 184, 0.16)",
                                  previewLabel: "App Store",
                                  inputType: "url",
                                  placeholder: "e.g. https://apps.apple.com/app/...",
                                },
                                android: {
                                  title: "Install Android App",
                                  subtitle: "Google Play Store listing link for Android users",
                                  icon: <Smartphone size={18} />,
                                  color: "#22c55e",
                                  bg: "rgba(34, 197, 94, 0.14)",
                                  previewLabel: "Play Store",
                                  inputType: "url",
                                  placeholder: "e.g. https://play.google.com/store/apps/details?id=...",
                                },
                                watch_now: {
                                  title: "Watch Video",
                                  subtitle: "Direct link to video premiere, stream, or channel",
                                  icon: <PlayCircle size={18} />,
                                  color: "#ef4444",
                                  bg: "rgba(239, 68, 68, 0.14)",
                                  previewLabel: "Watch Now",
                                  inputType: "url",
                                  placeholder: "e.g. https://youtube.com/watch?v=...",
                                },
                                read_more: {
                                  title: "Expand Story",
                                  subtitle: "Unlocks up to 500 characters of rich ad copy",
                                  icon: <BookOpen size={18} />,
                                  color: "#f59e0b",
                                  bg: "rgba(245, 158, 11, 0.14)",
                                  previewLabel: "Read More",
                                  inputType: "none",
                                  placeholder: "",
                                },
                              };

                              return baseButtons.map((type) => {
                                const isSelected = formSelections.adActionButtons.includes(type as any);
                                const isLimitReached = !isSelected && formSelections.adActionButtons.length >= maxButtons;
                                const meta = buttonMetaMap[type] || {
                                  title: type.toUpperCase().replace("_", " "),
                                  subtitle: "Custom interactive action",
                                  icon: <Zap size={18} />,
                                  color: "var(--primary)",
                                  bg: "rgba(234, 179, 8, 0.14)",
                                  previewLabel: type,
                                  inputType: "text",
                                  placeholder: "",
                                };

                                const isEmail = type === "email";
                                const value = type !== "read_more" ? formSelections.actionDetails[type as keyof typeof formSelections.actionDetails] || "" : "";
                                const isEmailInvalid = isEmail && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

                                const toggleButton = () => {
                                  if (isLimitReached) return;
                                  setFormSelections((prev) => {
                                    const updated = [...prev.adActionButtons];
                                    if (!isSelected && updated.length < maxButtons) {
                                      updated.push(type as any);
                                    } else if (isSelected) {
                                      const idx = updated.indexOf(type as any);
                                      if (idx !== -1) updated.splice(idx, 1);
                                    }
                                    return {
                                      ...prev,
                                      adActionButtons: updated,
                                    };
                                  });
                                };

                                return (
                                  <div
                                    key={type}
                                    className={`${styles.actionCard} ${isSelected ? styles.actionCardActive : ""} ${
                                      isLimitReached ? styles.actionCardDisabled : ""
                                    }`}
                                  >
                                    <div className={styles.actionCardHeader} onClick={toggleButton}>
                                      <div
                                        className={styles.actionIconWrapper}
                                        style={{ backgroundColor: meta.bg, color: meta.color }}
                                      >
                                        {meta.icon}
                                      </div>

                                      <div className={styles.actionTextCol}>
                                        <div className={styles.actionCardTitle}>
                                          <span>{meta.title}</span>
                                        </div>
                                        <span className={styles.actionCardSubtitle}>{meta.subtitle}</span>
                                      </div>

                                      <div
                                        className={`${styles.actionToggleSwitch} ${
                                          isSelected ? styles.actionToggleSwitchActive : ""
                                        }`}
                                      >
                                        <motion.span
                                          layout
                                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                          className={styles.actionToggleThumb}
                                          style={{
                                            marginLeft: isSelected ? "auto" : "0",
                                          }}
                                        />
                                      </div>
                                    </div>

                                    {isSelected && type !== "read_more" && (
                                      <div className={styles.actionConfigDrawer}>
                                        <div className={styles.actionInputContainer}>
                                          <span className={styles.actionInputLeadingIcon} style={{ color: meta.color }}>
                                            {meta.icon}
                                          </span>
                                          <input
                                            type={isEmail ? "email" : meta.inputType}
                                            placeholder={meta.placeholder}
                                            value={value}
                                            onChange={(e) =>
                                              setFormSelections((prev) => ({
                                                ...prev,
                                                actionDetails: {
                                                  ...prev.actionDetails,
                                                  [type]: e.target.value,
                                                },
                                              }))
                                            }
                                            className={`${styles.inputBox} ${styles.actionInputStyled} ${
                                              isEmailInvalid ? styles.inputError : ""
                                            }`}
                                          />
                                        </div>

                                        <div className={styles.actionPreviewChip}>
                                          <span>Feed Button Preview:</span>
                                          <span
                                            className={styles.actionPreviewButton}
                                            style={{ backgroundColor: meta.color, color: "#fff" }}
                                          >
                                            {meta.icon}
                                            <span>{meta.previewLabel}</span>
                                          </span>
                                        </div>

                                        {isEmailInvalid && (
                                          <p className={styles.error}>Please enter a valid email address.</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </>
          )}

          {/* Step 4: Summary */}
          {step === 4 && (
              <div className={styles.summaryContainer}>
                <div className={styles.summaryHeader}>
                  <h2 className={styles.summaryTitle}>Campaign summary</h2>
                  <p className={styles.summarySubtitle}>
                    Review your campaign configuration, targeting choices, and cost estimate before proceeding to the ad preview.
                  </p>
                </div>
                
                <div className={styles.summaryGrid}>
                  {/* Left Column: Configuration details */}
                  <div className={styles.summarySection}>
                    <h3 className={styles.sectionTitle}>Targeting details</h3>
                    <div className={styles.detailsList}>
                      <div className={styles.detailsRow}>
                        <span className={styles.detailsKey}>Audience type</span>
                        <span className={styles.detailsVal}>
                          Custom targeted audience
                        </span>
                      </div>
                      
                      {formSelections.gender && (
                        <div className={styles.detailsRow}>
                          <span className={styles.detailsKey}>Gender</span>
                          <span className={styles.detailsVal}>
                            {formSelections.gender.charAt(0).toUpperCase() + formSelections.gender.slice(1)}
                          </span>
                        </div>
                      )}
                      {formSelections.ageRange && (
                        <div className={styles.detailsRow}>
                          <span className={styles.detailsKey}>Age range</span>
                          <span className={styles.detailsVal}>
                            {formSelections.ageRange[0]} – {formSelections.ageRange[1]} years
                          </span>
                        </div>
                      )}
                      {(formSelections.country || formSelections.state || formSelections.province) && (
                        <div className={styles.detailsRow}>
                          <span className={styles.detailsKey}>Target location</span>
                          <span className={styles.detailsVal}>
                            {[formSelections.province, formSelections.state, formSelections.country]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        </div>
                      )}
                      {formSelections.industry.length > 0 && (
                        <div className={styles.detailsRow}>
                          <span className={styles.detailsKey}>Industries</span>
                          <span className={styles.detailsVal}>{formSelections.industry.join(", ")}</span>
                        </div>
                      )}
                      {formSelections.interest.length > 0 && (
                        <div className={styles.detailsRow}>
                          <span className={styles.detailsKey}>Interests</span>
                          <span className={styles.detailsVal}>{formSelections.interest.join(", ")}</span>
                        </div>
                      )}
                      {formSelections.behavior.length > 0 && (
                        <div className={styles.detailsRow}>
                          <span className={styles.detailsKey}>Behaviors</span>
                          <span className={styles.detailsVal}>{formSelections.behavior.join(", ")}</span>
                        </div>
                      )}
                      {formSelections.lifestyle.length > 0 && (
                        <div className={styles.detailsRow}>
                          <span className={styles.detailsKey}>Lifestyles</span>
                          <span className={styles.detailsVal}>{formSelections.lifestyle.join(", ")}</span>
                        </div>
                      )}
                      {formSelections.personality.length > 0 && (
                        <div className={styles.detailsRow}>
                          <span className={styles.detailsKey}>Personality traits</span>
                          <span className={styles.detailsVal}>{formSelections.personality.join(", ")}</span>
                        </div>
                      )}
                    </div>
                    
                    <h3 className={`${styles.sectionTitle} ${styles.sectionTitleMt}`}>Delivery controls</h3>
                    <div className={styles.detailsList}>
                      <div className={styles.detailsRow}>
                        <span className={styles.detailsKey}>Campaign duration</span>
                        <span className={styles.detailsVal}>
                          {formSelections.campaignDays} day{formSelections.campaignDays > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className={styles.detailsRow}>
                        <span className={styles.detailsKey}>Frequency cap</span>
                        <span className={styles.detailsVal}>
                          {formSelections.userFrequencyCap} view{formSelections.userFrequencyCap > 1 ? "s" : ""} per user
                        </span>
                      </div>
                      <div className={styles.detailsRow}>
                        <span className={styles.detailsKey}>Daily attention cap</span>
                        <span className={styles.detailsVal}>
                          ~{Math.ceil(
                            (formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0
                              ? formSelections.impressions + userProfile.mutual_count
                              : formSelections.impressions) / formSelections.campaignDays
                          ).toLocaleString()} attentions/day
                        </span>
                      </div>
                    </div>

                    {adType === "product_sales" ? (
                      <>
                        <h3 className={`${styles.sectionTitle} ${styles.sectionTitleMt}`}>Product details</h3>
                        <div className={styles.detailsList}>
                          <div className={styles.detailsRow}>
                            <span className={styles.detailsKey}>Product name</span>
                            <span className={styles.detailsVal}>{formSelections.productName}</span>
                          </div>
                          <div className={styles.detailsRow}>
                            <span className={styles.detailsKey}>Product price</span>
                            <span className={styles.detailsVal}>{formatCurrency(formSelections.productPrice)}</span>
                          </div>
                          {formSelections.productCtaLink && (
                            <div className={styles.detailsRow}>
                              <span className={styles.detailsKey}>CTA action</span>
                              <span className={styles.detailsVal}>
                                {formSelections.productCtaType} · <span className={styles.ctaLinkMuted}>{formSelections.productCtaLink}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      formSelections.productCtaLink && (
                        <>
                          <h3 className={`${styles.sectionTitle} ${styles.sectionTitleMt}`}>Action &amp; Feedback CTA</h3>
                          <div className={styles.detailsList}>
                            <div className={styles.detailsRow}>
                              <span className={styles.detailsKey}>CTA button</span>
                              <span className={styles.detailsVal}>{formSelections.productCtaType || "Comment"}</span>
                            </div>
                            <div className={styles.detailsRow}>
                              <span className={styles.detailsKey}>Target link</span>
                              <span className={styles.detailsVal}>
                                <span className={styles.ctaLinkMuted}>{formSelections.productCtaLink}</span>
                              </span>
                            </div>
                          </div>
                        </>
                      )
                    )}
                  </div>
                  
                  {/* Right Column: Pricing breakdown (Stripe Invoice/Receipt Card) */}
                  <div className={styles.costCard}>
                    <h3 className={styles.costCardTitle}>Pricing details</h3>
                    
                    <div className={styles.costRows}>
                      <div className={styles.costRow}>
                        <span className={styles.costKey}>Paid attention</span>
                        <span className={styles.costVal}>
                          {formSelections.impressions.toLocaleString()} views
                        </span>
                      </div>
                      
                      {formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0 && (
                        <div className={`${styles.costRow} ${styles.costRowGreen}`}>
                          <span className={`${styles.costKey} ${styles.costKeyGreen}`}>Free mutual attention</span>
                          <span className={styles.costVal}>
                            +{userProfile.mutual_count.toLocaleString()} views
                          </span>
                        </div>
                      )}
                      
                      <div className={styles.divider}></div>
                      
                      <div className={styles.costRow}>
                        <span className={styles.costKey}>Total target views</span>
                        <span className={`${styles.costVal} ${styles.costValBold}`}>
                          {((formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0)
                            ? formSelections.impressions + userProfile.mutual_count
                            : formSelections.impressions).toLocaleString()} views
                        </span>
                      </div>
                      
                      <div className={styles.costRow}>
                        <span className={styles.costKey}>Cost per attention</span>
                        <span className={styles.costVal}>{formatCurrency(calculateTotalCostPerImpression())}</span>
                      </div>
                    </div>
                    
                    <div className={styles.totalSection}>
                      <span className={styles.totalLabel}>Total cost</span>
                      <span className={styles.totalAmount}>
                        {formatCurrency(calculateTotalCost())}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Attention Economy Bidding Market Ticker */}
                <AttentionMarketTicker
                  selectedCategory={adType}
                  isBiddingEnabled={isBiddingEnabled}
                  onToggleBidding={setIsBiddingEnabled}
                  bidPrice={bidPrice}
                  onBidPriceChange={setBidPrice}
                  impressions={formSelections.impressions}
                />
              </div>
            )}
            {/* Step 5: Launch */}
            {step === 5 && (
              <>
                <h2 className={styles.centeredHeading}>Preview Your Ad</h2>

                <AdPreviewCard
                  mediaFiles={formSelections.adMediaFiles}
                  mediaType={formSelections.adMediaType}
                  existingMedia={formSelections.existingMedia}
                  adContent={formSelections.adContent}
                  actionButtons={formSelections.adActionButtons}
                  actionDetails={formSelections.actionDetails}
                  displayMutualButton={formSelections.displayMutualButton}
                  adType={adType}
                  productName={formSelections.productName}
                  productPrice={formSelections.productPrice}
                  productCtaType={formSelections.productCtaType}
                  productCtaLink={formSelections.productCtaLink}
                />

                {isAdmin ? (
                  <div className={styles.adminFreeBanner}>
                    <p className={styles.adminFreeHeading}>
                      <Crown size={18} color="var(--primary)" /> Admin Privilege: 100% Free Campaign Publishing (₦0.00 Total)
                    </p>
                    <p className={styles.adminFreeSubtext}>
                      No payment gateway or wallet balance deduction required.
                    </p>
                  </div>
                ) : (
                  <div className={styles.paymentSection}>
                    <div className={styles.paymentTitle}>Payment Method</div>
                    <div className={styles.paymentOptions}>
                      <div
                        className={`${styles.paymentOptionCard} ${paymentMethod === "card" ? styles.paymentOptionCardActive : ""}`}
                        onClick={() => setPaymentMethod("card")}
                      >
                        <div className={styles.paymentOptionName}>Card / Bank</div>
                        <div className={styles.paymentOptionSub}>Debit Card, USSD, Bank Transfer</div>
                      </div>
                      <div
                        className={`${styles.paymentOptionCard} ${paymentMethod === "wallet" ? styles.paymentOptionCardActive : ""}`}
                        onClick={() => setPaymentMethod("wallet")}
                      >
                        <div className={styles.paymentOptionName}>Wallet Balance</div>
                        <div className={styles.paymentOptionSub}>Available: {formatCurrency(userProfile?.balance ?? 0)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Content Disclosure Toggle */}
                <div className={styles.aiDisclosureBox}>
                  <div className={styles.aiDisclosureTextContainer}>
                    <span className={styles.aiDisclosureTitle}>
                      AI-generated content
                    </span>
                    <span className={styles.aiDisclosureDesc}>
                      Turn this on if your ad contains media or text generated or altered using AI tools.
                    </span>
                  </div>
                  <label className={styles.aiSwitch}>
                    <input
                      type="checkbox"
                      checked={isAiContent}
                      onChange={(e) => setIsAiContent(e.target.checked)}
                      className={styles.aiSwitchInput}
                    />
                    <span className={`${styles.aiSwitchSlider} ${isAiContent ? styles.aiSwitchSliderActive : ""}`}>
                      <span className={`${styles.aiSwitchThumb} ${isAiContent ? styles.aiSwitchThumbActive : ""}`} />
                    </span>
                  </label>
                </div>

                <div className={styles.termsPolicyBox}>
                  <input
                    type="checkbox"
                    id="adTermsPolicyCheckbox"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                    className={styles.termsCheckbox}
                  />
                  <label htmlFor="adTermsPolicyCheckbox" className={styles.termsLabel}>
                    I have reviewed my ad details and agree to Paayh&apos;s{" "}
                    <Link href="/terms" target="_blank" className={styles.termsLink}>
                      Terms of Service
                    </Link>,{" "}
                    <Link href="/advertiser-guidelines" target="_blank" className={styles.termsLink}>
                      Advertising Guidelines
                    </Link>, and{" "}
                    <Link href="/privacy" target="_blank" className={styles.termsLink}>
                      Privacy Policy
                    </Link>.
                  </label>
                </div>

                <button
                  className={`${styles.submitButton} ${styles.submitButtonContent}`}
                  onClick={submitAd}
                  disabled={isSubmitting || !agreedToPolicy}
                >
                  {isSubmitting ? (
                    "Publishing Free Ad..."
                  ) : isAdmin ? (
                    <>
                      <Rocket size={16} /> Publish (Admin)
                    </>
                  ) : (
                    "Submit"
                  )}
                </button>
              </>
            )}

            <div className={styles.buttonGroup}>
              {step > 0 && (
                <button onClick={() => { setStepError(""); setStep(step - 1); }}>Back</button>
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
    </>
  );
}
