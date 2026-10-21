"use client";

import React from "react";
import {
  Users,
  TrendingUp,
  Sparkles,
  Wallet,
  Activity,
  ShieldAlert,
  MessageCircle,
  Pause,
  Eye,
  EyeOff,
} from "lucide-react";
import styles from "./page.module.css";

export interface AdminStats {
  totalUsers: number;
  monetizedUsers: number;
  activeAdsCount: number;
  pendingAdsCount: number;
  activeHighlightsCount: number;
  pendingHighlightsCount: number;
  totalBalance: number;
  totalWithdrawal: number;
  totalClicks: number;
  clickRate: number;
  totalMutuals: number;
  reportedCount: number;
  helpTicketsCount: number;
  pausedAdsCount: number;
}

interface AdminOverviewTabProps {
  loading: boolean;
  stats: AdminStats;
  showAdminBalance: boolean;
  toggleAdminBalance: () => void;
  formatCurrency: (amount: number | string) => string;
}

export default function AdminOverviewTab({
  loading,
  stats,
  showAdminBalance,
  toggleAdminBalance,
  formatCurrency,
}: AdminOverviewTabProps) {
  return (
    <>
      <div>
        <h1 className={styles.sectionTitle}>System Overview</h1>
        <p className={styles.sectionSubtitle}>Operational metrics and system telemetry.</p>
      </div>

      {loading ? (
        <div className={styles.loadingText}>Syncing metrics with database...</div>
      ) : (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Total Registrations</span>
              <div className={styles.statIconBox}><Users size={16} color="var(--primary)" /></div>
            </div>
            <span className={styles.statValue}>{stats.totalUsers}</span>
            <span className={styles.statDesc}>{stats.monetizedUsers} Monetized profiles</span>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Adverts Campaigns</span>
              <div className={styles.statIconBox}><TrendingUp size={16} color="#3b82f6" /></div>
            </div>
            <span className={styles.statValue}>{stats.activeAdsCount}</span>
            <span className={styles.statDesc}>{stats.pendingAdsCount} awaiting admin approval</span>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Daily Highlights</span>
              <div className={styles.statIconBox}><Sparkles size={16} color="#f59e0b" /></div>
            </div>
            <span className={styles.statValue}>{stats.activeHighlightsCount}</span>
            <span className={styles.statDesc}>{stats.pendingHighlightsCount} awaiting admin approval</span>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Wallet Liability</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={toggleAdminBalance}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "2px",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                  title={showAdminBalance ? "Hide balance figures" : "Show balance figures"}
                  aria-label={showAdminBalance ? "Hide balance figures" : "Show balance figures"}
                >
                  {showAdminBalance ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <div className={styles.statIconBox}><Wallet size={16} color="#10b981" /></div>
              </div>
            </div>
            <span className={styles.statValue}>{showAdminBalance ? formatCurrency(stats.totalBalance) : "₦••••••••"}</span>
            <span className={styles.statDesc}>{showAdminBalance ? formatCurrency(stats.totalWithdrawal) : "₦••••••••"} in withdrawals processing</span>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Total Ad Views</span>
              <div className={styles.statIconBox}><Activity size={16} color="#6366f1" /></div>
            </div>
            <span className={styles.statValue}>{stats.totalClicks}</span>
            <span className={styles.statDesc}>Clicks CTR Rate: {stats.clickRate.toFixed(2)}%</span>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Aggregated Mutuals</span>
              <div className={styles.statIconBox}><Users size={16} color="#06b6d4" /></div>
            </div>
            <span className={styles.statValue}>{stats.totalMutuals}</span>
            <span className={styles.statDesc}>Mutual bonds active across profiles</span>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Ad Guard and Reports</span>
              <div className={styles.statIconBox}><ShieldAlert size={16} color="#ef4444" /></div>
            </div>
            <span className={styles.statValue}>{stats.reportedCount}</span>
            <span className={styles.statDesc}>Reported ads, advertisers and hidden items</span>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Help Center Complaints</span>
              <div className={styles.statIconBox}><MessageCircle size={16} color="#8b5cf6" /></div>
            </div>
            <span className={styles.statValue}>{stats.helpTicketsCount}</span>
            <span className={styles.statDesc}>Total user tickets and complaints filed</span>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Paused Ad Campaigns</span>
              <div className={styles.statIconBox}><Pause size={16} color="#eab308" /></div>
            </div>
            <span className={styles.statValue}>{stats.pausedAdsCount}</span>
            <span className={styles.statDesc}>Campaigns currently paused</span>
          </div>
        </div>
      )}
    </>
  );
}
