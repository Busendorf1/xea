"use client";

import React from "react";
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
} from "lucide-react";
import styles from "./page.module.css";

export interface AdminReconciliationEmergencyHeaderProps {
  reconciliationData: {
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
  } | null;
  reconciliationLoading: boolean;
  reconciliationActionLoading: boolean;
  reversalLoading: boolean;
  handleToggleEmergencyPause: () => void;
  fetchReconciliationData: (fresh?: boolean) => void;
  onOpenReverseModal: () => void;
  showAdminBalance: boolean;
  toggleAdminBalance: () => void;
}

export function AdminReconciliationEmergencyHeader({
  reconciliationData,
  reconciliationLoading,
  reconciliationActionLoading,
  reversalLoading,
  handleToggleEmergencyPause,
  fetchReconciliationData,
  onOpenReverseModal,
  showAdminBalance,
  toggleAdminBalance,
}: AdminReconciliationEmergencyHeaderProps) {
  const isPaused = Boolean(reconciliationData?.transfersPaused);
  const isActionDisabled = reconciliationActionLoading || reconciliationLoading;
  const isScanDisabled = reconciliationLoading || reconciliationActionLoading;
  const isReverseDisabled = reconciliationLoading || reconciliationActionLoading || reversalLoading;

  return (
    <>
      {/* Emergency Control Bar & Action Buttons */}
      <div className={`${styles.emergencyBar} ${isPaused ? styles.emergencyBarPaused : ""}`}>
        <div>
          <h3 className={`${styles.emergencyTitle} ${isPaused ? styles.emergencyTitlePaused : ""}`}>
            {isPaused ? (
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
            {isPaused
              ? "P2P transfer processing is currently frozen to contain financial variance."
              : "System double-entry ledger is operating normally without balance drift."}
          </p>
        </div>

        <div className={styles.adminCls_105}>
          <button
            type="button"
            onClick={handleToggleEmergencyPause}
            disabled={isActionDisabled}
            className={`${styles.btnAction} ${styles.emergencyBtn} ${isPaused ? styles.emergencyBtnPaused : ""} ${isActionDisabled ? styles.btnDisabled : ""}`}
          >
            {reconciliationActionLoading ? (
              <>
                <RefreshCw size={15} className={styles.spin} />
                <span>{isPaused ? "Unpausing Transfers..." : "Pausing Transfers..."}</span>
              </>
            ) : isPaused ? (
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
            disabled={isScanDisabled}
            className={`${styles.btnAction} ${styles.scanBtn} ${isScanDisabled ? styles.btnDisabled : ""}`}
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
            onClick={onOpenReverseModal}
            disabled={isReverseDisabled}
            className={`${styles.btnAction} ${styles.reverseBtn} ${isReverseDisabled ? styles.btnDisabled : ""}`}
          >
            <RefreshCw size={15} />
            <span>Reverse a Transfer</span>
          </button>
        </div>
      </div>

      {/* Health Metrics Grid */}
      <div className={`${styles.statsGrid} ${styles.adminCls_107}`}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Ledger Audit Status</span>
          <div
            className={`${styles.ledgerStatusDisplay} ${
              reconciliationData?.metrics?.status === "HEALTHY" ? styles.ledgerHealthy : styles.ledgerFlagged
            }`}
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
          <div
            className={styles.statValue}
            style={{ color: reconciliationData?.metrics?.variance_naira === 0 ? "#10b981" : "#ef4444" }}
          >
            ₦{(reconciliationData?.metrics?.variance_naira || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className={styles.statCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className={styles.statLabel}>Platform Treasury Balance</span>
            <button
              type="button"
              onClick={toggleAdminBalance}
              className={styles.hideBalanceBtn}
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
          <div
            className={styles.statValue}
            style={{ color: (reconciliationData?.pendingForfeituresCount || 0) > 0 ? "#f59e0b" : "var(--foreground)" }}
          >
            ₦{(reconciliationData?.pendingForfeituresTotal || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
          </div>
          <span
            className={`${styles.pendingForfeituresText} ${
              (reconciliationData?.pendingForfeituresCount || 0) > 0
                ? styles.pendingForfeituresTextActive
                : styles.pendingForfeituresTextMuted
            }`}
          >
            {reconciliationData?.pendingForfeituresCount || 0} deactivated account(s) pending
          </span>
        </div>
      </div>
    </>
  );
}

export default AdminReconciliationEmergencyHeader;
