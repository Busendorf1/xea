"use client";

import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { boostSchema } from "@/lib/validationSchemas";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "../MyAds/page.module.css";
import Link from "next/link";
import LocationSelector from "../LocationSelector";
import CustomSelect from "@/components/ui/CustomSelect";
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
  RotateCw,
  Tag,
  User,
  UserCheck,
} from "lucide-react";
interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

import { fetchUserCampaignsShared, clearUserCampaignsCache } from "@/lib/campaignsClient";

type MyAdsProps = {
  session: Session;
};

type Ad = {
  id: string;
  ad_media?: string | null;
  ad_media_url?: string | null;
  ad_media_type?: string | null;
  ad_content: string;
  action_phone?: string;
  action_whatsapp?: string;
  action_email?: string;
  action_website?: string;
  action_ios?: string;
  action_android?: string;
  action_watch_now?: string;
  ad_action_buttons?: string[];
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
  age_range?: number[] | string[] | string | null;
  employment_status?: string[] | string | null;
  targeting_all?: boolean | null;
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
  industry?: string[] | string | null;
  interest?: string[] | string | null;
  lifestyle?: string[] | string | null;
  behavior?: string[] | string | null;
  personality?: string[] | string | null;
  ad_type?: string;
  is_ai_content?: boolean | null;
};

function parseTargetingList(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed || trimmed === "[]" || trimmed === "null" || trimmed === "undefined") return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((s) => String(s).trim()).filter(Boolean);
        }
      } catch {}
    }
    return trimmed
      .split(/[,;]/)
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return [];
}

function formatAgeRange(val: any): string {
  if (!val) return "18 - 65 yrs";
  if (Array.isArray(val) && val.length >= 2) {
    return `${val[0]} - ${val[1]} yrs`;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          return `${parsed[0]} - ${parsed[1]} yrs`;
        }
      } catch {}
    }
    return trimmed;
  }
  return "18 - 65 yrs";
}

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

function MultimediaCarousel({ rawMedia, adMediaType }: { rawMedia?: string | null; adMediaType?: string | null }) {
  const [imgError, setImgError] = useState(false);
  const mediaList = useMemo(() => {
    if (!rawMedia || typeof rawMedia !== "string" || rawMedia.trim() === "" || rawMedia.toLowerCase() === "text" || rawMedia.toLowerCase() === "null") {
      return [];
    }
    return rawMedia
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.toLowerCase() !== "text" && s.toLowerCase() !== "null" && s.toLowerCase() !== "undefined");
  }, [rawMedia]);

  const [currentIndex, setCurrentIndex] = useState(0);

  if (mediaList.length === 0 || imgError) {
    return (
      <div className={styles.textOnlyBadge}>
        {adMediaType === "video" ? (
          <>
            <Video size={28} color="#1d9bf0" />
            <span className={styles.textCampaignLabel}>Video Ad</span>
          </>
        ) : adMediaType === "image" ? (
          <>
            <ImageIcon size={28} color="#1d9bf0" />
            <span className={styles.textCampaignLabel}>Image Ad</span>
          </>
        ) : (
          <>
            <Megaphone size={28} color="#1d9bf0" />
            <span className={styles.textCampaignLabel}>Text Campaign</span>
          </>
        )}
      </div>
    );
  }

  const currentUrl = mediaList[currentIndex];
  const isVideo = adMediaType === "video" || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(currentUrl);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : mediaList.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < mediaList.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className={styles.carouselContainer}>
      <div className={styles.carouselWrapper}>
        <div
          className={styles.carouselTrack}
          style={{
            transform: `translate3d(calc(-${currentIndex} * (100% + 10px)), 0, 0)`,
          }}
        >
          {mediaList.map((url: string, idx: number) => {
            const isVid = adMediaType === "video" || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(url);
            return (
              <div key={idx} className={styles.carouselSlide}>
                {isVid ? (
                  <video
                    src={url}
                    controls
                    playsInline
                    preload="metadata"
                    className={styles.mediaVideo}
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <img
                    src={url}
                    alt={`Slide ${idx + 1}`}
                    className={styles.adImgElement}
                    onError={() => setImgError(true)}
                  />
                )}
              </div>
            );
          })}
        </div>

        {mediaList.length > 1 && (
          <>
            {currentIndex > 0 && (
              <button type="button" onClick={handlePrev} className={`${styles.carouselBtn} ${styles.carouselBtnLeft}`} aria-label="Previous">
                ‹
              </button>
            )}
            {currentIndex < mediaList.length - 1 && (
              <button type="button" onClick={handleNext} className={`${styles.carouselBtn} ${styles.carouselBtnRight}`} aria-label="Next">
                ›
              </button>
            )}
          </>
        )}
      </div>

      {mediaList.length > 1 && (
        <div className={styles.carouselDotsOutside}>
          {mediaList.map((_: string, idx: number) => (
            <span
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              className={`${styles.carouselDot} ${idx === currentIndex ? styles.carouselDotActive : ""}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyAdsDashboard({ session }: MyAdsProps) {
  const [reviewAds, setReviewAds] = useState<Ad[]>([]);
  const [activeAds, setActiveAds] = useState<Ad[]>([]);
  const [activeAdsPage, setActiveAdsPage] = useState<number>(1);
  const [reviewAdsPage, setReviewAdsPage] = useState<number>(1);
  const ADS_PER_PAGE = 10;

  const totalReviewPages = Math.max(1, Math.ceil(reviewAds.length / ADS_PER_PAGE));
  const safeReviewAdsPage = Math.min(Math.max(1, reviewAdsPage), totalReviewPages);

  const totalActivePages = Math.max(1, Math.ceil(activeAds.length / ADS_PER_PAGE));
  const safeActiveAdsPage = Math.min(Math.max(1, activeAdsPage), totalActivePages);

  const renderPageButtons = (
    currentPage: number,
    totalPages: number,
    onPageChange: (pg: number) => void
  ) => {
    if (totalPages <= 1) return null;
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("ellipsis-1");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("ellipsis-2");
      pages.push(totalPages);
    }
    return pages.map((pg, idx) => {
      if (typeof pg === "string") {
        return (
          <span key={`el-${idx}`} className={styles.paginationEllipsis}>
            …
          </span>
        );
      }
      return (
        <button
          key={`pg-${pg}`}
          className={`${styles.pageBtn} ${pg === currentPage ? styles.pageBtnActive : ""}`}
          onClick={() => onPageChange(pg)}
        >
          {pg}
        </button>
      );
    });
  };

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
    const THIRTY_SECONDS = 30 * 1000;

    if (!bypassCache && typeof window !== "undefined") {
      try {
        const cachedRaw = sessionStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && cached.timestamp && Date.now() - cached.timestamp < THIRTY_SECONDS) {
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
      const [campaignsRes, analyticsRes] = await Promise.all([
        fetchUserCampaignsShared(email, bypassCache),
        fetch("/api/campaigns/analytics").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      if (!campaignsRes) {
        throw new Error("Failed to fetch campaigns");
      }

      const reviewData = campaignsRes.adsQueue || [];
      const activeData = campaignsRes.adsActive || [];
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

  const verifyBoostPayment = async (reference: string) => {
    if (!reference) return;
    setNoticeModal({
      title: "Verifying Boost Payment",
      message: "Confirming your boost top-up with payment gateway... ⚡",
    });

    try {
      const res = await fetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`);
      const data = await res.json();
      if (data.success || data.status === "success") {
        setNoticeModal({
          title: "Campaign Boosted! ⚡",
          message: "Your campaign priority and impressions have been updated successfully!",
        });
        clearUserCampaignsCache(session?.user?.email || "");
        fetchAds(true);
      } else {
        setNoticeModal({
          title: "Boost Verification Notice",
          message: data.message || "Payment has not yet settled or was not completed. If debited, your campaign will update shortly once confirmed.",
        });
      }
    } catch (err: any) {
      setNoticeModal({
        title: "Boost Verification Notice",
        message: err.message || "Unable to verify payment at this time.",
      });
    }
  };

  useEffect(() => {
    if (session?.user?.email) fetchAds();
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkPendingBoost = () => {
      const urlParams = new URLSearchParams(window.location.search);
      let ref = urlParams.get("boost_ref") || urlParams.get("reference") || urlParams.get("trxref");

      if (!ref) {
        ref = sessionStorage.getItem("paayh_boost_ref");
      }

      if (ref && ref.startsWith("BOOST-")) {
        sessionStorage.removeItem("paayh_boost_ref");
        verifyBoostPayment(ref);
      }
    };

    checkPendingBoost();

    const handleCustomBoostEvent = (e: any) => {
      const ref = e.detail?.reference;
      if (ref && ref.startsWith("BOOST-")) {
        sessionStorage.removeItem("paayh_boost_ref");
        verifyBoostPayment(ref);
      }
    };

    window.addEventListener("paayh_boost_ref", handleCustomBoostEvent);
    return () => {
      window.removeEventListener("paayh_boost_ref", handleCustomBoostEvent);
    };
  }, [session?.user?.email]);

  const handleTogglePause = async (adId: string, currentPausedState: boolean, adminStatement?: string | null) => {
    if (currentPausedState && adminStatement) {
      setNoticeModal({
        title: "Campaign Notice",
        message: `This ad is paused by administration: "${adminStatement}". Please follow the instruction provided.`,
      });
      return;
    }

    try {
      const nextPausedState = !currentPausedState;
      // Update local state optimistically
      setActiveAds((prev) =>
        prev.map((item) => (item.id === adId ? { ...item, is_paused: nextPausedState } : item))
      );
      setReviewAds((prev) =>
        prev.map((item) => (item.id === adId ? { ...item, is_paused: nextPausedState } : item))
      );

      const res = await fetch("/api/campaigns/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId, isPaused: nextPausedState }),
      });

      if (!res.ok) {
        const errData = await res.json();
        // Rollback optimistic update
        setActiveAds((prev) =>
          prev.map((item) => (item.id === adId ? { ...item, is_paused: currentPausedState } : item))
        );
        setReviewAds((prev) =>
          prev.map((item) => (item.id === adId ? { ...item, is_paused: currentPausedState } : item))
        );
        setNoticeModal({
          title: "Status Update",
          message: errData.error || "Failed to update campaign state.",
        });
      }
    } catch (e: any) {
      // Rollback optimistic update
      setActiveAds((prev) =>
        prev.map((item) => (item.id === adId ? { ...item, is_paused: currentPausedState } : item))
      );
      setReviewAds((prev) =>
        prev.map((item) => (item.id === adId ? { ...item, is_paused: currentPausedState } : item))
      );
      setNoticeModal({
        title: "Connection Notice",
        message: e.message || "Could not update campaign status.",
      });
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
      setNoticeModal({
        title: "Validation Notice",
        message: validation.error.issues[0]?.message || "Invalid boost parameters.",
      });
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

      setNoticeModal({
        title: "Campaign Boosted",
        message: data.message || "Your campaign has been boosted successfully!",
      });
      setBoosterAd(null);
      clearUserCampaignsCache(session?.user?.email || "");
      fetchAds(true);
    } catch (e: any) {
      setNoticeModal({
        title: "Boost Notice",
        message: e.message || "An error occurred while boosting your campaign.",
      });
    } finally {
      setBoosting(false);
    }
  };

  function formatTimestamp(timestamp: string | null | undefined): string {
    if (!timestamp) return "Unknown time";
    const created = new Date(timestamp);
    if (isNaN(created.getTime())) return "Invalid date";

    return created.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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

  const getDeletionCountdown = (completedAt: string): string | null => {
    const completedTime = new Date(completedAt).getTime();
    const expiryTime = completedTime + 48 * 60 * 60 * 1000; // 48 Hours Archive Grace Window
    const timeLeft = expiryTime - timeNow;
    
    if (timeLeft <= 0) return null;
    
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const handleShare = (adId: string) => {
    if (typeof window !== "undefined") {
      const encodedId = btoa(adId.toString());
      const shareUrl = `${window.location.origin}/login?view&Earn Ads by Paayh=${encodedId}`;
      navigator.clipboard.writeText(shareUrl)
        .then(() => {
          window.dispatchEvent(new CustomEvent("xea:toast", { detail: { message: "Link copied to clipboard" } }));
        })
        .catch(() => setNoticeModal({ title: "Share Notice", message: "Failed to copy link to clipboard." }));
    }
  };

  const handleEditAd = (adId: string) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("paayh_active_tab", "adPage");
      sessionStorage.setItem("paayh_edit_ad_id", adId);
      window.dispatchEvent(new CustomEvent("paayh_edit_ad", { detail: { adId } }));
      window.dispatchEvent(new Event("paayh_tab_change"));
    }
  };

  const handleCancelAd = async (adId: string) => {
    const confirmCancel = window.confirm(
      "Are you sure you want to stop this campaign immediately? Delivery will cease immediately."
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

      setNoticeModal({
        title: "Campaign Cancelled",
        message: "Campaign successfully cancelled. Delivery has ceased immediately.",
      });
      clearUserCampaignsCache(session?.user?.email || "");
      fetchAds(true);
    } catch (e: any) {
      setNoticeModal({
        title: "Cancel Notice",
        message: e.message || "An error occurred while cancelling your campaign.",
      });
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
    const rawMediaString = ad.ad_media || ad.ad_media_url || "";
    const isVideoMedia = ad.ad_media_type === "video" || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(rawMediaString);
    const mediaType = isVideoMedia ? "video" : "image";

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
    
    // Parse all targeting dimensions for rich targeting display
    const industryList = parseTargetingList(ad.industry);
    const interestList = parseTargetingList(ad.interest);
    const lifestyleList = parseTargetingList(ad.lifestyle);
    const behaviorList = parseTargetingList(ad.behavior);
    const personalityList = parseTargetingList(ad.personality);
    const employmentList = parseTargetingList(ad.employment_status);
    const ageRangeText = formatAgeRange(ad.age_range);
    const geoText = [ad.province, ad.state, ad.country].filter(Boolean).join(" • ") || (ad.country ? ad.country : "Global");
    const totalCategoriesCount = industryList.length + interestList.length + lifestyleList.length + behaviorList.length + personalityList.length;

    const targetImpressions = ad.impressions ?? 1000;
    const deliveryPercent = Math.min(100, Math.round((seenCount / targetImpressions) * 100));
    
    const isCompleted = !!ad.completed_at || seenCount >= targetImpressions;
    const deletionCountdown = ad.completed_at ? getDeletionCountdown(ad.completed_at) : null;
    if (isCompleted && ad.completed_at && deletionCountdown === null) {
      // 48 hours grace window has passed -> automatically omit from UI
      return null;
    }

    const hasValidMedia = !!rawMediaString && rawMediaString.trim() !== "" && rawMediaString.toLowerCase() !== "text" && rawMediaString.toLowerCase() !== "null";

    return (
      <motion.div
        key={ad.id}
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2 }}
        transition={{ duration: 0.25 }}
        className={styles.card}
      >
        {/* Main Horizontal Row Body */}
        <div className={styles.rowBody}>
          {/* Thumbnail / Media Column */}
          <div className={styles.mediaCol}>
            <MultimediaCarousel rawMedia={rawMediaString} adMediaType={ad.ad_media_type} />
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
                  <Zap size={13} color="var(--primary)" /> Bidded Priority Ad ({formatCurrency(ad.cost_per_impression, ad.country)}/view)
                </span>
              )}

              {(ad.is_ai_content || (ad as any).isAiContent) && (
                <span className={`${styles.tagPill} ${styles.tagPillAi}`} title="AI-generated content">
                  AI Content
                </span>
              )}
            </div>

            <p className={styles.adDescription}>{ad.ad_content}</p>

            {ad.admin_statement && (
              <div className={styles.adminNotice}>
                <strong className={styles.adminNoticeTitle}>
                  <AlertTriangle size={15} color="var(--primary)" /> Important Notice / Reason:
                </strong>
                {ad.admin_statement}
              </div>
            )}

            {/* Target Specs Pills */}
            <div className={styles.targetTagsRow}>
              {(!!ad.is_bidded || Number(ad.cost_per_impression || 0) > 25) && (
                <span className={`${styles.tagPill} ${styles.tagPillBidded}`}>
                  <Zap size={13} color="var(--primary)" /> {ad.is_bidded ? "Bidded Priority" : "Boosted"} ({formatCurrency(ad.cost_per_impression, ad.country)}/view)
                </span>
              )}
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <Globe size={13} /> Geo: {geoText}
              </span>
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <Users size={13} /> {ad.gender ? (ad.gender.toLowerCase() === "both" ? "All Genders" : ad.gender.charAt(0).toUpperCase() + ad.gender.slice(1)) : "All Genders"} • {ageRangeText}
              </span>
              {industryList.length > 0 && (
                <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                  <Target size={13} /> Industry ({industryList.length}): {industryList.join(", ")}
                </span>
              )}
              {interestList.length > 0 && (
                <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                  <Tag size={13} /> Interests ({interestList.length}): {interestList.join(", ")}
                </span>
              )}
              {lifestyleList.length > 0 && (
                <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                  <SlidersHorizontal size={13} /> Lifestyle ({lifestyleList.length}): {lifestyleList.join(", ")}
                </span>
              )}
              {behaviorList.length > 0 && (
                <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                  <Target size={13} /> Behavior ({behaviorList.length}): {behaviorList.join(", ")}
                </span>
              )}
              {personalityList.length > 0 && (
                <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                  <Users size={13} /> Personality ({personalityList.length}): {personalityList.join(", ")}
                </span>
              )}
              {employmentList.length > 0 && (
                <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                  <Users size={13} /> Employment: {employmentList.join(", ")}
                </span>
              )}
              {totalCategoriesCount === 0 && (
                <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                  <Target size={13} /> Targeting: Broad Delivery
                </span>
              )}
              <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                <Zap size={13} /> {ad.user_frequency_cap || 1} View/Viewer/Day
              </span>
              <span className={styles.tagPill}>{daysInfo.scheduled} Days Cap</span>
              {ad.display_mutual_button && (
                <span className={`${styles.tagPill} ${styles.tagPillIcon}`}>
                  <CheckCircle2 size={13} color="var(--primary)" /> Mutual+ Enabled
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
                <motion.div
                  className={styles.deliveryProgressFill}
                  initial={{ width: 0 }}
                  animate={{ width: `${deliveryPercent}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
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
                  <CheckCircle2 size={13} color="var(--primary)" /> Clean
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
                COMPLETED {deletionCountdown ? `(Archiving in ${deletionCountdown})` : "(100% Delivered)"}
              </span>
            ) : daysInfo.isRollover ? (
              <span
                className={styles.badgeRollover}
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
                  <CheckCircle2 size={13} color="var(--primary)" /> Audience Rated
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setRatingAdId(ad.id)}
                  className={`${styles.rateBtn} ${styles.rateBtnGlow}`}
                  title="Rate campaign conversion outcomes to boost top-performing listener Attention Scores"
                >
                  <Star size={13} fill="var(--primary)" color="var(--primary)" /> Rate Audience
                </button>
              )
            )}

            <span className={styles.postedTime}>
              {status === "review"
                ? `Submitted ${formatTimestamp(ad.created_at)}`
                : isCompleted && ad.completed_at
                ? `Posted ${formatTimestamp(ad.created_at)} • Completed ${formatTimestamp(ad.completed_at)}`
                : `Posted ${formatTimestamp(ad.created_at)}`}
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
                <span className={styles.specsBtnInner}><SlidersHorizontal size={13} /> Specs and Budget</span>
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
                          <AlertTriangle size={14} color="var(--text-muted)" />
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
                  href="/logged-in"
                  className={`${styles.shareAdBtn} ${styles.editAdBtn}`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleEditAd(ad.id);
                  }}
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
        <AnimatePresence>
          {expandedSpecsMap[ad.id] && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className={styles.specsDrawer}
            >
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
                      <AlertTriangle size={12} color="var(--primary)" /> Rollover Active (+{daysInfo.rolloverDays}d exceeded)
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
                  {geoText}
                </span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Target Gender & Age</span>
                <span className={styles.specVal}>
                  {ad.gender ? (ad.gender.toLowerCase() === "both" ? "All Genders" : ad.gender.charAt(0).toUpperCase() + ad.gender.slice(1)) : "All Genders"} • {ageRangeText}
                </span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Targeting Scope</span>
                <span className={styles.specVal}>
                  {totalCategoriesCount > 0 ? `${totalCategoriesCount} Categories Configured` : "Broad Delivery"}
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

            {/* Complete Audience Targeting Specifications Matrix */}
            <div className={styles.targetingMatrixBox}>
              <span className={styles.targetingMatrixTitle}>
                <Target size={14} color="var(--primary)" /> Complete Audience Targeting Specifications
              </span>
              
              <div className={styles.targetingMatrixGrid}>
                {/* Industry Categories */}
                <div className={styles.targetingCard}>
                  <div className={styles.targetingCardHeader}>
                    <span className={styles.targetingCardLabel}>Industry Categories</span>
                    <span className={styles.targetingCardCount}>{industryList.length} selected</span>
                  </div>
                  <div className={styles.targetingChipsRow}>
                    {industryList.length > 0 ? (
                      industryList.map((item, idx) => (
                        <span key={idx} className={styles.targetingChip}>{item}</span>
                      ))
                    ) : (
                      <span className={styles.targetingEmpty}>Broad (All Industries)</span>
                    )}
                  </div>
                </div>

                {/* Interest Categories */}
                <div className={styles.targetingCard}>
                  <div className={styles.targetingCardHeader}>
                    <span className={styles.targetingCardLabel}>Interest Categories</span>
                    <span className={styles.targetingCardCount}>{interestList.length} selected</span>
                  </div>
                  <div className={styles.targetingChipsRow}>
                    {interestList.length > 0 ? (
                      interestList.map((item, idx) => (
                        <span key={idx} className={styles.targetingChip}>{item}</span>
                      ))
                    ) : (
                      <span className={styles.targetingEmpty}>Broad (All Interests)</span>
                    )}
                  </div>
                </div>

                {/* Lifestyle Profiles */}
                <div className={styles.targetingCard}>
                  <div className={styles.targetingCardHeader}>
                    <span className={styles.targetingCardLabel}>Lifestyle Profiles</span>
                    <span className={styles.targetingCardCount}>{lifestyleList.length} selected</span>
                  </div>
                  <div className={styles.targetingChipsRow}>
                    {lifestyleList.length > 0 ? (
                      lifestyleList.map((item, idx) => (
                        <span key={idx} className={styles.targetingChip}>{item}</span>
                      ))
                    ) : (
                      <span className={styles.targetingEmpty}>Broad (All Lifestyles)</span>
                    )}
                  </div>
                </div>

                {/* Consumer Behaviors */}
                <div className={styles.targetingCard}>
                  <div className={styles.targetingCardHeader}>
                    <span className={styles.targetingCardLabel}>Consumer Behaviors</span>
                    <span className={styles.targetingCardCount}>{behaviorList.length} selected</span>
                  </div>
                  <div className={styles.targetingChipsRow}>
                    {behaviorList.length > 0 ? (
                      behaviorList.map((item, idx) => (
                        <span key={idx} className={styles.targetingChip}>{item}</span>
                      ))
                    ) : (
                      <span className={styles.targetingEmpty}>Broad (All Behaviors)</span>
                    )}
                  </div>
                </div>

                {/* Personality Types */}
                <div className={styles.targetingCard}>
                  <div className={styles.targetingCardHeader}>
                    <span className={styles.targetingCardLabel}>Personality Types</span>
                    <span className={styles.targetingCardCount}>{personalityList.length} selected</span>
                  </div>
                  <div className={styles.targetingChipsRow}>
                    {personalityList.length > 0 ? (
                      personalityList.map((item, idx) => (
                        <span key={idx} className={styles.targetingChip}>{item}</span>
                      ))
                    ) : (
                      <span className={styles.targetingEmpty}>Broad (All Personalities)</span>
                    )}
                  </div>
                </div>

                {/* Demographics & Employment */}
                <div className={styles.targetingCard}>
                  <div className={styles.targetingCardHeader}>
                    <span className={styles.targetingCardLabel}>Demographics & Employment</span>
                    <span className={styles.targetingCardCount}>
                      {[ad.gender, ageRangeText, employmentList.length > 0 ? `${employmentList.length} status` : null].filter(Boolean).length} configured
                    </span>
                  </div>
                  <div className={styles.targetingChipsRow}>
                    <span className={styles.targetingChip}>
                      Gender: {ad.gender ? (ad.gender.toLowerCase() === "both" ? "All Genders" : ad.gender.charAt(0).toUpperCase() + ad.gender.slice(1)) : "All Genders"}
                    </span>
                    <span className={styles.targetingChip}>
                      Age: {ageRangeText}
                    </span>
                    {employmentList.length > 0 ? (
                      employmentList.map((emp, idx) => (
                        <span key={idx} className={styles.targetingChip}>{emp}</span>
                      ))
                    ) : (
                      <span className={styles.targetingChip}>Employment: All</span>
                    )}
                  </div>
                </div>

                {/* Geographic Delivery */}
                <div className={styles.targetingCard}>
                  <div className={styles.targetingCardHeader}>
                    <span className={styles.targetingCardLabel}>Geographic Delivery</span>
                    <span className={styles.targetingCardCount}>{ad.country || "Global"}</span>
                  </div>
                  <div className={styles.targetingChipsRow}>
                    <span className={styles.targetingChip}>Country: {ad.country || "All / Global"}</span>
                    {ad.state && <span className={styles.targetingChip}>State: {ad.state}</span>}
                    {ad.province && <span className={styles.targetingChip}>Locations: {ad.province}</span>}
                  </div>
                </div>
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
  };

  const totalImpressionsDelivered = activeAds.reduce((acc, a) => acc + (a.impression_count || 0), 0);
  const totalClicksCount = activeAds.reduce((acc, a) => acc + (a.clicks_phone || 0) + (a.clicks_whatsapp || 0) + (a.clicks_website || 0) + (a.clicks_email || 0) + (a.clicks_product_cta || 0), 0);
  const totalMutualsGained = activeAds.reduce((acc, a) => acc + (a.mutual_adds_count || 0), 0);

  return (
    <div className={styles.feedContainer}>
      <div className={styles.headerBar}>
        <h2 className={styles.headerTitle}>My Ad Campaigns</h2>
        <button
          type="button"
          onClick={() => fetchAds(true)}
          className={styles.refreshAdsBtn}
          title="Force-fetch latest ad campaigns and metrics from database"
        >
          <motion.span
            animate={{ rotate: loading ? 360 : 0 }}
            transition={{ repeat: loading ? Infinity : 0, duration: 1, ease: "linear" }}
            style={{ display: "inline-flex" }}
          >
            <RotateCw size={13} />
          </motion.span>
          <span>Refresh Ads</span>
        </button>
      </div>

      {loading && <p className={styles.loading}>Loading ads…</p>}
      {!loading && error && <p className={styles.error}>Error loading ads.</p>}
      
      {/* Top KPI Header Summary Grid */}
      {!loading && (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.06 },
            },
          }}
          className={styles.kpiContainer}
        >
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 12 },
              show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
            }}
            whileHover={{ y: -3, scale: 1.015 }}
            className={styles.kpiCard}
          >
            <span className={styles.kpiLabel}>Active Campaigns</span>
            <span className={styles.kpiValue}>{activeAds.length}</span>
            <span className={styles.kpiSub}>Currently delivering</span>
          </motion.div>
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 12 },
              show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
            }}
            whileHover={{ y: -3, scale: 1.015 }}
            className={styles.kpiCard}
          >
            <span className={styles.kpiLabel}>Ads in Review</span>
            <span className={`${styles.kpiValue} ${styles.kpiValueMuted}`}>{reviewAds.length}</span>
            <span className={`${styles.kpiSub} ${styles.kpiSubMuted}`}>Pending approval</span>
          </motion.div>
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 12 },
              show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
            }}
            whileHover={{ y: -3, scale: 1.015 }}
            className={styles.kpiCard}
          >
            <span className={styles.kpiLabel}>Impressions Delivered</span>
            <span className={styles.kpiValue}>{totalImpressionsDelivered.toLocaleString()}</span>
            <span className={styles.kpiSub}>Total views generated</span>
          </motion.div>
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 12 },
              show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
            }}
            whileHover={{ y: -3, scale: 1.015 }}
            className={styles.kpiCard}
          >
            <span className={styles.kpiLabel}>Total Engagements</span>
            <span className={styles.kpiValue}>{totalClicksCount.toLocaleString()}</span>
            <span className={styles.kpiSub}>Direct action clicks</span>
          </motion.div>
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 12 },
              show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
            }}
            whileHover={{ y: -3, scale: 1.015 }}
            className={styles.kpiCard}
          >
            <span className={styles.kpiLabel}>Mutual Additions</span>
            <span className={styles.kpiValue}>{totalMutualsGained.toLocaleString()}</span>
            <span className={styles.kpiSub}>New connections gained</span>
          </motion.div>
        </motion.div>
      )}

      <h3 className={styles.subheading}>Ads in Review ({reviewAds.length})</h3>
      {!loading && reviewAds.length === 0 && (
        <p className={styles.noAds}>No ads in review.</p>
      )}
      <div className={styles.adGrid}>
        {reviewAds
          .slice((safeReviewAdsPage - 1) * ADS_PER_PAGE, safeReviewAdsPage * ADS_PER_PAGE)
          .map((ad) => renderAdCard(ad, "review"))}
      </div>
      {reviewAds.length > ADS_PER_PAGE && (
        <div className={styles.paginationBar}>
          <span className={styles.paginationInfo}>
            Showing {(safeReviewAdsPage - 1) * ADS_PER_PAGE + 1}–
            {Math.min(safeReviewAdsPage * ADS_PER_PAGE, reviewAds.length)} of {reviewAds.length} in review
          </span>
          <div className={styles.paginationControls}>
            <button
              className={styles.pageBtn}
              onClick={() => setReviewAdsPage((p) => Math.max(1, p - 1))}
              disabled={safeReviewAdsPage <= 1}
            >
              Prev
            </button>
            {renderPageButtons(safeReviewAdsPage, totalReviewPages, setReviewAdsPage)}
            <button
              className={styles.pageBtn}
              onClick={() => setReviewAdsPage((p) => Math.min(totalReviewPages, p + 1))}
              disabled={safeReviewAdsPage >= totalReviewPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <h3 className={styles.subheading}>Active Ads ({activeAds.length})</h3>
      {!loading && activeAds.length === 0 ? (
        <>
          <p className={styles.noAds}>
            You do not have any active ads. Post one now!
          </p>
          <div className={styles.postButtonContainer}>
            <Link 
              href="/logged-in"
              onClick={() => {
                sessionStorage.setItem("paayh_active_tab", "adPage");
                window.dispatchEvent(new Event("paayh_tab_change"));
              }}
            >
              <button className={styles.postButton}>Post an Ad</button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className={styles.adGrid}>
            {activeAds
              .slice((safeActiveAdsPage - 1) * ADS_PER_PAGE, safeActiveAdsPage * ADS_PER_PAGE)
              .map((ad) => renderAdCard(ad, "active"))}
          </div>
          {activeAds.length > ADS_PER_PAGE && (
            <div className={styles.paginationBar}>
              <span className={styles.paginationInfo}>
                Showing {(safeActiveAdsPage - 1) * ADS_PER_PAGE + 1}–
                {Math.min(safeActiveAdsPage * ADS_PER_PAGE, activeAds.length)} of {activeAds.length} active
              </span>
              <div className={styles.paginationControls}>
                <button
                  className={styles.pageBtn}
                  onClick={() => setActiveAdsPage((p) => Math.max(1, p - 1))}
                  disabled={safeActiveAdsPage <= 1}
                >
                  Prev
                </button>
                {renderPageButtons(safeActiveAdsPage, totalActivePages, setActiveAdsPage)}
                <button
                  className={styles.pageBtn}
                  onClick={() => setActiveAdsPage((p) => Math.min(totalActivePages, p + 1))}
                  disabled={safeActiveAdsPage >= totalActivePages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Top-Up Booster Modal */}
      <AnimatePresence>
        {boosterAd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={styles.modalOverlay}
            onClick={() => setBoosterAd(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 10 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div className={styles.modalHeaderLeft}>
                  <Zap size={18} color="var(--primary)" />
                  <h3 className={styles.modalTitle}>Boost &amp; Top Up Campaign</h3>
                </div>
                <button className={styles.modalClose} onClick={() => setBoosterAd(null)}>✕</button>
              </div>

              {/* Responsive Form Grid */}
              <div className={styles.boosterGrid}>
                <div className={styles.boosterGroup}>
                  <label className={styles.boosterLabel}>Add Extra Attention Target</label>
                  <CustomSelect
                    value={String(addImpressions)}
                    onChange={(val) => setAddImpressions(Number(val))}
                    options={[
                      { value: "0", label: "+0 Attention", badge: "Current" },
                      { value: "500", label: "+500 Attention", badge: "Starter" },
                      { value: "1000", label: "+1,000 Attention", badge: "Popular" },
                      { value: "2500", label: "+2,500 Attention", badge: "Growth" },
                      { value: "5000", label: "+5,000 Attention", badge: "High Reach" },
                      { value: "10000", label: "+10,000 Attention", badge: "Scale" },
                    ]}
                    placeholder="Select Extra Attention"
                    leadingIcon={<Zap size={16} />}
                  />
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
                <div className={styles.boosterGenderGroup}>
                  {[
                    { value: "All", label: "All Genders", icon: <Users size={14} /> },
                    { value: "Male", label: "Male Only", icon: <User size={14} /> },
                    { value: "Female", label: "Female Only", icon: <UserCheck size={14} /> },
                  ].map((g) => {
                    const isSelected = boosterGender === g.value;
                    return (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() => setBoosterGender(g.value)}
                        className={`${styles.boosterGenderBtn} ${isSelected ? styles.boosterGenderBtnActive : ""}`}
                      >
                        {g.icon}
                        <span>{g.label}</span>
                      </button>
                    );
                  })}
                </div>
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

      {/* ==================================================== */}
      {/* MODAL: CONTAINED NOTICE / BOOST ERROR */}
      {/* ==================================================== */}
      <AnimatePresence>
        {noticeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={styles.modalOverlay}
            onClick={() => setNoticeModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 10 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={`${styles.modalContent} ${styles.noticeModal}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div className={styles.modalHeaderLeft}>
                  <AlertTriangle size={22} color="var(--primary)" />
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================================================== */}
      {/* MODAL: ADVERTISER RATING FOR LISTENERS */}
      {/* ==================================================== */}
      <AnimatePresence>
        {ratingAdId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={styles.modalOverlay}
            onClick={() => { setRatingAdId(null); setRatingMessage(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 10 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={`${styles.modalContent} ${styles.ratingModalContainer}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.ratingModalHeader}>
                <div className={styles.ratingModalHeaderLeft}>
                  <Star size={20} fill="var(--primary)" color="var(--primary)" />
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
                      fill={ratingStars >= star ? "var(--primary)" : "transparent"}
                      color={ratingStars >= star ? "var(--primary)" : "var(--card-border)"}
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

