"use client";

import React, { useState, useEffect } from "react";
import styles from "./page.module.css";
import { AdminReconciliationEmergencyHeader } from "./AdminReconciliationEmergencyHeader";
import { AdminReconciliationDualAuthQueue } from "./AdminReconciliationDualAuthQueue";
import { AdminReconciliationForfeituresQueue } from "./AdminReconciliationForfeituresQueue";
import { AdminReconciliationAuditLogs } from "./AdminReconciliationAuditLogs";
import { AdminReconciliationTransferReverseModal } from "./AdminReconciliationTransferReverseModal";

export {
  AdminReconciliationEmergencyHeader,
  AdminReconciliationDualAuthQueue,
  AdminReconciliationForfeituresQueue,
  AdminReconciliationAuditLogs,
  AdminReconciliationTransferReverseModal,
};

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
        <h1 className={styles.sectionTitle}>Financial Reconciliation</h1>
        <p className={styles.sectionSubtitle}>
          Double-entry ledger audits and variance tracking.
        </p>
      </div>

      {/* Emergency Control Bar & Health Metrics */}
      <AdminReconciliationEmergencyHeader
        reconciliationData={reconciliationData}
        reconciliationLoading={reconciliationLoading}
        reconciliationActionLoading={reconciliationActionLoading}
        reversalLoading={reversalLoading}
        handleToggleEmergencyPause={handleToggleEmergencyPause}
        fetchReconciliationData={fetchReconciliationData}
        onOpenReverseModal={() => {
          setReversalError("");
          setShowReverseModal(true);
        }}
        showAdminBalance={showAdminBalance}
        toggleAdminBalance={toggleAdminBalance}
      />

      {reconciliationMsg && <div className={styles.adminCls_106}>{reconciliationMsg}</div>}

      {/* Pending Dual-Authorization Requests (Four-Eyes Principle) */}
      <AdminReconciliationDualAuthQueue
        pendingRequests={pendingRequests}
        pendingRequestsLoading={pendingRequestsLoading}
        approvingRequestId={approvingRequestId}
        pendingRequestsPage={pendingRequestsPage}
        setPendingRequestsPage={setPendingRequestsPage}
        pendingRequestsLimit={pendingRequestsLimit}
        setPendingRequestsLimit={setPendingRequestsLimit}
        pendingRequestsStatusFilter={pendingRequestsStatusFilter}
        setPendingRequestsStatusFilter={setPendingRequestsStatusFilter}
        pendingRequestsSearch={pendingRequestsSearch}
        setPendingRequestsSearch={setPendingRequestsSearch}
        pendingRequestsPagination={pendingRequestsPagination}
        pendingRequestsSummary={pendingRequestsSummary}
        fetchPendingRequests={fetchPendingRequests}
        handleApproveRequest={handleApproveRequest}
        handleRejectRequest={handleRejectRequest}
        renderPagination={renderPagination}
      />

      {/* Deactivated Account Forfeitures (Treasury Absorption Queue) */}
      <AdminReconciliationForfeituresQueue
        reconciliationData={reconciliationData}
        reconciliationLoading={reconciliationLoading}
        forfeitedPage={forfeitedPage}
        setForfeitedPage={setForfeitedPage}
        forfeitedLimit={forfeitedLimit}
        setForfeitedLimit={setForfeitedLimit}
        forfeitedStatusFilter={forfeitedStatusFilter}
        setForfeitedStatusFilter={setForfeitedStatusFilter}
        forfeitedSearch={forfeitedSearch}
        setForfeitedSearch={setForfeitedSearch}
        forfeitureActionLoading={forfeitureActionLoading}
        fetchReconciliationData={fetchReconciliationData}
        handleResolveForfeiture={handleResolveForfeiture}
        renderPagination={renderPagination}
      />

      {/* Reconciliation Logs Table */}
      <AdminReconciliationAuditLogs
        reconciliationData={reconciliationData}
        reconciliationLoading={reconciliationLoading}
        reconciliationActionLoading={reconciliationActionLoading}
        handleResolveReconciliationLog={handleResolveReconciliationLog}
      />

      {/* Modal: Transfer Reversal */}
      <AdminReconciliationTransferReverseModal
        showReverseModal={showReverseModal}
        setShowReverseModal={setShowReverseModal}
        reverseRef={reverseRef}
        setReverseRef={setReverseRef}
        reverseReason={reverseReason}
        setReverseReason={setReverseReason}
        reversalLoading={reversalLoading}
        reversalError={reversalError}
        handleExecuteReversal={handleExecuteReversal}
      />
    </>
  );
}
