"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, AlertCircle } from "lucide-react";
import { withdrawalSchema } from "@/lib/validationSchemas";
import { getCurrencyConfig } from "@/lib/utils/currency";
import { UserProfile, DEFAULT_NIGERIAN_BANKS } from "./types";
import { TransferSuccessData } from "@/components/ui/TransferSuccessModal";
import styles from "./page.module.css";

interface WithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  formatCurrency: (amount: number | string) => string;
  onSuccess: (data: TransferSuccessData) => void;
  onUpdateBalance: (newBalance: number, newWithdrawal: number) => void;
  onRefreshProfile: () => void;
  onFetchNotifications: () => void;
}

export default function WithdrawalModal({
  isOpen,
  onClose,
  user,
  formatCurrency,
  onSuccess,
  onUpdateBalance,
  onRefreshProfile,
  onFetchNotifications,
}: WithdrawalModalProps) {
  const [banks, setBanks] = useState<any[]>(DEFAULT_NIGERIAN_BANKS);
  const [selectedBank, setSelectedBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [resolvedAccountName, setResolvedAccountName] = useState("");
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setWithdrawAmount(user.balance.toString());
      setWithdrawPhone("");
      setWithdrawalError("");
    }
  }, [isOpen, user.balance]);

  useEffect(() => {
    if (isOpen) {
      const fetchBanks = async () => {
        try {
          const res = await fetch("/api/withdrawals/banks");
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              setBanks(data);
            }
          }
        } catch (e) {
          console.error("Failed to fetch banks:", e);
        }
      };
      fetchBanks();
    }
  }, [isOpen]);

  useEffect(() => {
    if (accountNumber.length === 10 && selectedBank) {
      const resolveAccount = async () => {
        setResolvingAccount(true);
        setWithdrawalError("");
        setResolvedAccountName("");
        try {
          const res = await fetch("/api/withdrawals/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountNumber, bankCode: selectedBank }),
          });
          const data = await res.json();
          if (res.ok) {
            setResolvedAccountName(data.account_name);
          } else {
            setWithdrawalError(data.error || "Could not resolve account details");
          }
        } catch (e: any) {
          setWithdrawalError(e.message || "Error resolving account details");
        } finally {
          setResolvingAccount(false);
        }
      };
      resolveAccount();
    } else {
      setResolvedAccountName("");
    }
  }, [accountNumber, selectedBank]);

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawalError("");

    const amountNum = parseFloat(withdrawAmount);
    const validation = withdrawalSchema.safeParse({
      amount: amountNum,
      bankCode: selectedBank,
      accountNumber,
      accountName: resolvedAccountName || "Resolving...",
    });

    if (!validation.success) {
      setWithdrawalError(validation.error.issues[0]?.message || "Invalid withdrawal details.");
      return;
    }

    if (user.balance < 10000) {
      setWithdrawalError("Minimum wallet balance required to initiate a withdrawal is ₦10,000.00.");
      return;
    }

    if (amountNum < 10000) {
      setWithdrawalError("Minimum withdrawal amount per transaction is ₦10,000.00.");
      return;
    }

    if (amountNum > user.balance) {
      setWithdrawalError("Insufficient wallet balance for this withdrawal amount.");
      return;
    }

    if (!withdrawPhone.trim()) {
      setWithdrawalError("Please enter your registered phone number");
      return;
    }

    if (!resolvedAccountName) {
      setWithdrawalError("Please resolve bank account details before submitting");
      return;
    }

    setSubmittingWithdrawal(true);
    try {
      const bank = banks.find((b) => b.code === selectedBank);
      const res = await fetch("/api/withdrawals/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankCode: selectedBank,
          bankName: bank?.name || "Unknown Bank",
          accountNumber,
          amount: amountNum,
          phone: withdrawPhone,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        onClose();
        const finalBal =
          typeof data.newBalance === "number" ? data.newBalance : Math.max(0, (user.balance || 0) - amountNum);
        onUpdateBalance(finalBal, (user.withdrawal || 0) + amountNum);
        try {
          sessionStorage.removeItem("paayh_statement_cache");
        } catch {}
        onSuccess({
          type: "withdrawal",
          title:
            data.status === "success"
              ? "Withdrawal Completed"
              : data.status === "queued"
              ? "Withdrawal Queued"
              : "Withdrawal Processing",
          amount: typeof data.netAmount === "number" ? data.netAmount : Math.max(0, amountNum - 35),
          bankName: bank?.name || "Bank Account",
          accountNumber,
          accountName: resolvedAccountName,
          reference: data.reference,
          newBalance: finalBal,
        });
        onRefreshProfile();
        onFetchNotifications();
      } else {
        setWithdrawalError(data.error || "Failed to process withdrawal");
      }
    } catch (e: any) {
      setWithdrawalError(e.message || "Failed to process withdrawal");
    } finally {
      setSubmittingWithdrawal(false);
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
              <div className={styles.modalTitleGroup}>
                <h3 className={styles.modalTitle}>Request Bank Withdrawal</h3>
                <div className={styles.modalSubtitle}>
                  Available: <span className={styles.balanceHighlight}>{formatCurrency(user.balance ?? 0)}</span>
                </div>
              </div>
              <button onClick={onClose} className={styles.closeBtn} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleWithdrawSubmit} className={styles.modalBodyColumn}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Select Bank</label>
                <select
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                  required
                  className={styles.formInput}
                >
                  <option value="">Choose Your Bank</option>
                  {banks.map((b, index) => (
                    <option key={`${b.code}-${index}`} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Account Number</label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="10 digit Account Number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                  required
                  className={styles.formInput}
                />
              </div>

              {resolvingAccount && (
                <div className={styles.resolvingPill}>Verifying account details with bank...</div>
              )}

              {resolvedAccountName && (
                <div className={styles.resolvedPill}>
                  <span className={styles.resolvedNameCheck}>
                    <Check size={13} strokeWidth={2.5} />
                  </span>
                  <span className={styles.resolvedName}>{resolvedAccountName}</span>
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  Withdrawal Amount ({getCurrencyConfig(user?.country).symbol})
                </label>
                <input
                  type="number"
                  min={10000}
                  max={user.balance}
                  placeholder={`Min ${formatCurrency(10000)}`}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  required
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Registered Phone</label>
                <input
                  type="text"
                  placeholder="Enter registered phone"
                  value={withdrawPhone}
                  onChange={(e) => setWithdrawPhone(e.target.value)}
                  required
                  className={styles.formInput}
                />
              </div>

              {(user.balance ?? 0) < 10000 && (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    fontSize: "12px",
                    color: "#ef4444",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "12px",
                  }}
                >
                  <AlertCircle size={15} />
                  <span>
                    Your wallet balance is below the minimum required limit of {formatCurrency(10000)}.
                  </span>
                </div>
              )}

              {withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                <div
                  style={{
                    background: "var(--sidebar-bg)",
                    border: "1px solid var(--card-border)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Transfer Network Fee:</span>
                    <span style={{ color: "var(--foreground)", fontWeight: 600 }}>₦35.00</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Disbursement Schedule:</span>
                    <span style={{ color: "var(--foreground)" }}>Instant / Payout Window</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      borderTop: "1px solid var(--card-border)",
                      paddingTop: "8px",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--foreground)" }}>You will receive:</span>
                    <span style={{ fontWeight: 700, color: "#10b981" }}>
                      {formatCurrency(Math.max(0, (parseFloat(withdrawAmount) || 0) - 35))}
                    </span>
                  </div>
                </div>
              )}

              {withdrawalError && <div className={styles.errorText}>{withdrawalError}</div>}

              <button
                type="submit"
                disabled={
                  submittingWithdrawal ||
                  !resolvedAccountName ||
                  (user.balance ?? 0) < 10000 ||
                  (parseFloat(withdrawAmount) || 0) < 10000 ||
                  (parseFloat(withdrawAmount) || 0) > (user.balance ?? 0)
                }
                className={styles.submitBtn}
              >
                {submittingWithdrawal
                  ? "Processing Withdrawal..."
                  : (user.balance ?? 0) < 10000
                  ? `Min. ${formatCurrency(10000)} Balance Required`
                  : (parseFloat(withdrawAmount) || 0) > 0 && (parseFloat(withdrawAmount) || 0) < 10000
                  ? `Min. Withdrawal is ${formatCurrency(10000)}`
                  : (parseFloat(withdrawAmount) || 0) > (user.balance ?? 0)
                  ? "Amount Exceeds Balance"
                  : "Withdraw Funds"}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
