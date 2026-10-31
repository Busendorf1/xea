"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import styles from "./FairAttentionModal.module.css";

const STORAGE_KEY = "paayh_fair_attention_pledge_v1";

interface Props {
  onAccept?: () => void;
}

export default function FairAttentionModal({ onAccept }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    try {
      const alreadyAccepted = sessionStorage.getItem(STORAGE_KEY) === "true";
      if (!alreadyAccepted) {
        setIsOpen(true);
      } else {
        onAccept?.();
      }
    } catch {
      setIsOpen(true);
    }
  }, [onAccept]);

  // Lock background scroll while modal is open
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const handleConfirm = () => {
    if (!agreed) return;
    try {
      localStorage.setItem(STORAGE_KEY, "true");
      sessionStorage.setItem(STORAGE_KEY, "true");
    } catch {}
    setIsOpen(false);
    onAccept?.();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="fair-attention-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className={styles.card}
            initial={{ opacity: 0, scale: 0.92, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.95, y: 8, filter: "blur(4px)" }}
            transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.8 }}
          >
            <div className={styles.headerRow}>
              <h2 id="fair-attention-title" className={styles.title}>
                Goodwill &amp; Fair Attention
              </h2>
            </div>

            <p className={styles.subtitle}>
              View ads genuinely in good faith and never use automation or scripts so advertisers receive real attention and payouts stay fair.
            </p>

            <div className={styles.actionRow}>
              <motion.button
                type="button"
                role="checkbox"
                aria-checked={agreed}
                onClick={() => setAgreed((prev) => !prev)}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 24 }}
                className={`${styles.agreementBox} ${agreed ? styles.agreementBoxChecked : ""}`}
              >
                <motion.span
                  className={`${styles.checkbox} ${agreed ? styles.checkboxChecked : ""}`}
                  animate={agreed ? { scale: [0.85, 1.12, 1] } : { scale: 1 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                  <AnimatePresence>
                    {agreed && (
                      <motion.span
                        key="tick"
                        className={styles.tickIconWrap}
                        initial={{ scale: 0, opacity: 0, rotate: -15 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 24 }}
                      >
                        <Check size={10} strokeWidth={3.2} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.span>
                <span className={styles.agreementText}>
                  I pledge genuine attention &amp; fair play
                </span>
              </motion.button>

              <motion.button
                type="button"
                className={styles.verifyBtn}
                disabled={!agreed}
                onClick={handleConfirm}
                whileHover={agreed ? { scale: 1.03, y: -1 } : undefined}
                whileTap={agreed ? { scale: 0.96, y: 0 } : undefined}
                transition={{ type: "spring", stiffness: 420, damping: 24 }}
              >
                <span className={styles.btnContent}>
                  <Check size={13} strokeWidth={2.6} />
                  <span>Continue</span>
                </span>
              </motion.button>
            </div>

            <div className={styles.footerRow}>
              <span className={styles.footerNote}>
                By continuing, you agree to our{" "}
                <Link href="/terms" target="_blank" className={styles.legalLink}>
                  Terms
                </Link>{" "}
                &amp;{" "}
                <Link href="/privacy" target="_blank" className={styles.legalLink}>
                  Privacy Policy
                </Link>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
