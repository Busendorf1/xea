"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { RotateCw, Plus } from "lucide-react";
import { Session } from "./types";
import { exportCampaignToCsv } from "./adUtils";
import { clearUserCampaignsCache } from "@/lib/campaignsClient";
import CampaignKpiSummary from "./CampaignKpiSummary";
import MyAdsAnalyticsPanel from "./MyAdsAnalyticsPanel";
import MyAdCard from "./MyAdCard";
import MyAdsCommandBar from "./MyAdsCommandBar";
import MyAdsPagination from "./MyAdsPagination";
import CampaignBoosterModal from "./CampaignBoosterModal";
import PublishAdPaymentModal from "./PublishAdPaymentModal";
import AudienceRatingModal from "./AudienceRatingModal";
import NoticeModal from "./NoticeModal";
import { useMyAdsDashboard, ADS_PER_PAGE } from "./useMyAdsDashboard";
import styles from "./page.module.css";

type MyAdsProps = {
  session: Session;
};

export default function MyAdsDashboard({ session }: MyAdsProps) {
  const {
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
  } = useMyAdsDashboard(session);

  const reviewSectionRef = useRef<HTMLElement | null>(null);
  const activeSectionRef = useRef<HTMLElement | null>(null);

  const smoothScrollTo = (ref: React.RefObject<HTMLElement | null>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const totalReviewPages = Math.max(1, Math.ceil(filteredReview.length / ADS_PER_PAGE));
  const safeReviewAdsPage = Math.min(Math.max(1, reviewAdsPage), totalReviewPages);

  const totalActivePages = Math.max(1, Math.ceil(filteredActive.length / ADS_PER_PAGE));
  const safeActiveAdsPage = Math.min(Math.max(1, activeAdsPage), totalActivePages);

  const showReviewSection =
    activeTab === "all" ||
    activeTab === "review" ||
    (activeTab === "approved" && filteredReview.length > 0);
  const showActiveSection = activeTab !== "review";

  return (
    <div className={styles.feedContainer}>
      <div className={styles.headerBar}>
        <div className={styles.headerTitleGroup}>
          <h2 className={styles.headerTitle}>Campaigns</h2>
          <p className={styles.headerSubtitle}>Delivery metrics, targeting specs, and bidding controls.</p>
        </div>

        <div className={styles.headerActionsGroup}>
          <button
            type="button"
            disabled={loading || refreshing}
            onClick={() => fetchAds(true)}
            className={styles.refreshAdsBtn}
            title="Force-fetch latest ad campaigns and metrics from database"
          >
            <motion.span
              animate={{ rotate: loading || refreshing ? 360 : 0 }}
              transition={{ repeat: loading || refreshing ? Infinity : 0, duration: 1, ease: "linear" }}
              style={{ display: "inline-flex" }}
            >
              <RotateCw size={13} />
            </motion.span>
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
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
            <span>New Campaign</span>
          </Link>
        </div>
      </div>

      {!loading && (
        <>
          <CampaignKpiSummary
            activeCount={activeAds.length}
            reviewCount={reviewAds.length}
            totalImpressions={totalImpressionsDelivered}
            totalClicks={totalClicksCount}
            totalMutuals={totalMutualsGained}
          />
          <MyAdsAnalyticsPanel
            series={analyticsSeries}
            summary={analyticsSummary}
            currencyCountry={activeAds[0]?.country || reviewAds[0]?.country || "Nigeria"}
            autoRefreshEnabled={autoRefreshEnabled}
          />
        </>
      )}

      <MyAdsCommandBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setActiveAdsPage(1);
          setReviewAdsPage(1);
        }}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setActiveAdsPage(1);
          setReviewAdsPage(1);
        }}
        sortBy={sortBy}
        onSortChange={setSortBy}
        activeAds={activeAds}
        reviewAds={reviewAds}
        deliveringCount={deliveringCount}
        pausedCount={pausedCount}
        completedCount={completedCount}
        autoRefreshEnabled={autoRefreshEnabled}
        onToggleAutoRefresh={toggleAutoRefresh}
      />

      {loading && <div className={styles.loading}>Loading campaigns &amp; telemetry…</div>}
      {!loading && errorMessage && (
        <div className={styles.error} role="alert">
          <span>{errorMessage}</span>{" "}
          <button
            type="button"
            onClick={() => fetchAds(true)}
            disabled={refreshing}
            style={{
              marginLeft: 10,
              textDecoration: "underline",
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && showReviewSection && (filteredReview.length > 0 || activeTab === "review") && (
        <section ref={reviewSectionRef} className={styles.sectionBlock}>
          <div className={styles.sectionHeaderRow}>
            <h3 className={styles.subheading}>
              {activeTab === "approved" ? "Approved Campaigns (Ready to Publish)" : "In Review"}
            </h3>
            <span className={styles.sectionCountBadge}>
              {filteredReview.length} {activeTab === "approved" ? "approved" : "pending"}
            </span>
          </div>

          {filteredReview.length === 0 ? (
            <div className={styles.emptyStateCard}>
              <p className={styles.emptyStateTitle}>
                {activeTab === "approved" ? "No approved campaigns awaiting payment" : "No campaigns in review"}
              </p>
              <p className={styles.emptyStateSub}>
                {activeTab === "approved"
                  ? "Approved campaigns ready to pay and launch appear here."
                  : "Submitted campaigns appear here for approval."}
              </p>
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
                      analyticsSeries={adAnalyticsMap[ad.id]}
                      isSpecsOpen={!!expandedSpecsMap[ad.id]}
                      onToggleSpecs={() => toggleSpecsDrawer(ad.id)}
                      onOpenBooster={(a) => setBoosterAd(a)}
                      onOpenRating={(id) => setRatingAdId(id)}
                      onTogglePause={handleTogglePause}
                      onShare={handleShare}
                      onEdit={handleEditAd}
                      onCancel={handleCancelAd}
                      onPublish={(a) => setPublishingAd(a)}
                      onExportCsv={(a) => exportCampaignToCsv(a, timeNow)}
                      onShowNotice={(title, message, adId) => setNoticeModal({ title, message, adId })}
                      actionLoading={actionLoadingId === ad.id}
                      ratedAdIds={ratedAdIds}
                      timeNow={timeNow}
                    />
                  ))}
              </div>
              <MyAdsPagination
                currentPage={safeReviewAdsPage}
                totalItems={filteredReview.length}
                perPage={ADS_PER_PAGE}
                itemLabel="in review"
                onPageChange={(pg) => {
                  setReviewAdsPage(pg);
                  smoothScrollTo(reviewSectionRef);
                }}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMoreAds}
              />
            </>
          )}
        </section>
      )}

      {!loading && showActiveSection && (
        <section ref={activeSectionRef} className={styles.sectionBlock}>
          <div className={styles.sectionHeaderRow}>
            <h3 className={styles.subheading}>
              {activeTab === "paused" ? "Paused" : activeTab === "completed" ? "Completed" : "Active Campaigns"}
            </h3>
            <span className={styles.sectionCountBadge}>{filteredActive.length} campaigns</span>
          </div>

          {filteredActive.length === 0 ? (
            <div className={styles.emptyStateCard}>
              <p className={styles.emptyStateTitle}>
                {searchQuery
                  ? "No campaigns match your search filter"
                  : activeTab === "paused"
                  ? "No paused campaigns"
                  : activeTab === "completed"
                  ? "No completed campaigns in the 48h archive window"
                  : "No active campaigns running right now"}
              </p>
              <p className={styles.emptyStateSub}>Create a campaign to reach audiences across the feed.</p>
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
                      analyticsSeries={adAnalyticsMap[ad.id]}
                      isSpecsOpen={!!expandedSpecsMap[ad.id]}
                      onToggleSpecs={() => toggleSpecsDrawer(ad.id)}
                      onOpenBooster={(a) => setBoosterAd(a)}
                      onOpenRating={(id) => setRatingAdId(id)}
                      onTogglePause={handleTogglePause}
                      onShare={handleShare}
                      onEdit={handleEditAd}
                      onCancel={handleCancelAd}
                      onExportCsv={(a) => exportCampaignToCsv(a, timeNow)}
                      onShowNotice={(title, message, adId) => setNoticeModal({ title, message, adId })}
                      actionLoading={actionLoadingId === ad.id}
                      ratedAdIds={ratedAdIds}
                      timeNow={timeNow}
                    />
                  ))}
              </div>
              <MyAdsPagination
                currentPage={safeActiveAdsPage}
                totalItems={filteredActive.length}
                perPage={ADS_PER_PAGE}
                itemLabel="campaigns"
                onPageChange={(pg) => {
                  setActiveAdsPage(pg);
                  smoothScrollTo(activeSectionRef);
                }}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMoreAds}
              />
            </>
          )}
        </section>
      )}

      <PublishAdPaymentModal
        isOpen={!!publishingAd}
        onClose={() => setPublishingAd(null)}
        ad={publishingAd}
        userBalance={userWalletBalance}
        onSuccess={(_publishedAd) => {
          setPublishingAd(null);
          setNoticeModal({
            title: "Campaign Published & Live!",
            message: "Your campaign has been paid and is now actively delivering in the feed.",
          });
          clearUserCampaignsCache(session?.user?.email || "");
          fetchAds(true);
        }}
      />

      <CampaignBoosterModal
        boosterAd={boosterAd}
        onClose={() => setBoosterAd(null)}
        reportsCount={boosterAd ? reportsMap[boosterAd.id] || 0 : 0}
        userBalance={userWalletBalance}
        onSuccess={(msg) => {
          setNoticeModal({
            title: "Campaign Boosted!",
            message: msg || "Your campaign has been boosted successfully and priority feed placement is now active!",
          });
          clearUserCampaignsCache(session?.user?.email || "");
          fetchAds(true);
        }}
        onShowNotice={(title, message, adId) => setNoticeModal({ title, message, adId })}
      />

      <NoticeModal notice={noticeModal} onClose={() => setNoticeModal(null)} />

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
