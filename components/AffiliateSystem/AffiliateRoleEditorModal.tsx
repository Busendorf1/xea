"use client";

import React, { useState } from "react";
import { X, Award } from "lucide-react";
import styles from "./AffiliateSystem.module.css";
import AffiliateBadgeDisplay from "./AffiliateBadgeDisplay";

export interface AffiliateRoleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  initialIsCareer?: boolean;
  initialIsAffiliate?: boolean;
  initialRoleTitle?: string | null;
  onSave: (roles: {
    isCareer: boolean;
    isAffiliate: boolean;
    affiliateRole?: string | null;
  }) => Promise<void> | void;
  submitting?: boolean;
}

export function AffiliateRoleEditorModal({
  isOpen,
  onClose,
  userEmail,
  initialIsCareer = false,
  initialIsAffiliate = false,
  initialRoleTitle = "",
  onSave,
  submitting = false,
}: AffiliateRoleEditorModalProps) {
  const [isCareer, setIsCareer] = useState(initialIsCareer);
  const [isAffiliate, setIsAffiliate] = useState(initialIsAffiliate);
  const [roleTitle, setRoleTitle] = useState(initialRoleTitle || "");

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      isCareer,
      isAffiliate,
      affiliateRole: isAffiliate ? roleTitle.trim() || "Platform Affiliate" : null,
    });
    onClose();
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.titleGroup}>
            <Award size={20} color="#fbbf24" />
            <h3 className={styles.modalTitle}>Configure Roles &amp; Badges</h3>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className={styles.subtitle}>
          Editing special badge privileges for <strong>{userEmail}</strong>
        </p>

        <form onSubmit={handleSave} className={styles.formGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={isCareer}
              onChange={(e) => setIsCareer(e.target.checked)}
            />
            <span>
              <strong>Career Badge</strong> (Purple Star · 0% earn)
            </span>
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={isAffiliate}
              onChange={(e) => setIsAffiliate(e.target.checked)}
            />
            <span>
              <strong>Affiliate Badge</strong> (Yellow Star · 10% platform share)
            </span>
          </label>

          {isAffiliate && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Affiliate Role Title
              </label>
              <input
                type="text"
                placeholder="e.g. Affiliate Developer, Affiliate First Agent"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                className={styles.input}
              />
              <div className={styles.previewRow}>
                <span className={styles.metricSubtext}>Preview: </span>
                <AffiliateBadgeDisplay roleTitle={roleTitle || "Platform Affiliate"} />
              </div>
            </div>
          )}

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AffiliateRoleEditorModal;
