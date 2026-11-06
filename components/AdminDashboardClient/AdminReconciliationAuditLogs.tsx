"use client";

import React from "react";
import styles from "./page.module.css";

export interface AdminReconciliationAuditLogsProps {
  reconciliationData: {
    logs: any[];
  } | null;
  reconciliationLoading: boolean;
  reconciliationActionLoading: boolean;
  handleResolveReconciliationLog: (logId: string) => void;
}

export function AdminReconciliationAuditLogs({
  reconciliationData,
  reconciliationLoading,
  reconciliationActionLoading,
  handleResolveReconciliationLog,
}: AdminReconciliationAuditLogsProps) {
  const isActionDisabled = reconciliationActionLoading || reconciliationLoading;

  return (
    <div>
      <h3 className={`${styles.cardTitle} ${styles.adminCls_132}`}>
        System Audit and Reconciliation Log History
      </h3>
      {reconciliationLoading ? (
        <div className={styles.loadingText}>Fetching reconciliation logs...</div>
      ) : !reconciliationData?.logs || reconciliationData.logs.length === 0 ? (
        <div className={styles.emptyState}>No audit logs found. Run a nightly reconciliation scan.</div>
      ) : (
        <div className={styles.cardsGrid}>
          {reconciliationData.logs.map((log: any) => {
            const isHealthy = log.status === "HEALTHY";
            const isFlagged = log.status === "FLAGGED";

            return (
              <div key={log.id} className={styles.cardItem}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Audit Log #{log.id.slice(0, 8)}</h3>
                    <span className={styles.cardMeta}>
                      Run at: {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <span
                    className={
                      isHealthy ? styles.badgeHealthy : isFlagged ? styles.badgeFlagged : styles.badgeResolvedLog
                    }
                  >
                    {log.status}
                  </span>
                </div>

                <div className={`${styles.cardBody} ${styles.adminCls_129}`}>
                  <div>
                    <strong>Total Sent:</strong> ₦{(log.total_debits_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </div>
                  <div>
                    <strong>Total Received:</strong> ₦{(log.total_credits_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </div>
                  <div>
                    <strong>Variance:</strong> ₦{(log.variance_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </div>
                  {log.notes && (
                    <div className={styles.reportReasonBox}>
                      <strong>Audit Note:</strong> {log.notes}
                    </div>
                  )}
                </div>

                {isFlagged && (
                  <div className={styles.cardFooter}>
                    <button
                      type="button"
                      onClick={() => handleResolveReconciliationLog(log.id)}
                      disabled={isActionDisabled}
                      className={`${styles.btnAction} ${styles.resolveBtnLog} ${
                        isActionDisabled ? styles.btnDisabled : ""
                      }`}
                    >
                      Mark Resolved and Add Audit Note
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AdminReconciliationAuditLogs;
