"use client";

import React from "react";
import { AlertTriangle, AlertCircle, X } from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";
import styles from "./page.module.css";

export function MonetizeLoadingSkeleton() {
  return (
    <div className={styles.container} aria-busy="true" aria-label="Loading monetization status">
      <main className={styles.main}>
        <div className={styles.header}>
          <Skeleton variant="title" width={180} height={32} />
          <div style={{ marginTop: 8 }}>
            <Skeleton variant="text" width="75%" height={16} />
          </div>
        </div>

        <div className={styles.contentGrid}>
          <div className={styles.statusCard} style={{ background: "var(--card-bg)" }}>
            <div className={styles.statusHeaderRow}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Skeleton variant="rect" width={44} height={44} style={{ borderRadius: "50%" }} />
                <div>
                  <Skeleton variant="title" width={220} height={20} />
                  <div style={{ marginTop: 6 }}>
                    <Skeleton variant="text" width={280} height={14} />
                  </div>
                </div>
              </div>
              <Skeleton variant="rect" width={90} height={28} style={{ borderRadius: 9999 }} />
            </div>
          </div>

          <div className={styles.progressGrid} style={{ marginTop: 24 }}>
            <div className={styles.progressCard}>
              <div className={styles.progressHeaderRow}>
                <Skeleton variant="title" width={240} height={20} />
                <Skeleton variant="rect" width={52} height={24} style={{ borderRadius: 8 }} />
              </div>
              <div style={{ marginTop: 16 }}>
                <Skeleton variant="text" width="92%" height={14} />
                <Skeleton variant="text" width="65%" height={14} style={{ marginTop: 6 }} />
              </div>
              <div className={styles.metricsGrid} style={{ marginTop: 20 }}>
                <div className={styles.metricBox}>
                  <Skeleton variant="text" width={75} height={12} />
                  <div style={{ marginTop: 6 }}>
                    <Skeleton variant="title" width={95} height={22} />
                  </div>
                </div>
                <div className={styles.metricBox}>
                  <Skeleton variant="text" width={75} height={12} />
                  <div style={{ marginTop: 6 }}>
                    <Skeleton variant="title" width={95} height={22} />
                  </div>
                </div>
              </div>
              <div className={styles.progressBarWrapper} style={{ marginTop: 20 }}>
                <Skeleton variant="rect" width="100%" height={10} style={{ borderRadius: 9999 }} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

interface MonetizeCancelModalProps {
  confirmEmailInput: string;
  setConfirmEmailInput: (val: string) => void;
  holdProgress: number;
  isSubmittingCancel: boolean;
  cancelError: string;
  setCancelError: (err: string) => void;
  startHold: () => void;
  cancelHold: () => void;
  onClose: () => void;
  onExecuteCancel: (payload: { confirmEmail?: string; holdConfirmed?: boolean }) => Promise<void>;
}

export function MonetizeCancelModal({
  confirmEmailInput,
  setConfirmEmailInput,
  holdProgress,
  isSubmittingCancel,
  cancelError,
  setCancelError,
  startHold,
  cancelHold,
  onClose,
  onExecuteCancel,
}: MonetizeCancelModalProps) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (holdProgress / 100) * circumference;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>
            <AlertTriangle size={20} color="var(--danger)" />
            Confirm Cancellation
          </h3>
          <button
            onClick={onClose}
            className={styles.modalCloseBtn}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        <p className={styles.modalText}>
          Are you sure you want to cancel your monetization? Your wallet balance is <strong>fully preserved and remains available for withdrawal</strong>.
        </p>

        <div className={styles.modalFieldGroup}>
          <label className={styles.modalLabel}>
            Type your email or username to confirm:
          </label>
          <input
            type="text"
            placeholder="Enter Email or Username"
            value={confirmEmailInput}
            onChange={(e) => setConfirmEmailInput(e.target.value)}
            className={styles.modalInput}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <div className={styles.modalOrDivider}>
          <span>OR</span>
        </div>

        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <button
            type="button"
            onMouseDown={startHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
            disabled={isSubmittingCancel}
            className={styles.holdCancelBtn}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
              <circle cx="12" cy="12" r={radius} stroke="rgba(239,68,68,0.25)" strokeWidth="2.5" fill="none" />
              <circle
                cx="12"
                cy="12"
                r={radius}
                stroke="var(--danger)"
                strokeWidth="2.5"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <span>{holdProgress > 0 ? "Hold to confirm..." : "Hold 2s to Cancel"}</span>
          </button>
        </div>

        {cancelError && (
          <div className={styles.modalError}>
            <AlertCircle size={16} color="var(--danger)" />
            <span>{cancelError}</span>
          </div>
        )}

        <div className={styles.modalFooter}>
          <button onClick={onClose} className={styles.modalCancelBtn}>
            Not now
          </button>

          <button
            disabled={isSubmittingCancel || !confirmEmailInput.trim()}
            onClick={async () => {
              const input = confirmEmailInput.trim();
              if (!input) {
                setCancelError("Please enter your email or username.");
                return;
              }
              await onExecuteCancel({ confirmEmail: input });
            }}
            className={styles.modalConfirmBtn}
          >
            {isSubmittingCancel ? "Cancelling..." : "Confirm with Input"}
          </button>
        </div>
      </div>
    </div>
  );
}
