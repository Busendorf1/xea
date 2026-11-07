"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Eye, Coins, UserPlus, Lock, Loader2, ArrowRight, RefreshCw } from "lucide-react";
import styles from "./AdCard.module.css";
import EarningCooldownNotice from "./EarningCooldownNotice";

import { Ad } from "./AdCard";
import { InteractionData } from "@/lib/hooks/useFeedActions";
import { KinematicsCollector } from "./KinematicsCollector";
import { KinematicVector } from "@/lib/security/kinematicsEvaluator";

interface AdInteractionHandlerProps {
  ad: Ad;
  userEmail: string;
  isPlatformPost: boolean;
  isMutualTarget: boolean;
  isAlreadyMutual: boolean;
  viewerProfile: {
    balance: number;
    mutual_count: number;
    mutuals: string[];
    monetized: boolean;
    suspended_until?: string | null;
    cooldown_until?: string | null;
    cooldown_type?: "pacing_15m" | "review_hours" | null;
  } | null;
  isProcessing: boolean;
  isSuspended: boolean;
  successAction: "seen" | "earn" | "mutual" | null;
  activeAction: "seen" | "earn" | "mutual" | null;
  handleAction: (type: "seen" | "earn" | "mutual", fn: () => Promise<boolean>) => Promise<void>;
  onMarkSeen: (ad: Ad) => Promise<boolean>;
  onAdEarn: (ad: Ad, interactionData?: InteractionData) => Promise<boolean>;
  onAdMutual: (ad: Ad) => Promise<boolean>;
  brandName: string;
  targetLink: string;
  forceInView?: boolean;
  externalSecondsLeft?: number;
  onSecondsLeftChange?: React.Dispatch<React.SetStateAction<number>>;
  externalStage?: "countdown" | "challenge" | "unlocked";
  onStageChange?: React.Dispatch<React.SetStateAction<"countdown" | "challenge" | "unlocked">>;
}

type ChallengeType = "swipe" | "hold" | "tap";

// Shared pooled IntersectionObserver & passive fast-scroll velocity monitor (0 per-card observer overhead)
const interactionObserverCallbacks = new WeakMap<Element, (inView: boolean) => void>();
let sharedInteractionObserver: IntersectionObserver | null = null;
let lastFastScrollTimestamp = 0;
let scrollMonitorAttached = false;
let lastScrollYPos = 0;
let lastScrollTimeMs = 0;

function ensureFastScrollMonitor() {
  if (scrollMonitorAttached || typeof window === "undefined") return;
  scrollMonitorAttached = true;
  lastScrollYPos = window.scrollY;
  lastScrollTimeMs = Date.now();
  window.addEventListener(
    "scroll",
    () => {
      const now = Date.now();
      const dt = Math.max(1, now - lastScrollTimeMs);
      const dy = Math.abs(window.scrollY - lastScrollYPos);
      // > 1.2 px/ms (~1200 px/sec) indicates active fast-scroll / fling
      if (dt <= 120 && dy / dt > 1.2) {
        lastFastScrollTimestamp = now;
      }
      lastScrollYPos = window.scrollY;
      lastScrollTimeMs = now;
    },
    { passive: true }
  );
}

function getSharedInteractionObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return null;
  ensureFastScrollMonitor();
  if (!sharedInteractionObserver) {
    sharedInteractionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          interactionObserverCallbacks.get(entry.target)?.(
            entry.isIntersecting && entry.intersectionRatio >= 0.65
          );
        }
      },
      { threshold: [0.6, 0.65, 0.75] }
    );
  }
  return sharedInteractionObserver;
}

export default function AdInteractionHandler({
  ad,
  userEmail: _userEmail,
  isPlatformPost,
  isMutualTarget,
  isAlreadyMutual,
  viewerProfile,
  isProcessing,
  isSuspended,
  successAction,
  activeAction,
  handleAction,
  onMarkSeen,
  onAdEarn,
  onAdMutual,
  forceInView = false,
  externalSecondsLeft,
  onSecondsLeftChange,
  externalStage,
  onStageChange,
}: AdInteractionHandlerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [localSecondsLeft, setLocalSecondsLeft] = useState(16);
  const [observedInView, setObservedInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [localStage, setLocalStage] = useState<"countdown" | "challenge" | "unlocked">("countdown");

  const secondsLeft = externalSecondsLeft !== undefined ? externalSecondsLeft : localSecondsLeft;
  const setSecondsLeft = onSecondsLeftChange || setLocalSecondsLeft;
  const stage = externalStage !== undefined ? externalStage : localStage;
  const setStage = onStageChange || setLocalStage;
  const inView = forceInView || observedInView;

  const isCooldownActive = useMemo(() => {
    if (viewerProfile?.cooldown_until) {
      return new Date(viewerProfile.cooldown_until).getTime() > Date.now();
    }
    return isSuspended;
  }, [viewerProfile?.cooldown_until, isSuspended]);

  const activeCooldownUntil = viewerProfile?.cooldown_until || viewerProfile?.suspended_until || null;
  const activeCooldownType = viewerProfile?.cooldown_type || (isSuspended ? "review_hours" : "pacing_15m");

  // Challenge State
  const [challengeType, setChallengeType] = useState<ChallengeType>("swipe");
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const lastTapTime = useRef<number>(0);
  const isHolding = useRef(false);
  const holdInterval = useRef<NodeJS.Timeout | null>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const kinematicsRef = useRef<KinematicsCollector>(new KinematicsCollector());
  const recordedTelemetryRef = useRef<KinematicVector[]>([]);
  const holdCoords = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 1. Pooled Intersection Observer to check if 65% of ad card is visible in view
  useEffect(() => {
    if (forceInView) {
      setObservedInView(true);
      return;
    }
    const el = containerRef.current;
    const observer = getSharedInteractionObserver();
    if (!el || !observer) return;

    interactionObserverCallbacks.set(el, setObservedInView);
    observer.observe(el);

    return () => {
      interactionObserverCallbacks.delete(el);
      observer.unobserve(el);
    };
  }, [forceInView]);

  // Dynamic Scroll-Away Seen Registration
  const isAutoSeenTriggered = useRef(false);
  const hasTakenAction = useRef(false);

  // Auto-register seen when user unlocks interaction buttons but scrolls away without clicking
  useEffect(() => {
    if (
      stage === "unlocked" &&
      !inView &&
      !activeAction &&
      !successAction &&
      !hasTakenAction.current &&
      !isAutoSeenTriggered.current
    ) {
      isAutoSeenTriggered.current = true;
      hasTakenAction.current = true;
      onMarkSeen(ad).catch((err) => console.warn("Auto seen on scroll away failed:", err));
    }
  }, [stage, inView, activeAction, successAction, ad, onMarkSeen]);

  // Unmount fallback: if user navigates or unmounts while in 'unlocked' stage without action
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const activeActionRef = useRef(activeAction);
  activeActionRef.current = activeAction;
  const successActionRef = useRef(successAction);
  successActionRef.current = successAction;
  const adRef = useRef(ad);
  adRef.current = ad;
  const onMarkSeenRef = useRef(onMarkSeen);
  onMarkSeenRef.current = onMarkSeen;

  useEffect(() => {
    return () => {
      if (holdInterval.current) {
        clearInterval(holdInterval.current);
      }
      if (
        stageRef.current === "unlocked" &&
        !activeActionRef.current &&
        !successActionRef.current &&
        !hasTakenAction.current &&
        !isAutoSeenTriggered.current
      ) {
        isAutoSeenTriggered.current = true;
        hasTakenAction.current = true;
        onMarkSeenRef.current(adRef.current).catch((err) =>
          console.warn("Auto seen on unmount failed:", err)
        );
      }
    };
  }, []);

  // 2. Tab visibility tracking
  useEffect(() => {
    const handleVisibility = () => {
      setTabVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // 3. Countdown timer (pauses automatically during fast-scroll flings or backgrounded tab)
  useEffect(() => {
    if (stage !== "countdown") return;

    let timer: NodeJS.Timeout;
    if (inView && tabVisible && secondsLeft > 0) {
      timer = setTimeout(() => {
        if (Date.now() - lastFastScrollTimestamp < 250) {
          setSecondsLeft((prev) => prev);
          return;
        }
        setSecondsLeft((prev) => prev - 1);
      }, 1000);
    } else if (secondsLeft === 0) {
      const types: ChallengeType[] = ["swipe", "hold", "tap"];
      const randomType = types[Math.floor(Math.random() * types.length)];
      setChallengeType(randomType);
      setStage("challenge");
    }

    return () => clearTimeout(timer);
  }, [inView, tabVisible, secondsLeft, stage]);

  useEffect(() => {
    if (stage !== "challenge" || challengeType !== "swipe") return;
    const handleGlobalUp = () => handleSwipeEnd();
    window.addEventListener("mouseup", handleGlobalUp);
    window.addEventListener("touchend", handleGlobalUp, { passive: true });
    return () => {
      window.removeEventListener("mouseup", handleGlobalUp);
      window.removeEventListener("touchend", handleGlobalUp);
    };
  }, [stage, challengeType]);

  // Platform ads (from admin) do not show the interaction button — only their registered CTAs
  if (
    isPlatformPost ||
    ad.is_admin_post ||
    !ad.cost_per_impression ||
    Number(ad.cost_per_impression) <= 0 ||
    !ad.impressions ||
    Number(ad.impressions) <= 0
  ) {
    return null;
  }

  const handleChallengeSuccess = () => {
    setStage("unlocked");
  };

  const handleRetryChallenge = () => {
    isDragging.current = false;
    isHolding.current = false;
    if (holdInterval.current) clearInterval(holdInterval.current);
    setSwipeOffset(0);
    setHoldProgress(0);
    setTapCount(0);
    lastTapTime.current = 0;
    kinematicsRef.current.reset();
    recordedTelemetryRef.current = [];

    const types: ChallengeType[] = ["swipe", "hold", "tap"];
    const otherTypes = types.filter((t) => t !== challengeType);
    const nextType = otherTypes[Math.floor(Math.random() * otherTypes.length)];
    setChallengeType(nextType);
    setStage("challenge");
  };

  // 4. Challenge A: Swipe Handlers
  const handleSwipeStart = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const force = "touches" in e && (e.touches[0] as any).force ? (e.touches[0] as any).force : 1.0;
    const isTrusted = "isTrusted" in e ? (e as any).isTrusted : true;
    startX.current = clientX - swipeOffset;
    kinematicsRef.current.start(clientX, clientY, force, "swipe", isTrusted);
  };

  const handleSwipeMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current || !trackRef.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const force = "touches" in e && (e.touches[0] as any).force ? (e.touches[0] as any).force : 1.0;
    kinematicsRef.current.record(clientX, clientY, force);

    const trackWidth = trackRef.current.clientWidth;
    const handleWidth = 34;
    const maxOffset = Math.max(0, trackWidth - handleWidth);

    let newOffset = clientX - startX.current;
    newOffset = Math.max(0, Math.min(newOffset, maxOffset));
    setSwipeOffset(newOffset);

    if (newOffset >= maxOffset * 0.9) {
      isDragging.current = false;
      setSwipeOffset(maxOffset);
      recordedTelemetryRef.current = kinematicsRef.current.finish(clientX, clientY, force);
      handleChallengeSuccess();
    }
  };

  const handleSwipeEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    kinematicsRef.current.reset();
    setSwipeOffset(0);
  };

  // 5. Challenge B: Hold Handlers
  const startHold = (e?: React.MouseEvent | React.TouchEvent) => {
    if (stage !== "challenge" || challengeType !== "hold") return;
    isHolding.current = true;
    const clientX = e ? ("touches" in e ? e.touches[0].clientX : e.clientX) : 0;
    const clientY = e ? ("touches" in e ? e.touches[0].clientY : e.clientY) : 0;
    const isTrusted = e && "isTrusted" in e ? (e as any).isTrusted : true;
    holdCoords.current = { x: clientX, y: clientY };

    kinematicsRef.current.start(clientX, clientY, 1.0, "hold", isTrusted);
    holdInterval.current = setInterval(() => {
      kinematicsRef.current.record(holdCoords.current.x, holdCoords.current.y);
      setHoldProgress((prev) => {
        if (prev >= 100) {
          clearInterval(holdInterval.current!);
          recordedTelemetryRef.current = kinematicsRef.current.finish(
            holdCoords.current.x,
            holdCoords.current.y
          );
          handleChallengeSuccess();
          return 100;
        }
        return prev + 5;
      });
    }, 50);
  };

  const updateHoldCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isHolding.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    holdCoords.current = { x: clientX, y: clientY };
  };

  const endHold = () => {
    isHolding.current = false;
    if (holdInterval.current) {
      clearInterval(holdInterval.current);
    }
    setHoldProgress(0);
  };

  // 6. Challenge C: Tap Handlers
  const handleTap = (e?: React.MouseEvent) => {
    const now = Date.now();
    const clientX = e ? e.clientX : 0;
    const clientY = e ? e.clientY : 0;
    const isTrusted = e && "isTrusted" in e ? (e as any).isTrusted : true;

    if (tapCount === 0) {
      kinematicsRef.current.start(clientX, clientY, 1.0, "tap", isTrusted);
    } else {
      kinematicsRef.current.record(clientX, clientY);
    }

    if (lastTapTime.current > 0) {
      const diff = now - lastTapTime.current;
      if (diff < 100) {
        return;
      }
    }

    lastTapTime.current = now;
    setTapCount((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        recordedTelemetryRef.current = kinematicsRef.current.finish(clientX, clientY);
        handleChallengeSuccess();
      }
      return next;
    });
  };

  const radius = 9;
  const stroke = 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = ((16 - secondsLeft) / 16) * 100;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const isMonetizedUser = Boolean(viewerProfile?.monetized);

  return (
    <div ref={containerRef} className={styles.interactionContainer}>
      {stage === "countdown" && (
        <div className={styles.countdownContainer}>
          <div className={styles.progressRingWrapper}>
            <svg height={(radius + stroke) * 2} width={(radius + stroke) * 2} className={styles.progressRingSvg}>
              <circle
                stroke="rgba(255, 255, 255, 0.12)"
                fill="transparent"
                strokeWidth={stroke}
                r={radius}
                cx={radius + stroke}
                cy={radius + stroke}
              />
              <circle
                stroke="#10b981"
                fill="transparent"
                strokeWidth={stroke}
                strokeDasharray={`${circumference} ${circumference}`}
                style={{ strokeDashoffset, transition: "stroke-dashoffset 0.3s ease" }}
                r={radius}
                cx={radius + stroke}
                cy={radius + stroke}
              />
            </svg>
            <div className={styles.lockIconOverlay}>
              <Lock size={9} className={styles.lockIcon} />
            </div>
          </div>
          <span className={styles.countdownText}>
            {`Verify in ${secondsLeft}s`}
          </span>
        </div>
      )}

      {stage === "challenge" && (
        <div className={styles.challengeContainer}>
          {challengeType === "swipe" && (
            <div
              ref={trackRef}
              className={styles.swipeTrack}
              onMouseMove={handleSwipeMove}
              onTouchMove={handleSwipeMove}
            >
              <div
                style={{ transform: `translateX(${swipeOffset}px)` }}
                className={styles.swipeHandle}
                onMouseDown={handleSwipeStart}
                onTouchStart={handleSwipeStart}
              >
                <ArrowRight size={13} />
              </div>
              <span className={styles.swipeText}>Swipe to Verify</span>
            </div>
          )}

          {challengeType === "hold" && (
            <button
              type="button"
              className={styles.holdBtn}
              onMouseDown={startHold}
              onTouchStart={startHold}
              onMouseMove={updateHoldCoords}
              onTouchMove={updateHoldCoords}
              onMouseUp={endHold}
              onMouseLeave={endHold}
              onTouchEnd={endHold}
            >
              <div
                style={{ width: `${holdProgress}%` }}
                className={styles.holdProgressBar}
              />
              <span className={styles.holdBtnText}>
                {holdProgress > 0 ? "Holding..." : "Hold 2s to Verify"}
              </span>
            </button>
          )}

          {challengeType === "tap" && (
            <button
              type="button"
              className={styles.tapBtn}
              onClick={handleTap}
            >
              <span className={styles.tapBtnText}>
                {tapCount === 0 && "Tap 3x to Verify"}
                {tapCount === 1 && "Tap 2x more"}
                {tapCount === 2 && "Tap 1x more!"}
              </span>
              <div className={styles.tapIndicatorRow}>
                {[1, 2, 3].map((num) => (
                  <div
                    key={num}
                    className={`${styles.tapDot} ${tapCount >= num ? styles.tapDotActive : ""}`}
                  />
                ))}
              </div>
            </button>
          )}

          <button
            type="button"
            className={styles.challengeActionLink}
            onClick={handleRetryChallenge}
            title="Switch verification task"
            aria-label="Switch verification task"
          >
            <RefreshCw size={11} />
          </button>
        </div>
      )}

      {stage === "unlocked" && (
        <div className={styles.unlockedRow}>
          {isCooldownActive ? (
            <EarningCooldownNotice
              cooldownUntil={activeCooldownUntil}
              cooldownType={activeCooldownType}
            />
          ) : (
            <>
              {/* Seen Button — visible to both unmonetized and monetized users */}
              <button
                className={`${styles.seenBtn} ${successAction === "seen" ? styles.successBtn : ""}`}
                type="button"
                disabled={isProcessing || !!activeAction || isAutoSeenTriggered.current}
                onClick={() => {
                  hasTakenAction.current = true;
                  handleAction("seen", () => onMarkSeen(ad));
                }}
                title="Mark ad as seen"
              >
                {activeAction === "seen" ? (
                  <>
                    <Loader2 size={11} className={styles.spinner} />
                    <span>Seen...</span>
                  </>
                ) : successAction === "seen" ? (
                  <span>Seen</span>
                ) : (
                  <>
                    <Eye size={11} strokeWidth={2} />
                    <span>Seen</span>
                  </>
                )}
              </button>

              {/* Earn+ Button — visible to monetized users on paid ads */}
              {isMonetizedUser && !isMutualTarget && (
                <button
                  className={`${styles.earnBtn} ${successAction === "earn" ? styles.successBtn : ""}`}
                  type="button"
                  disabled={isProcessing || !!activeAction || isAutoSeenTriggered.current}
                  onClick={() => {
                    hasTakenAction.current = true;
                    handleAction("earn", async () => {
                      const success = await onAdEarn(ad, {
                        telemetry: recordedTelemetryRef.current,
                      });
                      if (!success) {
                        handleRetryChallenge();
                      }
                      return success;
                    });
                  }}
                  title="Earn from this ad"
                >
                  {activeAction === "earn" ? (
                    <>
                      <Loader2 size={11} className={styles.spinner} />
                      <span>Earn...</span>
                    </>
                  ) : successAction === "earn" ? (
                    <span>Earned</span>
                  ) : (
                    <>
                      <Coins size={11} strokeWidth={2} />
                      <span>Earn+</span>
                    </>
                  )}
                </button>
              )}

              {/* Mutual+ Button — visible to monetized users when not explicitly disabled */}
              {isMonetizedUser && ad.display_mutual_button !== false && !isAlreadyMutual && (
                <button
                  className={
                    viewerProfile && viewerProfile.mutual_count >= 50
                      ? styles.mutualBtnDisabled
                      : `${styles.mutualBtn} ${successAction === "mutual" ? styles.successBtn : ""}`
                  }
                  type="button"
                  disabled={isProcessing || !!activeAction || isAutoSeenTriggered.current}
                  onClick={() => {
                    hasTakenAction.current = true;
                    if (viewerProfile && viewerProfile.mutual_count >= 50) {
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(
                          new CustomEvent("xea:toast", {
                            detail: { message: "Mutual limit reached (50 max)" },
                          })
                        );
                      }
                    } else {
                      handleAction("mutual", () => onAdMutual(ad));
                    }
                  }}
                  title="Add advertiser to mutuals"
                >
                  {activeAction === "mutual" ? (
                    <>
                      <Loader2 size={11} className={styles.spinner} />
                      <span>Mutual...</span>
                    </>
                  ) : successAction === "mutual" ? (
                    <span>Added</span>
                  ) : (
                    <>
                      <UserPlus size={11} strokeWidth={2} />
                      <span>Mutual+</span>
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
