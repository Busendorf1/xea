"use client";

import React from "react";
import { Users, Network, RefreshCw, User, Sparkles } from "lucide-react";
import styles from "./page.module.css";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";
import RoleStarBadges from "@/components/ui/RoleStarBadges";

const formatCurrency = (amount: number | string, country?: string | null) =>
  globalFormatCurrency(amount, country);

export interface AdminAgentsNetworkTabProps {
  setSelectedUser: (u: any) => void;
  handleToggleAgent?: (user: any, makeAgent: boolean) => void;
  handleBanAgent?: (user: any, options: any) => void;
  handleRemoveFollower?: (user: any, refereeEmail: string, followerLabel?: string) => void;
  handleRemoveAllFollowers?: (user: any) => void;
  handleUpdateSpecialRoles?: (
    user: any,
    roles: { isCareer: boolean; isAffiliate: boolean; affiliateRole?: string | null }
  ) => void;
  userActionSubmitting?: boolean;
  activeActionId?: string | null;
}

export const AdminAgentsNetworkTab = React.memo(function AdminAgentsNetworkTab({
  setSelectedUser,
  handleToggleAgent,
  handleRemoveFollower,
  handleRemoveAllFollowers,
  handleUpdateSpecialRoles,
  userActionSubmitting,
  activeActionId,
}: AdminAgentsNetworkTabProps) {
  const [activeSubTab, setActiveSubTab] = React.useState<"agents" | "followers" | "affiliates">("agents");

  // Agents state
  const [agents, setAgents] = React.useState<any[]>([]);
  const [agentsLoading, setAgentsLoading] = React.useState(false);
  const [agentsSearch, setAgentsSearch] = React.useState("");

  // Followers state
  const [followers, setFollowers] = React.useState<any[]>([]);
  const [followersLoading, setFollowersLoading] = React.useState(false);
  const [followersSearch, setFollowersSearch] = React.useState("");
  const [followersAgentFilter, setFollowersAgentFilter] = React.useState<string>("");
  const [followersCount, setFollowersCount] = React.useState(0);
  const [followersPage, setFollowersPage] = React.useState(0);

  // Affiliates state
  const [affiliates, setAffiliates] = React.useState<any[]>([]);
  const [affiliatesLoading, setAffiliatesLoading] = React.useState(false);
  const [affiliatesSearch, setAffiliatesSearch] = React.useState("");
  const [affiliatesCount, setAffiliatesCount] = React.useState(0);
  const [affiliatesPage, setAffiliatesPage] = React.useState(0);

  const fetchAgentsList = React.useCallback(async (query = "") => {
    setAgentsLoading(true);
    try {
      const res = await fetch(`/api/admin/users?type=agents_list&search=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data?.agents) {
        setAgents(data.agents);
      }
    } catch (e) {
      console.error("Error fetching agents list:", e);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  const fetchFollowersList = React.useCallback(async (page = 0, query = "", agentEmail = "") => {
    setFollowersLoading(true);
    try {
      const res = await fetch(
        `/api/admin/users?type=followers_list&page=${page}&limit=50&search=${encodeURIComponent(query)}&agentEmail=${encodeURIComponent(agentEmail)}`
      );
      const data = await res.json();
      if (data?.followers) {
        setFollowers(data.followers);
        setFollowersCount(data.count || 0);
      }
    } catch (e) {
      console.error("Error fetching followers list:", e);
    } finally {
      setFollowersLoading(false);
    }
  }, []);

  const fetchAffiliatesList = React.useCallback(async (page = 0, query = "") => {
    setAffiliatesLoading(true);
    try {
      const res = await fetch(
        `/api/admin/users?type=affiliates_list&page=${page}&limit=50&search=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      if (data?.affiliates) {
        setAffiliates(data.affiliates);
        setAffiliatesCount(data.count || 0);
      }
    } catch (e) {
      console.error("Error fetching affiliates list:", e);
    } finally {
      setAffiliatesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAgentsList(agentsSearch);
  }, [fetchAgentsList, agentsSearch]);

  React.useEffect(() => {
    fetchFollowersList(followersPage, followersSearch, followersAgentFilter);
  }, [fetchFollowersList, followersPage, followersSearch, followersAgentFilter]);

  React.useEffect(() => {
    fetchAffiliatesList(affiliatesPage, affiliatesSearch);
  }, [fetchAffiliatesList, affiliatesPage, affiliatesSearch]);

  const handleSwitchToAgentFollowers = (agentEmail: string) => {
    setFollowersAgentFilter(agentEmail);
    setFollowersPage(0);
    setActiveSubTab("followers");
  };

  return (
    <>
      <div className={styles.agentHeaderFlex}>
        <div>
          <h1 className={styles.sectionTitle}>Agent &amp; Affiliate Network Directory</h1>
          <p className={styles.sectionSubtitle}>
            Live platform agents, downline invitees, official affiliates, commission payouts, and partnership controls.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            fetchAgentsList(agentsSearch);
            fetchFollowersList(followersPage, followersSearch, followersAgentFilter);
            fetchAffiliatesList(affiliatesPage, affiliatesSearch);
          }}
          disabled={agentsLoading || followersLoading || affiliatesLoading}
          className={`${styles.btnAction} ${styles.adminCls_40}`}
        >
          <RefreshCw size={14} className={agentsLoading || followersLoading || affiliatesLoading ? "spin" : ""} />
          <span>Refresh Network</span>
        </button>
      </div>

      {/* SUB-VIEW SWITCHER */}
      <div className={styles.subTabNavRow}>
        <button
          type="button"
          onClick={() => setActiveSubTab("agents")}
          className={`${styles.btnAction} ${activeSubTab === "agents" ? styles.btnSuccess : ""} ${styles.subTabActionBtn}`}
        >
          <Users size={16} />
          <span>Agents Directory ({agents.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("followers")}
          className={`${styles.btnAction} ${activeSubTab === "followers" ? styles.btnSuccess : ""} ${styles.subTabActionBtn}`}
        >
          <Network size={16} />
          <span>Followers Registry ({followersCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("affiliates")}
          className={`${styles.btnAction} ${activeSubTab === "affiliates" ? styles.btnSuccess : ""} ${styles.subTabActionBtn}`}
        >
          <Sparkles size={16} />
          <span>Affiliates Registry ({affiliatesCount})</span>
        </button>
      </div>

      {/* VIEW 1: AGENTS DIRECTORY */}
      {activeSubTab === "agents" && (
        <>
          <div className={styles.searchBar}>
            <input
              type="text"
              placeholder="Search agents by username, email, name, or referral code..."
              value={agentsSearch}
              onChange={(e) => setAgentsSearch(e.target.value)}
              className={styles.inputSearch}
            />
          </div>

          {agentsLoading ? (
            <div className={styles.loadingText}>Loading agents directory...</div>
          ) : agents.length === 0 ? (
            <div className={styles.emptyText}>No registered agents found matching your query.</div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Agent Details</th>
                    <th className={styles.th}>Referral Code</th>
                    <th className={styles.th}>Followers / Downline</th>
                    <th className={styles.th}>Commissions Earned</th>
                    <th className={styles.th}>Agency Status</th>
                    <th className={styles.th}>Disciplinary Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr
                      key={agent.id}
                      className={`${styles.tr} ${styles.clickableRow}`}
                      onClick={() => setSelectedUser({ ...agent, initialTab: "network" })}
                      title="Click row to open agent operations suite and downline table"
                    >
                      <td className={styles.td}>
                        <div className={styles.fw700}>
                          {agent.firstName || ""} {agent.lastName || ""}
                        </div>
                        <div className={styles.adminCls_43}>
                          @{agent.username?.replace(/^@/, "") || "user"}
                          <RoleStarBadges
                            email={agent.email}
                            isCareer={agent.is_career}
                            isAffiliate={agent.is_affiliate}
                            affiliateRole={agent.affiliate_role}
                            variant="compact"
                          />
                        </div>
                        <div className={styles.adminCls_44}>
                          {agent.email}
                        </div>
                      </td>
                      <td className={styles.td}>
                        {agent.referral_code ? (
                          <span className={`${styles.userBadge} ${styles.activeAgentBadge}`}>
                            {agent.referral_code}
                          </span>
                        ) : (
                          <span className={styles.adminCls_45}>None generated</span>
                        )}
                      </td>
                      <td className={styles.td}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSwitchToAgentFollowers(agent.email);
                          }}
                          className={`${styles.btnAction} ${styles.adminCls_51} ${styles.btnCompact}`}
                          title="View all followers referred by this agent"
                        >
                          <Users size={12} className={styles.iconSmallSpacing} />
                          {agent.followers_count || 0} Follower{agent.followers_count === 1 ? "" : "s"}
                        </button>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.fw800}>
                          {formatCurrency(agent.total_earned || 0)}
                        </div>
                      </td>
                      <td className={styles.td}>
                        {agent.is_agent_banned ? (
                          <div>
                            <span className={`${styles.userBadge} ${styles.adminCls_48}`}>
                              AGENCY BANNED
                            </span>
                            {agent.agent_ban_reason && (
                              <div className={styles.adminCls_47}>Reason: {agent.agent_ban_reason}</div>
                            )}
                          </div>
                        ) : agent.is_agent ? (
                          <span className={`${styles.userBadge} ${styles.monetizedYes}`}>
                            OFFICIAL AGENT
                          </span>
                        ) : (
                          <span className={styles.userBadge}>
                            REVOKED / STANDARD
                          </span>
                        )}
                      </td>
                      <td className={styles.td}>
                        <div className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
                          {/* TOGGLE MAKE / REVOKE AGENT */}
                          {agent.is_agent ? (
                            <button
                              disabled={userActionSubmitting}
                              onClick={async (e) => {
                                e.stopPropagation();
                                handleToggleAgent && handleToggleAgent(agent, false);
                                setTimeout(() => fetchAgentsList(agentsSearch), 800);
                              }}
                              className={`${styles.btnAction} ${styles.btnWarning}`}
                              title="Revoke official agent privileges"
                            >
                              {activeActionId === `toggle-agent-${agent.id}` && (
                                <span className={styles.btnSpinner} />
                              )}
                              {activeActionId === `toggle-agent-${agent.id}` ? "Revoking..." : "Revoke Agent"}
                            </button>
                          ) : !agent.is_agent_banned ? (
                            <button
                              disabled={userActionSubmitting}
                              onClick={async (e) => {
                                e.stopPropagation();
                                handleToggleAgent && handleToggleAgent(agent, true);
                                setTimeout(() => fetchAgentsList(agentsSearch), 800);
                              }}
                              className={`${styles.btnAction} ${styles.btnSuccess}`}
                              title="Make this user an official Agent"
                            >
                              {activeActionId === `toggle-agent-${agent.id}` && (
                                <span className={styles.btnSpinner} />
                              )}
                              {activeActionId === `toggle-agent-${agent.id}` ? "Activating..." : "+ Make Agent"}
                            </button>
                          ) : null}

                          {/* PURGE ALL FOLLOWERS IF AGENT HAS FOLLOWERS */}
                          {agent.followers_count > 0 && (
                            <button
                              disabled={userActionSubmitting}
                              onClick={async (e) => {
                                e.stopPropagation();
                                handleRemoveAllFollowers && handleRemoveAllFollowers(agent);
                                setTimeout(() => fetchAgentsList(agentsSearch), 1000);
                              }}
                              className={`${styles.btnAction} ${styles.btnDanger}`}
                              title="Purge / detach all followers from this agent"
                            >
                              {activeActionId === `purge-followers-${agent.id}` && (
                                <span className={styles.btnSpinner} />
                              )}
                              {activeActionId === `purge-followers-${agent.id}`
                                ? "Purging..."
                                : `Purge Followers (${agent.followers_count})`}
                            </button>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUser({ ...agent, initialTab: "network" });
                            }}
                            className={styles.btnAction}
                            title="Open full agent operations suite & network breakdown"
                          >
                            <User size={13} className={styles.iconSmallSpacing} />
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* VIEW 2: FOLLOWERS REGISTRY */}
      {activeSubTab === "followers" && (
        <>
          {followersAgentFilter && (
            <div className={styles.agentFilterBanner}>
              <div className={styles.agentFilterBannerText}>
                Showing followers connected to agent: <strong>{followersAgentFilter}</strong>
              </div>
              <button
                type="button"
                onClick={() => setFollowersAgentFilter("")}
                className={`${styles.btnAction} ${styles.btnCompactSm}`}
              >
                Clear Filter (Show All)
              </button>
            </div>
          )}

          <div className={styles.searchBar}>
            <input
              type="text"
              placeholder="Search by follower email/username or agent email/username..."
              value={followersSearch}
              onChange={(e) => {
                setFollowersSearch(e.target.value);
                setFollowersPage(0);
              }}
              className={styles.inputSearch}
            />
          </div>

          {followersLoading ? (
            <div className={styles.loadingText}>Loading followers registry...</div>
          ) : followers.length === 0 ? (
            <div className={styles.emptyText}>No registered follower edges found matching your search.</div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Follower (Invitee)</th>
                    <th className={styles.th}>Upline Agent</th>
                    <th className={styles.th}>Deduction Rate</th>
                    <th className={styles.th}>Commissions Generated</th>
                    <th className={styles.th}>Connected Date</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Complaint Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {followers.map((row) => (
                    <tr key={row.id} className={styles.tr}>
                      <td className={styles.td}>
                        <div className={styles.fw700}>
                          {row.follower_name || `@${row.follower_username}`}
                        </div>
                        <div className={styles.adminCls_43}>
                          @{row.follower_username}
                        </div>
                        <div className={styles.adminCls_44}>
                          {row.follower_email}
                        </div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.fw700}>
                          {row.agent_name || `@${row.agent_username}`}
                        </div>
                        <div className={styles.adminCls_43}>
                          @{row.agent_username} {row.agent_code ? `(${row.agent_code})` : ""}
                        </div>
                        <div className={styles.adminCls_44}>
                          {row.agent_email}
                        </div>
                      </td>
                      <td className={styles.td}>
                        <span className={`${styles.userBadge} ${styles.commissionRateBadge}`}>
                          {Math.round(row.commission_rate * 100)}%
                        </span>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.fw800}>
                          {formatCurrency(row.total_commission_earned || 0)}
                        </div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.adminCls_44}>
                          {row.created_at ? new Date(row.created_at).toLocaleDateString() : "N/A"}
                        </div>
                      </td>
                      <td className={styles.td}>
                        <span className={`${styles.userBadge} ${row.status === "opted_out" ? styles.adminCls_48 : styles.monetizedYes}`}>
                          {row.status === "opted_out" ? "Opted Out" : "Active Follower"}
                        </span>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.actionsCell}>
                          {/* REMOVE THIS SPECIFIC FOLLOWER BUTTON */}
                          <button
                            disabled={userActionSubmitting}
                            onClick={async () => {
                              handleRemoveFollower &&
                                handleRemoveFollower(
                                  {
                                    id: row.agent_id,
                                    email: row.agent_email,
                                    username: row.agent_username,
                                  },
                                  row.follower_email,
                                  `@${row.follower_username} (${row.follower_email})`
                                );
                              setTimeout(() => {
                                fetchFollowersList(followersPage, followersSearch, followersAgentFilter);
                              }, 1000);
                            }}
                            className={`${styles.btnAction} ${styles.btnDanger}`}
                            title="Detach and remove this follower from the agent"
                          >
                            {activeActionId === `remove-follower-${row.follower_email}` && (
                              <span className={styles.btnSpinner} />
                            )}
                            {activeActionId === `remove-follower-${row.follower_email}`
                              ? "Removing..."
                              : "Remove Follower"}
                          </button>

                          {row.follower_id && (
                            <button
                              onClick={() => setSelectedUser({ id: row.follower_id, email: row.follower_email, username: row.follower_username })}
                              className={styles.btnAction}
                              title="Inspect follower account profile"
                            >
                              Inspect User
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* VIEW 3: AFFILIATES REGISTRY */}
      {activeSubTab === "affiliates" && (
        <>
          <div className={styles.searchBar}>
            <input
              type="text"
              placeholder="Search affiliates by username, email, name, or role title..."
              value={affiliatesSearch}
              onChange={(e) => {
                setAffiliatesSearch(e.target.value);
                setAffiliatesPage(0);
              }}
              className={styles.inputSearch}
            />
          </div>

          {affiliatesLoading ? (
            <div className={styles.loadingText}>Loading affiliates directory...</div>
          ) : affiliates.length === 0 ? (
            <div className={styles.emptyText}>No registered affiliates found matching your query.</div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Affiliate Details</th>
                    <th className={styles.th}>Role &amp; Badge</th>
                    <th className={styles.th}>Career Staff</th>
                    <th className={styles.th}>50% Yield Earnings</th>
                    <th className={styles.th}>Wallet Balance</th>
                    <th className={styles.th}>Joined Date</th>
                    <th className={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {affiliates.map((aff) => {
                    const isMonetized = aff.monetized === "yes" || aff.monetized === true;
                    return (
                      <tr
                        key={aff.id}
                        className={`${styles.tr} ${styles.clickableRow}`}
                        onClick={() => setSelectedUser(aff)}
                        title="Click to view affiliate profile & wallet"
                      >
                        <td className={styles.td}>
                          <div className={styles.fw700}>
                            {aff.firstName} {aff.lastName}
                          </div>
                          <div className={styles.adminCls_43}>
                            @{aff.username?.replace(/^@/, "") || "user"}
                            <RoleStarBadges
                              email={aff.email}
                              isCareer={aff.is_career}
                              isAffiliate={aff.is_affiliate}
                              affiliateRole={aff.affiliate_role}
                              variant="compact"
                            />
                          </div>
                          <div className={styles.adminCls_44}>{aff.email}</div>
                        </td>
                        <td className={styles.td}>
                          <span className={`${styles.userBadge} ${styles.affiliateTableBadge}`}>
                            {aff.affiliate_role || "Official Affiliate"}
                          </span>
                        </td>
                        <td className={styles.td}>
                          {aff.is_career ? (
                            <span className={`${styles.userBadge} ${styles.careerTableBadge}`}>
                              PAAYH TEAM
                            </span>
                          ) : (
                            <span className={styles.userBadge}>External Partner</span>
                          )}
                        </td>
                        <td className={styles.td}>
                          <div className={styles.fw800} style={{ color: "var(--primary)" }}>
                            {formatCurrency(aff.affiliate_earned_total || 0)}
                          </div>
                        </td>
                        <td className={styles.td}>
                          <div className={styles.fw800}>
                            {formatCurrency(aff.balance || 0)}
                          </div>
                        </td>
                        <td className={styles.td}>
                          <div className={styles.adminCls_44}>
                            {aff.created_at ? new Date(aff.created_at).toLocaleDateString() : "N/A"}
                          </div>
                        </td>
                        <td className={styles.td}>
                          <div className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
                            <button
                              disabled={userActionSubmitting}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedUser({ ...aff, initialTab: "profile" });
                              }}
                              className={styles.btnAction}
                              title="Open affiliate profile, edit details & special roles"
                            >
                              <User size={13} className={styles.iconSmallSpacing} />
                              Manage
                            </button>

                            {/* REVOKE AFFILIATE STATUS */}
                            <button
                              disabled={userActionSubmitting}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateSpecialRoles &&
                                  handleUpdateSpecialRoles(aff, {
                                    isCareer: Boolean(aff.is_career),
                                    isAffiliate: false,
                                    affiliateRole: null,
                                  });
                                setTimeout(() => fetchAffiliatesList(affiliatesPage, affiliatesSearch), 800);
                              }}
                              className={`${styles.btnAction} ${styles.btnDanger}`}
                              title="Revoke affiliate badge and partnership privileges"
                            >
                              {activeActionId === `special-roles-${aff.id}` && (
                                <span className={styles.btnSpinner} />
                              )}
                              {activeActionId === `special-roles-${aff.id}` ? "Updating..." : "Revoke Affiliate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
});

export default AdminAgentsNetworkTab;
