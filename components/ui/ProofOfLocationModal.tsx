"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navigation, AlertTriangle, Check, LogOut } from "lucide-react";
import {
  authenticateStrictGpsLocation,
  PROOF_OF_LOCATION_KEY_PREFIX,
  MANUAL_LOCATION_PENDING_KEY,
  recordWebGpsProofVerified,
} from "@/lib/utils/locationHelper";
import styles from "./ProofOfLocationModal.module.css";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

interface ProofOfLocationModalProps {
  email?: string | null;
  user?: {
    country?: string | null;
    state?: string | null;
    location?: string | null;
    has_updated_profile?: boolean | null;
  } | null;
  forceOpen?: boolean;
  autoCheck?: boolean;
  onVerified?: (verified: { country: string; state: string; location: string }) => void;
}

export default function ProofOfLocationModal({
  email,
  user,
  forceOpen = false,
  autoCheck = true,
  onVerified,
}: ProofOfLocationModalProps) {
  const [visible, setVisible] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [detectedSummary, setDetectedSummary] = useState<string | null>(null);

  const checkProofStatus = useCallback(() => {
    if (typeof window === "undefined") return;

    if (forceOpen) {
      setVisible(true);
      return;
    }

    if (!autoCheck) {
      setVisible(false);
      return;
    }

    const cleanEmail = (email || "").toLowerCase().trim();
    if (!cleanEmail) return;

    try {
      const manualPending = localStorage.getItem(MANUAL_LOCATION_PENDING_KEY);
      if (manualPending === "true") {
        setVisible(true);
        return;
      }

      const rawAttestation =
        localStorage.getItem(`${PROOF_OF_LOCATION_KEY_PREFIX}${cleanEmail}`) ||
        localStorage.getItem(`${PROOF_OF_LOCATION_KEY_PREFIX}active`);

      if (!rawAttestation) {
        if (user?.country || user?.state || user?.location) {
          setVisible(true);
        }
        return;
      }

      const parsed = JSON.parse(rawAttestation);
      const isFresh =
        parsed &&
        parsed.verified === true &&
        parsed.agreed === true &&
        parsed.source === "gps" &&
        typeof parsed.verifiedAt === "number" &&
        Date.now() - parsed.verifiedAt < TWENTY_FOUR_HOURS_MS;

      if (!isFresh) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    } catch {
      setVisible(true);
    }
  }, [email, user?.country, user?.state, user?.location, forceOpen, autoCheck]);

  useEffect(() => {
    checkProofStatus();
  }, [checkProofStatus]);

  // Listen for manual location selection event anywhere in the web app
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleManualSelected = () => {
      checkProofStatus();
    };
    window.addEventListener("paayh:manual_location_selected", handleManualSelected);
    return () => {
      window.removeEventListener("paayh:manual_location_selected", handleManualSelected);
    };
  }, [checkProofStatus]);

  // Lock background scroll & block Escape key while Proof of Location modal is active
  useEffect(() => {
    if (!visible || typeof window === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [visible]);

  const handleAuthenticateWithGps = async () => {
    if (!agreed) {
      setErrorMsg("Please agree to the Proof of Location terms before authenticating.");
      return;
    }

    setAuthenticating(true);
    setErrorMsg(null);

    try {
      const gpsResult = await authenticateStrictGpsLocation();

      if (!gpsResult.country) {
        setErrorMsg(
          gpsResult.error ||
            "Could not verify your location. Please check your internet connection and try again."
        );
        setAuthenticating(false);
        return;
      }

      const verifiedCountry = gpsResult.country;
      const verifiedState = gpsResult.state;
      const verifiedCity = gpsResult.location || gpsResult.state;

      setDetectedSummary(
        `${verifiedCity ? verifiedCity + ", " : ""}${verifiedState ? verifiedState + ", " : ""}${verifiedCountry}`
      );

      // Sync authenticated GPS location to backend
      try {
        const apiRes = await fetch("/api/user/recalibrate-location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            country: verifiedCountry,
            state: verifiedState,
            location: verifiedCity,
            source: "gps",
            proofOfLocationAgreed: true,
          }),
        });
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (data.updated) {
            window.dispatchEvent(
              new CustomEvent("paayh:location_recalibrated", { detail: data })
            );
          }
        }
      } catch (syncErr) {
        console.warn("Proof of Location backend sync warning:", syncErr);
      }

      // Persist verified GPS Proof of Location attestation
      recordWebGpsProofVerified(email, {
        country: verifiedCountry,
        state: verifiedState,
        location: verifiedCity,
        latitude: gpsResult.latitude,
        longitude: gpsResult.longitude,
      });

      localStorage.setItem("paayh_last_geo_recalibrate", String(Date.now()));

      onVerified?.({
        country: verifiedCountry,
        state: verifiedState,
        location: verifiedCity,
      });

      setVisible(false);
    } catch (err: unknown) {
      setErrorMsg(
        (err as Error)?.message ||
          "Unable to authenticate GPS coordinates. Please enable Location access in your browser settings."
      );
    } finally {
      setAuthenticating(false);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="proof-of-location-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className={styles.card}
            initial={{ opacity: 0, scale: 0.92, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.95, y: 8, filter: "blur(4px)" }}
            transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.8 }}
          >
            <div className={styles.headerRow}>
              <h2 id="proof-of-location-title" className={styles.title}>
                Proof of Location
              </h2>
            </div>

            <p className={styles.subtitle}>
              GPS verification is required to ensure ads reach genuine people in their targeted region and keep payouts fair.
            </p>

            <AnimatePresence mode="popLayout">
              {errorMsg && (
                <motion.div
                  key="error-box"
                  className={styles.errorBox}
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1, x: [0, -4, 4, -2, 2, 0] }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{errorMsg}</span>
                </motion.div>
              )}

              {detectedSummary && !errorMsg && (
                <motion.div
                  key="success-box"
                  className={styles.successBox}
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 360, damping: 25 }}
                >
                  <Check size={14} />
                  <span>Verified: {detectedSummary}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className={styles.actionRow}>
              <motion.button
                type="button"
                role="checkbox"
                aria-checked={agreed}
                disabled={authenticating}
                onClick={() => {
                  setAgreed((prev) => !prev);
                  if (errorMsg) setErrorMsg(null);
                }}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 24 }}
                className={`${styles.agreementBox} ${agreed ? styles.agreementBoxChecked : ""}`}
              >
                <motion.span
                  className={`${styles.checkbox} ${agreed ? styles.checkboxChecked : ""}`}
                  animate={agreed ? { scale: [0.85, 1.12, 1] } : { scale: 1 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                  <AnimatePresence>
                    {agreed && (
                      <motion.span
                        key="tick"
                        className={styles.tickIconWrap}
                        initial={{ scale: 0, opacity: 0, rotate: -15 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 24 }}
                      >
                        <Check size={10} strokeWidth={3.2} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.span>
                <span className={styles.agreementText}>
                  I agree to verify my location with GPS
                </span>
              </motion.button>

              <motion.button
                type="button"
                className={styles.verifyBtn}
                disabled={!agreed || authenticating}
                onClick={handleAuthenticateWithGps}
                whileHover={agreed && !authenticating ? { scale: 1.03, y: -1 } : undefined}
                whileTap={agreed && !authenticating ? { scale: 0.96, y: 0 } : undefined}
                transition={{ type: "spring", stiffness: 420, damping: 24 }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {authenticating ? (
                    <motion.span
                      key="verifying"
                      className={styles.btnContent}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.15 }}
                    >
                      <span className={`btnSpinner ${styles.brandSpinner}`} aria-hidden="true" />
                      <span>Verifying</span>
                    </motion.span>
                  ) : (
                    <motion.span
                      key="continue"
                      className={styles.btnContent}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Navigation size={13} className={styles.navIcon} />
                      <span>Continue</span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>

            <div className={styles.footerRow}>
              <span className={styles.footerNote}>
                Required to continue on Paayh
              </span>
              <motion.a
                href="/user/logout"
                className={styles.logoutLink}
                whileHover={{ scale: 1.03, x: 1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 24 }}
              >
                <LogOut size={12} className={styles.logoutIcon} />
                <span>Sign Out</span>
              </motion.a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
