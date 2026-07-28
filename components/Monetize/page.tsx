"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import Link from "next/link";
import Footer from "../Footers/page";
import { ShieldCheck, Zap, AlertTriangle, ArrowRight, CheckCircle2, Clock, Activity } from "lucide-react";

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

  const fetchStatus = async () => {
    if (!email) return;
    try {
      setLoading(true);
      const res = await fetch("/api/monetize");
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
            Monetization on Xea is 100% free! Complete 300 ad clicks (views & mutuals) to activate your account monetization. No payments required.
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
                        ? "Congratulations! Your account is fully monetized. You can now earn on bidded ads."
                        : `Complete 300 ad interactions to unlock full account monetization.`}
                    </p>
                  </div>
                </div>
                <span className={isMonetized ? styles.badgeActive : styles.badgeProgress}>
                  {isMonetized ? "MONETIZED" : `${progressPercent}% COMPLETED`}
                </span>
              </div>
            </div>

            {/* 300 Clicks Progress Card */}
            <div className={styles.progressCard}>
              <h3 className={styles.cardSectionTitle}>300 Clicks Progress Tracker</h3>
              
              <div className={styles.metricsGrid}>
                <div className={styles.metricBox}>
                  <span className={styles.metricLabel}>Clicks Achieved</span>
                  <strong className={styles.metricValue}>{clicksCount} / 300</strong>
                </div>

                <div className={styles.metricBox}>
                  <span className={styles.metricLabel}>Clicks Remaining</span>
                  <strong className={styles.metricValueRemaining}>
                    {isMonetized ? "0 (Goal Achieved)" : `${clicksRemaining} clicks`}
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

            {/* 7-Day Inactivity Warning Card */}
            <div className={styles.policyCard}>
              <div className={styles.policyHeader}>
                <AlertTriangle size={22} className={styles.warningIcon} />
                <h4>7-Day Activity Policy</h4>
              </div>
              <p className={styles.policyDesc}>
                To maintain monetization, you must remain an active community member. If you are inactive (no ad views or interactions) for <strong>7 consecutive days</strong>, your monetization status will be withdrawn and your click counter will reset to 0. Upon returning, you will need to complete 300 clicks all over again.
              </p>
            </div>

            {/* Button Rules Explainer */}
            <div className={styles.infoCard}>
              <h4 className={styles.infoTitle}>How Button Visibility & Earnings Work</h4>
              <ul className={styles.infoList}>
                <li>
                  <strong>Not Monetized Accounts</strong>: You can see and use the <strong>"Seen"</strong> and <strong>"Mutual"</strong> buttons on ad cards. Every interaction adds 1 click to your 300 clicks progress.
                </li>
                <li>
                  <strong>Monetized Accounts</strong>: Once you hit 300 clicks, your account automatically unlocks the <strong>"Earn+"</strong> button, allowing you to earn cash directly into your wallet balance on bidded ads.
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
