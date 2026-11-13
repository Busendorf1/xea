"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { RotateCw, Plus } from "lucide-react";
import { Session } from "./types";
import { exportHighlightToCsv, HIGHLIGHTS_PER_PAGE } from "./newsDashboardUtils";
import { clearUserCampaignsCache } from "@/lib/campaignsClient";
import HighlightKpiSummary from "./HighlightKpiSummary";
import MyHighlightCard from "./MyHighlightCard";
import HighlightBoosterModal from "./HighlightBoosterModal";
import PublishHighlightPaymentModal from "./PublishHighlightPaymentModal";
import NoticeModal from "../MyAds/NoticeModal";
import MyNewsCommandBar from "./MyNewsCommandBar";
import MyNewsPagination from "./MyNewsPagination";
import { useMyNewsDashboard } from "./useMyNewsDashboard";
import styles from "../MyAds/page.module.css";

type MyNewsProps = {
  session: Session;
};

export default function MyNewsDashboard({ session }: MyNewsProps) {
  const {
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
  } = useMyNewsDashboard(session);

  const reviewSectionRef = useRef<HTMLElement | null>(null);
  const activeSectionRef = useRef<HTMLElement | null>(null);

  const smoothScrollTo = (ref: React.RefObject<HTMLElement | null>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const totalReviewPages = Math.max(1, Math.ceil(filteredReview.length / HIGHLIGHTS_PER_PAGE));
  const safeReviewNewsPage = Math.min(Math.max(1, reviewNewsPage), totalReviewPages);

  const totalActivePages = Math.max(1, Math.ceil(filteredActive.length / HIGHLIGHTS_PER_PAGE));
  const safeActiveNewsPage = Math.min(Math.max(1, activeNewsPage), totalActivePages);

  const showPendingSection =
    activeTab === "all" ||
    activeTab === "pending" ||
    (activeTab === "approved" && filteredReview.length > 0) ||
    (activeTab === "paused" && filteredReview.length > 0);
  const showApprovedSection = activeTab !== "pending";

  return (
    <div className={styles.feedContainer}>
      <div className={styles.headerBar}>
        <div className={styles.headerTitleGroup}>
          <h2 className={styles.headerTitle}>Highlights</h2>
          <p className={styles.headerSubtitle}>
            Status, 1–90 day scheduled expiry, and spotlight placement.
          </p>
        </div>

        <div className={styles.headerActionsGroup}>
          <button
            type="button"
            disabled={loading || refreshing}
            onClick={() => fetchNews(true)}
            className={styles.refreshAdsBtn}
            title="Force-fetch latest highlights status from database"
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
              sessionStorage.setItem("paayh_active_tab", "news");
              window.dispatchEvent(new Event("paayh_tab_change"));
            }}
          >
            <Plus size={14} />
            <span>New Highlight</span>
          </Link>
        </div>
      </div>

      {!loading && (
        <HighlightKpiSummary
          activeLiveCount={activeLiveCount}
          pendingCount={reviewNews.length}
          approvedTotalCount={activeNews.length}
          biddedCount={biddedCount}
          totalScheduleDays={totalScheduleDays}
        />
      )}

      <MyNewsCommandBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setActiveNewsPage(1);
          setReviewNewsPage(1);
        }}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setActiveNewsPage(1);
          setReviewNewsPage(1);
        }}
        sortBy={sortBy}
        onSortChange={setSortBy}
        activeNews={activeNews}
        reviewNews={reviewNews}
        activeLiveCount={activeLiveCount}
        pausedCount={pausedCount}
      />

      {loading && <div className={styles.loading}>Loading highlights &amp; schedule status…</div>}
      {!loading && errorMessage && (
        <div className={styles.error} role="alert">
          <span>{errorMessage}</span>{" "}
          <button
            type="button"
            onClick={() => fetchNews(true)}
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

      {!loading && showPendingSection && (filteredReview.length > 0 || activeTab === "pending") && (
        <section ref={reviewSectionRef} className={styles.sectionBlock}>
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
                      onExportCsv={(it) => exportHighlightToCsv(it, true, timeNow)}
                      onDelete={handleDeleteHighlight}
                      onPublish={(h) => setPublishingHighlight(h)}
                      onOpenBooster={(h) => setBoosterHighlight(h)}
                      actionLoading={actionLoadingId === item.id}
                      timeNow={timeNow}
                    />
                  ))}
              </div>
              <MyNewsPagination
                currentPage={safeReviewNewsPage}
                totalItems={filteredReview.length}
                perPage={HIGHLIGHTS_PER_PAGE}
                itemLabel="pending"
                onPageChange={(pg) => {
                  setReviewNewsPage(pg);
                  smoothScrollTo(reviewSectionRef);
                }}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMoreNews}
              />
            </>
          )}
        </section>
      )}

      {!loading && showApprovedSection && (
        <section ref={activeSectionRef} className={styles.sectionBlock}>
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
              <p className={styles.emptyStateSub}>
                Publish a highlight to feature your announcement at the top of the feed.
              </p>
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
                      onExportCsv={(it) => exportHighlightToCsv(it, false, timeNow)}
                      onDelete={handleDeleteHighlight}
                      onPublish={(h) => setPublishingHighlight(h)}
                      onOpenBooster={(h) => setBoosterHighlight(h)}
                      actionLoading={actionLoadingId === item.id}
                      timeNow={timeNow}
                    />
                  ))}
              </div>
              <MyNewsPagination
                currentPage={safeActiveNewsPage}
                totalItems={filteredActive.length}
                perPage={HIGHLIGHTS_PER_PAGE}
                itemLabel="highlights"
                onPageChange={(pg) => {
                  setActiveNewsPage(pg);
                  smoothScrollTo(activeSectionRef);
                }}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMoreNews}
              />
            </>
          )}
        </section>
      )}

      <HighlightBoosterModal
        item={boosterHighlight}
        onClose={() => setBoosterHighlight(null)}
        userBalance={userWalletBalance}
        onSuccess={(msg) => {
          setBoosterHighlight(null);
          setNoticeModal({
            title: "Highlight Boosted & Live!",
            message:
              msg ||
              "Your highlight has been boosted successfully! Schedule duration and priority delivery have been updated and are actively delivering.",
          });
          clearUserCampaignsCache(session?.user?.email || "");
          fetchNews(true);
        }}
        onShowNotice={(title, message) => setNoticeModal({ title, message })}
      />

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

      <NoticeModal notice={noticeModal} onClose={() => setNoticeModal(null)} />
    </div>
  );
}
