"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, XCircle } from "lucide-react";
import styles from "./page.module.css";

interface NoticeModalProps {
  notice: { title: string; message: string; adId?: string } | null;
  onClose: () => void;
}

export default function NoticeModal({ notice, onClose }: NoticeModalProps) {
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={styles.modalOverlay}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={`${styles.modalContent} ${styles.noticeModal}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <Info size={22} color="var(--primary)" />
                <h3 className={`${styles.modalTitle} ${styles.noticeModalTitle}`}>{notice.title}</h3>
              </div>
              <button className={styles.modalClose} onClick={onClose}>
                <XCircle size={24} />
              </button>
            </div>
            <div className={styles.noticeModalBody}>
              <p className={styles.noticeModalBodyPara}>{notice.message}</p>
            </div>
            <div className={styles.noticeModalFooter}>
              <button
                type="button"
                className={`${styles.boostBtn} ${styles.gotItBtn}`}
                onClick={onClose}
              >
                Got It
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
