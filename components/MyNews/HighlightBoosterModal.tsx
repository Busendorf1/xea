"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, X, Wallet, CreditCard, Sparkles, SlidersHorizontal } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import LocationSelector from "../LocationSelector";
import PaymentConfirmationModal from "@/components/ui/PaymentConfirmationModal";
import { HighlightItem } from "./types";
import styles from "../MyAds/page.module.css";

interface HighlightBoosterModalProps {
  item: HighlightItem | null;
  onClose: () => void;
  onSuccess: (message?: string) => void;
  onShowNotice: (title: string, message: string) => void;
}

export default function HighlightBoosterModal({
  item,
  onClose,
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

  const handleInitiateBoost = () => {
    if (item.is_paused) {
      onShowNotice("Boosting Unavailable", "This highlight is currently paused. Please resume the highlight first to boost it.");
      onClose();
      return;
    }

    if (totalCost > 0) {
      setShowBoosterPaymentConfirmModal(true);
    } else {
      handleExecuteBoost();
    }
  };

  const handleExecuteBoost = async () => {
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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to boost highlight");
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
      onShowNotice("Boost Notice", e.message || "An error occurred while boosting your highlight.");
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
          onClick={onClose}
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
                <Zap size={20} color="var(--primary)" />
                <h3 className={styles.modalTitle}>Boost Highlight Priority &amp; Reach</h3>
              </div>
              <button className={styles.modalClose} onClick={onClose} aria-label="Close modal">
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
                  max={5}
                  step={1}
                  value={addDays}
                  onChange={(e) => setAddDays(Number(e.target.value))}
                  className={styles.boosterSliderBlue}
                />
                <span className={styles.boosterSliderHint}>
                  Add up to 5 additional active broadcast days to keep delivering live in the feed.
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
                  >
                    <Wallet size={12} /> Wallet Balance
                  </button>
                  <button
                    type="button"
                    className={`${styles.paymentSelectBtn} ${styles.paymentSelectBtnFlex} ${boosterPaymentMethod === "card" ? styles.paymentSelectBtnActive : ""}`}
                    onClick={() => setBoosterPaymentMethod("card")}
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
        onClose={() => setShowBoosterPaymentConfirmModal(false)}
        onConfirm={handleExecuteBoost}
        serviceTitle="Highlight Priority Booster"
        amountFormatted={formatCurrency(totalCost, item.country)}
        paymentMethodText={boosterPaymentMethod === "wallet" ? "Wallet Balance" : "Card / Bank Transfer"}
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
