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

import React, { useEffect, useState } from "react";
import supabase from "@/lib/utils/db";
import styles from "../MyAds/page.module.css";
import Link from "next/link";
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
  display_mutual_button?: boolean | null;
  mutual_targets?: string[] | null;
  mutual_adds_count?: number | null;
  clicks_phone?: number | null;
  clicks_whatsapp?: number | null;
  clicks_website?: number | null;
  clicks_email?: number | null;
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
      return <span>Phone</span>;
    case "action_whatsapp":
      return <span>WhatsApp</span>;
    case "action_email":
      return <span>Email</span>;
    case "action_website":
      return <span>Website</span>;
    default:
      return <span>Link</span>;
  }
}

export default function MyAdsDashboard({ session }: MyAdsProps) {
  const [reviewAds, setReviewAds] = useState<Ad[]>([]);
  const [activeAds, setActiveAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [timeNow, setTimeNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeNow(Date.now());
    }, 10000); // 10s countdown updater
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchAds = async () => {
      const email = session?.user?.email;
      if (!email) return;
      try {
        const [reviewRes, activeRes] = await Promise.all([
          supabase.from("adds").select("*").ilike("user_email", email).order("created_at", { ascending: false }),
          supabase.from("addsactive").select("*").ilike("user_email", email).order("created_at", { ascending: false }),
        ]);

        if (reviewRes.error || activeRes.error) throw new Error();

        setReviewAds(reviewRes.data || []);
        setActiveAds(activeRes.data || []);
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (session?.user?.email) fetchAds();
  }, [session]);

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
      const shareUrl = `${window.location.origin}/login?view&Earn Ads by Xea=${encodedId}`;
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
    
    // Calculate click tracking counters
    const phoneClicks = ad.clicks_phone ?? 0;
    const whatsappClicks = ad.clicks_whatsapp ?? 0;
    const websiteClicks = ad.clicks_website ?? 0;
    const emailClicks = ad.clicks_email ?? 0;
    const clicksCount = phoneClicks + whatsappClicks + websiteClicks + emailClicks;
    const ctr = seenCount > 0 ? ((clicksCount / seenCount) * 100).toFixed(1) : "0.0";
    
    const targetImpressions = ad.impressions ?? 1000;
    const remainingImpressions = Math.max(0, targetImpressions - seenCount);
    const deliveryPercent = Math.min(100, Math.round((seenCount / targetImpressions) * 100));
    
    const isCompleted = !!ad.completed_at || seenCount >= targetImpressions;

    return (
      <div key={ad.id} className={styles.card}>
        <div className={styles.mediaBox}>
          {mediaType === "image" ? (
            <img
              src={ad.ad_media}
              alt="Ad cover"
              className={styles.adImgElement}
            />
          ) : (
            <video src={ad.ad_media} controls className={styles.mediaVideo} />
          )}
          
          {isCompleted && ad.completed_at ? (
            <span className={styles.badgeCompleted}>
              Completed (deleting in {getDeletionCountdown(ad.completed_at)})
            </span>
          ) : (
            <span className={status === "active" ? styles.badgeActive : styles.badgeReview}>
              {status === "active" ? "Active" : "In Review"}
            </span>
          )}
        </div>
        <div className={styles.cardContent}>
          <p className={styles.adDescription}>{ad.ad_content}</p>

          {/* Delivery Progress Bar */}
          <div style={{ margin: "12px 0", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: "600", color: "var(--text-muted)" }}>
              <span>Delivery Progress</span>
              <span>{deliveryPercent}% ({seenCount}/{targetImpressions})</span>
            </div>
            <div style={{ height: "6px", backgroundColor: "var(--card-border)", borderRadius: "3px", overflow: "hidden", position: "relative" }}>
              <div style={{ height: "100%", backgroundColor: "var(--primary)", width: `${deliveryPercent}%`, borderRadius: "3px", transition: "width 0.3s ease" }} />
            </div>
          </div>
          
          <div className={styles.statsSection}>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Scheduled duration:</span>
              <span className={styles.statValue}>{daysInfo.scheduled} days</span>
            </div>
            
            <div className={styles.statRow}>
              <span className={styles.statLabel}>
                {daysInfo.isRollover ? "Rollover active:" : "Days remaining:"}
              </span>
              <span className={daysInfo.isRollover ? styles.statValueRollover : styles.statValue}>
                {daysInfo.isRollover ? `${daysInfo.rolloverDays} days (exceeded)` : `${daysInfo.remaining} days`}
              </span>
            </div>

            <div className={styles.statRow}>
              <span className={styles.statLabel}>Target impressions:</span>
              <span className={styles.statValue}>{targetImpressions}</span>
            </div>

            <div className={styles.statRow}>
              <span className={styles.statLabel}>Impressions remaining:</span>
              <span className={styles.statValue}>{remainingImpressions}</span>
            </div>

            <div className={styles.statRow}>
              <span className={styles.statLabel}>Seen / Impressions:</span>
              <span className={styles.statValue}>{seenCount}</span>
            </div>

            <div className={styles.statRow}>
              <span className={styles.statLabel}>Total clicks:</span>
              <span className={styles.statValue}>{clicksCount} ({ctr}% CTR)</span>
            </div>

            {clicksCount > 0 && (
              <div style={{ paddingLeft: "10px", fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "2px", borderLeft: "2px solid var(--card-border)", margin: "4px 0" }}>
                {phoneClicks > 0 ? <span>📞 Phone Clicks: {phoneClicks}</span> : null}
                {whatsappClicks > 0 ? <span>💬 WhatsApp Clicks: {whatsappClicks}</span> : null}
                {websiteClicks > 0 ? <span>🌐 Website Clicks: {websiteClicks}</span> : null}
                {emailClicks > 0 ? <span>✉️ Email Clicks: {emailClicks}</span> : null}
              </div>
            )}
          </div>

          {/* Mutual Settings */}
          <div className={styles.mutualSection}>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Mutual+ button:</span>
              <span className={ad.display_mutual_button ? styles.mutualBadgeOn : styles.mutualBadgeOff}>
                {ad.display_mutual_button ? '✓ Enabled' : '✗ Disabled'}
              </span>
            </div>
            {(ad.mutual_targets ?? []).length > 0 && (
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Mutuals targeted:</span>
                <span className={styles.statValue}>{(ad.mutual_targets ?? []).length} viewer{(ad.mutual_targets ?? []).length !== 1 ? 's' : ''}</span>
              </div>
            )}
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Mutual adds gained:</span>
              <span className={styles.statValue}>{ad.mutual_adds_count ?? 0} mutual{(ad.mutual_adds_count ?? 0) !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <div className={styles.actionSection}>
            {actionButtons.length > 0 && (
              <div className={styles.actionButtons}>
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
            
            <div className={styles.cardFooter}>
              {status === "active" && !isCompleted && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => handleShare(ad.id)}
                    className={styles.shareAdBtn}
                  >
                    Share Ad
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancelAd(ad.id)}
                    style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#ef4444", padding: "6px 12px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: "600", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              <p className={styles.adTime}>
                Posted {formatTimestamp(ad.created_at)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.feedContainer}>
      {loading && <p className={styles.loading}>Loading ads…</p>}
      {!loading && error && <p className={styles.error}>Error loading ads.</p>}
      
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
    </div>
  );
}
