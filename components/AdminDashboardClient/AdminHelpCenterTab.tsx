"use client";

import React from "react";
import { Search, Reply, CheckCircle, Trash2 } from "lucide-react";
import styles from "./page.module.css";

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
  const getTicketStatusBadgeClass = (status: string) => {
    if (status === "closed" || status === "resolved") return styles.ticketBadgeClosed;
    if (status === "replied") return styles.ticketBadgeReplied;
    return styles.ticketBadgePending;
  };

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
                      <span className={getTicketStatusBadgeClass(ticket.status)}>
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
