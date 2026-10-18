"use client";

import React from "react";
import { motion } from "framer-motion";
import { Activity, Clock, Eye, MousePointerClick, UserPlus } from "lucide-react";
import styles from "./page.module.css";

interface CampaignKpiSummaryProps {
  activeCount: number;
  reviewCount: number;
  totalImpressions: number;
  totalClicks: number;
  totalMutuals: number;
}

export default function CampaignKpiSummary({
  activeCount,
  reviewCount,
  totalImpressions,
  totalClicks,
  totalMutuals,
}: CampaignKpiSummaryProps) {
  const avgCtr =
    totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : "0.0";

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
          <span className={styles.kpiLabel}>Active Campaigns</span>
          <span className={styles.kpiIconBox}>
            <Activity size={15} />
          </span>
        </div>
        <span className={styles.kpiValue}>{activeCount}</span>
        <span className={styles.kpiSub}>
          <span className={styles.liveDot} /> Delivering in feed
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
          <span className={styles.kpiLabel}>In Review Queue</span>
          <span className={`${styles.kpiIconBox} ${styles.kpiIconBoxMuted}`}>
            <Clock size={15} />
          </span>
        </div>
        <span className={`${styles.kpiValue} ${reviewCount === 0 ? styles.kpiValueMuted : ""}`}>
          {reviewCount}
        </span>
        <span className={`${styles.kpiSub} ${styles.kpiSubMuted}`}>
          {reviewCount > 0 ? "Awaiting moderation" : "Queue clear"}
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
          <span className={styles.kpiLabel}>Verified Views</span>
          <span className={styles.kpiIconBox}>
            <Eye size={15} />
          </span>
        </div>
        <span className={styles.kpiValue}>{totalImpressions.toLocaleString()}</span>
        <span className={styles.kpiSub}>Total impressions served</span>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
        }}
        className={styles.kpiCard}
      >
        <div className={styles.kpiHeaderRow}>
          <span className={styles.kpiLabel}>CTA Conversions</span>
          <span className={styles.kpiIconBox}>
            <MousePointerClick size={15} />
          </span>
        </div>
        <div className={styles.kpiValueGroup}>
          <span className={styles.kpiValue}>{totalClicks.toLocaleString()}</span>
          <span className={styles.kpiTrendBadge}>{avgCtr}% CTR</span>
        </div>
        <span className={styles.kpiSub}>Direct action clicks</span>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
        }}
        className={styles.kpiCard}
      >
        <div className={styles.kpiHeaderRow}>
          <span className={styles.kpiLabel}>Mutual+ Gained</span>
          <span className={styles.kpiIconBox}>
            <UserPlus size={15} />
          </span>
        </div>
        <span className={styles.kpiValue}>{totalMutuals.toLocaleString()}</span>
        <span className={styles.kpiSub}>Audience connections</span>
      </motion.div>
    </motion.div>
  );
}
