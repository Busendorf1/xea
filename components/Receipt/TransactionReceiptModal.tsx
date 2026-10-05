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

  // Fee / Charge & Discount extraction
  const charge = typeof meta.fee === "number"
    ? meta.fee
    : (meta.fee ? parseFloat(meta.fee) : (isWithdrawal ? 50 : 0)); // standard or recorded withdrawal charge

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
          <RotateCcw size={13} /> Reversed
        </span>
      );
    }
    return (
      <span className={`${styles.statusBadge} ${styles.statusFailed}`}>
        <AlertCircle size={13} /> Failed
      </span>
    );
  };

  // Destination / Recipient info
  const destinationBank = meta.bankName || meta.bank_name;
  const destinationAccount = meta.accountNumber || meta.account_number;
  const destinationName = meta.accountName || meta.account_name || meta.recipientName;
  const recipientEmail = meta.recipientEmail || meta.recipient_email;
  const payerEmail = transaction.user_email || currentUserEmail || "Account Holder";

  // Payment purpose / narration
  const purpose = transaction.description || meta.purpose || getTypeLabel(transaction.type);

  const handlePrint = () => {
    // Generate clean printable receipt window
    const printContent = document.getElementById("paayh-receipt-voucher");
    if (!printContent) {
      window.print();
      return;
    }

    const printWindow = window.open("", "_blank", "width=440,height=720");
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Receipt_${transaction.reference || "tx"}</title>
        <style>
          @page {
            size: 100mm auto;
            margin: 6mm auto;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #ffffff;
            color: #000000;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt-container {
            width: 100%;
            display: flex;
            justify-content: center;
            padding: 16px 8px;
          }
          .receipt-box {
            width: 360px;
            max-width: 360px;
            min-width: 320px;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 24px 20px;
            background: #ffffff;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 1.5px solid #f1f5f9;
            padding-bottom: 14px;
            margin-bottom: 16px;
          }
          .brand {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: -0.5px;
            color: #000000;
          }
          .brand-sub {
            font-size: 11px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 2px;
          }
          .receipt-title {
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            text-align: right;
            margin-top: 5px;
          }
          .amount-section {
            text-align: center;
            padding: 14px 10px;
            margin-bottom: 16px;
            background: #f9f9f7;
            border-radius: 12px;
            border: 1px dashed #e2e8f0;
          }
          .amount-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: #64748b;
            margin-bottom: 4px;
            font-weight: 600;
          }
          .amount-val {
            font-size: 26px;
            font-weight: 800;
            color: #000000;
            letter-spacing: -0.5px;
          }
          .grid {
            width: 100%;
            margin-bottom: 16px;
            border-collapse: collapse;
          }
          .grid tr {
            border-bottom: 1px solid #f1f5f9;
          }
          .grid td {
            padding: 8px 2px;
            font-size: 12px;
          }
          .grid td.label {
            color: #64748b;
            width: 42%;
            font-weight: 500;
          }
          .grid td.value {
            color: #000000;
            font-weight: 600;
            text-align: right;
            word-break: break-word;
          }
          .badge {
            display: inline-block;
            padding: 2px 7px;
            border-radius: 9999px;
            font-size: 10px;
            font-weight: 700;
            text-transform: capitalize;
          }
          .badge-success { background: #f4f4f2; color: #000000; border: 1px solid #e2e8f0; }
          .badge-pending { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
          .badge-failed { background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; }
          .badge-reversed { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
          .footer-note {
            text-align: center;
            font-size: 11px;
            color: #94a3b8;
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid #f1f5f9;
            font-weight: 500;
          }
          @media print {
            html, body {
              background: #ffffff !important;
              padding: 0 !important;
              margin: 0 !important;
              width: 100% !important;
            }
            .receipt-container {
              padding: 0 !important;
              margin: 0 !important;
            }
            .receipt-box {
              width: 360px !important;
              max-width: 360px !important;
              min-width: 320px !important;
              margin: 12px auto !important;
              border: 1px solid #e2e8f0 !important;
              border-radius: 14px !important;
              padding: 20px 18px !important;
              box-shadow: none !important;
              background: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="receipt-box">
          <div class="header">
            <div>
              <div class="brand">Paayh</div>
            </div>
            <div>
              <div class="receipt-title">Transaction Receipt</div>
            </div>
          </div>

          <div class="amount-section">
            <div class="amount-label">${isCredit ? "Amount Credited" : "Amount Paid / Transferred"}</div>
            <div class="amount-val">${formatNaira(rawAmount)}</div>
          </div>

          <table class="grid">
            <tr>
              <td class="label">Payment For</td>
              <td class="value">${purpose}</td>
            </tr>
            <tr>
              <td class="label">Transaction Type</td>
              <td class="value">${getTypeLabel(transaction.type)}</td>
            </tr>
            <tr>
              <td class="label">Status</td>
              <td class="value">
                <span class="badge badge-${(transaction.status || "").toLowerCase() === "success" || (transaction.status || "").toLowerCase() === "completed" ? "success" : (transaction.status || "").toLowerCase() === "pending" || (transaction.status || "").toLowerCase() === "processing" ? "pending" : "failed"}">
                  ${transaction.status}
                </span>
              </td>
            </tr>
            <tr>
              <td class="label">Reference</td>
              <td class="value" style="font-family: monospace;">${transaction.reference}</td>
            </tr>
            <tr>
              <td class="label">Timestamp</td>
              <td class="value">${formattedDateTime}</td>
            </tr>
            <tr>
              <td class="label">Paid By</td>
              <td class="value">${payerEmail}</td>
            </tr>
            ${destinationBank ? `
            <tr>
              <td class="label">Destination Bank</td>
              <td class="value">${destinationBank}</td>
            </tr>` : ""}
            ${destinationAccount ? `
            <tr>
              <td class="label">Account Number</td>
              <td class="value">${destinationAccount}</td>
            </tr>` : ""}
            ${destinationName ? `
            <tr>
              <td class="label">Beneficiary Name</td>
              <td class="value">${destinationName}</td>
            </tr>` : ""}
            ${recipientEmail ? `
            <tr>
              <td class="label">Recipient</td>
              <td class="value">${recipientEmail}</td>
            </tr>` : ""}
            ${charge > 0 ? `
            <tr>
              <td class="label">Withdrawal Charge</td>
              <td class="value">${formatNaira(charge)}</td>
            </tr>` : ""}
            ${discount > 0 ? `
            <tr>
              <td class="label">Discount</td>
              <td class="value">-${formatNaira(discount)}</td>
            </tr>` : ""}
            ${(charge > 0 || discount > 0) ? `
            <tr style="border-top: 1.5px solid #cbd5e1; font-weight: 700;">
              <td class="label" style="color: #000000; font-weight: 700;">Net Amount</td>
              <td class="value" style="color: #000000; font-size: 13px;">${formatNaira(netAmount)}</td>
            </tr>` : ""}
          </table>

          <div class="footer-note">
            Paayh • Official Transaction Slip
          </div>
        </div>
      </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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
              <span className={styles.detailValue}>{payerEmail}</span>
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

            {recipientEmail && !destinationName && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Recipient</span>
                <span className={styles.detailValue}>{recipientEmail}</span>
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
