"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import supabase from "@/lib/utils/db";
import { Ad, AnalyticsSeriesPoint, AnalyticsSummary, Session } from "./types";
import {
  getTotalAdClicks,
  buildFallbackAnalyticsSeries,
  computeFallbackAnalyticsSummary,
} from "./adUtils";
import {
  fetchUserCampaignsShared,
  clearUserCampaignsCache,
  readUserCampaignsSyncCache,
} from "@/lib/campaignsClient";
import { NoticeModalData } from "./NoticeModal";

export type FilterTab = "all" | "active" | "review" | "approved" | "paused" | "completed";
export type SortOption = "newest" | "views" | "clicks" | "bid";

export const ADS_PER_PAGE = 10;

function mergeUniqueById(existing: Ad[], incoming: Ad[]): Ad[] {
  if (!incoming || incoming.length === 0) return existing;
  const map = new Map<string, Ad>();
  for (const item of existing) map.set(String(item.id), item);
  for (const item of incoming) map.set(String(item.id), item);
  return Array.from(map.values());
}

export function useMyAdsDashboard(session: Session) {
  const [initialCached] = useState(() => readUserCampaignsSyncCache(session?.user?.email));

  const [reviewAds, setReviewAds] = useState<Ad[]>(() => initialCached?.adsQueue || []);
  const [activeAds, setActiveAds] = useState<Ad[]>(() => initialCached?.adsActive || []);
  const [activeAdsPage, setActiveAdsPage] = useState<number>(1);
  const [reviewAdsPage, setReviewAdsPage] = useState<number>(1);

  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(
    () => initialCached?.adsNextCursor ?? initialCached?.nextCursor ?? null
  );
  const [hasMore, setHasMore] = useState<boolean>(
    () => Boolean(initialCached?.adsHasMore ?? initialCached?.hasMore)
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [timeNow, setTimeNow] = useState(Date.now());

  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const [reportsMap, setReportsMap] = useState<Record<string, number>>(() => initialCached?.reportsMap || {});
  const [dismissalsMap, setDismissalsMap] = useState<Record<string, number>>(() => initialCached?.dismissalsMap || {});
  const [advertiserBlockCount, setAdvertiserBlockCount] = useState<number>(() => initialCached?.advertiserBlockCount || 0);
  const [apiAnalyticsSeries, setApiAnalyticsSeries] = useState<AnalyticsSeriesPoint[] | null>(
    () => (Array.isArray(initialCached?.analyticsSeries) ? initialCached.analyticsSeries : null)
  );
  const [apiAnalyticsSummary, setApiAnalyticsSummary] = useState<AnalyticsSummary | null>(
    () => (initialCached?.analyticsSummary && typeof initialCached.analyticsSummary === "object" ? initialCached.analyticsSummary : null)
  );
  const [adAnalyticsMap, setAdAnalyticsMap] = useState<Record<string, AnalyticsSeriesPoint[]>>(
    () => (initialCached?.adAnalyticsMap && typeof initialCached.adAnalyticsMap === "object" ? initialCached.adAnalyticsMap : {})
  );
  const [autoRefreshOverride, setAutoRefreshOverride] = useState<boolean | null>(null);

  const [expandedSpecsMap, setExpandedSpecsMap] = useState<Record<string, boolean>>({});
  const [boosterAd, setBoosterAd] = useState<Ad | null>(null);
  const [publishingAd, setPublishingAd] = useState<Ad | null>(null);
  const [userWalletBalance, setUserWalletBalance] = useState<number>(0);
  const [noticeModal, setNoticeModal] = useState<NoticeModalData | null>(null);
  const [ratingAdId, setRatingAdId] = useState<string | null>(null);
  const [ratedAdIds, setRatedAdIds] = useState<Set<string>>(() => {
    const initialSet = new Set<string>(Array.isArray(initialCached?.ratedAdIds) ? initialCached.ratedAdIds : []);
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("paayh_rated_ad_ids");
        if (stored) {
          for (const id of JSON.parse(stored)) initialSet.add(id);
        }
      } catch {}
    }
    return initialSet;
  });

  const isFetchingRef = useRef(false);
  const inFlightActionRef = useRef<Set<string>>(new Set());

  const toggleSpecsDrawer = useCallback((adId: string) => {
    setExpandedSpecsMap((prev) => ({ ...prev, [adId]: !prev[adId] }));
  }, []);

  const hasCompletedCountdown = useMemo(() => activeAds.some((ad) => !!ad.completed_at), [activeAds]);

  useEffect(() => {
    if (!hasCompletedCountdown) return;
    const timer = setInterval(() => setTimeNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [hasCompletedCountdown]);

  const fetchAds = useCallback(
    async (bypassCache: boolean = false, silent: boolean = false) => {
      const email = session?.user?.email;
      if (!email || isFetchingRef.current) return;

      isFetchingRef.current = true;
      if (bypassCache) {
        if (!silent) {
          setRefreshing(true);
        }
        clearUserCampaignsCache(email);
      }

      try {
        const campaignsRes = await fetchUserCampaignsShared(email, bypassCache);
        if (!campaignsRes) {
          throw new Error("Unable to load campaigns. Please try again.");
        }
        if (campaignsRes.error) {
          throw new Error(campaignsRes.error);
        }

        const reviewData = campaignsRes.adsQueue || [];
        const activeData = campaignsRes.adsActive || [];
        setReviewAds(reviewData);
        setActiveAds(activeData);
        setReportsMap(campaignsRes.reportsMap || {});
        setDismissalsMap(campaignsRes.dismissalsMap || {});
        setAdvertiserBlockCount(campaignsRes.advertiserBlockCount || 0);
        setApiAnalyticsSeries(
          Array.isArray(campaignsRes.analyticsSeries) ? campaignsRes.analyticsSeries : null
        );
        setApiAnalyticsSummary(
          campaignsRes.analyticsSummary && typeof campaignsRes.analyticsSummary === "object"
            ? campaignsRes.analyticsSummary
            : null
        );
        setAdAnalyticsMap(
          campaignsRes.adAnalyticsMap && typeof campaignsRes.adAnalyticsMap === "object"
            ? campaignsRes.adAnalyticsMap
            : {}
        );
        setNextCursor(campaignsRes.adsNextCursor ?? campaignsRes.nextCursor ?? null);
        setHasMore(Boolean(campaignsRes.adsHasMore ?? campaignsRes.hasMore));

        if (Array.isArray(campaignsRes.ratedAdIds) && campaignsRes.ratedAdIds.length > 0) {
          setRatedAdIds((prev) => {
            const merged = new Set([...prev, ...campaignsRes.ratedAdIds]);
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem("paayh_rated_ad_ids", JSON.stringify(Array.from(merged)));
              } catch {}
            }
            return merged;
          });
        }
        setErrorMessage(null);
      } catch (err: any) {
        if (!silent) {
          console.error("Error in fetchAds:", err);
          setErrorMessage(err?.message || "Unable to load campaigns. Please click Refresh.");
        }
      } finally {
        if (!silent) {
          setLoading(false);
          setRefreshing(false);
        }
        isFetchingRef.current = false;
      }
    },
    [session?.user?.email]
  );

  const autoRefreshEnabled = autoRefreshOverride ?? activeAds.length > 0;
  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshOverride((prev) => {
      const current = prev ?? activeAds.length > 0;
      return !current;
    });
  }, [activeAds.length]);

  const hasOpenModal = Boolean(boosterAd || publishingAd || noticeModal || ratingAdId);

  useEffect(() => {
    if (!session?.user?.email || !autoRefreshEnabled || hasOpenModal) return;

    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      fetchAds(true, true);
    }, 30_000);

    return () => clearInterval(timer);
  }, [session?.user?.email, autoRefreshEnabled, hasOpenModal, fetchAds]);

  const loadMoreAds = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/campaigns?cursor=${encodeURIComponent(nextCursor)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to load more campaigns (${res.status})`);
      }
      if (Array.isArray(data.adsQueue)) {
        setReviewAds((prev) => mergeUniqueById(prev, data.adsQueue));
      }
      if (Array.isArray(data.adsActive)) {
        setActiveAds((prev) => mergeUniqueById(prev, data.adsActive));
      }
      setNextCursor(data.adsNextCursor ?? data.nextCursor ?? null);
      setHasMore(Boolean(data.adsHasMore ?? data.hasMore));
      setErrorMessage(null);
    } catch (err: any) {
      setNoticeModal({
        title: "Pagination Notice",
        message: err?.message || "Could not load additional campaigns at this time.",
      });
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, loadingMore]);

  const verifyBoostPayment = useCallback(
    async (reference: string, gatewayReference?: string) => {
      if (!reference) return;
      setNoticeModal({
        title: "Verifying Boost Payment",
        message: "Confirming your boost top-up with payment gateway...",
      });

      try {
        const url = new URL("/api/payments/verify", window.location.origin);
        url.searchParams.set("reference", reference);
        if (gatewayReference) url.searchParams.set("gateway_reference", gatewayReference);

        const res = await fetch(url.toString());
        const data = await res.json().catch(() => ({}));
        if (!res.ok && !data.message) {
          throw new Error(data.error || "Unable to verify payment at this time.");
        }
        if (data.success || data.status === "success") {
          setNoticeModal({
            title: "Campaign Boosted!",
            message: "Your campaign priority and impressions have been updated successfully!",
          });
          clearUserCampaignsCache(session?.user?.email || "");
          fetchAds(true);
        } else {
          setNoticeModal({
            title: "Boost Verification Notice",
            message:
              data.message ||
              data.error ||
              "Payment has not yet settled or was not completed. If debited, your campaign will update shortly once confirmed.",
          });
        }
      } catch (err: any) {
        setNoticeModal({
          title: "Boost Verification Notice",
          message: err?.message || "Unable to verify payment at this time.",
        });
      }
    },
    [session?.user?.email, fetchAds]
  );

  useEffect(() => {
    if (session?.user?.email) {
      if (typeof window !== "undefined") {
        const requestedFilter = sessionStorage.getItem("paayh_myads_filter_tab");
        if (
          requestedFilter === "review" ||
          requestedFilter === "all" ||
          requestedFilter === "approved" ||
          requestedFilter === "active"
        ) {
          setActiveTab(requestedFilter as FilterTab);
          sessionStorage.removeItem("paayh_myads_filter_tab");
          fetchAds(true);
          return;
        }
      }
      fetchAds();
    }
  }, [session?.user?.email, fetchAds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResubmitted = (e: any) => {
      const detail = e?.detail;
      if (detail?.type && detail.type !== "ad") return;
      const submittedId = detail?.id;
      if (submittedId) {
        setReviewAds((prev) =>
          prev.map((item) =>
            item.id === submittedId
              ? {
                  ...item,
                  admin_statement: "Status: Pending review",
                  status: "pending_review",
                  is_paused: false,
                }
              : item
          )
        );
      }
      if (detail?.wasEditing) setActiveTab("review");
      fetchAds(true);
    };
    window.addEventListener("paayh_campaign_resubmitted", handleResubmitted);
    return () => window.removeEventListener("paayh_campaign_resubmitted", handleResubmitted);
  }, [fetchAds]);

  useEffect(() => {
    if (!session?.user?.email) return;
    const channel = supabase
      .channel("campaigns_realtime")
      .on("broadcast", { event: "campaign_impression" }, (msg: any) => {
        const p = msg?.payload;
        if (!p?.adId) return;
        const updateImp = (ad: Ad) =>
          String(ad.id) === String(p.adId)
            ? {
                ...ad,
                impression_count:
                  typeof p.impressionCount === "number"
                    ? Math.max(Number(ad.impression_count || 0), p.impressionCount)
                    : Number(ad.impression_count || 0) + 1,
              }
            : ad;
        setActiveAds((prev) => prev.map(updateImp));
        setReviewAds((prev) => prev.map(updateImp));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [session?.user?.email]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkPendingBoost = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const boostRef = urlParams.get("boost_ref") || sessionStorage.getItem("paayh_boost_ref");
      const gatewayRef =
        urlParams.get("reference") || urlParams.get("trxref") || sessionStorage.getItem("paayh_boost_gateway_ref");

      const isHighlight =
        urlParams.get("type") === "highlight" ||
        urlParams.get("tab") === "highlights" ||
        sessionStorage.getItem("paayh_boost_type") === "highlight";
      if (isHighlight) return;

      if (boostRef && boostRef.startsWith("BOOST-")) {
        sessionStorage.removeItem("paayh_boost_ref");
        sessionStorage.removeItem("paayh_boost_gateway_ref");
        verifyBoostPayment(boostRef, gatewayRef || undefined);
      }
    };

    checkPendingBoost();

    const handleCustomBoostEvent = (e: any) => {
      const isHighlight =
        e.detail?.isHighlight ||
        e.detail?.type === "highlight" ||
        sessionStorage.getItem("paayh_boost_type") === "highlight";
      if (isHighlight) return;

      const boostRef = e.detail?.reference || sessionStorage.getItem("paayh_boost_ref");
      const urlParams = new URLSearchParams(window.location.search);
      const gatewayRef = urlParams.get("reference") || urlParams.get("trxref") || e.detail?.gatewayReference;
      if (boostRef && boostRef.startsWith("BOOST-")) {
        sessionStorage.removeItem("paayh_boost_ref");
        verifyBoostPayment(boostRef, gatewayRef || undefined);
      }
    };

    window.addEventListener("paayh_boost_ref", handleCustomBoostEvent);
    return () => window.removeEventListener("paayh_boost_ref", handleCustomBoostEvent);
  }, [verifyBoostPayment]);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          setUserWalletBalance(Number(data.balance || 0));
        }
      } catch {}
    };
    if (session?.user?.email) fetchBalance();
  }, [session?.user?.email]);

  const handleTogglePause = async (adId: string, currentPausedState: boolean, adminStatement?: string | null) => {
    if (inFlightActionRef.current.has(adId)) return;

    const trimmedStmt = (adminStatement || "").trim();
    const isActualAdminPauseNote =
      Boolean(trimmedStmt) &&
      !trimmedStmt.toUpperCase().startsWith("APPROVED:") &&
      !trimmedStmt.toUpperCase().startsWith("REJECTED:") &&
      !trimmedStmt.toUpperCase().startsWith("STATUS:") &&
      trimmedStmt !== "pending_review";

    if (currentPausedState && isActualAdminPauseNote) {
      setNoticeModal({
        title: "Campaign Notice",
        message: `This ad is paused by administration: "${trimmedStmt}". Please follow the instruction provided.`,
      });
      return;
    }

    inFlightActionRef.current.add(adId);
    setActionLoadingId(adId);
    const nextPausedState = !currentPausedState;
    setActiveAds((prev) => prev.map((item) => (item.id === adId ? { ...item, is_paused: nextPausedState } : item)));
    setReviewAds((prev) => prev.map((item) => (item.id === adId ? { ...item, is_paused: nextPausedState } : item)));

    try {
      const res = await fetch("/api/campaigns/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId, isPaused: nextPausedState }),
      });

      const errData = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActiveAds((prev) => prev.map((item) => (item.id === adId ? { ...item, is_paused: currentPausedState } : item)));
        setReviewAds((prev) => prev.map((item) => (item.id === adId ? { ...item, is_paused: currentPausedState } : item)));
        setNoticeModal({
          title: "Status Update",
          message: errData.error || "Failed to update campaign state.",
        });
      }
    } catch (e: any) {
      setActiveAds((prev) => prev.map((item) => (item.id === adId ? { ...item, is_paused: currentPausedState } : item)));
      setReviewAds((prev) => prev.map((item) => (item.id === adId ? { ...item, is_paused: currentPausedState } : item)));
      setNoticeModal({
        title: "Connection Notice",
        message: e?.message || "Could not update campaign status.",
      });
    } finally {
      inFlightActionRef.current.delete(adId);
      setActionLoadingId((prev) => (prev === adId ? null : prev));
    }
  };

  const handleShare = (adId: string) => {
    if (typeof window !== "undefined") {
      const encodedId = btoa(adId.toString());
      const shareUrl = `${window.location.origin}/login?view&Earn Ads by Paayh=${encodedId}`;
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => {
          window.dispatchEvent(new CustomEvent("xea:toast", { detail: { message: "Link copied to clipboard" } }));
        })
        .catch(() => setNoticeModal({ title: "Share Notice", message: "Failed to copy link to clipboard." }));
    }
  };

  const handleEditAd = (adId: string) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("paayh_active_tab", "adPage");
      sessionStorage.setItem("paayh_edit_ad_id", adId);
      window.dispatchEvent(new CustomEvent("paayh_edit_ad", { detail: { adId } }));
      window.dispatchEvent(new Event("paayh_tab_change"));
    }
  };

  const handleCancelAd = (adId: string) => {
    const isDraftInReview = reviewAds.some((a) => a.id === adId);

    setNoticeModal({
      title: isDraftInReview ? "Delete Campaign Draft" : "Stop Campaign",
      message: isDraftInReview
        ? "Are you sure you want to delete this campaign? It will be removed permanently from your review queue."
        : "Are you sure you want to stop this live campaign? Delivery will cease immediately.",
      confirmText: isDraftInReview ? "Delete" : "Stop Campaign",
      cancelText: "Not Now",
      isDestructive: true,
      onConfirm: async () => {
        try {
          const response = await fetch("/api/campaigns/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adId }),
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || "Failed to process cancellation");
          }

          setNoticeModal({
            title: isDraftInReview ? "Campaign Deleted" : "Campaign Stopped",
            message: isDraftInReview
              ? "Your campaign draft has been removed."
              : "Delivery has ceased immediately.",
          });
          setReviewAds((prev) => prev.filter((a) => a.id !== adId));
          setActiveAds((prev) => prev.filter((a) => a.id !== adId));
          clearUserCampaignsCache(session?.user?.email || "");
          fetchAds(true);
        } catch (e: any) {
          setNoticeModal({
            title: "Notice",
            message: e?.message || "An error occurred while deleting your campaign.",
          });
        }
      },
    });
  };

  const { filteredReview, filteredActive } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matchesQuery = (ad: Ad) => {
      if (!q) return true;
      const industryStr = Array.isArray(ad.industry) ? ad.industry.join(" ") : String(ad.industry || "");
      return (
        (ad.ad_content || "").toLowerCase().includes(q) ||
        (ad.id || "").toLowerCase().includes(q) ||
        (ad.country || "").toLowerCase().includes(q) ||
        (ad.state || "").toLowerCase().includes(q) ||
        industryStr.toLowerCase().includes(q)
      );
    };

    const sortFn = (a: Ad, b: Ad) => {
      if (sortBy === "views") return (b.impression_count || 0) - (a.impression_count || 0);
      if (sortBy === "clicks") return getTotalAdClicks(b) - getTotalAdClicks(a);
      if (sortBy === "bid") return Number(b.cost_per_impression || 25) - Number(a.cost_per_impression || 25);
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    };

    const filteredReviewList = reviewAds
      .filter((ad) => {
        if (!matchesQuery(ad)) return false;
        if (activeTab === "approved") return !!(ad.admin_statement && ad.admin_statement.startsWith("APPROVED:"));
        if (activeTab === "review") return !(ad.admin_statement && ad.admin_statement.startsWith("APPROVED:"));
        return true;
      })
      .sort(sortFn);

    const filteredActiveList = activeAds
      .filter((ad) => {
        if (!matchesQuery(ad)) return false;
        const isComp = !!ad.completed_at || (ad.impression_count ?? 0) >= (ad.impressions ?? 1000);
        if (activeTab === "paused") return !!ad.is_paused && !isComp;
        if (activeTab === "completed") return isComp;
        if (activeTab === "active") return !ad.is_paused && !isComp;
        return true;
      })
      .sort(sortFn);

    return { filteredReview: filteredReviewList, filteredActive: filteredActiveList };
  }, [reviewAds, activeAds, searchQuery, sortBy, activeTab]);

  const pausedCount = useMemo(
    () =>
      activeAds.filter(
        (ad) => !!ad.is_paused && !ad.completed_at && (ad.impression_count ?? 0) < (ad.impressions ?? 1000)
      ).length,
    [activeAds]
  );

  const completedCount = useMemo(
    () =>
      activeAds.filter(
        (ad) => !!ad.completed_at || (ad.impression_count ?? 0) >= (ad.impressions ?? 1000)
      ).length,
    [activeAds]
  );

  const deliveringCount = useMemo(
    () =>
      activeAds.filter(
        (ad) => !ad.is_paused && !ad.completed_at && (ad.impression_count ?? 0) < (ad.impressions ?? 1000)
      ).length,
    [activeAds]
  );

  const totalImpressionsDelivered = useMemo(
    () => activeAds.reduce((acc, a) => acc + (a.impression_count || 0), 0),
    [activeAds]
  );
  const totalClicksCount = useMemo(
    () => activeAds.reduce((acc, a) => acc + getTotalAdClicks(a), 0),
    [activeAds]
  );
  const totalMutualsGained = useMemo(
    () => activeAds.reduce((acc, a) => acc + (a.mutual_adds_count || 0), 0),
    [activeAds]
  );

  const analyticsSeries = useMemo(
    () =>
      apiAnalyticsSeries && apiAnalyticsSeries.length > 0
        ? apiAnalyticsSeries
        : buildFallbackAnalyticsSeries(activeAds, timeNow),
    [apiAnalyticsSeries, activeAds, timeNow]
  );

  const analyticsSummary = useMemo(
    () => apiAnalyticsSummary || computeFallbackAnalyticsSummary(activeAds),
    [apiAnalyticsSummary, activeAds]
  );

  return {
    reviewAds,
    activeAds,
    activeAdsPage,
    setActiveAdsPage,
    reviewAdsPage,
    setReviewAdsPage,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    loadMoreAds,
    errorMessage,
    actionLoadingId,
    timeNow,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    reportsMap,
    dismissalsMap,
    advertiserBlockCount,
    expandedSpecsMap,
    toggleSpecsDrawer,
    boosterAd,
    setBoosterAd,
    publishingAd,
    setPublishingAd,
    userWalletBalance,
    noticeModal,
    setNoticeModal,
    ratingAdId,
    setRatingAdId,
    ratedAdIds,
    setRatedAdIds,
    fetchAds,
    handleTogglePause,
    handleShare,
    handleEditAd,
    handleCancelAd,
    filteredReview,
    filteredActive,
    pausedCount,
    completedCount,
    deliveringCount,
    totalImpressionsDelivered,
    totalClicksCount,
    totalMutualsGained,
    analyticsSeries,
    analyticsSummary,
    adAnalyticsMap,
    autoRefreshEnabled,
    toggleAutoRefresh,
  };
}
