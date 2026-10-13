"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { Ad, Session } from "./types";
import { fetchUserCampaignsShared, clearUserCampaignsCache } from "@/lib/campaignsClient";
import CampaignKpiSummary from "./CampaignKpiSummary";
import MyAdCard, { getCampaignDaysInfo } from "./MyAdCard";
import CampaignBoosterModal from "./CampaignBoosterModal";
import AudienceRatingModal from "./AudienceRatingModal";
import NoticeModal from "./NoticeModal";
import styles from "./page.module.css";

type MyAdsProps = {
  session: Session;
};

export default function MyAdsDashboard({ session }: MyAdsProps) {
  const [reviewAds, setReviewAds] = useState<Ad[]>([]);
  const [activeAds, setActiveAds] = useState<Ad[]>([]);
  const [activeAdsPage, setActiveAdsPage] = useState<number>(1);
  const [reviewAdsPage, setReviewAdsPage] = useState<number>(1);
  const ADS_PER_PAGE = 10;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [timeNow, setTimeNow] = useState(Date.now());

  // Analytics & Health Metrics
  const [reportsMap, setReportsMap] = useState<Record<string, number>>({});
  const [dismissalsMap, setDismissalsMap] = useState<Record<string, number>>({});
  const [advertiserBlockCount, setAdvertiserBlockCount] = useState<number>(0);

  // Expandable Specs Drawer State
  const [expandedSpecsMap, setExpandedSpecsMap] = useState<Record<string, boolean>>({});

  // Modals
  const [boosterAd, setBoosterAd] = useState<Ad | null>(null);
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; adId?: string } | null>(null);
  const [ratingAdId, setRatingAdId] = useState<string | null>(null);
  const [ratedAdIds, setRatedAdIds] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("paayh_rated_ad_ids");
        if (stored) return new Set(JSON.parse(stored));
      } catch {}
    }
    return new Set();
  });

  const toggleSpecsDrawer = (adId: string) => {
    setExpandedSpecsMap((prev) => ({ ...prev, [adId]: !prev[adId] }));
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeNow(Date.now());
    }, 10000); // 10s countdown updater
    return () => clearInterval(timer);
  }, []);

  const fetchAds = async (bypassCache: boolean = false) => {
    const email = session?.user?.email;
    if (!email) return;

    const cacheKey = `my_ads_cache_${email.toLowerCase()}`;
    const THIRTY_SECONDS = 30 * 1000;

    if (!bypassCache && typeof window !== "undefined") {
      try {
        const cachedRaw = sessionStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && cached.timestamp && Date.now() - cached.timestamp < THIRTY_SECONDS) {
            setReviewAds(cached.reviewAds || []);
            setActiveAds(cached.activeAds || []);
            setReportsMap(cached.reportsMap || {});
            setDismissalsMap(cached.dismissalsMap || {});
            setAdvertiserBlockCount(cached.advertiserBlockCount || 0);
            setLoading(false);
            return;
          }
        }
      } catch (cacheErr) {
        console.warn("sessionStorage cache read error:", cacheErr);
      }
    }

    try {
      const [campaignsRes, analyticsRes] = await Promise.all([
        fetchUserCampaignsShared(email, bypassCache),
        fetch("/api/campaigns/analytics")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

      if (!campaignsRes) {
        throw new Error("Failed to fetch campaigns");
      }

      const reviewData = campaignsRes.adsQueue || [];
      const activeData = campaignsRes.adsActive || [];
      let reports = {};
      let dismissals = {};
      let blockCount = 0;

      if (analyticsRes && analyticsRes.success) {
        reports = analyticsRes.reportsMap || {};
        dismissals = analyticsRes.dismissalsMap || {};
        blockCount = analyticsRes.advertiserBlockCount || 0;
      }

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

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              timestamp: Date.now(),
              reviewAds: reviewData,
              activeAds: activeData,
              reportsMap: reports,
              dismissalsMap: dismissals,
              advertiserBlockCount: blockCount,
            })
          );
        } catch (e) {
          console.warn("sessionStorage cache write error:", e);
        }
      }
    } catch (err) {
      console.error("Error in fetchAds:", err);
      setError(true);
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

  const totalReviewPages = Math.max(1, Math.ceil(reviewAds.length / ADS_PER_PAGE));
  const safeReviewAdsPage = Math.min(Math.max(1, reviewAdsPage), totalReviewPages);

  const totalActivePages = Math.max(1, Math.ceil(activeAds.length / ADS_PER_PAGE));
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

  return (
    <div className={styles.feedContainer}>
      <div className={styles.headerBar}>
        <h2 className={styles.headerTitle}>My Ad Campaigns</h2>
        <button
          type="button"
          onClick={() => fetchAds(true)}
          className={styles.refreshAdsBtn}
          title="Force-fetch latest ad campaigns and metrics from database"
        >
          <motion.span
            animate={{ rotate: loading ? 360 : 0 }}
            transition={{ repeat: loading ? Infinity : 0, duration: 1, ease: "linear" }}
            style={{ display: "inline-flex" }}
          >
            <RotateCw size={13} />
          </motion.span>
          <span>Refresh Ads</span>
        </button>
      </div>

      {loading && <p className={styles.loading}>Loading ads…</p>}
      {!loading && error && <p className={styles.error}>Error loading ads.</p>}

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

      <h3 className={styles.subheading}>Ads in Review ({reviewAds.length})</h3>
      {!loading && reviewAds.length === 0 && <p className={styles.noAds}>No ads in review.</p>}
      <div className={styles.adGrid}>
        {reviewAds
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
      {reviewAds.length > ADS_PER_PAGE && (
        <div className={styles.paginationBar}>
          <span className={styles.paginationInfo}>
            Showing {(safeReviewAdsPage - 1) * ADS_PER_PAGE + 1}–
            {Math.min(safeReviewAdsPage * ADS_PER_PAGE, reviewAds.length)} of {reviewAds.length} in review
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

      <h3 className={styles.subheading}>Active Ads ({activeAds.length})</h3>
      {!loading && activeAds.length === 0 ? (
        <>
          <p className={styles.noAds}>You do not have any active ads. Post one now!</p>
          <div className={styles.postButtonContainer}>
            <Link
              href="/logged-in"
              onClick={() => {
                sessionStorage.setItem("paayh_active_tab", "adPage");
                window.dispatchEvent(new Event("paayh_tab_change"));
              }}
            >
              <button className={styles.postButton}>Post an Ad</button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className={styles.adGrid}>
            {activeAds
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
          {activeAds.length > ADS_PER_PAGE && (
            <div className={styles.paginationBar}>
              <span className={styles.paginationInfo}>
                Showing {(safeActiveAdsPage - 1) * ADS_PER_PAGE + 1}–
                {Math.min(safeActiveAdsPage * ADS_PER_PAGE, activeAds.length)} of {activeAds.length} active
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
