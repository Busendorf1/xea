"use client";

import React from "react";
import styles from "./page.module.css";

export interface AdminUserSuiteSecurityTabProps {
  activeUser: any;
  isMonetized: boolean;
  isSuspended: boolean | "" | null;
  isDeactivated: boolean;
  isAgent: boolean;
  isAgentBanned: boolean;
  userActionSubmitting: boolean;
  activeActionId?: string | null;
  customSuspensionDateTime: string;
  setCustomSuspensionDateTime: (v: string) => void;
  getBanRemainingText: (until: string | null) => string | null;
  handleToggleMonetization?: (user: any) => void;
  handleResetClicks?: (user: any, clicks: number) => void;
  handleSuspendUser: (user: any, hours: number) => void;
  handleCustomSuspend: () => void;
  setBanModalUser: (u: any) => void;
  setBanModalStatus: (s: "active" | "temp_banned" | "perm_banned" | "deactivated") => void;
  setBanModalReason: (r: string) => void;
  handleDeactivateAccount?: (user: any, deactivated: boolean) => void;
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
  handleRemoveAllFollowers?: (user: any) => void;
  userNetwork: any;
  userReferrals: any[];
  setAgencyBanType: (t: "temp" | "perm" | "unban") => void;
  setAgencyBanDays: (d: number) => void;
  setAgencyBanReason: (r: string) => void;
  setAgencyBanDetachFollowers: (df: boolean) => void;
  setShowAgencyBanDialog: (show: boolean) => void;
}

export function AdminUserSuiteSecurityTab({
  activeUser,
  isMonetized,
  isSuspended,
  isDeactivated,
  isAgent,
  isAgentBanned,
  userActionSubmitting,
  activeActionId,
  customSuspensionDateTime,
  setCustomSuspensionDateTime,
  getBanRemainingText,
  handleToggleMonetization,
  handleResetClicks,
  handleSuspendUser,
  handleCustomSuspend,
  setBanModalUser,
  setBanModalStatus,
  setBanModalReason,
  handleDeactivateAccount,
  handleBanAgent,
  handleToggleAgent,
  handleRemoveAllFollowers,
  userNetwork,
  userReferrals,
  setAgencyBanType,
  setAgencyBanDays,
  setAgencyBanReason,
  setAgencyBanDetachFollowers,
  setShowAgencyBanDialog,
}: AdminUserSuiteSecurityTabProps) {
  return (
    <>
      {/* MONETIZATION CONTROLS */}
      <div className={styles.modalSectionCard}>
        <div className={styles.flexBetweenCenter}>
          <div>
            <h4 className={`${styles.modalSectionTitle} ${styles.m0Bold}`}>
              Monetization Tier: {isMonetized ? "MONETIZED" : "NOT MONETIZED"}
            </h4>
            <p className={styles.adminCls_47}>
              Ad Clicks Progress: <strong>{activeUser.monetization_clicks ?? 0} / 300</strong> clicks
            </p>
          </div>
          <div className={styles.flexGapSm}>
            <button
              disabled={userActionSubmitting}
              onClick={() => handleToggleMonetization && handleToggleMonetization(activeUser)}
              className={`${styles.btnAction} ${isMonetized ? styles.btnDanger : styles.btnSuccess}`}
            >
              {isMonetized ? "Disable Monetization" : "Enable Monetization"}
            </button>
            <button
              disabled={userActionSubmitting}
              onClick={() => {
                const target = prompt("Set monetization ad clicks count (e.g. 0 to reset, 300 to unlock):", "300");
                if (target !== null) {
                  const n = parseInt(target, 10);
                  if (!isNaN(n)) handleResetClicks && handleResetClicks(activeUser, n);
                }
              }}
              className={styles.btnAction}
            >
              Override Clicks
            </button>
          </div>
        </div>
      </div>

      {/* BAN TYPE 1: PLATFORM ACCOUNT SUSPENSION */}
      <div className={styles.banTypeCard}>
        <div className={styles.banTypeHeader}>
          <span>1. Platform Account Suspension (Login &amp; Access Lock)</span>
          {isSuspended && (
            <span className={styles.suiteBadgeDanger}>
              {getBanRemainingText(activeUser.suspended_until)}
            </span>
          )}
        </div>
        <p className={`${styles.adminCls_47} ${styles.fontSm}`}>
          Blocks user from logging in or using the platform until the countdown expires or an admin removes the suspension.
        </p>

        {isSuspended ? (
          <div className={`${styles.statusAlertDanger} ${styles.mbSm}`}>
            Account currently locked until:{" "}
            <strong>{new Date(activeUser.suspended_until).toLocaleString()}</strong> ({getBanRemainingText(activeUser.suspended_until)})
          </div>
        ) : (
          <div className={`${styles.statusAlertSuccess} ${styles.mbSm}`}>
            Account status is active and unsuspended.
          </div>
        )}

        <div className={styles.suspensionButtonGroup}>
          <button
            disabled={userActionSubmitting}
            onClick={() => handleSuspendUser(activeUser, 2)}
            className={`${styles.btnAction} ${styles.btnDanger}`}
          >
            Suspend 2 Hrs
          </button>
          <button
            disabled={userActionSubmitting}
            onClick={() => handleSuspendUser(activeUser, 24)}
            className={`${styles.btnAction} ${styles.btnDanger}`}
          >
            Suspend 24 Hrs
          </button>
          <button
            disabled={userActionSubmitting}
            onClick={() => handleSuspendUser(activeUser, 72)}
            className={`${styles.btnAction} ${styles.btnDanger}`}
          >
            Suspend 3 Days
          </button>
          <button
            disabled={userActionSubmitting}
            onClick={() => handleSuspendUser(activeUser, 168)}
            className={`${styles.btnAction} ${styles.btnDanger}`}
          >
            Suspend 7 Days
          </button>
          <button
            disabled={userActionSubmitting}
            onClick={() => handleSuspendUser(activeUser, -1)}
            className={`${styles.btnAction} ${styles.btnDanger}`}
          >
            PERMANENT BAN
          </button>
          {activeUser.suspended_until && (
            <button
              disabled={userActionSubmitting}
              onClick={() => handleSuspendUser(activeUser, 0)}
              className={`${styles.btnAction} ${styles.btnSuccess}`}
            >
              Remove Suspension
            </button>
          )}
        </div>

        {/* CUSTOM TEMPORARY SUSPENSION TIMER */}
        <div className={styles.customTimerRow}>
          <span className={styles.fontSmBold}>Custom Ban Expiry Timer:</span>
          <input
            type="datetime-local"
            className={`${styles.profileInput} ${styles.customDateInput}`}
            value={customSuspensionDateTime}
            onChange={(e) => setCustomSuspensionDateTime(e.target.value)}
          />
          <button
            disabled={userActionSubmitting}
            onClick={handleCustomSuspend}
            className={`${styles.btnAction} ${styles.btnWarning} ${styles.fontSm}`}
          >
            Apply Exact Expiry
          </button>
        </div>
      </div>

      {/* BAN TYPE 2: AD ACCOUNT RESTRICTION & DEACTIVATION */}
      <div className={styles.modalSectionCard}>
        <h4 className={styles.modalSectionTitle}>2. Ad Account Status &amp; Deactivation</h4>
        <div className={styles.flexBetweenCenter}>
          <div>
            <div className={styles.fontMd}>
              Status: <strong>{(activeUser.ad_account_status || "active").toUpperCase()}</strong>
            </div>
            {activeUser.ad_ban_reason && (
              <div className={styles.adminCls_44}>
                Reason: {activeUser.ad_ban_reason}
              </div>
            )}
          </div>
          <div className={styles.flexGapSm}>
            <button
              onClick={() => {
                setBanModalUser(activeUser);
                setBanModalStatus(activeUser.ad_account_status || "temp_banned");
                setBanModalReason(activeUser.ad_ban_reason || "");
              }}
              className={`${styles.btnAction} ${styles.adminCls_51}`}
            >
              Ad Ban / Restrict
            </button>
            {isDeactivated ? (
              <button
                disabled={userActionSubmitting}
                onClick={() => handleDeactivateAccount && handleDeactivateAccount(activeUser, false)}
                className={`${styles.btnAction} ${styles.btnSuccess}`}
              >
                Reactivate Account
              </button>
            ) : (
              <button
                disabled={userActionSubmitting}
                onClick={() => handleDeactivateAccount && handleDeactivateAccount(activeUser, true)}
                className={`${styles.btnAction} ${styles.btnWarning}`}
              >
                Deactivate Account
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BAN TYPE 3: AGENCY PRIVILEGES & REFERRAL SANCTIONS */}
      <div className={styles.banTypeCard}>
        <div className={styles.banTypeHeader}>
          <span>3. Agency Privileges &amp; Referral Sanctions</span>
          {isAgentBanned ? (
            <span className={styles.suiteBadgeDanger}>AGENCY BANNED</span>
          ) : isAgent ? (
            <span className={styles.suiteBadgeSuccess}>OFFICIAL AGENT</span>
          ) : (
            <span className={styles.suiteBadgeMuted}>STANDARD USER</span>
          )}
        </div>
        <p className={`${styles.adminCls_47} ${styles.fontSm}`}>
          Manage agent authorization, address user complaints, revoke agency credentials, or place temporary/permanent bans preventing the user from generating referral revenue.
        </p>

        {isAgentBanned ? (
          <div className={`${styles.statusAlertDanger} ${styles.mbSm}`}>
            Agency privileges currently restricted.
            {activeUser.agent_ban_reason && <span> Reason: &quot;{activeUser.agent_ban_reason}&quot;</span>}
            {activeUser.agent_banned_until && (
              <div className={styles.mtXs}>
                Ban duration: {new Date(activeUser.agent_banned_until).getFullYear() > 2090
                  ? "Permanent Agency Disqualification"
                  : `Until ${new Date(activeUser.agent_banned_until).toLocaleString()}`}
              </div>
            )}
          </div>
        ) : isAgent ? (
          <div className={`${styles.statusAlertSuccess} ${styles.mbSm}`}>
            Account holds verified Agent status with active referral commissions.
          </div>
        ) : (
          <div className={`${styles.statusAlertSuccess} ${styles.mbSm} ${styles.standardUserNotice}`}>
            Standard user account. Not registered as an agent.
          </div>
        )}

        <div className={styles.suspensionButtonGroup}>
          {isAgentBanned ? (
            <button
              disabled={userActionSubmitting}
              onClick={() => handleBanAgent && handleBanAgent(activeUser, { banType: "unban", reason: "Administrative reinstatement" })}
              className={`${styles.btnAction} ${styles.btnSuccess}`}
            >
              Lift Agency Ban
            </button>
          ) : (
            <>
              {isAgent && (
                <button
                  disabled={userActionSubmitting}
                  onClick={() => handleToggleAgent && handleToggleAgent(activeUser, false)}
                  className={`${styles.btnAction} ${styles.btnWarning}`}
                  title="Revert user to standard account without a ban penalty"
                >
                  Revoke Agent Status
                </button>
              )}
              <button
                disabled={userActionSubmitting}
                onClick={() => {
                  setAgencyBanType("temp");
                  setAgencyBanDays(7);
                  setAgencyBanReason("Complaint / Policy violation investigation (7d)");
                  setAgencyBanDetachFollowers(false);
                  setShowAgencyBanDialog(true);
                }}
                className={`${styles.btnAction} ${styles.btnDanger}`}
              >
                Ban 7 Days
              </button>
              <button
                disabled={userActionSubmitting}
                onClick={() => {
                  setAgencyBanType("temp");
                  setAgencyBanDays(30);
                  setAgencyBanReason("Confirmed violation / suspension (30d)");
                  setAgencyBanDetachFollowers(true);
                  setShowAgencyBanDialog(true);
                }}
                className={`${styles.btnAction} ${styles.btnDanger}`}
              >
                Ban 30 Days
              </button>
              <button
                disabled={userActionSubmitting}
                onClick={() => {
                  setAgencyBanType("perm");
                  setAgencyBanReason("Severe violation / fraud / Permanent disqualification");
                  setAgencyBanDetachFollowers(true);
                  setShowAgencyBanDialog(true);
                }}
                className={`${styles.btnAction} ${styles.btnDanger}`}
              >
                PERMANENT BAN
              </button>
              <button
                disabled={userActionSubmitting}
                onClick={() => {
                  setAgencyBanType("temp");
                  setAgencyBanDays(14);
                  setAgencyBanReason("");
                  setAgencyBanDetachFollowers(true);
                  setShowAgencyBanDialog(true);
                }}
                className={`${styles.btnAction} ${styles.adminCls_51}`}
              >
                Custom Agency Ban...
              </button>
            </>
          )}
          {(userNetwork?.invites?.length > 0 || userReferrals.length > 0) && (
            <button
              disabled={userActionSubmitting}
              onClick={() => handleRemoveAllFollowers && handleRemoveAllFollowers(activeUser)}
              className={`${styles.btnAction} ${styles.btnDanger}`}
              title="Detach all followers from this agent"
            >
              Purge All Followers ({userNetwork?.invites?.length || userReferrals.length})
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminUserSuiteSecurityTab;
