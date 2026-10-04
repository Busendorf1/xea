"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Wallet, 
  RefreshCw, 
  Play, 
  RotateCw, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  ChevronLeft, 
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  X,
  AlertTriangle,
  FlaskConical,
  Eye,
  EyeOff
} from "lucide-react";
import styles from "./page.module.css";
import { useAdminDialog } from "@/components/ui/AdminDialog";

interface PayoutItem {
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
    [key: string]: any;
  };
  created_at: string;
}

export default function AdminPayoutsTab() {
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [manualRef, setManualRef] = useState("");
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());
  const [testMode, setTestMode] = useState(false);
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
    floatBalance: 0,
    activeGateway: "kora",
    queuedCount: 0,
    failedCount: 0,
    pendingCount: 0,
    processingCount: 0,
    totalQueuedAmount: 0,
  });
  const [pagination, setPagination] = useState({
    totalPages: 1,
    totalCount: 0,
  });
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const { alertDialog, confirmDialog } = useAdminDialog();

  const fetchPayouts = useCallback(async (targetPage = page, targetStatus = statusFilter, targetSearch = search) => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: targetPage.toString(),
        limit: "20",
        status: targetStatus,
        search: targetSearch,
      });

      const res = await fetch(`/api/admin/payouts?${queryParams.toString()}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setPayouts(data.payouts || []);
        setPagination({
          totalPages: data.pagination?.totalPages || 1,
          totalCount: data.pagination?.totalCount || 0,
        });
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      } else {
        setFeedback({ text: data.error || "Failed to fetch payouts", type: "error" });
      }
    } catch (err: any) {
      setFeedback({ text: err.message || "Network error loading payouts", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchPayouts(page, statusFilter, search);
  }, [page, statusFilter, fetchPayouts]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchPayouts(1, statusFilter, search);
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setPage(1);
  };

  // Execute Batch
  const executeBatch = async (forceTestMode = testMode) => {
    setActionLoading(true);
    setFeedback({ text: forceTestMode ? "Processing payout window in Test Simulation Mode..." : "Dispatching payout batch to gateway...", type: "info" });
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "process_all_queued", 
          allowTestMode: forceTestMode 
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setFeedback({ text: data.message || "Manual payout batch executed!", type: "success" });
        await alertDialog(data.message || "Manual payout batch executed successfully!", "Batch Complete");
        fetchPayouts();
      } else if (data.canSimulate) {
        const runSimulation = await confirmDialog(
          "Kora Live Float balance is ₦0.00. Since this is for testing, would you like to execute in Test Simulation Mode (settles withdrawals for testing without live bank float)?",
          "Kora Float is ₦0.00",
          false
        );
        if (runSimulation) {
          setTestMode(true);
          await executeBatch(true);
        } else {
          setFeedback({ text: data.error || "Batch cancelled", type: "error" });
        }
      } else {
        setFeedback({ text: data.error || "Failed to execute payout batch", type: "error" });
        await alertDialog(data.error || "Failed to execute payout batch", "Payout Error");
      }
    } catch (e: any) {
      setFeedback({ text: e.message || "Error running manual payout batch", type: "error" });
      await alertDialog(e.message || "Error running manual payout batch", "Error");
    } finally {
      setActionLoading(false);
    }
  };

  // Trigger manual batch payout window
  const handleManualProcessAll = async () => {
    const ok = await confirmDialog(
      "Are you sure you want to execute an immediate payout window for all queued & pending withdrawals?",
      "Execute Manual Payout Window"
    );
    if (!ok) return;
    await executeBatch(testMode);
  };

  // Retry a single payout by reference
  const handleRetrySingle = async (ref: string, forceTest = testMode) => {
    if (!ref.trim()) {
      await alertDialog("Please enter or select a valid transaction reference.", "Missing Reference");
      return;
    }

    setActionLoading(true);
    setFeedback({ text: `Retrying payout for [${ref}]...`, type: "info" });
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "retry_single", 
          reference: ref.trim(),
          allowTestMode: forceTest
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setFeedback({ text: data.message || `Payout [${ref}] processed!`, type: "success" });
        await alertDialog(data.message || `Payout [${ref}] processed!`, "Payout Settled");
        setManualRef("");
        fetchPayouts();
      } else if (data.canSimulate) {
        const runSimulation = await confirmDialog(
          "Kora Live Float is ₦0.00. Would you like to process this payout in Test Simulation Mode?",
          "Kora Float Empty"
        );
        if (runSimulation) {
          setTestMode(true);
          await handleRetrySingle(ref, true);
        } else {
          setFeedback({ text: data.error || `Retry failed for [${ref}]`, type: "error" });
        }
      } else {
        setFeedback({ text: data.error || `Retry failed for [${ref}]`, type: "error" });
        await alertDialog(data.error || `Retry failed for [${ref}]`, "Retry Failed");
      }
    } catch (e: any) {
      setFeedback({ text: e.message || `Error retrying payout`, type: "error" });
      await alertDialog(e.message || "Error retrying payout", "Error");
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk retry selected or all failed/queued
  const handleBulkRetry = async (forceTest = testMode) => {
    const refsToRetry = Array.from(selectedRefs);
    const confirmMsg = refsToRetry.length > 0
      ? `Retry ${refsToRetry.length} selected payout(s)?`
      : "Retry all currently failed & queued payouts?";

    const ok = await confirmDialog(confirmMsg, "Confirm Bulk Retry");
    if (!ok) return;

    setActionLoading(true);
    setFeedback({ text: "Executing bulk retry...", type: "info" });
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retry_bulk",
          references: refsToRetry.length > 0 ? refsToRetry : undefined,
          allowTestMode: forceTest,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setFeedback({ text: data.message || "Bulk retry completed!", type: "success" });
        await alertDialog(data.message || "Bulk retry completed!", "Bulk Retry Result");
        setSelectedRefs(new Set());
        fetchPayouts();
      } else if (data.canSimulate) {
        const runSimulation = await confirmDialog(
          "Kora Live Float is ₦0.00. Would you like to process bulk retry in Test Simulation Mode?",
          "Run in Test Mode?"
        );
        if (runSimulation) {
          setTestMode(true);
          await handleBulkRetry(true);
        } else {
          setFeedback({ text: data.error || "Bulk retry failed", type: "error" });
        }
      } else {
        setFeedback({ text: data.error || "Bulk retry failed", type: "error" });
        await alertDialog(data.error || "Bulk retry failed", "Bulk Retry Failed");
      }
    } catch (e: any) {
      setFeedback({ text: e.message || "Bulk retry failed", type: "error" });
      await alertDialog(e.message || "Bulk retry failed", "Error");
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSelectRef = (ref: string) => {
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRefs.size === payouts.length && payouts.length > 0) {
      setSelectedRefs(new Set());
    } else {
      setSelectedRefs(new Set(payouts.map((p) => p.reference)));
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    switch (s) {
      case "success":
        return <span style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.25)", padding: "4px 10px", borderRadius: "6px", fontWeight: 600, fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}><CheckCircle2 size={12} /> Completed</span>;
      case "queued":
        return <span style={{ background: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.25)", padding: "4px 10px", borderRadius: "6px", fontWeight: 600, fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}><Clock size={12} /> Queued</span>;
      case "processing":
        return <span style={{ background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6", border: "1px solid rgba(59, 130, 246, 0.25)", padding: "4px 10px", borderRadius: "6px", fontWeight: 600, fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}><RotateCw size={12} className="spin" /> Processing</span>;
      case "pending":
        return <span style={{ background: "rgba(234, 179, 8, 0.12)", color: "#eab308", border: "1px solid rgba(234, 179, 8, 0.25)", padding: "4px 10px", borderRadius: "6px", fontWeight: 600, fontSize: "12px" }}>Pending</span>;
      case "failed":
        return <span style={{ background: "rgba(239, 68, 68, 0.12)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.25)", padding: "4px 10px", borderRadius: "6px", fontWeight: 600, fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}><AlertCircle size={12} /> Failed</span>;
      default:
        return <span style={{ background: "var(--sidebar-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)", padding: "4px 10px", borderRadius: "6px", fontSize: "12px" }}>{status}</span>;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Banner / Metrics */}
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
            <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>Live Gateway Float ({metrics.activeGateway.toUpperCase()})</span>
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
            {showBalance ? `₦${metrics.floatBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "₦••••••••"}
          </span>
          <span style={{ fontSize: "12px", color: metrics.floatBalance > 0 ? "#10b981" : "#ef4444", display: "inline-flex", alignItems: "center", gap: "6px" }}>
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
          <span style={{ fontSize: "13px", color: "#f59e0b", fontWeight: 500 }}>Queued Withdrawals</span>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#f59e0b" }}>
            {metrics.queuedCount}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Total Value: {showBalance ? `₦${metrics.totalQueuedAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "₦••••••••"}
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
          <span style={{ fontSize: "13px", color: "#ef4444", fontWeight: 500 }}>Failed Withdrawals</span>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#ef4444" }}>
            {metrics.failedCount}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Ready for instant one-click retry
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
          <span style={{ fontSize: "13px", color: "#3b82f6", fontWeight: 500 }}>In-Flight Processing</span>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#3b82f6" }}>
            {metrics.processingCount + metrics.pendingCount}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Awaiting bank network settlement
          </span>
        </div>
      </div>

      {/* Action Bar */}
      <div style={{
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
      }}>
        {/* Left: Quick Manual Batch Dispatch & Test Mode Toggle */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={handleManualProcessAll}
            disabled={actionLoading}
            style={{
              background: testMode ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "linear-gradient(135deg, #10b981, #059669)",
              color: "#ffffff",
              border: "none",
              borderRadius: "10px",
              padding: "10px 18px",
              fontWeight: 600,
              fontSize: "14px",
              cursor: actionLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: testMode ? "0 4px 12px rgba(59, 130, 246, 0.3)" : "0 4px 12px rgba(16, 185, 129, 0.3)",
            }}
          >
            {testMode ? <FlaskConical size={16} /> : <Play size={16} />}
            <span>{testMode ? "Execute Test Payout Window" : "Execute Manual Payout Window"}</span>
          </button>

          <button
            onClick={() => handleBulkRetry()}
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
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <RotateCw size={16} />
            <span>{selectedRefs.size > 0 ? `Retry Selected (${selectedRefs.size})` : "Retry All Failed/Queued"}</span>
          </button>

          {/* Test Mode Switch */}
          <label style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            fontSize: "13px",
            color: testMode ? "#3b82f6" : "var(--text-muted)",
            fontWeight: 600,
            background: testMode ? "rgba(59, 130, 246, 0.12)" : "var(--sidebar-bg)",
            padding: "8px 14px",
            borderRadius: "10px",
            border: testMode ? "1px solid rgba(59, 130, 246, 0.35)" : "1px solid var(--card-border)",
            userSelect: "none",
          }}>
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              style={{ cursor: "pointer", accentColor: "#3b82f6" }}
            />
            <FlaskConical size={14} />
            <span>{testMode ? "Test Mode: ACTIVE" : "Test Mode: OFF"}</span>
          </label>

          <button
            onClick={() => fetchPayouts()}
            disabled={loading}
            style={{
              background: "var(--sidebar-bg)",
              color: "var(--foreground)",
              border: "1px solid var(--card-border)",
              borderRadius: "10px",
              padding: "10px 14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Right: Specific Reference Retry */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRetrySingle(manualRef);
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
            }}
          >
            Retry Payout
          </button>
        </form>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div style={{
          padding: "12px 18px",
          borderRadius: "10px",
          fontSize: "14px",
          fontWeight: 500,
          background: feedback.type === "success" ? "rgba(16, 185, 129, 0.12)" : feedback.type === "error" ? "rgba(239, 68, 68, 0.12)" : "rgba(59, 130, 246, 0.12)",
          color: feedback.type === "success" ? "#10b981" : feedback.type === "error" ? "#ef4444" : "#3b82f6",
          border: `1px solid ${feedback.type === "success" ? "rgba(16, 185, 129, 0.3)" : feedback.type === "error" ? "rgba(239, 68, 68, 0.3)" : "rgba(59, 130, 246, 0.3)"}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center" }}><X size={15} /></button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "14px",
      }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {["all", "queued", "failed", "processing", "pending", "success"].map((st) => (
            <button
              key={st}
              onClick={() => handleStatusFilterChange(st)}
              style={{
                background: statusFilter === st ? "var(--foreground)" : "var(--sidebar-bg)",
                color: statusFilter === st ? "var(--background)" : "var(--text-muted)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                padding: "7px 14px",
                fontSize: "13px",
                fontWeight: statusFilter === st ? 600 : 400,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {st}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "8px" }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: "12px", top: "11px", color: "var(--text-muted)" }} />
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
            Search
          </button>
        </form>
      </div>

      {/* Payouts Table */}
      <div className={styles.tableContainer}>
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
              <th className={styles.th} style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className={styles.td} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                  <RotateCw size={24} className="spin" style={{ margin: "0 auto 8px" }} />
                  <div>Loading withdrawal payouts...</div>
                </td>
              </tr>
            ) : payouts.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.td} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                  No withdrawal records found matching this filter.
                </td>
              </tr>
            ) : (
              payouts.map((item) => {
                const meta = item.metadata || {};
                const isRetryable = item.status === "failed" || item.status === "queued" || item.status === "pending";
                const rawAmount = parseFloat((item.amount as any) || (meta.amount as any) || 0);

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
                      <div style={{ fontWeight: 600, color: "var(--foreground)", fontSize: "13px", fontFamily: "monospace" }}>
                        {item.reference}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {new Date(item.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 500, color: "var(--foreground)" }}>{item.user_email}</div>
                    </td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 700, color: "var(--foreground)", fontSize: "14px" }}>
                        ₦{rawAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 600, color: "var(--foreground)" }}>{meta.bankName || "Bank Transfer"}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {meta.accountNumber} {meta.accountName ? `(${meta.accountName})` : ""}
                      </div>
                    </td>
                    <td className={styles.td}>
                      {getStatusBadge(item.status)}
                    </td>
                    <td className={styles.td} style={{ maxWidth: "240px", fontSize: "12px", color: "var(--text-muted)" }}>
                      {meta.queued_reason || meta.failure_reason || meta.error || item.description || "—"}
                    </td>
                    <td className={styles.td} style={{ textAlign: "right" }}>
                      {isRetryable && (
                        <button
                          onClick={() => handleRetrySingle(item.reference)}
                          disabled={actionLoading}
                          style={{
                            background: item.status === "failed" ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.12)",
                            color: item.status === "failed" ? "#ef4444" : "#f59e0b",
                            border: `1px solid ${item.status === "failed" ? "rgba(239, 68, 68, 0.25)" : "rgba(245, 158, 11, 0.25)"}`,
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: actionLoading ? "not-allowed" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <RotateCw size={12} />
                          <span>Retry</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 4px",
      }}>
        <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          Showing Page {page} of {pagination.totalPages} ({pagination.totalCount} total withdrawals)
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
