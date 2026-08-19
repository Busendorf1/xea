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
  Sparkles,
  MousePointerClick,
  Smartphone,
  Users,
  Copy,
  Check,
  TrendingUp,
  Eye,
  Link2,
  Calendar,
  ShieldCheck,
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
  const [isMonetized, setIsMonetized] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_monetize_cache");
        if (cached) return !!JSON.parse(cached).isMonetized;
      } catch {}
    }
    return false;
  });

  const [clicksCount, setClicksCount] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_monetize_cache");
        if (cached) return JSON.parse(cached).clicksCount || 0;
      } catch {}
    }
    return 0;
  });

  const [clicksRemaining, setClicksRemaining] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_monetize_cache");
        if (cached) return JSON.parse(cached).clicksRemaining ?? 300;
      } catch {}
    }
    return 300;
  });

  const [invitesCount, setInvitesCount] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_monetize_cache");
        if (cached) return JSON.parse(cached).invitesCount || 0;
      } catch {}
    }
    return 0;
  });

  const [invitesRemaining, setInvitesRemaining] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_monetize_cache");
        if (cached) return JSON.parse(cached).invitesRemaining ?? 12;
      } catch {}
    }
    return 12;
  });

  const [atwTier, setAtwTier] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_monetize_cache");
        if (cached) return JSON.parse(cached).atwTier || "ATW1";
      } catch {}
    }
    return "ATW1";
  });

  const [referralCode, setReferralCode] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_monetize_cache");
        if (cached) return JSON.parse(cached).referralCode || "";
      } catch {}
    }
    return "";
  });

  const [daysInactive, setDaysInactive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [confirmEmailInput, setConfirmEmailInput] = useState("");
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const fetchStatus = async () => {
    if (!email) return;
    try {
      const res = await fetch("/api/monetize");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        startTransition(() => {
          setIsMonetized(!!data.isMonetized);
          setClicksCount(data.clicksCount || 0);
          setClicksRemaining(data.clicksRemaining ?? Math.max(0, 300 - (data.clicksCount || 0)));
          setInvitesCount(data.invitesCount || 0);
          setInvitesRemaining(data.invitesRemaining ?? Math.max(0, 12 - (data.invitesCount || 0)));
          setAtwTier(data.atwTier || "ATW1");
          setReferralCode(data.referralCode || "");
          setDaysInactive(data.daysInactive || 0);
        });

        try {
          sessionStorage.setItem(
            "paayh_monetize_cache",
            JSON.stringify({
              isMonetized: !!data.isMonetized,
              clicksCount: data.clicksCount || 0,
              clicksRemaining: data.clicksRemaining ?? Math.max(0, 300 - (data.clicksCount || 0)),
              invitesCount: data.invitesCount || 0,
              invitesRemaining: data.invitesRemaining ?? Math.max(0, 12 - (data.invitesCount || 0)),
              atwTier: data.atwTier || "ATW1",
              referralCode: data.referralCode || "",
              daysInactive: data.daysInactive || 0,
            })
          );
        } catch {}
      }
    } catch (e) {
      console.error("Error fetching monetization:", e);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [email]);

  const clicksPercent = Math.min(100, Math.round((clicksCount / 300) * 100));
  const invitesPercent = Math.min(100, Math.round((invitesCount / 12) * 100));

  const atwLevelNum = parseInt(atwTier.replace(/\D/g, ""), 10) || 1;
  const holdingLimitNaira = (atwLevelNum * 100000).toLocaleString("en-NG");

  const referralLink = referralCode
    ? `${typeof window !== "undefined" ? window.location.origin : "https://xea.app"}/join?ref=${referralCode}`
    : "";

  const handleCopyReferral = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>Account Monetization &amp; ATW Levels</h1>
          <p className={styles.subtitle}>
            Monetization is 100% free! Unlock earning rights by completing <strong>EITHER 300 Ad Clicks OR 12 App Download Invites</strong>. Continued referrals and clicks increase your ATW Level and wallet holding cap!
          </p>
        </div>

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
                    {isMonetized ? `Monetization Active (${atwTier})` : "Monetization Inactive"}
                  </h2>
                  <p className={styles.statusSub}>
                    {isMonetized
                      ? `Congratulations! Your account is monetized with ATW Level ${atwLevelNum} (Max wallet cap: ₦${holdingLimitNaira}). Earn on every ad!`
                      : `Complete either 300 ad interactions OR 12 app download invites to activate monetization.`}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className={isMonetized ? styles.badgeActive : styles.badgeProgress}>
                  {isMonetized ? `${atwTier} • MONETIZED` : `${Math.max(clicksPercent, invitesPercent)}% COMPLETED`}
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
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <AlertTriangle size={14} /> Cancel Monetization
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h3 style={{ color: "#f59e0b", fontSize: "1.2rem", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                    <AlertTriangle size={22} color="#f59e0b" />
                    Confirm Monetization Cancellation
                  </h3>
                  <button
                    onClick={() => {
                      setShowCancelModal(false);
                      setCancelError("");
                      setConfirmEmailInput("");
                    }}
                    style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
                  >
                    <X size={18} />
                  </button>
                </div>
                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary, #cbd5e1)", lineHeight: "1.5", marginBottom: "16px" }}>
                  Are you sure you want to cancel your monetization? Your wallet balance is <strong>fully preserved and remains available for withdrawal in accordance with our policies</strong>.
                </p>
                
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "0.82rem", color: "var(--text-muted, #94a3b8)", marginBottom: "6px" }}>
                    Type your email address to confirm:
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

          {/* DUAL QUALIFICATION PATHWAYS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.25rem" }}>
            {/* PATH A: 300 Clicks */}
            <div className={styles.progressCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h3 className={styles.cardSectionTitle} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <MousePointerClick size={20} color="#6366f1" />
                  <span>Path A: 300 Ad Clicks</span>
                </h3>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#6366f1", backgroundColor: "rgba(99,102,241,0.12)", padding: "3px 8px", borderRadius: "6px" }}>
                  {clicksPercent}%
                </span>
              </div>

              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "14px" }}>
                Watch ads and click <strong>Seen</strong> or <strong>Mutual+</strong>. Each interaction adds +1 click.
              </p>

              <div className={styles.metricsGrid}>
                <div className={styles.metricBox}>
                  <span className={styles.metricLabel} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Eye size={12} color="#6366f1" /> Clicks Done
                  </span>
                  <strong className={styles.metricValue}>{clicksCount} / 300</strong>
                </div>
                <div className={styles.metricBox}>
                  <span className={styles.metricLabel} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={12} color="#f59e0b" /> Remaining
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

            {/* PATH B: 12 App Download Invites */}
            <div className={styles.progressCard} style={{ border: "1px solid rgba(16, 185, 129, 0.3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h3 className={styles.cardSectionTitle} style={{ color: "#10b981", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Smartphone size={20} color="#10b981" />
                  <span>Path B: 12 App Invites</span>
                </h3>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#10b981", backgroundColor: "rgba(16,185,129,0.12)", padding: "3px 8px", borderRadius: "6px" }}>
                  {invitesPercent}%
                </span>
              </div>

              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "14px" }}>
                Invite friends to download on iOS &amp; Android. Verified installs immediately unlock monetization!
              </p>

              <div className={styles.metricsGrid}>
                <div className={styles.metricBox}>
                  <span className={styles.metricLabel} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Users size={12} color="#10b981" /> Qualified Invites
                  </span>
                  <strong className={styles.metricValue} style={{ color: "#10b981" }}>{invitesCount} / 12</strong>
                </div>
                <div className={styles.metricBox}>
                  <span className={styles.metricLabel} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={12} color="#f59e0b" /> Remaining
                  </span>
                  <strong className={styles.metricValueRemaining}>{invitesRemaining} invites</strong>
                </div>
              </div>

              <div className={styles.progressBarWrapper}>
                <div className={styles.progressBarTrack}>
                  <div className={styles.progressBarFill} style={{ width: `${invitesPercent}%`, backgroundColor: "#10b981" }} />
                </div>
              </div>

              {/* Referral Link Copy Section */}
              {referralLink && (
                <div style={{ marginTop: "1rem", display: "flex", gap: "8px", alignItems: "center" }}>
                  <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
                    <Link2 size={14} color="#94a3b8" style={{ position: "absolute", left: "10px" }} />
                    <input
                      type="text"
                      readOnly
                      value={referralLink}
                      style={{
                        width: "100%",
                        padding: "8px 10px 8px 30px",
                        fontSize: "0.8rem",
                        borderRadius: "8px",
                        border: "1px solid var(--card-border)",
                        backgroundColor: "var(--background)",
                        color: "var(--foreground)",
                      }}
                    />
                  </div>
                  <button
                    onClick={handleCopyReferral}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: copied ? "#10b981" : "var(--primary)",
                      color: "#fff",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copied ? "Copied!" : "Copy Link"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ATW LEVEL PROGRESSION CARD */}
          <div className={styles.infoCard} style={{ backgroundColor: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h4 className={styles.infoTitle} style={{ margin: 0, color: "#6366f1", display: "flex", alignItems: "center", gap: "6px" }}>
                <TrendingUp size={18} color="#6366f1" />
                <span>ATW Tier Progression &amp; Balance Holding Caps</span>
              </h4>
              <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#6366f1", display: "flex", alignItems: "center", gap: "4px" }}>
                <Sparkles size={14} color="#6366f1" /> Current: {atwTier} (₦{holdingLimitNaira} Cap)
              </span>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5, marginTop: "4px" }}>
              Every <strong>15 additional download invites</strong> OR <strong>300 additional clicks</strong> increases your ATW level by +1, raising your maximum wallet holding limit by ₦100,000.00 up to ATW14 (₦1.4M max cap).
            </p>
          </div>

          {/* 7-Day Inactivity Warning Card */}
          <div className={styles.policyCard}>
            <div className={styles.policyHeader}>
              <Calendar size={22} color="#f59e0b" />
              <h4 style={{ color: "#f59e0b" }}>7-Day Activity Policy</h4>
            </div>
            <p className={styles.policyDesc}>
              To maintain monetization, you must remain an active community member. If you are inactive for 7 consecutive days without logging in or interacting, your monetization status will pause and clicks reset to 0. Logging in automatically keeps your activity active.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
