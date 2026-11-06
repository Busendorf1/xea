"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import styles from "./page.module.css";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

const formatCurrency = (amount: number | string, country?: string | null) =>
  globalFormatCurrency(amount, country);

export interface AdminUserSuiteStatementTabProps {
  activeUser: any;
  userStatement: any[];
  loadingDetails: boolean;
  userActionSubmitting: boolean;
  activeActionId?: string | null;
  fetchDetails: (userId: string) => void;
  handleAdjustBalance: (user: any, amount: number) => void;
}

export function AdminUserSuiteStatementTab({
  activeUser,
  userStatement,
  loadingDetails,
  userActionSubmitting,
  activeActionId,
  fetchDetails,
  handleAdjustBalance,
}: AdminUserSuiteStatementTabProps) {
  return (
    <>
      <div className={styles.gridTwoCol}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Available Balance</span>
          <span className={`${styles.metricValue} ${styles.textSuccess}`}>
            {formatCurrency(activeUser.balance || 0)}
          </span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Pending Withdrawal</span>
          <span className={`${styles.metricValue} ${styles.textInfo}`}>
            {formatCurrency(activeUser.withdrawal || 0)}
          </span>
        </div>
      </div>

      <div className={styles.modalSectionCard}>
        <h4 className={styles.modalSectionTitle}>Quick Wallet Adjustments</h4>
        <div className={styles.quickAdjustRow}>
          <button
            disabled={userActionSubmitting}
            onClick={() => handleAdjustBalance(activeUser, 1000)}
            className={`${styles.btnAction} ${styles.btnSuccess}`}
          >
            {activeActionId === `adjust-balance-${activeUser.id}` && <span className={styles.btnSpinner} />}
            +₦1,000
          </button>
          <button
            disabled={userActionSubmitting}
            onClick={() => handleAdjustBalance(activeUser, 5000)}
            className={`${styles.btnAction} ${styles.btnSuccess}`}
          >
            {activeActionId === `adjust-balance-${activeUser.id}` && <span className={styles.btnSpinner} />}
            +₦5,000
          </button>
          <button
            disabled={userActionSubmitting}
            onClick={() => handleAdjustBalance(activeUser, -1000)}
            className={`${styles.btnAction} ${styles.btnDanger}`}
          >
            {activeActionId === `adjust-balance-${activeUser.id}` && <span className={styles.btnSpinner} />}
            -₦1,000
          </button>
          <button
            disabled={userActionSubmitting}
            onClick={() => {
              const customAmt = parseFloat(
                prompt("Enter amount to add (positive) or subtract (negative):") || "0"
              );
              if (!isNaN(customAmt) && customAmt !== 0) {
                handleAdjustBalance(activeUser, customAmt);
              }
            }}
            className={styles.btnAction}
          >
            {activeActionId === `adjust-balance-${activeUser.id}` && <span className={styles.btnSpinner} />}
            Custom Amount
          </button>
        </div>
      </div>

      <div className={styles.flexBetweenCenter}>
        <h4 className={`${styles.modalSectionTitle} ${styles.m0Bold}`}>
          Live Statement Ledger ({userStatement.length})
        </h4>
        <button
          onClick={() => fetchDetails(activeUser.id)}
          disabled={loadingDetails}
          className={`${styles.btnAction} ${styles.subTabActionBtn}`}
        >
          <RefreshCw size={13} className={loadingDetails ? styles.spin : ""} />
          Refresh
        </button>
      </div>

      {loadingDetails ? (
        <div className={styles.loadingText}>Loading statement records...</div>
      ) : userStatement.length === 0 ? (
        <div className={styles.emptyText}>No statement records found for this account.</div>
      ) : (
        <div className={styles.miniTableContainer}>
          <table className={styles.miniTable}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description / Ref</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {userStatement.map((tx) => {
                const isDebit = tx.type === "withdrawal" || tx.type === "ad_payment";
                return (
                  <tr key={tx.id || tx.reference}>
                    <td>
                      {new Date(tx.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>
                      <span className={styles.refCodeBold}>
                        {tx.type?.replace(/_/g, " ") || "transaction"}
                      </span>
                    </td>
                    <td>
                      <div className={styles.statementDescTruncate}>
                        {tx.description || tx.reference}
                      </div>
                    </td>
                    <td className={isDebit ? styles.reportTypeAdvertiser : styles.textSuccess}>
                      {isDebit ? "-" : "+"}{formatCurrency(tx.amount || 0)}
                    </td>
                    <td>
                      <span
                        className={`${styles.userBadge} ${
                          tx.status === "success"
                            ? styles.monetizedYes
                            : tx.status === "pending"
                            ? styles.btnWarning
                            : styles.btnDanger
                        } ${styles.fontXs}`}
                      >
                        {tx.status || "completed"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default AdminUserSuiteStatementTab;
