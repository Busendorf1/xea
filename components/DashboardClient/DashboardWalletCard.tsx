"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, Send, Lock } from "lucide-react";
import RollingCounter from "@/components/ui/RollingCounter";
import { getUserCurrency, getCurrencyConfig, NGN_PER_USD } from "@/lib/utils/currency";
import { toClientFriendlyApiError, toClientFriendlyError } from "@/lib/utils/clientError";
import { UserProfile } from "./types";
import { isExemptFromBarriersAndInactivity } from "@/lib/adminHelper";
import WalletPinModal, { PinBoxMode } from "./WalletPinModal";
import styles from "./page.module.css";

interface DashboardWalletCardProps {
  user: UserProfile;
  showBalance: boolean;
  onToggleShowBalance: (nextState?: boolean) => void;
  onPinConfigured?: () => void;
  onPinUnlocked?: (pin: string) => void;
  formatCurrency: (amount: number | string) => string;
  onOpenWithdrawModal: () => void;
  onOpenSendMoneyModal: () => void;
  onSelectTab: (tab: string) => void;
}

type PendingWalletAction = "none" | "withdraw" | "send";

export default function DashboardWalletCard({
  user,
  showBalance,
  onToggleShowBalance,
  onPinConfigured,
  onPinUnlocked,
  formatCurrency,
  onOpenWithdrawModal,
  onOpenSendMoneyModal,
  onSelectTab,
}: DashboardWalletCardProps) {
  const isUSD = getUserCurrency(user?.country) === "USD";
  const currencyConfig = getCurrencyConfig(user?.country);
  const displayBalance = isUSD ? (user.balance ?? 0) / NGN_PER_USD : (user.balance ?? 0);
  const currencySymbol = currencyConfig.symbol;

  const clicksCount = Number(user.monetization_clicks ?? 0);
  const isExempt = isExemptFromBarriersAndInactivity(user.email, user as any);
  const isMonetized = Boolean(
    !user.has_cancelled_monetization &&
      (isExempt || user.monetized || clicksCount >= 300)
  );

  const [hasPin, setHasPin] = useState<boolean>(Boolean(user.has_wallet_pin));
  const [pinMode, setPinMode] = useState<PinBoxMode>("closed");
  const [pendingAction, setPendingAction] = useState<PendingWalletAction>("none");

  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", ""]);
  const [confirmDigits, setConfirmDigits] = useState<string[]>(["", "", "", ""]);
  const [currentPinDigits, setCurrentPinDigits] = useState<string[]>(["", "", "", ""]);
  const [resetEmail, setResetEmail] = useState("");
  const [resetPhone, setResetPhone] = useState("");

  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSuccessMsg, setPinSuccessMsg] = useState("");
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [viewportBounds, setViewportBounds] = useState<{
    top: number;
    height: number;
    keyboardOpen: boolean;
  } | null>(null);

  const pinRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);
  const confirmRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);
  const currentPinRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);

  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  useEffect(() => {
    if (pinMode === "closed" || typeof window === "undefined") {
      setViewportBounds(null);
      return;
    }

    const updateViewport = () => {
      const vv = window.visualViewport;
      if (vv) {
        const keyboardOpen = window.innerHeight - vv.height > 120;
        setViewportBounds({
          top: vv.offsetTop,
          height: vv.height,
          keyboardOpen,
        });
      } else {
        setViewportBounds({
          top: 0,
          height: window.innerHeight,
          keyboardOpen: false,
        });
      }
    };

    updateViewport();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", updateViewport);
    vv?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      vv?.removeEventListener("resize", updateViewport);
      vv?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, [pinMode]);

  useEffect(() => {
    if (user.has_wallet_pin) {
      setHasPin(true);
    }
    fetch("/api/wallet/pin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.hasPin === "boolean") {
          setHasPin(d.hasPin);
          if (d.hasPin && !user.has_wallet_pin) {
            onPinConfigured?.();
          }
        }
      })
      .catch(() => {});
  }, [user.has_wallet_pin, onPinConfigured]);

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

  const openPinPrompt = async (actionAfterUnlock: PendingWalletAction = "none") => {
    resetPinInputs();
    setPendingAction(actionAfterUnlock);
    let effectiveHasPin = hasPin;
    if (!effectiveHasPin) {
      try {
        const r = await fetch("/api/wallet/pin");
        if (r.ok) {
          const d = await r.json();
          if (d?.hasPin) {
            effectiveHasPin = true;
            setHasPin(true);
            onPinConfigured?.();
          }
        }
      } catch {}
    }
    const nextMode: PinBoxMode = effectiveHasPin ? "verify" : "setup";
    setPinMode(nextMode);
    setTimeout(() => {
      pinRefs.current[0]?.focus();
    }, 60);
  };

  const handleEyeClick = () => {
    if (showBalance) {
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

  const completeUnlock = (configuredNewPin = false, verifiedPin?: string) => {
    if (configuredNewPin) {
      setHasPin(true);
      onPinConfigured?.();
    }
    if (verifiedPin) {
      onPinUnlocked?.(verifiedPin);
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
    if (pinLoading) return;
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
      const data = await res.json().catch(() => null);
      if (res.ok && data?.verified) {
        completeUnlock(false, fourDigitPin);
      } else if (data?.error === "PIN_NOT_SET") {
        setHasPin(false);
        resetPinInputs();
        setPinMode("setup");
      } else {
        setPinError(toClientFriendlyApiError(res.status, data, "Incorrect 4-digit PIN."));
        setPinDigits(["", "", "", ""]);
        setTimeout(() => pinRefs.current[0]?.focus(), 40);
      }
    } catch (err) {
      setPinError(toClientFriendlyError(err, "Try again later"));
    } finally {
      setPinLoading(false);
    }
  };

  const handleSetupPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinLoading) return;
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
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        completeUnlock(true, pin);
      } else if (
        data?.error &&
        (data.error.includes("already set") || data.error.includes("already configured"))
      ) {
        setHasPin(true);
        onPinConfigured?.();
        resetPinInputs();
        setPinMode("verify");
        setPinError("Your Wallet PIN is already configured. Please enter your 4-digit PIN below to unlock.");
        setTimeout(() => pinRefs.current[0]?.focus(), 40);
      } else {
        setPinError(toClientFriendlyApiError(res.status, data, "Could not save PIN. Try again later"));
      }
    } catch (err) {
      setPinError(toClientFriendlyError(err, "Try again later"));
    } finally {
      setPinLoading(false);
    }
  };

  const handleForgotPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinLoading) return;
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
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setResetEmail("");
        setResetPhone("");
        completeUnlock(true, newPin);
      } else {
        setPinError(
          toClientFriendlyApiError(res.status, data, "Verification failed. Check your email and phone number.")
        );
      }
    } catch (err) {
      setPinError(toClientFriendlyError(err, "Try again later"));
    } finally {
      setPinLoading(false);
    }
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinLoading) return;
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
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        onPinUnlocked?.(newPin);
        setPinSuccessMsg("PIN updated!");
        setTimeout(() => {
          setPinMode("closed");
          resetPinInputs();
        }, 900);
      } else {
        setPinError(toClientFriendlyApiError(res.status, data, "Could not update PIN. Try again later"));
      }
    } catch (err) {
      setPinError(toClientFriendlyError(err, "Try again later"));
    } finally {
      setPinLoading(false);
    }
  };

  const pinPromptModal = (
    <WalletPinModal
      pinMode={pinMode}
      pendingAction={pendingAction}
      pinLoading={pinLoading}
      pinError={pinError}
      pinSuccessMsg={pinSuccessMsg}
      viewportBounds={viewportBounds}
      pinDigits={pinDigits}
      setPinDigits={setPinDigits}
      confirmDigits={confirmDigits}
      setConfirmDigits={setConfirmDigits}
      currentPinDigits={currentPinDigits}
      setCurrentPinDigits={setCurrentPinDigits}
      pinRefs={pinRefs}
      confirmRefs={confirmRefs}
      currentPinRefs={currentPinRefs}
      resetEmail={resetEmail}
      setResetEmail={setResetEmail}
      resetPhone={resetPhone}
      setResetPhone={setResetPhone}
      userEmail={user.email}
      onClose={() => {
        setPinMode("closed");
        setPendingAction("none");
        resetPinInputs();
      }}
      onSwitchMode={setPinMode}
      onSubmitVerify={submitVerifyPin}
      onSubmitSetup={handleSetupPinSubmit}
      onSubmitForgot={handleForgotPinSubmit}
      onSubmitChange={handleChangePinSubmit}
      onResetInputs={resetPinInputs}
      onSetPinError={setPinError}
    />
  );

  return (
    <div className={styles.walletCard}>
      <div className={styles.walletTopRow}>
        <div className={styles.walletHeaderWrap}>
          <h4 className={`${styles.walletHeader} ${styles.walletHeaderMarginZero}`}>
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
          <RollingCounter value={displayBalance} currencyPrefix={currencySymbol} />
        ) : (
          <span
            onClick={() => openPinPrompt("none")}
            className={styles.pinCodePlaceholder}
            title="Click to enter 4-digit PIN"
          >
            {currencySymbol}••••••••
          </span>
        )}
      </div>

      {user.withdrawal > 0 && (
        <p className={styles.pendingWithdrawal}>
          Pending Withdrawal: {showBalance ? formatCurrency(user.withdrawal) : `${currencySymbol}••••`}
        </p>
      )}

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
      {isClientMounted && typeof document !== "undefined" ? createPortal(pinPromptModal, document.body) : null}
    </div>
  );
}
