"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import styles from "../Feed/page.module.css";
import adCardStyles from "../ui/AdCard.module.css";
import { useVirtualizer } from "@tanstack/react-virtual";
import AdCard, { type Ad } from "../ui/AdCard";
import Skeleton from "../ui/Skeleton";
import FeedSkeleton from "../ui/FeedSkeleton";
import NewPostsPill from "../ui/NewPostsPill";
import { useViewerProfile, InitialProfileInput } from "@/lib/hooks/useViewerProfile";
import { useFeedHighlights } from "@/lib/hooks/useFeedHighlights";
import { useFeedActions } from "@/lib/hooks/useFeedActions";
import { useLiveFeedUpdates } from "@/lib/hooks/useLiveFeedUpdates";

interface FeedProps {
  userEmail: string;
  initialProfile?: InitialProfileInput;
  initialAds?: Ad[];
  initialProfiles?: Record<string, any>;
  initialHighlights?: any[];
  onEarnSuccess?: (earnedAmount?: number, newBalance?: number, newClicks?: number) => void;
  onMutualSuccess?: () => void;
}

function readFeedClientCache(email?: string): { ads: Ad[]; profiles: Record<string, any> } | null {
  if (typeof window === "undefined" || !email) return null;
  try {
    const raw = sessionStorage.getItem(`paayh_feed_cache_${email.toLowerCase().trim()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.ads) && parsed.ads.length > 0) {
      return {
        ads: parsed.ads,
        profiles: parsed.profiles || {},
      };
    }
  } catch {}
  return null;
}

const Feed = ({ userEmail, initialProfile, initialAds, initialProfiles, initialHighlights, onEarnSuccess, onMutualSuccess }: FeedProps) => {
  const [clientCache] = useState(() =>
    !initialAds || initialAds.length === 0 ? readFeedClientCache(userEmail) : null
  );

  const [ads, setAds] = useState<Ad[]>(() => {
    if (initialAds && initialAds.length > 0) return initialAds;
    return clientCache?.ads || [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (initialAds && initialAds.length > 0) return false;
    if (clientCache?.ads && clientCache.ads.length > 0) return false;
    return true;
  });
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
        gender?: string;
      }
    >
  >(() => {
    if (initialProfiles && Object.keys(initialProfiles).length > 0) return initialProfiles;
    return clientCache?.profiles || {};
  });
  const [isMobile, setIsMobile] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAdsRef = useRef<boolean>(ads.length > 0);
  hasAdsRef.current = ads.length > 0;

  useEffect(() => {
    const handleGlobalToast = (e: Event) => {
      const customEvt = e as CustomEvent<{ message?: string }>;
      const msg = customEvt?.detail?.message;
      if (msg) {
        setToastMessage(msg);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
          setToastMessage((current) => (current === msg ? null : current));
        }, 2400);
      }
    };
    window.addEventListener("xea:toast", handleGlobalToast);
    return () => {
      window.removeEventListener("xea:toast", handleGlobalToast);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // 1. Hook: Viewer Profile state & balance management
  const {
    viewerProfile,
    setViewerProfile,
    updateBalance,
    incrementClicks,
    addMutual,
    suspendAccount,
  } = useViewerProfile(userEmail, initialProfile);

  // 2. Hook: Boosted Highlights management & feed interleaving (pre-hydrated on SSR)
  const {
    highlights,
    hasFetched: highlightsFetched,
    fetchHighlights,
    buildDisplayFeed,
  } = useFeedHighlights(isMobile, initialHighlights);

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

  const existingAdIds = useMemo(() => ads.map((a) => String(a.id)), [ads]);

  // 4. Hook: Real-Time Webhook SSE & Realtime Feed Updates
  const { pendingCount, clearPending, consumePendingAds } = useLiveFeedUpdates({
    userInterests: viewerProfile?.interest || initialProfile?.interest,
    userEmail,
    viewerProfile: (viewerProfile || initialProfile) as any,
    existingAdIds,
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

  // Fetch highlights when mobile if not already SSR-hydrated
  useEffect(() => {
    if (userEmail && isMobile && !highlightsFetched && highlights.length === 0) {
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
  }, [userEmail, isMobile, highlightsFetched, highlights.length, viewerProfile?.interest, initialProfile?.interest, fetchHighlights]);

  // Paginated Feed Fetcher
  const fetchRelevantAds = useCallback(
    async (pageNum: number, isLoadMore = false, isSilentRefresh = false) => {
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        if (!isSilentRefresh && !hasAdsRef.current) {
          setLoading(true);
        }
        setPage(0);
        if (!isSilentRefresh) {
          setSeenAds([]);
        }
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
        const isExplicitRefresh = (window as any).__xea_force_refresh === true;
        if (isExplicitRefresh && typeof window !== "undefined") {
          delete (window as any).__xea_force_refresh;
        }
        const refreshParam = isExplicitRefresh ? "&refresh=true" : "";
        const headers: Record<string, string> = {};
        if (userEmail) {
          headers["x-user-email"] = userEmail;
        }
        const fetchUrl = `/api/feed?offset=${offset}&limit=${LIMIT}${refreshParam}${sharedAdParam}`;
        let response = await fetch(fetchUrl, { headers });

        // Resilient progressive retry for initial feed load (e.g. serverless cold starts)
        if (!response.ok && pageNum === 0 && !isLoadMore) {
          console.warn("⚠️ Feed initial fetch non-OK status:", response.status, "- Retrying with warm cache...");
          await new Promise((r) => setTimeout(r, 1000));
          response = await fetch(fetchUrl, { headers });

          if (!response.ok) {
            await new Promise((r) => setTimeout(r, 2000));
            response = await fetch(fetchUrl, { headers });
          }
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch ad feed (Status: ${response.status})`);
        }
        const data = await response.json();
        const feedAds: Ad[] = data.ads || [];
        const profilesMap = data.profiles || {};

        if (Object.keys(profilesMap).length > 0) {
          setAdvertiserProfiles((prev) => {
            const merged = { ...prev, ...profilesMap };
            if (!isLoadMore && typeof window !== "undefined" && userEmail && feedAds.length > 0) {
              try {
                sessionStorage.setItem(
                  `paayh_feed_cache_${userEmail.toLowerCase().trim()}`,
                  JSON.stringify({ ads: feedAds.slice(0, 15), profiles: merged, timestamp: Date.now() })
                );
              } catch {}
            }
            return merged;
          });
        } else if (!isLoadMore && typeof window !== "undefined" && userEmail && feedAds.length > 0) {
          try {
            sessionStorage.setItem(
              `paayh_feed_cache_${userEmail.toLowerCase().trim()}`,
              JSON.stringify({ ads: feedAds.slice(0, 15), profiles: {}, timestamp: Date.now() })
            );
          } catch {}
        }

        setHasMore(feedAds.length >= LIMIT);
        setAds((prev) => {
          if (!isLoadMore) {
            if (isSilentRefresh && prev.length > 0) {
              const incomingIds = new Set(feedAds.map((a) => a.id));
              const remainingExisting = prev.filter((a) => !incomingIds.has(a.id));
              return [...feedAds, ...remainingExisting];
            }
            return feedAds;
          }
          const existingIds = new Set(prev.map((a) => a.id));
          const newUnique = feedAds.filter((a) => !existingIds.has(a.id));
          return [...prev, ...newUnique];
        });
      } catch (err) {
        console.error("❌ Error loading feed:", err);
        if (!hasAdsRef.current) {
          setError(true);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [userEmail, setSeenAds]
  );

  // Persist SSR-preloaded initialAds into sessionStorage so subsequent tab switches are 0ms
  useEffect(() => {
    if (initialAds && initialAds.length > 0 && typeof window !== "undefined" && userEmail) {
      try {
        sessionStorage.setItem(
          `paayh_feed_cache_${userEmail.toLowerCase().trim()}`,
          JSON.stringify({
            ads: initialAds.slice(0, 15),
            profiles: initialProfiles || {},
            timestamp: Date.now(),
          })
        );
      } catch {}
    }
  }, [initialAds, initialProfiles, userEmail]);

  useEffect(() => {
    if (!initialAds || initialAds.length === 0) {
      // If we hydrated synchronously from sessionStorage, revalidate silently in the background without spinner
      const hasWarmClientCache = Boolean(clientCache?.ads && clientCache.ads.length > 0);
      fetchRelevantAds(0, false, hasWarmClientCache);
    }
  }, [fetchRelevantAds, initialAds, clientCache]);

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
    overscan: 5,
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
    const { ads: droppedAds, profiles: droppedProfiles } = consumePendingAds();
    clearPending();

    const scrollEl = parentRef.current?.parentElement || (typeof window !== "undefined" ? window : null);
    if (scrollEl && "scrollTo" in scrollEl) {
      scrollEl.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (droppedAds.length > 0) {
      if (Object.keys(droppedProfiles).length > 0) {
        setAdvertiserProfiles((prev) => ({ ...prev, ...(droppedProfiles as any) }));
      }
      setAds((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const uniqueDropped = droppedAds.filter((a) => !existingIds.has(a.id)) as unknown as Ad[];
        return [...uniqueDropped, ...prev];
      });
      // If any dropped ad came via Supabase Realtime fallback without an HMAC token, silently hydrate in background
      if (droppedAds.some((a) => !a.verification_token && !(a as any)._token)) {
        if (typeof window !== "undefined") {
          (window as any).__xea_force_refresh = true;
        }
        fetchRelevantAds(0, false, true);
      }
      return;
    }

    if (typeof window !== "undefined") {
      (window as any).__xea_force_refresh = true;
    }
    fetchRelevantAds(0, false, true);
  }, [consumePendingAds, clearPending, fetchRelevantAds]);

  // Drag Pull-to-Refresh
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const isPullingRef = useRef(false);
  const isPullRefreshingRef = useRef(false);
  isPullRefreshingRef.current = isPullRefreshing;

  useEffect(() => {
    const scrollEl = parentRef.current?.parentElement || parentRef.current;
    if (!scrollEl) return;

    const onTouchStart = (e: TouchEvent) => {
      if (scrollEl.scrollTop <= 2 && !isPullRefreshingRef.current) {
        pullStartY.current = e.touches[0].clientY;
        isPullingRef.current = true;
      } else {
        isPullingRef.current = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isPullRefreshingRef.current) return;
      if (scrollEl.scrollTop > 2) {
        isPullingRef.current = false;
        setPullDistance(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const deltaY = currentY - pullStartY.current;

      if (deltaY > 0) {
        // Damped logarithmic curve for smooth native elastic resistance
        const pull = Math.min(Math.pow(deltaY, 0.82) * 2.2, 90);
        setPullDistance(pull);
        if (deltaY > 10 && e.cancelable) {
          e.preventDefault();
        }
      } else {
        setPullDistance(0);
      }
    };

    const onTouchEnd = async () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;

      setPullDistance((currentPull) => {
        if (currentPull >= 55 && !isPullRefreshingRef.current) {
          setIsPullRefreshing(true);
          if (typeof window !== "undefined") {
            (window as any).__xea_force_refresh = true;
          }
          fetchRelevantAds(0, false, true).finally(() => {
            setIsPullRefreshing(false);
            setPullDistance(0);
          });
          return 45; // Hold at active spinner position
        }
        return 0;
      });
    };

    scrollEl.addEventListener("touchstart", onTouchStart, { passive: true });
    scrollEl.addEventListener("touchmove", onTouchMove, { passive: false });
    scrollEl.addEventListener("touchend", onTouchEnd, { passive: true });
    scrollEl.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      scrollEl.removeEventListener("touchstart", onTouchStart);
      scrollEl.removeEventListener("touchmove", onTouchMove);
      scrollEl.removeEventListener("touchend", onTouchEnd);
      scrollEl.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [fetchRelevantAds]);

  return (
    <div ref={parentRef} className={styles.feedContainer}>
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || isPullRefreshing) && (
        <div
          className={styles.pullIndicator}
          style={{
            transform: `translate3d(-50%, ${Math.min(pullDistance, 70)}px, 0)`,
            opacity: isPullRefreshing ? 1 : Math.min(pullDistance / 35, 1),
            transition: isPullingRef.current
              ? "none"
              : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease",
          }}
          aria-hidden="true"
        >
          <div className={styles.pullBubble}>
            {isPullRefreshing ? (
              <div className={styles.pullSpinner} />
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: `rotate(${Math.min(pullDistance * 4.5, 360)}deg)`,
                  transition: isPullingRef.current ? "none" : "transform 0.2s ease",
                }}
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            )}
          </div>
        </div>
      )}
      <NewPostsPill count={pendingCount} onClick={handlePillClick} />
      {loading && <FeedSkeleton count={3} />}
      {!loading && error && (
        <div className={styles.errorContainer}>
          <p className={`${styles.error} ${styles.errorMessage}`}>Unable to load ads right now.</p>
          <button
            onClick={() => fetchRelevantAds(0, false)}
            className={`${styles.loadMoreBtn} ${styles.errorRetryBtn}`}
          >
            Try Again
          </button>
        </div>
      )}
      {!loading && !error && ads.length === 0 && (
        <p className={styles.noAds}>No matching ads found for your profile.</p>
      )}

      {!loading && !error && displayFeed.length > 0 && (
        <div
          className={styles.adGrid}
          style={{
            height: `${virtualizer.getTotalSize()}px`,
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
                className={styles.virtualRow}
                style={{
                  transform: `translate3d(0, ${Math.round(virtualRow.start)}px, 0)`,
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

      {toastMessage && (
        <div className={adCardStyles.toastHud} role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default Feed;