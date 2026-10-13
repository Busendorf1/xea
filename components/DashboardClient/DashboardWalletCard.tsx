"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, Send } from "lucide-react";
import RollingCounter from "@/components/ui/RollingCounter";
import { UserProfile } from "./types";
import styles from "./page.module.css";

interface DashboardWalletCardProps {
  user: UserProfile;
  showBalance: boolean;
  onToggleShowBalance: () => void;
  formatCurrency: (amount: number | string) => string;
  onOpenWithdrawModal: () => void;
  onOpenSendMoneyModal: () => void;
  onSelectTab: (tab: string) => void;
}

export default function DashboardWalletCard({
  user,
  showBalance,
  onToggleShowBalance,
  formatCurrency,
  onOpenWithdrawModal,
  onOpenSendMoneyModal,
  onSelectTab,
}: DashboardWalletCardProps) {
  const isMonetized = Boolean(
    user.monetized === "yes" ||
      user.monetized === "true" ||
      user.monetized === true ||
      (user.monetization_clicks ?? 0) >= 300
  );

  return (
    <div className={styles.walletCard}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.25rem",
        }}
      >
        <h4 className={styles.walletHeader} style={{ margin: 0 }}>
          Wallet Balance
        </h4>
        <button
          type="button"
          onClick={onToggleShowBalance}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "4px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "6px",
          }}
          title={showBalance ? "Hide balance" : "Show balance"}
          aria-label={showBalance ? "Hide balance" : "Show balance"}
        >
          {showBalance ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      <div className={styles.walletBalance}>
        {showBalance ? (
          <RollingCounter value={user.balance ?? 0} currencyPrefix="₦" />
        ) : (
          <span style={{ letterSpacing: "2px", fontWeight: 700 }}>₦••••••••</span>
        )}
      </div>

      {user.withdrawal > 0 && (
        <p className={styles.pendingWithdrawal}>
          Pending Withdrawal: {showBalance ? formatCurrency(user.withdrawal) : "₦••••"}
        </p>
      )}

      <div className={styles.walletBtnGroup}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onOpenWithdrawModal}
          className={styles.withdrawBtn}
          disabled={!isMonetized || (user.balance ?? 0) < 10000}
        >
          {!isMonetized
            ? "Complete 300 clicks to withdraw earnings"
            : (user.balance ?? 0) < 10000
            ? `Min. ${formatCurrency(10000)} required to withdraw`
            : "Request Withdrawal"}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onOpenSendMoneyModal}
          className={styles.sendMoneyBtn}
          title="Send Money to User Email"
          type="button"
        >
          <Send size={15} />
          <span>Send Money</span>
        </motion.button>
      </div>

      <Link href="/logged-in" onClick={() => onSelectTab("statement")} className={styles.statementLink}>
        View Account Statement
      </Link>
    </div>
  );
}
