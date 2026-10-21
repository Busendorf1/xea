"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { RotateCw, Search, Plus, ArrowUpDown, Compass, Sparkles } from "lucide-react";
import { HighlightItem, Session, getHighlightScheduleInfo } from "./types";
import { fetchUserCampaignsShared, clearUserCampaignsCache, readUserCampaignsSyncCache } from "@/lib/campaignsClient";
import HighlightKpiSummary from "./HighlightKpiSummary";
import MyHighlightCard from "./MyHighlightCard";
import HighlightBoosterModal from "./HighlightBoosterModal";
import PublishHighlightPaymentModal from "./PublishHighlightPaymentModal";
import NoticeModal, { NoticeModalData } from "../MyAds/NoticeModal";
import styles from "../MyAds/page.module.css";

type MyNewsProps = {
  session: Session;
};

type HighlightFilterTab = "all" | "active" | "pending" | "approved" | "paused";
type HighlightSortOption = "newest" | "bid" | "duration";

export default function MyNewsDashboard({ session }: MyNewsProps) {
  const [initialCached] = useState(() => readUserCampaignsSyncCache(session?.user?.email));

  const [reviewNews, setReviewNews] = useState<HighlightItem[]>(() => initialCached?.highlightsQueue || []);
  const [activeNews, setActiveNews] = useState<HighlightItem[]>(() => initialCached?.highlightsActive || []);
  const [activeNewsPage, setActiveNewsPage] = useState<number>(1);
  const [reviewNewsPage, setReviewNewsPage] = useState<number>(1);
  const HIGHLIGHTS_PER_PAGE = 10;

  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [error, setError] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [noticeModal, setNoticeModal] = useState<NoticeModalData | null>(null);
  const [timeNow, setTimeNow] = useState(Date.now());

  // Command Toolbar State (shadcn/ui Tabs + Search + Sort)
  const [activeTab, setActiveTab] = useState<HighlightFilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<HighlightSortOption>("newest");

  // Expandable Specs Drawer State
  const [expandedSpecsMap, setExpandedSpecsMap] = useState<Record<string, boolean>>({});
  const [publishingHighlight, setPublishingHighlight] = useState<HighlightItem | null>(null);
  const [boosterHighlight, setBoosterHighlight] = useState<HighlightItem | null>(null);
  const [userWalletBalance, setUserWalletBalance] = useState<number>(0);

  const toggleSpecsDrawer = (id: string) => {
    setExpandedSpecsMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeNow(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchNews = async (bypassCache: boolean = false) => {
    const email = session?.user?.email;
    if (!email) return;

    if (bypassCache) {
      if (reviewNews.length === 0 && activeNews.length === 0) {
        setLoading(true);
      }
      clearUserCampaignsCache(email);
    }

    try {
      const data = await fetchUserCampaignsShared(email, bypassCache);
      if (data) {
        setReviewNews(data.highlightsQueue || []);
        setActiveNews(data.highlightsActive || []);
        setError(false);
      }
    } catch {
      if (reviewNews.length === 0 && activeNews.length === 0) {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyBoostPayment = async (reference: string, gatewayReference?: string) => {
    if (!reference) return;
    setNoticeModal({
      title: "Verifying Highlight Boost",
      message: "Confirming your boost payment with payment gateway...",
    });

    try {
      const url = new URL("/api/payments/verify", window.location.origin);
      url.searchParams.set("reference", reference);
      if (gatewayReference) {
        url.searchParams.set("gateway_reference", gatewayReference);
      }

      const res = await fetch(url.toString());
      const data = await res.json();
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
            "Payment has not yet settled or was not completed. If debited, your highlight will update shortly once confirmed.",
        });
      }
    } catch (err: any) {
      setNoticeModal({
        title: "Boost Verification Notice",
        message: err.message || "Unable to verify payment at this time.",
      });
    }
  };

  useEffect(() => {
    if (session?.user?.email) fetchNews();
  }, [session]);

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
      const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const gatewayRef = urlParams?.get("reference") || urlParams?.get("trxref") || e.detail?.gatewayReference;

      if (boostRef && boostRef.startsWith("BOOST-") && isHighlight) {
        sessionStorage.removeItem("paayh_boost_ref");
        sessionStorage.removeItem("paayh_boost_gateway_ref");
        sessionStorage.removeItem("paayh_boost_type");
        verifyBoostPayment(boostRef, gatewayRef || undefined);
      }
    };

    window.addEventListener("paayh_boost_ref", handleCustomBoostEvent);
    return () => {
      window.removeEventListener("paayh_boost_ref", handleCustomBoostEvent);
    };
  }, [session?.user?.email]);

  const handleTogglePause = async (item: HighlightItem) => {
    if (item.admin_statement && item.is_paused) {
      setNoticeModal({
        title: "Highlight Paused by Admin",
        message: `This highlight is paused by administration: "${item.admin_statement}". Please follow the instruction provided.`,
      });
      return;
    }

    const nextState = !item.is_paused;
    setActionLoadingId(item.id);

    // Optimistic UI update across both active and review queues
    setActiveNews((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_paused: nextState } : n)));
    setReviewNews((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_paused: nextState } : n)));

    try {
      const res = await fetch("/api/highlights/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          highlightId: item.id,
          isPaused: nextState,
        }),
      });

      const data = await res.json();
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
      setActionLoadingId(null);
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
          const res = await fetch(`/api/highlights/delete?id=${id}`, { method: "DELETE" });
          if (!res.ok) {
            const data = await res.json();
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
            message: e.message || "Failed to delete highlight.",
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

  const exportHighlightCsv = (item: HighlightItem) => {
    const isBidded = !!item.is_bidded || Number(item.bid_price || 0) > 1000;
    const dailyRate = isBidded ? Number(item.bid_price || 1500) : 1000;
    const scheduleInfo = getHighlightScheduleInfo(item, timeNow);

    const headers = [
      "Highlight ID",
      "Created At",
      "Title",
      "Category",
      "Approval Status",
      "Delivery State",
      "Is Bidded",
      "Daily Rate",
      "Scheduled Days",
      "Total Cost",
      "Country",
      "State",
      "Province",
      "Content Preview",
    ];

    const isInReview = reviewNews.some((r) => r.id === item.id);
    const approvalStatus = isInReview ? "Pending Review" : "Approved";
    const deliveryState = isInReview
      ? "Pending"
      : item.is_paused
      ? "Paused"
      : scheduleInfo.isExpired
      ? "Completed"
      : "Active";

    const values = [
      `"${item.id}"`,
      `"${item.created_at || ""}"`,
      `"${(item.title || "").replace(/"/g, '""')}"`,
      `"${item.interest || "General"}"`,
      `"${approvalStatus}"`,
      `"${deliveryState}"`,
      `"${isBidded ? "Yes" : "No"}"`,
      dailyRate,
      scheduleInfo.scheduledDays,
      dailyRate * scheduleInfo.scheduledDays,
      `"${item.country || "All"}"`,
      `"${item.state || "All"}"`,
      `"${item.province || "All"}"`,
      `"${(item.content || "").replace(/"/g, '""')}"`,
    ];

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), values.join(",")].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `paayh_highlight_${item.id.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // KPI & Filter Counts
  const activeLiveCount = useMemo(
    () =>
      activeNews.filter((item) => {
        const sched = getHighlightScheduleInfo(item, timeNow);
        return !item.is_paused && !sched.isExpired;
      }).length,
    [activeNews, timeNow]
  );

  const pausedCount = useMemo(
    () =>
      activeNews.filter((item) => !!item.is_paused).length +
      reviewNews.filter((item) => !!item.is_paused).length,
    [activeNews, reviewNews]
  );

  const biddedCount = useMemo(
    () =>
      [...activeNews, ...reviewNews].filter(
        (item) => !!item.is_bidded || Number(item.bid_price || 0) > 1000
      ).length,
    [activeNews, reviewNews]
  );

  const totalScheduleDays = useMemo(
    () =>
      activeNews.reduce((acc, item) => acc + Math.max(1, Number(item.campaign_days || 1)), 0),
    [activeNews]
  );

  // Filter & Sort logic
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

  const totalReviewPages = Math.max(1, Math.ceil(filteredReview.length / HIGHLIGHTS_PER_PAGE));
  const safeReviewNewsPage = Math.min(Math.max(1, reviewNewsPage), totalReviewPages);

  const totalActivePages = Math.max(1, Math.ceil(filteredActive.length / HIGHLIGHTS_PER_PAGE));
  const safeActiveNewsPage = Math.min(Math.max(1, activeNewsPage), totalActivePages);

  const renderPageButtons = (
    currentPage: number,
    totalPages: number,
    onPageChange: (pg: number) => void
  ) => {
    if (totalPages <= 1) return null;
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("ellipsis-1");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("ellipsis-2");
      pages.push(totalPages);
    }
    return pages.map((pg, idx) => {
      if (typeof pg === "string") {
        return (
          <span key={`el-news-${idx}`} className={styles.paginationEllipsis}>
            …
          </span>
        );
      }
      return (
        <button
          key={`pg-news-${pg}`}
          className={`${styles.pageBtn} ${pg === currentPage ? styles.pageBtnActive : ""}`}
          onClick={() => onPageChange(pg)}
        >
          {pg}
        </button>
      );
    });
  };

  const showPendingSection =
    activeTab === "all" ||
    activeTab === "pending" ||
    (activeTab === "approved" && filteredReview.length > 0) ||
    (activeTab === "paused" && filteredReview.length > 0);
  const showApprovedSection = activeTab !== "pending";

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json();
          setUserWalletBalance(Number(data.balance || 0));
        }
      } catch {}
    };
    if (session?.user?.email) {
      fetchBalance();
    }
  }, [session?.user?.email]);

  return (
    <div className={styles.feedContainer}>
      {/* Top Executive Header */}
      <div className={styles.headerBar}>
        <div className={styles.headerTitleGroup}>
          <h2 className={styles.headerTitle}>Highlights</h2>
          <p className={styles.headerSubtitle}>Status, schedule, and spotlight placement.</p>
        </div>

        <div className={styles.headerActionsGroup}>
          <button
            type="button"
            onClick={() => fetchNews(true)}
            className={styles.refreshAdsBtn}
            title="Force-fetch latest highlights status from database"
          >
            <motion.span
              animate={{ rotate: loading ? 360 : 0 }}
              transition={{ repeat: loading ? Infinity : 0, duration: 1, ease: "linear" }}
              style={{ display: "inline-flex" }}
            >
              <RotateCw size={13} />
            </motion.span>
            <span>Refresh</span>
          </button>

          <Link
            href="/logged-in"
            className={styles.newCampaignBtn}
            onClick={() => {
              sessionStorage.setItem("paayh_active_tab", "news");
              window.dispatchEvent(new Event("paayh_tab_change"));
            }}
          >
            <Plus size={14} />
            <span>New Highlight</span>
          </Link>
        </div>
      </div>

      {/* Top KPI Summary Grid */}
      {!loading && (
        <HighlightKpiSummary
          activeLiveCount={activeLiveCount}
          pendingCount={reviewNews.length}
          approvedTotalCount={activeNews.length}
          biddedCount={biddedCount}
          totalScheduleDays={totalScheduleDays}
        />
      )}

      {/* shadcn/ui Command Toolbar: Status Tabs + Search + Sort */}
      <div className={styles.commandBar}>
        <div className={styles.tabsList} role="tablist" aria-label="Filter highlights by status">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all"}
            className={`${styles.tabTrigger} ${activeTab === "all" ? styles.tabTriggerActive : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All <span className={styles.tabCount}>{activeNews.length + reviewNews.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "active"}
            className={`${styles.tabTrigger} ${activeTab === "active" ? styles.tabTriggerActive : ""}`}
            onClick={() => setActiveTab("active")}
          >
            Active <span className={styles.tabCount}>{activeLiveCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "pending"}
            className={`${styles.tabTrigger} ${activeTab === "pending" ? styles.tabTriggerActive : ""}`}
            onClick={() => setActiveTab("pending")}
          >
            Pending <span className={styles.tabCount}>{reviewNews.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "approved"}
            className={`${styles.tabTrigger} ${activeTab === "approved" ? styles.tabTriggerActive : ""}`}
            onClick={() => setActiveTab("approved")}
          >
            Approved{" "}
            <span className={styles.tabCount}>
              {activeNews.length + reviewNews.filter((h) => h.admin_statement?.startsWith("APPROVED:")).length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "paused"}
            className={`${styles.tabTrigger} ${activeTab === "paused" ? styles.tabTriggerActive : ""}`}
            onClick={() => setActiveTab("paused")}
          >
            Paused <span className={styles.tabCount}>{pausedCount}</span>
          </button>
        </div>

        <div className={styles.commandControls}>
          <div className={styles.searchBox}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setActiveNewsPage(1);
                setReviewNewsPage(1);
              }}
              placeholder="Search title, story, category, location..."
              className={styles.searchInput}
            />
          </div>

          <div className={styles.sortWrapper}>
            <ArrowUpDown size={13} className={styles.sortIcon} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as HighlightSortOption)}
              className={styles.sortSelect}
              aria-label="Sort highlights"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="bid">Sort: Highest Bid (/day)</option>
              <option value="duration">Sort: Longest Duration</option>
            </select>
          </div>
        </div>
      </div>

      {loading && <div className={styles.loading}>Loading highlights &amp; schedule status…</div>}
      {!loading && error && (
        <div className={styles.error}>Unable to load highlights. Please click Refresh.</div>
      )}

      {/* Pending Review Queue Section */}
      {!loading && showPendingSection && (filteredReview.length > 0 || activeTab === "pending") && (
        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeaderRow}>
            <h3 className={styles.subheading}>
              {activeTab === "approved" ? "Approved Highlights (Ready to Publish)" : "In Review"}
            </h3>
            <span className={styles.sectionCountBadge}>
              {filteredReview.length} {activeTab === "approved" ? "approved" : "pending"}
            </span>
          </div>

          {filteredReview.length === 0 ? (
            <div className={styles.emptyStateCard}>
              <p className={styles.emptyStateTitle}>
                {activeTab === "approved"
                  ? "No approved highlights awaiting payment"
                  : "No highlights in review"}
              </p>
              <p className={styles.emptyStateSub}>
                {activeTab === "approved"
                  ? "Approved highlights ready to pay and launch appear here."
                  : "Submitted highlights appear here for approval."}
              </p>
            </div>
          ) : (
            <>
              <div className={styles.adGrid}>
                {filteredReview
                  .slice(
                    (safeReviewNewsPage - 1) * HIGHLIGHTS_PER_PAGE,
                    safeReviewNewsPage * HIGHLIGHTS_PER_PAGE
                  )
                  .map((item) => (
                    <MyHighlightCard
                      key={item.id}
                      item={item}
                      status="review"
                      isSpecsOpen={!!expandedSpecsMap[item.id]}
                      onToggleSpecs={() => toggleSpecsDrawer(item.id)}
                      onTogglePause={handleTogglePause}
                      onEdit={handleEditHighlight}
                      onExportCsv={exportHighlightCsv}
                      onDelete={handleDeleteHighlight}
                      onPublish={(h) => setPublishingHighlight(h)}
                      onOpenBooster={(h) => setBoosterHighlight(h)}
                      actionLoading={actionLoadingId === item.id}
                      timeNow={timeNow}
                    />
                  ))}
              </div>
              {filteredReview.length > HIGHLIGHTS_PER_PAGE && (
                <div className={styles.paginationBar}>
                  <span className={styles.paginationInfo}>
                    Showing {(safeReviewNewsPage - 1) * HIGHLIGHTS_PER_PAGE + 1}–
                    {Math.min(safeReviewNewsPage * HIGHLIGHTS_PER_PAGE, filteredReview.length)} of{" "}
                    {filteredReview.length} pending
                  </span>
                  <div className={styles.paginationControls}>
                    <button
                      className={styles.pageBtn}
                      onClick={() => setReviewNewsPage((p) => Math.max(1, p - 1))}
                      disabled={safeReviewNewsPage <= 1}
                    >
                      Prev
                    </button>
                    {renderPageButtons(safeReviewNewsPage, totalReviewPages, setReviewNewsPage)}
                    <button
                      className={styles.pageBtn}
                      onClick={() => setReviewNewsPage((p) => Math.min(totalReviewPages, p + 1))}
                      disabled={safeReviewNewsPage >= totalReviewPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Approved & Active Highlights Section */}
      {!loading && showApprovedSection && (
        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeaderRow}>
            <h3 className={styles.subheading}>
              {activeTab === "paused"
                ? "Paused Highlights"
                : activeTab === "active"
                ? "Active Highlights (Live in Carousel)"
                : "Approved & Active Highlights"}
            </h3>
            <span className={styles.sectionCountBadge}>{filteredActive.length} approved</span>
          </div>

          {filteredActive.length === 0 ? (
            <div className={styles.emptyStateCard}>
              <p className={styles.emptyStateTitle}>
                {searchQuery
                  ? "No highlights match your search filter"
                  : activeTab === "paused"
                  ? "No paused highlights"
                  : activeTab === "active"
                  ? "No active highlights currently running in the carousel"
                  : "No approved highlights yet"}
              </p>
              <p className={styles.emptyStateSub}>Publish a highlight to feature your announcement at the top of the feed.</p>
              <div className={styles.postButtonContainer}>
                <Link
                  href="/logged-in"
                  onClick={() => {
                    sessionStorage.setItem("paayh_active_tab", "news");
                    window.dispatchEvent(new Event("paayh_tab_change"));
                  }}
                >
                  <button className={styles.postButton}>
                    <Plus size={14} /> Post a Highlight
                  </button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.adGrid}>
                {filteredActive
                  .slice(
                    (safeActiveNewsPage - 1) * HIGHLIGHTS_PER_PAGE,
                    safeActiveNewsPage * HIGHLIGHTS_PER_PAGE
                  )
                  .map((item) => (
                    <MyHighlightCard
                      key={item.id}
                      item={item}
                      status="active"
                      isSpecsOpen={!!expandedSpecsMap[item.id]}
                      onToggleSpecs={() => toggleSpecsDrawer(item.id)}
                      onTogglePause={handleTogglePause}
                      onEdit={handleEditHighlight}
                      onExportCsv={exportHighlightCsv}
                      onDelete={handleDeleteHighlight}
                      onPublish={(h) => setPublishingHighlight(h)}
                      onOpenBooster={(h) => setBoosterHighlight(h)}
                      actionLoading={actionLoadingId === item.id}
                      timeNow={timeNow}
                    />
                  ))}
              </div>
              {filteredActive.length > HIGHLIGHTS_PER_PAGE && (
                <div className={styles.paginationBar}>
                  <span className={styles.paginationInfo}>
                    Showing {(safeActiveNewsPage - 1) * HIGHLIGHTS_PER_PAGE + 1}–
                    {Math.min(safeActiveNewsPage * HIGHLIGHTS_PER_PAGE, filteredActive.length)} of{" "}
                    {filteredActive.length} highlights
                  </span>
                  <div className={styles.paginationControls}>
                    <button
                      className={styles.pageBtn}
                      onClick={() => setActiveNewsPage((p) => Math.max(1, p - 1))}
                      disabled={safeActiveNewsPage <= 1}
                    >
                      Prev
                    </button>
                    {renderPageButtons(safeActiveNewsPage, totalActivePages, setActiveNewsPage)}
                    <button
                      className={styles.pageBtn}
                      onClick={() => setActiveNewsPage((p) => Math.min(totalActivePages, p + 1))}
                      disabled={safeActiveNewsPage >= totalActivePages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Highlight Booster Modal */}
      <HighlightBoosterModal
        item={boosterHighlight}
        onClose={() => setBoosterHighlight(null)}
        onSuccess={(msg) => {
          setBoosterHighlight(null);
          setNoticeModal({
            title: "Highlight Boosted & Live!",
            message: msg || "Your highlight has been boosted successfully! Schedule duration and priority delivery have been updated and are actively delivering.",
          });
          clearUserCampaignsCache(session?.user?.email || "");
          fetchNews(true);
        }}
        onShowNotice={(title, message) => setNoticeModal({ title, message })}
      />

      {/* Publish Highlight Payment Modal */}
      <PublishHighlightPaymentModal
        isOpen={!!publishingHighlight}
        onClose={() => setPublishingHighlight(null)}
        item={publishingHighlight}
        userBalance={userWalletBalance}
        onSuccess={(_publishedHl) => {
          setPublishingHighlight(null);
          setNoticeModal({
            title: "Highlight Published & Live!",
            message: "Your highlight has been paid and is now active in the flash feed.",
          });
          clearUserCampaignsCache(session?.user?.email || "");
          fetchNews(true);
        }}
      />

      {/* Contained Notice Modal */}
      <NoticeModal notice={noticeModal} onClose={() => setNoticeModal(null)} />
    </div>
  );
}
