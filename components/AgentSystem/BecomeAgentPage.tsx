"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Info } from "lucide-react";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";
import { useAgentNetwork, formatCompactCount } from "./useAgentNetwork";
import styles from "./AgentSystem.module.css";

const AgentNetworkModal = dynamic(() => import("./AgentNetworkModal"), {
  ssr: false,
});

export function BecomeAgentPage({ formatCurrency }: { formatCurrency?: (val: number | string) => string }) {
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
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [confirmAgentOptOut, setConfirmAgentOptOut] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const fmt = formatCurrency || ((v: number | string) => globalFormatCurrency(v));

  const copyInviteLink = async () => {
    if (typeof window === "undefined" || !data.referralCode) return;
    const inviteUrl = `${window.location.origin}/signup?ref=${encodeURIComponent(data.referralCode)}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const isRegistering = Boolean(actionLoading && activeActionKey === "register");
  const isForcingOptOut = Boolean(actionLoading && activeActionKey === "force");

  return (
    <div className={styles.agentPageContainer}>
      <div className={styles.agentCard}>
        <div className={styles.agentHeaderRow}>
          <h1 className={styles.agentTitle}>Become an Agent</h1>
          {data.isAgent && <span className={styles.activeAgentPill}>Active</span>}
        </div>

        <ul className={styles.agentLinesList}>
          <li>
            Invite people with your link and earn <strong>2%</strong> from their account lifetime earnings.
          </li>
          <li>
            When someone you invited becomes an Agent, you earn <strong>4%</strong> from their earnings.
          </li>
          <li>
            An asterisk (<strong>*</strong>) is used to identify Agents.
          </li>
          <li>
            View your followers and earnings anytime from <strong>Invites</strong> on your profile.
          </li>
          <li>
            Your followers&apos; earnings keep filling your wallet automatically; however, if you violate our policies or our inactivity policy (7 day monetization reset and 60 day dormant balance forfeiture), your earnings will be forfeited to the platform.
          </li>
        </ul>

        {feedback && <div className={styles.feedbackBanner}>{feedback}</div>}

        <div className={styles.agentActionRow}>
          {!data.isAgent ? (
            <button
              type="button"
              disabled={actionLoading}
              className={styles.primaryAgentBtn}
              onClick={registerAgent}
            >
              {isRegistering && (
                <span className={`btnSpinner ${styles.btnSpinnerInline}`} aria-hidden="true" />
              )}
              <span>Become an Agent</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={actionLoading}
                className={styles.primaryAgentBtn}
                onClick={() => {
                  setFeedback(null);
                  refreshNetwork(true);
                  setShowNetworkModal(true);
                }}
              >
                <span>
                  Invites ({formatCompactCount(data.invitesCount)}) · {fmt(data.totalAgentEarned)}
                </span>
              </button>

              {data.referralCode && (
                <button
                  type="button"
                  disabled={actionLoading}
                  className={styles.secondaryAgentBtn}
                  onClick={copyInviteLink}
                >
                  <span>{copiedLink ? "Copied!" : "Copy Invite Link"}</span>
                </button>
              )}

              <button
                type="button"
                disabled={actionLoading}
                className={styles.secondaryAgentBtn}
                onClick={() => setConfirmAgentOptOut((prev) => !prev)}
              >
                <span>Opt Out</span>
              </button>
            </>
          )}
        </div>

        {confirmAgentOptOut && data.isAgent && (
          <div className={styles.agentOptOutConfirmBox}>
            <div className={styles.infoNoticeRow}>
              <Info size={14} color="#6366f1" className={styles.infoNoticeIcon} />
              <span>Opting out deactivates your Agent status and removes both your referrer and your invites.</span>
            </div>
            <div className={styles.optOutActionsRow}>
              <button
                type="button"
                disabled={actionLoading}
                className={styles.btnPrimarySmall}
                onClick={async () => {
                  await triggerOptOutAction("force");
                  setConfirmAgentOptOut(false);
                }}
              >
                {isForcingOptOut && (
                  <span className={`btnSpinner ${styles.btnSpinnerSmall}`} aria-hidden="true" />
                )}
                <span>Confirm</span>
              </button>
              <button
                type="button"
                disabled={actionLoading}
                className={styles.btnSecondarySmall}
                onClick={() => setConfirmAgentOptOut(false)}
              >
                <span>Cancel</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {showNetworkModal &&
        typeof document !== "undefined" &&
        createPortal(
          <AgentNetworkModal
            data={data}
            initialTab="invites"
            actionLoading={actionLoading}
            activeActionKey={activeActionKey}
            feedback={feedback}
            formatCurrency={fmt}
            onClose={() => setShowNetworkModal(false)}
            onTriggerOptOut={triggerOptOutAction}
            onRegisterAgent={registerAgent}
            onRefresh={refreshNetwork}
            onNavigateToAgentPage={() => setShowNetworkModal(false)}
          />,
          document.body
        )}
    </div>
  );
}

export default BecomeAgentPage;
