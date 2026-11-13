import React from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  CreditCard,
  Building,
} from "lucide-react";
import styles from "./page.module.css";

export interface StatementTransaction {
  id: string;
  reference: string;
  amount: number;
  status: string;
  type: string;
  description: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export type CategoryFilter =
  | "all"
  | "pending_withdrawal"
  | "transfer_sent"
  | "transfer_received"
  | "withdrawn";

export const CREDIT_TRANSACTION_TYPES = new Set([
  "transfer_received",
  "refund",
  "campaign_refund",
  "wallet_credit",
  "earning",
]);

export function isStatementCredit(type?: string): boolean {
  return CREDIT_TRANSACTION_TYPES.has(String(type || "").toLowerCase());
}

export function readStatementCache(): {
  profile: any | null;
  payments: StatementTransaction[];
  withdrawals: StatementTransaction[];
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

export function escapeStatementCsvCell(value: unknown): string {
  const str = String(value ?? "");
  const trimmedStart = str.replace(/^[\s\u00A0]+/, "");
  const neutralized = /^[=+\-@\t\r]/.test(trimmedStart) ? `'${str}` : str;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function formatStatementAmount(amt: number | string): string {
  const parsed = typeof amt === "string" ? parseFloat(amt) : amt;
  return isNaN(parsed)
    ? "₦0.00"
    : "₦" + parsed.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatStatementDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function getStatementStatusBadge(status: string): React.ReactNode {
  const s = (status || "").toLowerCase();
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
}

export function getStatementTypeBadge(type: string): React.ReactNode {
  const t = (type || "").toLowerCase();
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
  if (t === "ad" || t === "publish_ad") {
    return (
      <span className={`${styles.typeBadge} ${styles.typeAd}`}>
        <TrendingUp size={13} />
        Ad Campaign
      </span>
    );
  }
  if (t === "highlight" || t === "publish_highlight") {
    return (
      <span className={`${styles.typeBadge} ${styles.typeHighlight}`}>
        <CreditCard size={13} />
        Highlight
      </span>
    );
  }
  return <span className={styles.typeBadge}>{String(type || "").replace("_", " ")}</span>;
}
