"use client";

import React, { useEffect, useState, useMemo } from "react";
import supabase from "@/lib/utils/db";
import { boostSchema } from "@/lib/validationSchemas";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "../MyAds/page.module.css";
import Link from "next/link";
import LocationSelector from "../LocationSelector";
import {
  Megaphone,
  Image as ImageIcon,
  Video,
  Zap,
  Users,
  Target,
  FileText,
  Phone,
  MessageSquare,
  Globe,
  Mail,
  ShoppingCart,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Check,
  SlidersHorizontal,
  ChevronUp,
  Wallet,
  CreditCard,
  Star,
  XCircle,
} from "lucide-react";
interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

type MyAdsProps = {
  session: Session;
};

type Ad = {
  id: string;
  ad_media: string;
  ad_content: string;
  action_phone?: string;
  action_whatsapp?: string;
  action_email?: string;
  action_website?: string;
  created_at: string | null;
  impression_count: number | null;
  impressions: number;
  campaign_days: number;
  completed_at: string | null;
  user_frequency_cap?: number;
  country?: string | null;
  state?: string | null;
  province?: string | null;
  gender?: string | null;
  admin_statement?: string | null;
  is_bidded?: boolean | null;
  display_mutual_button?: boolean | null;
  mutual_targets?: string[] | null;
  mutual_adds_count?: number | null;
  clicks_phone?: number | null;
  clicks_whatsapp?: number | null;
  clicks_website?: number | null;
  clicks_email?: number | null;
  clicks_product_cta?: number | null;
  is_paused?: boolean;
  cost_per_impression?: number;
  total_cost?: number;
  daily_budget?: number;
  industry?: string[] | string;
  interest?: string[] | string;
  lifestyle?: string[] | string;
  behavior?: string[] | string;
  personality?: string[] | string;
  ad_type?: string;
};

function getHref(type: string, value: string): string {
  switch (type) {
    case "action_phone":
      return `tel:${value}`;
    case "action_whatsapp":
      return `https://wa.me/${value}`;
    case "action_email":
      return `mailto:${value}`;
    case "action_website":
      return value.startsWith("http") ? value : `https://${value}`;
    default:
      return "#";
  }
}

function getIcon(type: string): React.ReactNode {
  switch (type) {
    case "action_phone":
      return <Phone size={14} />;
    case "action_whatsapp":
      return <MessageSquare size={14} />;
    case "action_email":
      return <Mail size={14} />;
    case "action_website":
      return <Globe size={14} />;
    default:
      return <Globe size={14} />;
  }
}

function MultimediaCarousel({ rawMedia }: { rawMedia: string }) {
  const mediaList = useMemo(() => {
    if (!rawMedia || rawMedia.trim() === "" || rawMedia.toLowerCase() === "text") {
      return [];
    }
    return rawMedia
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.toLowerCase() !== "text");
  }, [rawMedia]);

  const [currentIndex, setCurrentIndex] = useState(0);

  if (mediaList.length === 0) {
    return (
      <div className={styles.textOnlyBadge}>
        <Megaphone size={28} color="#1d9bf0" />
        <span className={styles.textCampaignLabel}>Text Campaign</span>
      </div>
    );
  }

  const currentUrl = mediaList[currentIndex];
  const isVideo = /\.(mp4|webm)$/i.test(currentUrl);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : mediaList.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < mediaList.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className={styles.carouselWrapper}>
      {isVideo ? (
        <video src={currentUrl} controls className={styles.mediaVideo} />
      ) : (
        <img src={currentUrl} alt={`Slide ${currentIndex + 1}`} className={styles.adImgElement} />
      )}

      {mediaList.length > 1 && (
        <>
          <button type="button" onClick={handlePrev} className={`${styles.carouselBtn} ${styles.carouselBtnLeft}`}>
            ‹
          </button>
          <button type="button" onClick={handleNext} className={`${styles.carouselBtn} ${styles.carouselBtnRight}`}>
            ›
          </button>
          <div className={styles.carouselDotsContainer}>
            {mediaList.map((_: string, idx: number) => (
              <span
                key={idx}
                className={`${styles.carouselDot} ${idx === currentIndex ? styles.carouselDotActive : ""}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function MyAdsDashboard({ session }: MyAdsProps) {
  const [reviewAds, setReviewAds] = useState<Ad[]>([]);
  const [activeAds, setActiveAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [timeNow, setTimeNow] = useState(Date.now());

  // Analytics & Health Metrics
  const [reportsMap, setReportsMap] = useState<Record<string, number>>({});
  const [dismissalsMap, setDismissalsMap] = useState<Record<string, number>>({});
  const [advertiserBlockCount, setAdvertiserBlockCount] = useState<number>(0);

  // Expanded Specs Drawer State
  const [expandedSpecsMap, setExpandedSpecsMap] = useState<Record<string, boolean>>({});

  const toggleSpecsDrawer = (adId: string) => {
    setExpandedSpecsMap((prev) => ({ ...prev, [adId]: !prev[adId] }));
  };
  const [boosterAd, setBoosterAd] = useState<Ad | null>(null);
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; adId?: string } | null>(null);
  const [ratingAdId, setRatingAdId] = useState<string | null>(null);
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [ratingSubmitting, setRatingSubmitting] = useState<boolean>(false);
  const [ratingMessage, setRatingMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [ratedAdIds, setRatedAdIds] = useState<Set<string>>(new Set());
  const [addImpressions, setAddImpressions] = useState<number>(1000);
  const [addDays, setAddDays] = useState<number>(3);
  const [newBidPrice, setNewBidPrice] = useState<number>(0);
  const [boosterFrequencyCap, setBoosterFrequencyCap] = useState<number>(1);
  const [boosterGender, setBoosterGender] = useState<string>("All");
  const [boosterCountry, setBoosterCountry] = useState<string>("");
  const [boosterState, setBoosterState] = useState<string>("");
  const [boosterProvince, setBoosterProvince] = useState<string>("");
  const [boosterMultiLocations, setBoosterMultiLocations] = useState<string[]>([]);
  const [boosterPaymentMethod, setBoosterPaymentMethod] = useState<"wallet" | "card">("wallet");
  const [boosting, setBoosting] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeNow(Date.now());
    }, 10000); // 10s countdown updater
    return () => clearInterval(timer);
  }, []);

  const fetchAds = async (bypassCache: boolean = false) => {
    const email = session?.user?.email;
    if (!email) return;

    const cacheKey = `my_ads_cache_${email.toLowerCase()}`;
    const TEN_MINUTES = 10 * 60 * 1000;

    if (!bypassCache && typeof window !== "undefined") {
      try {
        const cachedRaw = sessionStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && cached.timestamp && Date.now() - cached.timestamp < TEN_MINUTES) {
            setReviewAds(cached.reviewAds || []);
            setActiveAds(cached.activeAds || []);
            setReportsMap(cached.reportsMap || {});
            setDismissalsMap(cached.dismissalsMap || {});
            setAdvertiserBlockCount(cached.advertiserBlockCount || 0);
            setLoading(false);
            return;
          }
        }
      } catch (cacheErr) {
        console.warn("sessionStorage cache read error:", cacheErr);
      }
    }

    try {
      const [reviewRes, activeRes, analyticsRes] = await Promise.all([
        supabase.from("adds").select("*").ilike("user_email", email).order("created_at", { ascending: false }),
        supabase.from("addsactive").select("*").ilike("user_email", email).order("created_at", { ascending: false }),
        fetch("/api/campaigns/analytics").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      if (reviewRes.error || activeRes.error) {
        console.error("adds table select error:", reviewRes.error);
        console.error("addsactive table select error:", activeRes.error);
        throw new Error("Query failed");
      }

      const reviewData = reviewRes.data || [];
      const activeData = activeRes.data || [];
      let reports = {};
      let dismissals = {};
      let blockCount = 0;

      if (analyticsRes && analyticsRes.success) {
        reports = analyticsRes.reportsMap || {};
        dismissals = analyticsRes.dismissalsMap || {};
        blockCount = analyticsRes.advertiserBlockCount || 0;
      }

      setReviewAds(reviewData);
      setActiveAds(activeData);
      setReportsMap(reports);
      setDismissalsMap(dismissals);
      setAdvertiserBlockCount(blockCount);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              timestamp: Date.now(),
              reviewAds: reviewData,
              activeAds: activeData,
              reportsMap: reports,
              dismissalsMap: dismissals,
              advertiserBlockCount: blockCount,
            })
          );
        } catch (e) {
          console.warn("sessionStorage cache write error:", e);
        }
      }
    } catch (err) {
      console.error("Error in fetchAds:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.email) fetchAds();
  }, [session]);

  const handleTogglePause = async (adId: string, currentPausedState: boolean, adminStatement?: string | null) => {
    if (currentPausedState && adminStatement) {
      alert("Ad Paused, follow instruction provided");
      return;
    }

    try {
      const nextPausedState = !currentPausedState;
      const res = await fetch("/api/campaigns/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId, isPaused: nextPausedState }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update campaign state");
      }

      // Update local state instantly
      setActiveAds((prev) =>
        prev.map((item) => (item.id === adId ? { ...item, is_paused: nextPausedState } : item))
      );
      setReviewAds((prev) =>
        prev.map((item) => (item.id === adId ? { ...item, is_paused: nextPausedState } : item))
      );
    } catch (e: any) {
      alert(e.message || "Could not update campaign status.");
    }
  };

  const getBoostUnavailableReason = (ad: Ad, reportsCount: number): string | null => {
    if (reportsCount > 0) {
      return "This campaign has been reported by viewers and is currently under content safety review. Please wait for the moderation review to complete.";
    }
    if (ad.admin_statement && ad.admin_statement.trim() !== "") {
      return `This campaign was paused by an administrator. Reason: "${ad.admin_statement}". Please resolve the notice or wait for admin review.`;
    }
    if (ad.is_paused) {
      return "This campaign is currently paused. Please resume the campaign first to boost it.";
    }
    return null;
  };
  const handleExecuteBoost = async () => {
    if (!boosterAd) return;
    const reportsCount = reportsMap[boosterAd.id] || 0;
    const reason = getBoostUnavailableReason(boosterAd, reportsCount);
    if (reason) {
      setNoticeModal({ title: "Boosting Unavailable", message: reason, adId: boosterAd.id });
      setBoosterAd(null);
      return;
    }

    const validation = boostSchema.safeParse({
      adId: boosterAd.id,
      bidAmount: newBidPrice > 0 ? newBidPrice : 100,
      paymentMethod: boosterPaymentMethod,
    });

    if (!validation.success) {
      alert(validation.error.issues[0]?.message || "Invalid boost parameters.");
      return;
    }

    setBoosting(true);
    try {
      const res = await fetch("/api/campaigns/boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId: boosterAd.id,
          additionalImpressions: addImpressions,
          additionalDays: addDays,
          newCostPerImpression: newBidPrice > 0 ? newBidPrice : undefined,
          userFrequencyCap: boosterFrequencyCap,
          gender: boosterGender,
          country: boosterCountry,
          state: boosterState,
          province: boosterProvince || (boosterMultiLocations.length > 0 ? boosterMultiLocations.join("; ") : ""),
          paymentMethod: boosterPaymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to boost campaign");
      }

      if (boosterPaymentMethod === "card" && data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }

      alert(data.message || "Campaign boosted successfully!");
      setBoosterAd(null);
      fetchAds(true);
    } catch (e: any) {
      alert(e.message || "An error occurred while boosting your campaign.");
    } finally {
      setBoosting(false);
    }
  };

  function formatTimestamp(timestamp: string | null | undefined): string {
    if (!timestamp) return "Unknown time";
    const created = new Date(timestamp);
    const now = new Date();
    const diff = (now.getTime() - created.getTime()) / 1000;

    if (isNaN(diff)) return "Invalid date";
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hour(s) ago`;
    if (diff < 172800) return "Yesterday";

    return created.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const getCampaignDaysInfo = (ad: Ad) => {
    if (!ad.created_at) {
      return { scheduled: ad.campaign_days || 1, remaining: ad.campaign_days || 1, isRollover: false, rolloverDays: 0 };
    }
    const createdDate = new Date(ad.created_at);
    const createdDateOnly = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
    
    const today = new Date(timeNow);
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const diffTime = todayDateOnly.getTime() - createdDateOnly.getTime();
    const daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const scheduled = ad.campaign_days || 1;
    const isCompleted = !!ad.completed_at || (ad.impression_count !== null && ad.impression_count >= ad.impressions);
    
    if (isCompleted) {
      return { scheduled, remaining: 0, isRollover: false, rolloverDays: 0 };
    }
    
    if (daysPassed > scheduled) {
      return {
        scheduled,
        remaining: 0,
        isRollover: true,
        rolloverDays: daysPassed - scheduled
      };
    } else {
      return {
        scheduled,
        remaining: Math.max(0, scheduled - daysPassed),
        isRollover: false,
        rolloverDays: 0
      };
    }
  };

  const getDeletionCountdown = (completedAt: string): string => {
    const completedTime = new Date(completedAt).getTime();
    const expiryTime = completedTime + 7 * 24 * 60 * 60 * 1000; // 7 Days Archive Grace Window
    const timeLeft = expiryTime - timeNow;
    
    if (timeLeft <= 0) return "Archived";
    
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const handleShare = (adId: string) => {
    if (typeof window !== "undefined") {
      const encodedId = btoa(adId.toString());
      const shareUrl = `${window.location.origin}/login?view&Earn Ads by Paayh=${encodedId}`;
      navigator.clipboard.writeText(shareUrl)
        .then(() => alert("Ad share link copied to clipboard."))
        .catch((err) => console.error("Failed to copy link:"));
    }
  };

  const handleCancelAd = async (adId: string) => {
    const confirmCancel = window.confirm(
      "⚠️ WARNING: Are you sure you want to stop this campaign immediately?\n\nNo refunds will be issued for any unused budget/impressions under our standard cancellation policy."
    );
    if (!confirmCancel) return;

    try {
      const response = await fetch("/api/campaigns/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to cancel campaign");
      }

      alert("Campaign successfully cancelled. It will stop delivering immediately.");
      window.location.reload();
    } catch (e: any) {
      alert(e.message || "An error occurred while cancelling your campaign.");
    }
  };

  const exportCampaignCsv = (ad: Ad) => {
    const seenCount = ad.impression_count ?? 0;
    const targetImpressions = ad.impressions ?? 1000;
    const remaining = Math.max(0, targetImpressions - seenCount);
    const phoneClicks = ad.clicks_phone ?? 0;
    const whatsappClicks = ad.clicks_whatsapp ?? 0;
    const websiteClicks = ad.clicks_website ?? 0;
    const emailClicks = ad.clicks_email ?? 0;
    const productClicks = ad.clicks_product_cta ?? 0;
    const totalClicks = phoneClicks + whatsappClicks + websiteClicks + emailClicks + productClicks;
    const ctr = seenCount > 0 ? ((totalClicks / seenCount) * 100).toFixed(2) : "0.00";
    const daysInfo = getCampaignDaysInfo(ad);

    const headers = [
      "Campaign ID",
      "Created At",
      "Category",
      "Status",
      "Is Rollover",
      "Rollover Days",
      "Target Impressions",
      "Delivered Impressions",
      "Remaining Impressions",
      "Total Clicks",
      "CTR (%)",
      "Phone Clicks",
      "WhatsApp Clicks",
      "Website Clicks",
      "Email Clicks",
      "Product CTA Clicks",
      "Cost Per View",
      "Country",
      "State",
      "Gender Target",
      "Content Preview"
    ];

    const values = [
      `"${ad.id}"`,
      `"${ad.created_at || ""}"`,
      `"${ad.ad_type || "General"}"`,
      `"${ad.completed_at ? "Completed" : ad.is_paused ? "Paused" : "Active"}"`,
      `"${daysInfo.isRollover ? "Yes" : "No"}"`,
      daysInfo.rolloverDays,
      targetImpressions,
      seenCount,
      remaining,
      totalClicks,
      `${ctr}%`,
      phoneClicks,
      whatsappClicks,
      websiteClicks,
      emailClicks,
      productClicks,
      ad.cost_per_impression || 25,
      `"${ad.country || "All"}"`,
      `"${ad.state || "All"}"`,
      `"${ad.gender || "All"}"`,
      `"${(ad.ad_content || "").replace(/"/g, '""')}"`
    ];

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), values.join(",")].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `paayh_campaign_report_${ad.id.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderAdCard = (ad: Ad, status: "review" | "active") => {
    const mediaType = /\.(mp4|webm)$/i.test(ad.ad_media || "")
      ? "video"
      : "image";

    const actionButtons = ["action_phone", "action_whatsapp", "action_email", "action_website"]
      .filter((key) => ad[key as keyof Ad]) as string[];

    const daysInfo = getCampaignDaysInfo(ad);
    const seenCount = ad.impression_count ?? 0;
    
    const reportsCount = reportsMap[ad.id] || 0;
    const dismissalsCount = dismissalsMap[ad.id] || 0;

    // Calculate click tracking counters
    const phoneClicks = ad.clicks_phone ?? 0;
    const whatsappClicks = ad.clicks_whatsapp ?? 0;
    const websiteClicks = ad.clicks_website ?? 0;
    const emailClicks = ad.clicks_email ?? 0;
    const productCtaClicks = ad.clicks_product_cta ?? 0;
    const clicksCount = phoneClicks + whatsappClicks + websiteClicks + emailClicks + productCtaClicks;
    const ctr = seenCount > 0 ? ((clicksCount / seenCount) * 100).toFixed(1) : "0.0";
    
    const targetImpressions = ad.impressions ?? 1000;
    const remainingImpressions = Math.max(0, targetImpressions - seenCount);
    const deliveryPercent = Math.min(100, Math.round((seenCount / targetImpressions) * 100));
    
    const isCompleted = !!ad.completed_at || seenCount >= targetImpressions;

    const hasValidMedia = ad.ad_media && ad.ad_media.trim() !== "" && ad.ad_media.toLowerCase() !== "text";

    return (
      <div key={ad.id} className={styles.card}>
        {/* Main Horizontal Row Body */}
        <div className={styles.rowBody}>
          {/* Thumbnail / Media Column */}
          <div className={styles.mediaCol}>
            <MultimediaCarousel rawMedia={ad.ad_media} />
          </div>

          {/* Main Content & Delivery Column */}
          <div className={styles.mainInfoCol}>
            <div className={styles.tagsRow}>
              <span className={`${styles.tagPill} ${styles.tagPillMediaType}`}>
                {hasValidMedia ? (mediaType === "video" ? <><Video size={13} /> Video Ad</> : <><ImageIcon size={13} /> Image Ad</>) : <><Megaphone size={13} /> Text Ad</>}
              </span>

              {status === "review" && (
                <span className={`${styles.tagPill} ${styles.tagPillReview}`}>
                  <Clock size={13} /> PENDING REVIEW
                </span>
              )}

              {Number(ad.cost_per_impression || 25) > 25 && (
                <span className={`${styles.tagPill} ${styles.tagPillBidded}`} title="Priority Bidded Ad: Higher bid per view guarantees top placement in feeds. You can boost priority anytime.">
                  <Zap size={13} color="#f59e0b" /> Bidded Priority Ad ({formatCurrency(ad.cost_per_impression, ad.country)}/view)
                </span>
              )}
            </div>

            <p className={styles.adDescription}>{ad.ad_content}</p>

            {ad.admin_statement && (
              <div className={styles.adminNotice}>
                <strong className={styles.adminNoticeTitle}>
                  <AlertTriangle size={15} color="#f59e0b" /> Important Notice / Reason:
                </strong>
                {ad.admin_statement}
              </div>
            )}

            {/* Target Specs Pills */}
            <div className={styles.targetTagsRow}>
              {(!!ad.is_bidded || Number(ad.cost_per_impression || 0) > 25) && (
                <span className={`${styles.tagPill} ${styles.tagPillBidded}`}>
                  <Zap size={13} color="#f59e0b" /> {ad.is_bidded ? "Bidded Priority" : "Boosted"} ({formatCurrency(ad.cost_per_impression, ad.country)}/view)
                </span>
              )}
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <Users size={13} /> Target: {ad.gender || "All Genders"}
              </span>
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <Target size={13} /> Categories: {
                  Array.isArray(ad.industry) ? ad.industry.join(", ") :
                  Array.isArray(ad.interest) ? ad.interest.join(", ") :
                  ad.industry || ad.interest || "General"
                }
              </span>
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <Zap size={13} /> {ad.user_frequency_cap || 1} View/Viewer/Day
              </span>
              <span className={styles.tagPill}>{daysInfo.scheduled} Days Cap</span>
              {ad.display_mutual_button && (
                <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                  <CheckCircle2 size={13} color="#10b981" /> Mutual+ Enabled
                </span>
              )}
            </div>

            {/* Live Delivery Progress */}
            <div className={styles.deliveryProgressWrapper}>
              <div className={styles.deliveryProgressRow}>
                <span>Delivery Progress</span>
                <span>{deliveryPercent}% ({seenCount.toLocaleString()} / {targetImpressions.toLocaleString()} views)</span>
              </div>
              <div className={styles.deliveryProgressTrack}>
                <div className={styles.deliveryProgressFill} style={{ width: `${deliveryPercent}%` }} />
              </div>
            </div>

            {/* CTA Buttons Click Counter Row */}
            <div className={styles.ctaClickRow}>
              <span className={styles.ctaClickItem}><Phone size={13} /> Phone: <strong>{phoneClicks}</strong></span>
              <span className={styles.ctaClickItem}><MessageSquare size={13} /> WhatsApp: <strong>{whatsappClicks}</strong></span>
              <span className={styles.ctaClickItem}><Globe size={13} /> Website: <strong>{websiteClicks}</strong></span>
              <span className={styles.ctaClickItem}><Mail size={13} /> Email: <strong>{emailClicks}</strong></span>
              {productCtaClicks > 0 && <span className={styles.ctaClickItem}><ShoppingCart size={13} /> Product CTA: <strong>{productCtaClicks}</strong></span>}
            </div>
          </div>

          {/* Key Metrics Grid Column */}
          <div className={styles.metricsCol}>
            <div className={styles.metricCell}>
              <span className={styles.metricTitle}>Views Delivered</span>
              <span className={styles.metricVal}>{seenCount.toLocaleString()}</span>
            </div>
            <div className={styles.metricCell}>
              <span className={styles.metricTitle}>Clicks / CTR</span>
              <span className={styles.metricVal}>{clicksCount} ({ctr}%)</span>
            </div>
            <div className={styles.metricCell}>
              <span className={styles.metricTitle}>Mutual Adds</span>
              <span className={styles.metricVal}>{ad.mutual_adds_count ?? 0}</span>
            </div>
            <div className={styles.metricCell}>
              <span className={styles.metricTitle}>Ad Health</span>
              {reportsCount === 0 && advertiserBlockCount === 0 ? (
                <span className={`${styles.metricVal} ${styles.metricValGreen}`}>
                  <CheckCircle2 size={13} color="#10b981" /> Clean
                </span>
              ) : (
                <span className={`${styles.metricVal} ${styles.metricValRed}`}>
                  <AlertTriangle size={13} color="#ef4444" /> {reportsCount} Flags
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Row Footer - Aligned Single Horizontal Bar */}
        <div className={styles.rowFooter}>
          <div className={`${styles.footerLeftGroup} ${styles.footerLeftGroupInner}`}>
            {ad.is_paused ? (
              <span className={styles.badgePaused}>PAUSED</span>
            ) : isCompleted ? (
              <span className={styles.badgeCompleted} title="100% of paid impressions have been delivered and archived">
                COMPLETED {ad.completed_at ? `(${getDeletionCountdown(ad.completed_at)})` : "(100% Delivered)"}
              </span>
            ) : daysInfo.isRollover ? (
              <span
                style={{
                  backgroundColor: "rgba(234, 88, 12, 0.15)",
                  color: "#ea580c",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: "800",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
                title="Campaign schedule passed but impressions remain unfulfilled. Actively delivering in Rollover mode."
              >
                ROLLOVER (+{daysInfo.rolloverDays}d)
              </span>
            ) : (
              <span className={status === "active" ? styles.badgeActive : styles.badgeReview}>
                {status === "active" ? "Active" : "In Review"}
              </span>
            )}

            {/* Rate Listeners Button - Renders ONLY when Completed or Paused */}
            {(ad.is_paused || isCompleted) && (
              ratedAdIds.has(ad.id) ? (
                <span className={styles.rateBtnDone}>
                  <CheckCircle2 size={13} color="#10b981" /> Audience Rated
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setRatingAdId(ad.id)}
                  className={`${styles.rateBtn} ${styles.rateBtnGlow}`}
                  title="Rate campaign conversion outcomes to boost top-performing listener Attention Scores"
                >
                  <Star size={13} fill="#f59e0b" color="#f59e0b" /> Rate Audience
                </button>
              )
            )}

            <span className={styles.postedTime}>
              Posted {formatTimestamp(ad.created_at)}
            </span>
          </div>

          <div className={styles.footerRightGroup}>
            {actionButtons.length > 0 && (
              <div className={`${styles.actionButtons} ${styles.actionButtonsGroup}`}>
                {actionButtons.map((type) => (
                  <a
                    key={`${type}-${ad.id}`}
                    href={getHref(type, ad[type as keyof Ad] as string)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.iconButton}
                    title={type}
                  >
                    {getIcon(type)}
                  </a>
                ))}
              </div>
            )}

            <button
              type="button"
              className={styles.toggleSpecsBtn}
              onClick={() => toggleSpecsDrawer(ad.id)}
            >
              {expandedSpecsMap[ad.id] ? (
                <span className={styles.specsBtnInner}><ChevronUp size={13} /> Hide Specs</span>
              ) : (
                <span className={styles.specsBtnInner}><SlidersHorizontal size={13} /> Specs & Budget</span>
              )}
            </button>

            {status === "active" && !isCompleted && (
              <>
                <button
                  type="button"
                  onClick={() => handleTogglePause(ad.id, !!ad.is_paused, ad.admin_statement)}
                  className={ad.is_paused ? styles.resumeBtn : styles.pauseBtn}
                >
                  {ad.is_paused ? "Resume" : "Pause"}
                </button>
                {(() => {
                  const reason = getBoostUnavailableReason(ad, reportsMap[ad.id] || 0);
                  if (reason) {
                    return (
                      <div className={styles.boostTooltipWrapper}>
                        <button
                          type="button"
                          onClick={() => setNoticeModal({ title: "Boosting Unavailable", message: reason, adId: ad.id })}
                          className={`${styles.boostBtn} ${styles.boostUnavailableBtn}`}
                        >
                          <AlertTriangle size={14} color="#f59e0b" />
                          Boosting Unavailable
                        </button>
                        <div className={styles.boostTooltipContent}>
                          <div className={styles.boostTooltipRow}>
                            <AlertTriangle size={14} />
                            Boosting Unavailable
                          </div>
                          {reason}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setBoosterAd(ad);
                        setNewBidPrice(Number(ad.cost_per_impression || 25));
                        setBoosterFrequencyCap(Number(ad.user_frequency_cap || 1));
                        setBoosterGender(ad.gender || "All");
                        setBoosterCountry(ad.country || "");
                        setBoosterState(ad.state || "");
                        setBoosterProvince(ad.province || "");
                        setBoosterMultiLocations(ad.province ? ad.province.split("; ") : []);
                      }}
                      className={styles.boostBtn}
                    >
                      Boost
                    </button>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => handleShare(ad.id)}
                  className={styles.shareAdBtn}
                >
                  Share
                </button>
                <a
                  href={`/user/adPage?id=${ad.id}`}
                  className={`${styles.shareAdBtn} ${styles.editAdBtn}`}
                >
                  Edit Ad
                </a>
                <button
                  type="button"
                  onClick={() => exportCampaignCsv(ad)}
                  className={styles.shareAdBtn}
                  title="Download CSV Performance Report"
                >
                  <FileText size={13} /> Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleCancelAd(ad.id)}
                  className={`${styles.cancelBtn} ${styles.cancelBtnStyling}`}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Expandable Full Campaign Specs & Budget Drawer */}
        {expandedSpecsMap[ad.id] && (
          <div className={styles.specsDrawer}>
            <div className={styles.specsHeading}>
              <span className={styles.specsHeadingInner}>
                <SlidersHorizontal size={15} color="#1d9bf0" /> Advertiser Campaign Specifications & Budget Breakdown
              </span>
            </div>

            <div className={styles.specsGrid}>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Total Campaign Budget</span>
                <span className={styles.specVal}>
                  {formatCurrency((ad.impressions || 1000) * (ad.cost_per_impression || 25), ad.country)}
                </span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Daily Budget Rate</span>
                <span className={styles.specVal}>
                  {formatCurrency(((ad.impressions || 1000) * (ad.cost_per_impression || 25)) / (ad.campaign_days || 1), ad.country)} / day
                </span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Frequency Cap (Per Viewer)</span>
                <span className={styles.specVal}>
                  Max {ad.user_frequency_cap || 1} view / viewer / day
                </span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Rollover & Schedule Status</span>
                <div>
                  {daysInfo.isRollover ? (
                    <span className={`${styles.rolloverActiveBadge} ${styles.rolloverBadgeInner}`}>
                      <AlertTriangle size={12} color="#f59e0b" /> Rollover Active (+{daysInfo.rolloverDays}d exceeded)
                    </span>
                  ) : (
                    <span className={`${styles.rolloverNormalBadge} ${styles.rolloverBadgeInner}`}>
                      <CheckCircle2 size={12} color="#10b981" /> On Schedule ({daysInfo.remaining}d remaining)
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Ad Health & Shield Report</span>
                <span className={`${styles.specVal} ${reportsCount > 0 ? styles.specValRed : styles.specValGreen}`}>
                  {reportsCount > 0 ? (
                    <><AlertTriangle size={13} color="#ef4444" /> {reportsCount} Reports ({dismissalsCount} Dismissals)</>
                  ) : (
                    <><CheckCircle2 size={13} color="#10b981" /> Clean ({dismissalsCount} Dismissals, {advertiserBlockCount} Account Blocks)</>
                  )}
                </span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Target Location</span>
                <span className={styles.specVal}>
                  {ad.country || "Global"} {ad.state ? `(${ad.state})` : ""}
                </span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Target Gender & Age</span>
                <span className={styles.specVal}>
                  {ad.gender || "All Genders"} • 18 - 65 yrs
                </span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Mutual+ Settings</span>
                <span className={styles.specVal}>
                  {ad.display_mutual_button ? (
                    <span className={styles.mutualEnabledSpan}>
                      <Check size={13} color="#10b981" /> Enabled ({ad.mutual_adds_count ?? 0} gained)
                    </span>
                  ) : (
                    "Disabled"
                  )}
                </span>
              </div>
            </div>

            {clicksCount > 0 && (
              <div className={styles.clickBreakdownBox}>
                <span className={styles.clickBreakdownTitle}>Detailed Click Type Breakdown</span>
                <div className={styles.clickBreakdownRow}>
                  {productCtaClicks > 0 ? <span>🛒 Product CTA: <strong>{productCtaClicks}</strong></span> : null}
                  {phoneClicks > 0 ? <span>📞 Calls: <strong>{phoneClicks}</strong></span> : null}
                  {whatsappClicks > 0 ? <span>💬 WhatsApp: <strong>{whatsappClicks}</strong></span> : null}
                  {websiteClicks > 0 ? <span>🌐 Website: <strong>{websiteClicks}</strong></span> : null}
                  {emailClicks > 0 ? <span>✉️ Email: <strong>{emailClicks}</strong></span> : null}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const totalImpressionsDelivered = activeAds.reduce((acc, a) => acc + (a.impression_count || 0), 0);
  const totalClicksCount = activeAds.reduce((acc, a) => acc + (a.clicks_phone || 0) + (a.clicks_whatsapp || 0) + (a.clicks_website || 0) + (a.clicks_email || 0) + (a.clicks_product_cta || 0), 0);
  const totalMutualsGained = activeAds.reduce((acc, a) => acc + (a.mutual_adds_count || 0), 0);

  return (
    <div className={styles.feedContainer}>
      {loading && <p className={styles.loading}>Loading ads…</p>}
      {!loading && error && <p className={styles.error}>Error loading ads.</p>}
      
      {/* Top KPI Header Summary Grid */}
      {!loading && (
        <div className={styles.kpiContainer}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Active Campaigns</span>
            <span className={styles.kpiValue}>{activeAds.length}</span>
            <span className={styles.kpiSub}>{reviewAds.length} in review</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Impressions Delivered</span>
            <span className={styles.kpiValue}>{totalImpressionsDelivered.toLocaleString()}</span>
            <span className={styles.kpiSub}>Total views generated</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total Engagements</span>
            <span className={styles.kpiValue}>{totalClicksCount.toLocaleString()}</span>
            <span className={styles.kpiSub}>Direct action clicks</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Mutual Additions</span>
            <span className={styles.kpiValue}>{totalMutualsGained.toLocaleString()}</span>
            <span className={styles.kpiSub}>New connections gained</span>
          </div>
        </div>
      )}

      <h3 className={styles.subheading}>Ads in Review</h3>
      {!loading && reviewAds.length === 0 && (
        <p className={styles.noAds}>No ads in review.</p>
      )}
      <div className={styles.adGrid}>
        {reviewAds.map((ad) => renderAdCard(ad, "review"))}
      </div>

      <h3 className={styles.subheading}>Active Ads</h3>
      {!loading && activeAds.length === 0 ? (
        <>
          <p className={styles.noAds}>
            You do not have any active ads. Post one now!
          </p>
          <div className={styles.postButtonContainer}>
            <Link href="/user/adPage">
              <button className={styles.postButton}>Post an Ad</button>
            </Link>
          </div>
        </>
      ) : (
        <div className={styles.adGrid}>
          {activeAds.map((ad) => renderAdCard(ad, "active"))}
        </div>
      )}

      {/* Top-Up Booster Modal */}
      {boosterAd && (
        <div className={styles.modalOverlay} onClick={() => setBoosterAd(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <Zap size={18} color="#f59e0b" />
                <h3 className={styles.modalTitle}>Boost & Top Up Campaign</h3>
              </div>
              <button className={styles.modalClose} onClick={() => setBoosterAd(null)}>✕</button>
            </div>

            {/* Responsive Form Grid */}
            <div className={styles.boosterGrid}>
              <div className={styles.boosterGroup}>
                <label className={styles.boosterLabel}>Add Extra Attention Target</label>
                <select
                  className={styles.boosterInput}
                  value={addImpressions}
                  onChange={(e) => setAddImpressions(Number(e.target.value))}
                >
                  <option value={0}>+0 Attention</option>
                  <option value={500}>+500 Attention</option>
                  <option value={1000}>+1,000 Attention</option>
                  <option value={2500}>+2,500 Attention</option>
                  <option value={5000}>+5,000 Attention</option>
                  <option value={10000}>+10,000 Attention</option>
                </select>
              </div>

              <div className={styles.boosterGroup}>
                <div className={styles.boosterLabelRow}>
                  <label className={styles.boosterLabel}>Extend Duration</label>
                  <span className={styles.boosterDaysValue}>+{addDays} Days</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={addDays}
                  onChange={(e) => setAddDays(Number(e.target.value))}
                  className={styles.boosterSliderBlue}
                />
                <span className={styles.boosterSliderHint}>
                  Extend campaign schedule by up to 30 days. No extra fee charged for day extensions.
                </span>
              </div>

              <div className={styles.boosterGroup}>
                <label className={styles.boosterLabel}>Priority Bid per Attention ({formatCurrency(0, boosterAd.country).charAt(0)})</label>
                <input
                  type="number"
                  min={Number(boosterAd.cost_per_impression || 25)}
                  className={styles.boosterInput}
                  value={newBidPrice}
                  onChange={(e) => setNewBidPrice(Number(e.target.value))}
                />
                <span className={styles.boosterSliderHint}>
                  Current bid: {formatCurrency(boosterAd.cost_per_impression || 25, boosterAd.country)}/attention. Higher bids boost feed placement priority.
                </span>
              </div>

              <div className={styles.boosterGroup}>
                <div className={styles.boosterLabelRow}>
                  <label className={styles.boosterLabel}>Frequency per user</label>
                  <span className={styles.boosterFreqValue}>{boosterFrequencyCap} Views/User/Day</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={boosterFrequencyCap}
                  onChange={(e) => setBoosterFrequencyCap(Number(e.target.value))}
                  className={styles.boosterSliderPurple}
                />
                <span className={styles.boosterSliderHint}>
                  Limit max impressions per individual user (1 to 30 views/day).
                </span>
              </div>

              <div className={`${styles.boosterGroup} ${styles.boosterFullWidth}`}>
                <label className={styles.boosterLabel}>Target Gender</label>
                <select
                  className={styles.boosterInput}
                  value={boosterGender}
                  onChange={(e) => setBoosterGender(e.target.value)}
                >
                  <option value="All">All Genders</option>
                  <option value="Male">Male Only</option>
                  <option value="Female">Female Only</option>
                </select>
              </div>

              <div className={`${styles.boosterGroup} ${styles.boosterFullWidth}`}>
                <label className={styles.boosterLabel}>Multi-Location Targeting</label>
                <LocationSelector
                  country={boosterCountry}
                  state={boosterState}
                  location={boosterProvince}
                  multiLocation={true}
                  multiLocations={boosterMultiLocations}
                  inputClass={styles.boosterInput}
                  labelClass={styles.boosterLabel}
                  cityLabel="Province"
                  onChange={({ country, state, location, multiLocations }) => {
                    setBoosterCountry(country);
                    setBoosterState(state);
                    setBoosterProvince(location);
                    if (multiLocations) setBoosterMultiLocations(multiLocations);
                  }}
                />
              </div>
            </div>

            <div className={`${styles.boosterGroup} ${styles.boosterGroupMt}`}>
              <label className={styles.boosterLabel}>Payment Method</label>
              <div className={styles.paymentSelectRow}>
                <button
                  type="button"
                  className={`${styles.paymentSelectBtn} ${styles.paymentSelectBtnFlex} ${boosterPaymentMethod === "wallet" ? styles.paymentSelectBtnActive : ""}`}
                  onClick={() => setBoosterPaymentMethod("wallet")}
                >
                  <Wallet size={12} /> Wallet Balance
                </button>
                <button
                  type="button"
                  className={`${styles.paymentSelectBtn} ${styles.paymentSelectBtnFlex} ${boosterPaymentMethod === "card" ? styles.paymentSelectBtnActive : ""}`}
                  onClick={() => setBoosterPaymentMethod("card")}
                >
                  <CreditCard size={12} /> Card / Bank Transfer
                </button>
              </div>
            </div>

            <button
              type="button"
              className={`${styles.boostBtn} ${styles.boostLaunchBtn}`}
              onClick={handleExecuteBoost}
              disabled={boosting}
            >
              {boosting ? "Processing Booster..." : "Confirm & Launch Booster"}
            </button>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: CONTAINED NOTICE / BOOST ERROR */}
      {/* ==================================================== */}
      {noticeModal && (
        <div className={styles.modalOverlay} onClick={() => setNoticeModal(null)}>
          <div
            className={`${styles.modalContent} ${styles.noticeModal}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <AlertTriangle size={22} color="#f59e0b" />
                <h3 className={`${styles.modalTitle} ${styles.noticeModalTitle}`}>{noticeModal.title}</h3>
              </div>
              <button className={styles.modalClose} onClick={() => setNoticeModal(null)}>
                <XCircle size={24} />
              </button>
            </div>
            <div className={styles.noticeModalBody}>
              <p className={styles.noticeModalBodyPara}>{noticeModal.message}</p>
            </div>
            <div className={styles.noticeModalFooter}>
              <button
                type="button"
                className={`${styles.boostBtn} ${styles.gotItBtn}`}
                onClick={() => setNoticeModal(null)}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ADVERTISER RATING FOR LISTENERS */}
      {/* ==================================================== */}
      {ratingAdId && (
        <div className={styles.modalOverlay} onClick={() => { setRatingAdId(null); setRatingMessage(null); }}>
          <div
            className={`${styles.modalContent} ${styles.ratingModalContainer}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.ratingModalHeader}>
              <div className={styles.ratingModalHeaderLeft}>
                <Star size={20} fill="#f59e0b" color="#f59e0b" />
                <h3 className={styles.ratingModalTitle}>Rate Audience Engagement</h3>
              </div>
              <button className={styles.modalClose} onClick={() => { setRatingAdId(null); setRatingMessage(null); }}>
                <XCircle size={22} />
              </button>
            </div>

            <p className={styles.ratingModalSubtitle}>
              How well did the audience engage with your ad? Your 1 to 5 star rating adds Attention Score points to all participating viewers.
            </p>

            {/* Interactive Star Picker */}
            <div className={styles.starPicker}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRatingStars(star)}
                  className={`${styles.starBtn} ${ratingStars >= star ? styles.starSelected : ""}`}
                  title={`${star} Star${star > 1 ? "s" : ""} (+0.0${star} ATW Score)`}
                >
                  <Star
                    size={32}
                    fill={ratingStars >= star ? "#f59e0b" : "transparent"}
                    color={ratingStars >= star ? "#f59e0b" : "#4b5563"}
                  />
                </button>
              ))}
            </div>

            <div className={styles.starLabel}>
              {ratingStars} Star{ratingStars > 1 ? "s" : ""} selected
            </div>

            {ratingMessage && (
              <div className={ratingMessage.type === "success" ? styles.ratingAlertSuccess : styles.ratingAlertError}>
                {ratingMessage.text}
              </div>
            )}

            <button
              type="button"
              className={`${styles.boostBtn} ${styles.boostLaunchBtn}`}
              disabled={ratingSubmitting}
              onClick={async () => {
                setRatingSubmitting(true);
                setRatingMessage(null);
                try {
                  const res = await fetch("/api/campaigns/rate-listeners", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ad_id: ratingAdId, star_rating: ratingStars })
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Failed to submit rating");
                  setRatedAdIds((prev) => new Set([...prev, ratingAdId!]));
                  setRatingMessage({ type: "success", text: data.message });
                  setTimeout(() => {
                    setRatingAdId(null);
                    setRatingMessage(null);
                  }, 2000);
                } catch (err: any) {
                  setRatingMessage({ type: "error", text: err.message || "Failed to submit rating" });
                } finally {
                  setRatingSubmitting(false);
                }
              }}
            >
              {ratingSubmitting ? "Submitting Rating..." : `Submit ${ratingStars}-Star Rating`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

