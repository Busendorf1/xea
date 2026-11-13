"use client";

import React from "react";
import { motion } from "framer-motion";
import { ShieldAlert, AlertCircle } from "lucide-react";
import styles from "./page.module.css";
import { AdAccountRestriction, HIGHLIGHT_MAX_WORDS, countWords, clampToWords } from "./newsUtils";

export function RestrictedAccountCard({ restriction }: { restriction: AdAccountRestriction }) {
  const getCountdownStr = (untilStr: string | null) => {
    if (!untilStr) return "";
    const diffMs = new Date(untilStr).getTime() - Date.now();
    if (diffMs <= 0) return "Expired";
    const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    return `${days} day${days > 1 ? "s" : ""}`;
  };

  return (
    <div className={styles.disabledAccountCard}>
      <div className={styles.disabledAccountIcon}>
        <ShieldAlert size={32} />
      </div>
      <h2 className={styles.disabledAccountTitle}>Advertising &amp; Highlight Account Disabled</h2>
      <p className={styles.disabledAccountDesc}>
        {restriction.status === "temp_banned" ? (
          <>
            Your highlight account is temporarily suspended for{" "}
            <strong>{getCountdownStr(restriction.until)}</strong>.
          </>
        ) : restriction.status === "perm_banned" ? (
          <>Your highlight account has been permanently suspended due to policy violations.</>
        ) : (
          <>Your highlight account has been deactivated by administration.</>
        )}
      </p>
      {restriction.reason && (
        <div className={styles.disabledAccountReason}>
          <strong>Reason for decision:</strong> {restriction.reason}
        </div>
      )}
      <p className={styles.disabledAccountNote}>
        If you believe this restriction is an error, you may submit an appeal to our Help Center support team.
      </p>
      <a
        href="/help?category=Suspended%20Account&subject=Appeal%20Highlight%20Account%20Suspension"
        className={styles.disabledAccountBtn}
      >
        Appeal via Help Center
      </a>
    </div>
  );
}

export function PendingLimitBanner() {
  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "12px",
        padding: "12px 16px",
        marginBottom: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
        <div>
          <strong style={{ color: "var(--foreground)", fontSize: "0.88rem" }}>
            Pending Payment Limit Reached (2/2)
          </strong>
          <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            You have 2 approved highlights awaiting payment. Make payment or delete an existing highlight in My Ads to submit a new one.
          </p>
        </div>
      </div>
      <a
        href="/logged-in?view=myads&tab=highlights"
        style={{
          padding: "6px 14px",
          background: "var(--primary)",
          color: "var(--background)",
          borderRadius: "8px",
          fontSize: "0.82rem",
          fontWeight: 600,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Go to My Ads &rarr;
      </a>
    </div>
  );
}

export function NewsStepMedia({
  mediaPreview,
  hasCover,
  onMediaChange,
  onClearMedia,
  onNext,
}: {
  mediaPreview: string | null;
  hasCover: boolean;
  onMediaChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearMedia: () => void;
  onNext: () => void;
}) {
  return (
    <motion.div
      key="step-0"
      initial={{ opacity: 0, x: 15 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -15 }}
      transition={{ duration: 0.22 }}
      className={styles.formGroup}
    >
      <label className={styles.fieldLabel}>Cover Image (Required)</label>
      {mediaPreview ? (
        <div className={styles.mediaPreviewContainer}>
          <img
            src={mediaPreview}
            alt="Cover Preview"
            className={styles.mediaPreviewImage}
            onError={onClearMedia}
          />
          <div className={styles.removeBtnContainer}>
            <button type="button" onClick={onClearMedia} className={styles.removeBtn}>
              Remove Image
            </button>
          </div>
        </div>
      ) : (
        <label className={styles.uploadZone}>
          <input type="file" accept="image/*" onChange={onMediaChange} hidden />
          <p className={styles.uploadTitle}>Upload cover image</p>
          <p className={styles.uploadSubtext}>PNG, JPG, or WEBP up to 8MB (1080p recommended)</p>
          <span className={styles.uploadBrowseBtn}>Choose File</span>
        </label>
      )}
      <div className={styles.stepActionsEnd}>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          disabled={!hasCover}
          onClick={onNext}
          className={styles.primaryNavBtn}
        >
          Continue to Title
        </motion.button>
      </div>
    </motion.div>
  );
}

export function NewsStepTitle({
  title,
  setTitle,
  onBack,
  onNext,
}: {
  title: string;
  setTitle: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <motion.div
      key="step-1"
      initial={{ opacity: 0, x: 15 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -15 }}
      transition={{ duration: 0.22 }}
      className={styles.formGroup}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label className={styles.fieldLabel}>Highlight Title</label>
        <span
          style={{
            fontSize: "0.78rem",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color:
              title.length >= 80
                ? "#ef4444"
                : title.length >= 68
                ? "var(--foreground)"
                : "var(--text-muted)",
            transition: "color 0.2s ease",
          }}
        >
          {title.length} / 80
        </span>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Grand Opening Sale 50% Off"
        className={styles.inputBox}
        maxLength={80}
      />
      <div className={styles.stepActionsBetween}>
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onBack} className={styles.secondaryNavBtn}>
          Back
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          disabled={title.trim().length < 3}
          onClick={onNext}
          className={styles.primaryNavBtn}
        >
          Continue to Content
        </motion.button>
      </div>
    </motion.div>
  );
}

export function NewsStepContent({
  content,
  setContent,
  clearError,
  setError,
  onBack,
  onNext,
}: {
  content: string;
  setContent: (v: string) => void;
  clearError: () => void;
  setError: (msg: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <motion.div
      key="step-2"
      initial={{ opacity: 0, x: 15 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -15 }}
      transition={{ duration: 0.22 }}
      className={styles.formGroup}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label className={styles.fieldLabel}>Highlight Details &amp; Story</label>
        <span
          style={{
            fontSize: "0.78rem",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color:
              countWords(content) >= HIGHLIGHT_MAX_WORDS
                ? "#ef4444"
                : countWords(content) >= 42
                ? "var(--foreground)"
                : "var(--text-muted)",
            transition: "color 0.2s ease",
          }}
        >
          {countWords(content)} / {HIGHLIGHT_MAX_WORDS} words
        </span>
      </div>
      <textarea
        value={content}
        onChange={(e) => {
          setContent(clampToWords(e.target.value, HIGHLIGHT_MAX_WORDS));
          clearError();
        }}
        placeholder="Share the key details of your highlight (max 50 words)..."
        className={styles.textareaBox}
        rows={4}
      />
      {content.trim().length > 0 && content.trim().length < 10 && (
        <span
          style={{
            fontSize: "0.78rem",
            color: "var(--text-muted)",
            marginTop: "4px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          Minimum 10 characters ({10 - content.trim().length} needed)
        </span>
      )}
      <div className={styles.stepActionsBetween}>
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onBack} className={styles.secondaryNavBtn}>
          Back
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          disabled={content.trim().length < 10}
          onClick={() => {
            if (content.trim().length < 10) {
              setError("Content must be at least 10 characters.");
              return;
            }
            clearError();
            onNext();
          }}
          className={styles.primaryNavBtn}
        >
          Continue to Targeting
        </motion.button>
      </div>
    </motion.div>
  );
}
