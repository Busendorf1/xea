"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  RefreshCw,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  Search,
  Filter,
  ChevronDown,
  Copy,
  Check,
  CreditCard,
  Building,
  Clock,
  Download,
  FileText
} from "lucide-react";
import styles from "./page.module.css";
import TransactionReceiptModal from "@/components/Receipt/TransactionReceiptModal";

interface Transaction {
  id: string;
  reference: string;
  amount: number;
  status: string;
  type: string;
  description: string;
  metadata?: Record<string, any>;
  created_at: string;
}

function readStatementCache(): {
  profile: any | null;
  payments: Transaction[];
  withdrawals: Transaction[];
  hasCachedLists: boolean;
} {
  if (typeof window !== "undefined") {
    try {
      const cached = sessionStorage.getItem("paayh_statement_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          profile: parsed.profile || null,
          payments: Array.isArray(parsed.payments) ? parsed.payments : [],
          withdrawals: Array.isArray(parsed.withdrawals) ? parsed.withdrawals : [],
          hasCachedLists: Boolean(parsed.payments || parsed.withdrawals),
        };
      }
    } catch {}
  }
  return { profile: null, payments: [], withdrawals: [], hasCachedLists: false };
}

export default function StatementComponent({ initialProfile }: { initialProfile?: any } = {}) {
  const [initialCache] = useState(readStatementCache);
  const [profile, setProfile] = useState<any>(() => initialProfile || initialCache.profile);
  const [payments, setPayments] = useState<Transaction[]>(initialCache.payments);
  const [withdrawals, setWithdrawals] = useState<Transaction[]>(initialCache.withdrawals);
  const [loading, setLoading] = useState<boolean>(!initialCache.hasCachedLists);
  const [activeTab, setActiveTab] = useState<"payments" | "withdrawals">("payments");
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<Transaction | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const fetchData = async (isRefresh = false) => {
    try {
      const refreshQuery = isRefresh ? "&refresh=true" : "";
      const needsProfileFetch = isRefresh || (!profile && !initialProfile);

      const [profileRes, unifiedRes] = await Promise.all([
        needsProfileFetch ? fetch("/api/profile").catch(() => null) : Promise.resolve(null),
        fetch(`/api/payments/history?type=all${refreshQuery}`),
      ]);

      let newProfile = profile || initialProfile;
      let newPayments = payments;
      let newWithdrawals = withdrawals;

      if (profileRes && profileRes.ok) {
        newProfile = await profileRes.json();
        setProfile(newProfile);
      }

      if (unifiedRes.ok) {
        const unifiedData = await unifiedRes.json();
        newPayments = Array.isArray(unifiedData?.payments)
          ? unifiedData.payments
          : Array.isArray(unifiedData)
          ? unifiedData
          : [];
        newWithdrawals = Array.isArray(unifiedData?.withdrawals) ? unifiedData.withdrawals : [];
        setPayments(newPayments);
        setWithdrawals(newWithdrawals);

        // Auto-verify recent pending transactions (last 15 minutes) to ensure immediate "Completed" state
        const recentPending = (newPayments || []).filter(
          (p: Transaction) =>
            (p.status === "pending" || p.status === "processing") &&
            Date.now() - new Date(p.created_at).getTime() < 15 * 60 * 1000
        );

        if (recentPending.length > 0) {
          recentPending.forEach((rp: Transaction) => {
            fetch(`/api/payments/verify?reference=${encodeURIComponent(rp.reference)}`)
              .then((r) => r.json())
              .then((resData) => {
                if (resData.success || resData.status === "success") {
                  setPayments((prev) =>
                    prev.map((item) =>
                      item.reference === rp.reference ? { ...item, status: "success" } : item
                    )
                  );
                }
              })
              .catch(() => {});
          });
        }

        // Auto-verify recent pending/processing withdrawals (last 15 minutes) to ensure immediate "Completed" state
        const recentPendingWithdrawals = (newWithdrawals || []).filter(
          (w: Transaction) =>
            (w.status === "pending" || w.status === "processing") &&
            Date.now() - new Date(w.created_at).getTime() < 15 * 60 * 1000
        );

        if (recentPendingWithdrawals.length > 0) {
          recentPendingWithdrawals.forEach((rw: Transaction) => {
            fetch(`/api/payments/verify?reference=${encodeURIComponent(rw.reference)}`)
              .then((r) => r.json())
              .then((resData) => {
                if (resData.success || resData.status === "success") {
                  setWithdrawals((prev) =>
                    prev.map((item) =>
                      item.reference === rw.reference ? { ...item, status: "success" } : item
                    )
                  );
                } else if (resData.status === "failed") {
                  setWithdrawals((prev) =>
                    prev.map((item) =>
                      item.reference === rw.reference ? { ...item, status: "failed" } : item
                    )
                  );
                }
              })
              .catch(() => {});
          });
        }
      }

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
    } catch (err) {
      console.error("❌ Error fetching statement data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handlePaymentVerified = () => {
      fetchData(true);
    };

    window.addEventListener("paayh:payment_verified", handlePaymentVerified);
    return () => {
      window.removeEventListener("paayh:payment_verified", handlePaymentVerified);
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData(true);
  };

  const handleCopy = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  const handleDownloadCSV = () => {
    const dataToExport = activeTab === "payments" ? filteredPayments : filteredWithdrawals;
    if (!dataToExport || dataToExport.length === 0) {
      return;
    }

    const headers = activeTab === "payments" 
      ? ["Date & Time", "Reference", "Type", "Description", "Amount (NGN)", "Status"]
      : ["Date & Time", "Reference", "Destination Account", "Amount (NGN)", "Status"];

    const rows = dataToExport.map((tx) => {
      const formattedDate = `"${new Date(tx.created_at).toLocaleString("en-US")}"`;
      const ref = `"${tx.reference}"`;
      const desc = `"${(tx.description || "").replace(/"/g, '""')}"`;
      const status = `"${tx.status}"`;
      
      if (activeTab === "payments") {
        const type = `"${tx.type}"`;
        const amt = tx.type === "transfer_received" ? tx.amount : -tx.amount;
        return [formattedDate, ref, type, desc, amt, status].join(",");
      } else {
        return [formattedDate, ref, desc, -tx.amount, status].join(",");
      }
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const filename = `Paayh_Statement_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatAmount = (amt: number | string) => {
    const parsed = typeof amt === "string" ? parseFloat(amt) : amt;
    return isNaN(parsed) ? "₦0.00" : "₦" + parsed.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case "success":
        return <span className={`${styles.status} ${styles.statusSuccess}`}>Completed</span>;
      case "queued":
        return <span className={`${styles.status} ${styles.statusPending}`}>Queued</span>;
      case "processing":
        return <span className={`${styles.status} ${styles.statusPending}`}>Processing</span>;
      case "pending":
        return <span className={`${styles.status} ${styles.statusPending}`}>Pending</span>;
      case "failed":
        return <span className={`${styles.status} ${styles.statusFailed}`}>Failed</span>;
      case "reversed":
        return <span className={`${styles.status} ${styles.statusReversed}`}>Reversed</span>;
      default:
        return <span className={styles.status}>{status}</span>;
    }
  };

  const getTypeBadge = (type: string) => {
    const t = type.toLowerCase();
    if (t === "transfer_sent") {
      return (
        <span className={`${styles.typeBadge} ${styles.typeTransferSent}`}>
          <ArrowUpRight size={13} />
          Sent Money
        </span>
      );
    }
    if (t === "transfer_received") {
      return (
        <span className={`${styles.typeBadge} ${styles.typeTransferReceived}`}>
          <ArrowDownLeft size={13} />
          Received Money
        </span>
      );
    }
    if (t === "withdrawal") {
      return (
        <span className={`${styles.typeBadge} ${styles.typeWithdrawal}`}>
          <Building size={13} />
          Withdrawal
        </span>
      );
    }
    if (t === "ad") {
      return (
        <span className={`${styles.typeBadge} ${styles.typeAd}`}>
          <TrendingUp size={13} />
          Ad Campaign
        </span>
      );
    }
    if (t === "highlight") {
      return (
        <span className={`${styles.typeBadge} ${styles.typeHighlight}`}>
          <CreditCard size={13} />
          Highlight
        </span>
      );
    }
    return (
      <span className={styles.typeBadge}>
        {type.replace("_", " ")}
      </span>
    );
  };

  const { totalSent, totalReceived } = useMemo(() => {
    let sent = 0;
    let received = 0;
    for (const p of payments) {
      if (p.status.toLowerCase() === "success") {
        if (p.type === "transfer_sent") sent += Number(p.amount || 0);
        else if (p.type === "transfer_received") received += Number(p.amount || 0);
      }
    }
    return { totalSent: sent, totalReceived: received };
  }, [payments]);

  const totalWithdrawn = useMemo(() => {
    return withdrawals
      .filter((w) => w.status.toLowerCase() === "success")
      .reduce((sum, w) => sum + Number(w.amount || 0), 0);
  }, [withdrawals]);

  const normalizedSearch = searchTerm.toLowerCase();
  const normalizedStatus = statusFilter.toLowerCase();

  const filteredPayments = useMemo(() => {
    return payments.filter((tx) => {
      const matchesSearch =
        !normalizedSearch ||
        tx.reference.toLowerCase().includes(normalizedSearch) ||
        (tx.description || "").toLowerCase().includes(normalizedSearch) ||
        (tx.type || "").toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        normalizedStatus === "all" || tx.status.toLowerCase() === normalizedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [payments, normalizedSearch, normalizedStatus]);

  const filteredWithdrawals = useMemo(() => {
    return withdrawals.filter((tx) => {
      const matchesSearch =
        !normalizedSearch ||
        tx.reference.toLowerCase().includes(normalizedSearch) ||
        (tx.description || "").toLowerCase().includes(normalizedSearch) ||
        (tx.type || "").toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        normalizedStatus === "all" || tx.status.toLowerCase() === normalizedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [withdrawals, normalizedSearch, normalizedStatus]);

  // Pagination calculation
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
            onClick={handleDownloadCSV}
            className={styles.downloadBtn}
            title="Download Statement CSV file"
          >
            <Download size={15} />
            <span>Download File</span>
          </button>
          <button
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

      {loading ? (
        <div className={styles.loadingWrapper}>
          <div className={styles.loadingSpinner} />
          <p>Loading your statement history...</p>
        </div>
      ) : (
        <>
          <div className={styles.statsGrid}>
            <div className={`${styles.statCard} ${styles.statBalance}`}>
              <div className={styles.statIconWrap}>
                <Wallet size={18} color="var(--primary)" />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Available Balance</div>
                <div className={styles.statValue}>{formatAmount(profile?.balance ?? 0)}</div>
              </div>
            </div>

            <div className={`${styles.statCard} ${styles.statWithdraw}`}>
              <div className={styles.statIconWrap}>
                <Clock size={18} color="var(--primary)" />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Pending Withdrawal</div>
                <div className={styles.statValue}>{formatAmount(profile?.withdrawal ?? 0)}</div>
              </div>
            </div>

            <div className={`${styles.statCard} ${styles.statSent}`}>
              <div className={styles.statIconWrap}>
                <ArrowUpRight size={18} color="#ef4444" />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Total P2P Sent</div>
                <div className={styles.statValue}>{formatAmount(totalSent)}</div>
              </div>
            </div>

            <div className={`${styles.statCard} ${styles.statReceived}`}>
              <div className={styles.statIconWrap}>
                <ArrowDownLeft size={18} color="var(--primary)" />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Total P2P Received</div>
                <div className={styles.statValue}>{formatAmount(totalReceived)}</div>
              </div>
            </div>

            <div className={`${styles.statCard} ${styles.statWithdrawn}`}>
              <div className={styles.statIconWrap}>
                <Building size={18} color="var(--primary)" />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Total Withdrawn</div>
                <div className={styles.statValue}>{formatAmount(totalWithdrawn)}</div>
              </div>
            </div>
          </div>

          <div className={styles.controlsBar}>
            <div className={styles.tabsContainer}>
              <button
                className={`${styles.tabBtn} ${activeTab === "payments" ? styles.activeTabBtn : ""}`}
                onClick={() => {
                  setActiveTab("payments");
                  setCurrentPage(1);
                }}
              >
                Payments & Transfers ({payments.length})
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === "withdrawals" ? styles.activeTabBtn : ""}`}
                onClick={() => {
                  setActiveTab("withdrawals");
                  setCurrentPage(1);
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

          <div className={styles.tableWrapper}>
            {activeTab === "payments" ? (
              filteredPayments.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>No Transactions Found</div>
                  <p>No payment or transfer records match your current filters.</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <table className={`${styles.table} ${styles.desktopTable}`}>
                    <thead>
                      <tr>
                        <th className={styles.th}>Date & Time</th>
                        <th className={styles.th}>Reference</th>
                        <th className={styles.th}>Type</th>
                        <th className={styles.th}>Description</th>
                        <th className={`${styles.th} ${styles.thAmount}`}>Amount</th>
                        <th className={styles.th}>Status</th>
                        <th className={styles.th}>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPayments.map((tx) => {
                        const isCredit = tx.type === "transfer_received";
                        return (
                          <tr key={tx.id} className={styles.row}>
                            <td className={styles.tdDate}>{formatDate(tx.created_at)}</td>
                            <td className={styles.tdRef}>
                              <span className={styles.refCode}>{tx.reference}</span>
                              <button
                                onClick={() => handleCopy(tx.reference)}
                                className={styles.copyBtn}
                                title="Copy Reference"
                              >
                                {copiedRef === tx.reference ? (
                                  <Check size={12} color="#4b5e38" />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            </td>
                            <td className={styles.td}>{getTypeBadge(tx.type)}</td>
                            <td className={styles.tdDesc}>{tx.description}</td>
                            <td className={`${styles.tdAmount} ${isCredit ? styles.amountCredit : styles.amountDebit}`}>
                              {isCredit ? `+ ${formatAmount(tx.amount)}` : `- ${formatAmount(tx.amount)}`}
                            </td>
                            <td className={styles.td}>{getStatusBadge(tx.status)}</td>
                            <td className={styles.td}>
                              <button
                                type="button"
                                onClick={() => setSelectedReceiptTx(tx)}
                                className={styles.receiptRowBtn}
                                title="Download or View Receipt"
                              >
                                <Download size={12} />
                                <span>Receipt</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Mobile Card List View (matches xea-mobile, no horizontal scroll) */}
                  <div className={styles.mobileCardList}>
                    {paginatedPayments.map((tx) => {
                      const isCredit = tx.type === "transfer_received";
                      return (
                        <div key={tx.id} className={styles.mobileCard}>
                          <div className={styles.mobileCardLeft}>
                            <div className={styles.mobileBadgeRow}>
                              <span className={styles.mobileTypeBadge}>{getTypeBadge(tx.type)}</span>
                              <span className={styles.mobileStatusBadge}>{getStatusBadge(tx.status)}</span>
                            </div>
                            <div className={styles.mobileDesc}>{tx.description}</div>
                            {tx.reference && (
                              <div className={styles.mobileRefRow}>
                                <span className={styles.mobileRefText}>Ref: {tx.reference}</span>
                                <button
                                  onClick={() => handleCopy(tx.reference)}
                                  className={styles.copyBtn}
                                  title="Copy Reference"
                                >
                                  {copiedRef === tx.reference ? (
                                    <Check size={12} color="#4b5e38" />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                </button>
                              </div>
                            )}
                            <div className={styles.mobileTime}>{formatDate(tx.created_at)}</div>
                          </div>
                          <div className={styles.mobileCardRight}>
                            <div className={`${styles.mobileAmount} ${isCredit ? styles.amountCredit : styles.amountDebit}`}>
                              {isCredit ? `+ ${formatAmount(tx.amount)}` : `- ${formatAmount(tx.amount)}`}
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptTx(tx)}
                              className={styles.mobileReceiptBtn}
                              title="Download Receipt"
                            >
                              <Download size={11} />
                              <span>Receipt</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )
            ) : filteredWithdrawals.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyTitle}>No Withdrawals Found</div>
                <p>No bank withdrawal records match your current filters.</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <table className={`${styles.table} ${styles.desktopTable}`}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Date & Time</th>
                      <th className={styles.th}>Reference</th>
                      <th className={styles.th}>Destination Account</th>
                      <th className={`${styles.th} ${styles.thAmount}`}>Amount</th>
                      <th className={styles.th}>Status</th>
                      <th className={styles.th}>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedWithdrawals.map((tx) => (
                      <tr key={tx.id} className={styles.row}>
                        <td className={styles.tdDate}>{formatDate(tx.created_at)}</td>
                        <td className={styles.tdRef}>
                          <span className={styles.refCode}>{tx.reference}</span>
                          <button
                            onClick={() => handleCopy(tx.reference)}
                            className={styles.copyBtn}
                            title="Copy Reference"
                          >
                            {copiedRef === tx.reference ? (
                              <Check size={12} color="#4b5e38" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </td>
                        <td className={styles.tdDesc}>{tx.description}</td>
                        <td className={`${styles.tdAmount} ${styles.amountDebit}`}>
                          - {formatAmount(tx.amount)}
                        </td>
                        <td className={styles.td}>{getStatusBadge(tx.status)}</td>
                        <td className={styles.td}>
                          <button
                            type="button"
                            onClick={() => setSelectedReceiptTx(tx)}
                            className={styles.receiptRowBtn}
                            title="Download or View Receipt"
                          >
                            <Download size={12} />
                            <span>Receipt</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile Card List View (matches xea-mobile, no horizontal scroll) */}
                <div className={styles.mobileCardList}>
                  {paginatedWithdrawals.map((tx) => (
                    <div key={tx.id} className={styles.mobileCard}>
                      <div className={styles.mobileCardLeft}>
                        <div className={styles.mobileBadgeRow}>
                          <span className={styles.mobileTypeBadge}>{getTypeBadge("withdrawal")}</span>
                          <span className={styles.mobileStatusBadge}>{getStatusBadge(tx.status)}</span>
                        </div>
                        <div className={styles.mobileDesc}>{tx.description}</div>
                        {tx.reference && (
                          <div className={styles.mobileRefRow}>
                            <span className={styles.mobileRefText}>Ref: {tx.reference}</span>
                            <button
                              onClick={() => handleCopy(tx.reference)}
                              className={styles.copyBtn}
                              title="Copy Reference"
                            >
                              {copiedRef === tx.reference ? (
                                <Check size={12} color="#4b5e38" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        )}
                        <div className={styles.mobileTime}>{formatDate(tx.created_at)}</div>
                      </div>
                      <div className={styles.mobileCardRight}>
                        <div className={`${styles.mobileAmount} ${styles.amountDebit}`}>
                          - {formatAmount(tx.amount)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedReceiptTx(tx)}
                          className={styles.mobileReceiptBtn}
                          title="Download Receipt"
                        >
                          <Download size={11} />
                          <span>Receipt</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Pagination Controls Bar */}
            {currentList.length > 0 && (
              <div className={styles.paginationBar}>
                <div className={styles.paginationInfo}>
                  Showing {startIndex + 1}–{endIndex} of {currentList.length} {activeTab === "payments" ? "transactions" : "withdrawals"}
                </div>
                <div className={styles.paginationControls}>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={validPage <= 1}
                    className={styles.pageBtn}
                    title="Previous Page"
                  >
                    ‹ Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - validPage) <= 2)
                    .map((p, idx, arr) => (
                      <React.Fragment key={p}>
                        {idx > 0 && arr[idx - 1] !== p - 1 && (
                          <span className={styles.pageEllipsis}>…</span>
                        )}
                        <button
                          onClick={() => setCurrentPage(p)}
                          className={`${styles.pageBtn} ${validPage === p ? styles.pageBtnActive : ""}`}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    ))}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={validPage >= totalPages}
                    className={styles.pageBtn}
                    title="Next Page"
                  >
                    Next ›
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Transaction Receipt Modal */}
      {selectedReceiptTx && (
        <TransactionReceiptModal
          transaction={selectedReceiptTx}
          onClose={() => setSelectedReceiptTx(null)}
          currentUserEmail={profile?.email}
          currentUserName={profile?.firstName ? `${profile.firstName} ${profile.lastName || ""}`.trim() : undefined}
        />
      )}
    </main>
  );
}
