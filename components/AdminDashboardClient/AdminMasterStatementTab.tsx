"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  BarChart3, 
  Download, 
  Search, 
  Filter, 
  RotateCw, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ChevronLeft, 
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
  Eye,
  EyeOff
} from "lucide-react";
import styles from "./page.module.css";
import { useAdminDialog } from "@/components/ui/AdminDialog";

interface MasterTransaction {
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

export default function AdminMasterStatementTab() {
  const [transactions, setTransactions] = useState<MasterTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Filter States
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [referenceFilter, setReferenceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showBalance, setShowBalance] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("admin_show_balance");
      if (saved !== null) return saved === "true";
    }
    return true;
  });

  const toggleShowBalance = () => {
    setShowBalance((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("admin_show_balance", String(next));
      } catch {}
      return next;
    });
  };

  const [metrics, setMetrics] = useState({
    totalInflows: 0,
    totalOutflows: 0,
    netPlatformFlow: 0,
    totalSuccessfulCount: 0,
  });

  const [pagination, setPagination] = useState({
    totalPages: 1,
    totalCount: 0,
  });

  // Applied Filters State (only updated on Submit, Dropdown select, or Reset)
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    email: "",
    reference: "",
    type: "all",
    status: "all",
    year: "",
    startDate: "",
    endDate: "",
  });

  const buildQueryString = useCallback((exportMode = false, filters = appliedFilters, targetPage = page, targetLimit = limit) => {
    const params = new URLSearchParams();
    if (!exportMode) {
      params.set("page", targetPage.toString());
      params.set("limit", targetLimit.toString());
    } else {
      params.set("exportCsv", "true");
    }

    if (filters.type !== "all") params.set("type", filters.type);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    if (filters.email) params.set("email", filters.email);
    if (filters.reference) params.set("reference", filters.reference);
    if (filters.year) params.set("year", filters.year);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);

    return params.toString();
  }, [appliedFilters, page, limit]);

  const fetchTransactions = useCallback(async (filters = appliedFilters, targetPage = page, targetLimit = limit) => {
    setLoading(true);
    try {
      const q = buildQueryString(false, filters, targetPage, targetLimit);
      const res = await fetch(`/api/admin/transactions?${q}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setTransactions(data.transactions || []);
        setPagination({
          totalPages: data.pagination?.totalPages || 1,
          totalCount: data.pagination?.totalCount || 0,
        });
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      }
    } catch (err) {
      console.error("Failed to fetch master statement:", err);
    } finally {
      setLoading(false);
    }
  }, [buildQueryString, appliedFilters, page, limit]);

  useEffect(() => {
    fetchTransactions(appliedFilters, page, limit);
  }, [appliedFilters, page, limit]);

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedFilters({
      search: search.trim(),
      email: emailFilter.trim(),
      reference: referenceFilter.trim(),
      type: typeFilter,
      status: statusFilter,
      year: yearFilter,
      startDate,
      endDate,
    });
  };

  const handleResetFilters = () => {
    setSearch("");
    setEmailFilter("");
    setReferenceFilter("");
    setTypeFilter("all");
    setStatusFilter("all");
    setYearFilter("");
    setStartDate("");
    setEndDate("");
    setPage(1);
    setAppliedFilters({
      search: "",
      email: "",
      reference: "",
      type: "all",
      status: "all",
      year: "",
      startDate: "",
      endDate: "",
    });
  };

  const { alertDialog } = useAdminDialog();

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const q = buildQueryString(true);
      window.open(`/api/admin/transactions?${q}`, "_blank");
    } catch (e: any) {
      await alertDialog("Failed to export statement: " + (e?.message || e), "Export Failed");
    } finally {
      setExporting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRef(text);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  const isOutflow = (type: string) => {
    const t = (type || "").toLowerCase();
    return t === "withdrawal" || t === "transfer_sent";
  };

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    switch (s) {
      case "success":
        return (
          <span style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.25)", padding: "3px 8px", borderRadius: "6px", fontWeight: 600, fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <CheckCircle2 size={11} /> Completed
          </span>
        );
      case "queued":
        return (
          <span style={{ background: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.25)", padding: "3px 8px", borderRadius: "6px", fontWeight: 600, fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <Clock size={11} /> Queued
          </span>
        );
      case "processing":
      case "pending":
        return (
          <span style={{ background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6", border: "1px solid rgba(59, 130, 246, 0.25)", padding: "3px 8px", borderRadius: "6px", fontWeight: 600, fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <RotateCw size={11} className="spin" /> Processing
          </span>
        );
      case "failed":
        return (
          <span style={{ background: "rgba(239, 68, 68, 0.12)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.25)", padding: "3px 8px", borderRadius: "6px", fontWeight: 600, fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <AlertCircle size={11} /> Failed
          </span>
        );
      default:
        return (
          <span style={{ background: "var(--sidebar-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)", padding: "3px 8px", borderRadius: "6px", fontSize: "11px" }}>
            {status}
          </span>
        );
    }
  };

  const getTypeBadge = (type: string) => {
    const t = (type || "").toLowerCase();
    if (t === "withdrawal") {
      return <span style={{ background: "rgba(239, 68, 68, 0.12)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600 }}>Withdrawal</span>;
    }
    if (t.includes("ad") || t.includes("highlight")) {
      return <span style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.2)", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600 }}>Campaign / Ad</span>;
    }
    if (t.includes("transfer")) {
      return <span style={{ background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6", border: "1px solid rgba(59, 130, 246, 0.2)", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600 }}>P2P Transfer</span>;
    }
    if (t.includes("subscription") || t.includes("monetiz")) {
      return <span style={{ background: "rgba(168, 85, 247, 0.12)", color: "#a855f7", border: "1px solid rgba(168, 85, 247, 0.2)", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600 }}>Monetization</span>;
    }
    return <span style={{ background: "var(--sidebar-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)", padding: "3px 8px", borderRadius: "6px", fontSize: "11px" }}>{type}</span>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Financial Overview Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "16px",
      }}>
        <div style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
          borderRadius: "16px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>Total Platform Inflows</span>
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
              <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ArrowDownLeft size={16} color="#10b981" />
              </div>
            </div>
          </div>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#10b981" }}>
            {showBalance ? `₦${metrics.totalInflows.toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "₦••••••••"}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Ads, Highlights, Monetization & Fees
          </span>
        </div>

        <div style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
          borderRadius: "16px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>Total Platform Outflows</span>
            <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowUpRight size={16} color="#ef4444" />
            </div>
          </div>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#ef4444" }}>
            {showBalance ? `₦${metrics.totalOutflows.toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "₦••••••••"}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Total User Withdrawals Disbursed
          </span>
        </div>

        <div style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
          borderRadius: "16px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>Net Platform Balance</span>
          </div>
          <span style={{ fontSize: "24px", fontWeight: 800, color: metrics.netPlatformFlow >= 0 ? "var(--foreground)" : "#ef4444" }}>
            {showBalance ? `₦${metrics.netPlatformFlow.toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "₦••••••••"}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Inflows minus completed outflows
          </span>
        </div>

        <div style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
          borderRadius: "16px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}>
          <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>Settled Transactions</span>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "var(--foreground)" }}>
            {metrics.totalSuccessfulCount.toLocaleString()}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Master payments record count
          </span>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <form onSubmit={handleApplyFilter} style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
        borderRadius: "16px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
        }}>
          {/* User Email */}
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>Account Email</label>
            <input
              type="text"
              placeholder="e.g. user@example.com"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              style={{
                width: "100%",
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "13px",
                outline: "none",
              }}
            />
          </div>

          {/* Reference ID */}
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>Transaction Reference ID</label>
            <input
              type="text"
              placeholder="e.g. trsf_... or kora_..."
              value={referenceFilter}
              onChange={(e) => setReferenceFilter(e.target.value)}
              style={{
                width: "100%",
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "13px",
                outline: "none",
              }}
            />
          </div>

          {/* Transaction Type */}
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>Transaction Type</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                const val = e.target.value;
                setTypeFilter(val);
                setPage(1);
                setAppliedFilters((prev) => ({ ...prev, type: val }));
              }}
              style={{
                width: "100%",
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "13px",
                outline: "none",
              }}
            >
              <option value="all">All Types</option>
              <option value="withdrawal">Withdrawals</option>
              <option value="campaigns">Ads & Highlights</option>
              <option value="transfers">P2P Transfers</option>
              <option value="monetization">Monetization</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                const val = e.target.value;
                setStatusFilter(val);
                setPage(1);
                setAppliedFilters((prev) => ({ ...prev, status: val }));
              }}
              style={{
                width: "100%",
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "13px",
                outline: "none",
              }}
            >
              <option value="all">All Statuses</option>
              <option value="success">Completed (Success)</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Year */}
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>Year</label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              style={{
                width: "100%",
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "13px",
                outline: "none",
              }}
            >
              <option value="">Any Year</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>

          {/* Date Range Start */}
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: "100%",
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "13px",
                outline: "none",
              }}
            />
          </div>

          {/* Date Range End */}
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: "100%",
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "13px",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="submit"
              style={{
                background: "#3b82f6",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "8px 18px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
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
              onClick={handleResetFilters}
              style={{
                background: "var(--sidebar-bg)",
                color: "var(--foreground)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exporting}
              style={{
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: exporting ? "not-allowed" : "pointer",
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
              onClick={() => fetchTransactions()}
              disabled={loading}
              style={{
                background: "var(--sidebar-bg)",
                color: "var(--foreground)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "13px",
                cursor: "pointer",
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

      {/* Transactions Table */}
      <div className={styles.tableContainer}>
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className={styles.td} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                  <RotateCw size={24} className="spin" style={{ margin: "0 auto 8px" }} />
                  <div>Loading master statement...</div>
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.td} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                  No transactions found matching your criteria.
                </td>
              </tr>
            ) : (
              transactions.map((tx) => {
                const meta = tx.metadata || {};
                const outflow = isOutflow(tx.type);
                const rawAmount = parseFloat((tx.amount as any) || (meta.amount as any) || 0);
                const destInfo = meta.bankName
                  ? `${meta.bankName} - ${meta.accountNumber} (${meta.accountName || ""})`
                  : (meta.gateway || meta.provider || tx.description || "—");

                return (
                  <tr key={tx.id} className={styles.tr}>
                    <td className={styles.td}>
                      <div style={{ color: "var(--foreground)", fontSize: "13px", fontWeight: 600 }}>
                        {new Date(tx.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {new Date(tx.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--foreground)" }}>
                          {tx.reference}
                        </span>
                        <button
                          onClick={() => copyToClipboard(tx.reference)}
                          title="Copy Reference"
                          style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px", display: "inline-flex" }}
                        >
                          {copiedRef === tx.reference ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 500, color: "var(--foreground)" }}>{tx.user_email}</div>
                    </td>
                    <td className={styles.td}>
                      {getTypeBadge(tx.type)}
                    </td>
                    <td className={styles.td}>
                      <span style={{
                        fontWeight: 700,
                        fontSize: "14px",
                        color: outflow ? "#ef4444" : "#10b981",
                      }}>
                        {outflow ? "-" : "+"}₦{rawAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className={styles.td}>
                      {getStatusBadge(tx.status)}
                    </td>
                    <td className={styles.td} style={{ maxWidth: "260px", fontSize: "12px", color: "var(--text-muted)" }}>
                      {destInfo}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 4px",
        flexWrap: "wrap",
        gap: "12px",
      }}>
        <div style={{ fontSize: "13px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "12px" }}>
          <span>
            Page {page} of {pagination.totalPages} ({pagination.totalCount.toLocaleString()} total rows)
          </span>

          <select
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value, 10));
              setPage(1);
            }}
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
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            style={{
              background: "var(--sidebar-bg)",
              color: page <= 1 ? "var(--text-muted)" : "var(--foreground)",
              border: "1px solid var(--card-border)",
              borderRadius: "8px",
              padding: "6px 14px",
              cursor: page <= 1 ? "not-allowed" : "pointer",
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
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page >= pagination.totalPages || loading}
            style={{
              background: "var(--sidebar-bg)",
              color: page >= pagination.totalPages ? "var(--text-muted)" : "var(--foreground)",
              border: "1px solid var(--card-border)",
              borderRadius: "8px",
              padding: "6px 14px",
              cursor: page >= pagination.totalPages ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "13px",
              opacity: page >= pagination.totalPages ? 0.5 : 1,
            }}
          >
            <span>Next</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
