"use client";

import React from "react";
import { motion } from "framer-motion";
import { Activity, Clock, CheckCircle2, Zap, Calendar } from "lucide-react";
import styles from "../MyAds/page.module.css";

interface HighlightKpiSummaryProps {
  activeLiveCount: number;
  pendingCount: number;
  approvedTotalCount: number;
  biddedCount: number;
  totalScheduleDays: number;
}

export default function HighlightKpiSummary({
  activeLiveCount,
  pendingCount,
  approvedTotalCount,
  biddedCount,
  totalScheduleDays,
}: HighlightKpiSummaryProps) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren: 0.05 },
        },
      }}
      className={styles.kpiContainer}
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
        }}
        className={styles.kpiCard}
      >
        <div className={styles.kpiHeaderRow}>
          <span className={styles.kpiLabel}>Active Highlights</span>
          <span className={styles.kpiIconBox}>
            <Activity size={15} />
          </span>
        </div>
        <span className={styles.kpiValue}>{activeLiveCount}</span>
        <span className={styles.kpiSub}>
          <span className={styles.liveDot} /> Live in daily carousel
        </span>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
        }}
        className={styles.kpiCard}
      >
        <div className={styles.kpiHeaderRow}>
          <span className={styles.kpiLabel}>Pending Review</span>
          <span className={`${styles.kpiIconBox} ${styles.kpiIconBoxMuted}`}>
            <Clock size={15} />
          </span>
        </div>
        <span className={`${styles.kpiValue} ${pendingCount === 0 ? styles.kpiValueMuted : ""}`}>
          {pendingCount}
        </span>
        <span className={`${styles.kpiSub} ${styles.kpiSubMuted}`}>
          {pendingCount > 0 ? "Awaiting moderation" : "Queue clear"}
        </span>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
        }}
        className={styles.kpiCard}
      >
        <div className={styles.kpiHeaderRow}>
          <span className={styles.kpiLabel}>Approved Total</span>
          <span className={styles.kpiIconBox}>
            <CheckCircle2 size={15} />
          </span>
        </div>
        <span className={styles.kpiValue}>{approvedTotalCount}</span>
        <span className={styles.kpiSub}>Approved &amp; published</span>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
        }}
        className={styles.kpiCard}
      >
        <div className={styles.kpiHeaderRow}>
          <span className={styles.kpiLabel}>Spotlight Bidded</span>
          <span className={styles.kpiIconBox}>
            <Zap size={15} />
          </span>
        </div>
        <div className={styles.kpiValueGroup}>
          <span className={styles.kpiValue}>{biddedCount}</span>
          {biddedCount > 0 && <span className={styles.kpiTrendBadge}>#1 Auction</span>}
        </div>
        <span className={styles.kpiSub}>Priority top-carousel rank</span>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
        }}
        className={styles.kpiCard}
      >
        <div className={styles.kpiHeaderRow}>
          <span className={styles.kpiLabel}>Coverage Window</span>
          <span className={styles.kpiIconBox}>
            <Calendar size={15} />
          </span>
        </div>
        <span className={styles.kpiValue}>
          {totalScheduleDays} {totalScheduleDays === 1 ? "Day" : "Days"}
        </span>
        <span className={styles.kpiSub}>Combined spotlight duration</span>
      </motion.div>
    </motion.div>
  );
}
