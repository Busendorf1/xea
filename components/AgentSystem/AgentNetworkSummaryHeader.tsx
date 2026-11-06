"use client";

import React from "react";
import { X } from "lucide-react";
import type { AgentNetworkPayload } from "@/lib/agentSystem";
import { formatCompactCount } from "./useAgentNetwork";
import styles from "./AgentSystem.module.css";

export type NetworkModalTab = "invites" | "upline" | "mutuals";

export interface AgentNetworkSummaryHeaderProps {
  data: AgentNetworkPayload;
  activeTab: NetworkModalTab;
  setActiveTab: (tab: NetworkModalTab) => void;
  actionLoading: boolean;
  onClose: () => void;
  formatCurrency: (val: number | string) => string;
  onBecomeAgent?: () => void;
}

export default function AgentNetworkSummaryHeader({
  data,
  activeTab,
  setActiveTab,
  actionLoading,
  onClose,
  formatCurrency,
  onBecomeAgent,
}: AgentNetworkSummaryHeaderProps) {
  const mutualList = Array.isArray(data.mutuals) ? data.mutuals : [];
  const mutualTotal = typeof data.mutualsCount === "number" ? data.mutualsCount : mutualList.length;

  return (
    <>
      <div className={styles.modalHeader}>
        <div className={styles.modalTitleWrap}>
          <div className={styles.titleRow}>
            <h3 className={styles.modalTitle}>Invites</h3>
            {!data.isAgent && onBecomeAgent && (
              <button
                type="button"
                disabled={actionLoading}
                className={styles.headerAgentBtn}
                onClick={onBecomeAgent}
                title="Register as an official platform agent"
              >
                Become an Agent
              </button>
            )}
          </div>
          <p className={styles.modalSubtitle}>Referral &amp; Followers</p>
        </div>
        <button
          type="button"
          disabled={actionLoading}
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close modal"
        >
          <X size={16} />
        </button>
      </div>

      {/* Three Columns: Followers, Following, Mutuals */}
      <div className={styles.tabsRow} role="tablist">
        <button
          type="button"
          role="tab"
          disabled={actionLoading}
          aria-selected={activeTab === "invites"}
          className={`${styles.tabBtn} ${activeTab === "invites" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("invites")}
        >
          <span>Followers ({formatCompactCount(data.invitesCount)})</span>
          {data.pendingOptOutRequestsCount > 0 && <span className={styles.pendingDot} />}
        </button>
        <button
          type="button"
          role="tab"
          disabled={actionLoading}
          aria-selected={activeTab === "upline"}
          className={`${styles.tabBtn} ${activeTab === "upline" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("upline")}
        >
          <span>Following ({formatCompactCount(data.uplineAgentsCount)})</span>
        </button>
        <button
          type="button"
          role="tab"
          disabled={actionLoading}
          aria-selected={activeTab === "mutuals"}
          className={`${styles.tabBtn} ${activeTab === "mutuals" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("mutuals")}
        >
          <span>Mutuals ({mutualTotal}/50)</span>
        </button>
      </div>

      {activeTab === "invites" ? (
        <div className={styles.summaryBar}>
          <span className={styles.summaryLabel}>Earned</span>
          <span className={styles.summaryAmount}>{formatCurrency(data.totalAgentEarned)}</span>
        </div>
      ) : activeTab === "upline" ? (
        <div className={styles.summaryBar}>
          <span className={styles.summaryLabel}>Gained</span>
          <span className={styles.summaryAmount}>
            {formatCurrency(data.uplineAgent?.totalGainedFromMe || 0)}
          </span>
        </div>
      ) : (
        <div className={styles.summaryBar}>
          <span className={styles.summaryLabel}>Mutuals</span>
          <span className={styles.summaryAmount}>{mutualTotal} / 50</span>
        </div>
      )}
    </>
  );
}
