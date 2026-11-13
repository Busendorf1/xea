"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { HighlightItem, Session, getHighlightScheduleInfo } from "./types";
import { HighlightFilterTab, HighlightSortOption } from "./newsDashboardUtils";
import {
  fetchUserCampaignsShared,
  clearUserCampaignsCache,
  readUserCampaignsSyncCache,
} from "@/lib/campaignsClient";
import { NoticeModalData } from "../MyAds/NoticeModal";

function mergeUniqueHighlights(existing: HighlightItem[], incoming: HighlightItem[]): HighlightItem[] {
  if (!incoming || incoming.length === 0) return existing;
  const map = new Map<string, HighlightItem>();
  for (const item of existing) map.set(String(item.id), item);
  for (const item of incoming) map.set(String(item.id), item);
  return Array.from(map.values());
}

export function useMyNewsDashboard(session: Session) {
  const [initialCached] = useState(() => readUserCampaignsSyncCache(session?.user?.email));

  const [reviewNews, setReviewNews] = useState<HighlightItem[]>(() => initialCached?.highlightsQueue || []);
  const [activeNews, setActiveNews] = useState<HighlightItem[]>(() => initialCached?.highlightsActive || []);
  const [activeNewsPage, setActiveNewsPage] = useState<number>(1);
  const [reviewNewsPage, setReviewNewsPage] = useState<number>(1);

  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(
    () => initialCached?.highlightsNextCursor ?? initialCached?.nextCursor ?? null
  );
  const [hasMore, setHasMore] = useState<boolean>(
    () => Boolean(initialCached?.highlightsHasMore ?? initialCached?.hasMore)
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [noticeModal, setNoticeModal] = useState<NoticeModalData | null>(null);
  const [timeNow, setTimeNow] = useState(Date.now());

  const [activeTab, setActiveTab] = useState<HighlightFilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<HighlightSortOption>("newest");

  const [expandedSpecsMap, setExpandedSpecsMap] = useState<Record<string, boolean>>({});
  const [publishingHighlight, setPublishingHighlight] = useState<HighlightItem | null>(null);
  const [boosterHighlight, setBoosterHighlight] = useState<HighlightItem | null>(null);
  const [userWalletBalance, setUserWalletBalance] = useState<number>(0);

  const isFetchingRef = useRef(false);
  const inFlightActionRef = useRef<Set<string>>(new Set());

  const toggleSpecsDrawer = useCallback((id: string) => {
    setExpandedSpecsMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTimeNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchNews = useCallback(
    async (bypassCache: boolean = false) => {
      const email = session?.user?.email;
      if (!email || isFetchingRef.current) return;

      isFetchingRef.current = true;
      if (bypassCache) {
        setRefreshing(true);
        if (reviewNews.length === 0 && activeNews.length === 0) {
          setLoading(true);
        }
        clearUserCampaignsCache(email);
      }

      try {
        const data = await fetchUserCampaignsShared(email, bypassCache);
        if (!data) {
          throw new Error("Unable to load highlights. Please try again.");
        }
        if (data.error) {
          throw new Error(data.error);
        }
        setReviewNews(data.highlightsQueue || []);
        setActiveNews(data.highlightsActive || []);
        setNextCursor(data.highlightsNextCursor ?? data.nextCursor ?? null);
        setHasMore(Boolean(data.highlightsHasMore ?? data.hasMore));
        setErrorMessage(null);
      } catch (err: any) {
        setErrorMessage(err?.message || "Unable to load highlights. Please click Refresh.");
      } finally {
        setLoading(false);
        setRefreshing(false);
        isFetchingRef.current = false;
      }
    },
    [session?.user?.email, reviewNews.length, activeNews.length]
  );

  const loadMoreNews = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/campaigns?cursor=${encodeURIComponent(nextCursor)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to load more highlights (${res.status})`);
      }
      if (Array.isArray(data.highlightsQueue)) {
        setReviewNews((prev) => mergeUniqueHighlights(prev, data.highlightsQueue));
      }
      if (Array.isArray(data.highlightsActive)) {
        setActiveNews((prev) => mergeUniqueHighlights(prev, data.highlightsActive));
      }
      setNextCursor(data.highlightsNextCursor ?? data.nextCursor ?? null);
      setHasMore(Boolean(data.highlightsHasMore ?? data.hasMore));
      setErrorMessage(null);
    } catch (err: any) {
      setNoticeModal({
        title: "Pagination Notice",
        message: err?.message || "Could not load additional highlights at this time.",
      });
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, loadingMore]);

  const verifyBoostPayment = useCallback(
    async (reference: string, gatewayReference?: string) => {
      if (!reference) return;
      setNoticeModal({
        title: "Verifying Highlight Boost",
        message: "Confirming your boost payment with payment gateway...",
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
            title: "Highlight Boosted & Live!",
            message:
              "Your highlight boost was successful! Schedule duration and priority delivery have been updated and are actively delivering.",
          });
          clearUserCampaignsCache(session?.user?.email || "");
          fetchNews(true);
          try {
            sessionStorage.removeItem("paayh_statement_cache");
            window.dispatchEvent(new CustomEvent("paayh:balance_updated"));
          } catch {}
        } else {
          setNoticeModal({
            title: "Boost Verification Notice",
            message:
              data.message ||
              data.error ||
              "Payment has not yet settled or was not completed. If debited, your highlight will update shortly once confirmed.",
          });
        }
      } catch (err: any) {
        setNoticeModal({
          title: "Boost Verification Notice",
          message: err?.message || "Unable to verify payment at this time.",
        });
      }
    },
    [session?.user?.email, fetchNews]
  );

  useEffect(() => {
    if (session?.user?.email) {
      if (typeof window !== "undefined") {
        const requestedFilter = sessionStorage.getItem("paayh_mynews_filter_tab");
        if (
          requestedFilter === "pending" ||
          requestedFilter === "all" ||
          requestedFilter === "approved" ||
          requestedFilter === "active"
        ) {
          setActiveTab(requestedFilter as HighlightFilterTab);
          sessionStorage.removeItem("paayh_mynews_filter_tab");
          fetchNews(true);
          return;
        }
      }
      fetchNews();
    }
  }, [session?.user?.email, fetchNews]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResubmitted = (e: any) => {
      const detail = e?.detail;
      if (detail?.type && detail.type !== "highlight") return;
      const submittedId = detail?.id;
      if (submittedId) {
        setReviewNews((prev) =>
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
      if (detail?.wasEditing) setActiveTab("pending");
      fetchNews(true);
    };
    window.addEventListener("paayh_campaign_resubmitted", handleResubmitted);
    return () => window.removeEventListener("paayh_campaign_resubmitted", handleResubmitted);
  }, [fetchNews]);

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

      if (boostRef && boostRef.startsWith("BOOST-") && isHighlight) {
        sessionStorage.removeItem("paayh_boost_ref");
        sessionStorage.removeItem("paayh_boost_gateway_ref");
        sessionStorage.removeItem("paayh_boost_type");
        verifyBoostPayment(boostRef, gatewayRef || undefined);
      }
    };

    checkPendingBoost();

    const handleCustomBoostEvent = (e: any) => {
      const boostRef = e.detail?.reference || sessionStorage.getItem("paayh_boost_ref");
      const isHighlight =
        e.detail?.isHighlight ||
        e.detail?.type === "highlight" ||
        sessionStorage.getItem("paayh_boost_type") === "highlight";
      const urlParams = new URLSearchParams(window.location.search);
      const gatewayRef = urlParams.get("reference") || urlParams.get("trxref") || e.detail?.gatewayReference;

      if (boostRef && boostRef.startsWith("BOOST-") && isHighlight) {
        sessionStorage.removeItem("paayh_boost_ref");
        sessionStorage.removeItem("paayh_boost_gateway_ref");
        sessionStorage.removeItem("paayh_boost_type");
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

  const handleTogglePause = async (item: HighlightItem) => {
    if (inFlightActionRef.current.has(item.id)) return;

    const trimmedStmt = (item.admin_statement || "").trim();
    const isActualAdminPauseNote =
      Boolean(trimmedStmt) &&
      !trimmedStmt.toUpperCase().startsWith("APPROVED:") &&
      !trimmedStmt.toUpperCase().startsWith("REJECTED:") &&
      !trimmedStmt.toUpperCase().startsWith("STATUS:") &&
      trimmedStmt !== "pending_review";

    if (isActualAdminPauseNote && item.is_paused) {
      setNoticeModal({
        title: "Highlight Paused by Admin",
        message: `This highlight is paused by administration: "${trimmedStmt}". Please follow the instruction provided.`,
      });
      return;
    }

    inFlightActionRef.current.add(item.id);
    const nextState = !item.is_paused;
    setActionLoadingId(item.id);

    setActiveNews((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_paused: nextState } : n)));
    setReviewNews((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_paused: nextState } : n)));

    try {
      const res = await fetch("/api/highlights/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ highlightId: item.id, isPaused: nextState }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActiveNews((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_paused: !nextState } : n)));
        setReviewNews((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_paused: !nextState } : n)));
        setNoticeModal({
          title: "Status Update",
          message: data.error || "Could not update highlight status.",
        });
      }
    } catch (e: any) {
      setActiveNews((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_paused: !nextState } : n)));
      setReviewNews((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_paused: !nextState } : n)));
      setNoticeModal({
        title: "Connection Notice",
        message: e?.message || "Network error updating highlight status.",
      });
    } finally {
      inFlightActionRef.current.delete(item.id);
      setActionLoadingId((prev) => (prev === item.id ? null : prev));
    }
  };

  const handleDeleteHighlight = (id: string) => {
    const isDraftInReview = reviewNews.some((h) => h.id === id);

    setNoticeModal({
      title: isDraftInReview ? "Delete Highlight Draft" : "Delete Highlight",
      message: isDraftInReview
        ? "Are you sure you want to delete this highlight? It will be removed permanently from your review queue."
        : "Are you sure you want to remove this highlight?",
      confirmText: "Delete",
      cancelText: "Not Now",
      isDestructive: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/highlights/delete?id=${encodeURIComponent(id)}`, { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || "Failed to delete highlight");
          }
          setReviewNews((prev) => prev.filter((h) => h.id !== id));
          setActiveNews((prev) => prev.filter((h) => h.id !== id));
          clearUserCampaignsCache(session?.user?.email || "");
          setNoticeModal({
            title: "Highlight Deleted",
            message: "Your highlight has been removed.",
          });
        } catch (e: any) {
          setNoticeModal({
            title: "Notice",
            message: e?.message || "Failed to delete highlight.",
          });
        }
      },
    });
  };

  const handleEditHighlight = (id: string) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("paayh_active_tab", "news");
      sessionStorage.setItem("paayh_edit_news_id", id);
      window.dispatchEvent(new CustomEvent("paayh_edit_news", { detail: { newsId: id } }));
      window.dispatchEvent(new Event("paayh_tab_change"));
    }
  };

  const activeLiveCount = useMemo(
    () =>
      activeNews.filter((item) => {
        const sched = getHighlightScheduleInfo(item, timeNow);
        return !item.is_paused && !sched.isExpired;
      }).length,
    [activeNews, timeNow]
  );

  const pausedCount = useMemo(
    () => activeNews.filter((item) => !!item.is_paused).length + reviewNews.filter((item) => !!item.is_paused).length,
    [activeNews, reviewNews]
  );

  const biddedCount = useMemo(
    () =>
      [...activeNews, ...reviewNews].filter((item) => !!item.is_bidded || Number(item.bid_price || 0) > 1000).length,
    [activeNews, reviewNews]
  );

  const totalScheduleDays = useMemo(
    () => activeNews.reduce((acc, item) => acc + Math.max(1, Math.min(90, Number(item.campaign_days || 1))), 0),
    [activeNews]
  );

  const { filteredReview, filteredActive } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matchesQuery = (item: HighlightItem) => {
      if (!q) return true;
      return (
        (item.title || "").toLowerCase().includes(q) ||
        (item.content || "").toLowerCase().includes(q) ||
        (item.interest || "").toLowerCase().includes(q) ||
        (item.country || "").toLowerCase().includes(q) ||
        (item.state || "").toLowerCase().includes(q) ||
        (item.province || "").toLowerCase().includes(q) ||
        (item.id || "").toLowerCase().includes(q)
      );
    };

    const sortFn = (a: HighlightItem, b: HighlightItem) => {
      if (sortBy === "bid") {
        const aBid = a.is_bidded ? Number(a.bid_price || 1500) : 1000;
        const bBid = b.is_bidded ? Number(b.bid_price || 1500) : 1000;
        return bBid - aBid;
      }
      if (sortBy === "duration") {
        return Number(b.campaign_days || 1) - Number(a.campaign_days || 1);
      }
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    };

    const filteredReviewList = reviewNews
      .filter((item) => {
        if (!matchesQuery(item)) return false;
        if (activeTab === "paused") return !!item.is_paused;
        if (activeTab === "approved") return !!(item.admin_statement && item.admin_statement.startsWith("APPROVED:"));
        if (activeTab === "pending") return !(item.admin_statement && item.admin_statement.startsWith("APPROVED:"));
        return true;
      })
      .sort(sortFn);

    const filteredActiveList = activeNews
      .filter((item) => {
        if (!matchesQuery(item)) return false;
        const sched = getHighlightScheduleInfo(item, timeNow);
        if (activeTab === "paused") return !!item.is_paused;
        if (activeTab === "active") return !item.is_paused && !sched.isExpired;
        if (activeTab === "approved") return true;
        return true;
      })
      .sort(sortFn);

    return { filteredReview: filteredReviewList, filteredActive: filteredActiveList };
  }, [reviewNews, activeNews, searchQuery, sortBy, activeTab, timeNow]);

  return {
    reviewNews,
    activeNews,
    activeNewsPage,
    setActiveNewsPage,
    reviewNewsPage,
    setReviewNewsPage,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    loadMoreNews,
    errorMessage,
    actionLoadingId,
    noticeModal,
    setNoticeModal,
    timeNow,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    expandedSpecsMap,
    toggleSpecsDrawer,
    publishingHighlight,
    setPublishingHighlight,
    boosterHighlight,
    setBoosterHighlight,
    userWalletBalance,
    fetchNews,
    handleTogglePause,
    handleDeleteHighlight,
    handleEditHighlight,
    activeLiveCount,
    pausedCount,
    biddedCount,
    totalScheduleDays,
    filteredReview,
    filteredActive,
  };
}
