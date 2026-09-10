"use client";

import React, { useState, useEffect } from "react";
import { Copy, Check, ShieldCheck, ArrowRight, Building2 } from "lucide-react";
import styles from "./TransferSuccessModal.module.css";

export interface TransferSuccessData {
 type?: "transfer" | "withdrawal";
 title?: string;
 amount: number;
 recipientEmail?: string;
 bankName?: string;
 accountNumber?: string;
 accountName?: string;
 reference?: string;
 newBalance?: number;
}

interface TransferSuccessModalProps {
 data: TransferSuccessData | null;
 onClose: () => void;
 formatCurrency: (amount: number | string) => string;
}

export default function TransferSuccessModal({
 data,
 onClose,
 formatCurrency,
}: TransferSuccessModalProps) {
 const [copied, setCopied] = useState(false);

 useEffect(() => {
 const handleKeyDown = (e: KeyboardEvent) => {
 if (e.key === "Escape") onClose();
 };
 window.addEventListener("keydown", handleKeyDown);
 return () => window.removeEventListener("keydown", handleKeyDown);
 }, [onClose]);

 if (!data) return null;

 const isWithdrawal = data.type === "withdrawal";
 const defaultTitle = isWithdrawal ? "Withdrawal Queued" : "Transfer Successful";

 const handleCopyRef = () => {
 if (!data.reference) return;
 navigator.clipboard.writeText(data.reference);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 };

 const formattedDate = new Intl.DateTimeFormat("en-US", {
 month: "short",
 day: "numeric",
 hour: "numeric",
 minute: "2-digit",
 hour12: true,
 }).format(new Date());

  const maskedAccount = data.accountNumber && data.accountNumber.length >= 4
    ? `••••${data.accountNumber.slice(-4)}`
    : data.accountNumber;

 return (
 <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
 <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
 {/* Animated Checkmark Badge */}
 <div className={styles.iconWrapper}>
 <div className={styles.pulseRing} />
 <div className={styles.circleBg}>
 <svg
 className={styles.checkmarkSvg}
 viewBox="0 0 52 52"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 >
 <path
 className={styles.checkmarkCheck}
 d="M14 27l8.5 8.5 16-16"
 />
 </svg>
 </div>
 </div>

 <h3 className={styles.title}>{data.title || defaultTitle}</h3>
 <div className={styles.amountText}>{formatCurrency(data.amount)}</div>

 {/* Receipt Card */}
 <div className={styles.receiptCard}>
 {isWithdrawal ? (
 <>
 {data.bankName && (
 <div className={styles.receiptRow}>
 <span className={styles.receiptLabel}>Destination Bank</span>
 <span className={styles.receiptValue}>
 <Building2 size={14} color="var(--primary, #2563eb)" />
 {data.bankName}
 </span>
 </div>
 )}
 {data.accountName && (
 <div className={styles.receiptRow}>
 <span className={styles.receiptLabel}>Beneficiary Name</span>
 <span className={styles.receiptValue} title={data.accountName}>
 {data.accountName}
 </span>
 </div>
 )}
 {maskedAccount && (
 <div className={styles.receiptRow}>
 <span className={styles.receiptLabel}>Account Number</span>
 <span className={styles.receiptValue}>{maskedAccount}</span>
 </div>
 )}
 <div className={styles.receiptRow}>
 <span className={styles.receiptLabel}>Payment Method</span>
 <span className={styles.receiptValue}>
 <ShieldCheck size={14} color="var(--primary, #2563eb)" />
 Paayh Wallet
 </span>
 </div>
 </>
 ) : (
 <>
 {data.recipientEmail && (
 <div className={styles.receiptRow}>
 <span className={styles.receiptLabel}>Recipient</span>
 <span className={styles.receiptValue} title={data.recipientEmail}>
 {data.recipientEmail}
 </span>
 </div>
 )}
 <div className={styles.receiptRow}>
 <span className={styles.receiptLabel}>Payment Method</span>
 <span className={styles.receiptValue}>
 <ShieldCheck size={14} color="var(--primary, #2563eb)" />
 Paayh Wallet
 </span>
 </div>
 </>
 )}

 {data.reference && (
 <div className={styles.receiptRow}>
 <span className={styles.receiptLabel}>Reference</span>
 <button
 type="button"
 onClick={handleCopyRef}
 className={styles.refTag}
 title="Click to copy reference"
 >
 <span>{data.reference.length > 18 ? `${data.reference.substring(0, 8)}...${data.reference.slice(-6)}` : data.reference}</span>
 {copied ? <Check size={12} color="var(--success, #16a34a)" /> : <Copy size={12} />}
 </button>
 </div>
 )}

 <div className={styles.receiptRow}>
 <span className={styles.receiptLabel}>Date & Time</span>
 <span className={styles.receiptValue}>{formattedDate}</span>
 </div>

 <div className={styles.receiptRow}>
 <span className={styles.receiptLabel}>Status</span>
 <span className={styles.receiptValue} style={{ color: "var(--success, #16a34a)" }}>
 {isWithdrawal ? "Queued" : "Completed"}
 </span>
 </div>
 </div>

 {/* Action Button */}
 <button
 type="button"
 onClick={onClose}
 className={styles.doneBtn}
 autoFocus
 >
 <span>Done</span>
 <ArrowRight size={18} />
 </button>
 </div>
 </div>
 );
}
