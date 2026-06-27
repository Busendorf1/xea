"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/utils/db";
import styles from "./page.module.css";
import Link from "next/link";

interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

type MonetizeProps = {
  session: Session;
};

const formatCurrency = (amount: number | string) => {
  const val = typeof amount === "string" ? parseFloat(amount) : amount;
  return isNaN(val) ? "₦0.00" : "₦" + val.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function Monetize({ session }: MonetizeProps) {
  const email = session?.user?.email;

  const [loading, setLoading] = useState(true);
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  const [isCurrentlyMonetized, setIsCurrentlyMonetized] = useState(false);
  const [monetizationType, setMonetizationType] = useState<string | null>(null);
  const [monetizedUntil, setMonetizedUntil] = useState<string | null>(null);
  const [monetizedAt, setMonetizedAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [cardLoading, setCardLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [confirmEmailInput, setConfirmEmailInput] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [walletBalance, setWalletBalance] = useState(0);

  const fetchStatus = async () => {
    if (!email) return;
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) {
        setMessage("Error fetching account info.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!data) {
        setMessage("Error fetching account info.");
        setLoading(false);
        return;
      }

      setUserCreatedAt(data.created_at);
      setMonetizationType(data.monetization_type || null);
      setMonetizedUntil(data.monetized_until || null);
      setMonetizedAt(data.monetized_at || null);

      const active = !!(
        (data.monetized === "yes" || data.monetized === "true" || data.monetized === true) &&
        (!data.monetized_until || new Date(data.monetized_until).getTime() > Date.now())
      );
      setIsCurrentlyMonetized(active);
      setWalletBalance(parseFloat(data.balance ?? 0));
    } catch (e) {
      console.error(e);
      setMessage("Error loading monetization status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [email]);

  const handleInstantMonetize = async () => {
    if (!email) return;
    setCardLoading(true);
    try {
      const response = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "monetization_instant",
          amount: 60000,
          metadata: {
            type: "monetization_instant",
            user_email: email.toLowerCase()
          },
          callbackUrl: `${window.location.origin}/user/statement`
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setMessage(`Failed to initialize payment: ${data.error || "Server error"}`);
      } else {
        alert("Redirecting to Paystack to complete your Instant Monetization payment...");
        window.location.href = data.authorization_url;
      }
    } catch (e: any) {
      setMessage(`An unexpected error occurred: ${e.message}`);
    } finally {
      setCardLoading(false);
    }
  };

  const handleInstantMonetizeWallet = async () => {
    if (!email) return;
    if (walletBalance < 60000) {
      setMessage(`Insufficient wallet balance. You need at least ${formatCurrency(60000)} to pay with wallet.`);
      return;
    }
    if (!confirm(`Deduct ${formatCurrency(60000)} from your wallet balance for Instant Monetization?`)) return;
    setWalletLoading(true);
    try {
      const response = await fetch("/api/payments/wallet-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "monetization_instant",
          amount: 60000,
          metadata: { type: "monetization_instant", user_email: email.toLowerCase() }
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setMessage(`Payment failed: ${data.error || "Server error"}`);
      } else {
        alert("✅ Instant Monetization activated! Your subscription is now live.");
        fetchStatus();
      }
    } catch (e: any) {
      setMessage(`An unexpected error occurred: ${e.message}`);
    } finally {
      setWalletLoading(false);
    }
  };

  const handleCancelMonetization = async () => {
    if (!email) return;
    if (confirmEmailInput.toLowerCase().trim() !== email.toLowerCase().trim()) {
      setCancelError("Please type your exact email to confirm cancellation.");
      return;
    }
    setCardLoading(true);
    setCancelError("");
    try {
      const response = await fetch("/api/monetize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "cancel" })
      });

      if (!response.ok) {
        const err = await response.json();
        setCancelError(`Cancellation failed: ${err.error || "Server error"}`);
      } else {
        alert("Your monetization subscription has been cancelled immediately.");
        setShowCancelConfirmation(false);
        setConfirmEmailInput("");
        fetchStatus();
      }
    } catch (e: any) {
      setCancelError(`An unexpected error occurred: ${e.message}`);
    } finally {
      setCardLoading(false);
    }
  };

  if (!email) {
    return (
      <div className={styles.container}>
        <p className={styles.error}>Please log in to monetize your account.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <p className={styles.info}>Loading account info...</p>
      </div>
    );
  }

  const accountAgeInDays = userCreatedAt
    ? Math.floor((Date.now() - new Date(userCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const daysRemainingUntilStandard = Math.max(90 - accountAgeInDays, 0);

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Account Monetization</h1>
      <p className={styles.subheading}>Maximize your attention. Earn from views and engagement.</p>

      {isCurrentlyMonetized ? (
        <div className={styles.premiumCard}>
          <div className={styles.statusBanner}>
            <div className={styles.statusTitle}>Monetization Active</div>
            <div className={styles.statusDesc}>
              Your account is successfully configured to receive earnings from ad impressions.
            </div>
          </div>

          <div className={styles.detailsList}>
            <div className={styles.detailRow}>
              <span>Status</span>
              <span style={{ color: "#10b981" }}>Active</span>
            </div>
            <div className={styles.detailRow}>
              <span>Plan Type</span>
              <span>{monetizationType === "instant" ? "Instant Monetization" : "Standard Monetization"}</span>
            </div>
            {monetizedAt && (
              <div className={styles.detailRow}>
                <span>Billing Date</span>
                <span>{new Date(monetizedAt).toLocaleDateString()}</span>
              </div>
            )}
            {monetizedUntil && (
              <div className={styles.detailRow}>
                <span>Expiration Date</span>
                <span>{new Date(monetizedUntil).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {monetizationType === "instant" ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center" }}>
              You are on the Instant plan ({formatCurrency(60000)} / month). Renewal options will appear when your subscription is close to expiry.
            </p>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center" }}>
              Your standard subscription is active. Renewals ({formatCurrency(28000)} / month) are available directly on your Profile page.
            </p>
          )}

          <div style={{ marginTop: "2rem", display: "flex", justifyContent: "center" }}>
            <Link href={`/user/${email.split("@")[0]}`} className={`${styles.actionBtn} ${styles.secondaryBtn}`} style={{ width: "auto" }}>
              Go to Profile Dashboard
            </Link>
          </div>

          {showCancelConfirmation ? (
            <div className={styles.cancelBox}>
              <h3 className={styles.cancelTitle}>Cancel Monetization</h3>
              <p className={styles.cancelWarning}>
                Discontinuing your monetization will instantly deactivate your ability to earn from ad views and impressions. Please note that no refunds will be issued for the remaining cycle.
              </p>
              <div className={styles.formGroup} style={{ marginTop: "1rem", marginBottom: "1rem" }}>
                <label className={styles.fieldLabel} style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem", display: "block", textAlign: "left" }}>
                  To confirm, type your email: <strong>{email}</strong>
                </label>
                <input
                  type="text"
                  placeholder={email}
                  value={confirmEmailInput}
                  onChange={(e) => setConfirmEmailInput(e.target.value)}
                  className={styles.inputBox}
                />
              </div>
              {cancelError && <p className={styles.error} style={{ textAlign: "left", fontSize: "0.85rem", marginTop: "0.5rem", marginBottom: "1.25rem" }}>{cancelError}</p>}
              <div className={styles.cancelActions}>
                <button
                  type="button"
                  disabled={cardLoading}
                  onClick={handleCancelMonetization}
                  className={`${styles.actionBtn} ${styles.dangerBtn}`}
                  style={{ width: "auto" }}
                >
                  {cardLoading ? "Cancelling..." : "Confirm Cancellation"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelConfirmation(false);
                    setConfirmEmailInput("");
                    setCancelError("");
                  }}
                  className={`${styles.actionBtn} ${styles.secondaryBtn}`}
                  style={{ width: "auto" }}
                >
                  Keep Subscription
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--card-border)", paddingTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowCancelConfirmation(true)}
                className={`${styles.actionBtn} ${styles.dangerLinkBtn}`}
                style={{ width: "auto" }}
              >
                Cancel Subscription
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.premiumCard}>
          <div style={{ marginBottom: "2.5rem", fontSize: "0.95rem", lineHeight: "1.6", color: "var(--text-muted)" }}>
            <p style={{ marginBottom: "1rem" }}>
              Xea values your attention. Monetized members receive <strong>60%</strong> of ad campaign values for impressions they view.
            </p>
            <p>
              Choose between normal eligibility or skip the queue with instant activation.
            </p>
          </div>

          {message && <p className={styles.error}>{message}</p>}

          <div className={styles.grid}>
            {/* Standard Plan */}
            <div className={styles.optionCard}>
              <div className={styles.optionHeader}>
                <div className={styles.optionTitle}>Standard Path</div>
                <div className={styles.optionPrice}>{formatCurrency(28000)}</div>
                <div className={styles.optionPeriod}>Per 30 Days</div>
              </div>
              <div className={styles.optionDescription}>
                Available for established accounts active for at least 90 days. Once eligible, pay {formatCurrency(28000)} monthly to stay monetized.
              </div>
              
              {daysRemainingUntilStandard > 0 ? (
                <div>
                  <div className={styles.countdownBox} style={{ padding: "1rem", marginBottom: "1rem" }}>
                    <div className={styles.countdownNumber} style={{ fontSize: "2rem" }}>{daysRemainingUntilStandard}</div>
                    <div className={styles.countdownLabel} style={{ fontSize: "0.75rem" }}>Days Until Eligible</div>
                  </div>
                  <button disabled className={styles.actionBtn} style={{ opacity: 0.5 }}>
                    Not Yet Eligible
                  </button>
                </div>
              ) : (
                <Link href={`/user/${email.split("@")[0]}`} className={styles.actionBtn}>
                  Activate via Profile
                </Link>
              )}
            </div>

            {/* Instant Plan */}
            <div className={styles.optionCard} style={{ borderColor: "rgba(16, 185, 129, 0.4)", backgroundColor: "rgba(16, 185, 129, 0.02)" }}>
              <div className={styles.optionHeader}>
                <div className={styles.optionTitle} style={{ color: "#10b981" }}>Instant Activation</div>
                <div className={styles.optionPrice}>{formatCurrency(60000)}</div>
                <div className={styles.optionPeriod}>Per 30 Days</div>
              </div>
              <div className={styles.optionDescription}>
                Skip the 90-day waiting period and activate monetization immediately. Pay {formatCurrency(60000)} monthly to receive ad earnings.
              </div>
              <button
                disabled={cardLoading || walletLoading}
                onClick={handleInstantMonetize}
                className={styles.actionBtn}
                style={{ backgroundColor: "#10b981" }}
              >
                {cardLoading ? "Processing..." : "Monetize via Card/Bank"}
              </button>
              {walletBalance >= 60000 && (
                <button
                  disabled={cardLoading || walletLoading}
                  onClick={handleInstantMonetizeWallet}
                  className={styles.actionBtn}
                  style={{ backgroundColor: "#059669", marginTop: "0.5rem" }}
                >
                  {walletLoading ? "Processing..." : `Pay with Wallet (${formatCurrency(60000)})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
