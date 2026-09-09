"use client";

import { useEffect, useState, useTransition } from "react";
import { cancelMonetizationSchema } from "@/lib/validationSchemas";
import styles from "./page.module.css";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Award,
  Sparkles,
  MousePointer,
  ShieldCheck,
  Calendar,
  X,
} from "lucide-react";

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
  const [, startTransition] = useTransition();

  // Instant SWR state initialization from client storage for 0ms load
  const [hasResolved, setHasResolved] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("paayh_monetize_cache") || sessionStorage.getItem("paayh_monetize_cache");
        if (cached) return true;
      } catch {}
    }
    return false;
  });

  const [isMonetized, setIsMonetized] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("paayh_monetize_cache") || sessionStorage.getItem("paayh_monetize_cache");
        if (cached) return !!JSON.parse(cached).isMonetized;
      } catch {}
    }
    return false;
  });

  const [clicksCount, setClicksCount] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("paayh_monetize_cache") || sessionStorage.getItem("paayh_monetize_cache");
        if (cached) return JSON.parse(cached).clicksCount || 0;
      } catch {}
    }
    return 0;
  });

  const [clicksRemaining, setClicksRemaining] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("paayh_monetize_cache") || sessionStorage.getItem("paayh_monetize_cache");
        if (cached) return JSON.parse(cached).clicksRemaining ?? 300;
      } catch {}
    }
    return 300;
  });

  const [atwTier, setAtwTier] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("paayh_monetize_cache") || sessionStorage.getItem("paayh_monetize_cache");
        if (cached) return JSON.parse(cached).atwTier || "ATW1";
      } catch {}
    }
    return "ATW1";
  });

  const [daysInactive, setDaysInactive] = useState(0);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [confirmEmailInput, setConfirmEmailInput] = useState("");
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const fetchStatus = async () => {
    if (!email) return;
    try {
      const res = await fetch("/api/monetize");
      if (!res.ok) {
        setHasResolved(true);
        return;
      }
      const data = await res.json();
      if (data.success) {
        startTransition(() => {
          setIsMonetized(!!data.isMonetized);
          setClicksCount(data.clicksCount || 0);
          setClicksRemaining(data.clicksRemaining ?? Math.max(0, 300 - (data.clicksCount || 0)));
          setAtwTier(data.atwTier || "ATW1");
          setDaysInactive(data.daysInactive || 0);
          setHasResolved(true);
        });

        try {
          const cachePayload = JSON.stringify({
            isMonetized: !!data.isMonetized,
            clicksCount: data.clicksCount || 0,
            clicksRemaining: data.clicksRemaining ?? Math.max(0, 300 - (data.clicksCount || 0)),
            atwTier: data.atwTier || "ATW1",
            daysInactive: data.daysInactive || 0,
          });
          localStorage.setItem("paayh_monetize_cache", cachePayload);
          sessionStorage.setItem("paayh_monetize_cache", cachePayload);
        } catch {}
      } else {
        setHasResolved(true);
      }
    } catch (e) {
      console.error("Error fetching monetization:", e);
      setHasResolved(true);
    }
  };

  useEffect(() => {
    fetchStatus();

    const onFocus = () => {
      fetchStatus();
    };

    const handleClickIncrement = (e: Event) => {
      const customEvent = e as CustomEvent;
      const delta = customEvent.detail?.delta || 1;
      setClicksCount((prev: number) => {
        const next = prev + delta;
        setClicksRemaining(Math.max(0, 300 - next));
        if (next >= 300) setIsMonetized(true);
        return next;
      });
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("xea:click-increment", handleClickIncrement);

    const interval = setInterval(fetchStatus, 15000);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("xea:click-increment", handleClickIncrement);
      clearInterval(interval);
    };
  }, [email]);

  const clicksPercent = Math.min(100, Math.round((clicksCount / 300) * 100));

  const atwLevelNum = parseInt(atwTier.replace(/\D/g, ""), 10) || 1;

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>Monetization</h1>
          <p className={styles.subtitle}>
            Higher ATW tiers increase your earnings and wallet holding cap.
          </p>
        </div>

        <div className={styles.contentGrid}>
          {/* Status Banner */}
          <div className={`${styles.statusCard} ${isMonetized ? styles.statusMonetized : styles.statusPending}`}>
            <div className={styles.statusHeaderRow}>
              <div className={styles.statusTitleGroup}>
                <div className={isMonetized ? styles.iconBadgeSuccess : styles.iconBadgePending}>
                  {isMonetized ? (
                    <ShieldCheck size={22} className={styles.successIcon} />
                  ) : (
                    <Clock size={22} className={styles.pendingIcon} />
                  )}
                </div>
                <div>
                  <h2 className={styles.statusTitle}>
                    {isMonetized ? "Active • ATW Level " + atwLevelNum : "Not Monetized"}
                  </h2>
                  <p className={styles.statusSub}>
                    {isMonetized
                      ? `Your account is monetized at ATW Tier ${atwTier}.`
                      : "Complete 300 ad clicks in the feed to unlock monetization."}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className={isMonetized ? styles.badgeActive : styles.badgeProgress}>
                  {isMonetized ? "Monetized" : `${clicksPercent}% Complete`}
                </span>
                {isMonetized && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className={styles.cancelBtn}
                  >
                    <AlertTriangle size={14} /> Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* CANCELLATION CONFIRMATION MODAL */}
          {showCancelModal && (
            <div className={styles.modalOverlay}>
              <div className={styles.modalCard}>
                <div className={styles.modalHeader}>
                  <h3 className={styles.modalTitle}>
                    <AlertTriangle size={20} color="var(--danger)" />
                    Confirm Cancellation
                  </h3>
                  <button
                    onClick={() => {
                      setShowCancelModal(false);
                      setCancelError("");
                      setConfirmEmailInput("");
                    }}
                    className={styles.modalCloseBtn}
                    aria-label="Close modal"
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className={styles.modalText}>
                  Are you sure you want to cancel your monetization? Your wallet balance is <strong>fully preserved and remains available for withdrawal</strong>.
                </p>
                
                <div className={styles.modalFieldGroup}>
                  <label className={styles.modalLabel}>
                    Type your email address to confirm:
                  </label>
                  <input
                    type="email"
                    placeholder="Enter Email"
                    value={confirmEmailInput}
                    onChange={(e) => setConfirmEmailInput(e.target.value)}
                    className={styles.modalInput}
                  />
                </div>

                {cancelError && (
                  <div className={styles.modalError}>
                    <AlertCircle size={16} color="var(--danger)" />
                    <span>{cancelError}</span>
                  </div>
                )}

                <div className={styles.modalFooter}>
                  <button
                    onClick={() => {
                      setShowCancelModal(false);
                      setCancelError("");
                      setConfirmEmailInput("");
                    }}
                    className={styles.modalCancelBtn}
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
                    className={styles.modalConfirmBtn}
                  >
                    {isSubmittingCancel ? "Cancelling..." : "Confirm Cancellation"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* QUALIFICATION PROGRESS CARD */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.25rem" }}>
            {/* 300 Ad Clicks */}
            <div className={styles.progressCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h3 className={styles.cardSectionTitle} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div className={styles.titleIconBox}>
                    <Award size={18} color="var(--primary)" />
                  </div>
                  <span>Requirement: 300 Ad Clicks</span>
                </h3>
                <span className={styles.percentBadge}>
                  {clicksPercent}%
                </span>
              </div>

              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "16px", lineHeight: 1.5 }}>
                Click <strong>Seen</strong>, <strong>Earn+</strong>, or <strong>Mutual+</strong> on ads to increment your progress.
              </p>

              <div className={styles.metricsGrid}>
                <div className={styles.metricBox}>
                  <span className={styles.metricLabel} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <MousePointer size={13} color="var(--primary)" /> Completed
                  </span>
                  <strong className={styles.metricValue}>{clicksCount} / 300</strong>
                </div>
                <div className={styles.metricBox}>
                  <span className={styles.metricLabel} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Clock size={13} color="var(--primary)" /> Remaining
                  </span>
                  <strong className={styles.metricValueRemaining}>{clicksRemaining} clicks</strong>
                </div>
              </div>

              <div className={styles.progressBarWrapper}>
                <div className={styles.progressBarTrack}>
                  <div className={styles.progressBarFill} style={{ width: `${clicksPercent}%` }} />
                </div>
              </div>

              <div style={{ marginTop: "1rem" }}>
                <Link href="/" className={styles.feedBtn}>
                  <span>Go to Feed</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </div>

          {/* 7-Day Inactivity Warning Card */}
          <div className={styles.policyCard}>
            <div className={styles.policyHeader}>
              <div className={styles.policyIconBox}>
                <Calendar size={18} color="var(--primary)" />
              </div>
              <h4 style={{ color: "var(--foreground)" }}>7-Day Activity Policy</h4>
            </div>
            <p className={styles.policyDesc}>
              Log in at least once every 7 days. After 7 days of zero activity, monetization pauses and click progress resets.
            </p>
            {daysInactive > 0 && (
              <p style={{ marginTop: "10px", fontSize: "0.85rem", color: "var(--danger)", fontWeight: 700 }}>
                Current Inactivity: {daysInactive} day{daysInactive > 1 ? "s" : ""} / 7 days
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
