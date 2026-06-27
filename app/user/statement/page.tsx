// app/user/statement/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
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

  const fetchData = async () => {
    try {
      // Fetch profile, payments, and withdrawals
      const [profileRes, paymentsRes, withdrawalsRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/payments/history"),
        fetch("/api/withdrawals/history"),
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
    fetchData();
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

  const getStatusClass = (status: string) => {
    switch (status.toLowerCase()) {
      case "success":
        return `${styles.status} ${styles.statusSuccess}`;
      case "pending":
        return `${styles.status} ${styles.statusPending}`;
      case "failed":
        return `${styles.status} ${styles.statusFailed}`;
      case "reversed":
        return `${styles.status} ${styles.statusReversed}`;
      default:
        return styles.status;
    }
  };

  // Calculate totals
  const totalSpent = payments
    .filter((p) => p.status.toLowerCase() === "success")
    .reduce((sum, p) => sum + parseFloat(p.amount as any), 0);

  const totalWithdrawn = withdrawals
    .filter((w) => w.status.toLowerCase() === "success")
    .reduce((sum, w) => sum + parseFloat(w.amount as any), 0);

  return (
    <>
      <Header />
      <main className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Account Statement</h1>
            <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
              Detailed statement of your payments, ad campaigns, and withdrawals.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={styles.backBtn}
              style={{ cursor: "pointer" }}
              title="Refresh Statement Data"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <Link href="/user/dashboard" className={styles.backBtn}>
              <ArrowLeft size={16} />
              Back to Dashboard
            </Link>
          </div>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
            <p style={{ color: "var(--text-muted)" }}>Loading statement history...</p>
          </div>
        ) : (
          <>
            {/* Stats Summary Cards */}
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Available Balance</div>
                <div className={styles.statValue} style={{ color: "#10b981" }}>
                  {formatAmount(profile?.balance ?? 0)}
                </div>
              </div>
              <div className={`${styles.statCard} ${styles.withdraw}`}>
                <div className={styles.statLabel}>Pending Withdrawals</div>
                <div className={styles.statValue} style={{ color: "#3b82f6" }}>
                  {formatAmount(profile?.withdrawal ?? 0)}
                </div>
              </div>
              <div className={`${styles.statCard} ${styles.spent}`}>
                <div className={styles.statLabel}>Total Paid (Ads/Monetization)</div>
                <div className={styles.statValue}>
                  {formatAmount(totalSpent)}
                </div>
              </div>
              <div className={`${styles.statCard} ${styles.withdrawn}`}>
                <div className={styles.statLabel}>Total Withdrawn</div>
                <div className={styles.statValue}>
                  {formatAmount(totalWithdrawn)}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className={styles.tabsContainer}>
              <button
                className={`${styles.tabBtn} ${activeTab === "payments" ? styles.activeTabBtn : ""}`}
                onClick={() => setActiveTab("payments")}
              >
                Payments & Ads ({payments.length})
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === "withdrawals" ? styles.activeTabBtn : ""}`}
                onClick={() => setActiveTab("withdrawals")}
              >
                Withdrawals ({withdrawals.length})
              </button>
            </div>

            {/* History Table */}
            <div className={styles.tableWrapper}>
              {activeTab === "payments" ? (
                payments.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No Payments Found</div>
                    <p>You have not made any payments for Ads, Highlights, or Monetization yet.</p>
                  </div>
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>Date</th>
                        <th className={styles.th}>Reference</th>
                        <th className={styles.th}>Type</th>
                        <th className={styles.th}>Description</th>
                        <th className={styles.th}>Amount</th>
                        <th className={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((tx) => (
                        <tr key={tx.id} className={styles.row}>
                          <td className={styles.td}>{formatDate(tx.created_at)}</td>
                          <td className={styles.td} style={{ fontFamily: "monospace" }}>
                            {tx.reference}
                          </td>
                          <td className={styles.td} style={{ textTransform: "capitalize" }}>
                            {tx.type.replace("_", " ")}
                          </td>
                          <td className={styles.td}>{tx.description}</td>
                          <td className={styles.td} style={{ fontWeight: "700" }}>
                            {formatAmount(tx.amount)}
                          </td>
                          <td className={styles.td}>
                            <span className={getStatusClass(tx.status)}>{tx.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : withdrawals.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>No Withdrawals Found</div>
                  <p>You have not initiated any bank account withdrawals yet.</p>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Date</th>
                      <th className={styles.th}>Reference</th>
                      <th className={styles.th}>Description</th>
                      <th className={styles.th}>Amount</th>
                      <th className={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map((tx) => (
                      <tr key={tx.id} className={styles.row}>
                        <td className={styles.td}>{formatDate(tx.created_at)}</td>
                        <td className={styles.td} style={{ fontFamily: "monospace" }}>
                          {tx.reference}
                        </td>
                        <td className={styles.td}>{tx.description}</td>
                        <td className={styles.td} style={{ fontWeight: "700", color: "#ef4444" }}>
                          - {formatAmount(tx.amount)}
                        </td>
                        <td className={styles.td}>
                          <span className={getStatusClass(tx.status)}>{tx.status}</span>
                        </td>
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
