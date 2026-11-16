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
  FeedSharedAdBanner,
  FeedSharedAdUnavailableState,
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
  decodeSharedAdParam,
  extractSharedAdIdFromSearchParams,
} from "@/lib/utils/adShare";
import { toClientFriendlyError } from "@/lib/utils/clientError";

interface FeedProps {
  userEmail: string;
  initialProfile?: InitialProfileInput;
  initialAds?: Ad[];
  initialProfiles?: Record<string, any>;
  initialHighlights?: any[];
  initialHighlightProfiles?: Record<string, any>;
  initialSharedAdId?: string | null;
  initialSharedAdUnavailable?: boolean;
  initialSharedAd?: Ad | null;
  initialSharedAdProfiles?: Record<string, any>;
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

const Feed = ({
  userEmail,
  initialProfile,
  initialAds,
  initialProfiles,
  initialHighlights,
  initialHighlightProfiles,
  initialSharedAdId,
  initialSharedAdUnavailable,
  initialSharedAd,
  initialSharedAdProfiles,
  onEarnSuccess,
  onMutualSuccess,
}: FeedProps) => {
  const ssrSharedAdId = decodeSharedAdParam(initialSharedAdId) || null;
  const ssrSharedUnavailable = Boolean(initialSharedAdUnavailable);
  const hasSsrSharedAd = Boolean(
    ssrSharedAdId &&
      initialSharedAd &&
      String(initialSharedAd.id || "").toLowerCase() === ssrSharedAdId.toLowerCase()
  );
  const [activeSharedAdId, setActiveSharedAdId] = useState<string | null>(ssrSharedAdId);
  const [sharedAdUnavailable, setSharedAdUnavailable] = useState<boolean>(ssrSharedUnavailable);
  const [isClientMounted, setIsClientMounted] = useState(false);
  const isSharedAdMode = Boolean(activeSharedAdId || sharedAdUnavailable);
  const activeSharedAdIdRef = useRef<string | null>(activeSharedAdId);
  activeSharedAdIdRef.current = activeSharedAdId;

  const [ads, setAds] = useState<Ad[]>(() => {
    if (hasSsrSharedAd && initialSharedAd) return [initialSharedAd];
    if (ssrSharedAdId || ssrSharedUnavailable) return [];
    if (initialAds && initialAds.length > 0) return initialAds;
    return [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (ssrSharedUnavailable) return false;
    if (hasSsrSharedAd) return false;
    if (ssrSharedAdId) return true;
    if (initialAds && initialAds.length > 0) return false;
    return true;
  });
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(() => !(ssrSharedAdId || ssrSharedUnavailable));
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
        is_career?: boolean;
        is_affiliate?: boolean;
        affiliate_role?: string | null;
        isExemptFromBarriersAndInactivity?: boolean;
      }
    >
  >(() => {
    if (hasSsrSharedAd && initialSharedAdProfiles && Object.keys(initialSharedAdProfiles).length > 0) {
      return initialSharedAdProfiles;
    }
    const mergedInitial = {
      ...(initialHighlightProfiles || {}),
      ...(initialProfiles || {}),
    };
    if (Object.keys(mergedInitial).length > 0) return mergedInitial;
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
    setIsClientMounted(true);
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const urlSharedId = extractSharedAdIdFromSearchParams(url.searchParams);
      const adStatus = url.searchParams.get("adStatus");

      if (adStatus === "unavailable" || ssrSharedUnavailable) {
        activeSharedAdIdRef.current = null;
        setActiveSharedAdId(null);
        setSharedAdUnavailable(true);
        setAds([]);
        setLoading(false);
        setHasMore(false);
        localStorage.removeItem("sharedAdId");
        showTimedToast(AD_UNAVAILABLE_MESSAGE, AD_UNAVAILABLE_DISMISS_MS);
        return;
      }

      const clientFallbackId =
        urlSharedId || ssrSharedAdId || decodeSharedAdParam(localStorage.getItem("sharedAdId"));
      if (clientFallbackId) {
        activeSharedAdIdRef.current = clientFallbackId;
        setActiveSharedAdId(clientFallbackId);
        setSharedAdUnavailable(false);
        setHasMore(false);
      }
    } catch {}
  }, [showTimedToast, ssrSharedAdId, ssrSharedUnavailable]);

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
    highlightProfiles,
    hasFetched: highlightsFetched,
    fetchHighlights,
    buildDisplayFeed,
  } = useFeedHighlights(isMobile, initialHighlights, initialHighlightProfiles);

  const mergedAdvertiserProfiles = useMemo(
    () => ({
      ...highlightProfiles,
      ...advertiserProfiles,
    }),
    [highlightProfiles, advertiserProfiles]
  );

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
    if (!isSharedAdMode && userEmail && isMobile && !highlightsFetched && highlights.length === 0) {
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
  }, [isSharedAdMode, userEmail, isMobile, highlightsFetched, highlights.length, viewerProfile?.interest, initialProfile?.interest, fetchHighlights]);

  // Paginated Feed Fetcher
  const fetchRelevantAds = useCallback(
    async (pageNum: number, isLoadMore = false, isSilentRefresh = false, overrideSharedAdId?: string | null) => {
      let targetSharedId: string | null = null;
      if (overrideSharedAdId !== undefined) {
        targetSharedId = overrideSharedAdId;
      } else {
        targetSharedId = activeSharedAdIdRef.current;
        if (!targetSharedId && !isLoadMore && typeof window !== "undefined") {
          try {
            targetSharedId = decodeSharedAdParam(localStorage.getItem("sharedAdId"));
          } catch {}
        }
      }

      if (targetSharedId && isLoadMore) {
        setLoadingMore(false);
        setHasMore(false);
        return;
      }

      const isExplicitRefresh = typeof window !== "undefined" && (window as any).__xea_force_refresh === true;
      const requestKey = `${userEmail || ""}:${pageNum}:${targetSharedId ? `shared:${targetSharedId}` : "feed"}:${isExplicitRefresh ? "refresh" : "std"}`;
      if (!isExplicitRefresh && inFlightFeedKeyRef.current === requestKey) {
        return;
      }
      inFlightFeedKeyRef.current = requestKey;

      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        if (targetSharedId || (!isSilentRefresh && !hasAdsRef.current)) {
          setLoading(true);
        }
        setPage(0);
        if (!isSilentRefresh || targetSharedId) {
          setSeenAds([]);
        }
      }
      setError(false);

      try {
        const normalizedTarget = targetSharedId
          ? decodeSharedAdParam(targetSharedId) || String(targetSharedId).trim()
          : null;
        let sharedAdParam = "";
        if (normalizedTarget && !isLoadMore) {
          sharedAdParam = `&sharedAdId=${encodeURIComponent(normalizedTarget)}`;
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

        // Resilient progressive retry ONLY for transient 5xx / timeout responses (fail fast on 4xx auth/validation)
        if (
          !response.ok &&
          pageNum === 0 &&
          !isLoadMore &&
          (response.status >= 500 || response.status === 408 || response.status === 429)
        ) {
          console.warn("⚠️  Feed initial fetch transient status:", response.status, "- Retrying...");
          await new Promise((r) => setTimeout(r, 900));
          response = await fetch(fetchUrl, { headers, credentials: "same-origin" });

          if (!response.ok && (response.status >= 500 || response.status === 408 || response.status === 429)) {
            await new Promise((r) => setTimeout(r, 1600));
            response = await fetch(fetchUrl, { headers, credentials: "same-origin" });
          }
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch ad feed (Status: ${response.status})`);
        }
        const data = await response.json();
        const feedAds: Ad[] = data.ads || [];
        const profilesMap = data.profiles || {};

        if (normalizedTarget) {
          const matched = feedAds
            .filter((a) => String(a?.id || "").toLowerCase() === String(normalizedTarget).toLowerCase())
            .slice(0, 1);
          if (Object.keys(profilesMap).length > 0) {
            setAdvertiserProfiles((prev) => ({ ...prev, ...profilesMap }));
          }
          setHasMore(false);
          if (typeof window !== "undefined") {
            try {
              localStorage.removeItem("sharedAdId");
            } catch {}
          }
          if (data?.sharedAdUnavailable || matched.length === 0) {
            setSharedAdUnavailable(true);
            setAds([]);
            showTimedToast(AD_UNAVAILABLE_MESSAGE, AD_UNAVAILABLE_DISMISS_MS);
          } else {
            activeSharedAdIdRef.current = String(matched[0].id);
            setActiveSharedAdId(String(matched[0].id));
            setSharedAdUnavailable(false);
            setAds(matched);
          }
          return;
        }

        if (data?.sharedAdUnavailable && !isLoadMore) {
          showTimedToast(AD_UNAVAILABLE_MESSAGE, AD_UNAVAILABLE_DISMISS_MS);
        }

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
          setAdvertiserProfiles((prev) => {
            try {
              sessionStorage.setItem(
                `paayh_feed_cache_${userEmail.toLowerCase().trim()}`,
                JSON.stringify({ ads: feedAds.slice(0, 15), profiles: prev, timestamp: Date.now() })
              );
            } catch {}
            return prev;
          });
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

  const exitSharedAdMode = useCallback(() => {
    activeSharedAdIdRef.current = null;
    setActiveSharedAdId(null);
    setSharedAdUnavailable(false);
    setHasMore(true);
    setLoading(true);
    try {
      localStorage.removeItem("sharedAdId");
      const url = new URL(window.location.href);
      url.searchParams.delete("sharedAdId");
      url.searchParams.delete("ad");
      url.searchParams.delete("adId");
      url.searchParams.delete("adStatus");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    } catch {}
    fetchRelevantAdsRef.current?.(0, false, false, null);
  }, []);

  // Persist SSR-preloaded initialAds into sessionStorage so subsequent tab switches are 0ms
  useEffect(() => {
    if (isSharedAdMode) return;
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
  }, [isSharedAdMode, initialAds, initialProfiles, userEmail]);

  useEffect(() => {
    let urlSharedId: string | null = null;
    let urlUnavailable = false;
    if (typeof window !== "undefined") {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        urlUnavailable = searchParams.get("adStatus") === "unavailable";
        urlSharedId =
          extractSharedAdIdFromSearchParams(searchParams) ||
          decodeSharedAdParam(localStorage.getItem("sharedAdId"));
      } catch {}
    }
    const targetId = activeSharedAdIdRef.current || ssrSharedAdId || urlSharedId;

    if (urlUnavailable || sharedAdUnavailable) {
      setLoading(false);
      return;
    }

    if (targetId) {
      if (
        hasSsrSharedAd &&
        initialSharedAd &&
        String(initialSharedAd.id || "").toLowerCase() === String(targetId).toLowerCase()
      ) {
        if (typeof window !== "undefined") {
          try {
            localStorage.removeItem("sharedAdId");
          } catch {}
        }
        setLoading(false);
        return;
      }
      setLoading(true);
      fetchRelevantAds(0, false, false, targetId);
      return;
    }

    // Warm up FullscreenVideoPlayer chunk during idle time so first video click opens cleanly
    let preloadTimer: ReturnType<typeof setTimeout> | null = null;
    preloadTimer = setTimeout(() => {
      void import("@/components/MyAds/FullscreenVideoPlayer").catch(() => {});
    }, 350);

    if (!initialAds || initialAds.length === 0) {
      const cached = readFeedClientCache(userEmail);
      if (cached && cached.ads.length > 0) {
        if (Object.keys(cached.profiles).length > 0) {
          setAdvertiserProfiles((prev) => ({ ...cached.profiles, ...prev }));
        }
        hasAdsRef.current = true;
        setAds(cached.ads);
        setLoading(false);
        fetchRelevantAds(0, false, true);
      } else {
        // Keep skeleton loading active while verifying fresh feed to prevent ghost ad flashes
        setLoading(true);
        fetchRelevantAds(0, false, false);
      }
    }

    return () => {
      if (preloadTimer) clearTimeout(preloadTimer);
    };
  }, [fetchRelevantAds, initialAds, sharedAdUnavailable, userEmail, ssrSharedAdId, hasSsrSharedAd, initialSharedAd]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore || isSharedAdMode) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRelevantAds(nextPage, true);
  }, [loading, loadingMore, hasMore, isSharedAdMode, page, fetchRelevantAds]);

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
    if (sharedAdUnavailable) return [];
    if (activeSharedAdId) {
      return ads
        .filter((item) => item?.id && String(item.id).toLowerCase() === String(activeSharedAdId).toLowerCase())
        .slice(0, 1);
    }
    if (locationSkipped) return [];
    const rawFeed = buildDisplayFeed(ads);
    const seen = new Set<string>();
    return rawFeed.filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [ads, activeSharedAdId, sharedAdUnavailable, buildDisplayFeed, locationSkipped]);

  const virtualizer = useVirtualizer({
    count: displayFeed.length,
    getScrollElement: () => parentRef.current?.parentElement || null,
    estimateSize: () => 500,
    getItemKey: useCallback((index: number) => displayFeed[index]?.id || `feed-item-${index}`, [displayFeed]),
    overscan: 3,
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
  const visibleStartIndex = virtualItems[0]?.index ?? -1;
  const visibleEndIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;

  // Capped lightweight metadata pre-warmer: warms headers (moov atom / duration) for up to 2 nearby
  // videos without competing with active playback bandwidth or leaking detached media decoders.
  // Keyed on primitive visible index bounds so state updates do not tear down in-flight probes.
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      displayFeed.length === 0 ||
      visibleStartIndex < 0 ||
      visibleEndIndex < 0
    ) {
      return;
    }

    const prewarmed: Set<string> = (window as any).__xea_prewarmed_videos || new Set<string>();
    (window as any).__xea_prewarmed_videos = prewarmed;

    const upwardStart = Math.max(0, visibleStartIndex - 1);
    const upwardEnd = visibleStartIndex;
    const downwardStart = visibleEndIndex + 1;
    const downwardEnd = Math.min(displayFeed.length, visibleEndIndex + 4);

    const itemsToPrewarm = [
      ...displayFeed.slice(downwardStart, downwardEnd),
      ...displayFeed.slice(upwardStart, upwardEnd),
    ];

    const activeProbes: HTMLVideoElement[] = [];
    const probeTimers: ReturnType<typeof setTimeout>[] = [];
    const MAX_CONCURRENT_VIDEO_PROBES = 2;

    const releaseProbe = (probe: HTMLVideoElement) => {
      try {
        probe.onloadedmetadata = null;
        probe.onerror = null;
        probe.removeAttribute("src");
        probe.load();
      } catch {}
    };

    const prewarmVideos = () => {
      const candidateUrls: string[] = [];
      for (const item of itemsToPrewarm) {
        if (!item?.ad_media) continue;
        const urls = item.ad_media.split(",").map((u: string) => u.trim());
        for (const url of urls) {
          if (!url || prewarmed.has(url)) continue;
          if (isVideoUrl(url) && !url.includes(".m3u8")) {
            candidateUrls.push(url);
            if (candidateUrls.length >= MAX_CONCURRENT_VIDEO_PROBES) break;
          }
        }
        if (candidateUrls.length >= MAX_CONCURRENT_VIDEO_PROBES) break;
      }

      candidateUrls.forEach((url) => {
        try {
          const probe = document.createElement("video");
          probe.preload = "metadata";
          probe.muted = true;
          probe.playsInline = true;
          activeProbes.push(probe);
          const done = (markComplete: boolean) => {
            if (markComplete) prewarmed.add(url);
            releaseProbe(probe);
          };
          probe.onloadedmetadata = () => done(true);
          probe.onerror = () => done(true);
          probe.src = url;
          probe.load();
          probeTimers.push(setTimeout(() => done(false), 4000));
        } catch {}
      });
    };

    let idleHandle: any = null;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    if ("requestIdleCallback" in window) {
      idleHandle = (window as any).requestIdleCallback(prewarmVideos, { timeout: 600 });
    } else {
      startTimer = setTimeout(prewarmVideos, 200);
    }

    return () => {
      if (idleHandle !== null && "cancelIdleCallback" in window) {
        (window as any).cancelIdleCallback(idleHandle);
      }
      if (startTimer) clearTimeout(startTimer);
      probeTimers.forEach(clearTimeout);
      activeProbes.forEach(releaseProbe);
    };
  }, [visibleStartIndex, visibleEndIndex, displayFeed]);

  useEffect(() => {
    if (visibleEndIndex >= 0 && hasMore && !loadingMore && !loading) {
      if (visibleEndIndex >= displayFeed.length - 4) {
        loadMore();
      }
    }
  }, [visibleEndIndex, hasMore, loadingMore, loading, displayFeed.length, loadMore]);

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
      {isClientMounted && isSharedAdMode && <FeedSharedAdBanner onExit={exitSharedAdMode} />}
      {!locationSkipped && !isSharedAdMode && <NewPostsPill count={pendingCount} onClick={handlePillClick} />}
      {loading && <FeedSkeleton count={isSharedAdMode ? 1 : 3} />}
      {!loading && error && <FeedErrorState onRetry={() => fetchRelevantAds(0, false)} />}
      {!loading && !error && !isSharedAdMode && locationSkipped && <FeedLocationSkippedState />}
      {!loading && !error && isClientMounted && sharedAdUnavailable && (
        <FeedSharedAdUnavailableState onBrowseFeed={exitSharedAdMode} />
      )}
      {!loading && !error && !locationSkipped && !sharedAdUnavailable && ads.length === 0 && (
        <FeedEmptyInventoryState />
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
                  advertiserProfiles={mergedAdvertiserProfiles}
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