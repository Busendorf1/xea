// "use client";

// import { useEffect, useState } from "react";
// import supabase from "@/lib/utils/db";
// import Image from "next/image";
// import styles from "../Newsdisplay/page.module.css"; // Make sure this path matches the location of your CSS module

// type NewsItem = {
//   id: number;
//   title: string;
//   content: string;
//   image_url: string;
//   interest: string;
// };

// type Props = {
//   userInterest: string[];
// };

// export default function Newsdisplay({ userInterest }: Props) {
//   const [ads, setAds] = useState<NewsItem[]>([]);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     const fetchAds = async () => {
//       if (!userInterest || userInterest.length === 0) {
//         setLoading(false);
//         return;
//       }

//       // Fetch ads where the news.interest matches any of the user's interests
//   const { data: ads, error } = await supabase
//     .from("news")
//     .select("*")
//     .in("interest", userInterest);

//   if (error) {
//     console.error("Error fetching ads:", error);
//     return <div>Failed to load relevant ads.</div>;
//   }

//   if (!ads || ads.length === 0) {
//     return <div className={styles.noAds}>No relevant ads for your interests.</div>;
//   }

//       setLoading(false);
//     };

//     fetchAds();
//   }, [userInterest]);

//   if (loading) return <p className={styles.adLoading}>Loading relevant ads...</p>;

//   if (ads.length === 0)
//     return <p className={styles.noAds}>No ads to show for your selected interests.</p>;

//   return (
//     <div className={styles.adWrapper}>
//       <h3 className={styles.adHeading}>Sponsored Ads</h3>
//       {ads.map((ad) => (
//         <div key={ad.id} className={styles.adCard}>
//           <div className={styles.adImageWrapper}>
//             <Image
//               src={ad.image_url}
//               alt={ad.title}
//               fill
//               className={styles.adImage}
//             />
//           </div>
//           <div className={styles.adContent}>
//             <h4>{ad.title}</h4>
//             <p>{ad.content}</p>
//             <p className={styles.adInterest}>Interest: {ad.interest}</p>
//           </div>
//         </div>
//       ))}
//     </div>
//   );
// }

//-=================
//
"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/utils/db";
import styles from "../Newsdisplay/page.module.css";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import Skeleton from "../ui/Skeleton";

interface Ad {
  id: string; // id is UUID (string) in public.newsactive
  title: string;
  content: string;
  image_url: string;
  interest: string;
  created_at: string;
}

export default function AdDisplay({
  userInterest,
}: {
  userInterest: string[];
}) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchAll = async (pageNum = 0, isLoadMore = false) => {
    if (!userInterest || userInterest.length === 0) {
      setAds([]);
      setLoading(false);
      return;
    }

    if (!isLoadMore) {
      setLoading(true);
      setPage(0);
      setHasMore(true);
    }

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    console.log(`➡️ Fetching active ads page ${pageNum} from newsactive...`);

    const ITEMS_PER_PAGE = 20;
    const fromOffset = pageNum * ITEMS_PER_PAGE;
    const toOffset = fromOffset + ITEMS_PER_PAGE - 1;

    // Fetch active/posted highlights only from the 'newsactive' table
    const { data: matchedAds, error: adsError } = await supabase
      .from("newsactive")
      .select("id, title, content, image_url, interest, created_at")
      .in("interest", userInterest)
      .gte("created_at", yesterday)
      .order("created_at", { ascending: false })
      .range(fromOffset, toOffset);

    if (adsError) {
      console.error("❌ Error fetching ads:", adsError);
    } else if (matchedAds) {
      console.log("📣 Matched active ads page fetched:", matchedAds);
      const typedAds = matchedAds as unknown as Ad[];
      if (isLoadMore) {
        setAds((prev) => [...prev, ...typedAds]);
      } else {
        setAds(typedAds);
      }
      
      if (matchedAds.length < ITEMS_PER_PAGE) {
        setHasMore(false);
      }
    }

    setLoading(false);
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchAll(nextPage, true);
  };

  useEffect(() => {
    fetchAll(0, false); // Initial fetch

    // Refresh every 10 minutes.
    // NOTE: The 10-minute interval is mandatory to satisfy the requirement
    // that drops are spaced to give highlights enough time to be seen.
    const interval = setInterval(() => {
      console.log("🔁 Refreshing active ads (mandatory 10-minute visibility interval)...");
      fetchAll(0, false);
    }, 600000); // 10 minutes in milliseconds

    return () => clearInterval(interval); // Cleanup
  }, [userInterest]);

  if (loading && page === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {[1, 2].map((n) => (
          <div key={n} className={styles.adCard} style={{ padding: "1rem" }}>
            <Skeleton variant="rect" width="100%" height={150} />
            <Skeleton variant="title" width="60%" height={18} style={{ marginTop: "10px" }} />
            <Skeleton variant="text" width="90%" height={12} />
            <Skeleton variant="text" width="80%" height={12} />
          </div>
        ))}
      </div>
    );
  }
  if (ads.length === 0) return <p className={styles.noAds}>No active highlights match your interests right now.</p>;

  return (
    <div className={styles.adList}>
      {ads.map((ad) => (
        <div key={ad.id} className={styles.adCard}>
          {/\.(mp4|webm)/i.test(ad.image_url || "") ? (
            <video
              src={ad.image_url}
              controls
              className={styles.adImage}
              style={{ width: "100%", height: "auto", maxHeight: "400px", objectFit: "contain", background: "#000", borderRadius: "8px" }}
            />
          ) : (
            <Image
              width={800}
              height={800}
              src={ad.image_url}
              alt={ad.title}
              className={styles.adImage}
            />
          )}
          <h4 className={styles.adTitle}>{ad.title}</h4>
          <p className={styles.adContent}>{ad.content}</p>
          <span className={styles.adTag}>{ad.interest}: <small>{formatDistanceToNow(new Date(ad.created_at))} ago</small></span>
        </div>
      ))}
      
      {hasMore && (
        <div className={styles.loadMoreContainer}>
          <button 
            type="button" 
            onClick={handleLoadMore} 
            className={styles.loadMoreButton}
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
