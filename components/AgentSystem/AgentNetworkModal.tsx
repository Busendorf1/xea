"use client";

import React, { useState, useEffect } from "react";
import type { AgentNetworkPayload } from "@/lib/agentSystem";
import type { OptOutActionType } from "./useAgentNetwork";
import AgentNetworkSummaryHeader, { type NetworkModalTab } from "./AgentNetworkSummaryHeader";
import AgentFollowersTab from "./AgentFollowersTab";
import AgentFollowingTab from "./AgentFollowingTab";
import AgentMutualsTab from "./AgentMutualsTab";
import styles from "./AgentSystem.module.css";

export type { NetworkModalTab };

export interface AgentNetworkModalProps {
  data: AgentNetworkPayload;
  initialTab?: NetworkModalTab;
  actionLoading: boolean;
  activeActionKey?: string | null;
  feedback: string | null;
  formatCurrency: (val: number | string) => string;
  onClose: () => void;
  onTriggerOptOut: (action: OptOutActionType, refereeEmail?: string) => Promise<void>;
  onRegisterAgent?: () => Promise<void>;
  onNavigateToAgentPage?: () => void;
  onRefresh?: (force?: boolean) => Promise<void>;
  onLoadMoreInvites?: () => Promise<void>;
  loadingMore?: boolean;
}

export default function AgentNetworkModal({
  data,
  initialTab = "invites",
  actionLoading,
  activeActionKey = null,
  feedback,
  formatCurrency,
  onClose,
  onTriggerOptOut,
  onNavigateToAgentPage,
  onRefresh,
  onLoadMoreInvites,
  loadingMore = false,
}: AgentNetworkModalProps) {
  const [activeTab, setActiveTab] = useState<NetworkModalTab>(initialTab);
  const [selectedFollowerKey, setSelectedFollowerKey] = useState<string | null>(null);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);
  const [selectedUpline, setSelectedUpline] = useState<boolean>(false);
  const [confirmForceOptOut, setConfirmForceOptOut] = useState<boolean>(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Real-time background sync while modal is open and visible so other user's Undo / Accept / Reject reflects automatically
  useEffect(() => {
    if (!onRefresh) return;
    const interval = setInterval(() => {
      if (!actionLoading && (typeof document === "undefined" || document.visibilityState === "visible")) {
        onRefresh(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [onRefresh, actionLoading]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const handleBecomeAgentClick = () => {
    if (onNavigateToAgentPage) {
      onNavigateToAgentPage();
    } else if (typeof window !== "undefined") {
      onClose();
      window.location.href = "/agent";
    }
  };

  const mutualList = Array.isArray(data.mutuals) ? data.mutuals : [];

  return (
    <div className={styles.modalBackdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <AgentNetworkSummaryHeader
          data={data}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          actionLoading={actionLoading}
          onClose={onClose}
          formatCurrency={formatCurrency}
          onBecomeAgent={handleBecomeAgentClick}
        />

        <div className={styles.modalBody}>
          {feedback && <div className={styles.feedbackBanner}>{feedback}</div>}

          {activeTab === "invites" ? (
            <AgentFollowersTab
              invites={data.invites}
              hasMoreInvites={Boolean(data.hasMoreInvites && data.nextCursor)}
              loadingMore={loadingMore}
              onLoadMore={onLoadMoreInvites}
              actionLoading={actionLoading}
              activeActionKey={activeActionKey}
              selectedFollowerKey={selectedFollowerKey}
              setSelectedFollowerKey={setSelectedFollowerKey}
              confirmRemoveKey={confirmRemoveKey}
              setConfirmRemoveKey={setConfirmRemoveKey}
              formatCurrency={formatCurrency}
              onTriggerOptOut={onTriggerOptOut}
            />
          ) : activeTab === "upline" ? (
            <AgentFollowingTab
              uplineAgent={data.uplineAgent}
              actionLoading={actionLoading}
              activeActionKey={activeActionKey}
              selectedUpline={selectedUpline}
              setSelectedUpline={setSelectedUpline}
              confirmForceOptOut={confirmForceOptOut}
              setConfirmForceOptOut={setConfirmForceOptOut}
              formatCurrency={formatCurrency}
              onTriggerOptOut={onTriggerOptOut}
            />
          ) : (
            <AgentMutualsTab mutualList={mutualList} />
          )}
        </div>

        {/* Become an Agent footer action disappears once the user has become an Agent */}
        {!data.isAgent && (
          <div className={styles.modalFooter}>
            <button
              type="button"
              disabled={actionLoading}
              className={styles.modalFooterAgentBtn}
              onClick={handleBecomeAgentClick}
            >
              <span>Become an Agent</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
