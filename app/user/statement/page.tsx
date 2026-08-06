"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
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
  Coins,
  Download
} from "lucide-react";
import Header from "@/components/Header/page";
import Footer from "@/components/Footer/page";
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

export default function StatementPage() {
  const [profile, setProfile] = useState<any>(null);
  const [payments, setPayments] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"payments" | "withdrawals">("payments");
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  const fetchData = async (isRefresh = false) => {
    try {
      const refreshParam = isRefresh ? "?refresh=true" : "";
      const [profileRes, paymentsRes, withdrawalsRes] = await Promise.all([
        fetch("/api/profile"),
        fetch(`/api/payments/history${refreshParam}`),
        fetch(`/api/withdrawals/history${refreshParam}`),
      ]);

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile(profileData);
      }

      if (paymentsRes.ok) {
        const paymentsData = await paymentsRes.json();
        setPayments(paymentsData);
      }

      if (withdrawalsRes.ok) {
        const withdrawalsData = await withdrawalsRes.json();
        setWithdrawals(withdrawalsData);
      }
    } catch (err) {
      console.error("❌ Error fetching statement data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
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
      alert("No statement records available to download.");
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

  // Filter transactions
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

  // Totals calculations
  const totalSpent = payments
    .filter((p) => p.status.toLowerCase() === "success" && p.type !== "transfer_received" && p.type !== "transfer_sent")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

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

  return (
    <>
      <Header />
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
            <Link href="/user/dashboard" className={styles.backBtn}>
              <ArrowLeft size={15} />
              <span>Dashboard</span>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingWrapper}>
            <div className={styles.loadingSpinner} />
            <p>Loading your statement history...</p>
          </div>
        ) : (
          <>
            {/* Stats Summary Grid */}
            <div className={styles.statsGrid}>
              <div className={`${styles.statCard} ${styles.statBalance}`}>
                <div className={styles.statIconWrap}>
                  <Wallet size={18} color="#10b981" />
                </div>
                <div className={styles.statContent}>
                  <div className={styles.statLabel}>Available Balance</div>
                  <div className={styles.statValue}>{formatAmount(profile?.balance ?? 0)}</div>
                </div>
              </div>

              <div className={`${styles.statCard} ${styles.statWithdraw}`}>
                <div className={styles.statIconWrap}>
                  <Clock size={18} color="#3b82f6" />
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
                  <ArrowDownLeft size={18} color="#6366f1" />
                </div>
                <div className={styles.statContent}>
                  <div className={styles.statLabel}>Total P2P Received</div>
                  <div className={styles.statValue}>{formatAmount(totalReceived)}</div>
                </div>
              </div>

              <div className={`${styles.statCard} ${styles.statWithdrawn}`}>
                <div className={styles.statIconWrap}>
                  <Building size={18} color="#f59e0b" />
                </div>
                <div className={styles.statContent}>
                  <div className={styles.statLabel}>Total Withdrawn</div>
                  <div className={styles.statValue}>{formatAmount(totalWithdrawn)}</div>
                </div>
              </div>
            </div>

            {/* Controls Bar: Tabs & Search Filter */}
            <div className={styles.controlsBar}>
              <div className={styles.tabsContainer}>
                <button
                  className={`${styles.tabBtn} ${activeTab === "payments" ? styles.activeTabBtn : ""}`}
                  onClick={() => setActiveTab("payments")}
                >
                  Payments & Transfers ({payments.length})
                </button>
                <button
                  className={`${styles.tabBtn} ${activeTab === "withdrawals" ? styles.activeTabBtn : ""}`}
                  onClick={() => setActiveTab("withdrawals")}
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
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>

                <div className={styles.selectWrapper}>
                  <Filter size={14} className={styles.filterIcon} />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
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

            {/* History Table */}
            <div className={styles.tableWrapper}>
              {activeTab === "payments" ? (
                filteredPayments.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No Transactions Found</div>
                    <p>No payment or transfer records match your current filters.</p>
                  </div>
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>Date & Time</th>
                        <th className={styles.th}>Reference</th>
                        <th className={styles.th}>Type</th>
                        <th className={styles.th}>Description</th>
                        <th className={styles.th}>Amount</th>
                        <th className={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map((tx) => {
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
                                  <Check size={12} color="#10b981" />
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
                )
              ) : filteredWithdrawals.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>No Withdrawals Found</div>
                  <p>No bank withdrawal records match your current filters.</p>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Date & Time</th>
                      <th className={styles.th}>Reference</th>
                      <th className={styles.th}>Destination Account</th>
                      <th className={styles.th}>Amount</th>
                      <th className={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWithdrawals.map((tx) => (
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
                              <Check size={12} color="#10b981" />
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
              )}
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
