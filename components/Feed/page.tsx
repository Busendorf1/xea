"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import supabase from "@/lib/utils/db";
import styles from "../Feed/page.module.css";
import { useVirtualizer } from "@tanstack/react-virtual";
import dynamic from "next/dynamic";
import { type Ad } from "../ui/AdCard";
import Skeleton from "../ui/Skeleton";
import { useViewerProfile, InitialProfileInput } from "@/lib/hooks/useViewerProfile";
import { useFeedHighlights } from "@/lib/hooks/useFeedHighlights";
import { useFeedActions } from "@/lib/hooks/useFeedActions";

const AdCard = dynamic(() => import("../ui/AdCard"), {
  loading: () => <Skeleton />,
});

interface FeedProps {
  userEmail: string;
  initialProfile?: InitialProfileInput;
  onEarnSuccess?: () => void;
  onMutualSuccess?: () => void;
}

const Feed = ({ userEmail, initialProfile, onEarnSuccess, onMutualSuccess }: FeedProps) => {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [advertiserProfiles, setAdvertiserProfiles] = useState<
    Record<string, { business_name?: string; firstName?: string; profileImage?: string }>
  >({});
  const [isMobile, setIsMobile] = useState(false);

  // 1. Hook: Viewer Profile state & balance management
  const {
    viewerProfile,
    updateBalance,
    addMutual,
    suspendAccount,
  } = useViewerProfile(userEmail, initialProfile);

  // 2. Hook: Boosted Highlights management & feed interleaving
  const {
    highlights,
    fetchHighlights,
    buildDisplayFeed,
  } = useFeedHighlights(isMobile);

  // 3. Hook: Feed Interaction Handlers (Earn, Mutual, Seen, Share)
  const {
    seenAds,
    setSeenAds,
    processingAds,
    handleAdSeen,
    handleAdEarn,
    handleAdMutual,
    handleShare,
  } = useFeedActions({
    userEmail,
    viewerProfile,
    updateBalance,
    addMutual,
    suspendAccount,
    onEarnSuccess,
    onMutualSuccess,
  });

  // Sync window size state
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch highlights when mobile or profile interests change
  useEffect(() => {
    if (userEmail && isMobile && highlights.length === 0) {
      const rawInterest = viewerProfile?.interest || initialProfile?.interest;
      const parsedInterests = Array.isArray(rawInterest)
        ? rawInterest
        : typeof rawInterest === "string"
        ? rawInterest.split(",").map((v: string) => v.trim())
        : [];
      if (parsedInterests.length > 0) {
        fetchHighlights(parsedInterests);
      }
    }
  }, [userEmail, isMobile, highlights.length, viewerProfile?.interest, initialProfile?.interest, fetchHighlights]);

  // Paginated Feed Fetcher
  const fetchRelevantAds = useCallback(
    async (pageNum: number, isLoadMore = false) => {
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setPage(0);
        setSeenAds([]);
      }
      setError(false);

      try {
        let sharedAdPrepend: Ad | null = null;
        if (!isLoadMore && typeof window !== "undefined") {
          const sharedAdId = localStorage.getItem("sharedAdId");
          if (sharedAdId) {
            try {
              const { data, error: fetchErr } = await supabase
                .from("addsactive")
                .select("*")
                .eq("id", sharedAdId)
                .single();
              if (!fetchErr && data && !data.completed_at) {
                sharedAdPrepend = data as Ad;
              }
              localStorage.removeItem("sharedAdId");
            } catch (e) {
              console.error("❌ Error fetching shared ad:", e);
            }
          }
        }

        const LIMIT = 10;
        const offset = pageNum * LIMIT;
        const refreshParam = pageNum === 0 ? "&refresh=true" : "";
        const response = await fetch(`/api/feed?offset=${offset}&limit=${LIMIT}${refreshParam}`);
        if (!response.ok) {
          throw new Error("Failed to fetch ad feed");
        }
        const data = await response.json();
        const feedAds: Ad[] = data.ads || [];
        const profilesMap = data.profiles || {};

        if (Object.keys(profilesMap).length > 0) {
          setAdvertiserProfiles((prev) => ({ ...prev, ...profilesMap }));
        }

        let finalAds = feedAds;
        if (sharedAdPrepend) {
          finalAds = [sharedAdPrepend, ...feedAds.filter((a: Ad) => a.id !== sharedAdPrepend!.id)];
        }

        setHasMore(feedAds.length >= LIMIT);
        setAds((prev) => (isLoadMore ? [...prev, ...finalAds] : finalAds));
      } catch (err) {
        console.error("❌ Error loading feed:", err);
        setError(true);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [setSeenAds]
  );

  useEffect(() => {
    fetchRelevantAds(0, false);
  }, [fetchRelevantAds]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRelevantAds(nextPage, true);
  }, [loading, loadingMore, hasMore, page, fetchRelevantAds]);

  const handleDismissAd = useCallback((adId: string) => {
    setAds((prev) => prev.filter((a) => a.id !== adId));
  }, []);

  const parentRef = useRef<HTMLDivElement>(null);
  const displayFeed = useMemo(() => buildDisplayFeed(ads), [ads, buildDisplayFeed]);

  const virtualizer = useVirtualizer({
    count: displayFeed.length,
    getScrollElement: () => parentRef.current?.parentElement || null,
    estimateSize: () => 480,
    getItemKey: useCallback((index: number) => displayFeed[index]?.id || index, [displayFeed]),
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (virtualItems.length > 0 && hasMore && !loadingMore && !loading) {
      const lastItemIndex = virtualItems[virtualItems.length - 1].index;
      if (lastItemIndex >= displayFeed.length - 2) {
        loadMore();
      }
    }
  }, [virtualItems, hasMore, loadingMore, loading, displayFeed.length, loadMore]);

  return (
    <div ref={parentRef} className={styles.feedContainer}>
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "1.25rem 1rem" }}>
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ display: "flex", gap: "0.75rem" }}>
              <Skeleton variant="avatar" width={40} height={40} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <Skeleton variant="title" width="40%" height={16} />
                <Skeleton variant="text" width="90%" height={12} />
                <Skeleton variant="text" width="85%" height={12} />
                <Skeleton variant="rect" width="100%" height={220} />
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && error && <p className={styles.error}>Error loading ads.</p>}
      {!loading && !error && ads.length === 0 && (
        <p className={styles.noAds}>No matching ads found for your profile.</p>
      )}

      {!loading && !error && displayFeed.length > 0 && (
        <div
          className={styles.adGrid}
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const ad = displayFeed[virtualRow.index];
            return (
              <div
                key={ad.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  zIndex: displayFeed.length - virtualRow.index,
                }}
              >
                <AdCard
                  ad={ad}
                  userEmail={userEmail}
                  advertiserProfiles={advertiserProfiles}
                  viewerProfile={viewerProfile}
                  seenAds={seenAds}
                  processingAds={processingAds}
                  onAdEarn={handleAdEarn}
                  onAdMutual={handleAdMutual}
                  onMarkSeen={handleAdSeen}
                  onShare={handleShare}
                  onDismiss={handleDismissAd}
                />
              </div>
            );
          })}
        </div>
      )}

      {loadingMore && (
        <div className={styles.loadMoreContainer}>
          <span className={styles.loadingSpinner}></span>
        </div>
      )}
    </div>
  );
};

export default Feed;