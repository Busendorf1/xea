"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from "lucide-react";
import styles from "./AppleAlert.module.css";

export type AppleAlertType = "success" | "error" | "warning" | "info";

export interface AppleAlertItem {
  id: string;
  message: string;
  type: AppleAlertType;
  title?: string;
  isExiting?: boolean;
}

/**
 * Dispatch a branded pop-up feedback modal anywhere across the client.
 * Stays open until user clicks "Got it" or dismisses it.
 */
export function showAppleAlert(
  message: string,
  type: AppleAlertType = "info",
  title?: string
) {
  if (typeof window !== "undefined") {
    // Mobile tactile haptic feedback
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        if (type === "success") {
          navigator.vibrate([15, 30, 25]);
        } else if (type === "error") {
          navigator.vibrate([40, 40, 40]);
        } else if (type === "warning") {
          navigator.vibrate([25, 20]);
        } else {
          navigator.vibrate(15);
        }
      }
    } catch (_) {
      // Ignore vibration errors
    }

    window.dispatchEvent(
      new CustomEvent("paayh:apple-alert", {
        detail: { message, type, title, timestamp: Date.now() },
      })
    );
  }
}

/**
 * Alias for showAppleAlert
 */
export const showFeedbackModal = showAppleAlert;

/**
 * Branded Pop-up Feedback Modal Component
 * Styled identically to the Boost Notice Modal with "Got it" confirmation.
 */
export default function AppleAlertHUD() {
  const [currentAlert, setCurrentAlert] = useState<AppleAlertItem | null>(null);
  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const dismiss = useCallback(() => {
    setCurrentAlert((prev) => (prev ? { ...prev, isExiting: true } : null));
    if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    exitTimeoutRef.current = setTimeout(() => {
      setCurrentAlert(null);
    }, 220);
  }, []);

  // Lock body scroll and listen for Escape key
  useEffect(() => {
    if (!currentAlert) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        dismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentAlert, dismiss]);

  // Intercept native browser alert calls globally
  useEffect(() => {
    if (typeof window !== "undefined") {
      const originalAlert = window.alert;
      window.alert = (msg: any) => {
        const text = String(msg ?? "");
        const lower = text.toLowerCase();
        let inferredType: AppleAlertType = "info";

        if (
          lower.includes("error") ||
          lower.includes("failed") ||
          lower.includes("fail") ||
          lower.includes("cannot") ||
          lower.includes("unable") ||
          lower.includes("exceeds") ||
          lower.includes("invalid") ||
          lower.includes("denied")
        ) {
          inferredType = "error";
        } else if (
          lower.includes("success") ||
          lower.includes("approved") ||
          lower.includes("updated") ||
          lower.includes("paid") ||
          lower.includes("published") ||
          lower.includes("credited") ||
          lower.includes("activated") ||
          lower.includes("subscribed")
        ) {
          inferredType = "success";
        } else if (
          lower.includes("warning") ||
          lower.includes("limit") ||
          lower.includes("reached") ||
          lower.includes("caution") ||
          lower.includes("must be")
        ) {
          inferredType = "warning";
        }

        showAppleAlert(text, inferredType);
      };

      return () => {
        window.alert = originalAlert;
      };
    }
  }, []);

  useEffect(() => {
    const handleAlertEvent = (e: Event) => {
      const customEvt = e as CustomEvent<{
        message?: string;
        type?: AppleAlertType;
        title?: string;
      }>;
      if (!customEvt.detail?.message) return;

      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);

      const newItem: AppleAlertItem = {
        id: `${Date.now()}_${Math.random()}`,
        message: customEvt.detail.message,
        type: customEvt.detail.type || "info",
        title: customEvt.detail.title,
        isExiting: false,
      };

      setCurrentAlert(newItem);
    };

    const handleLegacyToast = (e: Event) => {
      const customEvt = e as CustomEvent<{ message?: string }>;
      if (customEvt?.detail?.message) {
        showAppleAlert(customEvt.detail.message, "info");
      }
    };

    window.addEventListener("paayh:apple-alert", handleAlertEvent);
    window.addEventListener("xea:toast", handleLegacyToast);

    return () => {
      window.removeEventListener("paayh:apple-alert", handleAlertEvent);
      window.removeEventListener("xea:toast", handleLegacyToast);
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    };
  }, []);

  if (!currentAlert) return null;

  const renderIcon = () => {
    switch (currentAlert.type) {
      case "success":
        return (
          <div className={styles.iconWrapper}>
            <CheckCircle2 size={24} color="#10b981" />
          </div>
        );
      case "error":
        return (
          <div className={styles.iconWrapper}>
            <AlertOctagon size={24} color="#ef4444" />
          </div>
        );
      case "warning":
        return (
          <div className={styles.iconWrapper}>
            <AlertTriangle size={24} color="#f59e0b" />
          </div>
        );
      default:
        return (
          <div className={styles.iconWrapper}>
            <Info size={24} color="#1d9bf0" />
          </div>
        );
    }
  };

  const getTitle = () => {
    if (currentAlert.title) return currentAlert.title;
    switch (currentAlert.type) {
      case "success":
        return "Success";
      case "error":
        return "Notice";
      case "warning":
        return "Attention";
      default:
        return "Update";
    }
  };

  const getBtnClass = () => {
    switch (currentAlert.type) {
      case "success":
        return `${styles.gotItBtn} ${styles.gotItBtnSuccess}`;
      case "warning":
        return `${styles.gotItBtn} ${styles.gotItBtnWarning}`;
      case "error":
        return `${styles.gotItBtn} ${styles.gotItBtnError}`;
      default:
        return styles.gotItBtn;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
      className={styles.feedbackOverlay}
      onClick={dismiss}
    >
      <div
        className={`${styles.modalDialog} ${
          currentAlert.isExiting ? styles.exiting : styles.entering
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Branded Icon, Title and Close Button */}
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            {renderIcon()}
            <h3 id="feedback-modal-title" className={styles.modalTitle}>
              {getTitle()}
            </h3>
          </div>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={dismiss}
            aria-label="Close dialog"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Message */}
        <div className={styles.modalBody}>
          <p className={styles.modalBodyPara}>{currentAlert.message}</p>
        </div>

        {/* Footer with Branded "Got it" Button */}
        <div className={styles.modalFooter}>
          <button
            type="button"
            autoFocus
            className={getBtnClass()}
            onClick={dismiss}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
