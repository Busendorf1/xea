"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, X, Wallet, CreditCard, SlidersHorizontal } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import LocationSelector from "../LocationSelector";
import PaymentConfirmationModal from "@/components/ui/PaymentConfirmationModal";
import { isWalletPinErrorResponse, formatWalletPinErrorMessage } from "@/components/ui/WalletPinField";
import { HighlightItem } from "./types";
import styles from "../MyAds/page.module.css";

interface HighlightBoosterModalProps {
  item: HighlightItem | null;
  onClose: () => void;
  userBalance?: number;
  onSuccess: (message?: string) => void;
  onShowNotice: (title: string, message: string) => void;
}

export default function HighlightBoosterModal({
  item,
  onClose,
  userBalance,
  onSuccess,
  onShowNotice,
}: HighlightBoosterModalProps) {
  const [addDays, setAddDays] = useState(0);
  const [newBidPrice, setNewBidPrice] = useState(1000);
  const [boosterCountry, setBoosterCountry] = useState("");
  const [boosterState, setBoosterState] = useState("");
  const [boosterProvince, setBoosterProvince] = useState("");
  const [boosterMultiLocations, setBoosterMultiLocations] = useState<string[]>([]);
  const [boosterPaymentMethod, setBoosterPaymentMethod] = useState<"wallet" | "card">("wallet");
  const [showBoosterPaymentConfirmModal, setShowBoosterPaymentConfirmModal] = useState(false);
  const [walletPin, setWalletPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [boosting, setBoosting] = useState(false);

  useEffect(() => {
    if (item) {
      const currentRate = item.is_bidded && item.bid_price ? Number(item.bid_price) : 1000;
      setNewBidPrice(currentRate);
      setBoosterCountry(item.country || "Nigeria");
      setBoosterState(item.state || "");
      setBoosterProvince(item.province || "");
      setBoosterMultiLocations(item.province ? item.province.split("; ") : []);
      setAddDays(0);
      setBoosterPaymentMethod("wallet");
      setShowBoosterPaymentConfirmModal(false);
      setWalletPin("");
      setPinError(null);
    }
  }, [item]);

  if (!item) return null;

  const currentDailyRate = item.is_bidded && item.bid_price ? Number(item.bid_price) : 1000;
  const effectiveDailyRate = newBidPrice > 0 && newBidPrice > currentDailyRate ? newBidPrice : currentDailyRate;

  const calculateBoosterCost = () => {
    let cost = 0;
    if (addDays > 0) {
      cost += addDays * effectiveDailyRate;
    }
    if (newBidPrice > currentDailyRate) {
      cost += (newBidPrice - currentDailyRate) * Number(item.campaign_days || 1);
    }
    return cost;
  };

  const totalCost = calculateBoosterCost();

  const currentDays = Math.max(1, Math.min(90, Number(item.campaign_days || 1)));
  const maxExtendDays = Math.max(0, Math.min(30, 90 - currentDays));

  const handleInitiateBoost = () => {
    if (boosting) return;
    const isPausedByAdmin = Boolean(
      item.admin_statement &&
      typeof item.admin_statement === "string" &&
      item.admin_statement.trim() !== "" &&
      !item.admin_statement.startsWith("APPROVED:") &&
      !item.admin_statement.toLowerCase().startsWith("status:") &&
      !item.admin_statement.startsWith("REJECTED:")
    );
    if (isPausedByAdmin) {
      onShowNotice("Boosting Unavailable", `This highlight was paused by an administrator. Reason: "${item.admin_statement}". Please resolve the notice or wait for admin review.`);
      onClose();
      return;
    }

    if (item.is_paused) {
      onShowNotice("Boosting Unavailable", "This highlight is currently paused. Please resume the highlight first to boost it.");
      onClose();
      return;
    }

    const totalCost = calculateBoosterCost();
    if (boosterPaymentMethod === "wallet" && typeof userBalance === "number" && totalCost > userBalance) {
      onClose();
      onShowNotice(
        "Insufficient Wallet Balance",
        `Your wallet balance (₦${userBalance.toLocaleString()}) is insufficient to cover this highlight boost (₦${totalCost.toLocaleString()}). Please choose Card / Bank Transfer or fund your wallet.`
      );
      return;
    }

    if (totalCost > 0) {
      setWalletPin("");
      setPinError(null);
      setShowBoosterPaymentConfirmModal(true);
    } else {
      handleExecuteBoost();
    }
  };

  const handleExecuteBoost = async () => {
    if (boosting) return;
    const totalCost = calculateBoosterCost();
    const requiresWalletPin = totalCost > 0 && boosterPaymentMethod === "wallet";
    if (requiresWalletPin && !/^\d{4}$/.test(walletPin)) {
      setPinError("Please enter your 4-digit Wallet PIN to authorize wallet payment.");
      return;
    }

    if (boosterPaymentMethod === "wallet" && typeof userBalance === "number" && totalCost > userBalance) {
      setShowBoosterPaymentConfirmModal(false);
      onClose();
      onShowNotice(
        "Insufficient Wallet Balance",
        `Your wallet balance (₦${userBalance.toLocaleString()}) is insufficient to cover this highlight boost (₦${totalCost.toLocaleString()}). Please choose Card / Bank Transfer or fund your wallet.`
      );
      return;
    }

    setPinError(null);
    setBoosting(true);
    try {
      const res = await fetch("/api/campaigns/boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId: item.id,
          additionalDays: addDays,
          newCostPerImpression: newBidPrice > 0 ? newBidPrice : undefined,
          country: boosterCountry,
          state: boosterState,
          province: boosterProvince || (boosterMultiLocations.length > 0 ? boosterMultiLocations.join("; ") : ""),
          paymentMethod: boosterPaymentMethod,
          ...(requiresWalletPin ? { pin: walletPin } : {}),
          callbackUrl: typeof window !== "undefined" ? `${window.location.origin}/logged-in` : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (requiresWalletPin && isWalletPinErrorResponse(res.status, data)) {
          setWalletPin("");
          setPinError(formatWalletPinErrorMessage(data, `Wallet PIN verification failed (${res.status}).`));
          return;
        }
        throw new Error(data.error || `Failed to boost highlight (${res.status})`);
      }

      if (boosterPaymentMethod === "card" && data.paymentUrl) {
        try {
          sessionStorage.setItem("paayh_boost_ref", data.reference);
          sessionStorage.setItem("paayh_boost_type", "highlight");
          sessionStorage.setItem("paayh_publications_subtab", "highlights");
        } catch {}
        window.location.href = data.paymentUrl;
        return;
      }

      try {
        sessionStorage.removeItem("paayh_statement_cache");
        window.dispatchEvent(new CustomEvent("paayh:balance_updated"));
      } catch {}

      setShowBoosterPaymentConfirmModal(false);
      onClose();
      onSuccess(data.message || "Your highlight has been boosted successfully! Schedule duration and priority delivery have been updated and are actively delivering.");
    } catch (e: any) {
      setShowBoosterPaymentConfirmModal(false);
      onClose();
      const rawError = e.message || "An error occurred while boosting your highlight.";
      const isInsufficient = rawError.toLowerCase().includes("insufficient");
      onShowNotice(
        isInsufficient ? "Insufficient Wallet Balance" : "Boost Notice",
        rawError
      );
    } finally {
      setBoosting(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={styles.modalOverlay}
          onClick={boosting ? undefined : onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 540 }}
          >
            {/* Header */}
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderInner}>
                <TrendingUp size={20} color="var(--primary)" />
                <h3 className={styles.modalTitle}>Boost Highlight Priority &amp; Reach</h3>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={boosting ? undefined : onClose}
                disabled={boosting}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Responsive Form Grid */}
            <div className={styles.boosterGrid}>
              <div className={`${styles.boosterGroup} ${styles.boosterFullWidth}`}>
                <div className={styles.boosterLabelRow}>
                  <label className={styles.boosterLabel}>Extend Schedule Duration</label>
                  <span className={styles.boosterDaysValue}>+{addDays} Days</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxExtendDays}
                  step={1}
                  value={addDays}
                  disabled={maxExtendDays === 0}
                  onChange={(e) => setAddDays(Number(e.target.value))}
                  className={styles.boosterSliderBlue}
                />
                <span className={styles.boosterSliderHint}>
                  {maxExtendDays > 0
                    ? `Add up to ${maxExtendDays} additional active days (total scheduled expiry 1–90 days; currently ${currentDays}d).`
                    : "Maximum 90-day highlight schedule reached."}
                </span>
              </div>

              <div className={`${styles.boosterGroup} ${styles.boosterFullWidth}`}>
                <label className={styles.boosterLabel}>
                  Priority Daily Bid Rate ({formatCurrency(0, item.country).charAt(0)})
                </label>
                <input
                  type="number"
                  min={currentDailyRate}
                  step={250}
                  className={styles.boosterInput}
                  value={newBidPrice}
                  onChange={(e) => setNewBidPrice(Number(e.target.value))}
                />
                <span className={styles.boosterSliderHint}>
                  Current bid: {formatCurrency(currentDailyRate, item.country)}/day. Increasing daily bid outranks other highlights for prominent feed drop placement.
                </span>
              </div>

              <div className={`${styles.boosterGroup} ${styles.boosterFullWidth}`}>
                <label className={styles.boosterLabel}>Targeting Region &amp; Audience</label>
                <LocationSelector
                  country={boosterCountry}
                  state={boosterState}
                  location={boosterProvince}
                  multiLocation={true}
                  multiLocations={boosterMultiLocations}
                  inputClass={styles.boosterInput}
                  labelClass={styles.boosterLabel}
                  cityLabel="Province"
                  onChange={({ country, state, location, multiLocations }) => {
                    setBoosterCountry(country);
                    setBoosterState(state);
                    setBoosterProvince(location);
                    if (multiLocations) setBoosterMultiLocations(multiLocations);
                  }}
                />
              </div>
            </div>

            {totalCost > 0 && (
              <div className={`${styles.boosterGroup} ${styles.boosterGroupMt}`}>
                <label className={styles.boosterLabel}>Payment Method</label>
                <div className={styles.paymentSelectRow}>
                  <button
                    type="button"
                    className={`${styles.paymentSelectBtn} ${styles.paymentSelectBtnFlex} ${boosterPaymentMethod === "wallet" ? styles.paymentSelectBtnActive : ""}`}
                    onClick={() => setBoosterPaymentMethod("wallet")}
                    disabled={boosting}
                  >
                    <Wallet size={12} /> Wallet Balance
                  </button>
                  <button
                    type="button"
                    className={`${styles.paymentSelectBtn} ${styles.paymentSelectBtnFlex} ${boosterPaymentMethod === "card" ? styles.paymentSelectBtnActive : ""}`}
                    onClick={() => setBoosterPaymentMethod("card")}
                    disabled={boosting}
                  >
                    <CreditCard size={12} /> Card / Bank Transfer
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              className={`${styles.boostBtn} ${styles.boostLaunchBtn}`}
              onClick={handleInitiateBoost}
              disabled={boosting}
            >
              {boosting
                ? "Processing Booster..."
                : totalCost > 0
                ? `Boost Highlight (${formatCurrency(totalCost, item.country)})`
                : "Update Highlight Settings"}
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <PaymentConfirmationModal
        isOpen={showBoosterPaymentConfirmModal}
        onClose={() => {
          if (!boosting) {
            setShowBoosterPaymentConfirmModal(false);
            setWalletPin("");
            setPinError(null);
          }
        }}
        onConfirm={handleExecuteBoost}
        serviceTitle="Highlight Priority Booster"
        amountFormatted={formatCurrency(totalCost, item.country)}
        paymentMethodText={boosterPaymentMethod === "wallet" ? "Wallet Balance" : "Card / Bank Transfer"}
        requireWalletPin={boosterPaymentMethod === "wallet" && totalCost > 0}
        walletPin={walletPin}
        onWalletPinChange={(val) => {
          setWalletPin(val);
          if (pinError) setPinError(null);
        }}
        pinError={pinError}
        summaryItems={[
          { label: "Highlight Title", value: item.title },
          { label: "Schedule Extension", value: `+${addDays} ${addDays === 1 ? "day" : "days"}` },
          {
            label: "Priority Daily Bid",
            value: `${formatCurrency(effectiveDailyRate, item.country)} / day`,
          },
        ]}
        isSubmitting={boosting}
      />
    </>
  );
}
