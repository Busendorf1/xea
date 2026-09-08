"use client";

import { useState } from "react";
import { deactivationSchema } from "@/lib/validationSchemas";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldAlert, AlertCircle } from "lucide-react";

interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

type DeactivateAccountProps = {
  session: Session;
};

export default function DeactivateAccount({ session }: DeactivateAccountProps) {
  const router = useRouter();

  const [step, setStep] = useState<"confirm" | "done">("confirm");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmEmailInput, setConfirmEmailInput] = useState("");
  const email = session?.user?.email;

  const handleDeleteAccount = async () => {
    if (!email) return;

    if (!confirmEmailInput || confirmEmailInput.trim().toLowerCase() !== email.trim().toLowerCase()) {
      setError("Email address does not match your account email.");
      return;
    }

    const validation = deactivationSchema.safeParse({ confirmEmail: confirmEmailInput.trim() });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message || "Invalid account email.");
      return;
    }

    const confirmDelete = window.confirm(
      "WARNING: This will permanently delete your account and all associated data. Are you absolutely sure?"
    );
    if (!confirmDelete) return;

    setLoading(true);
    setError("");

    try {
      // Call server-side deactivate endpoint with confirmation body
      const res = await fetch("/api/profile/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmEmail: confirmEmailInput.trim().toLowerCase(),
          forfeitConfirmed: true,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Failed to deactivate account.");
      }

      setStep("done");

      // Redirect to Auth0 logout to clear session
      setTimeout(() => {
        window.location.href = "/user/logout";
      }, 2000);
    } catch (err: any) {
      console.error("❌ Deactivation error:", err);
      setError(err.message || "An unexpected error occurred during deactivation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
        <div className={styles.container}>
          <h1 className={styles.title}>Deactivate Account</h1>

          {step === "confirm" && (
            <div className={styles.card}>
              <div className={styles.warningHeader}>
                <ShieldAlert size={28} className={styles.warningIcon} />
                <p className={styles.warningText}>
                  Are you sure you want to <strong>permanently delete</strong> your account?
                </p>
              </div>

              <p className={styles.subtitle}>
                This action is irreversible and will permanently delete all associated data:
              </p>

              <ul className={styles.list}>
                <li> Active Advertisements</li>
                <li> Highlights and Campaigns</li>
                <li> Account Monetization Progress</li>
                <li> Wallet Balance and Payment Records</li>
                <li> User Profile and Demographics</li>
              </ul>

              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>
                  Type your email address to confirm deactivation:
                </label>
                <input
                  type="email"
                  placeholder="Enter Email"
                  value={confirmEmailInput}
                  onChange={(e) => setConfirmEmailInput(e.target.value)}
                  className={styles.input}
                />
              </div>

              {error && (
                <div className={styles.errorBox}>
                  <AlertCircle size={16} color="var(--danger)" />
                  <span>{error}</span>
                </div>
              )}

              <div className={styles.buttons}>
                <button
                  onClick={handleDeleteAccount}
                  disabled={loading}
                  className={styles.danger}
                >
                  {loading ? "Deleting..." : "Permanently Delete"}
                </button>
                <button
                  onClick={() => router.push("/")}
                  disabled={loading}
                  className={styles.cancel}
                >
                  Not now
                </button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className={styles.card}>
              <div className={styles.doneHeader}>
                <CheckCircle2 size={32} className={styles.doneIcon} />
                <h2>Account Deleted</h2>
              </div>
              <p className={styles.doneText}>
                Your account, campaigns, and data have been permanently deleted.
                <br />
                Redirecting you to the home page...
              </p>
            </div>
          )}
        </div>
      </div>
  );
}
