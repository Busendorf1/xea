"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Eye, Sparkles } from "lucide-react";
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
      const alreadyAccepted = localStorage.getItem(STORAGE_KEY) === "true";
      if (!alreadyAccepted) {
        setIsOpen(true);
      }
    } catch {
      // Graceful fallback for strict cookie/storage privacy settings
    }
  }, []);

  const handleConfirm = () => {
    if (!agreed) return;
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {}
    setIsOpen(false);
    onAccept?.();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="fair-attention-title">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: "spring", damping: 25, stiffness: 320 }}
            className={styles.modalCard}
          >
            <div className={styles.header}>
              <div className={styles.iconCircle}>
                <ShieldCheck size={26} color="#10b981" />
              </div>
              <h2 id="fair-attention-title" className={styles.title}>
                Fair Attention &amp; Good Faith Value
              </h2>
            </div>

            <div className={styles.body}>
              <p className={styles.leadText}>
                The least you can give back in good faith is to <strong>genuinely see the content, read it</strong>, and deliver the real attention an advertiser values. That is the foundational reason you earn on Paayh.
              </p>

              <div className={styles.bulletList}>
                <div className={styles.bulletItem}>
                  <Eye size={18} className={styles.bulletIcon} />
                  <span>
                    <strong>Authentic Attention:</strong> You are not mandated to purchase or patronize, but you must never cheat, automate, or farm earnings without fair play.
                  </span>
                </div>
                <div className={styles.bulletItem}>
                  <Sparkles size={18} className={styles.bulletIcon} />
                  <span>
                    <strong>Due Diligence:</strong> If an offer resonates with you and you choose to patronize a brand, please exercise due diligence.
                  </span>
                </div>
              </div>

              <div className={styles.termsNotice}>
                <span>
                  Please read our full{" "}
                  <Link href="/terms" target="_blank" className={styles.legalLink}>
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className={styles.legalLink}>
                    Privacy Policy
                  </Link>
                  . If you do not agree to uphold these standards, you may not use Paayh.
                </span>
              </div>

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className={styles.checkboxInput}
                />
                <span className={styles.checkboxLabel}>
                  I pledge to deliver authentic attention in good faith, play fair without cheat scripts, and I agree to the Terms of Service.
                </span>
              </label>
            </div>

            <div className={styles.footer}>
              <button
                type="button"
                disabled={!agreed}
                onClick={handleConfirm}
                className={`${styles.submitBtn} ${agreed ? styles.submitBtnActive : styles.submitBtnDisabled}`}
              >
                I Understand &amp; Accept
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
