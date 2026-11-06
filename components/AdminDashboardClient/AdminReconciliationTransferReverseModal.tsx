"use client";

import React from "react";
import { RefreshCw, X } from "lucide-react";
import styles from "./page.module.css";

export interface AdminReconciliationTransferReverseModalProps {
  showReverseModal: boolean;
  setShowReverseModal: (s: boolean) => void;
  reverseRef: string;
  setReverseRef: (r: string) => void;
  reverseReason: string;
  setReverseReason: (r: string) => void;
  reversalLoading: boolean;
  reversalError: string;
  handleExecuteReversal: (e: React.FormEvent) => void;
}

export function AdminReconciliationTransferReverseModal({
  showReverseModal,
  setShowReverseModal,
  reverseRef,
  setReverseRef,
  reverseReason,
  setReverseReason,
  reversalLoading,
  reversalError,
  handleExecuteReversal,
}: AdminReconciliationTransferReverseModalProps) {
  if (!showReverseModal) return null;

  return (
    <div
      role="presentation"
      className={styles.modalOverlay}
      onClick={() => !reversalLoading && setShowReverseModal(false)}
    >
      <div className={`${styles.modalContent} ${styles.adminCls_179}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.adminCls_160}>
            <div className={styles.adminCls_180}>
              <RefreshCw size={20} />
            </div>
            <div>
              <h3 className={`${styles.modalTitle} ${styles.mZero}`}>Reverse User Transfer</h3>
              <span className={styles.adminCls_112}>
                Claw back funds from recipient and refund sender atomically.
              </span>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => !reversalLoading && setShowReverseModal(false)}
            disabled={reversalLoading}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleExecuteReversal}>
          <div className={styles.modalBody}>
            {reversalError && <div className={styles.adminCls_181}>{reversalError}</div>}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Transaction Reference (Required)</label>
              <input
                type="text"
                placeholder="e.g. trf_1725619200000_abc123"
                value={reverseRef}
                onChange={(e) => setReverseRef(e.target.value)}
                required
                disabled={reversalLoading}
                className={`${styles.inputField} ${styles.adminCls_182}`}
              />
              <span className={styles.formHelperText}>
                Enter the original debit or credit transaction reference recorded on the ledger.
              </span>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Audit Reason / Notes (Required)</label>
              <textarea
                rows={3}
                placeholder="Explain reason for transfer reversal (e.g., Reported user compromise, accidental duplicate transfer)..."
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                required
                disabled={reversalLoading}
                className={styles.textareaField}
              />
              <span className={styles.formHelperText}>
                Transactions exceeding ₦50,000 will be routed to the Dual-Authorization Queue for second-party review.
              </span>
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              onClick={() => setShowReverseModal(false)}
              disabled={reversalLoading}
              className={styles.btnAction}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reversalLoading}
              className={`${styles.btnAction} ${styles.reverseModalSubmitBtn} ${
                reversalLoading ? styles.btnDisabled : ""
              }`}
            >
              {reversalLoading ? "Executing Reversal..." : "Execute Reversal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminReconciliationTransferReverseModal;
