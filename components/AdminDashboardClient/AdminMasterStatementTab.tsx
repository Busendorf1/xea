"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAdminDialog } from "@/components/ui/AdminDialog";
import TransactionReceiptModal from "@/components/Receipt/TransactionReceiptModal";
import {
  AdminMasterStatementFilters,
  type StatementMetrics,
} from "./AdminMasterStatementFilters";
import {
  AdminMasterStatementTable,
  type MasterTransaction,
} from "./AdminMasterStatementTable";

export default function AdminMasterStatementTab() {
  const [transactions, setTransactions] = useState<MasterTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<MasterTransaction | null>(null);

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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const exportLockRef = useRef(false);

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

  const [metrics, setMetrics] = useState<StatementMetrics>({
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

  const buildQueryString = useCallback(
    (
      exportMode = false,
      filters = appliedFilters,
      targetPage = page,
      targetLimit = limit
    ) => {
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
    },
    [appliedFilters, page, limit]
  );

  const fetchTransactions = useCallback(
    async (filters = appliedFilters, targetPage = page, targetLimit = limit) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const q = buildQueryString(false, filters, targetPage, targetLimit);
        const res = await fetch(`/api/admin/transactions?${q}`);
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          setTransactions(data.transactions || []);
          setPagination({
            totalPages: data.pagination?.totalPages || 1,
            totalCount: data.pagination?.totalCount || 0,
          });
          if (data.metrics) {
            setMetrics(data.metrics);
          }
        } else {
          setErrorMessage(data.error || `Failed to load master statement (${res.status}).`);
        }
      } catch (err: any) {
        console.error("Failed to fetch master statement:", err);
        setErrorMessage(err?.message || "Network error loading master statement.");
      } finally {
        setLoading(false);
      }
    },
    [buildQueryString, appliedFilters, page, limit]
  );

  useEffect(() => {
    fetchTransactions(appliedFilters, page, limit);
  }, [appliedFilters, page, limit, fetchTransactions]);

  const scrollToTopSmooth = () => {
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
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
    if (loading) return;
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
    if (exportLockRef.current || exporting || loading) return;
    exportLockRef.current = true;
    setExporting(true);
    try {
      const q = buildQueryString(true);
      window.open(`/api/admin/transactions?${q}`, "_blank");
    } catch (e: any) {
      await alertDialog("Failed to export statement: " + (e?.message || e), "Export Failed");
    } finally {
      setExporting(false);
      exportLockRef.current = false;
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRef(text);
      setTimeout(() => setCopiedRef(null), 2000);
    } catch {
      setErrorMessage("Unable to copy reference to clipboard.");
    }
  };

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <AdminMasterStatementFilters
        metrics={metrics}
        showBalance={showBalance}
        toggleShowBalance={toggleShowBalance}
        emailFilter={emailFilter}
        setEmailFilter={setEmailFilter}
        referenceFilter={referenceFilter}
        setReferenceFilter={setReferenceFilter}
        typeFilter={typeFilter}
        onTypeFilterChange={(val) => {
          setTypeFilter(val);
          setPage(1);
          setAppliedFilters((prev) => ({ ...prev, type: val }));
        }}
        statusFilter={statusFilter}
        onStatusFilterChange={(val) => {
          setStatusFilter(val);
          setPage(1);
          setAppliedFilters((prev) => ({ ...prev, status: val }));
        }}
        yearFilter={yearFilter}
        setYearFilter={setYearFilter}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        loading={loading}
        exporting={exporting}
        errorMessage={errorMessage}
        setErrorMessage={setErrorMessage}
        onApplyFilter={handleApplyFilter}
        onResetFilters={handleResetFilters}
        onExportCsv={handleExportCsv}
        onRefresh={() => fetchTransactions()}
      />

      <AdminMasterStatementTable
        transactions={transactions}
        loading={loading}
        copiedRef={copiedRef}
        onCopyRef={copyToClipboard}
        onSelectReceipt={setSelectedReceiptTx}
        page={page}
        limit={limit}
        totalPages={pagination.totalPages}
        totalCount={pagination.totalCount}
        onLimitChange={(nextLimit) => {
          setLimit(nextLimit);
          setPage(1);
          scrollToTopSmooth();
        }}
        onPageChange={(nextPage) => {
          setPage(nextPage);
          scrollToTopSmooth();
        }}
      />

      {selectedReceiptTx && (
        <TransactionReceiptModal
          transaction={selectedReceiptTx}
          onClose={() => setSelectedReceiptTx(null)}
          currentUserEmail={selectedReceiptTx.user_email}
        />
      )}
    </div>
  );
}
