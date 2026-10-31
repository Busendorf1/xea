"use client";

import React from "react";
import Link from "next/link";
import {
  Sun,
  Moon,
  LogOut,
  LayoutGrid,
  Users,
  FileCheck2,
  Sparkles,
  TrendingUp,
  Compass,
  PlusCircle,
  MessageCircle,
  Radio,
  ShieldAlert,
  AlertCircle,
  Wallet,
  BarChart3,
  FolderLock,
  Building2,
  RefreshCw,
  CheckCircle,
} from "lucide-react";
import styles from "./page.module.css";

export type AdminTab =
  | "overview"
  | "accounts"
  | "ad-approvals"
  | "highlight-approvals"
  | "active-ads"
  | "active-highlights"
  | "direct-post"
  | "help-center"
  | "send-notifications"
  | "reported-ads"
  | "queues"
  | "payout-management"
  | "master-statement"
  | "reconciliation"
  | "brand-subscribers";

export const AdminHeader = React.memo(function AdminHeader({
  email,
  theme,
  setTheme,
  mounted,
}: {
  email?: string | null;
  theme: string;
  setTheme: (t: any) => void;
  mounted: boolean;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <div className={styles.logoGroup}>
          <div className={styles.logoIcon}>X</div>
          <span className={styles.appName}>Paayh Admin Portal</span>
          <span className={styles.badgeAdmin}>Database Controller</span>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.userInfo}>
            <span className={styles.userEmail}>{email}</span>
          </div>

          <button
            onClick={() => setTheme(theme === "white" ? "dark" : "white")}
            title={mounted && theme === "white" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            aria-label="Toggle Theme"
            className={styles.adminCls_38}
          >
            {mounted && theme === "white" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <Link href="/">
            <button className={styles.btnExit}>
              <LogOut size={16} />
              <span>Exit Admin</span>
            </button>
          </Link>
        </div>
      </div>
    </header>
  );
});

export const AdminSidebar = React.memo(function AdminSidebar({
  activeTab,
  handleTabChange,
  stats,
  helpTicketsCount,
  reportedAdsCount,
  pendingSubscribersCount,
  handleRefresh,
  refreshing,
  loading,
}: {
  activeTab: AdminTab;
  handleTabChange: (tab: AdminTab) => void;
  stats: any;
  helpTicketsCount: number;
  reportedAdsCount: number;
  pendingSubscribersCount: number;
  handleRefresh: () => void;
  refreshing: boolean;
  loading: boolean;
}) {
  return (
    <aside className={styles.sidebar}>
      <button onClick={() => handleTabChange("overview")} className={`${styles.tabButton} ${activeTab === "overview" ? styles.tabButtonActive : ""}`}>
        <LayoutGrid size={18} />
        <span>Overview and Stats</span>
      </button>

      <button onClick={() => handleTabChange("accounts")} className={`${styles.tabButton} ${activeTab === "accounts" ? styles.tabButtonActive : ""}`}>
        <Users size={18} />
        <span>User Accounts ({stats.totalUsers})</span>
      </button>

      <button onClick={() => handleTabChange("ad-approvals")} className={`${styles.tabButton} ${activeTab === "ad-approvals" ? styles.tabButtonActive : ""}`}>
        <FileCheck2 size={18} />
        <span>Ad Approvals ({stats.pendingAdsCount})</span>
      </button>

      <button onClick={() => handleTabChange("highlight-approvals")} className={`${styles.tabButton} ${activeTab === "highlight-approvals" ? styles.tabButtonActive : ""}`}>
        <Sparkles size={18} />
        <span>Highlight Approvals ({stats.pendingHighlightsCount})</span>
      </button>

      <button onClick={() => handleTabChange("active-ads")} className={`${styles.tabButton} ${activeTab === "active-ads" ? styles.tabButtonActive : ""}`}>
        <TrendingUp size={18} />
        <span>Active Ads ({stats.activeAdsCount})</span>
      </button>

      <button onClick={() => handleTabChange("active-highlights")} className={`${styles.tabButton} ${activeTab === "active-highlights" ? styles.tabButtonActive : ""}`}>
        <Compass size={18} />
        <span>Active Highlights ({stats.activeHighlightsCount})</span>
      </button>

      <button onClick={() => handleTabChange("direct-post")} className={`${styles.tabButton} ${activeTab === "direct-post" ? styles.tabButtonActive : ""}`}>
        <PlusCircle size={18} />
        <span>Direct Posting Panel</span>
      </button>

      <button onClick={() => handleTabChange("help-center")} className={`${styles.tabButton} ${activeTab === "help-center" ? styles.tabButtonActive : ""}`}>
        <MessageCircle size={18} />
        <span>Help Center ({helpTicketsCount})</span>
      </button>

      <button onClick={() => handleTabChange("send-notifications")} className={`${styles.tabButton} ${activeTab === "send-notifications" ? styles.tabButtonActive : ""}`}>
        <Radio size={18} />
        <span>Send Announcements</span>
      </button>

      <button onClick={() => handleTabChange("reported-ads")} className={`${styles.tabButton} ${activeTab === "reported-ads" ? styles.tabButtonActive : ""}`}>
        <ShieldAlert size={18} />
        <span>Ad Guard / Reports ({reportedAdsCount})</span>
      </button>

      <button onClick={() => handleTabChange("queues")} className={`${styles.tabButton} ${activeTab === "queues" ? styles.tabButtonActive : ""}`}>
        <AlertCircle size={18} />
        <span>Failed Queues / DLQ</span>
      </button>

      <button onClick={() => handleTabChange("payout-management")} className={`${styles.tabButton} ${activeTab === "payout-management" ? styles.tabButtonActive : ""}`}>
        <Wallet size={18} />
        <span>Payouts & Queue Manager</span>
      </button>

      <button onClick={() => handleTabChange("master-statement")} className={`${styles.tabButton} ${activeTab === "master-statement" ? styles.tabButtonActive : ""}`}>
        <BarChart3 size={18} />
        <span>Master Statement</span>
      </button>

      <button onClick={() => handleTabChange("reconciliation")} className={`${styles.tabButton} ${activeTab === "reconciliation" ? styles.tabButtonActive : ""}`}>
        <FolderLock size={18} />
        <span>Financial Reconciliation</span>
      </button>

      <button onClick={() => handleTabChange("brand-subscribers")} className={`${styles.tabButton} ${activeTab === "brand-subscribers" ? styles.tabButtonActive : ""}`}>
        <Building2 size={18} />
        <span>Brand Subscribers {pendingSubscribersCount > 0 ? `(${pendingSubscribersCount})` : ""}</span>
      </button>

      <div className={styles.adminCls_39}>
        <button onClick={handleRefresh} disabled={refreshing || loading} className={`${styles.btnAction} ${styles.adminCls_40}`}>
          <RefreshCw size={14} className={refreshing ? "spin" : ""} />
          <span>{refreshing ? "Syncing..." : "Sync Database"}</span>
        </button>
      </div>
    </aside>
  );
});

export const AdminCampaignQueueOrActiveSection = React.memo(function AdminCampaignQueueOrActiveSection({
  mode,
  loading,
  items,
  count,
  page,
  setPage,
  searchQuery,
  setSearchQuery,
  renderCard,
  renderPagination,
}: {
  mode: "ad-approvals" | "highlight-approvals" | "active-ads" | "active-highlights";
  loading: boolean;
  items: any[];
  count: number;
  page: number;
  setPage: (p: number) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  renderCard: (item: any, isQueue: boolean) => React.ReactNode;
  renderPagination: (page: number, setPage: (p: number) => void, count: number) => React.ReactNode;
}) {
  const isQueue = mode === "ad-approvals" || mode === "highlight-approvals";
  const isHighlight = mode === "highlight-approvals" || mode === "active-highlights";

  const title =
    mode === "ad-approvals"
      ? `Advert Approvals Queue (${count})`
      : mode === "highlight-approvals"
      ? `Highlights Approvals Queue (${count})`
      : mode === "active-ads"
      ? `Active Adverts Registry (${count})`
      : `Active Highlights Registry (${count})`;

  const subtitle =
    mode === "ad-approvals"
      ? "Verify submitted ad campaigns. Approved campaigns await advertiser payment before launch. Rejections provide feedback for advertiser revision."
      : mode === "highlight-approvals"
      ? "Review submitted business highlights. Approved highlights await advertiser payment before launch. Rejections provide feedback for user revision."
      : mode === "active-ads"
      ? "Monitor live campaigns, track views, toggle pauses, edit details, and suspend campaigns."
      : "Monitor live business highlights, edit contents, and suspend highlights from the feeds.";

  return (
    <>
      <div>
        <h1 className={styles.sectionTitle}>{title}</h1>
        <p className={styles.sectionSubtitle}>{subtitle}</p>
      </div>

      {!isQueue && setSearchQuery && (
        <div className={styles.searchBar}>
          <input
            type="text"
            placeholder={
              isHighlight
                ? "Filter active highlights by title, publisher, category..."
                : "Filter active ads by publisher, content, category..."
            }
            value={searchQuery || ""}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className={styles.inputSearch}
          />
        </div>
      )}

      {loading ? (
        <div className={styles.loadingText}>
          {isQueue ? "Syncing review queue..." : isHighlight ? "Loading active highlights..." : "Loading active campaigns..."}
        </div>
      ) : items.length === 0 ? (
        <div className={styles.emptyText}>
          {isQueue ? (
            <>
              <CheckCircle size={32} className={styles.adminCls_52} />
              <span>{isHighlight ? "No highlights in the review queue. All caught up!" : "No campaigns in the review queue. All caught up!"}</span>
            </>
          ) : isHighlight ? (
            "No active business highlights found matching filters."
          ) : (
            "No active campaigns found matching filters."
          )}
        </div>
      ) : (
        <>
          <div className={isHighlight ? styles.queueGrid : styles.adminCls_53}>
            {items.map((item) => renderCard(item, isQueue))}
          </div>
          {renderPagination(page, setPage, count)}
        </>
      )}
    </>
  );
});
