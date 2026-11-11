"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { cancelMonetizationSchema } from "@/lib/validationSchemas";
import supabase from "@/lib/utils/db";
import styles from "./page.module.css";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Award,
  MousePointer,
  ShieldCheck,
  Calendar,
  X,
} from "lucide-react";
import { computeAtwTierDetails } from "@/lib/attentionTierEngine";
import { isExemptFromBarriersAndInactivity } from "@/lib/adminHelper";
import Skeleton from "@/components/ui/Skeleton";

interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

type MonetizeProps = {
  session: Session;
  initialMonetized?: boolean;
  initialClicks?: number;
  initialAtwTier?: string;
};

export default function Monetize({ session, initialMonetized, initialClicks, initialAtwTier }: MonetizeProps) {
  const email = session?.user?.email;
  const [, startTransition] = useTransition();

  const isExempt = isExemptFromBarriersAndInactivity(email);

  const [initialCache] = useState<{
    hasCached: boolean;
    isMonetized?: boolean;
    hasCancelled?: boolean;
    clicksCount?: number;
    clicksRemaining?: number;
    atwTier?: string;
  }>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("paayh_monetize_cache_v2") || sessionStorage.getItem("paayh_monetize_cache_v2");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (!parsed.email || !email || parsed.email === email.toLowerCase()) {
            return {
              hasCached: true,
              isMonetized: typeof parsed.isMonetized === "boolean" ? parsed.isMonetized : undefined,
              hasCancelled: Boolean(parsed.hasCancelled),
              clicksCount: typeof parsed.clicksCount === "number" ? parsed.clicksCount : undefined,
              clicksRemaining: typeof parsed.clicksRemaining === "number" ? parsed.clicksRemaining : undefined,
              atwTier: parsed.atwTier || undefined,
            };
          }
        }
      } catch {}
    }
    return { hasCached: false };
  });

  // Instant SWR state initialization from client storage or props for 0ms load
  const [hasResolved, setHasResolved] = useState(() => {
    if (typeof initialClicks === "number" && typeof initialMonetized === "boolean") return true;
    if (initialCache.hasCached && typeof initialCache.clicksCount === "number") return true;
    return false;
  });

  const [hasCancelled, setHasCancelled] = useState(() => {
    if (typeof initialCache.hasCancelled === "boolean") return initialCache.hasCancelled;
    return false;
  });

  const [isMonetized, setIsMonetized] = useState(() => {
    if (isExempt) return true;
    if (initialCache.hasCancelled) return false;
    if (typeof initialClicks === "number") return initialClicks >= 300;
    if (typeof initialCache.clicksCount === "number") return initialCache.clicksCount >= 300;
    if (typeof initialMonetized === "boolean") return initialMonetized;
    if (typeof initialCache.isMonetized === "boolean") return initialCache.isMonetized;
    return false;
  });

  const [isResuming, setIsResuming] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startHold = () => {
    if (isSubmittingCancel) return;
    setHoldProgress(0);
    const startTime = Date.now();
    const duration = 2000;

    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setHoldProgress(progress);
      if (elapsed >= duration) {
        if (holdIntervalRef.current) {
          clearInterval(holdIntervalRef.current);
          holdIntervalRef.current = null;
        }
        executeCancel({ holdConfirmed: true });
      }
    }, 25);
  };

  const cancelHold = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldProgress(0);
  };

  const executeCancel = async (payload: { confirmEmail?: string; holdConfirmed?: boolean }) => {
    try {
      setIsSubmittingCancel(true);
      setCancelError("");
      const res = await fetch("/api/monetize/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCancelError(data.error || "Failed to cancel monetization.");
        return;
      }
      setShowCancelModal(false);
      setConfirmEmailInput("");
      setHoldProgress(0);
      setHasCancelled(true);
      setIsMonetized(false);
      fetchStatus();
    } catch (err: any) {
      setCancelError(err.message || "Network error.");
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleResumeMonetization = async () => {
    setIsResuming(true);
    try {
      const res = await fetch("/api/monetize/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHasCancelled(false);
        setIsMonetized(false);
        setClicksCount(0);
        setClicksRemaining(300);
        await fetchStatus();
      } else {
        alert(data.error || "Failed to reapply for monetization.");
      }
    } catch (err: any) {
      alert(err.message || "Network error.");
    } finally {
      setIsResuming(false);
    }
  };

  const [clicksCount, setClicksCount] = useState(() => {
    if (typeof initialClicks === "number") return initialClicks;
    if (typeof initialCache.clicksCount === "number") return initialCache.clicksCount;
    return 0;
  });

  const [clicksRemaining, setClicksRemaining] = useState(() => {
    if (typeof initialClicks === "number") {
      return computeAtwTierDetails(initialClicks, initialAtwTier, isExempt).clicksRemaining;
    }
    if (typeof initialCache.clicksRemaining === "number") return initialCache.clicksRemaining;
    return 300;
  });

  const [atwTier, setAtwTier] = useState(() => {
    if (isExempt) return "Unlimited";
    if (initialAtwTier) return initialAtwTier;
    if (initialCache.atwTier) return initialCache.atwTier;
    return "ATW1";
  });

  const [daysInactive, setDaysInactive] = useState(0);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [confirmEmailInput, setConfirmEmailInput] = useState("");
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const fetchStatus = async () => {
    if (!email) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/monetize", { cache: "no-store" });
      if (!res.ok) {
        setHasResolved(true);
        return;
      }
      const data = await res.json();
      if (data.success) {
        const resolvedClicks = typeof data.clicksCount === "number" ? data.clicksCount : 0;
        const details = computeAtwTierDetails(
          resolvedClicks,
          data.atwTier,
          isExempt || Boolean(data.isUnlimited)
        );
        const resolvedRemaining = data.clicksRemaining ?? details.clicksRemaining;
        const isCancelled = Boolean(data.hasCancelled);
        startTransition(() => {
          setHasCancelled(isCancelled);
          setIsMonetized(Boolean(isExempt || (!isCancelled && resolvedClicks >= 300)));
          setClicksCount(resolvedClicks);
          setClicksRemaining(resolvedRemaining);
          setAtwTier(details.tierCode);
          setDaysInactive(data.daysInactive || 0);
          setHasResolved(true);
        });

        try {
          const cachePayload = JSON.stringify({
            email: email.toLowerCase(),
            hasCancelled: isCancelled,
            isMonetized: Boolean(isExempt || (!isCancelled && (data.isMonetized || resolvedClicks >= 300))),
            clicksCount: resolvedClicks,
            clicksRemaining: resolvedRemaining,
            atwTier: details.tierCode,
            daysInactive: data.daysInactive || 0,
          });
          localStorage.setItem("paayh_monetize_cache_v2", cachePayload);
          sessionStorage.setItem("paayh_monetize_cache_v2", cachePayload);
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

    const applyRealtimeClicks = (totalClicks?: number, isMon?: boolean, tier?: string) => {
      if (typeof totalClicks === "number") {
        const details = computeAtwTierDetails(totalClicks, tier, isExempt);
        setClicksCount(totalClicks);
        setClicksRemaining(details.clicksRemaining);
        setAtwTier((prev) => {
          const merged = computeAtwTierDetails(totalClicks, tier || prev, isExempt);
          return merged.tierCode;
        });
        const finalMon = !hasCancelled && Boolean(isExempt || (typeof isMon === "boolean" ? isMon : totalClicks >= 300));
        if (finalMon) setIsMonetized(true);

        if (email) {
          try {
            const cachePayload = JSON.stringify({
              email: email.toLowerCase(),
              hasCancelled,
              isMonetized: finalMon || isMonetized,
              clicksCount: totalClicks,
              clicksRemaining: details.clicksRemaining,
              atwTier: details.tierCode,
              daysInactive: 0,
            });
            localStorage.setItem("paayh_monetize_cache_v2", cachePayload);
            sessionStorage.setItem("paayh_monetize_cache_v2", cachePayload);
          } catch {}
        }
      }
    };

    const handleClickIncrement = (e: Event) => {
      const customEvent = e as CustomEvent;
      const totalClicks = customEvent.detail?.totalClicks;
      if (typeof totalClicks === "number") {
        applyRealtimeClicks(totalClicks, customEvent.detail?.isMonetized, customEvent.detail?.atwTier);
      } else {
        const delta = customEvent.detail?.delta || 1;
        setClicksCount((prev: number) => {
          const next = prev + delta;
          const details = computeAtwTierDetails(next, undefined, isExempt);
          setClicksRemaining(details.clicksRemaining);
          setAtwTier((prevTier) => computeAtwTierDetails(next, prevTier, isExempt).tierCode);
          if (!hasCancelled && (next >= 300 || isExempt)) setIsMonetized(true);
          return next;
        });
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("xea:click-increment", handleClickIncrement);

    let realtimeChannel: any = null;
    if (email) {
      const emailKey = email.toLowerCase().trim();
      const userTopic = `realtime:user:${emailKey.replace(/[^a-zA-Z0-9]/g, "_")}`;
      realtimeChannel = supabase
        .channel(userTopic)
        .on("broadcast", { event: "monetization_updated" }, (msg: any) => {
          const p = msg?.payload;
          if (p && typeof p.clicksCount === "number") {
            applyRealtimeClicks(p.clicksCount, p.isMonetized, p.atwTier);
          }
        })
        .subscribe();
    }

    const interval = setInterval(fetchStatus, 15000);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("xea:click-increment", handleClickIncrement);
      clearInterval(interval);
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel).catch(() => {});
      }
    };
  }, [email]);

  const tierDetails = computeAtwTierDetails(clicksCount, atwTier, isExempt);
  const currentMilestoneTarget = tierDetails.currentMilestoneTarget;
  const effectiveRemaining = tierDetails.clicksRemaining;
  const clicksPercent = tierDetails.clicksPercent;
  const atwLevelNum = tierDetails.level;
  const displayAtwTier = tierDetails.tierCode;
  const isUnlimited = tierDetails.isUnlimited;
  const isMaxTier = tierDetails.isMaxTier;
  const nextAtwLevel = tierDetails.nextAtwLevel;
  const nextHoldingCap = tierDetails.nextHoldingCap;

  if (!hasResolved) {
    return (
      <div className={styles.container} aria-busy="true" aria-label="Loading monetization status">
        <main className={styles.main}>
          <div className={styles.header}>
            <Skeleton variant="title" width={180} height={32} />
            <div style={{ marginTop: 8 }}>
              <Skeleton variant="text" width="75%" height={16} />
            </div>
          </div>

          <div className={styles.contentGrid}>
            <div className={styles.statusCard} style={{ background: "var(--card-bg)" }}>
              <div className={styles.statusHeaderRow}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <Skeleton variant="rect" width={44} height={44} style={{ borderRadius: "50%" }} />
                  <div>
                    <Skeleton variant="title" width={220} height={20} />
                    <div style={{ marginTop: 6 }}>
                      <Skeleton variant="text" width={280} height={14} />
                    </div>
                  </div>
                </div>
                <Skeleton variant="rect" width={90} height={28} style={{ borderRadius: 9999 }} />
              </div>
            </div>

            <div className={styles.progressGrid} style={{ marginTop: 24 }}>
              <div className={styles.progressCard}>
                <div className={styles.progressHeaderRow}>
                  <Skeleton variant="title" width={240} height={20} />
                  <Skeleton variant="rect" width={52} height={24} style={{ borderRadius: 8 }} />
                </div>
                <div style={{ marginTop: 16 }}>
                  <Skeleton variant="text" width="92%" height={14} />
                  <Skeleton variant="text" width="65%" height={14} style={{ marginTop: 6 }} />
                </div>
                <div className={styles.metricsGrid} style={{ marginTop: 20 }}>
                  <div className={styles.metricBox}>
                    <Skeleton variant="text" width={75} height={12} />
                    <div style={{ marginTop: 6 }}>
                      <Skeleton variant="title" width={95} height={22} />
                    </div>
                  </div>
                  <div className={styles.metricBox}>
                    <Skeleton variant="text" width={75} height={12} />
                    <div style={{ marginTop: 6 }}>
                      <Skeleton variant="title" width={95} height={22} />
                    </div>
                  </div>
                </div>
                <div className={styles.progressBarWrapper} style={{ marginTop: 20 }}>
                  <Skeleton variant="rect" width="100%" height={10} style={{ borderRadius: 9999 }} />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>Monetization</h1>
          <p className={styles.subtitle}>
            ATW tiers determine your wallet balance holding cap. Users should always withdraw earnings promptly and maintain a low balance.
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
                    {hasCancelled
                      ? "Opted Out • Browsing Only"
                      : isMonetized
                      ? isUnlimited
                        ? "Active • Unlimited Tier"
                        : isMaxTier
                        ? "Active • ATW Level 14 (Peak Tier)"
                        : `Active • ATW Level ${atwLevelNum}`
                      : "Not Monetized"}
                  </h2>
                  <p className={styles.statusSub}>
                    {hasCancelled
                      ? "You voluntarily opted out of monetization. You can continue discovering and enjoying feed content freely. Your Seen count continues to advance, but monetization remains off until you reapply."
                      : isMonetized
                      ? isUnlimited
                        ? "Your account is monetized at Unlimited Tier (Unlimited holding balance cap)."
                        : isMaxTier
                        ? "Your account is monetized at ATW Tier ATW14 with platform peak holding cap (₦420,000). Lifetime milestone counting continues 300 by 300."
                        : `Your account is monetized at ATW Tier ${displayAtwTier} (${tierDetails.holdingCapFormatted} holding cap).`
                      : "Complete 300 ad clicks in the feed to unlock monetization."}
                  </p>
                </div>
              </div>
              <div className={styles.statusActionsRow}>
                {hasCancelled ? (
                  <>
                    <span className={styles.badgeOptedOut}>Browsing Only</span>
                    <button
                      onClick={handleResumeMonetization}
                      disabled={isResuming}
                      className={styles.resumeBtn}
                    >
                      {isResuming ? "Reapplying..." : "Reapply for Monetization"}
                    </button>
                  </>
                ) : (
                  <>
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
                  </>
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
                    Type your email or username to confirm:
                  </label>
                  <input
                    type="text"
                    placeholder="Enter Email or Username"
                    value={confirmEmailInput}
                    onChange={(e) => setConfirmEmailInput(e.target.value)}
                    className={styles.modalInput}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>

                <div className={styles.modalOrDivider}>
                  <span>OR</span>
                </div>

                <div style={{ textAlign: "center", marginBottom: "16px" }}>
                  {(() => {
                    const radius = 9;
                    const circumference = 2 * Math.PI * radius;
                    const strokeDashoffset = circumference - (holdProgress / 100) * circumference;

                    return (
                      <button
                        type="button"
                        onMouseDown={startHold}
                        onMouseUp={cancelHold}
                        onMouseLeave={cancelHold}
                        onTouchStart={startHold}
                        onTouchEnd={cancelHold}
                        disabled={isSubmittingCancel}
                        className={styles.holdCancelBtn}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
                          <circle cx="12" cy="12" r={radius} stroke="rgba(239,68,68,0.25)" strokeWidth="2.5" fill="none" />
                          <circle
                            cx="12"
                            cy="12"
                            r={radius}
                            stroke="var(--danger)"
                            strokeWidth="2.5"
                            fill="none"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span>{holdProgress > 0 ? "Hold to confirm..." : "Hold 2s to Cancel"}</span>
                      </button>
                    );
                  })()}
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
                      cancelHold();
                      setShowCancelModal(false);
                      setCancelError("");
                      setConfirmEmailInput("");
                    }}
                    className={styles.modalCancelBtn}
                  >
                    Not now
                  </button>

                  <button
                    disabled={isSubmittingCancel || !confirmEmailInput.trim()}
                    onClick={async () => {
                      const input = confirmEmailInput.trim();
                      if (!input) {
                        setCancelError("Please enter your email or username.");
                        return;
                      }
                      await executeCancel({ confirmEmail: input });
                    }}
                    className={styles.modalConfirmBtn}
                  >
                    {isSubmittingCancel ? "Cancelling..." : "Confirm with Input"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* QUALIFICATION PROGRESS CARD */}
          <div className={styles.progressGrid}>
            <div className={styles.progressCard}>
              <div className={styles.progressHeaderRow}>
                <h3 className={`${styles.cardSectionTitle} ${styles.cardSectionTitleFlex}`}>
                  <div className={styles.titleIconBox}>
                    <Award size={18} color="var(--primary)" />
                  </div>
                  <span>
                    {isUnlimited
                      ? `Next Milestone: ${currentMilestoneTarget} Ad Clicks (Unlimited Tier • Unlimited Cap)`
                      : clicksCount < 300
                      ? "Requirement: 300 Ad Clicks"
                      : isMaxTier
                      ? `Next Milestone: ${currentMilestoneTarget} Ad Clicks (ATW14 Peak Tier • ₦420,000 cap)`
                      : `Next Milestone: ${currentMilestoneTarget} Ad Clicks (ATW${nextAtwLevel} • ₦${nextHoldingCap.toLocaleString()} cap)`}
                  </span>
                </h3>
                <span className={styles.percentBadge}>
                  {clicksPercent}%
                </span>
              </div>

              <p className={styles.cardInstructionText}>
                {hasCancelled ? (
                  <>
                    You are currently in <strong>browsing-only mode</strong>. Feed browsing and discovery are completely active and voluntary. Your seen count will continue advancing, but monetization remains off. To re-qualify for rewards, click <strong>Reapply for Monetization</strong> above and complete 300 verified seen interactions from the time of reapplication.
                  </>
                ) : isUnlimited ? (
                  <>
                    Your account has <strong>Unlimited Tier</strong> and <strong>Unlimited holding balance cap</strong>. Every <strong>Seen</strong>, <strong>Earn+</strong>, or <strong>Mutual+</strong> click in the feed advances your live seen count across each 300-click milestone.
                  </>
                ) : clicksCount < 300 ? (
                  <>
                    Click <strong>Seen</strong>, <strong>Earn+</strong>, or <strong>Mutual+</strong> on ads to unlock monetization and ATW1 (₦30,000 cap).
                  </>
                ) : isMaxTier ? (
                  <>
                    You unlocked <strong>Earn+</strong> and achieved the <strong>Peak ATW Tier (ATW14 • ₦420,000 holding cap)</strong>! Continue clicking <strong>Earn+</strong>, <strong>Seen</strong>, or <strong>Mutual+</strong> to reach your next milestone target of <strong>{currentMilestoneTarget} clicks</strong>. Milestone cycles continue 300 by 300 for the lifetime of your account to maintain active monetization and reward engagement.
                  </>
                ) : (
                  <>
                    You unlocked <strong>Earn+</strong>! Continue clicking <strong>Earn+</strong>, <strong>Seen</strong>, or <strong>Mutual+</strong> to reach <strong>{currentMilestoneTarget} clicks</strong> and upgrade to <strong>ATW{nextAtwLevel} (₦{nextHoldingCap.toLocaleString()} cap)</strong>. Every 300 clicks increases your ATW tier and balance holding cap by ₦30,000.
                  </>
                )}
              </p>

              <div className={styles.metricsGrid}>
                <div className={styles.metricBox}>
                  <span className={`${styles.metricLabel} ${styles.metricLabelFlex}`}>
                    <MousePointer size={13} color="var(--primary)" /> Completed
                  </span>
                  <strong className={styles.metricValue}>
                    {clicksCount} / {currentMilestoneTarget}
                  </strong>
                </div>
                <div className={styles.metricBox}>
                  <span className={`${styles.metricLabel} ${styles.metricLabelFlex}`}>
                    <Clock size={13} color="var(--primary)" /> Remaining
                  </span>
                  <strong className={styles.metricValueRemaining}>
                    {effectiveRemaining} clicks
                  </strong>
                </div>
              </div>

              <div className={styles.progressBarWrapper}>
                <div className={styles.progressBarTrack}>
                  <div className={styles.progressBarFill} style={{ width: `${clicksPercent}%` }} />
                </div>
              </div>

              <div className={styles.feedBtnMargin}>
                <Link href="/" className={styles.feedBtn}>
                  <span>Go to Feed</span>
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
              <h4 className={styles.policyTitle}>7-Day Activity Policy</h4>
            </div>
            <p className={styles.policyDesc}>
              Log in at least once every 7 days. After 7 days of zero activity, monetization pauses and click progress resets.
            </p>
            {daysInactive > 0 && (
              <p className={styles.inactivityAlertText}>
                Current Inactivity: {daysInactive} day{daysInactive > 1 ? "s" : ""} / 7 days
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
