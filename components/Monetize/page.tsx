"use client";

import { useEffect, useState, useTransition } from "react";
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
    if (typeof initialMonetized === "boolean") return true;
    return initialCache.hasCached;
  });

  const [isMonetized, setIsMonetized] = useState(() => {
    if (isExempt) return true;
    if (typeof initialMonetized === "boolean") return initialMonetized;
    if (typeof initialCache.isMonetized === "boolean") return initialCache.isMonetized;
    return true;
  });

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
        startTransition(() => {
          setIsMonetized(Boolean(isExempt || data.isMonetized || resolvedClicks >= 300));
          setClicksCount(resolvedClicks);
          setClicksRemaining(resolvedRemaining);
          setAtwTier(details.tierCode);
          setDaysInactive(data.daysInactive || 0);
          setHasResolved(true);
        });

        try {
          const cachePayload = JSON.stringify({
            email: email.toLowerCase(),
            isMonetized: Boolean(isExempt || data.isMonetized || resolvedClicks >= 300),
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
        const finalMon = Boolean(isExempt || (typeof isMon === "boolean" ? isMon : totalClicks >= 300));
        if (finalMon) setIsMonetized(true);

        if (email) {
          try {
            const cachePayload = JSON.stringify({
              email: email.toLowerCase(),
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
          if (next >= 300 || isExempt) setIsMonetized(true);
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
  const nextAtwLevel = tierDetails.nextAtwLevel;
  const nextHoldingCap = tierDetails.nextHoldingCap;

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
                    {isMonetized
                      ? isUnlimited
                        ? "Active • Unlimited Tier"
                        : `Active • ATW Level ${atwLevelNum}`
                      : "Not Monetized"}
                  </h2>
                  <p className={styles.statusSub}>
                    {isMonetized
                      ? isUnlimited
                        ? "Your account is monetized at Unlimited Tier (Unlimited holding balance cap)."
                        : `Your account is monetized at ATW Tier ${displayAtwTier} (${tierDetails.holdingCapFormatted} holding cap).`
                      : "Complete 300 ad clicks in the feed to unlock monetization."}
                  </p>
                </div>
              </div>
              <div className={styles.statusActionsRow}>
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
                      : `Next Milestone: ${currentMilestoneTarget} Ad Clicks (ATW${nextAtwLevel} • ₦${nextHoldingCap.toLocaleString()} cap)`}
                  </span>
                </h3>
                <span className={styles.percentBadge}>
                  {clicksPercent}%
                </span>
              </div>

              <p className={styles.cardInstructionText}>
                {isUnlimited ? (
                  <>
                    Your account has <strong>Unlimited Tier</strong> and <strong>Unlimited holding balance cap</strong>. Every <strong>Seen</strong>, <strong>Earn+</strong>, or <strong>Mutual+</strong> click in the feed advances your live seen count across each 300-click milestone.
                  </>
                ) : clicksCount < 300 ? (
                  <>
                    Click <strong>Seen</strong>, <strong>Earn+</strong>, or <strong>Mutual+</strong> on ads to unlock monetization and ATW1 (₦30,000 cap).
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
