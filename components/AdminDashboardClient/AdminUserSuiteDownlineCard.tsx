"use client";

import React from "react";
import styles from "./page.module.css";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

const formatCurrency = (amount: number | string, country?: string | null) =>
  globalFormatCurrency(amount, country);

export interface AdminUserSuiteDownlineCardProps {
  activeUser: any;
  userNetwork: any;
  userReferrals: any[];
  isAgent: boolean;
  isAgentBanned: boolean;
  userActionSubmitting: boolean;
  handleBanAgent?: (
    user: any,
    options: {
      banType: "temp" | "perm" | "unban";
      days?: number;
      customUntil?: string;
      reason: string;
      detachFollowers?: boolean;
    }
  ) => void;
  handleToggleAgent?: (user: any, makeAgent: boolean) => void;
  handleRemoveFollower?: (user: any, refereeEmail: string, followerLabel?: string) => void;
  handleRemoveAllFollowers?: (user: any) => void;
  handleDetachUplineAgent?: (user: any, uplineLabel?: string) => void;
  setAgencyBanType: (t: "temp" | "perm" | "unban") => void;
  setAgencyBanDays: (d: number) => void;
  setAgencyBanReason: (r: string) => void;
  setAgencyBanDetachFollowers: (df: boolean) => void;
  setShowAgencyBanDialog: (show: boolean) => void;
}

export function AdminUserSuiteDownlineCard({
  activeUser,
  userNetwork,
  userReferrals,
  isAgent,
  isAgentBanned,
  userActionSubmitting,
  handleBanAgent,
  handleToggleAgent,
  handleRemoveFollower,
  handleRemoveAllFollowers,
  handleDetachUplineAgent,
  setAgencyBanType,
  setAgencyBanDays,
  setAgencyBanReason,
  setAgencyBanDetachFollowers,
  setShowAgencyBanDialog,
}: AdminUserSuiteDownlineCardProps) {
  return (
    <>
      <div className={styles.modalSectionCard}>
        <div className={styles.agentHeaderFlex}>
          <div>
            <div className={styles.flexRowWrapGapSm}>
              <h4 className={`${styles.modalSectionTitle} ${styles.m0Bold}`}>
                Agent Status:
              </h4>
              {isAgentBanned ? (
                <span className={`${styles.userBadge} ${styles.btnDanger} ${styles.fontSm} ${styles.commissionRateBadge}`}>
                  🚨 AGENT BANNED ({activeUser.agent_banned_until && new Date(activeUser.agent_banned_until).getFullYear() > 2090 ? "Permanent" : "Temporary"})
                </span>
              ) : isAgent ? (
                <span className={`${styles.userBadge} ${styles.monetizedYes} ${styles.fontSm} ${styles.commissionRateBadge}`}>
                  ACTIVE AGENT
                </span>
              ) : (
                <span className={`${styles.userBadge} ${styles.btnWarning} ${styles.fontSm} ${styles.commissionRateBadge}`}>
                  STANDARD ACCOUNT (NOT AGENT)
                </span>
              )}
            </div>
            <p className={`${styles.adminCls_47} ${styles.fontMd}`}>
              {isAgentBanned ? (
                <>
                  Restricted until: <strong>{activeUser.agent_banned_until ? new Date(activeUser.agent_banned_until).toLocaleDateString() : "Indefinite"}</strong>
                  {activeUser.agent_ban_reason ? ` • Reason: "${activeUser.agent_ban_reason}"` : ""}
                </>
              ) : isAgent ? (
                "This account has an active Agent badge and earns 1% or 2%* commissions from invitees."
              ) : (
                "User is not currently designated as an official platform Agent."
              )}
            </p>
          </div>

          <div className={styles.flexRowWrapGapSm}>
            {isAgentBanned ? (
              <button
                disabled={userActionSubmitting}
                onClick={() => handleBanAgent && handleBanAgent(activeUser, { banType: "unban", reason: "Administrative reinstatement" })}
                className={`${styles.btnAction} ${styles.btnSuccess}`}
                title="Lift agency ban and restore eligibility"
              >
                Lift Agency Ban
              </button>
            ) : isAgent ? (
              <>
                <button
                  disabled={userActionSubmitting}
                  onClick={() => handleToggleAgent && handleToggleAgent(activeUser, false)}
                  className={`${styles.btnAction} ${styles.btnWarning}`}
                  title="Revoke agent status (revert to standard user)"
                >
                  Revoke Agent Status
                </button>
                <button
                  disabled={userActionSubmitting}
                  onClick={() => {
                    setAgencyBanType("temp");
                    setAgencyBanDays(30);
                    setAgencyBanReason("");
                    setAgencyBanDetachFollowers(true);
                    setShowAgencyBanDialog(true);
                  }}
                  className={`${styles.btnAction} ${styles.btnDanger}`}
                  title="Ban user from being an agent due to complaint or policy violation"
                >
                  Ban Agency Privileges
                </button>
              </>
            ) : (
              <>
                <button
                  disabled={userActionSubmitting}
                  onClick={() => handleToggleAgent && handleToggleAgent(activeUser, true)}
                  className={`${styles.btnAction} ${styles.btnSuccess}`}
                >
                  Grant Agent Status
                </button>
                <button
                  disabled={userActionSubmitting}
                  onClick={() => {
                    setAgencyBanType("perm");
                    setAgencyBanReason("");
                    setAgencyBanDetachFollowers(true);
                    setShowAgencyBanDialog(true);
                  }}
                  className={`${styles.btnAction} ${styles.btnDanger}`}
                  title="Pre-emptively ban user from becoming an agent"
                >
                  Ban From Agent Status
                </button>
              </>
            )}
          </div>
        </div>

        <div className={`${styles.gridTwoCol} ${styles.mtSm}`}>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Referral Invite Code</span>
            <span className={`${styles.fieldValue} ${styles.commissionRateBadge}`}>
              {activeUser.referral_code || userNetwork?.referralCode || "None generated"}
            </span>
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Total Agent Commissions Earned</span>
            <span className={`${styles.fieldValue} ${styles.textSuccess} ${styles.commissionRateBadge}`}>
              {formatCurrency(userNetwork?.totalAgentEarned || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* UPLINE AGENT INFO */}
      <div className={styles.modalSectionCard}>
        <div className={styles.flexBetweenCenter}>
          <h5 className={`${styles.fieldLabel} ${styles.m0Bold}`}>
            Upline Agent (Who Invited This User)
          </h5>
          {userNetwork?.uplineAgent && (
            <button
              disabled={userActionSubmitting}
              onClick={() => {
                handleDetachUplineAgent &&
                  handleDetachUplineAgent(
                    activeUser,
                    `@${userNetwork.uplineAgent.username} (${userNetwork.uplineAgent.email || userNetwork.uplineAgent.referrerEmail || ""})`
                  );
              }}
              className={`${styles.btnAction} ${styles.btnDanger} ${styles.btnCompactSm}`}
              title="Remove upline referrer from this user"
            >
              Detach Referrer
            </button>
          )}
        </div>
        {userNetwork?.uplineAgent ? (
          <div className={`${styles.gridTwoCol} ${styles.mtSm}`}>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Upline Agent Account</span>
              <span className={`${styles.fieldValue} ${styles.refCodeBold}`}>
                @{userNetwork.uplineAgent.username || "agent"}{" "}
                <span className={styles.adminCls_44}>
                  ({userNetwork.uplineAgent.email || userNetwork.uplineAgent.referrerEmail || "No email"})
                </span>
              </span>
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Commission Deducted on Earns</span>
              <span className={`${styles.fieldValue} ${styles.refCodeBold}`}>
                {userNetwork.uplineAgent.commissionRatePct || 1}%
              </span>
            </div>
          </div>
        ) : (
          <div className={styles.emptyText}>This user was not referred by any agent.</div>
        )}
      </div>

      {/* DOWNLINE FOLLOWER NETWORK */}
      <div className={styles.flexBetweenCenter}>
        <div>
          <h4 className={`${styles.modalSectionTitle} ${styles.m0Bold}`}>
            Downline Followers ({userNetwork?.invites?.length || userReferrals.length})
          </h4>
          <p className={styles.adminCls_44}>
            Followers currently connected under this user&apos;s agent referral network.
          </p>
        </div>
        {(userNetwork?.invites?.length > 0 || userReferrals.length > 0) && (
          <button
            disabled={userActionSubmitting}
            onClick={() => handleRemoveAllFollowers && handleRemoveAllFollowers(activeUser)}
            className={`${styles.btnAction} ${styles.btnDanger}`}
            title="Remove and detach all followers from this agent"
          >
            Detach All Followers
          </button>
        )}
      </div>

      {userNetwork?.invites && userNetwork.invites.length > 0 ? (
        <div className={styles.miniTableContainer}>
          <table className={styles.miniTable}>
            <thead>
              <tr>
                <th>Follower / Invitee</th>
                <th>Joined</th>
                <th>Commission Rate</th>
                <th>Total Earned Off User</th>
                <th>Opt-Out Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {userNetwork.invites.map((inv: any) => (
                <tr key={inv.id || inv.refereeKey}>
                  <td>
                    <strong>@{inv.username}</strong>
                    <div className={styles.adminCls_44}>
                      {inv.displayName} {inv.email || inv.refereeKey ? `• ${inv.email || inv.refereeKey}` : ""}
                    </div>
                  </td>
                  <td>{new Date(inv.joinedAt).toLocaleDateString()}</td>
                  <td>
                    <span className={`${styles.textSuccess} ${styles.commissionRateBadge}`}>{inv.commissionRatePct}%</span>
                  </td>
                  <td className={styles.refCodeBold}>{formatCurrency(inv.earnedFromUser || 0)}</td>
                  <td>
                    <span className={styles.fontSm}>
                      {inv.optOutStatus || "none"}
                    </span>
                  </td>
                  <td>
                    <button
                      disabled={userActionSubmitting}
                      onClick={() => {
                        const refEmail = inv.email || inv.refereeKey || inv.refereeEmail;
                        handleRemoveFollower &&
                          handleRemoveFollower(activeUser, refEmail, `@${inv.username || refEmail}`);
                      }}
                      className={`${styles.btnAction} ${styles.btnDanger} ${styles.fontXs}`}
                      title="Remove and detach this follower from the agent's downline"
                    >
                      Remove Follower
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : userReferrals.length > 0 ? (
        <div className={styles.miniTableContainer}>
          <table className={styles.miniTable}>
            <thead>
              <tr>
                <th>Referee Email</th>
                <th>Status</th>
                <th>Interactions</th>
                <th>Registered Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {userReferrals.map((ref: any) => (
                <tr key={ref.id}>
                  <td>{ref.referee_email}</td>
                  <td>
                    <span>{ref.status}</span>
                  </td>
                  <td>{ref.interactions_count ?? 0}</td>
                  <td>{new Date(ref.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      disabled={userActionSubmitting}
                      onClick={() => {
                        handleRemoveFollower &&
                          handleRemoveFollower(activeUser, ref.referee_email, ref.referee_email);
                      }}
                      className={`${styles.btnAction} ${styles.btnDanger} ${styles.fontXs}`}
                      title="Remove and detach this follower from the agent's downline"
                    >
                      Remove Follower
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.emptyText}>No registered downline followers or invitees found.</div>
      )}
    </>
  );
}

export default AdminUserSuiteDownlineCard;
