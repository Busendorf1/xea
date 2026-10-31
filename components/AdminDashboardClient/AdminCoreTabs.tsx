"use client";

import React from "react";
import { Search, Reply, CheckCircle, Trash2 } from "lucide-react";
import styles from "./page.module.css";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

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
  setBanModalUser,
  setBanModalStatus,
  setBanModalReason,
}: AdminAccountsTabProps) {
  return (
    <>
      <div>
        <h1 className={styles.sectionTitle}>User Registry</h1>
        <p className={styles.sectionSubtitle}>
          User profiles, balances, monetization, and access controls.
        </p>
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
                    <tr key={user.id} className={styles.tr}>
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
                          {isMonetized ? "Monetized" : "Free Tier"}
                        </span>
                      </td>
                      <td className={styles.td}>
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
                      <td className={styles.td}>
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
                        <div className={styles.actionsCell}>
                          <button onClick={() => setSelectedUser(user)} className={styles.btnAction}>
                            Manage Profile
                          </button>
                          <button
                            onClick={() => handleToggleMonetization(user)}
                            className={`${styles.btnAction} ${isMonetized ? styles.btnDanger : styles.btnSuccess}`}
                          >
                            {isMonetized ? "Disable Earn" : "Enable Earn"}
                          </button>
                          <button
                            onClick={() => {
                              setBanModalUser(user);
                              setBanModalStatus(user.ad_account_status || "temp_banned");
                              setBanModalReason(user.ad_ban_reason || "");
                            }}
                            className={`${styles.btnAction} ${styles.adminCls_51}`}
                          >
                            Ad Ban / Restrict
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

export interface AdminHelpCenterTabProps {
  loading: boolean;
  helpTickets: any[];
  helpTicketsCount: number;
  helpTicketsPage: number;
  setHelpTicketsPage: React.Dispatch<React.SetStateAction<number>>;
  helpTicketSearch: string;
  setHelpTicketSearch: (s: string) => void;
  setReplyingTicket: (t: any) => void;
  setReplyText: (s: string) => void;
  handleCloseTicket: (ticket: any) => void;
  handleDeleteTicket: (id: string) => void;
}

export const AdminHelpCenterTab = React.memo(function AdminHelpCenterTab({
  loading,
  helpTickets,
  helpTicketsCount,
  helpTicketsPage,
  setHelpTicketsPage,
  helpTicketSearch,
  setHelpTicketSearch,
  setReplyingTicket,
  setReplyText,
  handleCloseTicket,
  handleDeleteTicket,
}: AdminHelpCenterTabProps) {
  return (
    <>
      <h1 className={styles.sectionTitle}>Help Center — User Tickets</h1>
      <p className={styles.sectionSubtitle}>View and reply to user-submitted support requests.</p>

      <div className={styles.adminCls_62}>
        <div className={styles.adminCls_63}>
          <Search size={15} className={styles.adminCls_64} />
          <input
            type="text"
            placeholder="Search by email, subject, or category..."
            value={helpTicketSearch}
            onChange={(e) => {
              setHelpTicketSearch(e.target.value);
              setHelpTicketsPage(0);
            }}
            className={`${styles.inputField} ${styles.adminCls_65}`}
          />
        </div>
      </div>

      {loading ? (
        <p className={styles.adminCls_66}>Loading tickets...</p>
      ) : helpTickets.length === 0 ? (
        <p className={styles.adminCls_66}>No tickets found.</p>
      ) : (
        <>
          <div className={styles.adminCls_53}>
            {helpTickets.map((ticket) => (
              <div key={ticket.id} className={styles.adminCls_67}>
                <div className={styles.adminCls_68}>
                  <div>
                    <span className={styles.adminCls_69}>{ticket.subject}</span>
                    <div className={styles.adminCls_70}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "0.15rem 0.6rem",
                          borderRadius: "99px",
                          textTransform: "uppercase" as const,
                          background:
                            ticket.status === "closed" || ticket.status === "resolved"
                              ? "rgba(16,185,129,0.15)"
                              : ticket.status === "replied"
                              ? "rgba(52,211,153,0.15)"
                              : "rgba(251,191,36,0.15)",
                          color:
                            ticket.status === "closed" || ticket.status === "resolved"
                              ? "#10b981"
                              : ticket.status === "replied"
                              ? "#34d399"
                              : "#fbbf24",
                        }}
                      >
                        {ticket.status === "closed" || ticket.status === "resolved"
                          ? "CLOSED (Deletes in 24h)"
                          : ticket.status.toUpperCase()}
                      </span>
                      <span className={styles.adminCls_71}>{ticket.category}</span>
                      <span className={styles.adminCls_72}>
                        {new Date(ticket.created_at).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className={styles.adminCls_73}>
                    <button
                      onClick={() => {
                        setReplyingTicket(ticket);
                        setReplyText(ticket.admin_reply || "");
                      }}
                      className={`${styles.btnAction} ${styles.adminCls_74}`}
                    >
                      <Reply size={13} /> Reply
                    </button>
                    {ticket.status !== "resolved" && ticket.status !== "closed" && (
                      <button
                        onClick={() => handleCloseTicket(ticket)}
                        className={`${styles.btnAction} ${styles.adminCls_75}`}
                      >
                        <CheckCircle size={13} /> Mark as Closed
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteTicket(ticket.id)}
                      className={`${styles.btnAction} ${styles.btnDanger} ${styles.adminCls_76}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <p className={styles.adminCls_77}>
                  <strong className={styles.textForeground}>From:</strong>{" "}
                  {ticket.name ? `${ticket.name} — ` : ""}
                  {ticket.user_email}
                </p>
                <p className={styles.adminCls_78}>{ticket.message}</p>

                {ticket.admin_reply && (
                  <div className={styles.adminCls_79}>
                    <div className={styles.adminCls_80}>
                      <p className={styles.adminCls_81}>Admin Reply</p>
                      {ticket.replied_at && (
                        <span className={styles.adminCls_82}>
                          Replied:{" "}
                          {new Date(ticket.replied_at).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                    <p className={styles.adminCls_83}>{ticket.admin_reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={styles.adminCls_84}>
            <button
              onClick={() => setHelpTicketsPage((p) => Math.max(0, p - 1))}
              disabled={helpTicketsPage === 0}
              className={styles.btnAction}
            >
              Prev
            </button>
            <span className={styles.adminCls_85}>
              Page {helpTicketsPage + 1} of {Math.max(1, Math.ceil(helpTicketsCount / 10))} ({helpTicketsCount} total)
            </span>
            <button
              onClick={() => setHelpTicketsPage((p) => p + 1)}
              disabled={(helpTicketsPage + 1) * 10 >= helpTicketsCount}
              className={styles.btnAction}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
});

export interface AdminReportedAdsTabProps {
  loading: boolean;
  reportedAds: any[];
  reportedAdsCount: number;
  reportedAdsPage: number;
  setReportedAdsPage: (p: number) => void;
  reportedAdsSearch: string;
  setReportedAdsSearch: (s: string) => void;
  adActionLoading: string | null;
  handleInspectAd: (id: string) => void;
  handleDeactivateReportedAd: (adId: string, reportId: string) => void;
  handleBlockReportedAdvertiser: (email: string, reportId: string) => void;
  handleDismissReport: (reportId: string) => void;
  renderPagination: (
    page: number,
    setPage: (p: number) => void,
    count: number
  ) => React.ReactNode;
}

export const AdminReportedAdsTab = React.memo(function AdminReportedAdsTab({
  loading,
  reportedAds,
  reportedAdsCount,
  reportedAdsPage,
  setReportedAdsPage,
  reportedAdsSearch,
  setReportedAdsSearch,
  adActionLoading,
  handleInspectAd,
  handleDeactivateReportedAd,
  handleBlockReportedAdvertiser,
  handleDismissReport,
  renderPagination,
}: AdminReportedAdsTabProps) {
  return (
    <>
      <div>
        <h1 className={styles.sectionTitle}>Ad Guard and Content Reports</h1>
        <p className={styles.sectionSubtitle}>
          Review user-reported ads and advertisers. Take instant action to remove ad campaigns or block advertiser accounts.
        </p>
      </div>

      <div className={styles.reportSearchBarContainer}>
        <Search className={styles.reportSearchIcon} size={18} />
        <input
          type="text"
          placeholder="Search reports by Ad ID, reporter email, advertiser email, or reason..."
          value={reportedAdsSearch}
          onChange={(e) => {
            setReportedAdsSearch(e.target.value);
            setReportedAdsPage(0);
          }}
          className={styles.reportSearchInput}
        />
      </div>

      {loading ? (
        <div className={styles.loadingText}>Fetching reported ads from database...</div>
      ) : reportedAds.length === 0 ? (
        <div className={styles.emptyState}>No ad or advertiser reports found.</div>
      ) : (
        <>
          <div className={styles.cardsGrid}>
            {reportedAds.map((report) => (
              <div key={report.id} className={styles.cardItem}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Report ID: {report.id.slice(0, 8)}</h3>
                    <span className={styles.cardMeta}>
                      Reported by: <strong className={styles.textForeground}>{report.reporter_email}</strong> · Reported on{" "}
                      {new Date(report.created_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: "99px",
                      backgroundColor:
                        report.status === "action_taken"
                          ? "rgba(239,68,68,0.15)"
                          : report.status === "dismissed"
                          ? "rgba(255,255,255,0.05)"
                          : "rgba(245,158,11,0.15)",
                      color:
                        report.status === "action_taken"
                          ? "#ef4444"
                          : report.status === "dismissed"
                          ? "var(--text-muted)"
                          : "#f59e0b",
                      border: `1px solid ${
                        report.status === "action_taken"
                          ? "rgba(239,68,68,0.3)"
                          : report.status === "dismissed"
                          ? "var(--card-border)"
                          : "rgba(245,158,11,0.3)"
                      }`,
                    }}
                  >
                    {report.status.toUpperCase()}
                  </span>
                </div>

                <div className={`${styles.cardBody} ${styles.adminCls_92}`}>
                  <div>
                    <strong>Report Type:</strong>{" "}
                    <span
                      style={{
                        color: report.report_type === "advertiser" ? "#ef4444" : "#2563eb",
                        fontWeight: 600,
                      }}
                    >
                      {report.report_type === "advertiser"
                        ? "Block and Report Advertiser"
                        : "Block and Report Ad"}
                    </span>
                  </div>
                  <div className={styles.adminCls_93}>
                    <strong>Target Ad ID:</strong>
                    <button
                      type="button"
                      onClick={() => handleInspectAd(report.ad_id)}
                      title="Click to inspect full ad details"
                      className={styles.inspectAdLink}
                    >
                      <span>{report.ad_id}</span>
                      <span>(Inspect Ad Details)</span>
                    </button>
                  </div>
                  {report.advertiser_email && (
                    <div>
                      <strong>Advertiser Email:</strong>{" "}
                      <code className={styles.adminCls_94}>{report.advertiser_email}</code>
                    </div>
                  )}
                  {report.reason && (
                    <div className={styles.reportReasonBox}>
                      <strong className={styles.textForeground}>User Reason:</strong> {report.reason}
                    </div>
                  )}
                </div>

                <div className={`${styles.cardFooter} ${styles.adminCls_95}`}>
                  <button onClick={() => handleInspectAd(report.ad_id)} className={styles.inspectAdLink}>
                    Inspect Ad Details
                  </button>
                  <button
                    onClick={() => handleDeactivateReportedAd(report.ad_id, report.id)}
                    disabled={adActionLoading === `deactivate-${report.id || report.ad_id}`}
                    className={`${styles.btnAction} ${styles.btnDanger}`}
                  >
                    {adActionLoading === `deactivate-${report.id || report.ad_id}`
                      ? "Deactivating..."
                      : "Deactivate Ad for All Users"}
                  </button>
                  {report.advertiser_email && (
                    <button
                      onClick={() => handleBlockReportedAdvertiser(report.advertiser_email, report.id)}
                      disabled={adActionLoading === `block-${report.id || report.advertiser_email}`}
                      className={`${styles.btnAction} ${styles.btnDanger}`}
                    >
                      {adActionLoading === `block-${report.id || report.advertiser_email}`
                        ? "Blocking..."
                        : "Block Advertiser Account"}
                    </button>
                  )}
                  {report.status === "pending" && (
                    <button
                      onClick={() => handleDismissReport(report.id)}
                      disabled={adActionLoading === `dismiss-${report.id}`}
                      className={styles.btnAction}
                    >
                      {adActionLoading === `dismiss-${report.id}` ? "Dismissing..." : "Dismiss Report"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {renderPagination(reportedAdsPage, setReportedAdsPage, reportedAdsCount)}
        </>
      )}
    </>
  );
});
