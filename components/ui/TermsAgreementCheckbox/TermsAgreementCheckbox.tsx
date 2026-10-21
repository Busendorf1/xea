"use client";

import React from "react";
import Link from "next/link";
import { Check, AlertCircle, FileText, ExternalLink } from "lucide-react";
import styles from "./TermsAgreementCheckbox.module.css";

export interface TermLinkItem {
  label: string;
  href: string;
  external?: boolean;
  onClick?: () => void;
}

export interface TermsAgreementCheckboxProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  instruction?: string;
  terms?: TermLinkItem[];
  checkboxLabel: React.ReactNode;
  errorMessage?: string | null;
  required?: boolean;
  variant?: "default" | "card" | "compact";
  className?: string;
}

export default function TermsAgreementCheckbox({
  id = "terms-agreement-checkbox",
  checked,
  onChange,
  instruction = "Please read and review the terms and policies below, and tick the box if you accept:",
  terms = [
    { label: "Terms of Service", href: "/terms" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Community Guidelines & Good Will", href: "/terms" },
  ],
  checkboxLabel,
  errorMessage,
  required = true,
  variant = "card",
  className = "",
}: TermsAgreementCheckboxProps) {
  const isCard = variant === "card";

  return (
    <div
      className={`${styles.container} ${isCard ? styles.containerCard : ""} ${
        errorMessage ? styles.containerCardError : ""
      } ${className}`}
    >
      {/* 1. Clear Review Instruction Header */}
      <div className={styles.instructionRow}>
        <FileText size={16} className={styles.instructionIcon} />
        <p className={styles.instructionText}>{instruction}</p>
      </div>

      {/* 2. Structured Clickable Terms List */}
      {terms && terms.length > 0 && (
        <ul className={styles.termsList}>
          {terms.map((term, idx) => (
            <li key={idx} className={styles.termItem}>
              <span className={styles.termBullet}>•</span>
              {term.onClick ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    term.onClick!();
                  }}
                  className={styles.termLink}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {term.label}
                  <ExternalLink size={11} />
                </button>
              ) : (
                <Link
                  href={term.href}
                  target={term.external !== false ? "_blank" : undefined}
                  rel={term.external !== false ? "noopener noreferrer" : undefined}
                  className={styles.termLink}
                >
                  {term.label}
                  <ExternalLink size={11} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 3. Acceptance Checkbox */}
      <label htmlFor={id} className={styles.checkboxRow}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          required={required}
          className={styles.checkboxInput}
        />
        <div
          className={`${styles.customBox} ${checked ? styles.customBoxChecked : ""} ${
            errorMessage && !checked ? styles.customBoxError : ""
          }`}
          role="checkbox"
          aria-checked={checked}
        >
          {checked && <Check size={13} color="#ffffff" strokeWidth={3} />}
        </div>
        <span className={styles.checkboxLabelText}>{checkboxLabel}</span>
      </label>

      {/* 4. Validation Error Display */}
      {errorMessage && (
        <div className={styles.errorBanner}>
          <AlertCircle size={13} />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
