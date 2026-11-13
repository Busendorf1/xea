"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, X, Check } from "lucide-react";
import styles from "./page.module.css";

export type PinBoxMode = "closed" | "verify" | "setup" | "forgot" | "change";

interface WalletPinModalProps {
  pinMode: PinBoxMode;
  pendingAction: "none" | "withdraw" | "send";
  pinLoading: boolean;
  pinError: string;
  pinSuccessMsg: string;
  viewportBounds: { top: number; height: number; keyboardOpen: boolean } | null;
  pinDigits: string[];
  setPinDigits: React.Dispatch<React.SetStateAction<string[]>>;
  confirmDigits: string[];
  setConfirmDigits: React.Dispatch<React.SetStateAction<string[]>>;
  currentPinDigits: string[];
  setCurrentPinDigits: React.Dispatch<React.SetStateAction<string[]>>;
  pinRefs: React.MutableRefObject<Array<HTMLInputElement | null>>;
  confirmRefs: React.MutableRefObject<Array<HTMLInputElement | null>>;
  currentPinRefs: React.MutableRefObject<Array<HTMLInputElement | null>>;
  resetEmail: string;
  setResetEmail: React.Dispatch<React.SetStateAction<string>>;
  resetPhone: string;
  setResetPhone: React.Dispatch<React.SetStateAction<string>>;
  userEmail?: string;
  onClose: () => void;
  onSwitchMode: (mode: PinBoxMode) => void;
  onSubmitVerify: (fourDigitPin: string) => void;
  onSubmitSetup: (e: React.FormEvent) => void;
  onSubmitForgot: (e: React.FormEvent) => void;
  onSubmitChange: (e: React.FormEvent) => void;
  onResetInputs: () => void;
  onSetPinError: (msg: string) => void;
}

export default function WalletPinModal({
  pinMode,
  pendingAction,
  pinLoading,
  pinError,
  pinSuccessMsg,
  viewportBounds,
  pinDigits,
  setPinDigits,
  confirmDigits,
  setConfirmDigits,
  currentPinDigits,
  setCurrentPinDigits,
  pinRefs,
  confirmRefs,
  currentPinRefs,
  resetEmail,
  setResetEmail,
  resetPhone,
  setResetPhone,
  userEmail,
  onClose,
  onSwitchMode,
  onSubmitVerify,
  onSubmitSetup,
  onSubmitForgot,
  onSubmitChange,
  onResetInputs,
  onSetPinError,
}: WalletPinModalProps) {
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
        onSubmitVerify(updated.join(""));
      }
      return;
    }

    const digit = clean.slice(-1);
    const updated = [...digits];
    updated[index] = digit;
    setDigits(updated);
    onSetPinError("");

    if (index < 3) {
      refs.current[index + 1]?.focus();
    } else if (nextGroupFirstRef) {
      nextGroupFirstRef.focus();
    } else if (autoSubmitOnFourth && updated.every((d) => d.length === 1)) {
      onSubmitVerify(updated.join(""));
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
          onFocus={(e) => {
            try {
              e.currentTarget.scrollIntoView({ block: "nearest", behavior: "smooth" });
            } catch {}
          }}
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
    <AnimatePresence>
      {pinMode !== "closed" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className={`${styles.pinModalOverlay} ${viewportBounds?.keyboardOpen ? styles.pinModalOverlayTop : ""}`}
          style={
            viewportBounds
              ? { top: `${viewportBounds.top}px`, height: `${viewportBounds.height}px` }
              : undefined
          }
          onClick={() => {
            if (!pinLoading) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Wallet PIN Verification"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={styles.pinModalSheet}
            onClick={(e) => e.stopPropagation()}
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
                  onClick={onClose}
                  className={styles.pinCloseBtn}
                  aria-label="Close PIN box"
                >
                  <X size={14} />
                </button>
              </div>

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
                        onResetInputs();
                        setResetEmail(userEmail || "");
                        onSwitchMode("forgot");
                      }}
                      className={styles.pinTextLink}
                    >
                      Forgot PIN?
                    </button>
                    <button
                      type="button"
                      disabled={pinLoading || pinDigits.join("").length < 4}
                      onClick={() => onSubmitVerify(pinDigits.join(""))}
                      className={styles.pinSubmitBtn}
                    >
                      {pinLoading ? "Verifying..." : "Unlock"}
                    </button>
                  </div>
                </div>
              )}

              {pinMode === "setup" && (
                <form onSubmit={onSubmitSetup} className={styles.pinFormSection}>
                  <p className={styles.pinSubText}>
                    Create a 4-digit PIN to protect your wallet balance, transfers, and withdrawals. 5 incorrect attempts lock PIN access for 45 minutes.
                  </p>
                  <span className={styles.pinFieldLabel}>Create 4-Digit PIN</span>
                  {renderFourDigitBoxes(pinDigits, setPinDigits, pinRefs, false, confirmRefs.current[0])}

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

              {pinMode === "forgot" && (
                <form onSubmit={onSubmitForgot} className={styles.pinFormSection}>
                  <p className={styles.pinSubText}>
                    Verify your registered account email and phone number to set a new 4-digit PIN.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label className={styles.pinFieldLabel}>Registered Account Email</label>
                    <input
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder="e.g. name@example.com"
                      value={resetEmail || userEmail || ""}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className={styles.pinRecoveryInput}
                      required
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                    <label className={styles.pinFieldLabel}>Registered Phone Number</label>
                    <input
                      type="tel"
                      name="phone"
                      autoComplete="tel"
                      placeholder="e.g. +234 801 234 5678"
                      value={resetPhone}
                      onChange={(e) => setResetPhone(e.target.value)}
                      className={styles.pinRecoveryInput}
                      required
                    />
                  </div>

                  <span className={styles.pinFieldLabel}>New 4-Digit PIN</span>
                  {renderFourDigitBoxes(pinDigits, setPinDigits, pinRefs, false, confirmRefs.current[0])}

                  <span className={styles.pinFieldLabel}>Confirm New PIN</span>
                  {renderFourDigitBoxes(confirmDigits, setConfirmDigits, confirmRefs, false)}

                  {pinError && <p className={styles.pinErrorText}>{pinError}</p>}

                  <div className={styles.pinFooterRow}>
                    <button
                      type="button"
                      onClick={() => {
                        onResetInputs();
                        onSwitchMode("verify");
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

              {pinMode === "change" && (
                <form onSubmit={onSubmitChange} className={styles.pinFormSection}>
                  <span className={styles.pinFieldLabel}>Current 4-Digit PIN</span>
                  {renderFourDigitBoxes(
                    currentPinDigits,
                    setCurrentPinDigits,
                    currentPinRefs,
                    false,
                    pinRefs.current[0]
                  )}

                  <span className={styles.pinFieldLabel}>New 4-Digit PIN</span>
                  {renderFourDigitBoxes(pinDigits, setPinDigits, pinRefs, false, confirmRefs.current[0])}

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
                        onResetInputs();
                        setResetEmail(userEmail || "");
                        onSwitchMode("forgot");
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
