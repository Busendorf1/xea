"use client";

import React, { useState, useEffect, useRef } from "react";
import { Eye, Coins, UserPlus, Check, Lock, ShieldCheck } from "lucide-react";
import styles from "./AdCard.module.css";

import { Ad } from "./AdCard";

interface AdInteractionHandlerProps {
  ad: Ad;
  userEmail: string;
  isPlatformPost: boolean;
  isMutualTarget: boolean;
  isAlreadyMutual: boolean;
  viewerProfile: {
    mutual_count: number;
    mutuals: string[];
  } | null;
  isProcessing: boolean;
  isSuspended: boolean;
  successAction: "seen" | "earn" | "mutual" | null;
  activeAction: "seen" | "earn" | "mutual" | null;
  handleAction: (type: "seen" | "earn" | "mutual", fn: () => Promise<boolean>) => Promise<void>;
  onMarkSeen: (ad: Ad) => Promise<boolean>;
  onAdEarn: (ad: Ad) => Promise<boolean>;
  onAdMutual: (ad: Ad) => Promise<boolean>;
  brandName: string;
  targetLink: string;
}

type ChallengeType = "swipe" | "hold" | "tap";

export default function AdInteractionHandler({
  ad,
  userEmail,
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
  brandName,
  targetLink,
}: AdInteractionHandlerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [secondsLeft, setSecondsLeft] = useState(16);
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [stage, setStage] = useState<"countdown" | "challenge" | "unlocked">("countdown");
  
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

  // 1. Intersection Observer to check if ad card is visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { threshold: 0.5 } // Must be 50% visible
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // 2. Tab visibility tracking
  useEffect(() => {
    const handleVisibility = () => {
      setTabVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // 3. Countdown timer
  useEffect(() => {
    if (stage !== "countdown") return;

    let timer: NodeJS.Timeout;
    if (inView && tabVisible && secondsLeft > 0) {
      timer = setTimeout(() => {
        setSecondsLeft((prev) => prev - 1);
      }, 1000);
    } else if (secondsLeft === 0) {
      // Choose a random challenge type
      const types: ChallengeType[] = ["swipe", "hold", "tap"];
      const randomType = types[Math.floor(Math.random() * types.length)];
      setChallengeType(randomType);
      setStage("challenge");
    }

    return () => clearTimeout(timer);
  }, [inView, tabVisible, secondsLeft, stage]);

  const handleChallengeSuccess = () => {
    setStage("unlocked");
  };

  // 4. Challenge A: Swipe Handlers
  const handleSwipeStart = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    startX.current = clientX - swipeOffset;
  };

  const handleSwipeMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current || !trackRef.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const trackWidth = trackRef.current.clientWidth;
    const handleWidth = 44;
    const maxOffset = trackWidth - handleWidth;
    
    let newOffset = clientX - startX.current;
    newOffset = Math.max(0, Math.min(newOffset, maxOffset));
    setSwipeOffset(newOffset);

    // If dragged 95% of the way, complete the challenge
    if (newOffset >= maxOffset * 0.95) {
      isDragging.current = false;
      setSwipeOffset(maxOffset);
      handleChallengeSuccess();
    }
  };

  const handleSwipeEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    // Snap back to 0 if not completed
    setSwipeOffset(0);
  };

  useEffect(() => {
    const handleGlobalUp = () => handleSwipeEnd();
    window.addEventListener("mouseup", handleGlobalUp);
    window.addEventListener("touchend", handleGlobalUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalUp);
      window.removeEventListener("touchend", handleGlobalUp);
    };
  }, []);

  // 5. Challenge B: Hold Handlers
  const startHold = () => {
    if (stage !== "challenge" || challengeType !== "hold") return;
    isHolding.current = true;
    holdInterval.current = setInterval(() => {
      setHoldProgress((prev) => {
        if (prev >= 100) {
          clearInterval(holdInterval.current!);
          handleChallengeSuccess();
          return 100;
        }
        return prev + 4; // takes ~1.25 seconds to complete
      });
    }, 50);
  };

  const endHold = () => {
    isHolding.current = false;
    if (holdInterval.current) {
      clearInterval(holdInterval.current);
    }
    setHoldProgress(0);
  };

  // 6. Challenge C: Tap Handlers
  const handleTap = () => {
    const now = Date.now();
    if (lastTapTime.current > 0) {
      const diff = now - lastTapTime.current;
      if (diff < 200) {
        setTapCount(1);
        lastTapTime.current = now;
        return;
      }
    }

    lastTapTime.current = now;
    setTapCount((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        handleChallengeSuccess();
      }
      return next;
    });
  };

  // SVG Progress Ring calculations
  const radius = 16;
  const stroke = 3;
  const circumference = 2 * Math.PI * radius;
  const percentage = ((16 - secondsLeft) / 16) * 100;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div ref={containerRef} className={styles.interactionContainer}>
      {stage === "countdown" && (
        <div className={styles.countdownContainer}>
          <div className={styles.progressRingWrapper}>
            <svg height={(radius + stroke) * 2} width={(radius + stroke) * 2} className={styles.progressRingSvg}>
              <circle
                stroke="rgba(255, 255, 255, 0.08)"
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
              <Lock size={12} className={styles.lockIcon} />
            </div>
          </div>
          <span className={styles.countdownText}>
            {inView && tabVisible ? `Verify in ${secondsLeft}s...` : "Keep ad in view..."}
          </span>
        </div>
      )}

      {stage === "challenge" && (
        <div className={styles.challengeContainer}>
          <div className={styles.challengeHeader}>
            <ShieldCheck size={14} className={styles.shieldIcon} />
            <span className={styles.challengeTitle}>Complete verification to unlock:</span>
          </div>

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
                ➔
              </div>
              <span className={styles.swipeText}>Swipe Right to Verify</span>
            </div>
          )}

          {challengeType === "hold" && (
            <button
              type="button"
              className={styles.holdBtn}
              onMouseDown={startHold}
              onTouchStart={startHold}
              onMouseUp={endHold}
              onMouseLeave={endHold}
              onTouchEnd={endHold}
            >
              <div 
                style={{ width: `${holdProgress}%` }} 
                className={styles.holdProgressBar} 
              />
              <span className={styles.holdBtnText}>
                {holdProgress > 0 ? "Holding..." : "Press & Hold for 2s"}
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
                {tapCount === 0 && "Tap 3 times to Verify"}
                {tapCount === 1 && "Tap 2 more times"}
                {tapCount === 2 && "Tap 1 more time!"}
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
        </div>
      )}

      {stage === "unlocked" && (
        <div className={styles.unlockedRow}>
          {isPlatformPost ? (
            <a
              href={targetLink}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.visitBrandBtn}
            >
              Visit {brandName}
            </a>
          ) : (
            <>
              {/* Seen / Dismiss Button */}
              <button
                className={`${styles.seenBtn} ${successAction === "seen" ? styles.successBtn : ""}`}
                type="button"
                disabled={isProcessing || !!activeAction}
                onClick={() => handleAction("seen", () => onMarkSeen(ad))}
                title="Dismiss this ad"
              >
                {successAction === "seen" ? (
                  <>
                    <Check size={11} strokeWidth={2} className={styles.tickIcon} />
                    <span>Dismissed</span>
                  </>
                ) : (
                  <>
                    <Eye size={11} strokeWidth={2} />
                    <span>Seen</span>
                  </>
                )}
              </button>

              {/* Earn+ Button */}
              <button
                className={`${styles.earnBtn} ${successAction === "earn" ? styles.successBtn : ""}`}
                type="button"
                disabled={isProcessing || !!activeAction}
                onClick={() => handleAction("earn", () => onAdEarn(ad))}
                title="Earn from this ad"
              >
                {successAction === "earn" ? (
                  <>
                    <Check size={11} strokeWidth={2} className={styles.tickIcon} />
                    <span>Earned</span>
                  </>
                ) : (
                  <>
                    <Coins size={11} strokeWidth={2} />
                    <span>Earn+</span>
                  </>
                )}
              </button>

              {/* Mutual+ Button */}
              {ad.display_mutual_button === true && !isAlreadyMutual && (
                <button
                  className={
                    viewerProfile && viewerProfile.mutual_count >= 50
                      ? styles.mutualBtnDisabled
                      : `${styles.mutualBtn} ${successAction === "mutual" ? styles.successBtn : ""}`
                  }
                  type="button"
                  disabled={isProcessing || !!activeAction}
                  onClick={() => {
                    if (viewerProfile && viewerProfile.mutual_count >= 50) {
                      alert(
                        "⚠️ Mutual Limit Reached\nYou have reached the maximum limit of 50 mutuals."
                      );
                    } else {
                      handleAction("mutual", () => onAdMutual(ad));
                    }
                  }}
                  title="Add advertiser to mutuals"
                >
                  {successAction === "mutual" ? (
                    <>
                      <Check size={11} strokeWidth={2} className={styles.tickIcon} />
                      <span>Added</span>
                    </>
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
