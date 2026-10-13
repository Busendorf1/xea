"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, X, Users, User, UserCheck, Wallet, CreditCard } from "lucide-react";
import { boostSchema } from "@/lib/validationSchemas";
import { formatCurrency } from "@/lib/utils/currency";
import LocationSelector from "../LocationSelector";
import CustomSelect from "@/components/ui/CustomSelect";
import PaymentConfirmationModal from "@/components/ui/PaymentConfirmationModal";
import { Ad } from "./types";
import styles from "./page.module.css";

interface CampaignBoosterModalProps {
  boosterAd: Ad | null;
  onClose: () => void;
  reportsCount: number;
  onSuccess: (message?: string) => void;
  onShowNotice: (title: string, message: string, adId?: string) => void;
}

export default function CampaignBoosterModal({
  boosterAd,
  onClose,
  reportsCount,
  onSuccess,
  onShowNotice,
}: CampaignBoosterModalProps) {
  const [addImpressions, setAddImpressions] = useState(0);
  const [addDays, setAddDays] = useState(0);
  const [newBidPrice, setNewBidPrice] = useState(25);
  const [boosterFrequencyCap, setBoosterFrequencyCap] = useState(1);
  const [boosterGender, setBoosterGender] = useState("All");
  const [boosterCountry, setBoosterCountry] = useState("");
  const [boosterState, setBoosterState] = useState("");
  const [boosterProvince, setBoosterProvince] = useState("");
  const [boosterMultiLocations, setBoosterMultiLocations] = useState<string[]>([]);
  const [boosterPaymentMethod, setBoosterPaymentMethod] = useState<"wallet" | "card">("wallet");
  const [showBoosterPaymentConfirmModal, setShowBoosterPaymentConfirmModal] = useState(false);
  const [boosting, setBoosting] = useState(false);

  useEffect(() => {
    if (boosterAd) {
      setNewBidPrice(Number(boosterAd.cost_per_impression || 25));
      setBoosterFrequencyCap(Number(boosterAd.user_frequency_cap || 1));
      setBoosterGender(boosterAd.gender || "All");
      setBoosterCountry(boosterAd.country || "");
      setBoosterState(boosterAd.state || "");
      setBoosterProvince(boosterAd.province || "");
      setBoosterMultiLocations(boosterAd.province ? boosterAd.province.split("; ") : []);
      setAddImpressions(0);
      setAddDays(0);
      setBoosterPaymentMethod("wallet");
      setShowBoosterPaymentConfirmModal(false);
    }
  }, [boosterAd]);

  if (!boosterAd) return null;

  const calculateBoosterCost = () => {
    const currentCost = Number(boosterAd.cost_per_impression || 25);
    const effectiveCost = newBidPrice > 0 && newBidPrice > currentCost ? newBidPrice : currentCost;
    return addImpressions * effectiveCost;
  };

  const getBoostUnavailableReason = (ad: Ad, reports: number): string | null => {
    if (reports > 0) {
      return "This campaign has been reported by viewers and is currently under content safety review. Please wait for the moderation review to complete.";
    }
    if (ad.admin_statement && ad.admin_statement.trim() !== "") {
      return `This campaign was paused by an administrator. Reason: "${ad.admin_statement}". Please resolve the notice or wait for admin review.`;
    }
    if (ad.is_paused) {
      return "This campaign is currently paused. Please resume the campaign first to boost it.";
    }
    return null;
  };

  const handleInitiateBoost = () => {
    const reason = getBoostUnavailableReason(boosterAd, reportsCount);
    if (reason) {
      onShowNotice("Boosting Unavailable", reason, boosterAd.id);
      onClose();
      return;
    }

    const validation = boostSchema.safeParse({
      adId: boosterAd.id,
      bidAmount: newBidPrice > 0 ? newBidPrice : 100,
      paymentMethod: boosterPaymentMethod,
    });

    if (!validation.success) {
      onShowNotice("Validation Notice", validation.error.issues[0]?.message || "Invalid boost parameters.");
      return;
    }

    const totalCost = calculateBoosterCost();
    if (totalCost <= 0) {
      handleExecuteBoost();
      return;
    }

    setShowBoosterPaymentConfirmModal(true);
  };

  const handleExecuteBoost = async () => {
    const reason = getBoostUnavailableReason(boosterAd, reportsCount);
    if (reason) {
      onShowNotice("Boosting Unavailable", reason, boosterAd.id);
      onClose();
      return;
    }

    const validation = boostSchema.safeParse({
      adId: boosterAd.id,
      bidAmount: newBidPrice > 0 ? newBidPrice : 100,
      paymentMethod: boosterPaymentMethod,
    });

    if (!validation.success) {
      onShowNotice("Validation Notice", validation.error.issues[0]?.message || "Invalid boost parameters.");
      return;
    }

    setBoosting(true);
    try {
      const res = await fetch("/api/campaigns/boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId: boosterAd.id,
          additionalImpressions: addImpressions,
          additionalDays: addDays,
          newCostPerImpression: newBidPrice > 0 ? newBidPrice : undefined,
          userFrequencyCap: boosterFrequencyCap,
          gender: boosterGender,
          country: boosterCountry,
          state: boosterState,
          province: boosterProvince || (boosterMultiLocations.length > 0 ? boosterMultiLocations.join("; ") : ""),
          paymentMethod: boosterPaymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to boost campaign");
      }

      if (boosterPaymentMethod === "card" && data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }

      setShowBoosterPaymentConfirmModal(false);
      onClose();
      onSuccess(data.message || "Your campaign has been boosted successfully!");
    } catch (e: any) {
      setShowBoosterPaymentConfirmModal(false);
      onShowNotice("Boost Notice", e.message || "An error occurred while boosting your campaign.");
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
          transition={{ duration: 0.2 }}
          className={styles.modalOverlay}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <Zap size={18} color="var(--primary)" />
                <h3 className={styles.modalTitle}>Boost &amp; Top Up Campaign</h3>
              </div>
              <button className={styles.modalClose} onClick={onClose} aria-label="Close modal">
                <X size={16} />
              </button>
            </div>

            {/* Responsive Form Grid */}
            <div className={styles.boosterGrid}>
              <div className={styles.boosterGroup}>
                <label className={styles.boosterLabel}>Add Extra Attention Target</label>
                <CustomSelect
                  value={String(addImpressions)}
                  onChange={(val) => setAddImpressions(Number(val))}
                  options={[
                    { value: "0", label: "+0 Attention", badge: "Current" },
                    { value: "500", label: "+500 Attention", badge: "Starter" },
                    { value: "1000", label: "+1,000 Attention", badge: "Popular" },
                    { value: "2500", label: "+2,500 Attention", badge: "Growth" },
                    { value: "5000", label: "+5,000 Attention", badge: "High Reach" },
                    { value: "10000", label: "+10,000 Attention", badge: "Scale" },
                  ]}
                  placeholder="Select Extra Attention"
                  leadingIcon={<Zap size={16} />}
                />
              </div>

              <div className={styles.boosterGroup}>
                <div className={styles.boosterLabelRow}>
                  <label className={styles.boosterLabel}>Extend Duration</label>
                  <span className={styles.boosterDaysValue}>+{addDays} Days</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={addDays}
                  onChange={(e) => setAddDays(Number(e.target.value))}
                  className={styles.boosterSliderBlue}
                />
                <span className={styles.boosterSliderHint}>
                  Extend campaign schedule by up to 30 days. No extra fee charged for day extensions.
                </span>
              </div>

              <div className={styles.boosterGroup}>
                <label className={styles.boosterLabel}>
                  Priority Bid per Attention ({formatCurrency(0, boosterAd.country).charAt(0)})
                </label>
                <input
                  type="number"
                  min={Number(boosterAd.cost_per_impression || 25)}
                  className={styles.boosterInput}
                  value={newBidPrice}
                  onChange={(e) => setNewBidPrice(Number(e.target.value))}
                />
                <span className={styles.boosterSliderHint}>
                  Current bid: {formatCurrency(boosterAd.cost_per_impression || 25, boosterAd.country)}/attention. Higher bids boost feed placement priority.
                </span>
              </div>

              <div className={styles.boosterGroup}>
                <div className={styles.boosterLabelRow}>
                  <label className={styles.boosterLabel}>Frequency per user</label>
                  <span className={styles.boosterFreqValue}>{boosterFrequencyCap} Views/User/Day</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={boosterFrequencyCap}
                  onChange={(e) => setBoosterFrequencyCap(Number(e.target.value))}
                  className={styles.boosterSliderPurple}
                />
                <span className={styles.boosterSliderHint}>
                  Limit max impressions per individual user (1 to 30 views/day).
                </span>
              </div>

              <div className={`${styles.boosterGroup} ${styles.boosterFullWidth}`}>
                <label className={styles.boosterLabel}>Target Gender</label>
                <div className={styles.boosterGenderGroup}>
                  {[
                    { value: "All", label: "All Genders", icon: <Users size={14} /> },
                    { value: "Male", label: "Male Only", icon: <User size={14} /> },
                    { value: "Female", label: "Female Only", icon: <UserCheck size={14} /> },
                  ].map((g) => {
                    const isSelected = boosterGender === g.value;
                    return (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() => setBoosterGender(g.value)}
                        className={`${styles.boosterGenderBtn} ${isSelected ? styles.boosterGenderBtnActive : ""}`}
                      >
                        {g.icon}
                        <span>{g.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`${styles.boosterGroup} ${styles.boosterFullWidth}`}>
                <label className={styles.boosterLabel}>Multi-Location Targeting</label>
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

            <button
              type="button"
              className={`${styles.boostBtn} ${styles.boostLaunchBtn}`}
              onClick={handleInitiateBoost}
              disabled={boosting}
            >
              {boosting ? "Processing Booster..." : "Submit"}
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <PaymentConfirmationModal
        isOpen={showBoosterPaymentConfirmModal}
        onClose={() => setShowBoosterPaymentConfirmModal(false)}
        onConfirm={handleExecuteBoost}
        serviceTitle="Campaign Attention Booster"
        amountFormatted={formatCurrency(calculateBoosterCost(), boosterAd.country)}
        paymentMethodText={boosterPaymentMethod === "wallet" ? "Wallet Balance" : "Card / Bank Transfer"}
        summaryItems={[
          { label: "Target Attention Added", value: `+${addImpressions.toLocaleString()} views` },
          { label: "Schedule Extension", value: `+${addDays} ${addDays === 1 ? "day" : "days"}` },
          {
            label: "Priority Bid Rate",
            value: `${formatCurrency(
              newBidPrice > 0 && newBidPrice > Number(boosterAd.cost_per_impression || 25)
                ? newBidPrice
                : Number(boosterAd.cost_per_impression || 25),
              boosterAd.country
            )} / view`,
          },
        ]}
        isSubmitting={boosting}
      />
    </>
  );
}
