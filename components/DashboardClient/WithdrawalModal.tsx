"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, AlertCircle } from "lucide-react";
import { withdrawalSchema } from "@/lib/validationSchemas";
import { getCurrencyConfig, getUserCurrency, NGN_PER_USD } from "@/lib/utils/currency";
import { toClientFriendlyApiError, toClientFriendlyError } from "@/lib/utils/clientError";
import { UserProfile, DEFAULT_NIGERIAN_BANKS } from "./types";
import { TransferSuccessData } from "@/components/ui/TransferSuccessModal";
import styles from "./page.module.css";

interface WithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  defaultPin?: string;
  formatCurrency: (amount: number | string) => string;
  onSuccess: (data: TransferSuccessData) => void;
  onUpdateBalance: (newBalance: number, newWithdrawal: number) => void;
  onRefreshProfile: () => void;
  onFetchNotifications: () => void;
}

function estimateGatewayFeeRange(amount: number): { paystack: number; kora: number } {
  const paystack = amount <= 5000 ? 10.75 : amount <= 50000 ? 26.88 : 53.75;
  const kora = amount <= 5000 ? 15 : amount <= 50000 ? 25 : 35;
  return { paystack, kora };
}

function formatWithdrawalErrorMsg(msg: string): string {
  if (!msg) {
    return "Withdrawal failed. Disbursements are processed via Nigerian clearing rails; please try using a verified Nigerian bank account (NUBAN).";
  }
  const lower = msg.toLowerCase();
  if (
    lower.includes("nigeria") ||
    lower.includes("pin") ||
    lower.includes("locked") ||
    lower.includes("attempt") ||
    lower.includes("phone") ||
    lower.includes("balance") ||
    lower.includes("minimum")
  ) {
    return msg;
  }
  return `${msg}. Disbursements are processed via Nigerian clearing rails; please check your details or try using a Nigerian bank account (NUBAN).`;
}

export default function WithdrawalModal({
  isOpen,
  onClose,
  user,
  defaultPin = "",
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
  const [walletPin, setWalletPin] = useState("");
  const [resolvedAccountName, setResolvedAccountName] = useState("");
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState("");
  const isUSD = getUserCurrency(user?.country) === "USD";

  useEffect(() => {
    if (isOpen) {
      setWithdrawAmount(user.balance.toString());
      setWithdrawPhone("");
      setWalletPin(defaultPin || "");
      setWithdrawalError("");
    }
  }, [isOpen, user.balance, defaultPin]);

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
          const data = await res.json().catch(() => null);
          if (res.ok && data) {
            setResolvedAccountName(data.account_name);
          } else {
            setWithdrawalError(
              formatWithdrawalErrorMsg(
                toClientFriendlyApiError(res.status, data, "Could not resolve account details")
              )
            );
          }
        } catch (e: any) {
          setWithdrawalError(toClientFriendlyError(e, "Try again later"));
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
    if (submittingWithdrawal) return;
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

    const cleanPin = walletPin.trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      setWithdrawalError("Please enter your 4-digit Wallet PIN.");
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
          phone: withdrawPhone.trim(),
          pin: cleanPin,
        }),
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        onClose();
        const finalBal =
          typeof data.newBalance === "number" ? data.newBalance : Math.max(0, (user.balance || 0) - amountNum);
        const { paystack } = estimateGatewayFeeRange(amountNum);
        const resolvedFee = typeof data.fee === "number" ? data.fee : paystack;
        const resolvedNet =
          typeof data.netAmount === "number"
            ? data.netAmount
            : Math.max(0, amountNum - resolvedFee);
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
          amount: resolvedNet,
          bankName: bank?.name || "Bank Account",
          accountNumber,
          accountName: resolvedAccountName,
          reference: data.reference,
          newBalance: finalBal,
        });
        onRefreshProfile();
        onFetchNotifications();
      } else {
        if (res.status === 401 || res.status === 429) {
          setWalletPin("");
        }
        setWithdrawalError(
          formatWithdrawalErrorMsg(
            toClientFriendlyApiError(res.status, data, "Failed to process withdrawal")
          )
        );
      }
    } catch (e: any) {
      setWithdrawalError(toClientFriendlyError(e, "Try again later"));
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
                  Available: <span className={styles.balanceHighlight}>
                    {isUSD
                      ? `₦${(user.balance ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })} ($${((user.balance ?? 0) / NGN_PER_USD).toFixed(2)} USD)`
                      : `₦${(user.balance ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
                  </span>
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
                  Withdrawal Amount (₦ NGN)
                </label>
                <input
                  type="number"
                  min={10000}
                  max={user.balance}
                  placeholder={`Min ₦10,000.00${isUSD ? " (~$6.67 USD)" : ""}`}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  required
                  className={styles.formInput}
                />
                {isUSD && (
                  <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.25rem", lineHeight: 1.35 }}>
                    Disbursements are cleared in Nigerian Naira (₦). Global reference: $1.00 USD = ₦1,500 NGN.
                  </p>
                )}
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

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>4-Digit Wallet PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="Enter 4-digit PIN"
                  value={walletPin}
                  onChange={(e) => setWalletPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  required
                  autoComplete="off"
                  className={styles.formInput}
                />
                <span className={styles.formHintSmall}>
                  5 incorrect PIN attempts lock PIN verification for 45 minutes.
                </span>
              </div>

              {(user.balance ?? 0) < 10000 && (
                <div className={styles.balanceWarningBox}>
                  <AlertCircle size={15} />
                  <span>
                    Your wallet balance is below the minimum required limit of {formatCurrency(10000)}.
                  </span>
                </div>
              )}

              {withdrawAmount && parseFloat(withdrawAmount) > 0 && (() => {
                const amt = parseFloat(withdrawAmount) || 0;
                const { paystack, kora } = estimateGatewayFeeRange(amt);
                const minFee = Math.min(paystack, kora);
                const maxFee = Math.max(paystack, kora);
                const netReceiveMin = Math.max(0, amt - maxFee);
                const netReceiveMax = Math.max(0, amt - minFee);
                return (
                  <div className={styles.feeSummaryCard}>
                    <div className={styles.feeSummaryRow}>
                      <span>Transfer Fee (Paystack / Kora):</span>
                      <span className={styles.feeSummaryValBold}>
                        ₦{paystack.toFixed(2)} / ₦{kora.toFixed(2)}
                      </span>
                    </div>
                    <div className={styles.feeSummaryRow}>
                      <span>Disbursement Schedule:</span>
                      <span className={styles.feeSummaryVal}>Instant / Payout Window</span>
                    </div>
                    <div className={styles.feeSummaryTotalRow}>
                      <span className={styles.receiveLabel}>Estimated Net Payout:</span>
                      <span className={styles.receiveAmount}>
                        {netReceiveMin === netReceiveMax
                          ? `₦${netReceiveMax.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
                          : `₦${netReceiveMin.toLocaleString("en-NG", { minimumFractionDigits: 2 })} – ₦${netReceiveMax.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
                        {isUSD && ` (~$${(netReceiveMax / NGN_PER_USD).toFixed(2)} USD)`}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {withdrawalError && <div className={styles.errorText}>{withdrawalError}</div>}

              <button
                type="submit"
                disabled={
                  submittingWithdrawal ||
                  !resolvedAccountName ||
                  !/^\d{4}$/.test(walletPin) ||
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
