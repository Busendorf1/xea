"use client";

import React from "react";
import { Search } from "lucide-react";
import { HighlightItem } from "./types";
import { HighlightFilterTab, HighlightSortOption } from "./newsDashboardUtils";
import styles from "../MyAds/page.module.css";

interface MyNewsCommandBarProps {
  activeTab: HighlightFilterTab;
  onTabChange: (tab: HighlightFilterTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: HighlightSortOption;
  onSortChange: (sort: HighlightSortOption) => void;
  activeNews: HighlightItem[];
  reviewNews: HighlightItem[];
  activeLiveCount: number;
  pausedCount: number;
}

export default function MyNewsCommandBar({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  activeNews,
  reviewNews,
  activeLiveCount,
  pausedCount,
}: MyNewsCommandBarProps) {
  const approvedCount =
    activeNews.length + reviewNews.filter((h) => h.admin_statement?.startsWith("APPROVED:")).length;

  return (
    <div className={styles.commandBar}>
      <div className={styles.tabsList} role="tablist" aria-label="Filter highlights by status">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={`${styles.tabTrigger} ${activeTab === "all" ? styles.tabTriggerActive : ""}`}
          onClick={() => onTabChange("all")}
        >
          All <span className={styles.tabCount}>{activeNews.length + reviewNews.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "active"}
          className={`${styles.tabTrigger} ${activeTab === "active" ? styles.tabTriggerActive : ""}`}
          onClick={() => onTabChange("active")}
        >
          Active <span className={styles.tabCount}>{activeLiveCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pending"}
          className={`${styles.tabTrigger} ${activeTab === "pending" ? styles.tabTriggerActive : ""}`}
          onClick={() => onTabChange("pending")}
        >
          Pending <span className={styles.tabCount}>{reviewNews.length}</span>
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
      </div>

      <div className={styles.commandControls}>
        <div className={styles.searchBox}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search title, story, category, location..."
            className={styles.searchInput}
          />
        </div>

        <div className={styles.sortWrapper}>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as HighlightSortOption)}
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
  );
}
