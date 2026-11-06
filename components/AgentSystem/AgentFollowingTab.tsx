"use client";

import React from "react";
import { Info } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import RoleStarBadges from "@/components/ui/RoleStarBadges";
import AdvertiserHoverCard from "@/components/ui/AdvertiserHoverCard";
import type { UplineAgentInfo } from "@/lib/agentSystem";
import type { OptOutActionType } from "./useAgentNetwork";
import styles from "./AgentSystem.module.css";

export interface AgentFollowingTabProps {
  uplineAgent: UplineAgentInfo | null | undefined;
  actionLoading: boolean;
  activeActionKey: string | null;
  selectedUpline: boolean;
  setSelectedUpline: React.Dispatch<React.SetStateAction<boolean>>;
  confirmForceOptOut: boolean;
  setConfirmForceOptOut: React.Dispatch<React.SetStateAction<boolean>>;
  formatCurrency: (val: number | string) => string;
  onTriggerOptOut: (action: OptOutActionType) => Promise<void>;
}

export default function AgentFollowingTab({
  uplineAgent,
  actionLoading,
  activeActionKey,
  selectedUpline,
  setSelectedUpline,
  confirmForceOptOut,
  setConfirmForceOptOut,
  formatCurrency,
  onTriggerOptOut,
}: AgentFollowingTabProps) {
  const isKeyBusy = (key: string) => Boolean(actionLoading && activeActionKey === key);

  if (!uplineAgent) {
    return <div className={styles.emptyState}>Not following any referrer.</div>;
  }

  const isExpanded =
    selectedUpline ||
    uplineAgent.optOutStatus === "requested" ||
    uplineAgent.optOutStatus === "rejected" ||
    uplineAgent.optOutStatus === "agent_requested";

  return (
    <div className={styles.userRow}>
      <div className={styles.userRowMain}>
        <div className={styles.userInfoLeft}>
          <AdvertiserHoverCard
            profile={uplineAgent.profile}
            customName={uplineAgent.displayName}
            customHandle={uplineAgent.username}
            customLogo={uplineAgent.profileImage || undefined}
          >
            <span className={styles.avatarTrigger}>
              <Avatar
                src={uplineAgent.profileImage}
                name={uplineAgent.displayName}
                size={26}
                alt={uplineAgent.username}
              />
            </span>
          </AdvertiserHoverCard>

          <div className={styles.nameWithBadge}>
            <button
              type="button"
              disabled={actionLoading}
              className={`${styles.selectableNameBtn} ${
                selectedUpline ? styles.selectableNameActive : ""
              }`}
              onClick={() => setSelectedUpline((prev) => !prev)}
            >
              @{uplineAgent.username}
            </button>
            {uplineAgent.profile?.monetized && (
              <VerifiedBadge size={13} title="Monetized Account" />
            )}
            <RoleStarBadges
              email={uplineAgent.email || uplineAgent.referrerEmail}
              isCareer={uplineAgent.profile?.is_career}
              isAffiliate={uplineAgent.profile?.is_affiliate}
              affiliateRole={uplineAgent.profile?.affiliate_role}
              size={13}
              variant="compact"
            />
          </div>
        </div>

        <div className={styles.earnedRightCol}>
          <span className={styles.earnedAmount}>
            {formatCurrency(uplineAgent.totalGainedFromMe)}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className={styles.inlineActionTray}>
          {uplineAgent.optOutStatus === "agent_requested" ? (
            <div className={styles.optOutActionsRow}>
              <span className={styles.promptText}>
                @{uplineAgent.username} requested to remove you:
              </span>
              <button
                type="button"
                disabled={actionLoading}
                className={styles.btnPrimarySmall}
                onClick={async () => {
                  await onTriggerOptOut("referee_accept");
                  setSelectedUpline(false);
                }}
              >
                {isKeyBusy("referee_accept") && (
                  <span className={`btnSpinner ${styles.btnSpinnerSmall}`} aria-hidden="true" />
                )}
                <span>Accept</span>
              </button>
              <button
                type="button"
                disabled={actionLoading}
                className={styles.btnSecondarySmall}
                onClick={async () => {
                  await onTriggerOptOut("referee_reject");
                  setSelectedUpline(false);
                }}
              >
                {isKeyBusy("referee_reject") && (
                  <span className={`btnSpinner ${styles.btnSpinnerSmall}`} aria-hidden="true" />
                )}
                <span>Reject</span>
              </button>
            </div>
          ) : (
            <div className={styles.optOutActionsRow}>
              {uplineAgent.optOutStatus === "requested" ? (
                <>
                  <span className={styles.promptText}>Pending approval</span>
                  <button
                    type="button"
                    disabled={actionLoading}
                    className={styles.btnSecondarySmall}
                    onClick={() => onTriggerOptOut("cancel_request")}
                  >
                    {isKeyBusy("cancel_request") && (
                      <span className={`btnSpinner ${styles.btnSpinnerSmall}`} aria-hidden="true" />
                    )}
                    <span>Undo</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={actionLoading}
                  className={styles.btnSecondarySmall}
                  onClick={() => onTriggerOptOut("request")}
                >
                  {isKeyBusy("request") && (
                    <span className={`btnSpinner ${styles.btnSpinnerSmall}`} aria-hidden="true" />
                  )}
                  <span>Unfollow</span>
                </button>
              )}
              <button
                type="button"
                disabled={actionLoading}
                className={styles.btnSecondarySmall}
                onClick={() => setConfirmForceOptOut((prev) => !prev)}
              >
                <span>Opt-Out</span>
              </button>
            </div>
          )}

          {confirmForceOptOut && (
            <>
              <div className={styles.infoNoticeRow}>
                <Info size={14} color="#6366f1" className={styles.infoNoticeIcon} />
                <span>Opting out removes both your referrer and your invites.</span>
              </div>
              <div className={styles.optOutActionsRow}>
                <button
                  type="button"
                  disabled={actionLoading}
                  className={styles.btnPrimarySmall}
                  onClick={async () => {
                    await onTriggerOptOut("force");
                    setConfirmForceOptOut(false);
                    setSelectedUpline(false);
                  }}
                >
                  {isKeyBusy("force") && (
                    <span className={`btnSpinner ${styles.btnSpinnerSmall}`} aria-hidden="true" />
                  )}
                  <span>Confirm</span>
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  className={styles.btnSecondarySmall}
                  onClick={() => setConfirmForceOptOut(false)}
                >
                  <span>Cancel</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
