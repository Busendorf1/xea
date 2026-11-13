"use client";

import React from "react";
import { Lock } from "lucide-react";

const PIN_ERROR_CODES = new Set([
  "PIN_REQUIRED",
  "PIN_INVALID",
  "PIN_LOCKED",
  "PIN_NOT_SET",
  "NO_PIN",
]);

/**
 * Checks whether an API error payload represents a Wallet PIN validation,
 * setup, or 45-minute lockout failure.
 */
export function isWalletPinErrorResponse(status: number, data: Record<string, any> | null | undefined): boolean {
  if (!data && status !== 401 && status !== 429) return false;
  if (data?.requiresPinSetup) return true;
  if (typeof data?.code === "string" && PIN_ERROR_CODES.has(data.code)) return true;
  if (status === 401 || status === 429) {
    const errText = String(data?.error || "").toLowerCase();
    if (!errText || errText.includes("pin") || errText.includes("lockout") || errText.includes("locked")) {
      return true;
    }
  }
  return typeof data?.error === "string" && data.error.toLowerCase().includes("wallet pin");
}

/**
 * Formats Wallet PIN API failures (setup required, invalid attempts remaining,
 * or 45-minute lockout) into clear user-facing guidance.
 */
export function formatWalletPinErrorMessage(
  data: Record<string, any> | null | undefined,
  fallback = "Wallet PIN verification failed. Please check your 4-digit PIN and try again."
): string {
  const baseMsg = typeof data?.error === "string" && data.error.trim() ? data.error.trim() : fallback;
  if (data?.requiresPinSetup || data?.code === "PIN_NOT_SET" || data?.code === "NO_PIN") {
    return `${baseMsg} Set your 4-digit Wallet PIN on your Dashboard Wallet card before paying from Wallet Balance.`;
  }
  if (typeof data?.attemptsRemaining === "number" && !baseMsg.toLowerCase().includes("attempt")) {
    return `${baseMsg} (${data.attemptsRemaining} ${data.attemptsRemaining === 1 ? "attempt" : "attempts"} remaining before 45-minute lockout.)`;
  }
  return baseMsg;
}

interface WalletPinFieldProps {
  value: string;
  onChange: (pin: string) => void;
  disabled?: boolean;
  error?: string | null;
  id?: string;
  label?: string;
  hint?: string;
}

export default function WalletPinField({
  value,
  onChange,
  disabled = false,
  error = null,
  id = "wallet-pin-input",
  label = "4-Digit Wallet PIN",
  hint = "Enter the 4-digit Wallet PIN from your Dashboard Wallet card to authorize this payment.",
}: WalletPinFieldProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "0.75rem 0.85rem",
        borderRadius: "12px",
        border: `1px solid ${error ? "rgba(239, 68, 68, 0.45)" : "var(--card-border, #262624)"}`,
        backgroundColor: "var(--input-bg, rgba(255, 255, 255, 0.03))",
      }}
    >
      <label
        htmlFor={id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.82rem",
          fontWeight: 600,
          color: "var(--foreground)",
        }}
      >
        <Lock size={14} strokeWidth={2.2} />
        <span>{label}</span>
      </label>

      <input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={4}
        pattern="\d{4}"
        placeholder="••••"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "0.6rem 0.85rem",
          borderRadius: "10px",
          border: `1px solid ${error ? "rgba(239, 68, 68, 0.55)" : "var(--card-border, #333330)"}`,
          backgroundColor: "var(--card-bg, var(--background))",
          color: "var(--foreground)",
          fontSize: "1.1rem",
          fontWeight: 700,
          letterSpacing: "0.45em",
          textAlign: "center",
          outline: "none",
        }}
      />

      <span
        style={{
          fontSize: "0.75rem",
          lineHeight: 1.4,
          color: "var(--text-muted, #94a3b8)",
        }}
      >
        {hint}
      </span>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: "2px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "#ef4444",
            fontSize: "0.78rem",
            padding: "0.45rem 0.65rem",
            borderRadius: "8px",
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
