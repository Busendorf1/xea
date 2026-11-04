"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Send, Lock, KeyRound, X, Check } from "lucide-react";
import RollingCounter from "@/components/ui/RollingCounter";
import { UserProfile } from "./types";
import styles from "./page.module.css";

interface DashboardWalletCardProps {
  user: UserProfile;
  showBalance: boolean;
  onToggleShowBalance: (nextState?: boolean) => void;
  onPinConfigured?: () => void;
  formatCurrency: (amount: number | string) => string;
  onOpenWithdrawModal: () => void;
  onOpenSendMoneyModal: () => void;
  onSelectTab: (tab: string) => void;
}

type PinBoxMode = "closed" | "verify" | "setup" | "forgot" | "change";
type PendingWalletAction = "none" | "withdraw" | "send";

export default function DashboardWalletCard({
  user,
  showBalance,
  onToggleShowBalance,
  onPinConfigured,
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

  const [hasPin, setHasPin] = useState<boolean>(Boolean(user.has_wallet_pin));
  const [pinMode, setPinMode] = useState<PinBoxMode>("closed");
  const [pendingAction, setPendingAction] = useState<PendingWalletAction>("none");

  // 4-digit arrays
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", ""]);
  const [confirmDigits, setConfirmDigits] = useState<string[]>(["", "", "", ""]);
  const [currentPinDigits, setCurrentPinDigits] = useState<string[]>(["", "", "", ""]);

  // Forgot PIN recovery fields
  const [resetEmail, setResetEmail] = useState("");
  const [resetPhone, setResetPhone] = useState("");

  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSuccessMsg, setPinSuccessMsg] = useState("");

  const pinRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);
  const confirmRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);
  const currentPinRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);

  useEffect(() => {
    if (typeof user.has_wallet_pin === "boolean") {
      setHasPin(user.has_wallet_pin);
    } else {
      // Check server once if has_wallet_pin was not in cached profile payload
      fetch("/api/wallet/pin")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && typeof d.hasPin === "boolean") {
            setHasPin(d.hasPin);
          }
        })
        .catch(() => {});
    }
  }, [user.has_wallet_pin]);

  // Auto-close wallet balance after 5 minutes if user did not manually close with the Eye icon
  useEffect(() => {
    if (!showBalance) return;
    const autoLockTimer = setTimeout(() => {
      onToggleShowBalance(false);
      setPinMode("closed");
      resetPinInputs();
    }, 5 * 60 * 1000);
    return () => clearTimeout(autoLockTimer);
  }, [showBalance, onToggleShowBalance]);

  const resetPinInputs = () => {
    setPinDigits(["", "", "", ""]);
    setConfirmDigits(["", "", "", ""]);
    setCurrentPinDigits(["", "", "", ""]);
    setPinError("");
    setPinSuccessMsg("");
  };

  const openPinPrompt = (actionAfterUnlock: PendingWalletAction = "none") => {
    resetPinInputs();
    setPendingAction(actionAfterUnlock);
    const nextMode: PinBoxMode = hasPin ? "verify" : "setup";
    setPinMode(nextMode);
    setTimeout(() => {
      pinRefs.current[0]?.focus();
    }, 60);
  };

  const handleEyeClick = () => {
    if (showBalance) {
      // Immediately lock wallet and hide balance
      onToggleShowBalance(false);
      setPinMode("closed");
      resetPinInputs();
      return;
    }
    if (pinMode !== "closed") {
      setPinMode("closed");
      resetPinInputs();
      return;
    }
    openPinPrompt("none");
  };

  const handleWithdrawClick = () => {
    if (!showBalance) {
      openPinPrompt("withdraw");
      return;
    }
    onOpenWithdrawModal();
  };

  const handleSendMoneyClick = () => {
    if (!showBalance) {
      openPinPrompt("send");
      return;
    }
    onOpenSendMoneyModal();
  };

  const completeUnlock = (configuredNewPin = false) => {
    if (configuredNewPin) {
      setHasPin(true);
      onPinConfigured?.();
    }
    onToggleShowBalance(true);
    setPinMode("closed");
    const nextAct = pendingAction;
    setPendingAction("none");
    resetPinInputs();

    if (nextAct === "withdraw") {
      onOpenWithdrawModal();
    } else if (nextAct === "send") {
      onOpenSendMoneyModal();
    }
  };

  const submitVerifyPin = async (fourDigitPin: string) => {
    if (!/^\d{4}$/.test(fourDigitPin)) {
      setPinError("Please enter all 4 digits.");
      return;
    }
    setPinLoading(true);
    setPinError("");
    try {
      const res = await fetch("/api/wallet/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", pin: fourDigitPin }),
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        completeUnlock(false);
      } else if (data?.error === "PIN_NOT_SET") {
        setHasPin(false);
        resetPinInputs();
        setPinMode("setup");
      } else {
        setPinError(data?.error || "Incorrect 4-digit PIN.");
        setPinDigits(["", "", "", ""]);
        setTimeout(() => pinRefs.current[0]?.focus(), 40);
      }
    } catch {
      setPinError("Network error verifying PIN.");
    } finally {
      setPinLoading(false);
    }
  };

  const handleSetupPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pin = pinDigits.join("");
    const confirmPin = confirmDigits.join("");
    if (!/^\d{4}$/.test(pin)) {
      setPinError("Please enter a 4-digit PIN.");
      return;
    }
    if (pin !== confirmPin) {
      setPinError("PINs do not match. Please re-enter.");
      return;
    }

    setPinLoading(true);
    setPinError("");
    try {
      const res = await fetch("/api/wallet/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", pin, confirmPin }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        completeUnlock(true);
      } else {
        setPinError(data?.error || "Could not save PIN.");
      }
    } catch {
      setPinError("Network error saving PIN.");
    } finally {
      setPinLoading(false);
    }
  };

  const handleForgotPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newPin = pinDigits.join("");
    const confirmPin = confirmDigits.join("");

    if (!resetEmail.trim()) {
      setPinError("Please enter your account email address.");
      return;
    }
    if (!resetPhone.trim()) {
      setPinError("Please enter your registered phone number.");
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      setPinError("Please enter a new 4-digit PIN.");
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("New PIN and confirmation do not match.");
      return;
    }

    setPinLoading(true);
    setPinError("");
    try {
      const res = await fetch("/api/wallet/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          confirmEmail: resetEmail.trim(),
          phone: resetPhone.trim(),
          newPin,
          confirmPin,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResetEmail("");
        setResetPhone("");
        completeUnlock(true);
      } else {
        setPinError(data?.error || "Verification failed. Could not reset PIN.");
      }
    } catch {
      setPinError("Network error resetting PIN.");
    } finally {
      setPinLoading(false);
    }
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentPin = currentPinDigits.join("");
    const newPin = pinDigits.join("");
    const confirmPin = confirmDigits.join("");

    if (!/^\d{4}$/.test(currentPin)) {
      setPinError("Enter your current 4-digit PIN.");
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      setPinError("Enter a new 4-digit PIN.");
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("New PIN and confirmation do not match.");
      return;
    }

    setPinLoading(true);
    setPinError("");
    try {
      const res = await fetch("/api/wallet/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change",
          currentPin,
          newPin,
          confirmPin,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPinSuccessMsg("PIN updated!");
        setTimeout(() => {
          setPinMode("closed");
          resetPinInputs();
        }, 900);
      } else {
        setPinError(data?.error || "Could not change PIN.");
      }
    } catch {
      setPinError("Network error updating PIN.");
    } finally {
      setPinLoading(false);
    }
  };

  const handleDigitChange = (
    index: number,
    value: string,
    digits: string[],
    setDigits: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<Array<HTMLInputElement | null>>,
    autoSubmitOnFourth = false,
    nextGroupFirstRef?: HTMLInputElement | null
  ) => {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      const updated = [...digits];
      updated[index] = "";
      setDigits(updated);
      return;
    }

    // Support pasting 4 digits at once
    if (clean.length > 1) {
      const chars = clean.slice(0, 4).split("");
      const updated = ["", "", "", ""];
      chars.forEach((ch, idx) => {
        updated[idx] = ch;
      });
      setDigits(updated);
      const focusIdx = Math.min(3, chars.length - 1);
      refs.current[focusIdx]?.focus();
      if (autoSubmitOnFourth && chars.length === 4) {
        submitVerifyPin(updated.join(""));
      }
      return;
    }

    const digit = clean.slice(-1);
    const updated = [...digits];
    updated[index] = digit;
    setDigits(updated);
    setPinError("");

    if (index < 3) {
      refs.current[index + 1]?.focus();
    } else if (nextGroupFirstRef) {
      nextGroupFirstRef.focus();
    } else if (autoSubmitOnFourth && updated.every((d) => d.length === 1)) {
      submitVerifyPin(updated.join(""));
    }
  };

  const handleDigitKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
    digits: string[],
    setDigits: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<Array<HTMLInputElement | null>>
  ) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const updated = [...digits];
        updated[index] = "";
        setDigits(updated);
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
        const updated = [...digits];
        updated[index - 1] = "";
        setDigits(updated);
      }
    }
  };

  const renderFourDigitBoxes = (
    digits: string[],
    setDigits: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<Array<HTMLInputElement | null>>,
    autoSubmit = false,
    nextGroupFirstRef?: HTMLInputElement | null
  ) => (
    <div className={styles.pinBoxesRow}>
      {[0, 1, 2, 3].map((idx) => (
        <input
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={digits[idx]}
          disabled={pinLoading}
          onChange={(e) =>
            handleDigitChange(idx, e.target.value, digits, setDigits, refs, autoSubmit, nextGroupFirstRef)
          }
          onKeyDown={(e) => handleDigitKeyDown(idx, e, digits, setDigits, refs)}
          className={`${styles.pinDigitBox} ${digits[idx] ? styles.pinDigitBoxFilled : ""}`}
          aria-label={`PIN digit ${idx + 1}`}
        />
      ))}
    </div>
  );

  return (
    <div className={styles.walletCard}>
      <div className={styles.walletTopRow}>
        <div className={styles.walletHeaderWrap}>
          <h4 className={styles.walletHeader} style={{ margin: 0 }}>
            Wallet Balance
          </h4>
          {!showBalance && (
            <span className={styles.walletLockedPill}>
              <Lock size={10} strokeWidth={2.4} />
              <span>PIN Locked</span>
            </span>
          )}
        </div>

        <div className={styles.walletHeaderActions}>
          {showBalance && hasPin && pinMode === "closed" && (
            <button
              type="button"
              onClick={() => {
                resetPinInputs();
                setPinMode("change");
                setTimeout(() => currentPinRefs.current[0]?.focus(), 60);
              }}
              className={styles.walletChangePinLink}
              title="Change 4-digit Wallet PIN"
            >
              Change PIN
            </button>
          )}
          <button
            type="button"
            onClick={handleEyeClick}
            className={styles.walletEyeBtn}
            title={showBalance ? "Lock & hide balance" : "Enter PIN to show balance"}
            aria-label={showBalance ? "Lock & hide balance" : "Enter PIN to show balance"}
          >
            {showBalance ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className={styles.walletBalance}>
        {showBalance ? (
          <RollingCounter value={user.balance ?? 0} currencyPrefix="₦" />
        ) : (
          <span
            onClick={() => openPinPrompt("none")}
            style={{ letterSpacing: "2px", fontWeight: 700, cursor: "pointer" }}
            title="Click to enter 4-digit PIN"
          >
            ₦••••••••
          </span>
        )}
      </div>

      {user.withdrawal > 0 && (
        <p className={styles.pendingWithdrawal}>
          Pending Withdrawal: {showBalance ? formatCurrency(user.withdrawal) : "₦••••"}
        </p>
      )}

      {/* 4-Digit Wallet PIN Drawer (Setup / Verify / Forgot / Change) */}
      <AnimatePresence>
        {pinMode !== "closed" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={styles.pinDrawerWrap}
          >
            <div className={styles.pinDrawerBox}>
              <div className={styles.pinDrawerHeader}>
                <div className={styles.pinDrawerTitleRow}>
                  <KeyRound size={14} strokeWidth={2.2} />
                  <span>
                    {pinMode === "setup"
                      ? "Set 4-Digit Wallet PIN"
                      : pinMode === "verify"
                      ? "Enter 4-Digit Wallet PIN"
                      : pinMode === "forgot"
                      ? "Reset Forgotten PIN"
                      : "Change Wallet PIN"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPinMode("closed");
                    setPendingAction("none");
                    resetPinInputs();
                  }}
                  className={styles.pinCloseBtn}
                  aria-label="Close PIN box"
                >
                  <X size={14} />
                </button>
              </div>

              {/* MODE 1: VERIFY EXISTING 4-DIGIT PIN */}
              {pinMode === "verify" && (
                <div className={styles.pinFormSection}>
                  <p className={styles.pinSubText}>
                    {pendingAction === "withdraw"
                      ? "Enter your 4-digit PIN to unlock withdrawals."
                      : pendingAction === "send"
                      ? "Enter your 4-digit PIN to send money."
                      : "Enter your 4-digit PIN to view balance and unlock transactions."}
                  </p>
                  {renderFourDigitBoxes(pinDigits, setPinDigits, pinRefs, true)}

                  {pinError && <p className={styles.pinErrorText}>{pinError}</p>}

                  <div className={styles.pinFooterRow}>
                    <button
                      type="button"
                      onClick={() => {
                        resetPinInputs();
                        setPinMode("forgot");
                      }}
                      className={styles.pinTextLink}
                    >
                      Forgot PIN?
                    </button>
                    <button
                      type="button"
                      disabled={pinLoading || pinDigits.join("").length < 4}
                      onClick={() => submitVerifyPin(pinDigits.join(""))}
                      className={styles.pinSubmitBtn}
                    >
                      {pinLoading ? "Verifying..." : "Unlock"}
                    </button>
                  </div>
                </div>
              )}

              {/* MODE 2: FIRST-TIME 4-DIGIT PIN SETUP */}
              {pinMode === "setup" && (
                <form onSubmit={handleSetupPinSubmit} className={styles.pinFormSection}>
                  <p className={styles.pinSubText}>
                    Create a 4-digit PIN to protect your wallet balance, transfers, and withdrawals.
                  </p>
                  <span className={styles.pinFieldLabel}>Create 4-Digit PIN</span>
                  {renderFourDigitBoxes(
                    pinDigits,
                    setPinDigits,
                    pinRefs,
                    false,
                    confirmRefs.current[0]
                  )}

                  <span className={styles.pinFieldLabel}>Confirm 4-Digit PIN</span>
                  {renderFourDigitBoxes(confirmDigits, setConfirmDigits, confirmRefs, false)}

                  {pinError && <p className={styles.pinErrorText}>{pinError}</p>}

                  <button
                    type="submit"
                    disabled={
                      pinLoading ||
                      pinDigits.join("").length < 4 ||
                      confirmDigits.join("").length < 4
                    }
                    className={styles.pinPrimaryFullBtn}
                  >
                    {pinLoading ? "Saving PIN..." : "Set PIN & Unlock Wallet"}
                  </button>
                </form>
              )}

              {/* MODE 3: FORGOT PIN RECOVERY */}
              {pinMode === "forgot" && (
                <form onSubmit={handleForgotPinSubmit} className={styles.pinFormSection}>
                  <p className={styles.pinSubText}>
                    Verify your account email and registered phone number to set a new 4-digit PIN.
                  </p>
                  <input
                    type="email"
                    placeholder="Account email address"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className={styles.pinRecoveryInput}
                    required
                  />
                  <input
                    type="tel"
                    placeholder="Registered phone number"
                    value={resetPhone}
                    onChange={(e) => setResetPhone(e.target.value)}
                    className={styles.pinRecoveryInput}
                    required
                  />

                  <span className={styles.pinFieldLabel}>New 4-Digit PIN</span>
                  {renderFourDigitBoxes(
                    pinDigits,
                    setPinDigits,
                    pinRefs,
                    false,
                    confirmRefs.current[0]
                  )}

                  <span className={styles.pinFieldLabel}>Confirm New PIN</span>
                  {renderFourDigitBoxes(confirmDigits, setConfirmDigits, confirmRefs, false)}

                  {pinError && <p className={styles.pinErrorText}>{pinError}</p>}

                  <div className={styles.pinFooterRow}>
                    <button
                      type="button"
                      onClick={() => {
                        resetPinInputs();
                        setPinMode("verify");
                      }}
                      className={styles.pinTextLink}
                    >
                      Back to PIN
                    </button>
                    <button
                      type="submit"
                      disabled={
                        pinLoading ||
                        pinDigits.join("").length < 4 ||
                        confirmDigits.join("").length < 4
                      }
                      className={styles.pinSubmitBtn}
                    >
                      {pinLoading ? "Resetting..." : "Reset PIN"}
                    </button>
                  </div>
                </form>
              )}

              {/* MODE 4: CHANGE EXISTING PIN */}
              {pinMode === "change" && (
                <form onSubmit={handleChangePinSubmit} className={styles.pinFormSection}>
                  <span className={styles.pinFieldLabel}>Current 4-Digit PIN</span>
                  {renderFourDigitBoxes(
                    currentPinDigits,
                    setCurrentPinDigits,
                    currentPinRefs,
                    false,
                    pinRefs.current[0]
                  )}

                  <span className={styles.pinFieldLabel}>New 4-Digit PIN</span>
                  {renderFourDigitBoxes(
                    pinDigits,
                    setPinDigits,
                    pinRefs,
                    false,
                    confirmRefs.current[0]
                  )}

                  <span className={styles.pinFieldLabel}>Confirm New PIN</span>
                  {renderFourDigitBoxes(confirmDigits, setConfirmDigits, confirmRefs, false)}

                  {pinError && <p className={styles.pinErrorText}>{pinError}</p>}
                  {pinSuccessMsg && (
                    <p className={styles.pinSuccessText}>
                      <Check size={13} /> {pinSuccessMsg}
                    </p>
                  )}

                  <div className={styles.pinFooterRow}>
                    <button
                      type="button"
                      onClick={() => {
                        resetPinInputs();
                        setPinMode("forgot");
                      }}
                      className={styles.pinTextLink}
                    >
                      Forgot current PIN?
                    </button>
                    <button
                      type="submit"
                      disabled={
                        pinLoading ||
                        currentPinDigits.join("").length < 4 ||
                        pinDigits.join("").length < 4 ||
                        confirmDigits.join("").length < 4
                      }
                      className={styles.pinSubmitBtn}
                    >
                      {pinLoading ? "Updating..." : "Update PIN"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.walletBtnGroup}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleWithdrawClick}
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
          onClick={handleSendMoneyClick}
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
