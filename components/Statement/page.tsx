"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  RefreshCw,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Filter,
  ChevronDown,
  Building,
  Clock,
  Download,
} from "lucide-react";
import styles from "./page.module.css";
import TransactionReceiptModal from "@/components/Receipt/TransactionReceiptModal";
import { StatementSkeleton } from "@/components/ui/PageSkeletons";
import StatementTableViews from "./StatementTableViews";
import {
  StatementTransaction,
  CategoryFilter,
  readStatementCache,
  escapeStatementCsvCell,
  isStatementCredit,
  formatStatementAmount,
} from "./statementUtils";

export type { CategoryFilter };

export default function StatementComponent({ initialProfile }: { initialProfile?: any } = {}) {
  const [initialCache] = useState(readStatementCache);
  const [profile, setProfile] = useState<any>(() => initialProfile || initialCache.profile);
  const [payments, setPayments] = useState<StatementTransaction[]>(initialCache.payments);
  const [withdrawals, setWithdrawals] = useState<StatementTransaction[]>(initialCache.withdrawals);
  const [loading, setLoading] = useState<boolean>(!initialCache.hasCachedLists);
  const [activeTab, setActiveTab] = useState<"payments" | "withdrawals">("payments");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<StatementTransaction | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMoreServer, setHasMoreServer] = useState(false);
  const [loadingMoreServer, setLoadingMoreServer] = useState(false);
  const pageSize = 15;

  const inFlightFetchRef = useRef(false);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  const fetchData = useCallback(async (isRefresh = false, cursorParam: string | null = null) => {
    if (inFlightFetchRef.current && !cursorParam) return;
    inFlightFetchRef.current = true;
    setErrorMessage(null);

    try {
      const refreshQuery = isRefresh ? "&refresh=true" : "";
      const cursorQuery = cursorParam ? `&cursor=${encodeURIComponent(cursorParam)}` : "";

      const [profileRes, unifiedRes] = await Promise.all([
        cursorParam ? Promise.resolve(null) : fetch("/api/profile").catch(() => null),
        fetch(`/api/payments/history?type=all${refreshQuery}${cursorQuery}`),
      ]);

      let newProfile = profile || initialProfile;
      let newPayments = payments;
      let newWithdrawals = withdrawals;

      if (profileRes && profileRes.ok) {
        const parsedProfile = await profileRes.json().catch(() => null);
        if (parsedProfile) {
          newProfile = parsedProfile;
          setProfile(parsedProfile);
        }
      }

      if (!unifiedRes.ok) {
        const errPayload = await unifiedRes.json().catch(() => null);
        throw new Error(errPayload?.error || `Unable to load statement (${unifiedRes.status})`);
      }

      const unifiedData = await unifiedRes.json().catch(() => null);
      const fetchedPayments: StatementTransaction[] = Array.isArray(unifiedData?.payments)
        ? unifiedData.payments
        : Array.isArray(unifiedData)
        ? unifiedData
        : [];
      const fetchedWithdrawals: StatementTransaction[] = Array.isArray(unifiedData?.withdrawals)
        ? unifiedData.withdrawals
        : [];

      if (cursorParam) {
        setPayments((prev) => {
          const existing = new Set(prev.map((p) => p.id));
          return [...prev, ...fetchedPayments.filter((p) => !existing.has(p.id))];
        });
        setWithdrawals((prev) => {
          const existing = new Set(prev.map((w) => w.id));
          return [...prev, ...fetchedWithdrawals.filter((w) => !existing.has(w.id))];
        });
      } else {
        newPayments = fetchedPayments;
        newWithdrawals = fetchedWithdrawals;
        setPayments(newPayments);
        setWithdrawals(newWithdrawals);

        try {
          sessionStorage.setItem(
            "paayh_statement_cache",
            JSON.stringify({
              profile: newProfile,
              payments: newPayments,
              withdrawals: newWithdrawals,
            })
          );
        } catch {}
      }

      setNextCursor(typeof unifiedData?.nextCursor === "string" ? unifiedData.nextCursor : null);
      setHasMoreServer(Boolean(unifiedData?.hasMore && unifiedData?.nextCursor));

      // Auto-verify recent pending transactions (last 15 minutes)
      const recentPending = (fetchedPayments || []).filter(
        (p) =>
          (p.status === "pending" || p.status === "processing") &&
          Date.now() - new Date(p.created_at).getTime() < 15 * 60 * 1000
      );
      recentPending.forEach((rp) => {
        fetch(`/api/payments/verify?reference=${encodeURIComponent(rp.reference)}`)
          .then((r) => r.json().catch(() => null))
          .then((resData) => {
            if (resData?.success || resData?.status === "success") {
              setPayments((prev) =>
                prev.map((item) => (item.reference === rp.reference ? { ...item, status: "success" } : item))
              );
            }
          })
          .catch(() => {});
      });

      const recentPendingWithdrawals = (fetchedWithdrawals || []).filter(
        (w) =>
          (w.status === "pending" || w.status === "processing") &&
          Date.now() - new Date(w.created_at).getTime() < 15 * 60 * 1000
      );
      recentPendingWithdrawals.forEach((rw) => {
        fetch(`/api/payments/verify?reference=${encodeURIComponent(rw.reference)}`)
          .then((r) => r.json().catch(() => null))
          .then((resData) => {
            if (resData?.success || resData?.status === "success") {
              setWithdrawals((prev) =>
                prev.map((item) => (item.reference === rw.reference ? { ...item, status: "success" } : item))
              );
            } else if (resData?.status === "failed") {
              setWithdrawals((prev) =>
                prev.map((item) => (item.reference === rw.reference ? { ...item, status: "failed" } : item))
              );
            }
          })
          .catch(() => {});
      });
    } catch (err: any) {
      console.error("❌ Error fetching statement data:", err);
      setErrorMessage(err?.message || "Failed to load statement records. Please try again.");
    } finally {
      inFlightFetchRef.current = false;
      setLoading(false);
      setRefreshing(false);
      setLoadingMoreServer(false);
    }
  }, [initialProfile, payments, profile, withdrawals]);

  useEffect(() => {
    fetchData();

    const handleStatementRefresh = () => {
      fetchData(true);
    };

    window.addEventListener("paayh:payment_verified", handleStatementRefresh);
    window.addEventListener("paayh:transfer_completed", handleStatementRefresh);
    window.addEventListener("paayh:balance_updated", handleStatementRefresh);
    return () => {
      window.removeEventListener("paayh:payment_verified", handleStatementRefresh);
      window.removeEventListener("paayh:transfer_completed", handleStatementRefresh);
      window.removeEventListener("paayh:balance_updated", handleStatementRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    fetchData(true);
  };

  const handleLoadMoreServer = () => {
    if (!nextCursor || loadingMoreServer) return;
    setLoadingMoreServer(true);
    fetchData(false, nextCursor);
  };

  const handleCopy = async (ref: string) => {
    try {
      await navigator.clipboard.writeText(ref);
      setCopiedRef(ref);
      setTimeout(() => setCopiedRef(null), 2000);
    } catch {
      setErrorMessage("Could not copy reference to clipboard.");
    }
  };

  const scrollToTableTop = () => {
    try {
      controlsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {}
  };

  const { totalSent, totalReceived } = useMemo(() => {
    let sent = 0;
    let received = 0;
    for (const p of payments) {
      if ((p.status || "").toLowerCase() === "success") {
        if (p.type === "transfer_sent") sent += Number(p.amount || 0);
        else if (p.type === "transfer_received") received += Number(p.amount || 0);
      }
    }
    return { totalSent: sent, totalReceived: received };
  }, [payments]);

  const totalWithdrawn = useMemo(() => {
    return withdrawals
      .filter((w) => (w.status || "").toLowerCase() === "success")
      .reduce((sum, w) => sum + Number(w.amount || 0), 0);
  }, [withdrawals]);

  const normalizedSearch = searchTerm.toLowerCase();
  const normalizedStatus = statusFilter.toLowerCase();

  const handleCardClick = (cat: CategoryFilter) => {
    if (categoryFilter === cat) {
      setCategoryFilter("all");
    } else {
      setCategoryFilter(cat);
      if (cat === "pending_withdrawal" || cat === "withdrawn") {
        setActiveTab("withdrawals");
      } else if (cat === "transfer_sent" || cat === "transfer_received") {
        setActiveTab("payments");
      }
    }
    setCurrentPage(1);
    scrollToTableTop();
  };

  const handleCardKeyDown = (e: React.KeyboardEvent, cat: CategoryFilter) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCardClick(cat);
    }
  };

  const filteredPayments = useMemo(() => {
    return payments.filter((tx) => {
      if (categoryFilter === "transfer_sent" && tx.type !== "transfer_sent") return false;
      if (categoryFilter === "transfer_received" && tx.type !== "transfer_received") return false;
      const matchesSearch =
        !normalizedSearch ||
        (tx.reference || "").toLowerCase().includes(normalizedSearch) ||
        (tx.description || "").toLowerCase().includes(normalizedSearch) ||
        (tx.type || "").toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        normalizedStatus === "all" || (tx.status || "").toLowerCase() === normalizedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [payments, normalizedSearch, normalizedStatus, categoryFilter]);

  const filteredWithdrawals = useMemo(() => {
    return withdrawals.filter((tx) => {
      const s = (tx.status || "").toLowerCase();
      if (categoryFilter === "pending_withdrawal" && s !== "pending" && s !== "processing" && s !== "queued") {
        return false;
      }
      if (categoryFilter === "withdrawn" && s !== "success") return false;
      const matchesSearch =
        !normalizedSearch ||
        (tx.reference || "").toLowerCase().includes(normalizedSearch) ||
        (tx.description || "").toLowerCase().includes(normalizedSearch) ||
        (tx.type || "").toLowerCase().includes(normalizedSearch);
      const matchesStatus = normalizedStatus === "all" || s === normalizedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [withdrawals, normalizedSearch, normalizedStatus, categoryFilter]);

  const currentList = activeTab === "payments" ? filteredPayments : filteredWithdrawals;
  const totalPages = Math.max(1, Math.ceil(currentList.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, currentList.length);

  const paginatedPayments = useMemo(
    () => filteredPayments.slice(startIndex, startIndex + pageSize),
    [filteredPayments, startIndex, pageSize]
  );
  const paginatedWithdrawals = useMemo(
    () => filteredWithdrawals.slice(startIndex, startIndex + pageSize),
    [filteredWithdrawals, startIndex, pageSize]
  );

  const handleDownloadCSV = () => {
    const dataToExport = activeTab === "payments" ? filteredPayments : filteredWithdrawals;
    if (!dataToExport || dataToExport.length === 0) return;

    const headers =
      activeTab === "payments"
        ? ["Date & Time", "Reference", "Type", "Description", "Amount (NGN)", "Status"]
        : ["Date & Time", "Reference", "Destination Account", "Amount (NGN)", "Status"];

    const rows = dataToExport.map((tx) => {
      const formattedDate = escapeStatementCsvCell(new Date(tx.created_at).toLocaleString("en-US"));
      const ref = escapeStatementCsvCell(tx.reference);
      const desc = escapeStatementCsvCell(tx.description || "");
      const status = escapeStatementCsvCell(tx.status);

      if (activeTab === "payments") {
        const type = escapeStatementCsvCell(tx.type);
        const amt = isStatementCredit(tx.type) ? tx.amount : -tx.amount;
        return [formattedDate, ref, type, desc, amt, status].join(",");
      }
      return [formattedDate, ref, desc, -tx.amount, status].join(",");
    });

    const blob = new Blob([[headers.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Paayh_Statement_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePageChange = (nextPage: number) => {
    setCurrentPage(nextPage);
    scrollToTableTop();
  };

  return (
    <main className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Account Statement</h1>
          <p className={styles.subtitle}>
            Track your payments, ad campaigns, money transfers, and bank withdrawals.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={handleDownloadCSV}
            disabled={loading || currentList.length === 0}
            className={styles.downloadBtn}
            title="Download Statement CSV file"
          >
            <Download size={15} />
            <span>Download File</span>
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className={styles.refreshBtn}
            title="Refresh Statement Data"
          >
            <RefreshCw size={15} className={refreshing ? styles.spin : ""} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            borderRadius: "10px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            fontSize: "0.85rem",
          }}
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              background: "transparent",
              color: "#ef4444",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <StatementSkeleton />
      ) : (
        <>
          <div className={styles.statsGrid}>
            <div
              className={`${styles.statCard} ${styles.statBalance} ${
                categoryFilter === "all" ? styles.statCardActive : ""
              }`}
              onClick={() => handleCardClick("all")}
              onKeyDown={(e) => handleCardKeyDown(e, "all")}
              role="button"
              tabIndex={0}
              title="Click to view all transactions"
            >
              <div className={styles.statIconWrap}>
                <Wallet size={18} color="var(--primary)" />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Available Balance</div>
                <div className={styles.statValue}>{formatStatementAmount(profile?.balance ?? 0)}</div>
              </div>
            </div>

            <div
              className={`${styles.statCard} ${styles.statWithdraw} ${
                categoryFilter === "pending_withdrawal" ? styles.statCardActive : ""
              }`}
              onClick={() => handleCardClick("pending_withdrawal")}
              onKeyDown={(e) => handleCardKeyDown(e, "pending_withdrawal")}
              role="button"
              tabIndex={0}
              title="Click to sieve statement by Pending Withdrawals"
            >
              <div className={styles.statIconWrap}>
                <Clock size={18} color="var(--primary)" />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Pending Withdrawal</div>
                <div className={styles.statValue}>{formatStatementAmount(profile?.withdrawal ?? 0)}</div>
              </div>
            </div>

            <div
              className={`${styles.statCard} ${styles.statSent} ${
                categoryFilter === "transfer_sent" ? styles.statCardActive : ""
              }`}
              onClick={() => handleCardClick("transfer_sent")}
              onKeyDown={(e) => handleCardKeyDown(e, "transfer_sent")}
              role="button"
              tabIndex={0}
              title="Click to sieve statement by Sent Money"
            >
              <div className={styles.statIconWrap}>
                <ArrowUpRight size={18} color="#ef4444" />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Total P2P Sent</div>
                <div className={styles.statValue}>{formatStatementAmount(totalSent)}</div>
              </div>
            </div>

            <div
              className={`${styles.statCard} ${styles.statReceived} ${
                categoryFilter === "transfer_received" ? styles.statCardActive : ""
              }`}
              onClick={() => handleCardClick("transfer_received")}
              onKeyDown={(e) => handleCardKeyDown(e, "transfer_received")}
              role="button"
              tabIndex={0}
              title="Click to sieve statement by Received Money"
            >
              <div className={styles.statIconWrap}>
                <ArrowDownLeft size={18} color="var(--primary)" />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Total P2P Received</div>
                <div className={styles.statValue}>{formatStatementAmount(totalReceived)}</div>
              </div>
            </div>

            <div
              className={`${styles.statCard} ${styles.statWithdrawn} ${
                categoryFilter === "withdrawn" ? styles.statCardActive : ""
              }`}
              onClick={() => handleCardClick("withdrawn")}
              onKeyDown={(e) => handleCardKeyDown(e, "withdrawn")}
              role="button"
              tabIndex={0}
              title="Click to sieve statement by Completed Withdrawals"
            >
              <div className={styles.statIconWrap}>
                <Building size={18} color="var(--primary)" />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Total Withdrawn</div>
                <div className={styles.statValue}>{formatStatementAmount(totalWithdrawn)}</div>
              </div>
            </div>
          </div>

          <div ref={controlsRef} className={styles.controlsBar}>
            <div className={styles.tabsContainer}>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === "payments" ? styles.activeTabBtn : ""}`}
                onClick={() => {
                  setActiveTab("payments");
                  if (categoryFilter === "pending_withdrawal" || categoryFilter === "withdrawn") {
                    setCategoryFilter("all");
                  }
                  handlePageChange(1);
                }}
              >
                Payments &amp; Transfers ({payments.length})
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === "withdrawals" ? styles.activeTabBtn : ""}`}
                onClick={() => {
                  setActiveTab("withdrawals");
                  if (categoryFilter === "transfer_sent" || categoryFilter === "transfer_received") {
                    setCategoryFilter("all");
                  }
                  handlePageChange(1);
                }}
              >
                Withdrawals ({withdrawals.length})
              </button>
            </div>

            <div className={styles.filterControls}>
              <div className={styles.searchWrapper}>
                <Search size={15} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search reference or description..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={styles.searchInput}
                />
              </div>

              <div className={styles.selectWrapper}>
                <Filter size={14} className={styles.filterIcon} />
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={styles.statusSelect}
                  aria-label="Filter transactions by status"
                >
                  <option value="all">All Statuses</option>
                  <option value="success">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                  <option value="reversed">Reversed</option>
                </select>
                <ChevronDown size={14} className={styles.selectChevron} />
              </div>
            </div>
          </div>

          <StatementTableViews
            activeTab={activeTab}
            filteredPayments={filteredPayments}
            filteredWithdrawals={filteredWithdrawals}
            paginatedPayments={paginatedPayments}
            paginatedWithdrawals={paginatedWithdrawals}
            copiedRef={copiedRef}
            onCopy={handleCopy}
            onSelectReceipt={setSelectedReceiptTx}
            currentListLength={currentList.length}
            startIndex={startIndex}
            endIndex={endIndex}
            totalPages={totalPages}
            validPage={validPage}
            onPageChange={handlePageChange}
            hasMoreServer={hasMoreServer}
            loadingMoreServer={loadingMoreServer}
            onLoadMoreServer={handleLoadMoreServer}
          />
        </>
      )}

      {selectedReceiptTx && (
        <TransactionReceiptModal
          transaction={selectedReceiptTx}
          onClose={() => setSelectedReceiptTx(null)}
          currentUserEmail={profile?.email}
          currentUserName={
            profile?.firstName ? `${profile.firstName} ${profile.lastName || ""}`.trim() : undefined
          }
        />
      )}
    </main>
  );
}
