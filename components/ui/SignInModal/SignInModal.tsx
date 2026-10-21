"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, AlertCircle } from "lucide-react";
import TermsAgreementCheckbox from "@/components/ui/TermsAgreementCheckbox/TermsAgreementCheckbox";
import styles from "./SignInModal.module.css";

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SignInModal({ isOpen, onClose }: SignInModalProps) {
  const [termsAgreed, setTermsAgreed] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<"google" | "apple" | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Close on ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !authLoading) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, authLoading, onClose]);

  // Reset states when opening/closing
  useEffect(() => {
    if (!isOpen) {
      setTermsAgreed(false);
      setAuthLoading(null);
      setValidationError(null);
    }
  }, [isOpen]);

  const handleAuthClick = (type: "google" | "apple", href: string) => {
    if (authLoading) return;

    if (!termsAgreed) {
      setValidationError("Please confirm you are at least 18 years old and agree to our terms before signing in.");
      return;
    }

    setValidationError(null);
    setAuthLoading(type);
    window.location.href = href;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (!authLoading) onClose();
          }}
        >
          <motion.div
            className={styles.modalCard}
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="signin-title"
          >
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              disabled={!!authLoading}
              aria-label="Close Sign In Dialog"
            >
              <X size={18} />
            </button>

            <div className={styles.header}>
              <div className={styles.brandBadge}>
                <ShieldCheck size={13} />
                <span>Verified Access</span>
              </div>
              <h2 id="signin-title" className={styles.title}>
                Sign In to Paayh
              </h2>
              <p className={styles.subtitle}>
                One tap to access your campaigns, attention earnings, and dashboard.
              </p>
            </div>

            <div className={styles.buttonsWrapper}>
              {/* Continue with Google */}
              <button
                type="button"
                className={styles.authBtn}
                disabled={!!authLoading}
                onClick={() =>
                  handleAuthClick("google", "/auth/login?connection=google-oauth2")
                }
              >
                {authLoading === "google" ? (
                  <>
                    <span className={styles.btnSpinner} aria-hidden="true" />
                    <span>Connecting with Google...</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path
                        fill="#EA4335"
                        d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582l3.51-3.51C17.755 1.059 15.027 0 12 0 7.37 0 3.382 2.673 1.482 6.555l3.784 3.21z"
                      />
                      <path
                        fill="#4285F4"
                        d="M23.49 12.275c0-.825-.075-1.613-.206-2.383H12v4.568h6.488a5.64 5.64 0 0 1-2.446 3.7l3.797 3.22c2.21-2.036 3.653-5.043 3.653-8.105z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.266 14.235L1.482 17.445A11.954 11.954 0 0 0 12 24c3.045 0 5.808-1.009 7.839-2.738l-3.797-3.22a7.1 7.1 0 0 1-4.042 1.139 7.068 7.068 0 0 1-6.734-4.946z"
                      />
                      <path
                        fill="#34A853"
                        d="M1.482 6.555c-.307.92-.482 1.9-.482 2.924s.175 2.004.482 2.924l3.784-3.21a7.06 7.06 0 0 1 0-5.428L1.482 6.555z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              {/* Continue with Apple */}
              <button
                type="button"
                className={styles.authBtn}
                disabled={!!authLoading}
                onClick={() =>
                  handleAuthClick("apple", "/auth/login?connection=apple")
                }
              >
                {authLoading === "apple" ? (
                  <>
                    <span className={styles.btnSpinner} aria-hidden="true" />
                    <span>Connecting with Apple...</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-1.99.6-2.64 1.35-.57.65-1.07 1.71-.93 2.73 1 .08 2.03-.49 2.65-1.23z" />
                    </svg>
                    <span>Continue with Apple</span>
                  </>
                )}
              </button>
            </div>

            {/* Terms and 18+ Age Verification */}
            <TermsAgreementCheckbox
              id="signin-terms-agreement"
              checked={termsAgreed}
              onChange={(checked) => {
                setTermsAgreed(checked);
                if (checked) setValidationError(null);
              }}
              instruction="Please read and review the terms and policies below, and tick the box if you accept:"
              terms={[
                { label: "Terms of Service", href: "/terms" },
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Cookie Policy", href: "/cookies" },
              ]}
              checkboxLabel={<><strong>18+ Age Confirmation:</strong> I confirm that I am at least 18 years of age, have read and reviewed, and accept the Terms of Service and Privacy Policy.</>}
              errorMessage={validationError}
              required
              variant="card"
            />

            {/* Validation warning if user clicked without checking */}
            {validationError && (
              <motion.div
                className={styles.warningBox}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <AlertCircle size={14} flex-shrink={0} />
                <span>{validationError}</span>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
