"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Download,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  AlertCircle,
  RotateCcw,
  Building2,
  User,
  CreditCard,
  Calendar,
  Tag,
  ArrowDownLeft,
  ArrowUpRight
} from "lucide-react";
import styles from "./TransactionReceiptModal.module.css";
import {
  openPrintableReceiptWindow,
  PrintableReceiptRow,
  resolveWithdrawalCharge,
} from "./receiptPrintBuilder";

export interface ReceiptTransaction {
  id?: string;
  reference: string;
  amount: number | string;
  status: string;
  type: string;
  description?: string;
  metadata?: Record<string, any>;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

interface TransactionReceiptModalProps {
  transaction: ReceiptTransaction | null;
  onClose: () => void;
  currentUserEmail?: string;
  currentUserName?: string;
}

export default function TransactionReceiptModal({
  transaction,
  onClose,
  currentUserEmail,
  currentUserName,
}: TransactionReceiptModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!transaction) return null;

  const rawAmount = typeof transaction.amount === "number"
    ? transaction.amount
    : parseFloat(transaction.amount || "0");

  const meta = transaction.metadata || {};
  const isCredit = transaction.type === "transfer_received" || transaction.type === "funding";
  const isWithdrawal = transaction.type === "withdrawal";

  // Fee / Charge & Discount extraction (dynamic gateway-aware resolution, no hardcoded ₦35)
  const charge = resolveWithdrawalCharge(rawAmount, meta, isWithdrawal);

  const discount = typeof meta.discount === "number"
    ? meta.discount
    : (meta.discount ? parseFloat(meta.discount) : 0);

  const netAmount = meta.net_amount
    ? parseFloat(meta.net_amount)
    : (isWithdrawal ? Math.max(0, rawAmount - charge) : (rawAmount - discount));

  const formatNaira = (val: number) => {
    return `₦${Number(val || 0).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formattedDateTime = (() => {
    try {
      const d = new Date(transaction.created_at);
      if (isNaN(d.getTime())) return transaction.created_at || "—";
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(d);
    } catch {
      return transaction.created_at || "—";
    }
  })();

  const handleCopyRef = () => {
    if (!transaction.reference) return;
    navigator.clipboard.writeText(transaction.reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Human friendly type label
  const getTypeLabel = (type: string) => {
    switch (type) {
      case "transfer_received":
        return "In-App Transfer (Credit)";
      case "transfer_sent":
        return "In-App Transfer (Debit)";
      case "funding":
      case "deposit":
        return "Wallet Funding";
      case "withdrawal":
        return "Bank Withdrawal / Payout";
      case "ad":
      case "ad_payment":
        return "Ad Campaign Budget";
      case "highlight":
      case "highlight_payment":
        return "Daily Highlight Promotion";
      case "subscription":
      case "brand_subscription":
        return "Brand Subscription";
      default:
        return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s === "success" || s === "completed") {
      return (
        <span className={`${styles.statusBadge} ${styles.statusSuccess}`}>
          <CheckCircle2 size={13} /> Completed
        </span>
      );
    }
    if (s === "queued") {
      return (
        <span className={`${styles.statusBadge} ${styles.statusPending}`}>
          <Clock size={13} /> Queued (Scheduled Window)
        </span>
      );
    }
    if (s === "pending" || s === "processing") {
      return (
        <span className={`${styles.statusBadge} ${styles.statusPending}`}>
          <Clock size={13} /> Processing
        </span>
      );
    }
    if (s === "reversed") {
      return (
        <span className={`${styles.statusBadge} ${styles.statusReversed}`}>
          <RotateCcw size={13} /> Reversed (Balance Refunded)
        </span>
      );
    }
    return (
      <span className={`${styles.statusBadge} ${styles.statusFailed}`}>
        <AlertCircle size={13} /> {isWithdrawal ? "Failed (Balance Refunded)" : "Failed"}
      </span>
    );
  };

  // Mask middle digits of bank account numbers on receipts (e.g. 0123456789 -> 012****789)
  const maskAccountNumber = (acct?: string | null): string => {
    if (!acct) return "";
    const trimmed = String(acct).trim();
    if (trimmed.length <= 6) return trimmed;
    const prefix = trimmed.slice(0, 3);
    const suffix = trimmed.slice(-3);
    const stars = "*".repeat(Math.max(4, trimmed.length - 6));
    return `${prefix}${stars}${suffix}`;
  };

  const maskAccountNumbersInText = (text?: string | null): string => {
    if (!text) return "";
    return String(text).replace(/\b(\d{3})\d{4,6}(\d{3})\b/g, "$1****$2");
  };

  // Destination / Recipient info
  const destinationBank = meta.bankName || meta.bank_name;
  const rawDestinationAccount = meta.accountNumber || meta.account_number;
  const destinationAccount = maskAccountNumber(rawDestinationAccount);
  const destinationName = meta.accountName || meta.account_name || meta.recipientName;
  const isTransferReceived = transaction.type === "transfer_received";
  const isTransferSent = transaction.type === "transfer_sent";
  const isPeerTransfer = isTransferReceived || isTransferSent || transaction.type === "transfer";

  const formatPrivacyUsername = (val?: string): string => {
    if (!val) return "";
    const trimmed = String(val).trim();
    if (trimmed.toLowerCase() === "recipient") return "";
    if (trimmed.includes("@")) {
      const handle = trimmed.split("@")[0]?.trim();
      return handle ? `@${handle}` : "";
    }
    return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
  };

  const extractHandleFromText = (text?: string): string => {
    if (!text) return "";
    const atMatch = text.match(/@([a-zA-Z0-9_.-]+)/);
    if (atMatch && atMatch[1]) return `@${atMatch[1]}`;
    const toEmailMatch = text.match(/to\s+([a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+)/i);
    if (toEmailMatch && toEmailMatch[1]) return formatPrivacyUsername(toEmailMatch[1]);
    const toUserMatch = text.match(/to\s+([a-zA-Z0-9_.-]+)/i);
    if (toUserMatch && toUserMatch[1] && !["the", "our", "bank", "wallet", "recipient"].includes(toUserMatch[1].toLowerCase())) {
      return formatPrivacyUsername(toUserMatch[1]);
    }
    return "";
  };

  const recipientUsernameRaw = isTransferReceived
    ? (formatPrivacyUsername((transaction as any).user_username || currentUserName || transaction.user_email || currentUserEmail))
    : (formatPrivacyUsername(
        meta.recipient_username ||
        meta.recipientUsername ||
        meta.counterparty_username ||
        (transaction as any).recipient_username ||
        (transaction as any).recipientUsername ||
        extractHandleFromText(transaction.description) ||
        meta.recipientEmail ||
        meta.recipient_email ||
        meta.counterparty_email ||
        (transaction as any).recipientEmail
      ) || (destinationName && !isWithdrawal ? destinationName : ""));

  const recipientUsername = (recipientUsernameRaw && recipientUsernameRaw.toLowerCase() !== "recipient")
    ? recipientUsernameRaw
    : (isPeerTransfer ? "Paayh User" : "");

  const payerUsername = isTransferReceived
    ? (formatPrivacyUsername(meta.sender_username || meta.senderUsername || meta.counterparty_username || extractHandleFromText(transaction.description) || meta.sender_email || meta.senderEmail || meta.counterparty_email) || "Paayh User")
    : (formatPrivacyUsername((transaction as any).user_username || currentUserName || transaction.user_email || currentUserEmail) || "Account Holder");

  // Payment purpose / narration (with any embedded bank account number masked)
  const rawPurpose = transaction.description || meta.purpose || getTypeLabel(transaction.type);
  const purpose = isWithdrawal ? maskAccountNumbersInText(rawPurpose) : rawPurpose;

  const handlePrint = () => {
    const printContent = document.getElementById("paayh-receipt-voucher");
    if (!printContent) {
      window.print();
      return;
    }

    const s = (transaction.status || "").toLowerCase();
    const statusTone =
      s === "success" || s === "completed"
        ? "success"
        : s === "pending" || s === "processing" || s === "queued"
          ? "pending"
          : s === "reversed"
            ? "reversed"
            : "failed";

    const rows: PrintableReceiptRow[] = [
      { label: "Payment For", value: purpose },
      { label: "Transaction Type", value: getTypeLabel(transaction.type) },
      { label: "Reference", value: transaction.reference, monospace: true },
      { label: "Timestamp", value: formattedDateTime },
      { label: "Paid By", value: payerUsername },
    ];

    if (destinationBank) rows.push({ label: "Destination Bank", value: String(destinationBank) });
    if (destinationAccount) rows.push({ label: "Account Number", value: destinationAccount });
    if (destinationName) rows.push({ label: "Beneficiary Name", value: String(destinationName) });
    if (recipientUsername && recipientUsername !== destinationName) {
      rows.push({ label: "Recipient", value: recipientUsername });
    }
    if (charge > 0) rows.push({ label: "Withdrawal Charge", value: formatNaira(charge) });
    if (discount > 0) rows.push({ label: "Discount", value: `-${formatNaira(discount)}` });
    if (charge > 0 || discount > 0) {
      rows.push({ label: "Net Amount", value: formatNaira(netAmount), highlight: true });
    }

    const opened = openPrintableReceiptWindow({
      reference: transaction.reference || "tx",
      isCredit,
      formattedAmount: formatNaira(rawAmount),
      statusText: transaction.status || "Unknown",
      statusTone,
      rows,
    });

    if (!opened) {
      window.print();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Transaction Receipt"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className={styles.closeBtn}
          title="Close Receipt"
          aria-label="Close Receipt"
        >
          <X size={18} />
        </button>

        {/* Printable Receipt Card Body */}
        <div id="paayh-receipt-voucher" className={styles.receiptCard}>
          {/* Top Brand Header */}
          <div className={styles.receiptHeader}>
            <div className={styles.brandBox}>
              <span className={styles.brandLogo}>Paayh</span>
              {/* <span className={styles.brandSub}>Payment Receipt</span> */}
            </div>
            <div className={styles.headerRight}>
              {/* <div className={styles.disclaimerText}>To whom it may please.</div> */}
              <div className={styles.receiptLabel}>Transaction Receipt</div>
            </div>
          </div>

          {/* Amount Display */}
          <div className={styles.amountBox}>
            <span className={styles.amountLabel}>
              {isCredit ? "Amount Credited" : "Amount Paid / Transferred"}
            </span>
            <div className={styles.amountFigure}>
              <span className={isCredit ? styles.creditSign : styles.debitSign}>
                {isCredit ? "+ " : "- "}
              </span>
              {formatNaira(rawAmount)}
            </div>
          </div>

          {/* Status Badge Line */}
          <div className={styles.statusRow}>
            <span className={styles.statusRowLabel}>Transaction Status</span>
            {getStatusBadge(transaction.status)}
          </div>

          {/* Key-Value Details */}
          <div className={styles.detailsList}>
            {/* What payment was made for */}
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Payment For</span>
              <span className={styles.detailValue} title={purpose}>
                {purpose}
              </span>
            </div>

            {/* Type */}
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Transaction Type</span>
              <span className={styles.detailValue}>
                {getTypeLabel(transaction.type)}
              </span>
            </div>

            {/* Timestamp */}
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Timestamp</span>
              <span className={styles.detailValue}>
                {formattedDateTime}
              </span>
            </div>

            {/* Reference */}
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Reference</span>
              <div className={styles.refValBox}>
                <span className={styles.refText}>{transaction.reference}</span>
                <button
                  type="button"
                  onClick={handleCopyRef}
                  className={styles.copyBtn}
                  title="Copy Reference"
                >
                  {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                </button>
              </div>
            </div>

            {/* Payer Account */}
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Paid By</span>
              <span className={styles.detailValue}>{payerUsername}</span>
            </div>

            {/* Destination Bank / Account (if withdrawal) */}
            {destinationBank && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Destination Bank</span>
                <span className={styles.detailValue}>
                  <Building2 size={13} className={styles.inlineIcon} />
                  {destinationBank}
                </span>
              </div>
            )}

            {destinationAccount && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Account Number</span>
                <span className={styles.detailValue}>{destinationAccount}</span>
              </div>
            )}

            {destinationName && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Beneficiary Name</span>
                <span className={styles.detailValue}>{destinationName}</span>
              </div>
            )}

            {recipientUsername && recipientUsername !== destinationName && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Recipient</span>
                <span className={styles.detailValue}>{recipientUsername}</span>
              </div>
            )}

            {/* Withdrawal Charge */}
            {charge > 0 && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Withdrawal Charge</span>
                <span className={`${styles.detailValue} ${styles.chargeValue}`}>
                  {formatNaira(charge)}
                </span>
              </div>
            )}

            {/* Discount */}
            {discount > 0 && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Discount</span>
                <span className={`${styles.detailValue} ${styles.discountValue}`}>
                  -{formatNaira(discount)}
                </span>
              </div>
            )}

            {/* Net Settled Amount if fee or discount present */}
            {(charge > 0 || discount > 0) && (
              <div className={`${styles.detailRow} ${styles.netRow}`}>
                <span className={styles.netLabel}>Net Settled Amount</span>
                <span className={styles.netValue}>{formatNaira(netAmount)}</span>
              </div>
            )}

            {/* Gateway / Batch Reference for Audit Tracking */}
            {(meta.gateway_reference || meta.batchReference || meta.transfer_code) && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Gateway Ref</span>
                <span className={styles.detailValue}>
                  {meta.gateway_reference || meta.batchReference || meta.transfer_code}
                </span>
              </div>
            )}

            {/* Queue Window / Refund Protection Note */}
            {transaction.status?.toLowerCase() === "queued" && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Queue Status</span>
                <span className={styles.detailValue}>
                  {meta.queued_reason || "Queued for next scheduled batch disbursement"}
                </span>
              </div>
            )}

            {isWithdrawal && (transaction.status?.toLowerCase() === "failed" || transaction.status?.toLowerCase() === "reversed") && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Refund Protection</span>
                <span className={styles.detailValue} style={{ color: "#10b981", fontWeight: 600 }}>
                  {formatNaira(rawAmount)} Restored to Wallet
                </span>
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className={styles.receiptFooter}>
            <span className={styles.footerRef}>Paayh</span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className={styles.actionRow}>
          <button
            type="button"
            onClick={handlePrint}
            className={styles.downloadActionBtn}
            title="Download or Print Receipt as PDF"
          >
            <Download size={15} />
            <span>Download Receipt (PDF)</span>
          </button>

          <button
            type="button"
            onClick={handleCopyRef}
            className={styles.copyActionBtn}
            title="Copy Transaction Reference"
          >
            {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            <span>{copied ? "Copied Reference" : "Copy Reference"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
