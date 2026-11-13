"use client";

import React from "react";
import {
  Download,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";
import styles from "./page.module.css";

export interface MasterTransaction {
  id: string;
  reference: string;
  user_email: string;
  amount: number;
  type: string;
  status: string;
  description?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

interface AdminMasterStatementTableProps {
  transactions: MasterTransaction[];
  loading: boolean;
  copiedRef: string | null;
  onCopyRef: (ref: string) => void;
  onSelectReceipt: (tx: MasterTransaction) => void;
  page: number;
  limit: number;
  totalPages: number;
  totalCount: number;
  onLimitChange: (nextLimit: number) => void;
  onPageChange: (nextPage: number) => void;
}

function isOutflow(type: string) {
  const t = (type || "").toLowerCase();
  return t === "withdrawal" || t === "transfer_sent";
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
            padding: "3px 8px",
            borderRadius: "6px",
            fontWeight: 600,
            fontSize: "11px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <CheckCircle2 size={11} /> Completed
        </span>
      );
    case "queued":
      return (
        <span
          style={{
            background: "rgba(245, 158, 11, 0.12)",
            color: "#f59e0b",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            padding: "3px 8px",
            borderRadius: "6px",
            fontWeight: 600,
            fontSize: "11px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <Clock size={11} /> Queued
        </span>
      );
    case "processing":
    case "pending":
      return (
        <span
          style={{
            background: "rgba(59, 130, 246, 0.12)",
            color: "#3b82f6",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            padding: "3px 8px",
            borderRadius: "6px",
            fontWeight: 600,
            fontSize: "11px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <RotateCw size={11} className="spin" /> Processing
        </span>
      );
    case "failed":
      return (
        <span
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            color: "#ef4444",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            padding: "3px 8px",
            borderRadius: "6px",
            fontWeight: 600,
            fontSize: "11px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <AlertCircle size={11} /> Failed
        </span>
      );
    default:
      return (
        <span
          style={{
            background: "var(--sidebar-bg)",
            color: "var(--text-muted)",
            border: "1px solid var(--card-border)",
            padding: "3px 8px",
            borderRadius: "6px",
            fontSize: "11px",
          }}
        >
          {status}
        </span>
      );
  }
}

function getTypeBadge(type: string) {
  const t = (type || "").toLowerCase();
  if (t === "withdrawal") {
    return (
      <span
        style={{
          background: "rgba(239, 68, 68, 0.12)",
          color: "#ef4444",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          padding: "3px 8px",
          borderRadius: "6px",
          fontSize: "11px",
          fontWeight: 600,
        }}
      >
        Withdrawal
      </span>
    );
  }
  if (t.includes("ad") || t.includes("highlight")) {
    return (
      <span
        style={{
          background: "rgba(16, 185, 129, 0.12)",
          color: "#10b981",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          padding: "3px 8px",
          borderRadius: "6px",
          fontSize: "11px",
          fontWeight: 600,
        }}
      >
        Campaign / Ad
      </span>
    );
  }
  if (t.includes("transfer")) {
    return (
      <span
        style={{
          background: "rgba(59, 130, 246, 0.12)",
          color: "#3b82f6",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          padding: "3px 8px",
          borderRadius: "6px",
          fontSize: "11px",
          fontWeight: 600,
        }}
      >
        P2P Transfer
      </span>
    );
  }
  if (t.includes("subscription") || t.includes("monetiz")) {
    return (
      <span
        style={{
          background: "rgba(168, 85, 247, 0.12)",
          color: "#a855f7",
          border: "1px solid rgba(168, 85, 247, 0.2)",
          padding: "3px 8px",
          borderRadius: "6px",
          fontSize: "11px",
          fontWeight: 600,
        }}
      >
        Monetization
      </span>
    );
  }
  return (
    <span
      style={{
        background: "var(--sidebar-bg)",
        color: "var(--text-muted)",
        border: "1px solid var(--card-border)",
        padding: "3px 8px",
        borderRadius: "6px",
        fontSize: "11px",
      }}
    >
      {type}
    </span>
  );
}

export function AdminMasterStatementTable({
  transactions,
  loading,
  copiedRef,
  onCopyRef,
  onSelectReceipt,
  page,
  limit,
  totalPages,
  totalCount,
  onLimitChange,
  onPageChange,
}: AdminMasterStatementTableProps) {
  return (
    <>
      <div className={styles.tableContainer} style={{ scrollBehavior: "smooth" }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Date & Timestamp</th>
              <th className={styles.th}>Reference ID</th>
              <th className={styles.th}>User Account</th>
              <th className={styles.th}>Type</th>
              <th className={styles.th}>Amount</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Description & Destination</th>
              <th className={styles.th}>Receipt</th>
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
                  <div>Loading master statement...</div>
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className={styles.td}
                  style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}
                >
                  No transactions found matching your criteria.
                </td>
              </tr>
            ) : (
              transactions.map((tx) => {
                const meta = tx.metadata || {};
                const outflow = isOutflow(tx.type);
                const rawAmount = parseFloat((tx.amount as any) || (meta.amount as any) || 0);
                const dynamicFee = meta.gateway_fee ?? meta.transfer_fee ?? meta.fee;
                const dynamicNet = meta.net_amount;
                const destInfo = meta.bankName
                  ? `${meta.bankName} - ${meta.accountNumber} (${meta.accountName || ""})`
                  : meta.gateway || meta.provider || tx.description || "—";

                return (
                  <tr key={tx.id} className={styles.tr}>
                    <td className={styles.td}>
                      <div style={{ color: "var(--foreground)", fontSize: "13px", fontWeight: 600 }}>
                        {new Date(tx.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {new Date(tx.created_at).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: "12px",
                            color: "var(--foreground)",
                          }}
                        >
                          {tx.reference}
                        </span>
                        <button
                          type="button"
                          onClick={() => onCopyRef(tx.reference)}
                          title="Copy Reference"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            padding: "2px",
                            display: "inline-flex",
                          }}
                        >
                          {copiedRef === tx.reference ? (
                            <Check size={12} color="#10b981" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 500, color: "var(--foreground)" }}>
                        {tx.user_email}
                      </div>
                    </td>
                    <td className={styles.td}>{getTypeBadge(tx.type)}</td>
                    <td className={styles.td}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: "14px",
                          color: outflow ? "#ef4444" : "#10b981",
                        }}
                      >
                        {outflow ? "-" : "+"}₦
                        {rawAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </span>
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
                    <td className={styles.td}>{getStatusBadge(tx.status)}</td>
                    <td
                      className={styles.td}
                      style={{ maxWidth: "260px", fontSize: "12px", color: "var(--text-muted)" }}
                    >
                      {destInfo}
                    </td>
                    <td className={styles.td}>
                      <button
                        type="button"
                        onClick={() => onSelectReceipt(tx)}
                        style={{
                          background: "var(--card-bg, #ffffff)",
                          border: "1px solid var(--card-border, #cbd5e1)",
                          color: "var(--foreground, #0f172a)",
                          borderRadius: "6px",
                          padding: "4px 8px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          transition: "all 0.15s ease",
                          whiteSpace: "nowrap",
                        }}
                        title="Download or View Receipt"
                      >
                        <Download size={12} color="#10b981" />
                        <span>Receipt</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 4px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span>
            Page {page} of {totalPages} ({totalCount.toLocaleString()} total rows)
          </span>

          <select
            value={limit}
            disabled={loading}
            onChange={(e) => onLimitChange(parseInt(e.target.value, 10))}
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--input-border)",
              color: "var(--foreground)",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "12px",
              outline: "none",
            }}
          >
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
          </select>
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
              fontSize: "13px",
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
              fontSize: "13px",
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
