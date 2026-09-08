
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import styles from "../Newsdisplay/page.module.css";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import Skeleton from "../ui/Skeleton";
import supabase from "@/lib/supabaseClient";

interface Ad {
  id: string;
  title: string;
  content: string;
  image_url: string;
  interest: string[];
  user_email: string;
  created_at: string;
}

export default function AdDisplay({
  userInterest,
  initialHighlights,
}: {
  userInterest: string[];
  initialHighlights?: Ad[];
}) {
  const [ads, setAds] = useState<Ad[]>(initialHighlights || []);
  const [loading, setLoading] = useState(!initialHighlights || initialHighlights.length === 0);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchAll = useCallback(
    async (pageNum = 0, isLoadMore = false) => {
      if (!userInterest || userInterest.length === 0) {
        setAds([]);
        setLoading(false);
        return;
      }

      if (!isLoadMore) {
        setLoading(true);
        setError(false);
        setPage(0);
        setHasMore(true);
      }

      console.log(`➡️ Fetching active highlights page ${pageNum} via API...`);

      try {
        const interestsQuery = userInterest.join(",");
        const ITEMS_PER_PAGE = 20;
        const offset = pageNum * ITEMS_PER_PAGE;
        const response = await fetch(
          `/api/highlights?interests=${encodeURIComponent(interestsQuery)}&limit=${ITEMS_PER_PAGE}&offset=${offset}`
        );
        
        if (!response.ok) {
          throw new Error(`Failed to fetch highlights: ${response.status}`);
        }

        const pageItems = await response.json();
        console.log("📣 Highlights fetched from API:", pageItems.length);

        if (pageNum === 0 || !isLoadMore) {
          setAds(pageItems);
        } else {
          setAds((prev) => [...prev, ...pageItems]);
        }

        setHasMore(pageItems.length >= ITEMS_PER_PAGE);
      } catch (err: unknown) {
        console.error("❌ Error fetching highlights:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [userInterest]
  );

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchAll(nextPage, true);
  };

  useEffect(() => {
    if (!initialHighlights || initialHighlights.length === 0) {
      fetchAll(0, false); // Initial fetch only if not pre-seeded
    }

    // Refresh every 10 minutes.
    const interval = setInterval(() => {
      console.log("🔁 Refreshing active ads (mandatory 10-minute visibility interval)...");
      fetchAll(0, false);
    }, 600000); // 10 minutes in milliseconds

    return () => clearInterval(interval); // Cleanup
  }, [userInterest, fetchAll, initialHighlights]);

  // Real-Time Highlights Auto-Drop (Live Ticker & Spotlight Motion)
  useEffect(() => {
    if (!userInterest || userInterest.length === 0) return;

    const normalizedInterests = userInterest.map((i) => i.toLowerCase().trim());
    const channelName = "realtime-newsdisplay-highlights";

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "newsactive",
        },
        (payload) => {
          if (payload.new) {
            const row = payload.new as any;
            const rowInterest = row.interest
              ? Array.isArray(row.interest)
                ? row.interest.map((i: string) => String(i).toLowerCase().trim())
                : [String(row.interest).toLowerCase().trim()]
              : [];

            const isMatch = rowInterest.length === 0 || rowInterest.some((ri: string) => normalizedInterests.includes(ri));

            if (isMatch) {
              const newHighlight: Ad = {
                id: row.id,
                title: row.title || "Business Highlight",
                content: row.content || "",
                image_url: row.image_url || "",
                interest: Array.isArray(row.interest) ? row.interest : [row.interest],
                user_email: row.user_email || "",
                created_at: row.created_at || new Date().toISOString(),
              };

              setAds((prev) => [newHighlight, ...prev.filter((a) => a.id !== newHighlight.id)]);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  if (error) {
    return (
      <div style={{ padding: "1.5rem", textAlign: "center", background: "rgba(255, 0, 0, 0.05)", borderRadius: "8px", border: "1px solid rgba(255, 0, 0, 0.1)", marginBottom: "1.5rem" }}>
        <p style={{ color: "#ff4d4d", marginBottom: "10px", fontSize: "14px", fontWeight: "500" }}>Failed to load highlights.</p>
        <button 
          type="button" 
          onClick={() => fetchAll(0, false)} 
          style={{ padding: "6px 12px", background: "#ff4d4d", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (ads.length === 0) return <p className={styles.noAds}>No active highlights match your interests right now.</p>;

  return (
    <div className={styles.adList}>
      {ads.map((ad) => (
        <div key={ad.id} className={styles.adCard}>
          {/\.(mp4|webm|mov|m3u8)/i.test(ad.image_url || "") ? (
            <video
              src={ad.image_url}
              controls
              playsInline
              preload="metadata"
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
