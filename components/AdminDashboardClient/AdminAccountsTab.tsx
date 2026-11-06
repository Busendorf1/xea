"use client";

import React from "react";
import { User, Shield } from "lucide-react";
import styles from "./page.module.css";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";
import RoleStarBadges from "@/components/ui/RoleStarBadges";

const formatCurrency = (amount: number | string, country?: string | null) =>
  globalFormatCurrency(amount, country);

export interface AdminAccountsTabProps {
  loading: boolean;
  users: any[];
  usersPage: number;
  setUsersPage: (p: number) => void;
  usersCount: number;
  usersLimit: number;
  setUsersLimit: (l: number) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  renderPagination: (
    page: number,
    setPage: (p: number) => void,
    count: number,
    limit?: number,
    setLimit?: (l: number) => void
  ) => React.ReactNode;
  setSelectedUser: (u: any) => void;
  handleToggleMonetization: (u: any) => void;
  handleToggleAgent?: (u: any, makeAgent: boolean) => void;
  userActionSubmitting?: boolean;
  activeActionId?: string | null;
  usersFilter?: string;
  setUsersFilter?: (f: string) => void;
  setBanModalUser: (u: any) => void;
  setBanModalStatus: (s: "active" | "temp_banned" | "perm_banned" | "deactivated") => void;
  setBanModalReason: (r: string) => void;
}

export const AdminAccountsTab = React.memo(function AdminAccountsTab({
  loading,
  users,
  usersPage,
  setUsersPage,
  usersCount,
  usersLimit,
  setUsersLimit,
  searchQuery,
  setSearchQuery,
  renderPagination,
  setSelectedUser,
  handleToggleMonetization,
  handleToggleAgent,
  userActionSubmitting,
  activeActionId,
  usersFilter = "",
  setUsersFilter,
}: AdminAccountsTabProps) {
  return (
    <>
      <div>
        <h1 className={styles.sectionTitle}>User Registry &amp; Ban Management</h1>
        <p className={styles.sectionSubtitle}>
          User profiles, statements, agency networks, and comprehensive ban controls.
        </p>
      </div>

      {/* FAST FILTER PILLS */}
      <div className={styles.subTabNavRow} style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
        <button
          type="button"
          onClick={() => {
            setUsersFilter && setUsersFilter("");
            setUsersPage(0);
          }}
          className={`${styles.btnAction} ${!usersFilter ? styles.btnSuccess : ""} ${styles.subTabActionBtn}`}
        >
          All Users
        </button>
        <button
          type="button"
          onClick={() => {
            setUsersFilter && setUsersFilter("affiliates");
            setUsersPage(0);
          }}
          className={`${styles.btnAction} ${usersFilter === "affiliates" ? styles.btnSuccess : ""} ${styles.subTabActionBtn}`}
        >
          ★ Affiliates Only
        </button>
        <button
          type="button"
          onClick={() => {
            setUsersFilter && setUsersFilter("career");
            setUsersPage(0);
          }}
          className={`${styles.btnAction} ${usersFilter === "career" ? styles.btnSuccess : ""} ${styles.subTabActionBtn}`}
        >
          👔 Career Staff
        </button>
        <button
          type="button"
          onClick={() => {
            setUsersFilter && setUsersFilter("monetized");
            setUsersPage(0);
          }}
          className={`${styles.btnAction} ${usersFilter === "monetized" ? styles.btnSuccess : ""} ${styles.subTabActionBtn}`}
        >
          💰 Monetized
        </button>
      </div>

      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Search accounts by username, email, phone, business name..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setUsersPage(0);
          }}
          className={styles.inputSearch}
        />
      </div>

      {loading ? (
        <div className={styles.loadingText}>Loading accounts...</div>
      ) : users.length === 0 ? (
        <div className={styles.emptyText}>No registered users found matching query.</div>
      ) : (
        <>
          {renderPagination(usersPage, setUsersPage, usersCount, usersLimit, setUsersLimit)}
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Profile Details</th>
                  <th className={styles.th}>Wallet</th>
                  <th className={styles.th}>Ad / Highlight Registry</th>
                  <th className={styles.th}>Ad Views / Clicks</th>
                  <th className={styles.th}>Monetization</th>
                  <th className={styles.th}>Agent Status</th>
                  <th className={styles.th}>Ad Account Status</th>
                  <th className={styles.th}>Suspension</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isMonetized = user.monetized === "yes" || user.monetized === true;
                  const isSuspended =
                    user.suspended_until && new Date(user.suspended_until).getTime() > Date.now();
                  const hasBusiness = user.business_name && user.business_name.trim() !== "";

                  const isAdTempBanned =
                    user.ad_account_status === "temp_banned" &&
                    user.ad_ban_until &&
                    new Date(user.ad_ban_until).getTime() > Date.now();
                  const isAdPermBanned = user.ad_account_status === "perm_banned";
                  const isAdDeactivated = user.ad_account_status === "deactivated";

                  const getAdBanCountdown = (untilStr: string | null) => {
                    if (!untilStr) return "";
                    const diffMs = new Date(untilStr).getTime() - Date.now();
                    if (diffMs <= 0) return "Expired";
                    const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
                    return `${days} day${days > 1 ? "s" : ""} left`;
                  };

                  return (
                    <tr
                      key={user.id}
                      className={`${styles.tr} ${styles.clickableRow}`}
                      onClick={() => setSelectedUser(user)}
                      title="Click user row to open full profile, statements, followers network & actions"
                    >
                      <td className={styles.td}>
                        {hasBusiness ? (
                          <>
                            <div className={styles.adminCls_41}>{user.business_name}</div>
                            <div className={styles.adminCls_42}>
                              {user.firstName} {user.lastName}
                            </div>
                          </>
                        ) : (
                          <div className={styles.fw700}>
                            {user.firstName} {user.lastName}
                          </div>
                        )}
                        <div className={styles.adminCls_43}>
                          @{user.username?.replace(/^@/, "") || "user"}
                          {user.is_agent && (
                            <span className={styles.agentTableBadge}>AGENT</span>
                          )}
                          <RoleStarBadges
                            email={user.email}
                            isCareer={user.is_career}
                            isAffiliate={user.is_affiliate}
                            affiliateRole={user.affiliate_role}
                            variant="compact"
                          />
                        </div>
                        {user.created_at && (
                          <div className={styles.adminCls_44}>
                            Joined:{" "}
                            {new Date(user.created_at).toLocaleString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </td>
                      <td className={styles.td}>
                        <div className={styles.fw800}>{formatCurrency(user.balance || 0)}</div>
                        <div className={styles.adminCls_45}>
                          Pending: {formatCurrency(user.withdrawal || 0)}
                        </div>
                      </td>
                      <td className={styles.td}>
                        <div>
                          <strong>Ads:</strong> {user.activeAdsCount} active / {user.reviewAdsCount} review
                        </div>
                        <div>
                          <strong>Highlights:</strong> {user.activeHighlightsCount} active /{" "}
                          {user.reviewHighlightsCount} review
                        </div>
                      </td>
                      <td className={styles.td}>
                        <div>
                          <strong>Ad Clicks:</strong> {user.totalClicksOnAds ?? 0} clicks
                        </div>
                        <div>
                          <strong>Mutuals:</strong> {user.mutual_count ?? 0} / 50
                        </div>
                      </td>
                      <td className={styles.td}>
                        <span className={`${styles.userBadge} ${isMonetized ? styles.monetizedYes : ""}`}>
                          {isMonetized ? "Monetized" : "Not Monetized"}
                        </span>
                      </td>
                      <td
                        className={`${styles.td} ${styles.cursorPointer}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUser({ ...user, initialTab: "network" });
                        }}
                        title="Click to view agency network & downline followers"
                      >
                        {user.is_agent_banned ? (
                          <div>
                            <span className={`${styles.userBadge} ${styles.adminCls_48}`}>
                              BANNED
                            </span>
                            {user.agent_ban_reason && (
                              <div className={styles.adminCls_47}>Reason: {user.agent_ban_reason}</div>
                            )}
                          </div>
                        ) : user.is_agent ? (
                          <div>
                            <span className={`${styles.userBadge} ${styles.monetizedYes}`}>
                              AGENT
                            </span>
                            {user.referral_code && (
                              <div className={`${styles.adminCls_47} ${styles.refCodeBold}`}>
                                Code: {user.referral_code}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className={styles.userBadge}>STANDARD</span>
                        )}
                      </td>
                      <td
                        className={`${styles.td} ${styles.cursorPointer}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUser({ ...user, initialTab: "security" });
                        }}
                        title="Click to manage advertiser ban & account restriction"
                      >
                        {isAdTempBanned ? (
                          <div>
                            <span className={`${styles.userBadge} ${styles.adminCls_46}`}>
                              TEMP BANNED ({getAdBanCountdown(user.ad_ban_until)})
                            </span>
                            {user.ad_ban_reason && (
                              <div className={styles.adminCls_47}>Reason: {user.ad_ban_reason}</div>
                            )}
                          </div>
                        ) : isAdPermBanned ? (
                          <div>
                            <span className={`${styles.userBadge} ${styles.adminCls_48}`}>
                              PERM BANNED
                            </span>
                            {user.ad_ban_reason && (
                              <div className={styles.adminCls_47}>Reason: {user.ad_ban_reason}</div>
                            )}
                          </div>
                        ) : isAdDeactivated ? (
                          <div>
                            <span className={`${styles.userBadge} ${styles.adminCls_49}`}>
                              DEACTIVATED
                            </span>
                            {user.ad_ban_reason && (
                              <div className={styles.adminCls_47}>Reason: {user.ad_ban_reason}</div>
                            )}
                          </div>
                        ) : (
                          <span className={`${styles.userBadge} ${styles.adminCls_50}`}>ACTIVE</span>
                        )}
                      </td>
                      <td
                        className={`${styles.td} ${styles.cursorPointer}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUser({ ...user, initialTab: "security" });
                        }}
                        title="Click to manage platform account suspension & timer"
                      >
                        {isSuspended ? (
                          <span
                            className={`${styles.userBadge} ${styles.suspendedYes}`}
                            title={`Until: ${new Date(user.suspended_until).toLocaleString()}`}
                          >
                            Suspended
                          </span>
                        ) : (
                          <span className={styles.userBadge}>Active</span>
                        )}
                      </td>
                      <td className={styles.td}>
                        <div className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
                          <button
                            disabled={userActionSubmitting}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUser({ ...user, initialTab: "profile" });
                            }}
                            className={styles.btnAction}
                            title="Open full profile, edit details, view wallet & export user data"
                          >
                            <User size={13} className={styles.iconBtnSpacing} />
                            Manage Profile
                          </button>
                          <button
                            disabled={userActionSubmitting}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleMonetization(user);
                            }}
                            className={`${styles.btnAction} ${isMonetized ? styles.btnDanger : styles.btnSuccess}`}
                          >
                            {activeActionId === `toggle-monetize-${user.id}` && (
                              <span className={styles.btnSpinner} />
                            )}
                            {activeActionId === `toggle-monetize-${user.id}`
                              ? isMonetized ? "Disabling..." : "Enabling..."
                              : isMonetized ? "Disable Earn" : "Enable Earn"}
                          </button>
                          {/* AGENT TOGGLE BUTTON */}
                          {user.is_agent ? (
                            <button
                              disabled={userActionSubmitting}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleAgent && handleToggleAgent(user, false);
                              }}
                              className={`${styles.btnAction} ${styles.btnWarning}`}
                              title="Revoke official agent status"
                            >
                              {activeActionId === `toggle-agent-${user.id}` && (
                                <span className={styles.btnSpinner} />
                              )}
                              {activeActionId === `toggle-agent-${user.id}` ? "Revoking..." : "Revoke Agent"}
                            </button>
                          ) : !user.is_agent_banned ? (
                            <button
                              disabled={userActionSubmitting}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleAgent && handleToggleAgent(user, true);
                              }}
                              className={`${styles.btnAction} ${styles.btnSuccess}`}
                              title="Make this user an official Agent"
                            >
                              {activeActionId === `toggle-agent-${user.id}` && (
                                <span className={styles.btnSpinner} />
                              )}
                              {activeActionId === `toggle-agent-${user.id}` ? "Activating..." : "+ Make Agent"}
                            </button>
                          ) : null}
                          <button
                            disabled={userActionSubmitting}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUser({ ...user, initialTab: "security" });
                            }}
                            className={`${styles.btnAction} ${styles.adminCls_51}`}
                            title="Open security tab: temporary ban timer, ad restrict, monetization lock & deletion"
                          >
                            <Shield size={13} className={styles.iconBtnSpacing} />
                            Security & Bans
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {renderPagination(usersPage, setUsersPage, usersCount, usersLimit, setUsersLimit)}
        </>
      )}
    </>
  );
});
