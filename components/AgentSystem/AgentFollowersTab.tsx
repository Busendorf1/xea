"use client";

import React from "react";
import Avatar from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import RoleStarBadges from "@/components/ui/RoleStarBadges";
import AdvertiserHoverCard from "@/components/ui/AdvertiserHoverCard";
import type { DownlineInviteItem } from "@/lib/agentSystem";
import type { OptOutActionType } from "./useAgentNetwork";
import styles from "./AgentSystem.module.css";

export interface AgentFollowersTabProps {
  invites: DownlineInviteItem[];
  actionLoading: boolean;
  activeActionKey: string | null;
  selectedFollowerKey: string | null;
  setSelectedFollowerKey: React.Dispatch<React.SetStateAction<string | null>>;
  confirmRemoveKey: string | null;
  setConfirmRemoveKey: (key: string | null) => void;
  formatCurrency: (val: number | string) => string;
  onTriggerOptOut: (action: OptOutActionType, refereeEmail?: string) => Promise<void>;
}

export default function AgentFollowersTab({
  invites,
  actionLoading,
  activeActionKey,
  selectedFollowerKey,
  setSelectedFollowerKey,
  confirmRemoveKey,
  setConfirmRemoveKey,
  formatCurrency,
  onTriggerOptOut,
}: AgentFollowersTabProps) {
  const isKeyBusy = (key: string) => Boolean(actionLoading && activeActionKey === key);

  if (invites.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyStateText}>No followers yet.</p>
      </div>
    );
  }

  return (
    <>
      {invites.map((item: DownlineInviteItem) => {
        const isSelected =
          selectedFollowerKey === item.refereeKey ||
          item.optOutStatus === "requested" ||
          item.optOutStatus === "agent_requested";
        const isAskingConfirm = confirmRemoveKey === item.refereeKey;

        return (
          <div key={item.refereeKey} className={styles.userRow}>
            <div className={styles.userRowMain}>
              <div className={styles.userInfoLeft}>
                <AdvertiserHoverCard
                  profile={item.profile}
                  customName={item.displayName}
                  customHandle={item.username}
                  customLogo={item.profileImage || undefined}
                >
                  <span className={styles.avatarTrigger}>
                    <Avatar
                      src={item.profileImage}
                      name={item.displayName}
                      size={26}
                      alt={item.username}
                    />
                  </span>
                </AdvertiserHoverCard>

                <div className={styles.nameWithBadge}>
                  <button
                    type="button"
                    disabled={actionLoading}
                    className={`${styles.selectableNameBtn} ${
                      isSelected ? styles.selectableNameActive : ""
                    }`}
                    onClick={() => {
                      setConfirmRemoveKey(null);
                      setSelectedFollowerKey((prev) =>
                        prev === item.refereeKey ? null : item.refereeKey
                      );
                    }}
                  >
                    @{item.username}
                  </button>
                  {item.profile?.monetized && (
                    <VerifiedBadge size={13} title="Monetized Account" />
                  )}
                  <RoleStarBadges
                    email={item.email}
                    isCareer={item.profile?.is_career}
                    isAffiliate={item.profile?.is_affiliate}
                    affiliateRole={item.profile?.affiliate_role}
                    size={13}
                    variant="compact"
                  />
                </div>
              </div>

              <div className={styles.earnedRightCol}>
                <span className={styles.earnedAmount}>
                  {formatCurrency(item.earnedFromUser)}
                  {item.isAgent ? "*" : ""}
                </span>
              </div>
            </div>

            {isSelected && (
              <div className={styles.inlineActionTray}>
                {item.optOutStatus === "requested" ? (
                  <div className={styles.optOutActionsRow}>
                    <span className={styles.promptText}>Unfollow request:</span>
                    <button
                      type="button"
                      disabled={actionLoading}
                      className={styles.btnPrimarySmall}
                      onClick={async () => {
                        await onTriggerOptOut("accept", item.refereeKey);
                        setSelectedFollowerKey(null);
                      }}
                    >
                      {isKeyBusy(`accept:${item.refereeKey}`) && (
                        <span className={`btnSpinner ${styles.btnSpinnerSmall}`} aria-hidden="true" />
                      )}
                      <span>Accept</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      className={styles.btnSecondarySmall}
                      onClick={async () => {
                        await onTriggerOptOut("reject", item.refereeKey);
                        setSelectedFollowerKey(null);
                      }}
                    >
                      {isKeyBusy(`reject:${item.refereeKey}`) && (
                        <span className={`btnSpinner ${styles.btnSpinnerSmall}`} aria-hidden="true" />
                      )}
                      <span>Reject</span>
                    </button>
                  </div>
                ) : item.optOutStatus === "agent_requested" ? (
                  <div className={styles.optOutActionsRow}>
                    <span className={styles.promptText}>Awaiting @{item.username}&apos;s permission.</span>
                    <button
                      type="button"
                      disabled={actionLoading}
                      className={styles.btnSecondarySmall}
                      onClick={async () => {
                        await onTriggerOptOut("agent_cancel", item.refereeKey);
                      }}
                    >
                      {isKeyBusy(`agent_cancel:${item.refereeKey}`) && (
                        <span className={`btnSpinner ${styles.btnSpinnerSmall}`} aria-hidden="true" />
                      )}
                      <span>Undo</span>
                    </button>
                  </div>
                ) : isAskingConfirm ? (
                  <div className={styles.optOutActionsRow}>
                    <span className={styles.promptText}>Remove @{item.username}?</span>
                    <button
                      type="button"
                      disabled={actionLoading}
                      className={styles.btnPrimarySmall}
                      onClick={async () => {
                        await onTriggerOptOut("agent_request", item.refereeKey);
                        setConfirmRemoveKey(null);
                      }}
                    >
                      {isKeyBusy(`agent_request:${item.refereeKey}`) && (
                        <span className={`btnSpinner ${styles.btnSpinnerSmall}`} aria-hidden="true" />
                      )}
                      <span>Confirm</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      className={styles.btnSecondarySmall}
                      onClick={() => setConfirmRemoveKey(null)}
                    >
                      <span>Cancel</span>
                    </button>
                  </div>
                ) : (
                  <div className={styles.optOutActionsRow}>
                    <button
                      type="button"
                      disabled={actionLoading}
                      className={styles.btnSecondarySmall}
                      onClick={() => setConfirmRemoveKey(item.refereeKey)}
                    >
                      <span>Unfollow</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
