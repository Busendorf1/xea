"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { sendMoneySchema } from "@/lib/validationSchemas";
import { UserProfile } from "./types";
import { TransferSuccessData } from "@/components/ui/TransferSuccessModal";
import styles from "./page.module.css";

interface SendMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  currentUserEmail: string;
  formatCurrency: (amount: number | string) => string;
  onSuccess: (data: TransferSuccessData) => void;
  onUpdateBalance: (newBalance: number) => void;
  onRefreshProfile: () => void;
  onFetchNotifications: () => void;
}

export default function SendMoneyModal({
  isOpen,
  onClose,
  user,
  currentUserEmail,
  formatCurrency,
  onSuccess,
  onUpdateBalance,
  onRefreshProfile,
  onFetchNotifications,
}: SendMoneyModalProps) {
  const [sendRecipientEmail, setSendRecipientEmail] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [submittingSend, setSubmittingSend] = useState(false);
  const [sendMoneyError, setSendMoneyError] = useState("");

  const handleSendMoneySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendMoneyError("");

    const cleanEmail = sendRecipientEmail.trim().toLowerCase();
    const amountNum = parseFloat(sendAmount);

    const validation = sendMoneySchema.safeParse({
      recipientEmail: cleanEmail,
      amount: amountNum,
    });

    if (!validation.success) {
      setSendMoneyError(validation.error.issues[0]?.message || "Invalid transfer details.");
      return;
    }

    if (cleanEmail === currentUserEmail.toLowerCase().trim()) {
      setSendMoneyError("You cannot send money to your own email account.");
      return;
    }

    const max20Percent = user.balance * 0.2;
    if (amountNum > max20Percent + 0.01) {
      setSendMoneyError(
        `Transfer amount cannot exceed 20% of your total balance (${formatCurrency(max20Percent)} max at a time).`
      );
      return;
    }

    if (amountNum > user.balance) {
      setSendMoneyError("Insufficient wallet balance for this transfer.");
      return;
    }

    setSubmittingSend(true);
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? `trf_web_${crypto.randomUUID()}`
          : `trf_web_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      const res = await fetch("/api/payments/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          recipientEmail: cleanEmail,
          amount: amountNum,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onClose();
        setSendRecipientEmail("");
        setSendAmount("");
        const finalBal =
          typeof data.new_balance === "number" ? data.new_balance : Math.max(0, (user.balance || 0) - amountNum);
        onUpdateBalance(finalBal);
        onSuccess({
          amount: amountNum,
          recipientEmail: cleanEmail,
          reference: data.reference,
          newBalance: finalBal,
        });
        onRefreshProfile();
        onFetchNotifications();
      } else {
        setSendMoneyError(data.error || "Failed to process transfer. Your balance remains unchanged.");
      }
    } catch (e: any) {
      setSendMoneyError(e.message || "Network error occurred. Your balance remains unchanged.");
    } finally {
      setSubmittingSend(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={styles.modalOverlay}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3>Send Money to User</h3>
              <button onClick={onClose} className={styles.closeBtn} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSendMoneySubmit} className={styles.modalBody}>
              <div className={styles.balanceRow}>
                <span>Available Balance:</span>
                <span className={styles.balanceValue}>{formatCurrency(user.balance ?? 0)}</span>
              </div>

              <div className={styles.balanceRowSub}>
                <span>Max Transfer Limit (20%):</span>
                <span className={styles.maxAllowedValue}>{formatCurrency((user.balance ?? 0) * 0.2)}</span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Recipient Email Account</label>
                <input
                  type="email"
                  placeholder="Enter recipient registered email (e.g. user@example.com)"
                  value={sendRecipientEmail}
                  onChange={(e) => setSendRecipientEmail(e.target.value)}
                  required
                  className={styles.formInput}
                />
                <span className={styles.formHintSmall}>Enter the exact email address of the recipient.</span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Amount to Send (₦)</label>
                <input
                  type="number"
                  step="0.01"
                  min={1}
                  max={user.balance * 0.2}
                  placeholder={`Max ${formatCurrency((user.balance ?? 0) * 0.2)}`}
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  required
                  className={styles.formInput}
                />
                <span className={styles.formHintSmall}>
                  Security Rules: Max 20% of your total balance at a time. Max 6 recipient users per day.
                </span>
              </div>

              {sendMoneyError && <div className={styles.errorText}>{sendMoneyError}</div>}

              <button type="submit" disabled={submittingSend || user.balance <= 0} className={styles.submitBtn}>
                {submittingSend ? "Processing Transfer..." : "Send Funds Instantly"}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
