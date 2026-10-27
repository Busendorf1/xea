"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ShieldCheck, MapPin, Navigation, AlertTriangle, Check, Lock, LogOut } from "lucide-react";
import {
  authenticateStrictGpsLocation,
  PROOF_OF_LOCATION_KEY_PREFIX,
  MANUAL_LOCATION_PENDING_KEY,
  recordWebGpsProofVerified,
} from "@/lib/utils/locationHelper";
import AppleSpinner from "@/components/ui/AppleSpinner";
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

      if (gpsResult.error || !gpsResult.country) {
        setErrorMsg(
          gpsResult.error ||
            "Could not verify your GPS location. Please enable browser Location permission and try again."
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

  if (!visible) return null;

  const hasSavedRegion = Boolean(user?.country || user?.state || user?.location);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="proof-of-location-title"
    >
      <div className={styles.card}>
        <div className={styles.iconRow}>
          <div className={styles.iconBadge}>
            <ShieldCheck size={24} />
          </div>
          <div className={styles.requiredPill}>
            <Lock size={11} />
            <span>Verification Required</span>
          </div>
        </div>

        <h2 id="proof-of-location-title" className={styles.title}>
          Proof of Location Required
        </h2>

        <p className={styles.subtitle}>
          To prevent location fraud in ad delivery and attention payouts, Paayh requires GPS{" "}
          <strong>Proof of Location</strong> so advertisers reach genuine people in their targeted
          region.
        </p>

        {hasSavedRegion && (
          <div className={styles.currentRegionBox}>
            <MapPin size={14} color="#f59e0b" />
            <span>
              Selected Region:{" "}
              <span className={styles.currentRegionValue}>
                {[user?.location, user?.state, user?.country].filter(Boolean).join(", ")}
              </span>
            </span>
          </div>
        )}

        <div className={styles.whyBox}>
          <div className={styles.whyItem}>
            <span className={styles.whyDot} />
            <span>
              Confirm your physical presence via browser/device GPS — even if you selected your
              region manually.
            </span>
          </div>
          <div className={styles.whyItem}>
            <span className={styles.whyDot} />
            <span>
              Ensures fair ad delivery and accurate payouts for both viewers and advertisers.
            </span>
          </div>
          <div className={styles.whyItem}>
            <span className={styles.whyDot} />
            <span>
              You must agree and grant GPS verification below to move ahead on Paayh.
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setAgreed((prev) => !prev);
            if (errorMsg) setErrorMsg(null);
          }}
          className={`${styles.agreementBox} ${agreed ? styles.agreementBoxChecked : ""}`}
        >
          <span className={`${styles.checkbox} ${agreed ? styles.checkboxChecked : ""}`}>
            {agreed && <Check size={13} strokeWidth={3} />}
          </span>
          <span className={styles.agreementText}>
            I agree to the <strong>Proof of Location</strong> terms and authorize Paayh to
            authenticate my genuine physical location via GPS to prevent ad delivery and payment
            fraud.
          </span>
        </button>

        {errorMsg && (
          <div className={styles.errorBox}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {detectedSummary && !errorMsg && (
          <div className={styles.successBox}>
            <Check size={15} />
            <span>Verified GPS: {detectedSummary}</span>
          </div>
        )}

        <button
          type="button"
          className={styles.verifyBtn}
          disabled={!agreed || authenticating}
          onClick={handleAuthenticateWithGps}
        >
          {authenticating ? (
            <>
              <AppleSpinner size={16} />
              <span>Authenticating GPS...</span>
            </>
          ) : (
            <>
              <Navigation size={16} />
              <span>Agree &amp; Authenticate with GPS</span>
            </>
          )}
        </button>

        <div className={styles.footerRow}>
          <span className={styles.footerNote}>
            Cannot continue until GPS Proof of Location is granted
          </span>
          <a href="/auth/logout" className={styles.logoutLink}>
            <LogOut size={13} />
            <span>Sign Out</span>
          </a>
        </div>
      </div>
    </div>
  );
}
