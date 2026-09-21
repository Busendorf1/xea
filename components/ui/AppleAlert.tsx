"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Check, X, AlertTriangle, Info, AlertOctagon } from "lucide-react";
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
 * Dispatch an Apple-style motion animated alert anywhere in the client
 */
export function showAppleAlert(
  message: string,
  type: AppleAlertType = "info",
  title?: string
) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("paayh:apple-alert", {
        detail: { message, type, title, timestamp: Date.now() },
      })
    );
  }
}

/**
 * Dynamic Island & Apple-designed Glassmorphic Toast HUD Component
 */
export default function AppleAlertHUD() {
  const [currentAlert, setCurrentAlert] = useState<AppleAlertItem | null>(null);
  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dismissTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const dismiss = useCallback(() => {
    setCurrentAlert((prev) => (prev ? { ...prev, isExiting: true } : null));
    if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    exitTimeoutRef.current = setTimeout(() => {
      setCurrentAlert(null);
    }, 280);
  }, []);

  useEffect(() => {
    // Intercept native browser alert calls globally
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
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);

      const newItem: AppleAlertItem = {
        id: `${Date.now()}_${Math.random()}`,
        message: customEvt.detail.message,
        type: customEvt.detail.type || "info",
        title: customEvt.detail.title,
        isExiting: false,
      };

      setCurrentAlert(newItem);

      // Auto dismiss after 3.6s
      dismissTimeoutRef.current = setTimeout(() => {
        dismiss();
      }, 3600);
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
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    };
  }, [dismiss]);

  if (!currentAlert) return null;

  const renderIcon = () => {
    switch (currentAlert.type) {
      case "success":
        return (
          <div className={`${styles.iconBadge} ${styles.iconSuccess}`}>
            <Check size={16} strokeWidth={2.5} />
          </div>
        );
      case "error":
        return (
          <div className={`${styles.iconBadge} ${styles.iconError}`}>
            <AlertOctagon size={16} strokeWidth={2.5} />
          </div>
        );
      case "warning":
        return (
          <div className={`${styles.iconBadge} ${styles.iconWarning}`}>
            <AlertTriangle size={15} strokeWidth={2.5} />
          </div>
        );
      default:
        return (
          <div className={`${styles.iconBadge} ${styles.iconInfo}`}>
            <Info size={16} strokeWidth={2.5} />
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

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`${styles.appleAlertContainer} ${
        currentAlert.isExiting ? styles.exiting : styles.entering
      }`}
      onClick={dismiss}
    >
      <div className={styles.contentRow}>
        {renderIcon()}
        <div className={styles.textContainer}>
          <span className={styles.alertTitle}>{getTitle()}</span>
          <span className={styles.alertMessage}>{currentAlert.message}</span>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          aria-label="Dismiss alert"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      </div>
      <div className={`${styles.progressBar} ${styles[`progress_${currentAlert.type}`]}`} />
    </div>
  );
}
