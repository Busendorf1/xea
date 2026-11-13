"use client";

import React from "react";
import {
  RotateCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import styles from "./page.module.css";

export interface PayoutItem {
  id: string;
  reference: string;
  user_email: string;
  amount: number;
  status: string;
  description?: string;
  metadata?: {
    bankCode?: string;
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
    gateway?: string;
    gateway_status?: string;
    failure_reason?: string;
    queued_reason?: string;
    error?: string;
    fee?: number;
    gateway_fee?: number;
    transfer_fee?: number;
    net_amount?: number;
    [key: string]: any;
  };
  created_at: string;
}

interface AdminPayoutsTableProps {
  payouts: PayoutItem[];
  loading: boolean;
  actionLoading: boolean;
  selectedRefs: Set<string>;
  toggleSelectAll: () => void;
  toggleSelectRef: (ref: string) => void;
  onSelectReceipt: (item: PayoutItem) => void;
  onRetrySingle: (ref: string) => void;
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (nextPage: number) => void;
}

function getStatusBadge(status: string) {
  const s = (status || "").toLowerCase();
  switch (s) {
    case "success":
      return (
        <span
          style={{
            background: "rgba(16, 185, 129, 0.12)",
            color: "#10b981",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            padding: "4px 10px",
            borderRadius: "6px",
            fontWeight: 600,
            fontSize: "12px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <CheckCircle2 size={12} /> Completed
        </span>
      );
    case "queued":
      return (
        <span
          style={{
            background: "rgba(245, 158, 11, 0.12)",
            color: "#f59e0b",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            padding: "4px 10px",
            borderRadius: "6px",
            fontWeight: 600,
            fontSize: "12px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <Clock size={12} /> Queued
        </span>
      );
    case "processing":
      return (
        <span
          style={{
            background: "rgba(59, 130, 246, 0.12)",
            color: "#3b82f6",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            padding: "4px 10px",
            borderRadius: "6px",
            fontWeight: 600,
            fontSize: "12px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <RotateCw size={12} className="spin" /> Processing
        </span>
      );
    case "pending":
      return (
        <span
          style={{
            background: "rgba(234, 179, 8, 0.12)",
            color: "#eab308",
            border: "1px solid rgba(234, 179, 8, 0.25)",
            padding: "4px 10px",
            borderRadius: "6px",
            fontWeight: 600,
            fontSize: "12px",
          }}
        >
          Pending
        </span>
      );
    case "failed":
      return (
        <span
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            color: "#ef4444",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            padding: "4px 10px",
            borderRadius: "6px",
            fontWeight: 600,
            fontSize: "12px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <AlertCircle size={12} /> Failed
        </span>
      );
    default:
      return (
        <span
          style={{
            background: "var(--sidebar-bg)",
            color: "var(--text-muted)",
            border: "1px solid var(--card-border)",
            padding: "4px 10px",
            borderRadius: "6px",
            fontSize: "12px",
          }}
        >
          {status}
        </span>
      );
  }
}

export function AdminPayoutsTable({
  payouts,
  loading,
  actionLoading,
  selectedRefs,
  toggleSelectAll,
  toggleSelectRef,
  onSelectReceipt,
  onRetrySingle,
  page,
  totalPages,
  totalCount,
  onPageChange,
}: AdminPayoutsTableProps) {
  return (
    <>
      <div className={styles.tableContainer} style={{ scrollBehavior: "smooth" }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th} style={{ width: "40px" }}>
                <input
                  type="checkbox"
                  checked={selectedRefs.size === payouts.length && payouts.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className={styles.th}>Reference & Date</th>
              <th className={styles.th}>User Email</th>
              <th className={styles.th}>Amount</th>
              <th className={styles.th}>Bank Destination</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Reason / Notes</th>
              <th className={styles.th} style={{ textAlign: "right" }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={8}
                  className={styles.td}
                  style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}
                >
                  <RotateCw size={24} className="spin" style={{ margin: "0 auto 8px" }} />
                  <div>Loading withdrawal payouts...</div>
                </td>
              </tr>
            ) : payouts.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className={styles.td}
                  style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}
                >
                  No withdrawal records found matching this filter.
                </td>
              </tr>
            ) : (
              payouts.map((item) => {
                const meta = item.metadata || {};
                const isRetryable =
                  item.status === "failed" || item.status === "queued" || item.status === "pending";
                const rawAmount = parseFloat((item.amount as any) || (meta.amount as any) || 0);
                const dynamicFee = meta.gateway_fee ?? meta.transfer_fee ?? meta.fee;
                const dynamicNet = meta.net_amount;

                return (
                  <tr key={item.id} className={styles.tr}>
                    <td className={styles.td}>
                      <input
                        type="checkbox"
                        checked={selectedRefs.has(item.reference)}
                        onChange={() => toggleSelectRef(item.reference)}
                      />
                    </td>
                    <td className={styles.td}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "var(--foreground)",
                          fontSize: "13px",
                          fontFamily: "monospace",
                        }}
                      >
                        {item.reference}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {new Date(item.created_at).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 500, color: "var(--foreground)" }}>
                        {item.user_email}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 700, color: "var(--foreground)", fontSize: "14px" }}>
                        ₦{rawAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </div>
                      {(typeof dynamicFee === "number" || typeof dynamicNet === "number") && (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          {typeof dynamicNet === "number"
                            ? `Net: ₦${Number(dynamicNet).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
                            : null}
                          {typeof dynamicNet === "number" && typeof dynamicFee === "number" ? " • " : ""}
                          {typeof dynamicFee === "number"
                            ? `Fee: ₦${Number(dynamicFee).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
                            : null}
                        </div>
                      )}
                    </td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 600, color: "var(--foreground)" }}>
                        {meta.bankName || "Bank Transfer"}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {meta.accountNumber} {meta.accountName ? `(${meta.accountName})` : ""}
                      </div>
                    </td>
                    <td className={styles.td}>{getStatusBadge(item.status)}</td>
                    <td
                      className={styles.td}
                      style={{ maxWidth: "240px", fontSize: "12px", color: "var(--text-muted)" }}
                    >
                      {meta.queued_reason ||
                        meta.failure_reason ||
                        meta.error ||
                        item.description ||
                        "—"}
                    </td>
                    <td className={styles.td} style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={() => onSelectReceipt(item)}
                          style={{
                            background: "var(--sidebar-bg)",
                            color: "var(--foreground)",
                            border: "1px solid var(--card-border)",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 500,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                          title="View & Print Payout Receipt"
                        >
                          <FileText size={12} />
                          <span>Receipt</span>
                        </button>
                        {isRetryable && (
                          <button
                            type="button"
                            onClick={() => onRetrySingle(item.reference)}
                            disabled={actionLoading}
                            style={{
                              background:
                                item.status === "failed"
                                  ? "rgba(239, 68, 68, 0.12)"
                                  : "rgba(245, 158, 11, 0.12)",
                              color: item.status === "failed" ? "#ef4444" : "#f59e0b",
                              border: `1px solid ${
                                item.status === "failed"
                                  ? "rgba(239, 68, 68, 0.25)"
                                  : "rgba(245, 158, 11, 0.25)"
                              }`,
                              padding: "6px 12px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: actionLoading ? "not-allowed" : "pointer",
                              opacity: actionLoading ? 0.65 : 1,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <RotateCw size={12} />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 4px",
        }}
      >
        <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          Showing Page {page} of {totalPages} ({totalCount} total withdrawals)
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            style={{
              background: "var(--sidebar-bg)",
              color: page <= 1 ? "var(--text-muted)" : "var(--foreground)",
              border: "1px solid var(--card-border)",
              borderRadius: "8px",
              padding: "6px 14px",
              cursor: page <= 1 || loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              opacity: page <= 1 ? 0.5 : 1,
            }}
          >
            <ChevronLeft size={16} />
            <span>Previous</span>
          </button>

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || loading}
            style={{
              background: "var(--sidebar-bg)",
              color: page >= totalPages ? "var(--text-muted)" : "var(--foreground)",
              border: "1px solid var(--card-border)",
              borderRadius: "8px",
              padding: "6px 14px",
              cursor: page >= totalPages || loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              opacity: page >= totalPages ? 0.5 : 1,
            }}
          >
            <span>Next</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
