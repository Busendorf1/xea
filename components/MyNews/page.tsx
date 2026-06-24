// "use client";

// import { useEffect, useState } from "react";
// import supabase from "@/lib/utils/db";
// import styles from "../MyNews/page.module.css";
// import Image from "next/image";
// import { Session } from "next-auth";

// type MyNewsProps = {
//   session: Session;
// };

// type Ad = {
//   id: number;
//   image_url: string;
//   title: string;
//   interest: string;
//   content: string;
//   action_phone?: string;
//   action_whatsapp?: string;
//   action_email?: string;
//   action_website?: string;
//   created_at: string | null;
//   impression_count: number | null;
// };

// export default function MyNews({ session }: MyNewsProps) {
//   const [ads, setAds] = useState<Ad[]>([]);
//   const [seenAds, setSeenAds] = useState<number[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(false);

//   useEffect(() => {
//     const fetchAds = async () => {
//       try {
//         const { data, error } = await supabase
//           .from("news")
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

//   function formatTimestamp(timestamp: string | null | undefined): string {
//     if (!timestamp) return "Unknown time";

//     const created = new Date(timestamp);
//     const now = new Date();
//     const diff = (now.getTime() - created.getTime()) / 1000;

//     if (isNaN(diff)) return "Invalid date";

//     if (diff < 60) return "Just now";
//     if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
//     if (diff < 86400) return `${Math.floor(diff / 3600)} hour(s) ago`;
//     if (diff < 172800) return "Yesterday";

//     return created.toLocaleDateString(undefined, {
//       year: "numeric",
//       month: "short",
//       day: "numeric",
//     });
//   }

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
//                     src={ad.image_url || ""}
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
//               <h4 className={styles.adText}>{ad.title}</h4>
//               <p className={styles.adText}>{ad.content}</p>
//              <div className={styles.actionButtons}>
//   <p className={styles.adMeta}>
//     {(ad.impression_count ?? 0).toLocaleString()} views
//   </p>
//   <p className={styles.adMeta}>
//     Posted {formatTimestamp(ad.created_at?.toString())}
//   </p>
// </div>
// <span className={styles.interestTag}>Interest: {ad.interest}</span>

//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }



"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/utils/db";
import styles from "../MyNews/page.module.css";
import Link from "next/link";
interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

type MyNewsProps = {
  session: Session;
};

type Ad = {
  id: number;
  image_url: string;
  title: string;
  interest: string;
  content: string;
  action_phone?: string;
  action_whatsapp?: string;
  action_email?: string;
  action_website?: string;
  created_at: string | null;
  impression_count: number | null;
};

export default function MyNewsDashboard({ session }: MyNewsProps) {
  const [reviewNews, setReviewNews] = useState<Ad[]>([]);
  const [activeNews, setActiveNews] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchNews = async () => {
      const email = session?.user?.email;
      if (!email) return;
      try {
        const [reviewRes, activeRes] = await Promise.all([
          supabase.from("news").select("*").eq("user_email", email).order("created_at", { ascending: false }),
          supabase.from("newsactive").select("*").eq("user_email", email).order("created_at", { ascending: false }),
        ]);

        if (reviewRes.error || activeRes.error) throw new Error();

        setReviewNews(reviewRes.data || []);
        setActiveNews(activeRes.data || []);
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (session?.user?.email) fetchNews();
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

  const renderAdCard = (ad: Ad, status: "review" | "active") => (
    <div key={ad.id} className={styles.card}>
      <div className={styles.mediaBox}>
        {/\.(mp4|webm)/i.test(ad.image_url || "") ? (
          <video
            src={ad.image_url || ""}
            controls
            className={styles.adImgElement}
            style={{ maxHeight: "150px", background: "#000" }}
          />
        ) : (
          <img
            src={ad.image_url || ""}
            alt="News cover"
            className={styles.adImgElement}
          />
        )}
        <span className={status === "active" ? styles.badgeActive : styles.badgeReview}>
          {status === "active" ? "Active" : "In Review"}
        </span>
      </div>
      <div className={styles.cardContent}>
        <span className={styles.interestTag}>{ad.interest}</span>
        <h4 className={styles.adTitle}>{ad.title}</h4>
        <p className={styles.adDescription}>{ad.content}</p>
        <div className={styles.cardFooter}>
          <p className={styles.adCoverage}>
            Will be seen by users in the same interest category
          </p>
          <p className={styles.adTime}>
            Posted {formatTimestamp(ad.created_at?.toString())}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.feedContainer}>
      {loading && <p className={styles.loading}>Loading Highlights...</p>}
      {!loading && error && <p className={styles.error}>Error loading Highlights.</p>}
      
      <h3 className={styles.subheading}>Highlights in Review</h3>
      {!loading && reviewNews.length === 0 && <p className={styles.noAds}>No Highlights in review.</p>}
      <div className={styles.adGrid}>
        {reviewNews.map((ad) => renderAdCard(ad, "review"))}
      </div>

      <h3 className={styles.subheading}>Active Highlights</h3>
      {!loading && activeNews.length === 0 ? (
        <>
          <p className={styles.noAds}>
            You do not have any active Highlights. Post one now!
          </p>
          <div className={styles.postButtonContainer}>
            <Link href="/user/news">
              <button className={styles.postButton}>Post a Highlight</button>
            </Link>
          </div>
        </>
      ) : (
        <div className={styles.adGrid}>
          {activeNews.map((ad) => renderAdCard(ad, "active"))}
        </div>
      )}
    </div>
  );
}
