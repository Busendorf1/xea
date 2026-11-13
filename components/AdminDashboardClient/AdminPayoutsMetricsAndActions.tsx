"use client";

import React from "react";
import {
  RefreshCw,
  Play,
  RotateCw,
  Search,
  CheckCircle2,
  X,
  AlertTriangle,
  FlaskConical,
  Eye,
  EyeOff,
} from "lucide-react";

export interface PayoutMetrics {
  floatBalance: number;
  activeGateway: string;
  queuedCount: number;
  failedCount: number;
  pendingCount: number;
  processingCount: number;
  totalQueuedAmount: number;
}

interface AdminPayoutsMetricsAndActionsProps {
  metrics: PayoutMetrics;
  showBalance: boolean;
  toggleShowBalance: () => void;
  testMode: boolean;
  setTestMode: (val: boolean) => void;
  actionLoading: boolean;
  loading: boolean;
  selectedCount: number;
  manualRef: string;
  setManualRef: (val: string) => void;
  feedback: { text: string; type: "success" | "error" | "info" } | null;
  setFeedback: (val: null) => void;
  statusFilter: string;
  search: string;
  setSearch: (val: string) => void;
  onManualProcessAll: () => void;
  onBulkRetry: () => void;
  onRefresh: () => void;
  onRetrySingle: (ref: string) => void;
  onStatusFilterChange: (status: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
}

export function AdminPayoutsMetricsAndActions({
  metrics,
  showBalance,
  toggleShowBalance,
  testMode,
  setTestMode,
  actionLoading,
  loading,
  selectedCount,
  manualRef,
  setManualRef,
  feedback,
  setFeedback,
  statusFilter,
  search,
  setSearch,
  onManualProcessAll,
  onBulkRetry,
  onRefresh,
  onRetrySingle,
  onStatusFilterChange,
  onSearchSubmit,
}: AdminPayoutsMetricsAndActionsProps) {
  return (
    <>
      {/* Top Banner / Metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>
              Live Gateway Float ({(metrics.activeGateway || "kora").toUpperCase()})
            </span>
            <button
              type="button"
              onClick={toggleShowBalance}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "2px",
                display: "inline-flex",
                alignItems: "center",
              }}
              title={showBalance ? "Hide float balance" : "Show float balance"}
            >
              {showBalance ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#10b981" }}>
            {showBalance
              ? `₦${metrics.floatBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
              : "₦••••••••"}
          </span>
          <span
            style={{
              fontSize: "12px",
              color: metrics.floatBalance > 0 ? "#10b981" : "#ef4444",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {metrics.floatBalance > 0 ? (
              <>
                <CheckCircle2 size={13} />
                <span>Float Ready for Live Payouts</span>
              </>
            ) : (
              <>
                <AlertTriangle size={13} />
                <span>Float Empty (₦0.00) — Test Mode Ready</span>
              </>
            )}
          </span>
        </div>

        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "13px", color: "#f59e0b", fontWeight: 500 }}>
            Queued Withdrawals
          </span>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#f59e0b" }}>
            {metrics.queuedCount}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Total Value:{" "}
            {showBalance
              ? `₦${metrics.totalQueuedAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
              : "₦••••••••"}
          </span>
        </div>

        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "13px", color: "#ef4444", fontWeight: 500 }}>
            Failed Withdrawals
          </span>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#ef4444" }}>
            {metrics.failedCount}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Ready for instant one-click retry
          </span>
        </div>

        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "13px", color: "#3b82f6", fontWeight: 500 }}>
            In-Flight Processing
          </span>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#3b82f6" }}>
            {metrics.processingCount + metrics.pendingCount}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Awaiting bank network settlement
          </span>
        </div>
      </div>

      {/* Action Bar */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
          borderRadius: "16px",
          padding: "18px 24px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={onManualProcessAll}
            disabled={actionLoading}
            style={{
              background: testMode
                ? "linear-gradient(135deg, #3b82f6, #2563eb)"
                : "linear-gradient(135deg, #10b981, #059669)",
              color: "#ffffff",
              border: "none",
              borderRadius: "10px",
              padding: "10px 18px",
              fontWeight: 600,
              fontSize: "14px",
              cursor: actionLoading ? "not-allowed" : "pointer",
              opacity: actionLoading ? 0.65 : 1,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: testMode
                ? "0 4px 12px rgba(59, 130, 246, 0.3)"
                : "0 4px 12px rgba(16, 185, 129, 0.3)",
            }}
          >
            {testMode ? <FlaskConical size={16} /> : <Play size={16} />}
            <span>
              {actionLoading
                ? "Processing..."
                : testMode
                ? "Execute Test Payout Window"
                : "Execute Manual Payout Window"}
            </span>
          </button>

          <button
            type="button"
            onClick={onBulkRetry}
            disabled={actionLoading}
            style={{
              background: "rgba(245, 158, 11, 0.12)",
              color: "#f59e0b",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: "10px",
              padding: "10px 18px",
              fontWeight: 600,
              fontSize: "14px",
              cursor: actionLoading ? "not-allowed" : "pointer",
              opacity: actionLoading ? 0.65 : 1,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <RotateCw size={16} className={actionLoading ? "spin" : ""} />
            <span>
              {selectedCount > 0 ? `Retry Selected (${selectedCount})` : "Retry All Failed/Queued"}
            </span>
          </button>

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              cursor: actionLoading ? "not-allowed" : "pointer",
              fontSize: "13px",
              color: testMode ? "#3b82f6" : "var(--text-muted)",
              fontWeight: 600,
              background: testMode ? "rgba(59, 130, 246, 0.12)" : "var(--sidebar-bg)",
              padding: "8px 14px",
              borderRadius: "10px",
              border: testMode
                ? "1px solid rgba(59, 130, 246, 0.35)"
                : "1px solid var(--card-border)",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={testMode}
              disabled={actionLoading}
              onChange={(e) => setTestMode(e.target.checked)}
              style={{ cursor: actionLoading ? "not-allowed" : "pointer", accentColor: "#3b82f6" }}
            />
            <FlaskConical size={14} />
            <span>{testMode ? "Test Mode: ACTIVE" : "Test Mode: OFF"}</span>
          </label>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || actionLoading}
            style={{
              background: "var(--sidebar-bg)",
              color: "var(--foreground)",
              border: "1px solid var(--card-border)",
              borderRadius: "10px",
              padding: "10px 14px",
              cursor: loading || actionLoading ? "not-allowed" : "pointer",
              opacity: loading || actionLoading ? 0.65 : 1,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onRetrySingle(manualRef);
          }}
          style={{ display: "flex", gap: "8px", alignItems: "center" }}
        >
          <input
            type="text"
            placeholder="Retry by Reference (e.g. trsf_...)"
            value={manualRef}
            onChange={(e) => setManualRef(e.target.value)}
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--input-border)",
              color: "var(--foreground)",
              padding: "9px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              width: "250px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={actionLoading || !manualRef.trim()}
            style={{
              background: "#3b82f6",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "9px 14px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: actionLoading || !manualRef.trim() ? "not-allowed" : "pointer",
              opacity: actionLoading || !manualRef.trim() ? 0.65 : 1,
            }}
          >
            {actionLoading ? "Retrying..." : "Retry Payout"}
          </button>
        </form>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          role="status"
          style={{
            padding: "12px 18px",
            borderRadius: "10px",
            fontSize: "14px",
            fontWeight: 500,
            background:
              feedback.type === "success"
                ? "rgba(16, 185, 129, 0.12)"
                : feedback.type === "error"
                ? "rgba(239, 68, 68, 0.12)"
                : "rgba(59, 130, 246, 0.12)",
            color:
              feedback.type === "success"
                ? "#10b981"
                : feedback.type === "error"
                ? "#ef4444"
                : "#3b82f6",
            border: `1px solid ${
              feedback.type === "success"
                ? "rgba(16, 185, 129, 0.3)"
                : feedback.type === "error"
                ? "rgba(239, 68, 68, 0.3)"
                : "rgba(59, 130, 246, 0.3)"
            }`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Dismiss feedback"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {["all", "queued", "failed", "processing", "pending", "success"].map((st) => (
            <button
              key={st}
              type="button"
              disabled={loading}
              onClick={() => onStatusFilterChange(st)}
              style={{
                background: statusFilter === st ? "var(--foreground)" : "var(--sidebar-bg)",
                color: statusFilter === st ? "var(--background)" : "var(--text-muted)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                padding: "7px 14px",
                fontSize: "13px",
                fontWeight: statusFilter === st ? 600 : 400,
                cursor: loading ? "not-allowed" : "pointer",
                textTransform: "capitalize",
              }}
            >
              {st}
            </button>
          ))}
        </div>

        <form onSubmit={onSearchSubmit} style={{ display: "flex", gap: "8px" }}>
          <div style={{ position: "relative" }}>
            <Search
              size={15}
              style={{ position: "absolute", left: "12px", top: "11px", color: "var(--text-muted)" }}
            />
            <input
              type="text"
              placeholder="Search email, ref, or account..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
                padding: "8px 12px 8px 34px",
                borderRadius: "8px",
                fontSize: "13px",
                width: "260px",
                outline: "none",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              background: "var(--sidebar-bg)",
              color: "var(--foreground)",
              border: "1px solid var(--card-border)",
              borderRadius: "8px",
              padding: "8px 14px",
              fontSize: "13px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Search
          </button>
        </form>
      </div>
    </>
  );
}
