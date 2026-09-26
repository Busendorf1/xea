"use client";

import { useState, useRef } from "react";
import { deactivationSchema } from "@/lib/validationSchemas";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldAlert, AlertCircle, X, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  const [showModal, setShowModal] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const email = session?.user?.email;

  const startHold = () => {
    if (loading) return;
    setHoldProgress(0);
    const startTime = Date.now();
    const duration = 2000;

    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setHoldProgress(progress);
      if (elapsed >= duration) {
        if (holdIntervalRef.current) {
          clearInterval(holdIntervalRef.current);
          holdIntervalRef.current = null;
        }
        handleFinalDelete();
      }
    }, 25);
  };

  const cancelHold = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldProgress(0);
  };

  const handleOpenConfirmation = () => {
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

    setError("");
    setShowModal(true);
  };

  const handleFinalDelete = async () => {
    setLoading(true);
    setError("");

    try {
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

      setShowModal(false);
      setStep("done");

      // Redirect to Auth0 logout to clear session
      setTimeout(() => {
        window.location.href = "/user/logout";
      }, 2000);
    } catch (err: any) {
      console.error("❌ Deactivation error:", err);
      setError(err.message || "An unexpected error occurred during deactivation.");
      setShowModal(false);
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
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleOpenConfirmation}
                disabled={loading}
                className={styles.danger}
              >
                Permanently Delete
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  document.cookie = "paayh_active_tab=feed; path=/; max-age=604800; SameSite=Lax";
                  try {
                    sessionStorage.setItem("paayh_active_tab", "feed");
                  } catch {}
                  window.location.href = "/";
                }}
                disabled={loading}
                className={styles.cancel}
              >
                Not now
              </motion.button>
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

        {/* Apple-styled Destructive Confirmation Modal */}
        <AnimatePresence>
          {showModal && (
            <div className={styles.modalOverlay} onClick={() => !loading && setShowModal(false)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={styles.modalContent}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.modalHeader}>
                  <div className={styles.modalIconBadge}>
                    <AlertTriangle size={24} color="var(--danger)" />
                  </div>
                  <button
                    type="button"
                    className={styles.modalCloseBtn}
                    onClick={() => !loading && setShowModal(false)}
                    disabled={loading}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className={styles.modalBody}>
                  <h3 className={styles.modalTitle}>Irreversible Account Deletion</h3>
                  <p className={styles.modalDescription}>
                    You are about to permanently delete <strong>{confirmEmailInput}</strong>. All remaining wallet balances, campaign credits, and user data will be permanently wiped from the ledger.
                  </p>
                  <p className={styles.modalWarningNote}>
                    This action cannot be undone. Are you absolutely certain?
                  </p>
                </div>

                <div className={styles.modalActions}>
                  {(() => {
                    const radius = 9;
                    const circumference = 2 * Math.PI * radius;
                    const strokeDashoffset = circumference - (holdProgress / 100) * circumference;

                    return (
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onMouseDown={startHold}
                        onMouseUp={cancelHold}
                        onMouseLeave={cancelHold}
                        onTouchStart={startHold}
                        onTouchEnd={cancelHold}
                        disabled={loading}
                        className={styles.confirmDeleteBtn}
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                      >
                        {loading ? (
                          "Deleting Account..."
                        ) : (
                          <>
                            <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
                              <circle cx="12" cy="12" r={radius} stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" fill="none" />
                              <circle
                                cx="12"
                                cy="12"
                                r={radius}
                                stroke="#ffffff"
                                strokeWidth="2.5"
                                fill="none"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                              />
                            </svg>
                            <span>{holdProgress > 0 ? "Hold to confirm..." : "Hold 2s to Delete"}</span>
                          </>
                        )}
                      </motion.button>
                    );
                  })()}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      cancelHold();
                      setShowModal(false);
                    }}
                    disabled={loading}
                    className={styles.cancelModalBtn}
                  >
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
