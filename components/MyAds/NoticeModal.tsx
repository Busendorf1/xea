"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, AlertOctagon, XCircle, RotateCw } from "lucide-react";
import styles from "./page.module.css";

export interface NoticeModalData {
  title: string;
  message: string;
  adId?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  isDestructive?: boolean;
}

interface NoticeModalProps {
  notice: NoticeModalData | null;
  onClose: () => void;
}

export default function NoticeModal({ notice, onClose }: NoticeModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    setIsConfirming(false);
  }, [notice?.title, notice?.message]);

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={styles.modalOverlay}
          onClick={isConfirming ? undefined : onClose}
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
                {notice.isDestructive ? (
                  <AlertOctagon size={22} color="#ef4444" />
                ) : (
                  <Info size={22} color="var(--primary)" />
                )}
                <h3 className={`${styles.modalTitle} ${styles.noticeModalTitle}`}>{notice.title}</h3>
              </div>
              <button 
                className={styles.modalClose} 
                onClick={isConfirming ? undefined : onClose} 
                disabled={isConfirming}
                aria-label="Close dialog"
              >
                <XCircle size={24} />
              </button>
            </div>
            <div className={styles.noticeModalBody}>
              <p className={styles.noticeModalBodyPara}>{notice.message}</p>
            </div>
            <div className={styles.noticeModalFooter}>
              {notice.onConfirm ? (
                <div className={styles.modalActionBtns}>
                  <button
                    type="button"
                    disabled={isConfirming}
                    className={styles.modalCancelBtn}
                    onClick={isConfirming ? undefined : onClose}
                  >
                    {notice.cancelText || "Not Now"}
                  </button>
                  <button
                    type="button"
                    disabled={isConfirming}
                    className={notice.isDestructive ? styles.modalDeleteBtn : `${styles.boostBtn} ${styles.gotItBtn}`}
                    onClick={async () => {
                      if (isConfirming) return;
                      const confirmFn = notice.onConfirm;
                      if (!confirmFn) {
                        onClose();
                        return;
                      }
                      try {
                        setIsConfirming(true);
                        await confirmFn();
                      } catch (err) {
                        console.error("Notice action failed:", err);
                      } finally {
                        setIsConfirming(false);
                      }
                    }}
                  >
                    {isConfirming ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span className="btnSpinner" aria-hidden="true" />
                        <span>{notice.isDestructive ? "Deleting..." : "Processing..."}</span>
                      </span>
                    ) : (
                      notice.confirmText || "Delete"
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`${styles.boostBtn} ${styles.gotItBtn}`}
                  onClick={onClose}
                >
                  Got it
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
