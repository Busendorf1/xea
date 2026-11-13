"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAdminDialog } from "@/components/ui/AdminDialog";
import TransactionReceiptModal from "@/components/Receipt/TransactionReceiptModal";
import {
  AdminPayoutsMetricsAndActions,
  type PayoutMetrics,
} from "./AdminPayoutsMetricsAndActions";
import { AdminPayoutsTable, type PayoutItem } from "./AdminPayoutsTable";

export default function AdminPayoutsTab() {
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [manualRef, setManualRef] = useState("");
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());
  const [selectedReceiptPayout, setSelectedReceiptPayout] = useState<PayoutItem | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [showBalance, setShowBalance] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("admin_show_balance");
      if (saved !== null) return saved === "true";
    }
    return true;
  });

  const actionLockRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const toggleShowBalance = () => {
    setShowBalance((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("admin_show_balance", String(next));
      } catch {}
      return next;
    });
  };

  const [metrics, setMetrics] = useState<PayoutMetrics>({
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
  const [feedback, setFeedback] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const { alertDialog, confirmDialog } = useAdminDialog();

  const fetchPayouts = useCallback(
    async (
      targetPage = page,
      targetStatus = statusFilter,
      targetSearch = appliedSearch
    ) => {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          page: targetPage.toString(),
          limit: "20",
          status: targetStatus,
          search: targetSearch,
        });

        const res = await fetch(`/api/admin/payouts?${queryParams.toString()}`);
        const data = await res.json().catch(() => ({}));

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
          setFeedback({
            text: data.error || `Failed to fetch payouts (${res.status})`,
            type: "error",
          });
        }
      } catch (err: any) {
        setFeedback({
          text: err?.message || "Network error loading payouts",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    },
    [page, statusFilter, appliedSearch]
  );

  useEffect(() => {
    fetchPayouts(page, statusFilter, appliedSearch);
  }, [page, statusFilter, appliedSearch, fetchPayouts]);

  const scrollToTopSmooth = () => {
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const trimmed = search.trim();
    setPage(1);
    if (trimmed === appliedSearch) {
      fetchPayouts(1, statusFilter, trimmed);
    } else {
      setAppliedSearch(trimmed);
    }
  };

  const handleStatusFilterChange = (status: string) => {
    if (loading) return;
    setStatusFilter(status);
    setPage(1);
    scrollToTopSmooth();
  };

  const handlePageChange = (nextPage: number) => {
    if (loading) return;
    setPage(nextPage);
    scrollToTopSmooth();
  };

  const executeBatch = async (forceTestMode = testMode) => {
    setActionLoading(true);
    setFeedback({
      text: forceTestMode
        ? "Processing payout window in Test Simulation Mode..."
        : "Dispatching payout batch to gateway...",
      type: "info",
    });
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "process_all_queued",
          allowTestMode: forceTestMode,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setFeedback({
          text: data.message || "Manual payout batch executed!",
          type: "success",
        });
        await alertDialog(
          data.message || "Manual payout batch executed successfully!",
          "Batch Complete"
        );
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
        setFeedback({
          text: data.error || `Failed to execute payout batch (${res.status})`,
          type: "error",
        });
        await alertDialog(data.error || "Failed to execute payout batch", "Payout Error");
      }
    } catch (e: any) {
      setFeedback({
        text: e?.message || "Error running manual payout batch",
        type: "error",
      });
      await alertDialog(e?.message || "Error running manual payout batch", "Error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualProcessAll = async () => {
    if (actionLockRef.current || actionLoading) return;
    actionLockRef.current = true;
    try {
      const ok = await confirmDialog(
        "Are you sure you want to execute an immediate payout window for all queued & pending withdrawals?",
        "Execute Manual Payout Window"
      );
      if (!ok) return;
      await executeBatch(testMode);
    } finally {
      actionLockRef.current = false;
    }
  };

  const handleRetrySingle = async (ref: string, forceTest = testMode) => {
    if (actionLockRef.current && !forceTest) return;
    if (!ref.trim()) {
      await alertDialog("Please enter or select a valid transaction reference.", "Missing Reference");
      return;
    }

    actionLockRef.current = true;
    setActionLoading(true);
    setFeedback({ text: `Retrying payout for [${ref}]...`, type: "info" });
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retry_single",
          reference: ref.trim(),
          allowTestMode: forceTest,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setFeedback({
          text: data.message || `Payout [${ref}] processed!`,
          type: "success",
        });
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
          setFeedback({
            text: data.error || `Retry failed for [${ref}]`,
            type: "error",
          });
        }
      } else {
        setFeedback({
          text: data.error || `Retry failed for [${ref}] (${res.status})`,
          type: "error",
        });
        await alertDialog(data.error || `Retry failed for [${ref}]`, "Retry Failed");
      }
    } catch (e: any) {
      setFeedback({ text: e?.message || "Error retrying payout", type: "error" });
      await alertDialog(e?.message || "Error retrying payout", "Error");
    } finally {
      setActionLoading(false);
      actionLockRef.current = false;
    }
  };

  const handleBulkRetry = async (forceTest = testMode) => {
    if (actionLockRef.current && !forceTest) return;
    actionLockRef.current = true;
    try {
      const refsToRetry = Array.from(selectedRefs);
      if (!forceTest) {
        const confirmMsg =
          refsToRetry.length > 0
            ? `Retry ${refsToRetry.length} selected payout(s)?`
            : "Retry all currently failed & queued payouts?";

        const ok = await confirmDialog(confirmMsg, "Confirm Bulk Retry");
        if (!ok) return;
      }

      setActionLoading(true);
      setFeedback({ text: "Executing bulk retry...", type: "info" });
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retry_bulk",
          references: refsToRetry.length > 0 ? refsToRetry : undefined,
          allowTestMode: forceTest,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setFeedback({
          text: data.message || "Bulk retry completed!",
          type: "success",
        });
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
        setFeedback({
          text: data.error || `Bulk retry failed (${res.status})`,
          type: "error",
        });
        await alertDialog(data.error || "Bulk retry failed", "Bulk Retry Failed");
      }
    } catch (e: any) {
      setFeedback({ text: e?.message || "Bulk retry failed", type: "error" });
      await alertDialog(e?.message || "Bulk retry failed", "Error");
    } finally {
      setActionLoading(false);
      actionLockRef.current = false;
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

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <AdminPayoutsMetricsAndActions
        metrics={metrics}
        showBalance={showBalance}
        toggleShowBalance={toggleShowBalance}
        testMode={testMode}
        setTestMode={setTestMode}
        actionLoading={actionLoading}
        loading={loading}
        selectedCount={selectedRefs.size}
        manualRef={manualRef}
        setManualRef={setManualRef}
        feedback={feedback}
        setFeedback={setFeedback}
        statusFilter={statusFilter}
        search={search}
        setSearch={setSearch}
        onManualProcessAll={handleManualProcessAll}
        onBulkRetry={() => handleBulkRetry()}
        onRefresh={() => fetchPayouts()}
        onRetrySingle={(ref) => handleRetrySingle(ref)}
        onStatusFilterChange={handleStatusFilterChange}
        onSearchSubmit={handleSearchSubmit}
      />

      <AdminPayoutsTable
        payouts={payouts}
        loading={loading}
        actionLoading={actionLoading}
        selectedRefs={selectedRefs}
        toggleSelectAll={toggleSelectAll}
        toggleSelectRef={toggleSelectRef}
        onSelectReceipt={setSelectedReceiptPayout}
        onRetrySingle={(ref) => handleRetrySingle(ref)}
        page={page}
        totalPages={pagination.totalPages}
        totalCount={pagination.totalCount}
        onPageChange={handlePageChange}
      />

      {selectedReceiptPayout && (
        <TransactionReceiptModal
          transaction={{
            ...selectedReceiptPayout,
            type: "withdrawal",
          }}
          onClose={() => setSelectedReceiptPayout(null)}
        />
      )}
    </div>
  );
}
