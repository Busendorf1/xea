"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { RotateCw, Search, Plus, ArrowUpDown, Megaphone, Sparkles } from "lucide-react";
import { Ad, Session } from "./types";
import { fetchUserCampaignsShared, clearUserCampaignsCache, readUserCampaignsSyncCache } from "@/lib/campaignsClient";
import CampaignKpiSummary from "./CampaignKpiSummary";
import MyAdCard, { getCampaignDaysInfo } from "./MyAdCard";
import CampaignBoosterModal from "./CampaignBoosterModal";
import AudienceRatingModal from "./AudienceRatingModal";
import NoticeModal from "./NoticeModal";
import styles from "./page.module.css";

type MyAdsProps = {
  session: Session;
};

type FilterTab = "all" | "active" | "review" | "approved" | "paused" | "completed";
type SortOption = "newest" | "views" | "clicks" | "bid";

export default function MyAdsDashboard({ session }: MyAdsProps) {
  const [initialCached] = useState(() => readUserCampaignsSyncCache(session?.user?.email));

  const [reviewAds, setReviewAds] = useState<Ad[]>(() => initialCached?.adsQueue || []);
  const [activeAds, setActiveAds] = useState<Ad[]>(() => initialCached?.adsActive || []);
  const [activeAdsPage, setActiveAdsPage] = useState<number>(1);
  const [reviewAdsPage, setReviewAdsPage] = useState<number>(1);
  const ADS_PER_PAGE = 10;

  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [error, setError] = useState(false);
  const [timeNow, setTimeNow] = useState(Date.now());

  // Command Toolbar State (shadcn/ui Tabs + Search + Sort)
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // Analytics & Health Metrics
  const [reportsMap, setReportsMap] = useState<Record<string, number>>(() => initialCached?.reportsMap || {});
  const [dismissalsMap, setDismissalsMap] = useState<Record<string, number>>(() => initialCached?.dismissalsMap || {});
  const [advertiserBlockCount, setAdvertiserBlockCount] = useState<number>(() => initialCached?.advertiserBlockCount || 0);

  // Expandable Specs Drawer State
  const [expandedSpecsMap, setExpandedSpecsMap] = useState<Record<string, boolean>>({});

  // Modals
  const [boosterAd, setBoosterAd] = useState<Ad | null>(null);
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; adId?: string } | null>(null);
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

  const toggleSpecsDrawer = (adId: string) => {
    setExpandedSpecsMap((prev) => ({ ...prev, [adId]: !prev[adId] }));
  };

  const hasCompletedCountdown = useMemo(
    () => activeAds.some((ad) => !!ad.completed_at),
    [activeAds]
  );

  useEffect(() => {
    if (!hasCompletedCountdown) return;
    const timer = setInterval(() => {
      setTimeNow(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, [hasCompletedCountdown]);

  const fetchAds = async (bypassCache: boolean = false) => {
    const email = session?.user?.email;
    if (!email) return;

    if (bypassCache) {
      clearUserCampaignsCache(email);
    }

    try {
      const campaignsRes = await fetchUserCampaignsShared(email, bypassCache);
      if (!campaignsRes) {
        throw new Error("Failed to fetch campaigns");
      }

      const reviewData = campaignsRes.adsQueue || [];
      const activeData = campaignsRes.adsActive || [];
      const reports = campaignsRes.reportsMap || {};
      const dismissals = campaignsRes.dismissalsMap || {};
      const blockCount = campaignsRes.advertiserBlockCount || 0;

      setReviewAds(reviewData);
      setActiveAds(activeData);
      setReportsMap(reports);
      setDismissalsMap(dismissals);
      setAdvertiserBlockCount(blockCount);

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
      setError(false);
    } catch (err) {
      console.error("Error in fetchAds:", err);
      if (reviewAds.length === 0 && activeAds.length === 0) {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyBoostPayment = async (reference: string, gatewayReference?: string) => {
    if (!reference) return;
    setNoticeModal({
      title: "Verifying Boost Payment",
      message: "Confirming your boost top-up with payment gateway...",
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
            "Payment has not yet settled or was not completed. If debited, your campaign will update shortly once confirmed.",
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
    if (session?.user?.email) fetchAds();
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkPendingBoost = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const boostRef = urlParams.get("boost_ref") || sessionStorage.getItem("paayh_boost_ref");
      const gatewayRef =
        urlParams.get("reference") || urlParams.get("trxref") || sessionStorage.getItem("paayh_boost_gateway_ref");

      if (boostRef && boostRef.startsWith("BOOST-")) {
        sessionStorage.removeItem("paayh_boost_ref");
        sessionStorage.removeItem("paayh_boost_gateway_ref");
        verifyBoostPayment(boostRef, gatewayRef || undefined);
      }
    };

    checkPendingBoost();

    const handleCustomBoostEvent = (e: any) => {
      const boostRef = e.detail?.reference || sessionStorage.getItem("paayh_boost_ref");
      const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const gatewayRef = urlParams?.get("reference") || urlParams?.get("trxref") || e.detail?.gatewayReference;
      if (boostRef && boostRef.startsWith("BOOST-")) {
        sessionStorage.removeItem("paayh_boost_ref");
        verifyBoostPayment(boostRef, gatewayRef || undefined);
      }
    };

    window.addEventListener("paayh_boost_ref", handleCustomBoostEvent);
    return () => {
      window.removeEventListener("paayh_boost_ref", handleCustomBoostEvent);
    };
  }, [session?.user?.email]);

  const handleTogglePause = async (adId: string, currentPausedState: boolean, adminStatement?: string | null) => {
    if (currentPausedState && adminStatement) {
      setNoticeModal({
        title: "Campaign Notice",
        message: `This ad is paused by administration: "${adminStatement}". Please follow the instruction provided.`,
      });
      return;
    }

    try {
      const nextPausedState = !currentPausedState;
      setActiveAds((prev) =>
        prev.map((item) => (item.id === adId ? { ...item, is_paused: nextPausedState } : item))
      );
      setReviewAds((prev) =>
        prev.map((item) => (item.id === adId ? { ...item, is_paused: nextPausedState } : item))
      );

      const res = await fetch("/api/campaigns/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId, isPaused: nextPausedState }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setActiveAds((prev) =>
          prev.map((item) => (item.id === adId ? { ...item, is_paused: currentPausedState } : item))
        );
        setReviewAds((prev) =>
          prev.map((item) => (item.id === adId ? { ...item, is_paused: currentPausedState } : item))
        );
        setNoticeModal({
          title: "Status Update",
          message: errData.error || "Failed to update campaign state.",
        });
      }
    } catch (e: any) {
      setActiveAds((prev) =>
        prev.map((item) => (item.id === adId ? { ...item, is_paused: currentPausedState } : item))
      );
      setReviewAds((prev) =>
        prev.map((item) => (item.id === adId ? { ...item, is_paused: currentPausedState } : item))
      );
      setNoticeModal({
        title: "Connection Notice",
        message: e.message || "Could not update campaign status.",
      });
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

  const handleCancelAd = async (adId: string) => {
    const confirmCancel = window.confirm(
      "Are you sure you want to stop this campaign immediately? Delivery will cease immediately."
    );
    if (!confirmCancel) return;

    try {
      const response = await fetch("/api/campaigns/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to cancel campaign");
      }

      setNoticeModal({
        title: "Campaign Cancelled",
        message: "Campaign successfully cancelled. Delivery has ceased immediately.",
      });
      clearUserCampaignsCache(session?.user?.email || "");
      fetchAds(true);
    } catch (e: any) {
      setNoticeModal({
        title: "Cancel Notice",
        message: e.message || "An error occurred while cancelling your campaign.",
      });
    }
  };

  const exportCampaignCsv = (ad: Ad) => {
    const seenCount = ad.impression_count ?? 0;
    const targetImpressions = ad.impressions ?? 1000;
    const remaining = Math.max(0, targetImpressions - seenCount);
    const phoneClicks = ad.clicks_phone ?? 0;
    const whatsappClicks = ad.clicks_whatsapp ?? 0;
    const websiteClicks = ad.clicks_website ?? 0;
    const emailClicks = ad.clicks_email ?? 0;
    const productClicks = ad.clicks_product_cta ?? 0;
    const totalClicks = phoneClicks + whatsappClicks + websiteClicks + emailClicks + productClicks;
    const ctr = seenCount > 0 ? ((totalClicks / seenCount) * 100).toFixed(2) : "0.00";
    const daysInfo = getCampaignDaysInfo(ad, timeNow);

    const headers = [
      "Campaign ID",
      "Created At",
      "Category",
      "Status",
      "Is Rollover",
      "Rollover Days",
      "Target Impressions",
      "Delivered Impressions",
      "Remaining Impressions",
      "Total Clicks",
      "CTR (%)",
      "Phone Clicks",
      "WhatsApp Clicks",
      "Website Clicks",
      "Email Clicks",
      "Product CTA Clicks",
      "Cost Per View",
      "Country",
      "State",
      "Gender Target",
      "Content Preview",
    ];

    const values = [
      `"${ad.id}"`,
      `"${ad.created_at || ""}"`,
      `"${ad.ad_type || "General"}"`,
      `"${ad.completed_at ? "Completed" : ad.is_paused ? "Paused" : "Active"}"`,
      `"${daysInfo.isRollover ? "Yes" : "No"}"`,
      daysInfo.rolloverDays,
      targetImpressions,
      seenCount,
      remaining,
      totalClicks,
      `${ctr}%`,
      phoneClicks,
      whatsappClicks,
      websiteClicks,
      emailClicks,
      productClicks,
      ad.cost_per_impression || 25,
      `"${ad.country || "All"}"`,
      `"${ad.state || "All"}"`,
      `"${ad.gender || "All"}"`,
      `"${(ad.ad_content || "").replace(/"/g, '""')}"`,
    ];

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), values.join(",")].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `paayh_campaign_report_${ad.id.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to filter & sort a campaign array
  const filterAndSortAds = useMemo(() => {
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

    const getClicks = (ad: Ad) =>
      (ad.clicks_phone || 0) +
      (ad.clicks_whatsapp || 0) +
      (ad.clicks_website || 0) +
      (ad.clicks_email || 0) +
      (ad.clicks_product_cta || 0);

    const sortFn = (a: Ad, b: Ad) => {
      if (sortBy === "views") return (b.impression_count || 0) - (a.impression_count || 0);
      if (sortBy === "clicks") return getClicks(b) - getClicks(a);
      if (sortBy === "bid") return Number(b.cost_per_impression || 25) - Number(a.cost_per_impression || 25);
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    };

    const filteredReview = reviewAds.filter(matchesQuery).sort(sortFn);
    const filteredActive = activeAds
      .filter((ad) => {
        if (!matchesQuery(ad)) return false;
        const isComp = !!ad.completed_at || (ad.impression_count ?? 0) >= (ad.impressions ?? 1000);
        if (activeTab === "paused") return !!ad.is_paused && !isComp;
        if (activeTab === "completed") return isComp;
        if (activeTab === "active") return !ad.is_paused && !isComp;
        return true;
      })
      .sort(sortFn);

    return { filteredReview, filteredActive };
  }, [reviewAds, activeAds, searchQuery, sortBy, activeTab]);

  const { filteredReview, filteredActive } = filterAndSortAds;

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

  const totalReviewPages = Math.max(1, Math.ceil(filteredReview.length / ADS_PER_PAGE));
  const safeReviewAdsPage = Math.min(Math.max(1, reviewAdsPage), totalReviewPages);

  const totalActivePages = Math.max(1, Math.ceil(filteredActive.length / ADS_PER_PAGE));
  const safeActiveAdsPage = Math.min(Math.max(1, activeAdsPage), totalActivePages);

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
          <span key={`el-${idx}`} className={styles.paginationEllipsis}>
            …
          </span>
        );
      }
      return (
        <button
          key={`pg-${pg}`}
          className={`${styles.pageBtn} ${pg === currentPage ? styles.pageBtnActive : ""}`}
          onClick={() => onPageChange(pg)}
        >
          {pg}
        </button>
      );
    });
  };

  const totalImpressionsDelivered = useMemo(
    () => activeAds.reduce((acc, a) => acc + (a.impression_count || 0), 0),
    [activeAds]
  );
  const totalClicksCount = useMemo(
    () =>
      activeAds.reduce(
        (acc, a) =>
          acc +
          (a.clicks_phone || 0) +
          (a.clicks_whatsapp || 0) +
          (a.clicks_website || 0) +
          (a.clicks_email || 0) +
          (a.clicks_product_cta || 0),
        0
      ),
    [activeAds]
  );
  const totalMutualsGained = useMemo(
    () => activeAds.reduce((acc, a) => acc + (a.mutual_adds_count || 0), 0),
    [activeAds]
  );

  const showReviewSection = activeTab === "all" || activeTab === "review";
  const showActiveSection = activeTab !== "review";

  return (
    <div className={styles.feedContainer}>
      {/* Top Executive Header */}
      <div className={styles.headerBar}>
        <div className={styles.headerTitleGroup}>
          <h2 className={styles.headerTitle}>Distribution Pipeline (DaaS)</h2>
          <p className={styles.headerSubtitle}>
            Real-time demographic node delivery telemetry, engagement diagnostics, and distribution pipeline controls.
          </p>
        </div>

        <div className={styles.headerActionsGroup}>
          <button
            type="button"
            onClick={() => fetchAds(true)}
            className={styles.refreshAdsBtn}
            title="Force-fetch latest distribution campaigns and metrics from database"
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
              sessionStorage.setItem("paayh_active_tab", "adPage");
              window.dispatchEvent(new Event("paayh_tab_change"));
            }}
          >
            <Plus size={14} />
            <span>New Distribution Wave</span>
          </Link>
        </div>
      </div>

      {/* Top KPI Header Summary Grid */}
      {!loading && (
        <CampaignKpiSummary
          activeCount={activeAds.length}
          reviewCount={reviewAds.length}
          totalImpressions={totalImpressionsDelivered}
          totalClicks={totalClicksCount}
          totalMutuals={totalMutualsGained}
        />
      )}

      {/* shadcn/ui Command Toolbar: Status Tabs + Search + Sort */}
      <div className={styles.commandBar}>
        <div className={styles.tabsList} role="tablist" aria-label="Filter campaigns by status">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all"}
            className={`${styles.tabTrigger} ${activeTab === "all" ? styles.tabTriggerActive : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All <span className={styles.tabCount}>{activeAds.length + reviewAds.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "active"}
            className={`${styles.tabTrigger} ${activeTab === "active" ? styles.tabTriggerActive : ""}`}
            onClick={() => setActiveTab("active")}
          >
            Active <span className={styles.tabCount}>{deliveringCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "review"}
            className={`${styles.tabTrigger} ${activeTab === "review" ? styles.tabTriggerActive : ""}`}
            onClick={() => setActiveTab("review")}
          >
            Pending <span className={styles.tabCount}>{reviewAds.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "approved"}
            className={`${styles.tabTrigger} ${activeTab === "approved" ? styles.tabTriggerActive : ""}`}
            onClick={() => setActiveTab("approved")}
          >
            Approved <span className={styles.tabCount}>{activeAds.length}</span>
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
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "completed"}
            className={`${styles.tabTrigger} ${activeTab === "completed" ? styles.tabTriggerActive : ""}`}
            onClick={() => setActiveTab("completed")}
          >
            Completed <span className={styles.tabCount}>{completedCount}</span>
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
                setActiveAdsPage(1);
                setReviewAdsPage(1);
              }}
              placeholder="Search copy, location, industry..."
              className={styles.searchInput}
            />
          </div>

          <div className={styles.sortWrapper}>
            <ArrowUpDown size={13} className={styles.sortIcon} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={styles.sortSelect}
              aria-label="Sort campaigns"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="views">Sort: Most Views</option>
              <option value="clicks">Sort: Most Clicks</option>
              <option value="bid">Sort: Highest Bid (CPI)</option>
            </select>
          </div>
        </div>
      </div>

      {loading && <div className={styles.loading}>Loading campaigns & telemetry…</div>}
      {!loading && error && <div className={styles.error}>Unable to load campaigns. Please click Refresh.</div>}

      {/* Review Queue Section */}
      {!loading && showReviewSection && (filteredReview.length > 0 || activeTab === "review") && (
        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeaderRow}>
            <h3 className={styles.subheading}>Moderation & Review Queue</h3>
            <span className={styles.sectionCountBadge}>{filteredReview.length} pending</span>
          </div>

          {filteredReview.length === 0 ? (
            <div className={styles.emptyStateCard}>
              <Sparkles size={22} className={styles.emptyStateIcon} />
              <p className={styles.emptyStateTitle}>No campaigns waiting in review</p>
              <p className={styles.emptyStateSub}>All submitted ads have been processed.</p>
            </div>
          ) : (
            <>
              <div className={styles.adGrid}>
                {filteredReview
                  .slice((safeReviewAdsPage - 1) * ADS_PER_PAGE, safeReviewAdsPage * ADS_PER_PAGE)
                  .map((ad) => (
                    <MyAdCard
                      key={ad.id}
                      ad={ad}
                      status="review"
                      reportsCount={reportsMap[ad.id] || 0}
                      dismissalsCount={dismissalsMap[ad.id] || 0}
                      advertiserBlockCount={advertiserBlockCount}
                      isSpecsOpen={!!expandedSpecsMap[ad.id]}
                      onToggleSpecs={() => toggleSpecsDrawer(ad.id)}
                      onOpenBooster={(a) => setBoosterAd(a)}
                      onOpenRating={(id) => setRatingAdId(id)}
                      onTogglePause={handleTogglePause}
                      onShare={handleShare}
                      onEdit={handleEditAd}
                      onCancel={handleCancelAd}
                      onExportCsv={exportCampaignCsv}
                      onShowNotice={(title, message, adId) => setNoticeModal({ title, message, adId })}
                      ratedAdIds={ratedAdIds}
                      timeNow={timeNow}
                    />
                  ))}
              </div>
              {filteredReview.length > ADS_PER_PAGE && (
                <div className={styles.paginationBar}>
                  <span className={styles.paginationInfo}>
                    Showing {(safeReviewAdsPage - 1) * ADS_PER_PAGE + 1}–
                    {Math.min(safeReviewAdsPage * ADS_PER_PAGE, filteredReview.length)} of {filteredReview.length} in review
                  </span>
                  <div className={styles.paginationControls}>
                    <button
                      className={styles.pageBtn}
                      onClick={() => setReviewAdsPage((p) => Math.max(1, p - 1))}
                      disabled={safeReviewAdsPage <= 1}
                    >
                      Prev
                    </button>
                    {renderPageButtons(safeReviewAdsPage, totalReviewPages, setReviewAdsPage)}
                    <button
                      className={styles.pageBtn}
                      onClick={() => setReviewAdsPage((p) => Math.min(totalReviewPages, p + 1))}
                      disabled={safeReviewAdsPage >= totalReviewPages}
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

      {/* Active / Paused / Completed Section */}
      {!loading && showActiveSection && (
        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeaderRow}>
            <h3 className={styles.subheading}>
              {activeTab === "paused"
                ? "Paused Campaigns"
                : activeTab === "completed"
                ? "Completed Campaigns"
                : "Active & Approved Campaigns"}
            </h3>
            <span className={styles.sectionCountBadge}>{filteredActive.length} campaigns</span>
          </div>

          {filteredActive.length === 0 ? (
            <div className={styles.emptyStateCard}>
              <Megaphone size={24} className={styles.emptyStateIcon} />
              <p className={styles.emptyStateTitle}>
                {searchQuery
                  ? "No campaigns match your search filter"
                  : activeTab === "paused"
                  ? "No paused campaigns"
                  : activeTab === "completed"
                  ? "No completed campaigns in the 48h archive window"
                  : "No active campaigns running right now"}
              </p>
              <p className={styles.emptyStateSub}>
                Launch a targeted campaign to reach verified audiences across the feed.
              </p>
              <div className={styles.postButtonContainer}>
                <Link
                  href="/logged-in"
                  onClick={() => {
                    sessionStorage.setItem("paayh_active_tab", "adPage");
                    window.dispatchEvent(new Event("paayh_tab_change"));
                  }}
                >
                  <button className={styles.postButton}>
                    <Plus size={14} /> Create New Campaign
                  </button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.adGrid}>
                {filteredActive
                  .slice((safeActiveAdsPage - 1) * ADS_PER_PAGE, safeActiveAdsPage * ADS_PER_PAGE)
                  .map((ad) => (
                    <MyAdCard
                      key={ad.id}
                      ad={ad}
                      status="active"
                      reportsCount={reportsMap[ad.id] || 0}
                      dismissalsCount={dismissalsMap[ad.id] || 0}
                      advertiserBlockCount={advertiserBlockCount}
                      isSpecsOpen={!!expandedSpecsMap[ad.id]}
                      onToggleSpecs={() => toggleSpecsDrawer(ad.id)}
                      onOpenBooster={(a) => setBoosterAd(a)}
                      onOpenRating={(id) => setRatingAdId(id)}
                      onTogglePause={handleTogglePause}
                      onShare={handleShare}
                      onEdit={handleEditAd}
                      onCancel={handleCancelAd}
                      onExportCsv={exportCampaignCsv}
                      onShowNotice={(title, message, adId) => setNoticeModal({ title, message, adId })}
                      ratedAdIds={ratedAdIds}
                      timeNow={timeNow}
                    />
                  ))}
              </div>
              {filteredActive.length > ADS_PER_PAGE && (
                <div className={styles.paginationBar}>
                  <span className={styles.paginationInfo}>
                    Showing {(safeActiveAdsPage - 1) * ADS_PER_PAGE + 1}–
                    {Math.min(safeActiveAdsPage * ADS_PER_PAGE, filteredActive.length)} of {filteredActive.length} campaigns
                  </span>
                  <div className={styles.paginationControls}>
                    <button
                      className={styles.pageBtn}
                      onClick={() => setActiveAdsPage((p) => Math.max(1, p - 1))}
                      disabled={safeActiveAdsPage <= 1}
                    >
                      Prev
                    </button>
                    {renderPageButtons(safeActiveAdsPage, totalActivePages, setActiveAdsPage)}
                    <button
                      className={styles.pageBtn}
                      onClick={() => setActiveAdsPage((p) => Math.min(totalActivePages, p + 1))}
                      disabled={safeActiveAdsPage >= totalActivePages}
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

      {/* Top-Up Booster Modal */}
      <CampaignBoosterModal
        boosterAd={boosterAd}
        onClose={() => setBoosterAd(null)}
        reportsCount={boosterAd ? reportsMap[boosterAd.id] || 0 : 0}
        onSuccess={(msg) => {
          setNoticeModal({
            title: "Campaign Boosted",
            message: msg || "Your campaign has been boosted successfully!",
          });
          clearUserCampaignsCache(session?.user?.email || "");
          fetchAds(true);
        }}
        onShowNotice={(title, message, adId) => setNoticeModal({ title, message, adId })}
      />

      {/* Contained Notice / Boost Error Modal */}
      <NoticeModal notice={noticeModal} onClose={() => setNoticeModal(null)} />

      {/* Advertiser Rating Modal for Listeners */}
      <AudienceRatingModal
        ratingAdId={ratingAdId}
        onClose={() => setRatingAdId(null)}
        onSuccess={(adId) => {
          setRatedAdIds((prev) => {
            const next = new Set([...prev, adId]);
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem("paayh_rated_ad_ids", JSON.stringify(Array.from(next)));
              } catch {}
            }
            return next;
          });
        }}
      />
    </div>
  );
}
