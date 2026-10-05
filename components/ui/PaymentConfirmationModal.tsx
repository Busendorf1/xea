"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Shield, X, Lock } from "lucide-react";
import AppleSpinner from "@/components/ui/AppleSpinner";
import styles from "./PaymentConfirmationModal.module.css";

export interface SummaryItem {
  label: string;
  value: string;
}

export interface PaymentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  serviceTitle?: string;
  amountFormatted: string;
  paymentMethodText?: string;
  summaryItems?: SummaryItem[];
  isSubmitting?: boolean;
}

export default function PaymentConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  amountFormatted,
  isSubmitting = false,
}: PaymentConfirmationModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  // Reset acknowledgment whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setAcknowledged(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className={styles.backdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-confirmation-title"
          onClick={() => {
            if (!isSubmitting) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <div className={styles.iconCircle}>
                  <ShieldCheck size={22} strokeWidth={2} />
                </div>
                <div className={styles.titleGroup}>
                  <h3 id="payment-confirmation-title" className={styles.title}>
                    Review refund policy before proceeding
                  </h3>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                disabled={isSubmitting}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Non-Refundable Policy Callout */}
            <div className={styles.policyCallout}>
              <div className={styles.policyHeader}>
                <Shield size={14} strokeWidth={2.2} />
                <span>Strict Non-Refundable Policy</span>
              </div>
              <p className={styles.policyText}>
                In line with our{" "}
                <Link
                  href="/terms#aml-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.policyLink}
                >
                  Anti-Money Laundering (AML) compliance policy
                </Link>
                , all payments are strictly final and non-refundable under any circumstances once processed.
              </p>
            </div>

            {/* Affirmation Checkbox with generous padding */}
            <label className={styles.affirmationBox}>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={isSubmitting}
                className={styles.checkbox}
                id="nonRefundableAffirmationCheckbox"
              />
              <span className={styles.affirmationLabel}>
                I understand and agree that <strong className={styles.affirmationLabelStrong}>this transaction is strictly non-refundable</strong>.
              </span>
            </label>

            {/* Action Buttons */}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={onConfirm}
                disabled={!acknowledged || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <AppleSpinner size={16} color="currentColor" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Pay {amountFormatted}</span>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
