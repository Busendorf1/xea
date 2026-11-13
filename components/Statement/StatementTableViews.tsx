"use client";

import React from "react";
import { Copy, Check, Download } from "lucide-react";
import styles from "./page.module.css";
import {
  StatementTransaction,
  isStatementCredit,
  formatStatementAmount,
  formatStatementDate,
  getStatementStatusBadge,
  getStatementTypeBadge,
} from "./statementUtils";

interface StatementTableViewsProps {
  activeTab: "payments" | "withdrawals";
  filteredPayments: StatementTransaction[];
  filteredWithdrawals: StatementTransaction[];
  paginatedPayments: StatementTransaction[];
  paginatedWithdrawals: StatementTransaction[];
  copiedRef: string | null;
  onCopy: (ref: string) => void;
  onSelectReceipt: (tx: StatementTransaction) => void;
  currentListLength: number;
  startIndex: number;
  endIndex: number;
  totalPages: number;
  validPage: number;
  onPageChange: (page: number) => void;
  hasMoreServer?: boolean;
  loadingMoreServer?: boolean;
  onLoadMoreServer?: () => void;
}

export default function StatementTableViews({
  activeTab,
  filteredPayments,
  filteredWithdrawals,
  paginatedPayments,
  paginatedWithdrawals,
  copiedRef,
  onCopy,
  onSelectReceipt,
  currentListLength,
  startIndex,
  endIndex,
  totalPages,
  validPage,
  onPageChange,
  hasMoreServer,
  loadingMoreServer,
  onLoadMoreServer,
}: StatementTableViewsProps) {
  return (
    <div className={styles.tableWrapper}>
      {activeTab === "payments" ? (
        filteredPayments.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No Transactions Found</div>
            <p>No payment or transfer records match your current filters.</p>
          </div>
        ) : (
          <>
            <table className={`${styles.table} ${styles.desktopTable}`}>
              <thead>
                <tr>
                  <th className={styles.th}>Date &amp; Time</th>
                  <th className={styles.th}>Reference</th>
                  <th className={styles.th}>Type</th>
                  <th className={styles.th}>Description</th>
                  <th className={`${styles.th} ${styles.thAmount}`}>Amount</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPayments.map((tx) => {
                  const isCredit = isStatementCredit(tx.type);
                  return (
                    <tr key={tx.id} className={styles.row}>
                      <td className={styles.tdDate}>{formatStatementDate(tx.created_at)}</td>
                      <td className={styles.tdRef}>
                        <div className={styles.refContainer}>
                          <span className={styles.refCode}>{tx.reference}</span>
                          <button
                            type="button"
                            onClick={() => onCopy(tx.reference)}
                            className={styles.copyBtn}
                            title="Copy Reference"
                          >
                            {copiedRef === tx.reference ? (
                              <Check size={12} color="#4b5e38" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className={styles.td}>{getStatementTypeBadge(tx.type)}</td>
                      <td className={styles.tdDesc}>{tx.description}</td>
                      <td className={`${styles.tdAmount} ${isCredit ? styles.amountCredit : styles.amountDebit}`}>
                        {isCredit ? `+ ${formatStatementAmount(tx.amount)}` : `- ${formatStatementAmount(tx.amount)}`}
                      </td>
                      <td className={styles.td}>{getStatementStatusBadge(tx.status)}</td>
                      <td className={styles.td}>
                        <button
                          type="button"
                          onClick={() => onSelectReceipt(tx)}
                          className={styles.receiptRowBtn}
                          title="Download or View Receipt"
                        >
                          <Download size={12} />
                          <span>Receipt</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className={styles.mobileCardList}>
              {paginatedPayments.map((tx) => {
                const isCredit = isStatementCredit(tx.type);
                return (
                  <div key={tx.id} className={styles.mobileCard}>
                    <div className={styles.mobileCardLeft}>
                      <div className={styles.mobileBadgeRow}>
                        <span className={styles.mobileTypeBadge}>{getStatementTypeBadge(tx.type)}</span>
                        <span className={styles.mobileStatusBadge}>{getStatementStatusBadge(tx.status)}</span>
                      </div>
                      <div className={styles.mobileDesc}>{tx.description}</div>
                      {tx.reference && (
                        <div className={styles.mobileRefRow}>
                          <span className={styles.mobileRefText}>Ref: {tx.reference}</span>
                          <button
                            type="button"
                            onClick={() => onCopy(tx.reference)}
                            className={styles.copyBtn}
                            title="Copy Reference"
                          >
                            {copiedRef === tx.reference ? (
                              <Check size={12} color="#4b5e38" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      )}
                      <div className={styles.mobileTime}>{formatStatementDate(tx.created_at)}</div>
                    </div>
                    <div className={styles.mobileCardRight}>
                      <div className={`${styles.mobileAmount} ${isCredit ? styles.amountCredit : styles.amountDebit}`}>
                        {isCredit ? `+ ${formatStatementAmount(tx.amount)}` : `- ${formatStatementAmount(tx.amount)}`}
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectReceipt(tx)}
                        className={styles.mobileReceiptBtn}
                        title="Download Receipt"
                      >
                        <Download size={11} />
                        <span>Receipt</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )
      ) : filteredWithdrawals.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No Withdrawals Found</div>
          <p>No bank withdrawal records match your current filters.</p>
        </div>
      ) : (
        <>
          <table className={`${styles.table} ${styles.desktopTable}`}>
            <thead>
              <tr>
                <th className={styles.th}>Date &amp; Time</th>
                <th className={styles.th}>Reference</th>
                <th className={styles.th}>Destination Account</th>
                <th className={`${styles.th} ${styles.thAmount}`}>Amount</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {paginatedWithdrawals.map((tx) => (
                <tr key={tx.id} className={styles.row}>
                  <td className={styles.tdDate}>{formatStatementDate(tx.created_at)}</td>
                  <td className={styles.tdRef}>
                    <div className={styles.refContainer}>
                      <span className={styles.refCode}>{tx.reference}</span>
                      <button
                        type="button"
                        onClick={() => onCopy(tx.reference)}
                        className={styles.copyBtn}
                        title="Copy Reference"
                      >
                        {copiedRef === tx.reference ? (
                          <Check size={12} color="#4b5e38" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className={styles.tdDesc}>{tx.description}</td>
                  <td className={`${styles.tdAmount} ${styles.amountDebit}`}>
                    - {formatStatementAmount(tx.amount)}
                  </td>
                  <td className={styles.td}>{getStatementStatusBadge(tx.status)}</td>
                  <td className={styles.td}>
                    <button
                      type="button"
                      onClick={() => onSelectReceipt(tx)}
                      className={styles.receiptRowBtn}
                      title="Download or View Receipt"
                    >
                      <Download size={12} />
                      <span>Receipt</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.mobileCardList}>
            {paginatedWithdrawals.map((tx) => (
              <div key={tx.id} className={styles.mobileCard}>
                <div className={styles.mobileCardLeft}>
                  <div className={styles.mobileBadgeRow}>
                    <span className={styles.mobileTypeBadge}>{getStatementTypeBadge("withdrawal")}</span>
                    <span className={styles.mobileStatusBadge}>{getStatementStatusBadge(tx.status)}</span>
                  </div>
                  <div className={styles.mobileDesc}>{tx.description}</div>
                  {tx.reference && (
                    <div className={styles.mobileRefRow}>
                      <span className={styles.mobileRefText}>Ref: {tx.reference}</span>
                      <button
                        type="button"
                        onClick={() => onCopy(tx.reference)}
                        className={styles.copyBtn}
                        title="Copy Reference"
                      >
                        {copiedRef === tx.reference ? (
                          <Check size={12} color="#4b5e38" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  )}
                  <div className={styles.mobileTime}>{formatStatementDate(tx.created_at)}</div>
                </div>
                <div className={styles.mobileCardRight}>
                  <div className={`${styles.mobileAmount} ${styles.amountDebit}`}>
                    - {formatStatementAmount(tx.amount)}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectReceipt(tx)}
                    className={styles.mobileReceiptBtn}
                    title="Download Receipt"
                  >
                    <Download size={11} />
                    <span>Receipt</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {currentListLength > 0 && (
        <div className={styles.paginationBar}>
          <div className={styles.paginationInfo}>
            Showing {startIndex + 1}–{endIndex} of {currentListLength}{" "}
            {activeTab === "payments" ? "transactions" : "withdrawals"}
          </div>
          <div className={styles.paginationControls}>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, validPage - 1))}
              disabled={validPage <= 1}
              className={styles.pageBtn}
              title="Previous Page"
            >
              ‹ Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - validPage) <= 2)
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span className={styles.pageEllipsis}>…</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onPageChange(p)}
                    className={`${styles.pageBtn} ${validPage === p ? styles.pageBtnActive : ""}`}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))}
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, validPage + 1))}
              disabled={validPage >= totalPages}
              className={styles.pageBtn}
              title="Next Page"
            >
              Next ›
            </button>
            {hasMoreServer && onLoadMoreServer && (
              <button
                type="button"
                onClick={onLoadMoreServer}
                disabled={loadingMoreServer}
                className={styles.pageBtn}
                title="Load older records from server"
              >
                {loadingMoreServer ? "Loading..." : "Load Older"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
