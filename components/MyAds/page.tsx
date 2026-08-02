// "use client";

// import { useEffect, useState } from "react";
// import supabase from "@/lib/utils/db";
// import styles from "../MyAds/page.module.css";
// import Image from "next/image";
// import { FaCheckCircle } from "react-icons/fa";
// import { Session } from "next-auth";
// import { Timestamp } from "next/dist/server/lib/cache-handlers/types";

// type MyAdsProps = {
//   session: Session;
// };

// type Ad = {
//   id: number;
//   ad_media: string;
//   ad_content: string;
//   action_phone?: string;
//   action_whatsapp?: string;
//   action_email?: string;
//   action_website?: string;
//   created_at: string | null;
//   impression_count: number | null;
// };


// function getHref(type: string, value: string): string {
//   switch (type) {
//     case "action_phone":
//       return `tel:${value}`;
//     case "action_whatsapp":
//       return `https://wa.me/${value}`;
//     case "action_email":
//       return `mailto:${value}`;
//     case "action_website":
//       return value.startsWith("http") ? value : `https://${value}`;
//     default:
//       return "#";
//   }
// }

// function getIcon(type: string): JSX.Element {
//   switch (type) {
//     case "action_phone":
//       return <span>📞</span>;
//     case "action_whatsapp":
//       return <span>💬</span>;
//     case "action_email":
//       return <span>✉️</span>;
//     case "action_website":
//       return <span>🌐</span>;
//     default:
//       return <span>🔗</span>;
//   }
// }

// export default function MyAds({ session }: MyAdsProps) {
//   const [ads, setAds] = useState<Ad[]>([]);
//   const [seenAds, setSeenAds] = useState<number[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(false);

//   useEffect(() => {
//     const fetchAds = async () => {
//       try {
//         const { data, error } = await supabase
//           .from("adds")
//           .select("*")
//           .eq("user_email", session.user.email)
//           .order("created_at", { ascending: false });

//         if (error) throw error;

//         setAds(data || []);
//       } catch (err) {
//         setError(true);
//       } finally {
//         setLoading(false);
//       }
//     };

//     if (session?.user?.email) {
//       fetchAds();
//     }
//   }, [session]);

//   const markSeen = (ad: Ad) => {
//     setSeenAds((prev) => [...prev, ad.id]);
//   };

// function formatTimestamp(timestamp: string | null | undefined): string {
//   if (!timestamp) return "Unknown time";

//   const created = new Date(timestamp);
//   const now = new Date();
//   const diff = (now.getTime() - created.getTime()) / 1000;

//   if (isNaN(diff)) return "Invalid date";

//   if (diff < 60) return "Just now";
//   if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
//   if (diff < 86400) return `${Math.floor(diff / 3600)} hour(s) ago`;
//   if (diff < 172800) return "Yesterday";

//   return created.toLocaleDateString(undefined, {
//     year: "numeric",
//     month: "short",
//     day: "numeric",
//   });
// }

//   return (
//     <div className={styles.feedContainer}>
//       {loading && <p className={styles.loading}>Loading ads…</p>}
//       {!loading && error && (
//         <p className={styles.error}>⚠️ Error loading ads.</p>
//       )}
//       {!loading && !error && ads.length === 0 && (
//         <p className={styles.noAds}>No matching ads found for your profile.</p>
//       )}

//       <div className={styles.adGrid}>
//         {ads.map((ad) => {
//           const mediaType = /\.(mp4|webm)$/i.test(ad.ad_media || "")
//             ? "video"
//             : "image";
//           const actionButtons = [
//             "action_phone",
//             "action_whatsapp",
//             "action_email",
//             "action_website",
//           ].filter((key) => ad[key as keyof Ad]) as string[];

//           return (
//             <div key={ad.id} className={styles.card}>
//               <div className={styles.mediaBox}>
//                 {mediaType === "image" ? (
//                   <Image
//                     src={ad.ad_media || ""}
//                     alt="Ad"
//                     width={1000}
//                     height={1000}
//                     layout="responsive"
//                     priority
//                   />
//                 ) : (
//                   <video
//                     src={ad.ad_media || ""}
//                     controls
//                     className={styles.mediaVideo}
//                   />
//                 )}
//               </div>
//               <p className={styles.adText}>{ad.ad_content}</p>
//               <div className={styles.actionButtons}>
//                 {actionButtons.map((type) => (
//                   <a
//                     key={`${type}-${ad.id}`}
//                     href={getHref(type, ad[type as keyof Ad] as string)}
//                     target="_blank"
//                     rel="noopener noreferrer"
//                     className={styles.iconButton}
//                     title={type}
//                   >
//                     {getIcon(type)}
//                   </a>
//                 ))}
//                 <div>
//                   <p className={styles.adMeta}>
//   {(ad.impression_count ?? 0).toLocaleString()} views
// </p>

//                   <p className={styles.adMeta}>
//                     Posted {formatTimestamp(ad.created_at.toString())}
//                   </p>
//                 </div>
//               </div>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }



"use client";

import React, { useEffect, useState, useMemo } from "react";
import supabase from "@/lib/utils/db";
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
  XCircle,
  Wallet,
  CreditCard,
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
        <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.04em" }}>Text Campaign</span>
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
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
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

  const fetchAds = async () => {
    const email = session?.user?.email;
    if (!email) return;
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

      setReviewAds(reviewRes.data || []);
      setActiveAds(activeRes.data || []);

      if (analyticsRes && analyticsRes.success) {
        setReportsMap(analyticsRes.reportsMap || {});
        setDismissalsMap(analyticsRes.dismissalsMap || {});
        setAdvertiserBlockCount(analyticsRes.advertiserBlockCount || 0);
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
      fetchAds();
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
    const expiryTime = completedTime + 24 * 60 * 60 * 1000;
    const timeLeft = expiryTime - timeNow;
    
    if (timeLeft <= 0) return "soon";
    
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
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
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span className={styles.tagPill} style={{ backgroundColor: "rgba(99, 102, 241, 0.12)", color: "#818cf8", borderColor: "rgba(99, 102, 241, 0.3)", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                {hasValidMedia ? (mediaType === "video" ? <><Video size={13} /> Video Ad</> : <><ImageIcon size={13} /> Image Ad</>) : <><Megaphone size={13} /> Text Ad</>}
              </span>

              {status === "review" && (
                <span className={styles.tagPill} style={{ backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", borderColor: "rgba(245, 158, 11, 0.4)", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Clock size={13} /> PENDING REVIEW
                </span>
              )}

              {Number(ad.cost_per_impression || 25) > 25 && (
                <span className={styles.tagPill} style={{ backgroundColor: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", borderColor: "rgba(245, 158, 11, 0.3)", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }} title="Priority Bidded Ad: Higher bid per view guarantees top placement in feeds. You can boost priority anytime.">
                  <Zap size={13} color="#f59e0b" /> Bidded Priority Ad (₦{ad.cost_per_impression}/view)
                </span>
              )}
            </div>

            <p className={styles.adDescription}>{ad.ad_content}</p>

            {ad.admin_statement && (
              <div style={{
                backgroundColor: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.4)",
                borderRadius: "10px",
                padding: "0.75rem 1rem",
                marginTop: "0.5rem",
                marginBottom: "0.75rem",
                color: "#f59e0b",
                fontSize: "0.85rem"
              }}>
                <strong style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "0.25rem", color: "#fbbf24" }}>
                  <AlertTriangle size={15} color="#f59e0b" /> Important Notice / Reason:
                </strong>
                {ad.admin_statement}
              </div>
            )}

            {/* Target Specs Pills */}
            <div className={styles.targetTagsRow}>
              {(!!ad.is_bidded || Number(ad.cost_per_impression || 0) > 25) && (
                <span className={styles.tagPill} style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", borderColor: "rgba(245, 158, 11, 0.3)", fontWeight: "700" }}>
                  <Zap size={13} color="#f59e0b" /> {ad.is_bidded ? "Bidded Priority" : "Boosted"} (₦{ad.cost_per_impression}/view)
                </span>
              )}
              <span className={styles.tagPill} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Users size={13} /> Target: {ad.gender || "All Genders"}
              </span>
              <span className={styles.tagPill} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Target size={13} /> Categories: {
                  Array.isArray(ad.industry) ? ad.industry.join(", ") :
                  Array.isArray(ad.interest) ? ad.interest.join(", ") :
                  ad.industry || ad.interest || "General"
                }
              </span>
              <span className={styles.tagPill} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Zap size={13} /> {ad.user_frequency_cap || 1} View/Viewer/Day
              </span>
              <span className={styles.tagPill}>{daysInfo.scheduled} Days Cap</span>
              {ad.display_mutual_button && (
                <span className={styles.tagPill} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 size={13} color="#10b981" /> Mutual+ Enabled
                </span>
              )}
            </div>

            {/* Live Delivery Progress */}
            <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: "600", color: "var(--text-muted)" }}>
                <span>Delivery Progress</span>
                <span>{deliveryPercent}% ({seenCount.toLocaleString()} / {targetImpressions.toLocaleString()} views)</span>
              </div>
              <div style={{ height: "6px", backgroundColor: "var(--card-border)", borderRadius: "3px", overflow: "hidden", position: "relative" }}>
                <div style={{ height: "100%", backgroundColor: "var(--primary)", width: `${deliveryPercent}%`, borderRadius: "3px", transition: "width 0.3s ease" }} />
              </div>
            </div>

            {/* CTA Buttons Click Counter Row */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Phone size={13} /> Phone: <strong>{phoneClicks}</strong></span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><MessageSquare size={13} /> WhatsApp: <strong>{whatsappClicks}</strong></span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Globe size={13} /> Website: <strong>{websiteClicks}</strong></span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Mail size={13} /> Email: <strong>{emailClicks}</strong></span>
              {productCtaClicks > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><ShoppingCart size={13} /> Product CTA: <strong>{productCtaClicks}</strong></span>}
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
                <span className={styles.metricVal} style={{ color: "#10b981", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 size={13} color="#10b981" /> Clean
                </span>
              ) : (
                <span className={styles.metricVal} style={{ color: "#ef4444", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <AlertTriangle size={13} color="#ef4444" /> {reportsCount} Flags
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Row Footer - Aligned Single Horizontal Bar */}
        <div className={styles.rowFooter}>
          <div className={styles.footerLeftGroup}>
            {ad.is_paused ? (
              <span className={styles.badgePaused}>PAUSED</span>
            ) : isCompleted && ad.completed_at ? (
              <span className={styles.badgeCompleted}>
                Completed ({getDeletionCountdown(ad.completed_at)})
              </span>
            ) : (
              <span className={status === "active" ? styles.badgeActive : styles.badgeReview}>
                {status === "active" ? "Active" : "In Review"}
              </span>
            )}
            <span className={styles.postedTime}>
              Posted {formatTimestamp(ad.created_at)}
            </span>
          </div>

          <div className={styles.footerRightGroup}>
            {actionButtons.length > 0 && (
              <div className={styles.actionButtons} style={{ marginRight: "4px" }}>
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
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><ChevronUp size={13} /> Hide Specs</span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><SlidersHorizontal size={13} /> Specs & Budget</span>
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
                          className={styles.boostBtn}
                          style={{
                            opacity: 0.85,
                            cursor: "pointer",
                            backgroundColor: "var(--sidebar-bg)",
                            borderColor: "rgba(245, 158, 11, 0.4)",
                            color: "#f59e0b",
                            fontFamily: "inherit",
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px"
                          }}
                        >
                          <AlertTriangle size={14} color="#f59e0b" />
                          Boosting Unavailable
                        </button>
                        <div className={styles.boostTooltipContent}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#f59e0b", fontWeight: 700, marginBottom: "4px" }}>
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
                  className={styles.shareAdBtn}
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(99, 102, 241, 0.15)", borderColor: "rgba(99, 102, 241, 0.3)", color: "#818cf8" }}
                >
                  Edit Ad
                </a>
                <button
                  type="button"
                  onClick={() => handleCancelAd(ad.id)}
                  className={styles.cancelBtn}
                  style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#ef4444" }}
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <SlidersHorizontal size={15} color="#1d9bf0" /> Advertiser Campaign Specifications & Budget Breakdown
              </span>
            </div>

            <div className={styles.specsGrid}>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Total Campaign Budget</span>
                <span className={styles.specVal}>
                  ₦{((ad.impressions || 1000) * (ad.cost_per_impression || 25)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Daily Budget Rate</span>
                <span className={styles.specVal}>
                  ₦{(((ad.impressions || 1000) * (ad.cost_per_impression || 25)) / (ad.campaign_days || 1)).toLocaleString("en-NG", { minimumFractionDigits: 2 })} / day
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
                    <span className={styles.rolloverActiveBadge} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <AlertTriangle size={12} color="#f59e0b" /> Rollover Active (+{daysInfo.rolloverDays}d exceeded)
                    </span>
                  ) : (
                    <span className={styles.rolloverNormalBadge} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <CheckCircle2 size={12} color="#10b981" /> On Schedule ({daysInfo.remaining}d remaining)
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.specItem}>
                <span className={styles.specLabel}>Ad Health & Shield Report</span>
                <span className={styles.specVal} style={{ color: reportsCount > 0 ? "#ef4444" : "#10b981", display: "inline-flex", alignItems: "center", gap: "4px" }}>
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
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Check size={13} color="#10b981" /> Enabled ({ad.mutual_adds_count ?? 0} gained)
                    </span>
                  ) : (
                    "Disabled"
                  )}
                </span>
              </div>
            </div>

            {clicksCount > 0 && (
              <div style={{ background: "var(--card-bg)", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--card-border)", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Detailed Click Type Breakdown
                </span>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "0.8rem", color: "var(--foreground)" }}>
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
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className={styles.boosterLabel}>Extend Duration</label>
                  <span style={{ fontSize: "0.82rem", fontWeight: "700", color: "#1d9bf0" }}>+{addDays} Days</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={addDays}
                  onChange={(e) => setAddDays(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#1d9bf0", cursor: "pointer" }}
                />
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Extend campaign schedule by up to 30 days. No extra fee charged for day extensions.
                </span>
              </div>

              <div className={styles.boosterGroup}>
                <label className={styles.boosterLabel}>Priority Bid per Attention (₦)</label>
                <input
                  type="number"
                  min={Number(boosterAd.cost_per_impression || 25)}
                  className={styles.boosterInput}
                  value={newBidPrice}
                  onChange={(e) => setNewBidPrice(Number(e.target.value))}
                />
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Current bid: ₦{boosterAd.cost_per_impression || 25}/attention. Higher bids boost feed placement priority.
                </span>
              </div>

              <div className={styles.boosterGroup}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className={styles.boosterLabel}>Frequency per user</label>
                  <span style={{ fontSize: "0.82rem", fontWeight: "700", color: "#818cf8" }}>{boosterFrequencyCap} Views/User/Day</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={boosterFrequencyCap}
                  onChange={(e) => setBoosterFrequencyCap(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#818cf8", cursor: "pointer" }}
                />
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
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

            <div className={styles.boosterGroup} style={{ marginTop: "0.5rem" }}>
              <label className={styles.boosterLabel}>Payment Method</label>
              <div className={styles.paymentSelectRow}>
                <button
                  type="button"
                  className={`${styles.paymentSelectBtn} ${boosterPaymentMethod === "wallet" ? styles.paymentSelectBtnActive : ""}`}
                  onClick={() => setBoosterPaymentMethod("wallet")}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  <Wallet size={15} /> Wallet Balance
                </button>
                <button
                  type="button"
                  className={`${styles.paymentSelectBtn} ${boosterPaymentMethod === "card" ? styles.paymentSelectBtnActive : ""}`}
                  onClick={() => setBoosterPaymentMethod("card")}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  <CreditCard size={15} /> Card / Bank Transfer
                </button>
              </div>
            </div>

            <button
              type="button"
              className={styles.boostBtn}
              style={{ marginTop: "0.5rem", padding: "0.85rem", fontSize: "0.9rem", height: "auto" }}
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
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "480px",
              width: "90%",
              boxSizing: "border-box",
              fontFamily: "inherit",
              borderRadius: "16px",
              padding: "1.5rem",
              margin: "auto"
            }}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertTriangle size={22} color="#f59e0b" />
                <h3 className={styles.modalTitle} style={{ fontSize: "1.1rem", fontWeight: 700, fontFamily: "inherit" }}>{noticeModal.title}</h3>
              </div>
              <button className={styles.modalClose} onClick={() => setNoticeModal(null)}>
                <XCircle size={24} />
              </button>
            </div>
            <div style={{ padding: "0.5rem 0", color: "var(--foreground)", fontSize: "0.92rem", lineHeight: 1.6, wordBreak: "break-word", fontFamily: "inherit" }}>
              <p style={{ margin: 0 }}>{noticeModal.message}</p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button
                type="button"
                className={styles.boostBtn}
                onClick={() => setNoticeModal(null)}
                style={{ padding: "0.5rem 1.25rem", width: "auto", fontFamily: "inherit", fontSize: "0.85rem" }}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
