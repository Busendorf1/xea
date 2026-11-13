"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { cancelMonetizationSchema } from "@/lib/validationSchemas";
import supabase from "@/lib/utils/db";
import styles from "./page.module.css";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Award,
  MousePointer,
  ShieldCheck,
  Calendar,
} from "lucide-react";
import { computeAtwTierDetails } from "@/lib/attentionTierEngine";
import { isExemptFromBarriersAndInactivity } from "@/lib/adminHelper";
import { MonetizeCancelModal, MonetizeLoadingSkeleton } from "./MonetizeSubcomponents";

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
  initialHasCancelled?: boolean;
  initialClicks?: number;
  initialAtwTier?: string;
};

export default function Monetize({ session, initialMonetized, initialHasCancelled, initialClicks, initialAtwTier }: MonetizeProps) {
  const email = session?.user?.email;
  const [, startTransition] = useTransition();

  const isExempt = isExemptFromBarriersAndInactivity(email);

  // Track latest hasCancelled in a ref so realtime/focus listeners never read stale state
  const hasCancelledRef = useRef<boolean>(false);

  const [initialCache] = useState<{
    hasCached: boolean;
    isMonetized?: boolean;
    hasCancelled?: boolean;
    clicksCount?: number;
    clicksRemaining?: number;
    atwTier?: string;
    attentionScore?: number;
    holdingCap?: number | null;
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
              attentionScore: typeof parsed.attentionScore === "number" ? parsed.attentionScore : undefined,
              holdingCap: typeof parsed.holdingCap === "number" || parsed.holdingCap === null ? parsed.holdingCap : undefined,
            };
          }
        }
      } catch {}
    }
    return { hasCached: false };
  });

  // Instant SWR state initialization: prioritize explicit SSR props, then fresh cache, checking hasCancelled & isMonetized BEFORE click threshold
  const [hasResolved, setHasResolved] = useState(() => {
    if (typeof initialMonetized === "boolean" || typeof initialHasCancelled === "boolean") return true;
    if (initialCache.hasCached && typeof initialCache.isMonetized === "boolean") return true;
    return false;
  });

  const [hasCancelled, setHasCancelled] = useState(() => {
    if (typeof initialHasCancelled === "boolean") return initialHasCancelled;
    if (typeof initialCache.hasCancelled === "boolean") return initialCache.hasCancelled;
    return false;
  });
  hasCancelledRef.current = hasCancelled;

  const [isMonetized, setIsMonetized] = useState(() => {
    const cancelled =
      typeof initialHasCancelled === "boolean"
        ? initialHasCancelled
        : Boolean(initialCache.hasCancelled);
    if (cancelled) return false;
    if (isExempt) return true;
    if (typeof initialMonetized === "boolean") return initialMonetized;
    if (typeof initialCache.isMonetized === "boolean") return initialCache.isMonetized;
    if (typeof initialClicks === "number") return initialClicks >= 300;
    if (typeof initialCache.clicksCount === "number") return initialCache.clicksCount >= 300;
    return false;
  });

  const [attentionScore, setAttentionScore] = useState<number>(() => {
    if (typeof initialCache.attentionScore === "number") return initialCache.attentionScore;
    return 0.1;
  });

  const persistCache = (payload: {
    hasCancelled: boolean;
    isMonetized: boolean;
    clicksCount: number;
    clicksRemaining: number;
    atwTier: string;
    attentionScore: number;
    daysInactive: number;
  }) => {
    if (!email) return;
    try {
      const serialized = JSON.stringify({
        email: email.toLowerCase(),
        ...payload,
      });
      localStorage.setItem("paayh_monetize_cache_v2", serialized);
      sessionStorage.setItem("paayh_monetize_cache_v2", serialized);
    } catch {}
  };

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
      hasCancelledRef.current = true;
      setHasCancelled(true);
      setIsMonetized(false);
      persistCache({
        hasCancelled: true,
        isMonetized: false,
        clicksCount,
        clicksRemaining,
        atwTier,
        attentionScore,
        daysInactive,
      });
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
        hasCancelledRef.current = false;
        setHasCancelled(false);
        setIsMonetized(Boolean(isExempt));
        setClicksCount(0);
        setClicksRemaining(300);
        setAttentionScore(0.1);
        setAtwTier(isExempt ? "Unlimited" : "ATW1");
        persistCache({
          hasCancelled: false,
          isMonetized: Boolean(isExempt),
          clicksCount: 0,
          clicksRemaining: 300,
          atwTier: isExempt ? "Unlimited" : "ATW1",
          attentionScore: 0.1,
          daysInactive: 0,
        });
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
        const resolvedScore =
          typeof data.attentionWorthScore === "number"
            ? data.attentionWorthScore
            : typeof data.attention_worth_score === "number"
            ? data.attention_worth_score
            : attentionScore;
        const ratingBonusClicks = Math.floor(Math.max(0, resolvedScore - 0.1) * 300);
        const effectiveClicks = Math.max(0, resolvedClicks) + ratingBonusClicks;
        const details = computeAtwTierDetails(
          effectiveClicks,
          data.atwTier,
          isExempt || Boolean(data.isUnlimited)
        );
        const resolvedRemaining = data.clicksRemaining ?? details.clicksRemaining;
        const isCancelled = Boolean(data.hasCancelled);
        // Check hasCancelled FIRST, then trust authoritative server boolean data.isMonetized BEFORE click threshold
        const resolvedMonetized = isCancelled
          ? false
          : Boolean(
              isExempt ||
                data.isUnlimited ||
                (typeof data.isMonetized === "boolean" ? data.isMonetized : effectiveClicks >= 300)
            );
        hasCancelledRef.current = isCancelled;
        startTransition(() => {
          setHasCancelled(isCancelled);
          setIsMonetized(resolvedMonetized);
          setClicksCount(resolvedClicks);
          setClicksRemaining(resolvedRemaining);
          setAttentionScore(resolvedScore);
          setAtwTier(details.tierCode);
          setDaysInactive(data.daysInactive || 0);
          setHasResolved(true);
        });

        persistCache({
          hasCancelled: isCancelled,
          isMonetized: resolvedMonetized,
          clicksCount: resolvedClicks,
          clicksRemaining: resolvedRemaining,
          atwTier: details.tierCode,
          attentionScore: resolvedScore,
          daysInactive: data.daysInactive || 0,
        });
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

    const applyRealtimeClicks = (totalClicks?: number, isMon?: boolean, tier?: string, score?: number) => {
      if (typeof totalClicks === "number") {
        const currentCancelled = hasCancelledRef.current;
        const nextScore = typeof score === "number" ? score : attentionScore;
        const ratingBonus = Math.floor(Math.max(0, nextScore - 0.1) * 300);
        const details = computeAtwTierDetails(totalClicks + ratingBonus, tier, isExempt);
        setClicksCount(totalClicks);
        setClicksRemaining(details.clicksRemaining);
        if (typeof score === "number") setAttentionScore(score);
        setAtwTier((prev) => {
          const merged = computeAtwTierDetails(totalClicks + ratingBonus, tier || prev, isExempt);
          return merged.tierCode;
        });
        const finalMon = currentCancelled
          ? false
          : Boolean(isExempt || (typeof isMon === "boolean" ? isMon : totalClicks + ratingBonus >= 300));
        if (finalMon) setIsMonetized(true);

        persistCache({
          hasCancelled: currentCancelled,
          isMonetized: currentCancelled ? false : finalMon || isMonetized,
          clicksCount: totalClicks,
          clicksRemaining: details.clicksRemaining,
          atwTier: details.tierCode,
          attentionScore: nextScore,
          daysInactive: 0,
        });
      }
    };

    const handleClickIncrement = (e: Event) => {
      const customEvent = e as CustomEvent;
      const totalClicks = customEvent.detail?.totalClicks;
      if (typeof totalClicks === "number") {
        applyRealtimeClicks(
          totalClicks,
          customEvent.detail?.isMonetized,
          customEvent.detail?.atwTier,
          customEvent.detail?.attentionWorthScore
        );
      } else {
        const delta = customEvent.detail?.delta || 1;
        const currentCancelled = hasCancelledRef.current;
        setClicksCount((prev: number) => {
          const next = prev + delta;
          const ratingBonus = Math.floor(Math.max(0, attentionScore - 0.1) * 300);
          const details = computeAtwTierDetails(next + ratingBonus, undefined, isExempt);
          setClicksRemaining(details.clicksRemaining);
          setAtwTier((prevTier) => computeAtwTierDetails(next + ratingBonus, prevTier, isExempt).tierCode);
          if (!currentCancelled && (next + ratingBonus >= 300 || isExempt)) setIsMonetized(true);
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

  const ratingBonusClicks = Math.floor(Math.max(0, attentionScore - 0.1) * 300);
  const effectiveClicksForTier = Math.max(0, clicksCount) + ratingBonusClicks;
  const tierDetails = computeAtwTierDetails(effectiveClicksForTier, atwTier, isExempt);
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
    return <MonetizeLoadingSkeleton />;
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
            <MonetizeCancelModal
              confirmEmailInput={confirmEmailInput}
              setConfirmEmailInput={setConfirmEmailInput}
              holdProgress={holdProgress}
              isSubmittingCancel={isSubmittingCancel}
              cancelError={cancelError}
              setCancelError={setCancelError}
              startHold={startHold}
              cancelHold={cancelHold}
              onClose={() => {
                cancelHold();
                setShowCancelModal(false);
                setCancelError("");
                setConfirmEmailInput("");
              }}
              onExecuteCancel={executeCancel}
            />
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
                  {ratingBonusClicks > 0 && (
                    <span style={{ fontSize: "0.72rem", color: "#10b981", fontWeight: 600 }}>
                      +{ratingBonusClicks} rating boost (ATW score {attentionScore.toFixed(2)})
                    </span>
                  )}
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
