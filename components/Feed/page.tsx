"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import styles from "../Feed/page.module.css";
import adCardStyles from "../ui/AdCard.module.css";
import { useVirtualizer } from "@tanstack/react-virtual";
import AdCard, { type Ad } from "../ui/AdCard";
import type { AdReportType } from "../ui/AdOptionsMenu";
import {
  FeedPullIndicator,
  FeedErrorState,
  FeedLocationSkippedState,
  FeedEmptyInventoryState,
  FeedScrollTopButton,
} from "./FeedStateViews";
import { useFeedPullToRefresh } from "./useFeedPullToRefresh";
import { isVideoUrl } from "../ui/MediaCarousel";
import Skeleton from "../ui/Skeleton";
import FeedSkeleton from "../ui/FeedSkeleton";
import NewPostsPill from "../ui/NewPostsPill";
import { useViewerProfile, InitialProfileInput } from "@/lib/hooks/useViewerProfile";
import { useFeedHighlights } from "@/lib/hooks/useFeedHighlights";
import { useFeedActions } from "@/lib/hooks/useFeedActions";
import { useLiveFeedUpdates } from "@/lib/hooks/useLiveFeedUpdates";
import {
  AD_UNAVAILABLE_DISMISS_MS,
  AD_UNAVAILABLE_MESSAGE,
  extractSharedAdIdFromSearchParams,
} from "@/lib/utils/adShare";
import { toClientFriendlyError } from "@/lib/utils/clientError";

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
    // Ignore stale cache older than 5 minutes to prevent ghost ad flashes
    if (parsed?.timestamp && Date.now() - parsed.timestamp > 5 * 60 * 1000) {
      return null;
    }
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
  const [ads, setAds] = useState<Ad[]>(() => {
    if (initialAds && initialAds.length > 0) return initialAds;
    return [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (initialAds && initialAds.length > 0) return false;
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
    return {};
  });
  const [isMobile, setIsMobile] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Location skipped ("Skip for now" in Proof of Location): sponsored content is hidden and an
  // Enable Location card is shown, since ads are geo-targeted and payouts require proof of location.
  const [locationSkipped, setLocationSkipped] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        return sessionStorage.getItem("paayh_location_skipped") === "true";
      } catch {}
    }
    return false;
  });
  const hasAdsRef = useRef<boolean>(ads.length > 0);
  hasAdsRef.current = ads.length > 0;
  const inFlightFeedKeyRef = useRef<string | null>(null);

  const showTimedToast = useCallback((msg: string, durationMs = 2400) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, durationMs);
  }, []);

  useEffect(() => {
    const handleGlobalToast = (e: Event) => {
      const customEvt = e as CustomEvent<{ message?: string; durationMs?: number }>;
      const msg = customEvt?.detail?.message;
      if (msg) {
        showTimedToast(msg, customEvt?.detail?.durationMs ?? 2400);
      }
    };
    window.addEventListener("xea:toast", handleGlobalToast);
    return () => {
      window.removeEventListener("xea:toast", handleGlobalToast);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [showTimedToast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const urlSharedId = extractSharedAdIdFromSearchParams(url.searchParams);
      const adStatus = url.searchParams.get("adStatus");
      let urlChanged = false;

      if (urlSharedId) {
        localStorage.setItem("sharedAdId", urlSharedId);
        url.searchParams.delete("sharedAdId");
        url.searchParams.delete("adId");
        url.searchParams.delete("blurb");
        url.searchParams.delete("Earn Ads by Paayh");
        urlChanged = true;
      }

      if (adStatus === "unavailable") {
        localStorage.removeItem("sharedAdId");
        url.searchParams.delete("adStatus");
        urlChanged = true;
        showTimedToast(AD_UNAVAILABLE_MESSAGE, AD_UNAVAILABLE_DISMISS_MS);
      }

      if (urlChanged) {
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
    } catch {}
  }, [showTimedToast]);

  useEffect(() => {
    try {
      setLocationSkipped(sessionStorage.getItem("paayh_location_skipped") === "true");
    } catch {}
    const onSkipped = () => setLocationSkipped(true);
    const onVerified = () => {
      setLocationSkipped(false);
      if (typeof window !== "undefined") (window as any).__xea_force_refresh = true;
      fetchRelevantAdsRef.current?.(0, false, false);
    };
    window.addEventListener("paayh:location_skipped", onSkipped);
    window.addEventListener("paayh:location_verified", onVerified);
    return () => {
      window.removeEventListener("paayh:location_skipped", onSkipped);
      window.removeEventListener("paayh:location_verified", onVerified);
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
      const isExplicitRefresh = typeof window !== "undefined" && (window as any).__xea_force_refresh === true;
      const requestKey = `${userEmail || ""}:${pageNum}:${isExplicitRefresh ? "refresh" : "std"}`;
      if (!isExplicitRefresh && inFlightFeedKeyRef.current === requestKey) {
        return;
      }
      inFlightFeedKeyRef.current = requestKey;

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
        if (isExplicitRefresh && typeof window !== "undefined") {
          delete (window as any).__xea_force_refresh;
        }
        const refreshParam = isExplicitRefresh ? "&refresh=true" : "";
        const headers: Record<string, string> = {};
        if (userEmail) {
          headers["x-user-email"] = userEmail;
        }
        const fetchUrl = `/api/feed?offset=${offset}&limit=${LIMIT}${refreshParam}${sharedAdParam}`;
        let response = await fetch(fetchUrl, { headers, credentials: "same-origin" });

        // Resilient progressive retry for initial feed load (e.g. serverless cold starts)
        if (!response.ok && pageNum === 0 && !isLoadMore) {
          console.warn("âš ï¸ Feed initial fetch non-OK status:", response.status, "- Retrying with warm cache...");
          await new Promise((r) => setTimeout(r, 1000));
          response = await fetch(fetchUrl, { headers, credentials: "same-origin" });

          if (!response.ok) {
            await new Promise((r) => setTimeout(r, 2000));
            response = await fetch(fetchUrl, { headers, credentials: "same-origin" });
          }
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch ad feed (Status: ${response.status})`);
        }
        const data = await response.json();
        if (data?.sharedAdUnavailable && !isLoadMore) {
          showTimedToast(AD_UNAVAILABLE_MESSAGE, AD_UNAVAILABLE_DISMISS_MS);
        }
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
            // If server returned 0 ads on any non-explicit background check, preserve existing visible feed so ads never suddenly vanish
            if (feedAds.length === 0 && prev.length > 0 && !isExplicitRefresh) {
              return prev;
            }
            if (isSilentRefresh && prev.length > 0) {
              const incomingIds = new Set(feedAds.map((a) => a.id));
              const remainingExisting = prev.filter((a) => !incomingIds.has(a.id));
              return [...feedAds, ...remainingExisting];
            }
            return feedAds;
          }
          const existingIds = new Set(prev.map((a) => a.id));
          const newUnique = feedAds.filter((a) => !existingIds.has(a.id));
          // Inventory exhausted: the server only returned ads already on screen. Stop paginating,
          // otherwise infinite scroll keeps re-requesting the same campaigns forever.
          if (newUnique.length === 0) setHasMore(false);
          return [...prev, ...newUnique];
        });
      } catch (err) {
        console.error("âŒ Error loading feed:", err);
        if (!hasAdsRef.current) {
          setError(true);
          showTimedToast(toClientFriendlyError(err, "Try again later"), 3200);
        }
      } finally {
        if (inFlightFeedKeyRef.current === requestKey) {
          inFlightFeedKeyRef.current = null;
        }
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [userEmail, setSeenAds, showTimedToast]
  );
  const fetchRelevantAdsRef = useRef<typeof fetchRelevantAds | null>(null);
  fetchRelevantAdsRef.current = fetchRelevantAds;

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
    let hasSharedAd = false;
    if (typeof window !== "undefined") {
      try {
        hasSharedAd = Boolean(
          localStorage.getItem("sharedAdId") ||
            extractSharedAdIdFromSearchParams(new URLSearchParams(window.location.search))
        );
      } catch {}
    }

    if (!initialAds || initialAds.length === 0) {
      // Keep skeleton loading active while verifying fresh feed to prevent ghost ad flashes
      setLoading(true);
      fetchRelevantAds(0, false, false);
    } else if (hasSharedAd) {
      // Ensure shared deep-link ad is pinned or displays the 5s unavailable notice even when SSR hydrated initialAds
      fetchRelevantAds(0, false, true);
    }
  }, [fetchRelevantAds, initialAds, userEmail]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRelevantAds(nextPage, true);
  }, [loading, loadingMore, hasMore, page, fetchRelevantAds]);

  const handleDismissAd = useCallback(
    (adId: string, advertiserEmail?: string, reportType?: AdReportType) => {
      const normalizedAdv = advertiserEmail?.toLowerCase().trim() || "";
      const shouldFilterAd = (a: Ad) => {
        if (a.id === adId) return false;
        if (
          reportType === "advertiser" &&
          normalizedAdv &&
          (a.user_email || "").toLowerCase().trim() === normalizedAdv
        ) {
          return false;
        }
        return true;
      };

      setAds((prev) => prev.filter(shouldFilterAd));

      if (typeof window !== "undefined" && userEmail) {
        try {
          const cacheKey = `paayh_feed_cache_${userEmail.toLowerCase().trim()}`;
          const raw = sessionStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed?.ads)) {
              sessionStorage.setItem(
                cacheKey,
                JSON.stringify({
                  ...parsed,
                  ads: parsed.ads.filter(shouldFilterAd),
                })
              );
            }
          }
        } catch {}
      }
    },
    [userEmail]
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const displayFeed = useMemo(() => {
    if (locationSkipped) return [];
    const rawFeed = buildDisplayFeed(ads);
    const seen = new Set<string>();
    return rawFeed.filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [ads, buildDisplayFeed, locationSkipped]);

  const virtualizer = useVirtualizer({
    count: displayFeed.length,
    getScrollElement: () => parentRef.current?.parentElement || null,
    estimateSize: () => 500,
    getItemKey: useCallback((index: number) => displayFeed[index]?.id || `feed-item-${index}`, [displayFeed]),
    overscan: 8,
  });

  // Compensate scroll offset only when an item strictly above the viewport resizes
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) =>
    item.start < (instance.scrollOffset ?? 0);

  // Scroll-to-Top button visibility tracking (RAF-throttled passive listener)
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const scrollEl = parentRef.current?.parentElement;
    const target: HTMLElement | Window | null = scrollEl || (typeof window !== "undefined" ? window : null);
    if (!target) return;

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const top =
          scrollEl && scrollEl.scrollTop > 0
            ? scrollEl.scrollTop
            : typeof window !== "undefined"
            ? window.scrollY || document.documentElement.scrollTop || 0
            : 0;
        const shouldShow = top > 360;
        setShowScrollTop((prev) => (prev === shouldShow ? prev : shouldShow));
      });
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    if (scrollEl && typeof window !== "undefined") {
      window.addEventListener("scroll", onScroll, { passive: true });
    }
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (scrollEl && typeof window !== "undefined") {
        window.removeEventListener("scroll", onScroll);
      }
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  const handleScrollToTop = useCallback(() => {
    const scrollEl = parentRef.current?.parentElement;
    if (scrollEl && scrollEl.scrollTop > 0) {
      scrollEl.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const virtualItems = virtualizer.getVirtualItems();

  // Dynamic Symmetrical Bidirectional Headroom Video Pre-warming:
  // Pre-buffers initial chunks of upcoming feed videos in BOTH scroll directions:
  // 1) Forward scroll (downward): 4 items ahead of the current viewport bottom
  // 2) Opposite scroll (upward/back): 4 items ahead of the current viewport top
  useEffect(() => {
    if (typeof window === "undefined" || displayFeed.length === 0 || virtualItems.length === 0) return;

    const prewarmed = (window as any).__xea_prewarmed_videos || new Set<string>();
    (window as any).__xea_prewarmed_videos = prewarmed;

    const firstIndex = virtualItems[0].index;
    const lastIndex = virtualItems[virtualItems.length - 1].index;

    // Symmetrical bidirectional window: 4 items above (opposite scroll) and 4 items below (forward scroll)
    const upwardStart = Math.max(0, firstIndex - 4);
    const upwardEnd = firstIndex;
    const downwardStart = lastIndex;
    const downwardEnd = Math.min(displayFeed.length, lastIndex + 5);

    const itemsToPrewarm = [
      ...displayFeed.slice(upwardStart, upwardEnd),
      ...displayFeed.slice(downwardStart, downwardEnd),
    ];

    const prewarmVideos = () => {
      itemsToPrewarm.forEach((item) => {
        const mediaStr = item.ad_media;
        if (!mediaStr) return;
        const urls = mediaStr.split(",").map((u: string) => u.trim());
        urls.forEach((url: string) => {
          if (!url || prewarmed.has(url)) return;
          if (isVideoUrl(url) || (item.hls_url && url === urls[0])) {
            prewarmed.add(url);
            try {
              const probe = document.createElement("video");
              probe.preload = "auto";
              probe.muted = true;
              probe.playsInline = true;
              probe.src = url;
              probe.load();
            } catch {}
          }
        });
      });
    };

    if ("requestIdleCallback" in window) {
      const handle = (window as any).requestIdleCallback(prewarmVideos, { timeout: 600 });
      return () => (window as any).cancelIdleCallback(handle);
    } else {
      const timer = setTimeout(prewarmVideos, 200);
      return () => clearTimeout(timer);
    }
  }, [virtualItems, displayFeed]);

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

  const handlePullRefresh = useCallback(() => fetchRelevantAds(0, false, true), [fetchRelevantAds]);
  const { pullDistance, isPullRefreshing, isActivelyPulling } = useFeedPullToRefresh(
    parentRef,
    handlePullRefresh
  );

  return (
    <div ref={parentRef} className={styles.feedContainer}>
      <FeedPullIndicator
        pullDistance={pullDistance}
        isPullRefreshing={isPullRefreshing}
        isActivelyPulling={isActivelyPulling}
      />
      {!locationSkipped && <NewPostsPill count={pendingCount} onClick={handlePillClick} />}
      {loading && <FeedSkeleton count={3} />}
      {!loading && error && <FeedErrorState onRetry={() => fetchRelevantAds(0, false)} />}
      {!loading && !error && locationSkipped && <FeedLocationSkippedState />}
      {!loading && !error && !locationSkipped && ads.length === 0 && <FeedEmptyInventoryState />}

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

      <FeedScrollTopButton visible={showScrollTop} onClick={handleScrollToTop} />
    </div>
  );
};

export default Feed;