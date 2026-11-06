"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";
import { useAgentNetwork, formatCompactCount } from "./useAgentNetwork";
import type { NetworkModalTab } from "./AgentNetworkModal";
import styles from "./AgentSystem.module.css";

const AgentNetworkModal = dynamic(() => import("./AgentNetworkModal"), {
  ssr: false,
});

export function AgentProfileStats({
  mutualCount,
  formatCurrency,
  onSelectTab,
}: {
  mutualCount?: number;
  formatCurrency?: (val: number | string) => string;
  onSelectTab?: (tab: string) => void;
}) {
  const {
    data,
    actionLoading,
    activeActionKey,
    feedback,
    setFeedback,
    registerAgent,
    triggerOptOutAction,
    refreshNetwork,
  } = useAgentNetwork();
  const [modalOpen, setModalOpen] = useState(false);
  const [initialModalTab, setInitialModalTab] = useState<NetworkModalTab>("invites");

  const fmt = formatCurrency || ((v: number | string) => globalFormatCurrency(v));

  const openModal = (tab: NetworkModalTab) => {
    setFeedback(null);
    setInitialModalTab(tab);
    setModalOpen(true);
    refreshNetwork(true);
  };

  const displayMutuals =
    typeof mutualCount === "number" ? Math.max(mutualCount, data.mutualsCount || 0) : data.mutualsCount || 0;

  return (
    <>
      <button
        type="button"
        className={styles.statButton}
        onClick={() => openModal("mutuals")}
        title="Mutuals"
      >
        <strong className={styles.statValue}>{displayMutuals}</strong>
        <span className={styles.statLabel}>/ 50 Mutuals</span>
      </button>

      <span className={styles.statDot}>·</span>

      <button
        type="button"
        className={styles.statButton}
        onClick={() => openModal("invites")}
        title="Invites"
      >
        <strong className={styles.statValue}>{formatCompactCount(data.invitesCount)}</strong>
        <span className={styles.statLabel}>Invites</span>
        {data.pendingOptOutRequestsCount > 0 && <span className={styles.pendingDot} />}
      </button>

      {data.uplineAgentsCount > 0 && (
        <>
          <span className={styles.statDot}>·</span>
          <button
            type="button"
            className={styles.statButton}
            onClick={() => openModal("upline")}
            title="Following"
          >
            <strong className={styles.statValue}>{formatCompactCount(data.uplineAgentsCount)}</strong>
            <span className={styles.statLabel}>Following</span>
          </button>
        </>
      )}

      {modalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <AgentNetworkModal
            data={data}
            initialTab={initialModalTab}
            actionLoading={actionLoading}
            activeActionKey={activeActionKey}
            feedback={feedback}
            formatCurrency={fmt}
            onClose={() => setModalOpen(false)}
            onTriggerOptOut={triggerOptOutAction}
            onRegisterAgent={registerAgent}
            onRefresh={refreshNetwork}
            onNavigateToAgentPage={() => {
              setModalOpen(false);
              if (onSelectTab) {
                onSelectTab("agent");
              } else if (typeof window !== "undefined") {
                window.location.href = "/agent";
              }
            }}
          />,
          document.body
        )}
    </>
  );
}
