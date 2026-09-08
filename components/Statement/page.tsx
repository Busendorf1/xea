"use client";

import React, { useState, useEffect } from "react";
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
  Download
} from "lucide-react";
import styles from "./page.module.css";

interface Transaction {
  id: string;
  reference: string;
  amount: number;
  status: string;
  type: string;
  description: string;
  created_at: string;
}

export default function StatementComponent() {
  const [profile, setProfile] = useState<any>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_statement_cache");
        if (cached) return JSON.parse(cached).profile || null;
      } catch {}
    }
    return null;
  });
  const [payments, setPayments] = useState<Transaction[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_statement_cache");
        if (cached) return JSON.parse(cached).payments || [];
      } catch {}
    }
    return [];
  });
  const [withdrawals, setWithdrawals] = useState<Transaction[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_statement_cache");
        if (cached) return JSON.parse(cached).withdrawals || [];
      } catch {}
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_statement_cache");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.payments || parsed.withdrawals) return false;
        }
      } catch {}
    }
    return true;
  });
  const [activeTab, setActiveTab] = useState<"payments" | "withdrawals">("payments");
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const fetchData = async (isRefresh = false) => {
    try {
      const refreshParam = isRefresh ? "?refresh=true" : "";
      const [profileRes, paymentsRes, withdrawalsRes] = await Promise.all([
        fetch("/api/profile"),
        fetch(`/api/payments/history${refreshParam}`),
        fetch(`/api/withdrawals/history${refreshParam}`),
      ]);

      let newProfile = profile;
      let newPayments = payments;
      let newWithdrawals = withdrawals;

      if (profileRes.ok) {
        newProfile = await profileRes.json();
        setProfile(newProfile);
      }

      if (paymentsRes.ok) {
        newPayments = await paymentsRes.json();
        setPayments(newPayments);
      }

      if (withdrawalsRes.ok) {
        newWithdrawals = await withdrawalsRes.json();
        setWithdrawals(newWithdrawals);
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
    try {
      const cached = sessionStorage.getItem("paayh_statement_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.profile) setProfile(parsed.profile);
        if (parsed.payments) setPayments(parsed.payments);
        if (parsed.withdrawals) setWithdrawals(parsed.withdrawals);
        setLoading(false);
      }
    } catch {}

    fetchData();
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

  const filterList = (list: Transaction[]) => {
    return list.filter((tx) => {
      const matchesSearch =
        tx.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.type || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus =
        statusFilter === "all" || tx.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  };

  const totalSent = payments
    .filter((p) => p.status.toLowerCase() === "success" && p.type === "transfer_sent")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const totalReceived = payments
    .filter((p) => p.status.toLowerCase() === "success" && p.type === "transfer_received")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const totalWithdrawn = withdrawals
    .filter((w) => w.status.toLowerCase() === "success")
    .reduce((sum, w) => sum + Number(w.amount || 0), 0);

  const filteredPayments = filterList(payments);
  const filteredWithdrawals = filterList(withdrawals);

  // Pagination calculation
  const currentList = activeTab === "payments" ? filteredPayments : filteredWithdrawals;
  const totalPages = Math.max(1, Math.ceil(currentList.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, currentList.length);
  const paginatedPayments = filteredPayments.slice(startIndex, startIndex + pageSize);
  const paginatedWithdrawals = filteredWithdrawals.slice(startIndex, startIndex + pageSize);

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
                <Wallet size={18} color="#4b5e38" />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Available Balance</div>
                <div className={styles.statValue}>{formatAmount(profile?.balance ?? 0)}</div>
              </div>
            </div>

            <div className={`${styles.statCard} ${styles.statWithdraw}`}>
              <div className={styles.statIconWrap}>
                <Clock size={18} color="#2563eb" />
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
                <ArrowDownLeft size={18} color="#4b5e38" />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Total P2P Received</div>
                <div className={styles.statValue}>{formatAmount(totalReceived)}</div>
              </div>
            </div>

            <div className={`${styles.statCard} ${styles.statWithdrawn}`}>
              <div className={styles.statIconWrap}>
                <Building size={18} color="#4b5e38" />
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
                          <span style={{ color: "var(--text-muted)", padding: "0 2px" }}>…</span>
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
    </main>
  );
}
