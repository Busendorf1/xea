
"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Edit3, Rocket, ShieldAlert, Sparkles, Crown, AlertCircle } from "lucide-react";
import styles from "../Ad/page.module.css";
import HeaderJoin from "../HeaderJoin/page";
import LocationSelector from "../LocationSelector";
import { v4 as uuidv4 } from "uuid";
import supabase from "@/lib/utils/db";
import dynamic from "next/dynamic";
const AdPreviewCard = dynamic(() => import("../Adreview/page"));
const AttentionMarketTicker = dynamic(() => import("./AttentionMarketTicker"), { ssr: false });
import { categoryTargetingMap, TARGETING_DIMENSIONS, type AdCategory } from "@/lib/categoryTargetingMap";
import { adAudienceSchema, adCreativeSchema, adCreativeProductSchema } from "@/lib/validationSchemas";
import { isAdminEmail } from "@/lib/authHelper";

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
const steps = ["Ad", "Targeting", "Location", "Creative", "Summary"];

import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

type Category =
  | "industry"
  | "interest"
  | "lifestyle"
  | "behavior"
  | "personality";
type AdMediaType = "text" | "image" | "video" | "mixed";

export default function MultiStepAdForm({ session }: MultiStepAdFormProps) {
  const isAdmin = useMemo(() => isAdminEmail(session?.user?.email), [session?.user?.email]);
  const searchParams = useSearchParams();
  const editAdId = searchParams ? searchParams.get("id") : null;
  const [editingId, setEditingId] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
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

  useEffect(() => {
    if (editAdId) {
      setEditingId(editAdId);
      fetch(`/api/campaigns/details?id=${editAdId}`)
        .then((res) => res.json())
        .then((data) => {
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
            }));
          }
        })
        .catch((err) => console.error("Error fetching ad details for edit:", err));
    }
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

  // Clear targeting selections whenever the ad type changes
  useEffect(() => {
    setFormSelections((prev) => ({
      ...prev,
      industry: [],
      interest: [],
      lifestyle: [],
      behavior: [],
      personality: [],
    }));
  }, [adType]);

  const toggleSelection = (type: Category, value: string) => {
    setFormSelections((prev) => {
      const list = prev[type];
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

  const handleTargetAll = (cat: Category) => {
    setFormSelections((prev) => ({
      ...prev,
      [cat]: optionsMap[cat] ?? [],
    }));
  };

  const isSubsidizedLink = (link?: string) => {
    if (!link) return false;
    const cleaned = link.toLowerCase().trim();
    return cleaned.includes("baggyt.com");
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

  /** Step 3 — ad creative validation */
  const validateStep3 = (): boolean => {
    setStepError("");
    if (!formSelections.adMediaType) {
      setStepError("Please select an ad media type.");
      return false;
    }
    if (formSelections.adMediaType !== "text" && formSelections.adMediaFiles.length === 0) {
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
    if (!session || !session.user?.email) {
      alert("❌ User not authenticated. Please log in.");
      return;
    }

    const adId = editingId || uuidv4();
    const costPerImpression = calculateTotalCostPerImpression();
    const totalCost = calculateTotalCost();

    if (!isAdmin && paymentMethod === "wallet" && userProfile && userProfile.balance < totalCost) {
      alert(`❌ Insufficient wallet balance. Your balance is ${formatCurrency(userProfile.balance)} but this campaign costs ${formatCurrency(totalCost)}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      let mediaUrlString: string | null = null;

      if (formSelections.adMediaFiles && formSelections.adMediaFiles.length > 0) {
        const mediaUrls: string[] = [];
        for (let i = 0; i < formSelections.adMediaFiles.length; i++) {
          const file = formSelections.adMediaFiles[i];
          const sanitizedFileName = file.name.replace(/[^\w.-]/g, "_");
          const uniqueFileName = `${adId}_${i}_${sanitizedFileName}`;
          const isVid = file.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(file.name);

          // Force WebKit / iOS to resolve full iCloud asset download into memory buffer
          let fileData: Blob | File = file;
          try {
            const buffer = await file.arrayBuffer();
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

          if (publicUrlData?.publicUrl) {
            mediaUrls.push(publicUrlData.publicUrl);
          }
        }
        mediaUrlString = mediaUrls.join(",");
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
              adContent: formSelections.adContent,
              adActionButtons: formSelections.adActionButtons,
              actionPhone: formSelections.actionDetails.phone || null,
              actionWhatsapp: formSelections.actionDetails.whatsapp || null,
              actionWebsite: formSelections.actionDetails.website || null,
              actionEmail: formSelections.actionDetails.email || null,
              actionIos: formSelections.actionDetails.ios || null,
              actionAndroid: formSelections.actionDetails.android || null,
              actionWatchNow: formSelections.actionDetails.watch_now || null,
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
            }
          },
          callbackUrl: `${window.location.origin}/user/statement`
        })
      });

      const paymentData = await paymentResponse.json();
      if (!paymentResponse.ok || !paymentData.success) {
        throw new Error(paymentData.error || "Failed to process payment");
      }

      if (paymentMethod === "wallet") {
        alert("Success! Your Ad Campaign has been paid using your wallet balance and submitted for review.");
        window.location.href = "/user/statement";
      } else {
        alert("Redirecting to Paystack to complete payment for your Ad Campaign...");
        window.location.href = paymentData.authorization_url;
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
      alert(`An unexpected error occurred during submission: ${err?.message || JSON.stringify(err)}`);
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
            Advertising & Highlight Account Disabled
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
            {/* Sleek Multi-Step Wizard Progress Header */}
            <div className={styles.stepperContainer}>
              {steps.map((label, idx) => (
                <div key={label} className={styles.stepItemWrapper}>
                  <div
                    className={`${styles.stepItem} ${
                      idx === step
                        ? styles.stepItemActive
                        : idx < step
                        ? styles.stepItemCompleted
                        : ""
                    }`}
                  >
                    <span className={styles.stepBadge}>
                      {idx < step ? "✓" : idx + 1}
                    </span>
                    <span className="hidden md:inline">{label}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`${styles.stepLine} ${
                        idx < step ? styles.stepLineActive : ""
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            <h1 className={`${styles.summaryTitle} ${styles.pageHeading}`}>
              {editingId ? <><Edit3 size={20} color="#818cf8" /> Edit Campaign</> : <><Rocket size={20} color="#1d9bf0" /> Create New Ad Campaign</>}
            </h1>
            <p className={styles.pageSubtitle}>
              {editingId ? "Update your target audience, locations, and creative. Edits will be submitted for verification." : "Reach active audiences with hyper-targeted ad delivery."}
            </p>
            <h2 className={`${styles.summaryTitle} ${styles.stepTitle}`}>{steps[step]}</h2>

            {/* Step 0 */}
            {step === 0 && (
              <>
                <label>Select Campaign Ad Category:</label>
                <div className={styles.adTypeGrid}>
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
              </>
            )}

            {/* Step 1 — targeting options scoped to the chosen ad category */}
            {step === 1 && (
              <>
                <p className={styles.targetingNote}>
                  Showing targeting options for{" "}
                  <strong>{adType === "product_sales" ? "Product Sales" : adType.charAt(0).toUpperCase() + adType.slice(1)}</strong>{" "}
                  ads. Switch category in Step 1 to see different options.
                </p>
                {activeCategories.map((cat) => (
                  <div key={cat} className={styles.dropdownContainer}>
                    <details>
                      <summary>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        <button
                          type="button"
                          onClick={() => handleTargetAll(cat)}
                        >
                          Target All
                        </button>
                      </summary>
                      {optionsMap[cat]?.map((item, i) => (
                        <label key={i}>
                          <input
                            type="checkbox"
                            checked={formSelections[cat]?.includes(item)}
                            onChange={() => toggleSelection(cat, item)}
                          />
                          {item}
                        </label>
                      ))}
                    </details>
                  </div>
                ))}
                {activeCategories.length === 0 && (
                  <p className={styles.targetingNote}>
                    No granular targeting available for Individual ads — your ad will reach a broad general audience.
                  </p>
                )}
              </>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <>
                <LocationSelector
                  country={formSelections.country}
                  state={formSelections.state}
                  location={formSelections.province}
                  multiLocation={true}
                  multiLocations={formSelections.targetLocations || []}
                  onChange={({ country, state, location, multiLocations }) =>
                    setFormSelections((prev) => ({
                      ...prev,
                      country,
                      state,
                      province: location,
                      ...(multiLocations ? { targetLocations: multiLocations } : {})
                    }))
                  }
                  cityLabel="Province"
                />
                <label>Gender:</label>
                <select
                  value={formSelections.gender}
                  onChange={(e) =>
                    setFormSelections({
                      ...formSelections,
                      gender: e.target.value,
                    })
                  }
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="both">Both</option>
                </select>
                
                <div className={styles.ageRangeRow}>
                  <div className={styles.ageRangeField}>
                    <label className={styles.ageRangeLabel}>Target Min Age</label>
                    <select
                      value={formSelections.ageRange[0]}
                      onChange={(e) => {
                        const min = parseInt(e.target.value);
                        const max = Math.max(min, formSelections.ageRange[1]);
                        setFormSelections({
                          ...formSelections,
                          ageRange: [min, max],
                        });
                      }}
                    >
                      {Array.from({ length: 83 }, (_, i) => i + 18).map((age) => (
                        <option key={age} value={age}>
                          {age} years
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.ageRangeField}>
                    <label className={styles.ageRangeLabel}>Target Max Age</label>
                    <select
                      value={formSelections.ageRange[1]}
                      onChange={(e) => {
                        const max = parseInt(e.target.value);
                        const min = Math.min(max, formSelections.ageRange[0]);
                        setFormSelections({
                          ...formSelections,
                          ageRange: [min, max],
                        });
                      }}
                    >
                      {Array.from({ length: 83 }, (_, i) => i + 18).map((age) => (
                        <option key={age} value={age}>
                          {age} years
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label>Employment Status (Select up to 4):</label>
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
                        {option.label}
                      </label>
                    );
                  })}
                </div>
                <label htmlFor="impression-input" className={styles.labelBlock}>
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
                      setFormSelections({
                        ...formSelections,
                        impressions: parseInt(e.target.value) || 1,
                      })
                    }
                    className={styles.impressionSliderFull}
                  />
                  <div className={styles.impressionInputRow}>
                    {/* <span className={styles.impressionInputLabel}>Exact count:</span> */}
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
                        setFormSelections({
                          ...formSelections,
                          impressions: val,
                        });
                      }}
                      className={styles.impressionInput}
                    />
                  </div>
                </div>
                <label className={styles.labelBlock}>
                  Campaign Duration: {formSelections.campaignDays} day{formSelections.campaignDays > 1 ? "s" : ""}
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={formSelections.campaignDays}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setFormSelections({
                      ...formSelections,
                      campaignDays: isNaN(val) || val < 1 ? 1 : val,
                    });
                  }}
                  className={styles.inputBox}
                  placeholder="e.g. 5"
                />
                <p className={styles.hintText}>
                  Daily Attention Cap: ~{Math.ceil(formSelections.impressions / formSelections.campaignDays).toLocaleString()} attentions/day
                </p>
                <label className={styles.labelBlock}>
                  Target Views Per User: {formSelections.userFrequencyCap} view{formSelections.userFrequencyCap > 1 ? "s" : ""}
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={formSelections.userFrequencyCap}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setFormSelections({
                      ...formSelections,
                      userFrequencyCap: isNaN(val) || val < 1 ? 1 : val,
                    });
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

                {/* Mutual Features */}
                <div className={styles.mutualSection}>
                  <label className={`${styles.checkboxLabel} ${styles.mutualLabel}`}>
                    <input
                      type="checkbox"
                      checked={formSelections.displayMutualButton}
                      onChange={(e) =>
                        setFormSelections({
                          ...formSelections,
                          displayMutualButton: e.target.checked,
                        })
                      }
                    />
                    Display "Mutual+" button on this ad (allow viewers to add you as a mutual)
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
              </>
            )}

            {step === 3 && (
              <div className={styles.adCreativeSection}>
                {isAdmin && (
                  <div style={{ background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", padding: "16px", borderRadius: "12px", marginBottom: "20px" }}>
                    <h4 style={{ color: "var(--primary)", fontSize: "0.92rem", fontWeight: 700, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Crown size={16} color="var(--primary)" /> Admin Privilege: Custom Branding & Free Campaign Publishing
                    </h4>
                    <div className={styles.formGroup} style={{ marginBottom: "12px" }}>
                      <label>Custom Sponsor Name (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Acme Corporation (defaults to Sponsored)"
                        value={formSelections.customSponsorName}
                        onChange={(e) => setFormSelections({ ...formSelections, customSponsorName: e.target.value })}
                        className={styles.inputBox}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Custom Handle (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. @acme_official (defaults to @Sponsored)"
                        value={formSelections.customSponsorHandle}
                        onChange={(e) => setFormSelections({ ...formSelections, customSponsorHandle: e.target.value })}
                        className={styles.inputBox}
                      />
                    </div>
                  </div>
                )}
                {adType === "product_sales" && (
                  <>
                    <div className={styles.formGroup}>
                      <label>
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
                          setFormSelections({
                            ...formSelections,
                            productName: e.target.value,
                          })
                        }
                        className={styles.inputBox}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Product Price (₦)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formSelections.productPrice}
                        placeholder="Enter product price in Naira"
                        onChange={(e) =>
                          setFormSelections({
                            ...formSelections,
                            productPrice: e.target.value,
                          })
                        }
                        className={styles.inputBox}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Primary CTA Button Text (Select 1 CTA)</label>
                      <select
                        value={formSelections.productCtaType}
                        onChange={(e) =>
                          setFormSelections({
                            ...formSelections,
                            productCtaType: e.target.value,
                          })
                        }
                        className={styles.inputBox}
                      >
                        <option value="Buy">Buy</option>
                        <option value="Shop">Shop</option>
                        <option value="Order">Order</option>
                        <option value="Book">Book</option>
                        <option value="Reserve">Reserve</option>
                        <option value="Apply">Apply</option>
                        <option value="Comment">Comment</option>
                        <option value="Join">Join</option>
                        <option value="Learn More">Learn More</option>
                        <option value="Visit Website">Visit Website</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <div className={styles.ctaLabelRow}>
                        <label>Primary CTA Link (Secure HTTPS)</label>
                        <Link href="/business/subscribe" className={styles.premiumLink}>
                          E-commerce platform? Become a Premium Subscriber →
                        </Link>
                      </div>
                      <input
                        type="text"
                        value={formSelections.productCtaLink}
                        placeholder="https://yourwebsite.com/product-page"
                        onChange={(e) =>
                          setFormSelections({
                            ...formSelections,
                            productCtaLink: e.target.value,
                          })
                        }
                        className={`${styles.inputBox} ${
                          formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://")
                            ? styles.inputError
                            : ""
                        }`}
                      />
                      {formSelections.productCtaLink && isSubsidizedLink(formSelections.productCtaLink) && (
                        <div className={styles.subsidyBanner}>
                          {/* <Sparkles size={16} color="#34d399" /> */}
                          <span>Baggyt is a premium subscriber, 30% Off your ad cost applies.</span>
                        </div>
                      )}
                      {formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://") && (
                        <p className={styles.error}>
                          The link must be a secure link starting with https://
                        </p>
                      )}
                    </div>
                  </>
                )}

                {adType !== "product_sales" && (
                  <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", padding: "16px", borderRadius: "12px", marginBottom: "18px" }}>
                    <div className={styles.formGroup} style={{ marginBottom: "12px" }}>
                      <label>Action &amp; Engagement CTA (Select 1 CTA)</label>
                      <select
                        value={formSelections.productCtaType}
                        onChange={(e) =>
                          setFormSelections({
                            ...formSelections,
                            productCtaType: e.target.value,
                          })
                        }
                        className={styles.inputBox}
                      >
                        <option value="Comment">Comment</option>
                        <option value="Vote">Vote</option>
                        <option value="Donate">Donate</option>
                        <option value="Volunteer">Volunteer</option>
                        <option value="Book">Book</option>
                        <option value="Reserve">Reserve</option>
                        <option value="Apply">Apply</option>
                        <option value="Order">Order</option>
                        <option value="Buy">Buy</option>
                        <option value="Shop">Shop</option>
                        <option value="Join">Join</option>
                        <option value="Learn More">Learn More</option>
                        <option value="Visit Website">Visit Website</option>
                      </select>
                    </div>

                    <div className={styles.formGroup} style={{ marginBottom: "0" }}>
                      <label>CTA Target Link (WhatsApp, Chat App, Email or Website)</label>
                      <input
                        type="text"
                        value={formSelections.productCtaLink}
                        placeholder="e.g. https://wa.me/234... or https://chat.whatsapp.com/... or https://yourlink.com"
                        onChange={(e) =>
                          setFormSelections({
                            ...formSelections,
                            productCtaLink: e.target.value,
                          })
                        }
                        className={`${styles.inputBox} ${
                          formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://") && !formSelections.productCtaLink.startsWith("http://") && !formSelections.productCtaLink.startsWith("mailto:")
                            ? styles.inputError
                            : ""
                        }`}
                      />
                      <span style={{ fontSize: "0.76rem", opacity: 0.75, marginTop: "6px", display: "block" }}>
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
                )}

                <div className={styles.formGroup}>
                  <label>Ad Content Type</label>
                  <select
                    value={formSelections.adMediaType}
                    onChange={(e) =>
                      setFormSelections({
                        ...formSelections,
                        adMediaType: e.target.value as AdMediaType,
                        adMediaFiles: [],
                      })
                    }
                    className={styles.inputBox}
                  >
                    <option value="">-- Select media type --</option>
                    <option value="text">Text Only</option>
                    <option value="image">Image(s) (Up to 4)</option>
                    <option value="video">Video Only (Max 1)</option>
                    <option value="mixed">Mixed (Up to 3 Images + 1 Video)</option>
                  </select>
                  {formSelections.adMediaType === "image" && (
                    <small className={styles.info}>
                      Max size: 5MB per image (JPG, PNG, etc). You can select up to 4 images.
                    </small>
                  )}
                  {formSelections.adMediaType === "video" && (
                    <small className={styles.info}>
                      Max size: 60MB • Max duration: 5mins • Format: Video formats. Select exactly 1 video.
                    </small>
                  )}
                  {formSelections.adMediaType === "mixed" && (
                    <small className={styles.info}>
                      Up to 3 images (max 5MB each) and exactly 1 video (max 60MB, 5mins).
                    </small>
                  )}
                </div>

                {formSelections.adMediaType && formSelections.adMediaType !== "text" && (
                  <div className={styles.formGroup}>
                    <label>Upload Files</label>
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
                  </div>
                )}

                 <div className={styles.formGroup}>
                   <label>
                     {adType === "product_sales" ? "Product Description" : "Ad Message"}{" "}
                     <span className={styles.charCount}>
                       {formSelections.adContent.length}/{adType === "product_sales" ? 200 : (formSelections.adActionButtons.includes("read_more") ? 500 : 220)}
                     </span>
                   </label>
                   <textarea
                     maxLength={adType === "product_sales" ? 200 : (formSelections.adActionButtons.includes("read_more") ? 500 : 220)}
                     value={formSelections.adContent}
                     placeholder={adType === "product_sales" ? "Write product description here (no links allowed)" : "Write your ad message here (no links allowed)"}
                     onChange={(e) => {
                       e.target.style.height = "auto";
                       e.target.style.height = `${e.target.scrollHeight}px`;
                       setFormSelections({
                         ...formSelections,
                         adContent: e.target.value,
                       });
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

                <div className={styles.formGroup}>
                  {(() => {
                    const hasPrimaryCta = Boolean(formSelections.productCtaLink?.trim()) || adType === "product_sales";
                    const maxButtons = hasPrimaryCta ? 2 : 3;

                    return (
                      <>
                        <label>
                          Action Buttons (Max {maxButtons})
                          {hasPrimaryCta && (
                            <span style={{ fontSize: "0.76rem", color: "var(--primary, #eab308)", marginLeft: "8px", fontWeight: "normal" }}>
                              (Reduced to {maxButtons} to ensure clean mobile card spacing alongside &quot;{formSelections.productCtaType || "Comment"}&quot;)
                            </span>
                          )}
                        </label>
                        {(() => {
                          const baseButtons: string[] = ["phone", "whatsapp", "website", "email"];
                          if (adType === "business" || adType === "government") {
                            baseButtons.push("ios", "android");
                          }
                          if (adType === "business" || adType === "government" || formSelections.adMediaType === "video") {
                            baseButtons.push("watch_now");
                          }
                          if (formSelections.adMediaType === "text") {
                            baseButtons.push("read_more");
                          }
                          return baseButtons.map((type) => {
                            const isSelected = formSelections.adActionButtons.includes(type as any);
                            const placeholderMap: Record<string, string> = {
                              phone: "e.g. 234904567890",
                              whatsapp: "e.g. 234904567890",
                              email: "e.g. someone@example.com",
                              website: "e.g. https://yourwebsite.com",
                              ios: "e.g. https://apps.apple.com/us/app/your-app",
                              android: "e.g. https://play.google.com/store/apps/details?id=your.app",
                              watch_now: "e.g. https://youtube.com/watch?v=...",
                              read_more: "",
                            };

                            const isEmail = type === "email";
                            const value = type !== "read_more" ? formSelections.actionDetails[type as keyof typeof formSelections.actionDetails] || "" : "";
                            const isEmailInvalid = isEmail && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

                            return (
                              <div key={type}>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const updated = [...formSelections.adActionButtons];
                                      if (e.target.checked && updated.length < maxButtons) {
                                        updated.push(type as any);
                                      } else if (!e.target.checked) {
                                        updated.splice(updated.indexOf(type as any), 1);
                                      }
                                      setFormSelections({
                                        ...formSelections,
                                        adActionButtons: updated,
                                      });
                                    }}
                                  />
                                  {type === "ios" ? "INSTALL NOW (iOS)" : type === "android" ? "INSTALL NOW (ANDROID)" : type === "watch_now" ? "WATCH NOW" : type.toUpperCase().replace("_", " ")}
                                </label>
                                {isSelected && type !== "read_more" && (
                                  <input
                                    type={isEmail ? "email" : "text"}
                                    placeholder={placeholderMap[type]}
                                    value={value}
                                    onChange={(e) =>
                                      setFormSelections({
                                        ...formSelections,
                                        actionDetails: {
                                          ...formSelections.actionDetails,
                                          [type]: e.target.value,
                                        },
                                      })
                                    }
                                    className={`${styles.inputBox} ${isEmailInvalid ? styles.inputError : ""}`}
                                  />
                                )}
                                {isSelected && isEmailInvalid && (
                                  <p className={styles.error}>Please enter a valid email address.</p>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Step 4 */}
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
                                {formSelections.productCtaType} &rarr; <span className={styles.ctaLinkMuted}>{formSelections.productCtaLink}</span>
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
            {step === 5 && (
              <>
                <h2 className={styles.centeredHeading}>Preview Your Ad</h2>

                <AdPreviewCard
                  mediaFiles={formSelections.adMediaFiles}
                  mediaType={formSelections.adMediaType}
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
                  <div style={{ background: "rgba(234, 179, 8, 0.12)", border: "1px solid rgba(234, 179, 8, 0.35)", padding: "16px", borderRadius: "12px", margin: "20px 0", textAlign: "center" }}>
                    <p style={{ color: "var(--primary)", fontSize: "1rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <Crown size={18} color="var(--primary)" /> Admin Privilege: 100% Free Campaign Publishing (₦0.00 Total)
                    </p>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "4px" }}>
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

                <div style={{ marginTop: "20px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", backgroundColor: "var(--sidebar-bg)", borderRadius: "10px", border: "1px solid var(--card-border)" }}>
                  <input
                    type="checkbox"
                    id="adTermsPolicyCheckbox"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                    style={{ marginTop: "3px", width: "16px", height: "16px", cursor: "pointer", flexShrink: 0 }}
                  />
                  <label htmlFor="adTermsPolicyCheckbox" style={{ fontSize: "0.85rem", color: "var(--foreground)", cursor: "pointer", lineHeight: 1.4 }}>
                    I have reviewed my ad details and agree to Paayh&apos;s{" "}
                    <Link href="/about" target="_blank" style={{ color: "var(--primary)", textDecoration: "underline", fontWeight: 600 }}>
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/about" target="_blank" style={{ color: "var(--primary)", textDecoration: "underline", fontWeight: 600 }}>
                      Advertisement Policy
                    </Link>.
                  </label>
                </div>

                <button
                  className={styles.submitButton}
                  onClick={submitAd}
                  disabled={isSubmitting || !agreedToPolicy}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                >
                  {isSubmitting ? (
                    "Publishing Free Ad..."
                  ) : isAdmin ? (
                    <>
                      <Rocket size={16} /> Publish Campaign Free (Admin)
                    </>
                  ) : (
                    "Submit Ad For Review"
                  )}
                </button>
              </>
            )}

            <div className={styles.buttonGroup}>
              {step > 0 && (
                <button onClick={() => { setStepError(""); setStep(step - 1); }}>Back</button>
              )}
              {stepError && (
                <span className={styles.stepValidationError} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
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
