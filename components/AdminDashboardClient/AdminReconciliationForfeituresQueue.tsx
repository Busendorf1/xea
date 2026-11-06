"use client";

import React from "react";
import { Building2, RefreshCw, Search, X, Zap } from "lucide-react";
import styles from "./page.module.css";

export interface AdminReconciliationForfeituresQueueProps {
  reconciliationData: {
    forfeitedBalances?: any[];
    forfeituresPagination?: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      status: string;
    };
    pendingForfeituresCount?: number;
  } | null;
  reconciliationLoading: boolean;
  forfeitedPage: number;
  setForfeitedPage: (p: number) => void;
  forfeitedLimit: number;
  setForfeitedLimit: (l: number) => void;
  forfeitedStatusFilter: "ALL" | "PENDING" | "RESOLVED";
  setForfeitedStatusFilter: (s: "ALL" | "PENDING" | "RESOLVED") => void;
  forfeitedSearch: string;
  setForfeitedSearch: (s: string) => void;
  forfeitureActionLoading: string | null;
  fetchReconciliationData: (fresh?: boolean, page?: number, limit?: number, status?: "ALL" | "PENDING" | "RESOLVED", search?: string) => void;
  handleResolveForfeiture: (forfeitureId: string, amount: number) => void;
  renderPagination: (
    currentPage: number,
    setCurrentPage: (p: number) => void,
    totalCount: number,
    limit?: number,
    setLimit?: (l: number) => void
  ) => React.ReactNode;
}

export function AdminReconciliationForfeituresQueue({
  reconciliationData,
  reconciliationLoading,
  forfeitedPage,
  setForfeitedPage,
  forfeitedLimit,
  setForfeitedLimit,
  forfeitedStatusFilter,
  setForfeitedStatusFilter,
  forfeitedSearch,
  setForfeitedSearch,
  forfeitureActionLoading,
  fetchReconciliationData,
  handleResolveForfeiture,
  renderPagination,
}: AdminReconciliationForfeituresQueueProps) {
  return (
    <div className={styles.adminCls_109}>
      <div className={styles.adminCls_110}>
        <div>
          <h3 className={`${styles.cardTitle} ${styles.adminCls_111}`}>
            <Building2 size={18} color="#10b981" />
            <span>Deactivated Account Forfeited Balances (Treasury Absorption Queue)</span>
          </h3>
          <span className={styles.adminCls_112}>
            When users deactivate accounts with balances below withdrawal thresholds and forfeit funds, review and resolve them to platform balance with an immutable audit log trace.
          </span>
        </div>

        <button
          type="button"
          onClick={() =>
            fetchReconciliationData(
              true,
              forfeitedPage,
              forfeitedLimit,
              forfeitedStatusFilter,
              forfeitedSearch
            )
          }
          disabled={reconciliationLoading}
          className={`${styles.btnAction} ${styles.adminCls_113}`}
        >
          <RefreshCw size={13} />
          <span>{reconciliationLoading ? "Refreshing..." : "Refresh Queue"}</span>
        </button>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className={styles.adminCls_114}>
        <div className={styles.adminCls_115}>
          <button
            type="button"
            onClick={() => {
              setForfeitedStatusFilter("ALL");
              setForfeitedPage(0);
              fetchReconciliationData(false, 0, forfeitedLimit, "ALL", forfeitedSearch);
            }}
            className={`${styles.btnAction} ${styles.reconcileFilterBtn} ${
              forfeitedStatusFilter === "ALL" ? styles.reconcileFilterBtnAll : ""
            }`}
          >
            All Records
          </button>
          <button
            type="button"
            onClick={() => {
              setForfeitedStatusFilter("PENDING");
              setForfeitedPage(0);
              fetchReconciliationData(false, 0, forfeitedLimit, "PENDING", forfeitedSearch);
            }}
            className={`${styles.btnAction} ${styles.reconcileFilterBtn} ${
              forfeitedStatusFilter === "PENDING" ? styles.reconcileFilterBtnPending : ""
            }`}
          >
            Pending ({reconciliationData?.pendingForfeituresCount ?? 0})
          </button>
          <button
            type="button"
            onClick={() => {
              setForfeitedStatusFilter("RESOLVED");
              setForfeitedPage(0);
              fetchReconciliationData(false, 0, forfeitedLimit, "RESOLVED", forfeitedSearch);
            }}
            className={`${styles.btnAction} ${styles.reconcileFilterBtn} ${
              forfeitedStatusFilter === "RESOLVED" ? styles.reconcileFilterBtnApproved : ""
            }`}
          >
            Resolved
          </button>
        </div>

        <div className={styles.adminCls_116}>
          <Search size={14} className={styles.adminCls_117} />
          <input
            type="text"
            placeholder="Filter by email or user..."
            value={forfeitedSearch}
            onChange={(e) => setForfeitedSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setForfeitedPage(0);
                fetchReconciliationData(false, 0, forfeitedLimit, forfeitedStatusFilter, forfeitedSearch);
              }
            }}
            className={styles.adminCls_118}
          />
          {forfeitedSearch && (
            <button
              type="button"
              onClick={() => {
                setForfeitedSearch("");
                setForfeitedPage(0);
                fetchReconciliationData(false, 0, forfeitedLimit, forfeitedStatusFilter, "");
              }}
              className={styles.adminCls_119}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {!reconciliationData?.forfeitedBalances || reconciliationData.forfeitedBalances.length === 0 ? (
        <div className={`${styles.emptyState} ${styles.adminCls_127}`}>
          No forfeited balances matching criteria. All records clean!
        </div>
      ) : (
        <>
          <div className={styles.cardsGrid}>
            {reconciliationData.forfeitedBalances.map((item: any) => {
              const isPending = item.status === "PENDING";
              const amountFormatted = `₦${(parseFloat(item.amount) || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

              return (
                <div key={item.id} className={styles.cardItem}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h3 className={`${styles.cardTitle} ${styles.adminCls_128}`}>
                        {item.username ? `@${item.username}` : item.user_email}
                      </h3>
                      <span className={styles.cardMeta}>
                        Deactivated: {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                    <span className={isPending ? styles.badgePending : styles.badgeApproved}>
                      {item.status}
                    </span>
                  </div>

                  <div className={`${styles.cardBody} ${styles.adminCls_129}`}>
                    <div>
                      <strong>Account Email:</strong> <span className={styles.textForeground}>{item.user_email}</span>
                    </div>
                    <div>
                      <strong>Forfeited Amount:</strong>{" "}
                      <span className={styles.adminCls_130}>{amountFormatted}</span>
                    </div>
                    <div>
                      <strong>Reason:</strong> <span className={styles.textMuted}>{item.reason}</span>
                    </div>

                    {!isPending && item.resolved_by && (
                      <div className={styles.adminCls_131}>
                        <div><strong>Resolved By:</strong> {item.resolved_by}</div>
                        {item.resolved_at && <div><strong>Resolved At:</strong> {new Date(item.resolved_at).toLocaleString()}</div>}
                        {item.resolution_notes && <div><strong>Audit Note:</strong> {item.resolution_notes}</div>}
                      </div>
                    )}
                  </div>

                  {isPending && (
                    <div className={styles.cardFooter}>
                      <button
                        type="button"
                        onClick={() => handleResolveForfeiture(item.id, parseFloat(item.amount) || 0)}
                        disabled={forfeitureActionLoading === item.id || reconciliationLoading}
                        className={`${styles.btnAction} ${styles.resolveBtnForfeiture} ${
                          forfeitureActionLoading === item.id || reconciliationLoading ? styles.btnDisabled : ""
                        }`}
                      >
                        <Zap size={14} />
                        <span>{forfeitureActionLoading === item.id ? "Resolving..." : "Resolve to Platform Balance"}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {renderPagination(
            forfeitedPage,
            (newPage) => {
              setForfeitedPage(newPage);
              fetchReconciliationData(false, newPage, forfeitedLimit, forfeitedStatusFilter, forfeitedSearch);
            },
            reconciliationData?.forfeituresPagination?.totalCount ?? 0,
            forfeitedLimit,
            (newLimit) => {
              setForfeitedLimit(newLimit);
              setForfeitedPage(0);
              fetchReconciliationData(false, 0, newLimit, forfeitedStatusFilter, forfeitedSearch);
            }
          )}
        </>
      )}
    </div>
  );
}

export default AdminReconciliationForfeituresQueue;
