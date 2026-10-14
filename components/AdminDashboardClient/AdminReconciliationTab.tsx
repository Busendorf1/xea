"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Play,
  Pause,
  Search,
  CheckCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Building2,
  Zap,
  X,
} from "lucide-react";
import styles from "./page.module.css";

interface AdminReconciliationTabProps {
  renderPagination: (
    currentPage: number,
    setCurrentPage: (p: number) => void,
    totalCount: number,
    limit?: number,
    setLimit?: (l: number) => void
  ) => React.ReactNode;
}

export default function AdminReconciliationTab({ renderPagination }: AdminReconciliationTabProps) {
  const [reconciliationData, setReconciliationData] = useState<{
    transfersPaused: boolean;
    metrics: { total_sent_naira: number; total_received_naira: number; variance_naira: number; status: string };
    logs: any[];
    forfeitedBalances?: any[];
    forfeituresPagination?: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      status: string;
    };
    platformTreasury?: { balance: number; total_forfeited_absorbed: number };
    pendingForfeituresCount?: number;
    pendingForfeituresTotal?: number;
  } | null>(null);

  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationActionLoading, setReconciliationActionLoading] = useState(false);
  const [reconciliationMsg, setReconciliationMsg] = useState<string | null>(null);

  // Forfeitures Queue Pagination & Filter State
  const [forfeitedPage, setForfeitedPage] = useState(0);
  const [forfeitedLimit, setForfeitedLimit] = useState(10);
  const [forfeitedStatusFilter, setForfeitedStatusFilter] = useState<"ALL" | "PENDING" | "RESOLVED">("ALL");
  const [forfeitedSearch, setForfeitedSearch] = useState("");
  const [forfeitureActionLoading, setForfeitureActionLoading] = useState<string | null>(null);

  // Transfer Reversals & Dual Authorization State
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [reverseRef, setReverseRef] = useState("");
  const [reverseReason, setReverseReason] = useState("");
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalError, setReversalError] = useState("");

  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [pendingRequestsLoading, setPendingRequestsLoading] = useState(false);
  const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null);

  // Dual-Auth Requests Pagination & Filter State
  const [pendingRequestsPage, setPendingRequestsPage] = useState(0);
  const [pendingRequestsLimit, setPendingRequestsLimit] = useState(10);
  const [pendingRequestsStatusFilter, setPendingRequestsStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("PENDING");
  const [pendingRequestsSearch, setPendingRequestsSearch] = useState("");
  const [pendingRequestsPagination, setPendingRequestsPagination] = useState<{
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    status: string;
  } | null>(null);
  const [pendingRequestsSummary, setPendingRequestsSummary] = useState<{
    pending_count: number;
    approved_count: number;
    rejected_count: number;
    total_count: number;
  }>({ pending_count: 0, approved_count: 0, rejected_count: 0, total_count: 0 });

  // Admin Balance visibility toggle
  const [showAdminBalance, setShowAdminBalance] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("paayh_admin_show_balance");
      if (saved !== null) return saved === "true";
    }
    return true;
  });

  const toggleAdminBalance = () => {
    setShowAdminBalance((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("paayh_admin_show_balance", String(next));
      } catch {}
      return next;
    });
  };

  const fetchReconciliationData = async (
    fresh = false,
    page = forfeitedPage,
    limit = forfeitedLimit,
    status = forfeitedStatusFilter,
    search = forfeitedSearch
  ) => {
    if (reconciliationLoading) return;
    setReconciliationLoading(true);
    try {
      const params = new URLSearchParams();
      if (fresh) params.set("fresh", "true");
      params.set("forfeitPage", String(page + 1));
      params.set("forfeitLimit", String(limit));
      params.set("forfeitStatus", status);
      if (search.trim()) params.set("forfeitSearch", search.trim());

      const res = await fetch(`/api/admin/reconciliation?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReconciliationData(data);
      }
    } catch (err) {
      console.error("Failed to fetch reconciliation data:", err);
    } finally {
      setReconciliationLoading(false);
    }
  };

  const handleToggleEmergencyPause = async () => {
    if (reconciliationActionLoading) return;
    setReconciliationActionLoading(true);
    try {
      const res = await fetch("/api/admin/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_pause" }),
      });
      if (res.ok) {
        const data = await res.json();
        setReconciliationMsg(data.message);
        setReconciliationData((prev) =>
          prev
            ? { ...prev, transfersPaused: data.transfersPaused }
            : {
                transfersPaused: data.transfersPaused,
                metrics: { total_sent_naira: 0, total_received_naira: 0, variance_naira: 0, status: "HEALTHY" },
                logs: [],
              }
        );
        setTimeout(() => setReconciliationMsg(null), 5000);
      }
    } catch (err: any) {
      setReconciliationMsg(err.message || "Failed to toggle emergency pause.");
    } finally {
      setReconciliationActionLoading(false);
    }
  };

  const handleResolveReconciliationLog = async (logId: string) => {
    if (reconciliationActionLoading) return;
    const notes = prompt("Enter audit notes or resolution details for this discrepancy:");
    if (!notes) return;

    setReconciliationActionLoading(true);
    try {
      const res = await fetch("/api/admin/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_issue", logId, notes }),
      });
      if (res.ok) {
        await fetchReconciliationData();
      }
    } catch (err) {
      console.error("Failed to resolve reconciliation issue:", err);
    } finally {
      setReconciliationActionLoading(false);
    }
  };

  const handleResolveForfeiture = async (forfeitureId: string, amount: number) => {
    if (forfeitureActionLoading) return;
    const formattedAmount = `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
    const notes = prompt(`Enter resolution audit note for ${formattedAmount} forfeited balance:`, "Resolved to platform treasury by admin");
    if (notes === null) return;

    setForfeitureActionLoading(forfeitureId);
    try {
      const res = await fetch("/api/admin/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_forfeiture", forfeitureId, notes: notes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to resolve forfeited balance.");
      }
      alert(data.message || `Forfeited balance of ${formattedAmount} successfully credited to platform balance.`);
      await fetchReconciliationData(true);
    } catch (err: any) {
      alert(`Error: ${err.message || "Failed to resolve forfeited balance."}`);
    } finally {
      setForfeitureActionLoading(null);
    }
  };

  const fetchPendingRequests = async (
    fresh = false,
    page = pendingRequestsPage,
    limit = pendingRequestsLimit,
    status = pendingRequestsStatusFilter,
    search = pendingRequestsSearch
  ) => {
    try {
      setPendingRequestsLoading(true);
      const params = new URLSearchParams();
      if (fresh) params.set("fresh", "true");
      params.set("page", String(page + 1));
      params.set("limit", String(limit));
      params.set("status", status);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/requests?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data.requests || []);
        if (data.pagination) setPendingRequestsPagination(data.pagination);
        if (data.summary) setPendingRequestsSummary(data.summary);
      }
    } catch (err) {
      console.error("Failed to fetch pending admin requests:", err);
    } finally {
      setPendingRequestsLoading(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    if (approvingRequestId) return;
    setApprovingRequestId(requestId);
    try {
      const res = await fetch("/api/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", requestId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || "Failed to approve request.");
        return;
      }
      setReconciliationMsg(data.message || "Request approved and executed.");
      setTimeout(() => setReconciliationMsg(null), 5000);
      fetchPendingRequests();
      fetchReconciliationData(true);
    } catch {
      alert("Network error approving request.");
    } finally {
      setApprovingRequestId(null);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (approvingRequestId) return;
    const reason = prompt("Enter rejection reason:");
    if (!reason) return;
    setApprovingRequestId(requestId);
    try {
      const res = await fetch("/api/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", requestId, rejectionReason: reason }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || "Failed to reject request.");
        return;
      }
      fetchPendingRequests();
    } catch {
      alert("Network error rejecting request.");
    } finally {
      setApprovingRequestId(null);
    }
  };

  const handleExecuteReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reversalLoading) return;
    setReversalError("");

    if (!reverseRef.trim()) {
      setReversalError("Please enter the transaction reference (e.g. trf_...).");
      return;
    }
    if (reverseReason.trim().length < 5) {
      setReversalError("Please provide an audit reason (at least 5 characters).");
      return;
    }

    setReversalLoading(true);
    try {
      const res = await fetch("/api/admin/transfers/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: reverseRef.trim(), reason: reverseReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setReversalError(data.error || "Transfer reversal failed.");
        return;
      }

      setReconciliationMsg(data.message);
      setTimeout(() => setReconciliationMsg(null), 5000);
      setShowReverseModal(false);
      setReverseRef("");
      setReverseReason("");
      fetchPendingRequests();
      fetchReconciliationData(true);
    } catch (err: any) {
      setReversalError(err.message || "Network error executing reversal.");
    } finally {
      setReversalLoading(false);
    }
  };

  useEffect(() => {
    fetchReconciliationData();
    fetchPendingRequests();
  }, []);

  return (
    <>
      <div>
        <h1 className={styles.sectionTitle}>Financial Reconciliation and Security Audits</h1>
        <p className={styles.sectionSubtitle}>
          Real-time double-entry ledger audits, nightly variance detection, and emergency P2P transfer circuit breaker controls.
        </p>
      </div>

      {/* Emergency Control Bar & Action Buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: reconciliationData?.transfersPaused ? "rgba(239, 68, 68, 0.15)" : "var(--card-bg)",
          border: `1px solid ${reconciliationData?.transfersPaused ? "rgba(239, 68, 68, 0.3)" : "var(--card-border)"}`,
          padding: "1.25rem",
          borderRadius: "12px",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "1.05rem",
              fontWeight: 700,
              margin: 0,
              color: reconciliationData?.transfersPaused ? "#ef4444" : "var(--foreground)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            {reconciliationData?.transfersPaused ? (
              <>
                <ShieldAlert size={20} className={styles.textDanger} />
                <span>EMERGENCY P2P TRANSFERS PAUSED</span>
              </>
            ) : (
              <>
                <ShieldCheck size={20} className={styles.textSuccess} />
                <span>System P2P Transfers Active</span>
              </>
            )}
          </h3>
          <p className={styles.adminCls_104}>
            {reconciliationData?.transfersPaused
              ? "P2P transfer processing is currently frozen to contain financial variance."
              : "System double-entry ledger is operating normally without balance drift."}
          </p>
        </div>

        <div className={styles.adminCls_105}>
          <button
            type="button"
            onClick={handleToggleEmergencyPause}
            disabled={reconciliationActionLoading || reconciliationLoading}
            className={styles.btnAction}
            style={{
              backgroundColor: reconciliationData?.transfersPaused ? "#10b981" : "#ef4444",
              color: "#fff",
              fontWeight: 700,
              padding: "0.6rem 1.2rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              opacity: reconciliationActionLoading || reconciliationLoading ? 0.65 : 1,
              cursor: reconciliationActionLoading || reconciliationLoading ? "not-allowed" : "pointer",
              transition: "opacity 0.15s ease",
            }}
          >
            {reconciliationActionLoading ? (
              <>
                <RefreshCw size={15} className={styles.spin} />
                <span>{reconciliationData?.transfersPaused ? "Unpausing Transfers..." : "Pausing Transfers..."}</span>
              </>
            ) : reconciliationData?.transfersPaused ? (
              <>
                <Play size={15} />
                <span>Unpause P2P Transfers</span>
              </>
            ) : (
              <>
                <Pause size={15} />
                <span>Emergency Pause Transfers</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => fetchReconciliationData(true)}
            disabled={reconciliationLoading || reconciliationActionLoading}
            className={styles.btnAction}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              opacity: reconciliationLoading || reconciliationActionLoading ? 0.65 : 1,
              cursor: reconciliationLoading || reconciliationActionLoading ? "not-allowed" : "pointer",
              transition: "opacity 0.15s ease",
            }}
          >
            {reconciliationLoading ? (
              <>
                <RefreshCw size={15} className={styles.spin} />
                <span>Running Audit Scan...</span>
              </>
            ) : (
              <>
                <Search size={15} />
                <span>Run Audit Scan</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setReversalError("");
              setShowReverseModal(true);
            }}
            disabled={reconciliationLoading || reconciliationActionLoading || reversalLoading}
            className={styles.btnAction}
            style={{
              backgroundColor: "#6366f1",
              color: "#fff",
              fontWeight: 700,
              padding: "0.6rem 1.2rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              opacity: reconciliationLoading || reconciliationActionLoading || reversalLoading ? 0.65 : 1,
              cursor: reconciliationLoading || reconciliationActionLoading || reversalLoading ? "not-allowed" : "pointer",
              transition: "opacity 0.15s ease",
            }}
          >
            <RefreshCw size={15} />
            <span>Reverse a Transfer</span>
          </button>
        </div>
      </div>

      {reconciliationMsg && <div className={styles.adminCls_106}>{reconciliationMsg}</div>}

      {/* Health Metrics Grid */}
      <div className={`${styles.statsGrid} ${styles.adminCls_107}`}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Ledger Audit Status</span>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 800,
              marginTop: "0.5rem",
              color: reconciliationData?.metrics?.status === "HEALTHY" ? "#10b981" : "#ef4444",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            {reconciliationData?.metrics?.status === "HEALTHY" ? (
              <>
                <CheckCircle size={18} />
                <span>HEALTHY (0.00 Variance)</span>
              </>
            ) : (
              <>
                <AlertTriangle size={18} />
                <span>FLAGGED (Discrepancy)</span>
              </>
            )}
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Sent Money</span>
          <div className={styles.statValue}>
            ₦{(reconciliationData?.metrics?.total_sent_naira || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Received Money</span>
          <div className={styles.statValue}>
            ₦{(reconciliationData?.metrics?.total_received_naira || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Net Variance Difference</span>
          <div className={styles.statValue} style={{ color: reconciliationData?.metrics?.variance_naira === 0 ? "#10b981" : "#ef4444" }}>
            ₦{(reconciliationData?.metrics?.variance_naira || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className={styles.statCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className={styles.statLabel}>Platform Treasury Balance</span>
            <button
              type="button"
              onClick={toggleAdminBalance}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "2px",
                display: "inline-flex",
                alignItems: "center",
              }}
              title={showAdminBalance ? "Hide balance figures" : "Show balance figures"}
              aria-label={showAdminBalance ? "Hide balance figures" : "Show balance figures"}
            >
              {showAdminBalance ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <div className={`${styles.statValue} ${styles.textSuccess}`}>
            {showAdminBalance
              ? `₦${Number(reconciliationData?.platformTreasury?.balance || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
              : "₦••••••••"}
          </div>
          <span className={styles.adminCls_108}>
            {showAdminBalance
              ? `+₦${Number(reconciliationData?.platformTreasury?.total_forfeited_absorbed || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
              : "+₦••••••••"}{" "}
            absorbed from deactivations
          </span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Pending Forfeited Balances</span>
          <div className={styles.statValue} style={{ color: (reconciliationData?.pendingForfeituresCount || 0) > 0 ? "#f59e0b" : "var(--foreground)" }}>
            ₦{(reconciliationData?.pendingForfeituresTotal || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
          </div>
          <span
            style={{
              fontSize: "0.75rem",
              color: (reconciliationData?.pendingForfeituresCount || 0) > 0 ? "#f59e0b" : "var(--text-muted, #94a3b8)",
              marginTop: "4px",
            }}
          >
            {reconciliationData?.pendingForfeituresCount || 0} deactivated account(s) pending
          </span>
        </div>
      </div>

      {/* Pending Dual-Authorization Requests (Four-Eyes Principle) */}
      <div className={styles.adminCls_109}>
        <div className={styles.adminCls_110}>
          <div>
            <h3 className={`${styles.cardTitle} ${styles.adminCls_111}`}>
              <ShieldCheck size={18} color="#6366f1" />
              <span>Pending Dual-Authorization Queue (Four-Eyes Principle)</span>
            </h3>
            <span className={styles.adminCls_112}>
              Actions over ₦50,000 or sensitive modifications require explicit secondary peer admin review.
            </span>
          </div>
          <button
            type="button"
            onClick={() => fetchPendingRequests(true, pendingRequestsPage, pendingRequestsLimit, pendingRequestsStatusFilter, pendingRequestsSearch)}
            disabled={pendingRequestsLoading}
            className={`${styles.btnAction} ${styles.adminCls_113}`}
          >
            <RefreshCw size={13} className={pendingRequestsLoading ? styles.spin : ""} />
            <span>{pendingRequestsLoading ? "Refreshing..." : "Refresh Queue"}</span>
          </button>
        </div>

        {/* Filter Tabs & Search Controls */}
        <div className={styles.adminCls_114}>
          <div className={styles.adminCls_115}>
            <button
              type="button"
              onClick={() => {
                setPendingRequestsStatusFilter("PENDING");
                setPendingRequestsPage(0);
                fetchPendingRequests(false, 0, pendingRequestsLimit, "PENDING", pendingRequestsSearch);
              }}
              className={styles.btnAction}
              style={{
                fontSize: "0.8rem",
                padding: "4px 12px",
                backgroundColor: pendingRequestsStatusFilter === "PENDING" ? "#f59e0b" : "transparent",
                color: pendingRequestsStatusFilter === "PENDING" ? "#fff" : "var(--foreground)",
                borderColor: pendingRequestsStatusFilter === "PENDING" ? "#f59e0b" : "var(--card-border)",
              }}
            >
              Pending ({pendingRequestsSummary.pending_count})
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingRequestsStatusFilter("APPROVED");
                setPendingRequestsPage(0);
                fetchPendingRequests(false, 0, pendingRequestsLimit, "APPROVED", pendingRequestsSearch);
              }}
              className={styles.btnAction}
              style={{
                fontSize: "0.8rem",
                padding: "4px 12px",
                backgroundColor: pendingRequestsStatusFilter === "APPROVED" ? "#10b981" : "transparent",
                color: pendingRequestsStatusFilter === "APPROVED" ? "#fff" : "var(--foreground)",
                borderColor: pendingRequestsStatusFilter === "APPROVED" ? "#10b981" : "var(--card-border)",
              }}
            >
              Approved ({pendingRequestsSummary.approved_count})
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingRequestsStatusFilter("REJECTED");
                setPendingRequestsPage(0);
                fetchPendingRequests(false, 0, pendingRequestsLimit, "REJECTED", pendingRequestsSearch);
              }}
              className={styles.btnAction}
              style={{
                fontSize: "0.8rem",
                padding: "4px 12px",
                backgroundColor: pendingRequestsStatusFilter === "REJECTED" ? "#ef4444" : "transparent",
                color: pendingRequestsStatusFilter === "REJECTED" ? "#fff" : "var(--foreground)",
                borderColor: pendingRequestsStatusFilter === "REJECTED" ? "#ef4444" : "var(--card-border)",
              }}
            >
              Rejected ({pendingRequestsSummary.rejected_count})
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingRequestsStatusFilter("ALL");
                setPendingRequestsPage(0);
                fetchPendingRequests(false, 0, pendingRequestsLimit, "ALL", pendingRequestsSearch);
              }}
              className={styles.btnAction}
              style={{
                fontSize: "0.8rem",
                padding: "4px 12px",
                backgroundColor: pendingRequestsStatusFilter === "ALL" ? "var(--primary)" : "transparent",
                color: pendingRequestsStatusFilter === "ALL" ? "#fff" : "var(--foreground)",
                borderColor: pendingRequestsStatusFilter === "ALL" ? "var(--primary)" : "var(--card-border)",
              }}
            >
              All Records ({pendingRequestsSummary.total_count})
            </button>
          </div>

          <div className={styles.adminCls_116}>
            <Search size={14} className={styles.adminCls_117} />
            <input
              type="text"
              placeholder="Search requests..."
              value={pendingRequestsSearch}
              onChange={(e) => setPendingRequestsSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPendingRequestsPage(0);
                  fetchPendingRequests(false, 0, pendingRequestsLimit, pendingRequestsStatusFilter, pendingRequestsSearch);
                }
              }}
              className={styles.adminCls_118}
            />
            {pendingRequestsSearch && (
              <button
                type="button"
                onClick={() => {
                  setPendingRequestsSearch("");
                  setPendingRequestsPage(0);
                  fetchPendingRequests(false, 0, pendingRequestsLimit, pendingRequestsStatusFilter, "");
                }}
                className={styles.adminCls_119}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {pendingRequestsLoading ? (
          <div className={styles.loadingText}>Loading authorization queue...</div>
        ) : pendingRequests.length === 0 ? (
          <div className={`${styles.emptyState} ${styles.adminCls_120}`}>
            No authorizations found matching criteria. All clear!
          </div>
        ) : (
          <>
            <div className={styles.cardsGrid}>
              {pendingRequests.map((req: any) => {
                const isPending = req.status === "PENDING";
                const isApproved = req.status === "APPROVED";
                const borderColor = isPending ? "#f59e0b" : isApproved ? "#10b981" : "#ef4444";
                const badgeBg = isPending ? "rgba(245,158,11,0.15)" : isApproved ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)";
                const badgeColor = isPending ? "#f59e0b" : isApproved ? "#10b981" : "#ef4444";

                return (
                  <div key={req.id} className={styles.cardItem} style={{ borderLeft: `4px solid ${borderColor}` }}>
                    <div className={styles.cardHeader}>
                      <div>
                        <h3 className={`${styles.cardTitle} ${styles.capitalize}`}>
                          {req.action_type.replace(/_/g, " ")}
                        </h3>
                        <span className={styles.cardMeta}>
                          Requested by <strong>{req.requested_by}</strong> on {new Date(req.created_at).toLocaleString()}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: "99px",
                          backgroundColor: badgeBg,
                          color: badgeColor,
                          border: `1px solid ${badgeColor}40`,
                        }}
                      >
                        {req.status}
                      </span>
                    </div>

                    <div className={`${styles.cardDetails} ${styles.adminCls_121}`}>
                      {req.amount_kobo > 0 && (
                        <div>
                          <strong>Amount:</strong> ₦{(req.amount_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </div>
                      )}
                      {req.amount_naira > 0 && (
                        <div>
                          <strong>Amount:</strong> ₦{Number(req.amount_naira).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </div>
                      )}
                      {req.target_reference && (
                        <div>
                          <strong>Reference:</strong> <code>{req.target_reference}</code>
                        </div>
                      )}
                      {req.target_identifier && (
                        <div>
                          <strong>Target:</strong> <code>{req.target_identifier}</code>
                        </div>
                      )}
                      {req.target_user_email && (
                        <div>
                          <strong>Target User:</strong> {req.target_user_email}
                        </div>
                      )}
                      {req.reason && (
                        <div className={`${styles.reportReasonBox} ${styles.adminCls_122}`}>
                          <strong>Reason:</strong> {req.reason}
                        </div>
                      )}
                      {req.approved_by && (
                        <div className={styles.adminCls_123}>
                          <strong>Approved By:</strong> {req.approved_by}
                        </div>
                      )}
                      {req.rejected_by && (
                        <div className={styles.adminCls_124}>
                          <strong>Rejected By:</strong> {req.rejected_by} ({req.rejection_reason || "No reason given"})
                        </div>
                      )}
                    </div>

                    {isPending && (
                      <div className={`${styles.cardFooter} ${styles.adminCls_125}`}>
                        <button
                          type="button"
                          onClick={() => handleApproveRequest(req.id)}
                          disabled={approvingRequestId === req.id}
                          className={`${styles.btnAction} ${styles.btnSuccess} ${styles.adminCls_126}`}
                        >
                          {approvingRequestId === req.id ? "Approving..." : "Approve and Execute"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectRequest(req.id)}
                          disabled={approvingRequestId === req.id}
                          className={`${styles.btnAction} ${styles.btnDanger} ${styles.adminCls_126}`}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {renderPagination(
              pendingRequestsPage,
              (newPage) => {
                setPendingRequestsPage(newPage);
                fetchPendingRequests(false, newPage, pendingRequestsLimit, pendingRequestsStatusFilter, pendingRequestsSearch);
              },
              pendingRequestsPagination?.totalCount ?? 0,
              pendingRequestsLimit,
              (newLimit) => {
                setPendingRequestsLimit(newLimit);
                setPendingRequestsPage(0);
                fetchPendingRequests(false, 0, newLimit, pendingRequestsStatusFilter, pendingRequestsSearch);
              }
            )}
          </>
        )}
      </div>

      {/* Deactivated Account Forfeitures (Treasury Absorption Queue) */}
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
            onClick={() => fetchReconciliationData(true, forfeitedPage, forfeitedLimit, forfeitedStatusFilter, forfeitedSearch)}
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
              className={styles.btnAction}
              style={{
                fontSize: "0.8rem",
                padding: "4px 12px",
                backgroundColor: forfeitedStatusFilter === "ALL" ? "var(--primary)" : "transparent",
                color: forfeitedStatusFilter === "ALL" ? "#fff" : "var(--foreground)",
                borderColor: forfeitedStatusFilter === "ALL" ? "var(--primary)" : "var(--card-border)",
              }}
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
              className={styles.btnAction}
              style={{
                fontSize: "0.8rem",
                padding: "4px 12px",
                backgroundColor: forfeitedStatusFilter === "PENDING" ? "#f59e0b" : "transparent",
                color: forfeitedStatusFilter === "PENDING" ? "#fff" : "var(--foreground)",
                borderColor: forfeitedStatusFilter === "PENDING" ? "#f59e0b" : "var(--card-border)",
              }}
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
              className={styles.btnAction}
              style={{
                fontSize: "0.8rem",
                padding: "4px 12px",
                backgroundColor: forfeitedStatusFilter === "RESOLVED" ? "#10b981" : "transparent",
                color: forfeitedStatusFilter === "RESOLVED" ? "#fff" : "var(--foreground)",
                borderColor: forfeitedStatusFilter === "RESOLVED" ? "#10b981" : "var(--card-border)",
              }}
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
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: "99px",
                          backgroundColor: isPending ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)",
                          color: isPending ? "#f59e0b" : "#10b981",
                          border: `1px solid ${isPending ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.3)"}`,
                        }}
                      >
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
                          className={styles.btnAction}
                          style={{
                            backgroundColor: "#10b981",
                            color: "#fff",
                            fontWeight: 700,
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.4rem",
                            opacity: forfeitureActionLoading === item.id || reconciliationLoading ? 0.65 : 1,
                            cursor: forfeitureActionLoading === item.id || reconciliationLoading ? "not-allowed" : "pointer",
                          }}
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

      {/* Reconciliation Logs Table */}
      <div>
        <h3 className={`${styles.cardTitle} ${styles.adminCls_132}`}>System Audit and Reconciliation Log History</h3>
        {reconciliationLoading ? (
          <div className={styles.loadingText}>Fetching reconciliation logs...</div>
        ) : !reconciliationData?.logs || reconciliationData.logs.length === 0 ? (
          <div className={styles.emptyState}>No audit logs found. Run a nightly reconciliation scan.</div>
        ) : (
          <div className={styles.cardsGrid}>
            {reconciliationData.logs.map((log: any) => (
              <div key={log.id} className={styles.cardItem}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Audit Log #{log.id.slice(0, 8)}</h3>
                    <span className={styles.cardMeta}>
                      Run at: {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: "99px",
                      backgroundColor: log.status === "HEALTHY" ? "rgba(16,185,129,0.15)" : log.status === "FLAGGED" ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)",
                      color: log.status === "HEALTHY" ? "#10b981" : log.status === "FLAGGED" ? "#ef4444" : "#3b82f6",
                      border: `1px solid ${log.status === "HEALTHY" ? "rgba(16,185,129,0.3)" : log.status === "FLAGGED" ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)"}`,
                    }}
                  >
                    {log.status}
                  </span>
                </div>

                <div className={`${styles.cardBody} ${styles.adminCls_129}`}>
                  <div><strong>Total Sent:</strong> ₦{(log.total_debits_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</div>
                  <div><strong>Total Received:</strong> ₦{(log.total_credits_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</div>
                  <div><strong>Variance:</strong> ₦{(log.variance_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</div>
                  {log.notes && (
                    <div className={styles.reportReasonBox}>
                      <strong>Audit Note:</strong> {log.notes}
                    </div>
                  )}
                </div>

                {log.status === "FLAGGED" && (
                  <div className={styles.cardFooter}>
                    <button
                      type="button"
                      onClick={() => handleResolveReconciliationLog(log.id)}
                      disabled={reconciliationActionLoading || reconciliationLoading}
                      className={styles.btnAction}
                      style={{
                        backgroundColor: "#3b82f6",
                        color: "#fff",
                        opacity: reconciliationActionLoading || reconciliationLoading ? 0.65 : 1,
                        cursor: reconciliationActionLoading || reconciliationLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      Mark Resolved and Add Audit Note
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Transfer Reversal */}
      {showReverseModal && (
        <div className={styles.modalOverlay} onClick={() => !reversalLoading && setShowReverseModal(false)}>
          <div className={`${styles.modalContent} ${styles.adminCls_179}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.adminCls_160}>
                <div className={styles.adminCls_180}>
                  <RefreshCw size={20} />
                </div>
                <div>
                  <h3 className={`${styles.modalTitle} ${styles.mZero}`}>Reverse User Transfer</h3>
                  <span className={styles.adminCls_112}>
                    Claw back funds from recipient and refund sender atomically.
                  </span>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => !reversalLoading && setShowReverseModal(false)}
                disabled={reversalLoading}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleExecuteReversal}>
              <div className={styles.modalBody}>
                {reversalError && <div className={styles.adminCls_181}>{reversalError}</div>}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Transaction Reference (Required)</label>
                  <input
                    type="text"
                    placeholder="e.g. trf_1725619200000_abc123"
                    value={reverseRef}
                    onChange={(e) => setReverseRef(e.target.value)}
                    required
                    disabled={reversalLoading}
                    className={`${styles.inputField} ${styles.adminCls_182}`}
                  />
                  <span className={styles.formHelperText}>
                    Enter the original debit or credit transaction reference recorded on the ledger.
                  </span>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Audit Reason / Notes (Required)</label>
                  <textarea
                    rows={3}
                    placeholder="Explain reason for transfer reversal (e.g., Reported user compromise, accidental duplicate transfer)..."
                    value={reverseReason}
                    onChange={(e) => setReverseReason(e.target.value)}
                    required
                    disabled={reversalLoading}
                    className={styles.textareaField}
                  />
                  <span className={styles.formHelperText}>
                    Transactions exceeding ₦50,000 will be routed to the Dual-Authorization Queue for second-party review.
                  </span>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setShowReverseModal(false)}
                  disabled={reversalLoading}
                  className={styles.btnAction}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversalLoading}
                  className={styles.btnAction}
                  style={{
                    backgroundColor: "#6366f1",
                    color: "#fff",
                    fontWeight: 700,
                    opacity: reversalLoading ? 0.65 : 1,
                    cursor: reversalLoading ? "not-allowed" : "pointer",
                  }}
                >
                  {reversalLoading ? "Executing Reversal..." : "Execute Reversal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
