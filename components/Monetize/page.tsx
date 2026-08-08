"use client";

import { useEffect, useState } from "react";
import { cancelMonetizationSchema } from "@/lib/validationSchemas";
import styles from "./page.module.css";
import Link from "next/link";
import Footer from "../Footers/page";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Activity, AlertCircle } from "lucide-react";

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

export default function Monetize({ session }: MonetizeProps) {
  const email = session?.user?.email;

  const [loading, setLoading] = useState(true);
  const [isMonetized, setIsMonetized] = useState(false);
  const [clicksCount, setClicksCount] = useState(0);
  const [clicksRemaining, setClicksRemaining] = useState(300);
  const [daysInactive, setDaysInactive] = useState(0);
  const [message, setMessage] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [confirmEmailInput, setConfirmEmailInput] = useState("");
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const fetchStatus = async () => {
    if (!email) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/monetize?t=${Date.now()}`);
      if (!res.ok) {
        setMessage("Failed to load monetization status.");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setIsMonetized(!!data.isMonetized);
        setClicksCount(data.clicksCount || 0);
        setClicksRemaining(data.clicksRemaining ?? Math.max(0, 300 - (data.clicksCount || 0)));
        setDaysInactive(data.daysInactive || 0);
      }
    } catch (e: any) {
      console.error("Error fetching monetization:", e);
      setMessage("Error loading status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [email]);

  const progressPercent = Math.min(100, Math.round((clicksCount / 300) * 100));

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>Account Monetization</h1>
          <p className={styles.subtitle}>
            Monetization on Paayh is 100% free! Complete 300 ad clicks (seens & mutuals) to activate your account monetization. No payments required.
          </p>
        </div>

        {loading ? (
          <div className={styles.loadingBox}>
            <Activity className={styles.spinIcon} size={28} />
            <p>Loading your monetization progress...</p>
          </div>
        ) : (
          <div className={styles.contentGrid}>
            {/* Status Banner */}
            <div className={`${styles.statusCard} ${isMonetized ? styles.statusMonetized : styles.statusPending}`}>
              <div className={styles.statusHeaderRow}>
                <div className={styles.statusTitleGroup}>
                  {isMonetized ? (
                    <CheckCircle2 size={26} className={styles.successIcon} />
                  ) : (
                    <Clock size={26} className={styles.pendingIcon} />
                  )}
                  <div>
                    <h2 className={styles.statusTitle}>
                      {isMonetized ? "Monetization Active" : "Monetization Inactive"}
                    </h2>
                    <p className={styles.statusSub}>
                      {isMonetized
                        ? "Congratulations! Your account is fully monetized. You can now earn on ads."
                        : `Complete 300 ad interactions to unlock full account monetization.`}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span className={isMonetized ? styles.badgeActive : styles.badgeProgress}>
                    {isMonetized ? "MONETIZED" : `${progressPercent}% COMPLETED`}
                  </span>
                  {isMonetized && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "6px",
                        background: "rgba(245, 158, 11, 0.15)",
                        border: "1px solid #f59e0b",
                        color: "#f59e0b",
                        fontWeight: 600,
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      Cancel Monetization
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Cancel Monetization Modal */}
            {showCancelModal && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  backgroundColor: "rgba(0,0,0,0.85)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 9999,
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    background: "var(--card-bg, #12141a)",
                    border: "1px solid var(--border-color, rgba(255,255,255,0.15))",
                    borderRadius: "12px",
                    padding: "24px",
                    maxWidth: "480px",
                    width: "100%",
                    color: "#fff",
                  }}
                >
                  <h3 style={{ color: "#f59e0b", fontSize: "1.2rem", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <AlertTriangle size={22} color="#f59e0b" />
                    Confirm Monetization Cancellation
                  </h3>
                  <p style={{ fontSize: "0.9rem", color: "var(--text-secondary, #cbd5e1)", lineHeight: "1.5", marginBottom: "16px" }}>
                    Are you sure you want to cancel your monetization? Your wallet balance is <strong>fully preserved and remains available for withdrawal in accordance with our policies</strong>. No future ad earnings will accumulate until you click <strong>Resume Monetization</strong> and complete the 300-clicks path again.
                  </p>
                  
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "0.82rem", color: "var(--text-muted, #94a3b8)", marginBottom: "6px" }}>
                      Type your email address to confirm (Human Verification):
                    </label>
                    <input
                      type="email"
                      placeholder="Enter Email"
                      value={confirmEmailInput}
                      onChange={(e) => setConfirmEmailInput(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color, rgba(255,255,255,0.2))",
                        background: "rgba(0,0,0,0.3)",
                        color: "#fff",
                        fontSize: "0.9rem",
                        outline: "none",
                      }}
                    />
                  </div>

                  {cancelError && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#ef4444", fontSize: "0.85rem", marginBottom: "14px", fontWeight: 600 }}>
                      <AlertCircle size={16} color="#ef4444" />
                      <span>{cancelError}</span>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => {
                        setShowCancelModal(false);
                        setCancelError("");
                        setConfirmEmailInput("");
                      }}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        background: "rgba(255,255,255,0.1)",
                        border: "1px solid var(--border-color, rgba(255,255,255,0.2))",
                        color: "#fff",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Not now
                    </button>

                    <button
                      disabled={isSubmittingCancel}
                      onClick={async () => {
                        const validation = cancelMonetizationSchema.safeParse({ email: confirmEmailInput });
                        if (!validation.success) {
                          setCancelError(validation.error.issues[0]?.message || "Please type a valid email address.");
                          return;
                        }
                        try {
                          setIsSubmittingCancel(true);
                          setCancelError("");
                          const res = await fetch("/api/monetize/cancel", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ confirmEmail: confirmEmailInput }),
                          });
                          const data = await res.json();
                          if (!res.ok || data.error) {
                            setCancelError(data.error || "Failed to cancel monetization.");
                            return;
                          }
                          setShowCancelModal(false);
                          setConfirmEmailInput("");
                          fetchStatus();
                        } catch (err: any) {
                          setCancelError(err.message || "Network error.");
                        } finally {
                          setIsSubmittingCancel(false);
                        }
                      }}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                        border: "none",
                        color: "#000",
                        fontWeight: 700,
                        cursor: "pointer",
                        opacity: isSubmittingCancel ? 0.6 : 1,
                      }}
                    >
                      {isSubmittingCancel ? "Cancelling..." : "Confirm Cancellation"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* If NOT Monetized: Show 300 Clicks Progress Tracker & Onboarding Explainer */}
            {!isMonetized && (
              <>
                {/* 300 Clicks Progress Card */}
                <div className={styles.progressCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 className={styles.cardSectionTitle}>300 Clicks Progress Tracker</h3>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/monetize/resume", { method: "POST" });
                          const data = await res.json();
                          if (data.message) alert(data.message);
                          fetchStatus();
                        } catch {
                          alert("Resumed 300-clicks monetization path.");
                        }
                      }}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "6px",
                        background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                        border: "none",
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      Resume Monetization Path
                    </button>
                  </div>
                  
                  <div className={styles.metricsGrid}>
                    <div className={styles.metricBox}>
                      <span className={styles.metricLabel}>Clicks Achieved</span>
                      <strong className={styles.metricValue}>{clicksCount} / 300</strong>
                    </div>

                    <div className={styles.metricBox}>
                      <span className={styles.metricLabel}>Clicks Remaining</span>
                      <strong className={styles.metricValueRemaining}>
                        {clicksRemaining} clicks
                      </strong>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className={styles.progressBarWrapper}>
                    <div className={styles.progressBarTrack}>
                      <div
                        className={styles.progressBarFill}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className={styles.progressLabelRow}>
                      <span>0 clicks</span>
                      <span className={styles.progressPercentText}>{progressPercent}% Achieved</span>
                      <span>300 clicks Goal</span>
                    </div>
                  </div>

                  <div className={styles.ctaRow}>
                    <Link href="/" className={styles.feedBtn}>
                      <span>Go to Feed to Earn Clicks</span>
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>

                {/* Button Rules Explainer */}
                <div className={styles.infoCard}>
                  <h4 className={styles.infoTitle}>How Button Visibility & Earnings Work</h4>
                  <ul className={styles.infoList}>
                    <li>
                      <strong>Not Monetized Accounts</strong>: You can see and use the <strong>"Seen"</strong> and <strong>"Mutual"</strong> buttons on ad cards. Every interaction adds 1 click to your 300 clicks progress.
                    </li>
                    <li>
                      <strong>Monetized Accounts</strong>: Once you hit 300 clicks, your account automatically unlocks the <strong>"Earn+"</strong> button, allowing you to earn cash directly into your wallet balance on ads.
                    </li>
                  </ul>
                </div>
              </>
            )}

            {/* 7-Day Inactivity Warning Card */}
            <div className={styles.policyCard}>
              <div className={styles.policyHeader}>
                <AlertTriangle size={22} color="#f59e0b" />
                <h4 style={{ color: "#f59e0b" }}>7-Day Activity Policy</h4>
              </div>
              <p className={styles.policyDesc}>
                To maintain monetization, you must remain an active community member. If you are inactive (no clicks or interactions) for 7 consecutive days, your monetization status will be withdrawn and your click counter will reset to 0. Upon returning, you will need to click <strong>Resume Monetization</strong> and complete 300 clicks all over again.
              </p>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
