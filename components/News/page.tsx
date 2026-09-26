"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import supabase from "@/lib/utils/db";
import styles from "../News/page.module.css";
import LocationSelector from "../LocationSelector";
import { Zap, Calendar, ShieldAlert, Crown, Rocket, Sparkles, TrendingUp, Cpu, Landmark, Film, Trophy, Briefcase, GraduationCap, Activity, Atom, Globe, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import RollingCounter from "@/components/ui/RollingCounter";
import CustomSelect from "@/components/ui/CustomSelect";
import FormStepProgress from "@/components/ui/FormStepProgress";
import { ALL_INTERESTS as interests } from "@/lib/categoryTargetingMap";
import { newsSchema } from "@/lib/validationSchemas";
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

type NewsProps = {
  session: Session;
};

import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

const steps = ["Media", "Title", "Content", "Targeting", "Preview"];

const getCategoryIcon = (category: string) => {
  const lower = category.toLowerCase();
  if (lower.includes("tech") || lower.includes("crypto") || lower.includes("software") || lower.includes("ai")) return <Cpu size={15} />;
  if (lower.includes("politic") || lower.includes("gov") || lower.includes("law")) return <Landmark size={15} />;
  if (lower.includes("entertain") || lower.includes("music") || lower.includes("movie") || lower.includes("art")) return <Film size={15} />;
  if (lower.includes("sport") || lower.includes("fitness")) return <Trophy size={15} />;
  if (lower.includes("business") || lower.includes("finance") || lower.includes("invest") || lower.includes("real estate")) return <Briefcase size={15} />;
  if (lower.includes("edu") || lower.includes("career") || lower.includes("study")) return <GraduationCap size={15} />;
  if (lower.includes("life") || lower.includes("fashion") || lower.includes("beauty")) return <Sparkles size={15} />;
  if (lower.includes("health") || lower.includes("med") || lower.includes("wellness")) return <Activity size={15} />;
  if (lower.includes("science")) return <Atom size={15} />;
  if (lower.includes("food") || lower.includes("travel")) return <Globe size={15} />;
  return <Tag size={15} />;
};

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
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [isAiContent, setIsAiContent] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "wallet">("card");
  const [stepError, setStepError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

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
        if (parsed.mediaPreview) setMediaPreview(parsed.mediaPreview);
      }
    } catch {}
  }, []);

  // Autosave draft state on changes
  useEffect(() => {
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
        mediaPreview: mediaPreview && mediaPreview.startsWith("data:") ? mediaPreview : null,
      };
      localStorage.setItem("paayh_draft_news_v1", JSON.stringify(draft));
    } catch {}
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
        setMediaPreview(URL.createObjectURL(file));
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

    if (!mediaFile || !validationResult.success) {
      const errorMsg = !mediaFile
        ? "Please select a cover image for your highlight."
        : validationResult.error?.issues[0]?.message || "Please check your highlight form fields.";
      setStepError(errorMsg);
      return;
    }

    if (!isAdmin && paymentMethod === "wallet" && balance < totalCost) {
      setStepError(`Insufficient wallet balance. Your balance is ${formatCurrency(balance)} but this highlight costs ${formatCurrency(totalCost)}.`);
      return;
    }

    setIsSubmitting(true);
    let uploadedFilename: string | null = null;

    try {
      const filename = `${Date.now()}_${mediaFile!.name.replace(
        /[^\w.-]/g,
        "_"
      )}`;
      
      // 1080p Standard Dimension Cap: Scale down high-resolution images
      let optimizedFile: Blob | File = mediaFile!;
      if (mediaFile instanceof File) {
        try {
          optimizedFile = await resizeImageToMax1080p(mediaFile);
        } catch (optErr) {
          console.warn("Highlight cover 1080p optimization notice:", optErr);
        }
      }

      // Force WebKit / iOS to resolve full iCloud asset download into memory buffer
      let fileData: Blob | File = optimizedFile;
      try {
        const buffer = await optimizedFile.arrayBuffer();
        fileData = new Blob([buffer], { type: mediaFile!.type || "image/jpeg" });
      } catch (e) {
        console.warn("ArrayBuffer fallback for news image:", e);
      }

      const { error: uploadError } = await supabase.storage
        .from("news")
        .upload(filename, fileData, {
          cacheControl: "3600",
          upsert: false,
          contentType: mediaFile!.type || "image/jpeg",
        });

      if (uploadError) throw uploadError;
      uploadedFilename = filename;

      const { data: urlData } = supabase.storage
        .from("news")
        .getPublicUrl(filename);
        
      let paymentUrl = "/api/payments/initialize";
      if (isAdmin || paymentMethod === "wallet") {
        paymentUrl = "/api/payments/wallet-pay";
      }

      const paymentResponse = await fetch(paymentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "highlight",
          amount: totalCost,
          metadata: {
            type: "highlight",
            user_email: session.user.email?.toLowerCase(),
            title: capitalizeFirst(title),
            content: content.trim(),
            image_url: urlData.publicUrl,
            interest,
            country,
            state: state || null,
            province: province || null,
            campaign_days: campaignDays,
            is_bidded: isBiddingEnabled,
            bid_price: isBiddingEnabled ? bidPrice : null,
            is_admin_post: false,
            custom_sponsor_name: customSponsorName || null,
            custom_sponsor_handle: customSponsorHandle || null,
            is_ai_content: isAiContent,
            isAiContent: isAiContent,
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
        localStorage.removeItem("paayh_draft_news_v1");
      } catch {}

      const authUrl = paymentData.authorization_url || paymentData.data?.authorization_url;
      if (isAdmin || paymentMethod === "wallet") {
        setStatusNotice("Your Daily Highlight has been submitted for review. Redirecting to your statement...");
        setTimeout(() => {
          window.location.href = "/logged-in";
        }, 800);
      } else if (authUrl) {
        setStatusNotice("Redirecting to Paystack to complete payment for your Highlight...");
        window.location.href = authUrl;
      } else {
        window.location.href = "/logged-in";
      }
      
      setStep(0);
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

  return (
    <div className={styles.pageWapper}>
        <div className={styles.pageWrapper}>
          {/* Progress Step Tracker */}
          <FormStepProgress
            steps={steps}
            currentStep={step}
            onStepClick={(idx) => setStep(idx)}
          />

          <h1>Post Daily Highlight</h1>

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
                      <img src={mediaPreview} alt="Cover Preview" className={styles.mediaPreviewImage} />
                      <div className={styles.removeBtnContainer}>
                        <button type="button" onClick={() => { setMediaFile(null); setMediaPreview(null); }} className={styles.removeBtn}>Remove Image</button>
                      </div>
                    </div>
                  ) : (
                    <label className={styles.uploadZone}>
                      <input type="file" accept="image/*" onChange={handleMediaChange} hidden />
                      <p className={styles.uploadTitle}>Click to select cover image file</p>
                      <p className={styles.uploadSubtext}>Supports PNG, JPG, WEBP (Max 5MB)</p>
                    </label>
                  )}
                  <div className={styles.stepActionsEnd}>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      whileHover={{ scale: 1.01 }}
                      disabled={!mediaFile}
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
                      color: title.length >= 80 ? "#ef4444" : title.length >= 68 ? "#f59e0b" : "var(--text-muted)",
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
                      color: content.length >= 1000 ? "#ef4444" : content.length >= 850 ? "#f59e0b" : "var(--text-muted)",
                      transition: "color 0.2s ease"
                    }}>
                      {content.length} / 1000
                    </span>
                  </div>
                  <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Share full details of your highlight announcement..." className={styles.textareaBox} rows={6} maxLength={1000} />
                  <div className={styles.stepActionsBetween}>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => setStep(1)} className={styles.secondaryNavBtn}>Back</motion.button>
                    <motion.button whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.01 }} disabled={!content.trim()} onClick={() => setStep(3)} className={styles.primaryNavBtn}>Continue to Targeting</motion.button>
                  </div>
                </motion.div>
              )}

            {/* STEP 3: TARGETING, LOCATION & BIDDING */}
            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.22 }}
                className={`${styles.formGroup} ${styles.targetingGroup}`}
              >
                {isAdmin && (
                  <div className={`${styles.modernSectionCard} ${styles.adminSectionCard}`}>
                    <div className={`${styles.modernSectionHeader} ${styles.adminSectionHeader}`}>
                      <span className={`${styles.modernSectionTitle} ${styles.adminSectionTitle}`}>
                        <Crown size={16} color="var(--primary)" /> Admin Privilege: Custom Branding
                      </span>
                      <span className={`${styles.modernSectionBadge} ${styles.adminSectionBadge}`}>
                        Publishing Active
                      </span>
                    </div>
                    <div className={styles.modernSectionBody}>
                      <div className={styles.formGroup}>
                        <label className={styles.adminFieldLabel}>Custom Sponsor Name (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. ABC News (defaults to Sponsored)"
                          value={customSponsorName}
                          onChange={(e) => setCustomSponsorName(e.target.value)}
                          className={styles.inputBox}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.adminFieldLabel}>Custom Handle (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. @abc_news (defaults to @Sponsored)"
                          value={customSponsorHandle}
                          onChange={(e) => setCustomSponsorHandle(e.target.value)}
                          className={styles.inputBox}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Category Card */}
                <div className={styles.modernSectionCard}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>Category and Interest</span>
                    <span className={styles.modernSectionBadge}>
                      {interest || "Select Category"}
                    </span>
                  </div>
                  <div className={styles.modernSectionBody}>
                    <p className={styles.sectionDescription}>
                      Choose the specific topic or interest sector for your sponsored news piece.
                    </p>

                    <div className={styles.selectWrapper}>
                      <CustomSelect
                        value={interest}
                        onChange={(val) => setInterest(val)}
                        options={interests.map((cat) => ({
                          value: cat,
                          label: cat,
                          icon: getCategoryIcon(cat),
                        }))}
                        placeholder="-- Search or select target category --"
                        leadingIcon={<Tag size={16} />}
                      />
                    </div>
                  </div>
                </div>

                {/* Target Location Card */}
                <div className={styles.modernSectionCard}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>Target Location &amp; Coverage</span>
                    <span className={styles.modernSectionBadge}>
                      {province || state || country || "All Locations"}
                    </span>
                  </div>
                  <div className={styles.modernSectionBody}>
                    <LocationSelector
                      country={country}
                      state={state}
                      location={province}
                      inputClass={styles.inputBox}
                      labelClass={styles.fieldLabel}
                      groupClass={styles.formGroup}
                      cityLabel="Province"
                      onChange={({ country: c, state: s, location: loc }) => {
                        setCountry(c);
                        setState(s);
                        setProvince(loc);
                      }}
                    />
                  </div>
                </div>

                {/* Duration Selector Card */}
                <div className={styles.modernSectionCard}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>
                      <Calendar size={16} color="var(--primary)" /> Campaign Duration
                    </span>
                    <span className={styles.modernSectionBadge}>
                      {campaignDays} {campaignDays === 1 ? "Day" : "Days"}
                    </span>
                  </div>
                  <div className={styles.modernSectionBody}>
                    <p className={styles.sectionDescription}>
                      Select how long your news article should remain live and actively highlighted (up to 5 days).
                    </p>
                    <div className={styles.durationContainer}>
                      {[1, 2, 3, 4, 5].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setCampaignDays(num)}
                          className={`${styles.durationBtn} ${campaignDays === num ? styles.durationBtnActive : ""}`}
                        >
                          {num} {num === 1 ? "Day" : "Days"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Priority Spotlight Bidding Card */}
                <div className={`${styles.modernSectionCard} ${isBiddingEnabled ? styles.biddingCardActive : ""}`}>
                  <div className={styles.modernSectionHeader}>
                    <div className={styles.spotlightHeaderLeft}>
                      <div className={styles.spotlightIconCircle}>
                        <Zap size={16} className={styles.spotlightZapIcon} />
                      </div>
                      <div className={styles.spotlightTitleCol}>
                        <div className={styles.spotlightTitleRow}>
                          <span className={styles.modernSectionTitle}>
                            Priority Spotlight Auction
                          </span>
                          <span className={`${styles.modernSectionBadge} ${isBiddingEnabled ? styles.biddingBadgeActive : ""}`}>
                            {isBiddingEnabled ? "Spotlight Active" : "Standard Feed"}
                          </span>
                        </div>
                        <p className={styles.spotlightSubtitle}>
                          Contest for the #1 top position of the news highlights carousel
                        </p>
                      </div>
                    </div>

                    <label className={styles.spotlightSwitch} aria-label="Toggle Spotlight Bidding">
                      <input
                        type="checkbox"
                        checked={isBiddingEnabled}
                        onChange={(e) => setIsBiddingEnabled(e.target.checked)}
                      />
                      <span className={styles.spotlightSlider}></span>
                    </label>
                  </div>

                  <AnimatePresence initial={false}>
                    {isBiddingEnabled && (
                      <motion.div
                        key="news-bidding-panel"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className={styles.modernSectionBody}
                      >
                        {/* Market Context Banner */}
                        <div className={styles.spotlightContextBanner}>
                          <div className={styles.spotlightContextItem}>
                            <span className={styles.spotlightContextLabel}>Target Category</span>
                            <span className={styles.spotlightContextValue}>{interest || "General News"}</span>
                          </div>
                          <div className={styles.spotlightContextDivider} />
                          <div className={styles.spotlightContextItem}>
                            <span className={styles.spotlightContextLabel}>Standard Daily Rate</span>
                            <span className={styles.spotlightContextValue}>{formatCurrency(1000)}/day</span>
                          </div>
                          <div className={styles.spotlightContextDivider} />
                          <div className={styles.spotlightContextItem}>
                            <span className={styles.spotlightContextLabel}>Current Top Bid</span>
                            <span className={`${styles.spotlightContextValue} ${styles.spotlightTopBidVal}`}>
                              {formatCurrency(highestBid)}/day
                            </span>
                          </div>
                        </div>

                        {/* Projected Rank Card */}
                        {(() => {
                          const isLead = bidPrice > highestBid;
                          const isMatched = bidPrice === highestBid && bidPrice > 1000;
                          return (
                            <div className={`${styles.spotlightRankCard} ${isLead ? styles.rankCardSpotlight : isMatched ? styles.rankCardMatched : styles.rankCardChallenger}`}>
                              <div className={styles.spotlightRankHeader}>
                                {isLead ? (
                                  <Crown size={18} className={styles.goldCrownIcon} />
                                ) : isMatched ? (
                                  <Sparkles size={18} className={styles.matchedSparkleIcon} />
                                ) : (
                                  <TrendingUp size={18} className={styles.challengerIcon} />
                                )}
                                <div className={styles.spotlightRankCol}>
                                  <span className={styles.spotlightRankTitle}>
                                    {isLead
                                      ? "★ #1 Spotlight Winner (Top Carousel)"
                                      : isMatched
                                      ? "⚡ Matched Top Bid (Shared Rotation)"
                                      : "Challenger Position (Standard Rotation)"}
                                  </span>
                                  <p className={styles.spotlightRankDesc}>
                                    {isLead
                                      ? "Your highlight holds top spotlight at the beginning of the news carousel."
                                      : isMatched
                                      ? "Rotating at the top position alongside the current highest bidder."
                                      : `Increase bid above ${formatCurrency(highestBid)}/day to secure #1 Spotlight position.`}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Quick Presets */}
                        <div className={styles.spotlightPresets}>
                          <span className={styles.spotlightSectionLabel}>Quick Outbid Presets</span>
                          <div className={styles.spotlightPresetRow}>
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.96 }}
                              className={`${styles.spotlightPresetChip} ${bidPrice === highestBid ? styles.presetChipActive : ""}`}
                              onClick={() => setBidPrice(highestBid)}
                            >
                              <span>Match Top</span>
                              <strong>{formatCurrency(highestBid)}</strong>
                            </motion.button>
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.96 }}
                              className={`${styles.spotlightPresetChip} ${bidPrice === highestBid + 200 ? styles.presetChipActive : ""}`}
                              onClick={() => setBidPrice(highestBid + 200)}
                            >
                              <span>+₦200 Lead</span>
                              <strong>{formatCurrency(highestBid + 200)}</strong>
                            </motion.button>
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.96 }}
                              className={`${styles.spotlightPresetChip} ${bidPrice === highestBid + 500 ? styles.presetChipActive : ""}`}
                              onClick={() => setBidPrice(highestBid + 500)}
                            >
                              <span>+₦500 Outbid</span>
                              <strong>{formatCurrency(highestBid + 500)}</strong>
                            </motion.button>
                          </div>
                        </div>

                        {/* Custom Daily Bid Input */}
                        <div className={styles.formGroup}>
                          <span className={styles.spotlightSectionLabel}>Your Bid Price Per Day (₦)</span>
                          <input
                            type="number"
                            min={highestBid + 100}
                            step={100}
                            value={bidPrice}
                            onChange={(e) => setBidPrice(parseFloat(e.target.value) || 1000)}
                            className={styles.inputBox}
                          />
                        </div>

                        {/* Real-time Calculation Summary */}
                        <div className={styles.spotlightCalcSummary}>
                          <div className={styles.spotlightCalcRow}>
                            <span>Campaign Duration:</span>
                            <strong>{campaignDays} {campaignDays === 1 ? "day" : "days"}</strong>
                          </div>
                          <div className={styles.spotlightCalcRow}>
                            <span>Daily Bid Rate:</span>
                            <strong>{formatCurrency(bidPrice)}/day</strong>
                          </div>
                          <div className={`${styles.spotlightCalcRow} ${styles.spotlightCalcTotal}`}>
                            <span>Total Campaign Cost:</span>
                            <div className={styles.spotlightTotalWrap}>
                              <RollingCounter value={bidPrice * campaignDays} currencyPrefix="₦" decimals={0} durationMs={600} />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className={styles.stepActionsBetweenTight}>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => setStep(2)} className={styles.secondaryNavBtn}>Back</motion.button>
                  <motion.button whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.01 }} disabled={!interest} onClick={() => setStep(4)} className={styles.primaryNavBtn}>Continue to Preview</motion.button>
                </div>
              </motion.div>
            )}

            {/* STEP 4: PREVIEW & PAYMENT */}
            {step === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.22 }}
                className={styles.formGroup}
              >
                <div className={styles.previewCard}>
                  {mediaPreview && <img src={mediaPreview} alt="Preview" className={styles.previewImage} />}
                  <div className={styles.previewContent}>
                    <span className={styles.previewBadge}>{interest}</span>
                    <h3 className={styles.previewTitle}>{capitalizeFirst(title)}</h3>
                    <p className={styles.previewText}>{content}</p>
                    <div className={styles.previewTargeting}>
                      Targeting: {country} {state ? `· ${state}` : ""} · {campaignDays} {campaignDays === 1 ? "Day" : "Days"} {isBiddingEnabled ? `· Bidded (₦${bidPrice}/day)` : ""}
                    </div>
                  </div>
                </div>

                {/* Payment selector */}
                {isAdmin ? (
                  <div className={styles.adminPrivilegeBox}>
                    <h4 className={styles.adminPrivilegeHeading}>
                      <Crown size={18} color="var(--primary)" /> Admin Privilege: 100% Free Highlight Publishing (₦0.00 Total)
                    </h4>
                    <p className={styles.adminPrivilegeSubtext}>
                      No payment gateway or wallet balance deduction required.
                    </p>
                  </div>
                ) : (
                  <div className={styles.paymentBox}>
                    <h4 className={styles.paymentBoxHeading}>Select Payment Method</h4>
                    <div className={styles.paymentMethodOptions}>
                      <label className={styles.paymentOptionLabel}>
                        <input type="radio" name="pay" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} /> Paystack (Card/Bank/Transfer)
                      </label>
                      <label className={styles.paymentOptionLabel}>
                        <input type="radio" name="pay" checked={paymentMethod === "wallet"} onChange={() => setPaymentMethod("wallet")} /> Pay from Wallet Balance ({formatCurrency(balance)})
                      </label>
                    </div>
                    <div className={styles.paymentTotalCost}>
                      Total Payment: {formatCurrency(totalCost)}
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
                      Turn this on if your highlight contains media or text generated or altered using AI tools.
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
                    id="newsTermsPolicyCheckbox"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                    className={styles.termsCheckbox}
                  />
                  <label htmlFor="newsTermsPolicyCheckbox" className={styles.termsLabel}>
                    I have reviewed my highlight details and agree to Paayh&apos;s{" "}
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

                <div className={styles.stepActionsBetween}>
                  <button onClick={() => setStep(3)} className={styles.secondaryNavBtn}>Back</button>
                  <button disabled={isSubmitting || !agreedToPolicy} onClick={handleSubmit} className={styles.primaryNavBtn}>
                    {isSubmitting ? (
                      "Processing Submission..."
                    ) : isAdmin ? (
                      <>
                        <Rocket size={16} /> Publish (Admin)
                      </>
                    ) : (
                      `Pay ${formatCurrency(totalCost)} & Submit`
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
