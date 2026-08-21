"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import supabase from "@/lib/utils/db";
import styles from "../Feed/page.module.css";
import { useVirtualizer } from "@tanstack/react-virtual";
import dynamic from "next/dynamic";
import { type Ad } from "../ui/AdCard";
import Skeleton from "../ui/Skeleton";
import NewPostsPill from "../ui/NewPostsPill";
import { useViewerProfile, InitialProfileInput } from "@/lib/hooks/useViewerProfile";
import { useFeedHighlights } from "@/lib/hooks/useFeedHighlights";
import { useFeedActions } from "@/lib/hooks/useFeedActions";
import { useLiveFeedUpdates } from "@/lib/hooks/useLiveFeedUpdates";

const AdCard = dynamic(() => import("../ui/AdCard"), {
  loading: () => <Skeleton />,
});

interface FeedProps {
  userEmail: string;
  initialProfile?: InitialProfileInput;
  onEarnSuccess?: (earnedAmount?: number) => void;
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
    Record<
      string,
      {
        business_name?: string;
        firstName?: string;
        lastName?: string;
        profileImage?: string;
        username?: string;
        bio?: string;
        location?: string;
        country?: string;
        monetized?: boolean;
        created_at?: string;
      }
    >
  >({});
  const [isMobile, setIsMobile] = useState(false);

  // 1. Hook: Viewer Profile state & balance management
  const {
    viewerProfile,
    setViewerProfile,
    updateBalance,
    incrementClicks,
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
    setViewerProfile,
    updateBalance,
    incrementClicks,
    addMutual,
    suspendAccount,
    onEarnSuccess,
    onMutualSuccess,
  });

  // 4. Hook: Real-Time Live Feed Updates (Tier-1 Signal PubSub)
  const { pendingCount, clearPending } = useLiveFeedUpdates({
    userInterests: viewerProfile?.interest || initialProfile?.interest,
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
        let sharedAdParam = "";
        if (!isLoadMore && typeof window !== "undefined") {
          const sharedAdId = localStorage.getItem("sharedAdId");
          if (sharedAdId) {
            sharedAdParam = `&sharedAdId=${encodeURIComponent(sharedAdId)}`;
            localStorage.removeItem("sharedAdId");
          }
        }

        const LIMIT = 10;
        const offset = pageNum * LIMIT;
        const refreshParam = pageNum === 0 ? "&refresh=true" : "";
        const response = await fetch(`/api/feed?offset=${offset}&limit=${LIMIT}${refreshParam}${sharedAdParam}`);
        if (!response.ok) {
          throw new Error("Failed to fetch ad feed");
        }
        const data = await response.json();
        const feedAds: Ad[] = data.ads || [];
        const profilesMap = data.profiles || {};

        if (Object.keys(profilesMap).length > 0) {
          setAdvertiserProfiles((prev) => ({ ...prev, ...profilesMap }));
        }

        setHasMore(feedAds.length >= LIMIT);
        setAds((prev) => {
          if (!isLoadMore) return feedAds;
          const existingIds = new Set(prev.map((a) => a.id));
          const newUnique = feedAds.filter((a) => !existingIds.has(a.id));
          return [...prev, ...newUnique];
        });
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
  const displayFeed = useMemo(() => {
    const rawFeed = buildDisplayFeed(ads);
    const seen = new Set<string>();
    return rawFeed.filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [ads, buildDisplayFeed]);

  const virtualizer = useVirtualizer({
    count: displayFeed.length,
    getScrollElement: () => parentRef.current?.parentElement || null,
    estimateSize: () => 500,
    getItemKey: useCallback((index: number) => displayFeed[index]?.id || `feed-item-${index}`, [displayFeed]),
    overscan: 8,
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

  const handlePillClick = useCallback(() => {
    clearPending();
    const scrollEl = parentRef.current?.parentElement || (typeof window !== "undefined" ? window : null);
    if (scrollEl && "scrollTo" in scrollEl) {
      scrollEl.scrollTo({ top: 0, behavior: "smooth" });
    }
    fetchRelevantAds(0, false);
  }, [clearPending, fetchRelevantAds]);

  // Jump-Free Scroll-to-Top Auto-Reveal:
  // If the user scrolls naturally back to the very top (scrollTop === 0) and rests there,
  // automatically flush pending oncoming ads without any layout shift or UI jump.
  useEffect(() => {
    if (pendingCount <= 0) return;

    let settleTimeout: NodeJS.Timeout | null = null;
    const scrollEl = parentRef.current?.parentElement || (typeof window !== "undefined" ? window : null);
    if (!scrollEl) return;

    const handleScrollCheck = () => {
      const currentScrollTop =
        scrollEl instanceof Window ? window.scrollY : (scrollEl as HTMLElement).scrollTop;

      // Strictly ensure user has fully arrived at the top (0px)
      if (currentScrollTop <= 0) {
        if (settleTimeout) clearTimeout(settleTimeout);
        settleTimeout = setTimeout(() => {
          const finalCheck =
            scrollEl instanceof Window ? window.scrollY : (scrollEl as HTMLElement).scrollTop;
          if (finalCheck <= 0) {
            clearPending();
            fetchRelevantAds(0, false);
          }
        }, 180); // 180ms settling threshold to guarantee zero scroll momentum jump
      }
    };

    scrollEl.addEventListener("scroll", handleScrollCheck as EventListener, { passive: true });
    return () => {
      if (settleTimeout) clearTimeout(settleTimeout);
      scrollEl.removeEventListener("scroll", handleScrollCheck as EventListener);
    };
  }, [pendingCount, clearPending, fetchRelevantAds]);

  return (
    <div ref={parentRef} className={styles.feedContainer}>
      <NewPostsPill count={pendingCount} onClick={handlePillClick} />
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
            if (!ad) return null;
            return (
              <div
                key={virtualRow.key || ad.id || virtualRow.index}
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