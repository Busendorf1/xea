"use client";

import React from "react";
import {
  Download,
  Filter,
  RotateCw,
  ArrowUpRight,
  ArrowDownLeft,
  Eye,
  EyeOff,
  X,
} from "lucide-react";

export interface StatementMetrics {
  totalInflows: number;
  totalOutflows: number;
  netPlatformFlow: number;
  totalSuccessfulCount: number;
}

interface AdminMasterStatementFiltersProps {
  metrics: StatementMetrics;
  showBalance: boolean;
  toggleShowBalance: () => void;
  emailFilter: string;
  setEmailFilter: (v: string) => void;
  referenceFilter: string;
  setReferenceFilter: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  yearFilter: string;
  setYearFilter: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  loading: boolean;
  exporting: boolean;
  errorMessage: string | null;
  setErrorMessage: (v: string | null) => void;
  onApplyFilter: (e: React.FormEvent) => void;
  onResetFilters: () => void;
  onExportCsv: () => void;
  onRefresh: () => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--input-bg)",
  border: "1px solid var(--input-border)",
  color: "var(--foreground)",
  padding: "8px 12px",
  borderRadius: "8px",
  fontSize: "13px",
  outline: "none",
};

export function AdminMasterStatementFilters({
  metrics,
  showBalance,
  toggleShowBalance,
  emailFilter,
  setEmailFilter,
  referenceFilter,
  setReferenceFilter,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  yearFilter,
  setYearFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  loading,
  exporting,
  errorMessage,
  setErrorMessage,
  onApplyFilter,
  onResetFilters,
  onExportCsv,
  onRefresh,
}: AdminMasterStatementFiltersProps) {
  return (
    <>
      {/* Financial Overview Cards */}
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
              Total Platform Inflows
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={toggleShowBalance}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "4px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                }}
                title={showBalance ? "Hide balance figures" : "Show balance figures"}
                aria-label={showBalance ? "Hide balance figures" : "Show balance figures"}
              >
                {showBalance ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "rgba(16, 185, 129, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ArrowDownLeft size={16} color="#10b981" />
              </div>
            </div>
          </div>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#10b981" }}>
            {showBalance
              ? `₦${metrics.totalInflows.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
              : "₦••••••••"}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Ads, Highlights, Monetization & Fees
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>
              Total Platform Outflows
            </span>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "rgba(239, 68, 68, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ArrowUpRight size={16} color="#ef4444" />
            </div>
          </div>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#ef4444" }}>
            {showBalance
              ? `₦${metrics.totalOutflows.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
              : "₦••••••••"}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Total User Withdrawals Disbursed
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>
              Net Platform Balance
            </span>
          </div>
          <span
            style={{
              fontSize: "24px",
              fontWeight: 800,
              color: metrics.netPlatformFlow >= 0 ? "var(--foreground)" : "#ef4444",
            }}
          >
            {showBalance
              ? `₦${metrics.netPlatformFlow.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
              : "₦••••••••"}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Inflows minus completed outflows
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
          <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>
            Settled Transactions
          </span>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "var(--foreground)" }}>
            {metrics.totalSuccessfulCount.toLocaleString()}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Master payments record count
          </span>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <form
        onSubmit={onApplyFilter}
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
          borderRadius: "16px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px",
          }}
        >
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>
              Account Email
            </label>
            <input
              type="text"
              placeholder="e.g. user@example.com"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>
              Transaction Reference ID
            </label>
            <input
              type="text"
              placeholder="e.g. trsf_... or kora_..."
              value={referenceFilter}
              onChange={(e) => setReferenceFilter(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>
              Transaction Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => onTypeFilterChange(e.target.value)}
              style={inputStyle}
            >
              <option value="all">All Types</option>
              <option value="withdrawal">Withdrawals</option>
              <option value="campaigns">Ads & Highlights</option>
              <option value="transfers">P2P Transfers</option>
              <option value="monetization">Monetization</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              style={inputStyle}
            >
              <option value="all">All Statuses</option>
              <option value="success">Completed (Success)</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>
              Year
            </label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="">Any Year</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                background: "#3b82f6",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "8px 18px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.65 : 1,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Filter size={14} />
              <span>Apply Filters</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={onResetFilters}
              style={{
                background: "var(--sidebar-bg)",
                color: "var(--foreground)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "13px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.65 : 1,
              }}
            >
              Reset
            </button>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={onExportCsv}
              disabled={exporting || loading}
              style={{
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: exporting || loading ? "not-allowed" : "pointer",
                opacity: exporting || loading ? 0.65 : 1,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Download size={14} />
              <span>{exporting ? "Generating CSV..." : "Export Statement (CSV)"}</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              style={{
                background: "var(--sidebar-bg)",
                color: "var(--foreground)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "13px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.65 : 1,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <RotateCw size={14} className={loading ? "spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </form>

      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: "12px 18px",
            borderRadius: "10px",
            fontSize: "14px",
            fontWeight: 500,
            background: "rgba(239, 68, 68, 0.12)",
            color: "#ef4444",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Dismiss error"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
