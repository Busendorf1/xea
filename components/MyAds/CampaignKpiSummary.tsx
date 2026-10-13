"use client";

import React from "react";
import { motion } from "framer-motion";
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
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren: 0.06 },
        },
      }}
      className={styles.kpiContainer}
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 12 },
          show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
        }}
        whileHover={{ y: -3, scale: 1.015 }}
        className={styles.kpiCard}
      >
        <span className={styles.kpiLabel}>Active Campaigns</span>
        <span className={styles.kpiValue}>{activeCount}</span>
        <span className={styles.kpiSub}>Currently delivering</span>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 12 },
          show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
        }}
        whileHover={{ y: -3, scale: 1.015 }}
        className={styles.kpiCard}
      >
        <span className={styles.kpiLabel}>Ads in Review</span>
        <span className={`${styles.kpiValue} ${styles.kpiValueMuted}`}>{reviewCount}</span>
        <span className={`${styles.kpiSub} ${styles.kpiSubMuted}`}>Pending approval</span>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 12 },
          show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
        }}
        whileHover={{ y: -3, scale: 1.015 }}
        className={styles.kpiCard}
      >
        <span className={styles.kpiLabel}>Impressions Delivered</span>
        <span className={styles.kpiValue}>{totalImpressions.toLocaleString()}</span>
        <span className={styles.kpiSub}>Total views generated</span>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 12 },
          show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
        }}
        whileHover={{ y: -3, scale: 1.015 }}
        className={styles.kpiCard}
      >
        <span className={styles.kpiLabel}>Total Engagements</span>
        <span className={styles.kpiValue}>{totalClicks.toLocaleString()}</span>
        <span className={styles.kpiSub}>Direct action clicks</span>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 12 },
          show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
        }}
        whileHover={{ y: -3, scale: 1.015 }}
        className={styles.kpiCard}
      >
        <span className={styles.kpiLabel}>Mutual Additions</span>
        <span className={styles.kpiValue}>{totalMutuals.toLocaleString()}</span>
        <span className={styles.kpiSub}>New connections gained</span>
      </motion.div>
    </motion.div>
  );
}
