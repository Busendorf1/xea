"use client";

import React from "react";
import { Search } from "lucide-react";
import { Ad } from "./types";
import { FilterTab, SortOption } from "./useMyAdsDashboard";
import styles from "./page.module.css";

interface MyAdsCommandBarProps {
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  activeAds: Ad[];
  reviewAds: Ad[];
  deliveringCount: number;
  pausedCount: number;
  completedCount: number;
  autoRefreshEnabled?: boolean;
  onToggleAutoRefresh?: () => void;
}

export default function MyAdsCommandBar({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  activeAds,
  reviewAds,
  deliveringCount,
  pausedCount,
  completedCount,
  autoRefreshEnabled = false,
  onToggleAutoRefresh,
}: MyAdsCommandBarProps) {
  const approvedCount =
    activeAds.length + reviewAds.filter((a) => a.admin_statement?.startsWith("APPROVED:")).length;

  return (
    <div className={styles.commandBar}>
      <div className={styles.tabsList} role="tablist" aria-label="Filter campaigns by status">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={`${styles.tabTrigger} ${activeTab === "all" ? styles.tabTriggerActive : ""}`}
          onClick={() => onTabChange("all")}
        >
          All <span className={styles.tabCount}>{activeAds.length + reviewAds.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "active"}
          className={`${styles.tabTrigger} ${activeTab === "active" ? styles.tabTriggerActive : ""}`}
          onClick={() => onTabChange("active")}
        >
          Active <span className={styles.tabCount}>{deliveringCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "review"}
          className={`${styles.tabTrigger} ${activeTab === "review" ? styles.tabTriggerActive : ""}`}
          onClick={() => onTabChange("review")}
        >
          Pending <span className={styles.tabCount}>{reviewAds.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "approved"}
          className={`${styles.tabTrigger} ${activeTab === "approved" ? styles.tabTriggerActive : ""}`}
          onClick={() => onTabChange("approved")}
        >
          Approved <span className={styles.tabCount}>{approvedCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "paused"}
          className={`${styles.tabTrigger} ${activeTab === "paused" ? styles.tabTriggerActive : ""}`}
          onClick={() => onTabChange("paused")}
        >
          Paused <span className={styles.tabCount}>{pausedCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "completed"}
          className={`${styles.tabTrigger} ${activeTab === "completed" ? styles.tabTriggerActive : ""}`}
          onClick={() => onTabChange("completed")}
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
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search copy, location, industry..."
            className={styles.searchInput}
          />
        </div>

        <div className={styles.sortWrapper}>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className={styles.sortSelect}
            aria-label="Sort campaigns"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="views">Sort: Most Views</option>
            <option value="clicks">Sort: Most Clicks</option>
            <option value="bid">Sort: Highest Bid (CPI)</option>
          </select>
        </div>

        {onToggleAutoRefresh && (
          <button
            type="button"
            onClick={onToggleAutoRefresh}
            aria-pressed={autoRefreshEnabled}
            className={`${styles.autoRefreshBtn} ${autoRefreshEnabled ? styles.autoRefreshBtnActive : ""}`}
            title="Automatically refresh campaign metrics every 30s while this tab is visible"
          >
            <span className={autoRefreshEnabled ? styles.liveDot : styles.offlineDot} />
            <span>Live Auto-Refresh: {autoRefreshEnabled ? "ON" : "OFF"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
