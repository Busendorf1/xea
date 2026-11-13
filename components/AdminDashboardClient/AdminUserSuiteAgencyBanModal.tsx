"use client";

import React from "react";
import { ShieldAlert, XCircle } from "lucide-react";
import styles from "./page.module.css";

interface AdminUserSuiteAgencyBanModalProps {
  open: boolean;
  onClose: () => void;
  activeUser: any;
  agencyBanType: "temp" | "perm" | "unban";
  setAgencyBanType: (v: "temp" | "perm" | "unban") => void;
  agencyBanDays: number;
  setAgencyBanDays: (v: number) => void;
  agencyBanReason: string;
  setAgencyBanReason: (v: string) => void;
  agencyBanDetachFollowers: boolean;
  setAgencyBanDetachFollowers: (v: boolean) => void;
  followersCount: number;
  userActionSubmitting: boolean;
  onAlertMissingReason: () => Promise<void>;
  onConfirmBan: () => void;
}

export function AdminUserSuiteAgencyBanModal({
  open,
  onClose,
  activeUser,
  agencyBanType,
  setAgencyBanType,
  agencyBanDays,
  setAgencyBanDays,
  agencyBanReason,
  setAgencyBanReason,
  agencyBanDetachFollowers,
  setAgencyBanDetachFollowers,
  followersCount,
  userActionSubmitting,
  onAlertMissingReason,
  onConfirmBan,
}: AdminUserSuiteAgencyBanModalProps) {
  if (!open) return null;

  return (
    <div
      role="presentation"
      className={styles.modalOverlay}
      style={{ zIndex: 1200 }}
      onClick={onClose}
    >
      <div
        className={`${styles.modalContent} ${styles.adminCls_159}`}
        style={{ maxWidth: 560, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div className={styles.adminCls_172}>
            <ShieldAlert size={22} color="#ef4444" />
            <h3 className={styles.modalTitle}>
              {agencyBanType === "perm" ? "Permanent Agency Ban" : "Temporary Agency Ban"}
            </h3>
          </div>
          <button
            type="button"
            className={styles.btnClose}
            onClick={onClose}
            title="Close"
          >
            <XCircle size={24} />
          </button>
        </div>

        <div className={styles.modalBody} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "rgba(239, 68, 68, 0.08)", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(239, 68, 68, 0.2)" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--foreground)" }}>
              Target User: <strong>@{activeUser.username}</strong> ({activeUser.email})
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
              This sanction restricts the user from earning agency commissions, revokes agency status, and prevents registration as an agent.
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Ban Duration / Type</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setAgencyBanType("temp");
                    setAgencyBanDays(d);
                  }}
                  className={`${styles.btnAction} ${agencyBanType === "temp" && agencyBanDays === d ? styles.btnDanger : ""}`}
                  style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                >
                  {d} Days
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAgencyBanType("perm")}
                className={`${styles.btnAction} ${agencyBanType === "perm" ? styles.btnDanger : ""}`}
                style={{ fontSize: "0.8rem", padding: "6px 12px" }}
              >
                Permanent Ban
              </button>
            </div>
          </div>

          {agencyBanType === "temp" && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Days of Agency Ban</label>
              <input
                type="number"
                min={1}
                max={365}
                value={agencyBanDays}
                onChange={(e) => setAgencyBanDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className={styles.inputField}
              />
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Reason / Complaint Note (Required)</label>
            <textarea
              rows={3}
              required
              placeholder="e.g., User dispute, spamming referral link in prohibited forums, fraudulent referral chain..."
              value={agencyBanReason}
              onChange={(e) => setAgencyBanReason(e.target.value)}
              className={styles.textareaField}
            />
            <span className={styles.formHelperText}>
              This reason will be logged in the admin audit history and visible in the user's security profile.
            </span>
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", cursor: "pointer", background: "var(--card-bg)", padding: "10px", borderRadius: 8, border: "1px solid var(--card-border)" }}>
            <input
              type="checkbox"
              checked={agencyBanDetachFollowers}
              onChange={(e) => setAgencyBanDetachFollowers(e.target.checked)}
              style={{ marginTop: 3, cursor: "pointer" }}
            />
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)" }}>
                Purge & Detach Existing Followers ({followersCount})
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                Releases downline users from this agent so they are no longer subject to commission deductions.
              </div>
            </div>
          </label>
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            onClick={onClose}
            className={styles.btnAction}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={userActionSubmitting || !agencyBanReason.trim()}
            onClick={async () => {
              if (!agencyBanReason.trim()) {
                await onAlertMissingReason();
                return;
              }
              onConfirmBan();
            }}
            className={`${styles.btnAction} ${styles.btnDanger}`}
          >
            {userActionSubmitting ? "Applying Ban..." : "Apply Agency Ban"}
          </button>
        </div>
      </div>
    </div>
  );
}
