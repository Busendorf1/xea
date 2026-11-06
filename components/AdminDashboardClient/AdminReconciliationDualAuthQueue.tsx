"use client";

import React from "react";
import { ShieldCheck, RefreshCw, Search, X } from "lucide-react";
import styles from "./page.module.css";

export interface AdminReconciliationDualAuthQueueProps {
  pendingRequests: any[];
  pendingRequestsLoading: boolean;
  approvingRequestId: string | null;
  pendingRequestsPage: number;
  setPendingRequestsPage: (p: number) => void;
  pendingRequestsLimit: number;
  setPendingRequestsLimit: (l: number) => void;
  pendingRequestsStatusFilter: "ALL" | "PENDING" | "APPROVED" | "REJECTED";
  setPendingRequestsStatusFilter: (s: "ALL" | "PENDING" | "APPROVED" | "REJECTED") => void;
  pendingRequestsSearch: string;
  setPendingRequestsSearch: (s: string) => void;
  pendingRequestsPagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    status: string;
  } | null;
  pendingRequestsSummary: {
    pending_count: number;
    approved_count: number;
    rejected_count: number;
    total_count: number;
  };
  fetchPendingRequests: (fresh?: boolean, page?: number, limit?: number, status?: "ALL" | "PENDING" | "APPROVED" | "REJECTED", search?: string) => void;
  handleApproveRequest: (requestId: string) => void;
  handleRejectRequest: (requestId: string) => void;
  renderPagination: (
    currentPage: number,
    setCurrentPage: (p: number) => void,
    totalCount: number,
    limit?: number,
    setLimit?: (l: number) => void
  ) => React.ReactNode;
}

export function AdminReconciliationDualAuthQueue({
  pendingRequests,
  pendingRequestsLoading,
  approvingRequestId,
  pendingRequestsPage,
  setPendingRequestsPage,
  pendingRequestsLimit,
  setPendingRequestsLimit,
  pendingRequestsStatusFilter,
  setPendingRequestsStatusFilter,
  pendingRequestsSearch,
  setPendingRequestsSearch,
  pendingRequestsPagination,
  pendingRequestsSummary,
  fetchPendingRequests,
  handleApproveRequest,
  handleRejectRequest,
  renderPagination,
}: AdminReconciliationDualAuthQueueProps) {
  return (
    <div className={styles.adminCls_109}>
      <div className={styles.adminCls_110}>
        <div>
          <h3 className={`${styles.cardTitle} ${styles.adminCls_111}`}>
            <ShieldCheck size={18} color="#6366f1" />
            <span>Pending Dual-Authorization Queue (Four-Eyes Principle)</span>
          </h3>
          <span className={styles.adminCls_112}>
            Actions over ₦50,000 or sensitive modifications require explicit secondary peer admin review.
          </span>
        </div>
        <button
          type="button"
          onClick={() =>
            fetchPendingRequests(
              true,
              pendingRequestsPage,
              pendingRequestsLimit,
              pendingRequestsStatusFilter,
              pendingRequestsSearch
            )
          }
          disabled={pendingRequestsLoading}
          className={`${styles.btnAction} ${styles.adminCls_113}`}
        >
          <RefreshCw size={13} className={pendingRequestsLoading ? styles.spin : ""} />
          <span>{pendingRequestsLoading ? "Refreshing..." : "Refresh Queue"}</span>
        </button>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className={styles.adminCls_114}>
        <div className={styles.adminCls_115}>
          <button
            type="button"
            onClick={() => {
              setPendingRequestsStatusFilter("PENDING");
              setPendingRequestsPage(0);
              fetchPendingRequests(false, 0, pendingRequestsLimit, "PENDING", pendingRequestsSearch);
            }}
            className={`${styles.btnAction} ${styles.reconcileFilterBtn} ${
              pendingRequestsStatusFilter === "PENDING" ? styles.reconcileFilterBtnPending : ""
            }`}
          >
            Pending ({pendingRequestsSummary.pending_count})
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingRequestsStatusFilter("APPROVED");
              setPendingRequestsPage(0);
              fetchPendingRequests(false, 0, pendingRequestsLimit, "APPROVED", pendingRequestsSearch);
            }}
            className={`${styles.btnAction} ${styles.reconcileFilterBtn} ${
              pendingRequestsStatusFilter === "APPROVED" ? styles.reconcileFilterBtnApproved : ""
            }`}
          >
            Approved ({pendingRequestsSummary.approved_count})
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingRequestsStatusFilter("REJECTED");
              setPendingRequestsPage(0);
              fetchPendingRequests(false, 0, pendingRequestsLimit, "REJECTED", pendingRequestsSearch);
            }}
            className={`${styles.btnAction} ${styles.reconcileFilterBtn} ${
              pendingRequestsStatusFilter === "REJECTED" ? styles.reconcileFilterBtnRejected : ""
            }`}
          >
            Rejected ({pendingRequestsSummary.rejected_count})
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingRequestsStatusFilter("ALL");
              setPendingRequestsPage(0);
              fetchPendingRequests(false, 0, pendingRequestsLimit, "ALL", pendingRequestsSearch);
            }}
            className={`${styles.btnAction} ${styles.reconcileFilterBtn} ${
              pendingRequestsStatusFilter === "ALL" ? styles.reconcileFilterBtnAll : ""
            }`}
          >
            All Records ({pendingRequestsSummary.total_count})
          </button>
        </div>

        <div className={styles.adminCls_116}>
          <Search size={14} className={styles.adminCls_117} />
          <input
            type="text"
            placeholder="Search requests..."
            value={pendingRequestsSearch}
            onChange={(e) => setPendingRequestsSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPendingRequestsPage(0);
                fetchPendingRequests(false, 0, pendingRequestsLimit, pendingRequestsStatusFilter, pendingRequestsSearch);
              }
            }}
            className={styles.adminCls_118}
          />
          {pendingRequestsSearch && (
            <button
              type="button"
              onClick={() => {
                setPendingRequestsSearch("");
                setPendingRequestsPage(0);
                fetchPendingRequests(false, 0, pendingRequestsLimit, pendingRequestsStatusFilter, "");
              }}
              className={styles.adminCls_119}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {pendingRequestsLoading ? (
        <div className={styles.loadingText}>Loading authorization queue...</div>
      ) : pendingRequests.length === 0 ? (
        <div className={`${styles.emptyState} ${styles.adminCls_120}`}>
          No authorizations found matching criteria. All clear!
        </div>
      ) : (
        <>
          <div className={styles.cardsGrid}>
            {pendingRequests.map((req: any) => {
              const isPending = req.status === "PENDING";
              const isApproved = req.status === "APPROVED";

              return (
                <div
                  key={req.id}
                  className={`${styles.cardItem} ${
                    isPending
                      ? styles.cardItemBorderPending
                      : isApproved
                      ? styles.cardItemBorderApproved
                      : styles.cardItemBorderRejected
                  }`}
                >
                  <div className={styles.cardHeader}>
                    <div>
                      <h3 className={`${styles.cardTitle} ${styles.capitalize}`}>
                        {req.action_type.replace(/_/g, " ")}
                      </h3>
                      <span className={styles.cardMeta}>
                        Requested by <strong>{req.requested_by}</strong> on {new Date(req.created_at).toLocaleString()}
                      </span>
                    </div>
                    <span
                      className={
                        isPending ? styles.badgePending : isApproved ? styles.badgeApproved : styles.badgeRejected
                      }
                    >
                      {req.status}
                    </span>
                  </div>

                  <div className={`${styles.cardDetails} ${styles.adminCls_121}`}>
                    {req.amount_kobo > 0 && (
                      <div>
                        <strong>Amount:</strong> ₦{(req.amount_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </div>
                    )}
                    {req.amount_naira > 0 && (
                      <div>
                        <strong>Amount:</strong> ₦{Number(req.amount_naira).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </div>
                    )}
                    {req.target_reference && (
                      <div>
                        <strong>Reference:</strong> <code>{req.target_reference}</code>
                      </div>
                    )}
                    {req.target_identifier && (
                      <div>
                        <strong>Target:</strong> <code>{req.target_identifier}</code>
                      </div>
                    )}
                    {req.target_user_email && (
                      <div>
                        <strong>Target User:</strong> {req.target_user_email}
                      </div>
                    )}
                    {req.reason && (
                      <div className={`${styles.reportReasonBox} ${styles.adminCls_122}`}>
                        <strong>Reason:</strong> {req.reason}
                      </div>
                    )}
                    {req.approved_by && (
                      <div className={styles.adminCls_123}>
                        <strong>Approved By:</strong> {req.approved_by}
                      </div>
                    )}
                    {req.rejected_by && (
                      <div className={styles.adminCls_124}>
                        <strong>Rejected By:</strong> {req.rejected_by} ({req.rejection_reason || "No reason given"})
                      </div>
                    )}
                  </div>

                  {isPending && (
                    <div className={`${styles.cardFooter} ${styles.adminCls_125}`}>
                      <button
                        type="button"
                        onClick={() => handleApproveRequest(req.id)}
                        disabled={approvingRequestId === req.id}
                        className={`${styles.btnAction} ${styles.btnSuccess} ${styles.adminCls_126}`}
                      >
                        {approvingRequestId === req.id ? "Approving..." : "Approve and Execute"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectRequest(req.id)}
                        disabled={approvingRequestId === req.id}
                        className={`${styles.btnAction} ${styles.btnDanger} ${styles.adminCls_126}`}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {renderPagination(
            pendingRequestsPage,
            (newPage) => {
              setPendingRequestsPage(newPage);
              fetchPendingRequests(
                false,
                newPage,
                pendingRequestsLimit,
                pendingRequestsStatusFilter,
                pendingRequestsSearch
              );
            },
            pendingRequestsPagination?.totalCount ?? 0,
            pendingRequestsLimit,
            (newLimit) => {
              setPendingRequestsLimit(newLimit);
              setPendingRequestsPage(0);
              fetchPendingRequests(
                false,
                0,
                newLimit,
                pendingRequestsStatusFilter,
                pendingRequestsSearch
              );
            }
          )}
        </>
      )}
    </div>
  );
}

export default AdminReconciliationDualAuthQueue;
