"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, X, Users, User, UserCheck, Wallet, CreditCard, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { boostSchema } from "@/lib/validationSchemas";
import { formatCurrency } from "@/lib/utils/currency";
import LocationSelector from "../LocationSelector";
import CustomSelect from "@/components/ui/CustomSelect";
import PaymentConfirmationModal from "@/components/ui/PaymentConfirmationModal";
import { isWalletPinErrorResponse, formatWalletPinErrorMessage } from "@/components/ui/WalletPinField";
import { useAdCapacityCheck } from "@/lib/hooks/useAdCapacityCheck";
import { Ad } from "./types";
import styles from "./page.module.css";

interface CampaignBoosterModalProps {
  boosterAd: Ad | null;
  onClose: () => void;
  reportsCount: number;
  userBalance?: number;
  onSuccess: (message?: string) => void;
  onShowNotice: (title: string, message: string, adId?: string) => void;
}

export default function CampaignBoosterModal({
  boosterAd,
  onClose,
  reportsCount,
  userBalance,
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
  const [walletPin, setWalletPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
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
      setWalletPin("");
      setPinError(null);
    }
  }, [boosterAd]);

  const isConcreteBoostVal = (val: unknown): boolean => {
    if (Array.isArray(val)) return val.some((entry) => isConcreteBoostVal(entry));
    const raw = String(val ?? "").trim().toLowerCase();
    if (!raw) return false;
    const wildcards = new Set([
      "",
      "all",
      "both",
      "everyone",
      "all countries",
      "all gender",
      "all genders",
      "all states",
      "all locations",
      "any",
      "worldwide",
      "global",
      "none",
      "placeholder",
    ]);
    return raw
      .split(/[;,]/)
      .map((p) => p.trim())
      .some((tok) => tok.length > 0 && !wildcards.has(tok));
  };

  const remainingBoostBase = boosterAd
    ? Math.max(0, Number(boosterAd.impressions || 0) - Number(boosterAd.impression_count || 0))
    : 0;
  const currentCampaignDays = boosterAd
    ? Math.max(1, Math.min(90, Math.floor(Number(boosterAd.campaign_days || 1))))
    : 1;
  const maxAdditionalBoostDays = Math.max(0, 90 - currentCampaignDays);
  const origFreqCap = boosterAd
    ? Math.max(1, Math.min(100, Math.floor(Number(boosterAd.user_frequency_cap || 1))))
    : 1;
  const normalizedBoostFreqCap = Math.max(
    1,
    Math.min(100, Math.floor(Number(boosterFrequencyCap) || origFreqCap))
  );
  const freqCapChanged = normalizedBoostFreqCap !== origFreqCap;
  const origGenderNorm = String(boosterAd?.gender || "All").trim().toLowerCase();
  const nextGenderNorm = String(boosterGender || "All").trim().toLowerCase();
  const nextProvinceJoined =
    boosterProvince || (boosterMultiLocations.length > 0 ? boosterMultiLocations.join("; ") : "");
  const targetingChanged = Boolean(
    boosterAd &&
      (nextGenderNorm !== origGenderNorm ||
        String(boosterCountry || "").trim() !== String(boosterAd.country || "").trim() ||
        String(boosterState || "").trim() !== String(boosterAd.state || "").trim() ||
        String(nextProvinceJoined || "").trim() !== String(boosterAd.province || "").trim())
  );
  const effectiveProvince = nextProvinceJoined || boosterAd?.province || null;
  const effectiveTargetingAll =
    Boolean(boosterAd?.targeting_all) &&
    !(
      isConcreteBoostVal(boosterCountry || boosterAd?.country) ||
      isConcreteBoostVal(boosterState || boosterAd?.state) ||
      isConcreteBoostVal(effectiveProvince) ||
      (boosterGender !== "All" && isConcreteBoostVal(boosterGender))
    );
  const shouldCheckBoostCapacity = Boolean(
    boosterAd &&
      remainingBoostBase + addImpressions > 0 &&
      (addImpressions > 0 || freqCapChanged || targetingChanged)
  );

  const {
    capacity: boostCapacity,
    checkingCapacity: checkingBoostCapacity,
    retryCapacityCheck: retryBoostCapacityCheck,
  } = useAdCapacityCheck({
    enabled: shouldCheckBoostCapacity,
    impressions: remainingBoostBase + addImpressions,
    minImpressions: 1,
    campaignDays: Math.min(90, currentCampaignDays + Math.max(0, addDays)),
    userFrequencyCap: normalizedBoostFreqCap,
    targetingAll: effectiveTargetingAll,
    country: boosterCountry || boosterAd?.country || null,
    state: boosterState || boosterAd?.state || null,
    province: effectiveProvince,
    gender: boosterGender !== "All" ? boosterGender : null,
    ageRange: boosterAd?.age_range || null,
    employmentStatus: boosterAd?.employment_status || null,
    industry: boosterAd?.industry || null,
    interest: boosterAd?.interest || null,
    lifestyle: boosterAd?.lifestyle || null,
    behavior: boosterAd?.behavior || null,
    personality: boosterAd?.personality || null,
  });

  if (!boosterAd) return null;

  const calculateBoosterCost = () => {
    const currentCost = Math.max(15, Number(boosterAd.cost_per_impression || 25));
    const effectiveCost = newBidPrice > 0 && newBidPrice > currentCost ? newBidPrice : currentCost;
    if (addImpressions > 0) {
      return addImpressions * effectiveCost;
    }
    if (effectiveCost > currentCost) {
      const remainingImp = Math.max(
        1,
        Number(boosterAd.impressions || 100) - Number(boosterAd.impression_count || 0)
      );
      return (effectiveCost - currentCost) * remainingImp;
    }
    return 0;
  };

  const getBoostUnavailableReason = (ad: Ad, reports: number): string | null => {
    if (
      ad.payment_status === "unpaid" ||
      ad.status === "pending_review" ||
      ad.status === "approved_pending_publish"
    ) {
      return "Boosting is only available after your campaign has been approved, paid for, and published live to the feed.";
    }
    if (reports > 0) {
      return "This campaign has been reported by viewers and is currently under content safety review. Please wait for the moderation review to complete.";
    }
    const isPausedByAdmin = Boolean(
      ad.admin_statement &&
      typeof ad.admin_statement === "string" &&
      ad.admin_statement.trim() !== "" &&
      !ad.admin_statement.startsWith("APPROVED:") &&
      !ad.admin_statement.toLowerCase().startsWith("status:") &&
      !ad.admin_statement.startsWith("REJECTED:")
    );
    if (isPausedByAdmin) {
      return `This campaign was paused by an administrator. Reason: "${ad.admin_statement}". Please resolve the notice or wait for admin review.`;
    }
    if (ad.is_paused) {
      return "This campaign is currently paused. Please resume the campaign first to boost it.";
    }
    return null;
  };

  const handleInitiateBoost = () => {
    if (boosting) return;
    const reason = getBoostUnavailableReason(boosterAd, reportsCount);
    if (reason) {
      onShowNotice("Boosting Unavailable", reason, boosterAd.id);
      onClose();
      return;
    }

    const validation = boostSchema.safeParse({
      adId: boosterAd.id,
      bidAmount: newBidPrice > 0 ? newBidPrice : 25,
      paymentMethod: boosterPaymentMethod,
    });

    if (!validation.success) {
      onShowNotice("Validation Notice", validation.error.issues[0]?.message || "Invalid boost parameters.");
      return;
    }

    const totalCost = calculateBoosterCost();
    if (boosterPaymentMethod === "wallet" && typeof userBalance === "number" && totalCost > userBalance) {
      onClose();
      onShowNotice(
        "Insufficient Wallet Balance",
        `Your wallet balance (₦${userBalance.toLocaleString()}) is insufficient to cover this campaign boost (₦${totalCost.toLocaleString()}). Please choose Card / Bank Transfer or fund your wallet.`,
        boosterAd.id
      );
      return;
    }

    if (totalCost <= 0) {
      handleExecuteBoost();
      return;
    }

    setWalletPin("");
    setPinError(null);
    setShowBoosterPaymentConfirmModal(true);
  };

  const handleExecuteBoost = async () => {
    if (boosting) return;
    const reason = getBoostUnavailableReason(boosterAd, reportsCount);
    if (reason) {
      onShowNotice("Boosting Unavailable", reason, boosterAd.id);
      onClose();
      return;
    }

    const validation = boostSchema.safeParse({
      adId: boosterAd.id,
      bidAmount: newBidPrice > 0 ? newBidPrice : 25,
      paymentMethod: boosterPaymentMethod,
    });

    if (!validation.success) {
      onShowNotice("Validation Notice", validation.error.issues[0]?.message || "Invalid boost parameters.");
      return;
    }

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
        `Your wallet balance (₦${userBalance.toLocaleString()}) is insufficient to cover this campaign boost (₦${totalCost.toLocaleString()}). Please choose Card / Bank Transfer or fund your wallet.`,
        boosterAd.id
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
        throw new Error(data.error || `Failed to boost campaign (${res.status})`);
      }

      if (boosterPaymentMethod === "card" && data.paymentUrl) {
        try {
          sessionStorage.setItem("paayh_boost_ref", data.reference);
          sessionStorage.setItem("paayh_boost_type", "ad");
        } catch {}
        window.location.href = data.paymentUrl;
        return;
      }

      setShowBoosterPaymentConfirmModal(false);
      onClose();
      onSuccess(data.message || "Your campaign has been boosted successfully!");
    } catch (e: any) {
      setShowBoosterPaymentConfirmModal(false);
      onClose();
      const rawError = e.message || "An error occurred while boosting your campaign.";
      const isInsufficient = rawError.toLowerCase().includes("insufficient");
      onShowNotice(
        isInsufficient ? "Insufficient Wallet Balance" : "Boost Notice",
        rawError,
        boosterAd.id
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
          transition={{ duration: 0.2 }}
          className={styles.modalOverlay}
          onClick={boosting ? undefined : onClose}
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
                <TrendingUp size={18} color="var(--primary)" />
                <h3 className={styles.modalTitle}>Boost &amp; Top Up Campaign</h3>
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
              <div className={styles.boosterGroup}>
                <label className={styles.boosterLabel}>Add Extra Attention Target</label>
                <CustomSelect
                  value={String(addImpressions)}
                  onChange={(val) => setAddImpressions(Number(val))}
                  options={[
                    { value: "0", label: "+0 Attention", badge: "Current" },
                    ...([0, 100, 500, 1000, 2500, 5000, 10000].includes(addImpressions) || addImpressions <= 0
                      ? []
                      : [{ value: String(addImpressions), label: `+${addImpressions.toLocaleString()} Attention`, badge: "Custom" }]),
                    { value: "100", label: "+100 Attention", badge: "Mini" },
                    { value: "500", label: "+500 Attention", badge: "Starter" },
                    { value: "1000", label: "+1,000 Attention", badge: "Popular" },
                    { value: "2500", label: "+2,500 Attention", badge: "Growth" },
                    { value: "5000", label: "+5,000 Attention", badge: "High Reach" },
                    { value: "10000", label: "+10,000 Attention", badge: "Scale" },
                  ]}
                  placeholder="Select Extra Attention"
                  leadingIcon={<TrendingUp size={16} />}
                />
                <input
                  type="number"
                  min={0}
                  step={1}
                  aria-label="Custom extra attentions"
                  placeholder="Or enter exact extra attentions (e.g. 501)"
                  className={styles.boosterInput}
                  style={{ marginTop: 8 }}
                  value={addImpressions}
                  onChange={(e) => {
                    const parsed = Math.max(0, Math.floor(Number(e.target.value) || 0));
                    setAddImpressions(parsed);
                  }}
                />
              </div>

              <div className={styles.boosterGroup}>
                <div className={styles.boosterLabelRow}>
                  <label className={styles.boosterLabel}>Extend Duration</label>
                  <span className={styles.boosterDaysValue}>+{Math.min(addDays, maxAdditionalBoostDays)} Days</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.min(30, maxAdditionalBoostDays)}
                  step={1}
                  disabled={maxAdditionalBoostDays <= 0}
                  value={Math.min(addDays, maxAdditionalBoostDays)}
                  onChange={(e) => setAddDays(Math.min(maxAdditionalBoostDays, Math.max(0, Number(e.target.value))))}
                  className={styles.boosterSliderBlue}
                />
                <span className={styles.boosterSliderHint}>
                  {maxAdditionalBoostDays > 0
                    ? `Extend up to +${Math.min(30, maxAdditionalBoostDays)} days (90 days total max). No extra fee for day extensions.`
                    : "Maximum 90-day campaign duration reached."}
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
                  <span className={styles.boosterFreqValue}>{boosterFrequencyCap} Attentions/User/Day</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={boosterFrequencyCap}
                  onChange={(e) => setBoosterFrequencyCap(Number(e.target.value))}
                  className={styles.boosterSliderPurple}
                />
                <span className={styles.boosterSliderHint}>
                  Limit max attentions per individual user (1 to 100 attentions/day).
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

            {shouldCheckBoostCapacity && checkingBoostCapacity && (
              <div style={{ marginTop: 12, fontSize: "0.78rem", color: "var(--text-secondary, #94a3b8)" }}>
                Checking delivery capacity...
              </div>
            )}

            {shouldCheckBoostCapacity && !checkingBoostCapacity && boostCapacity && (boostCapacity.telemetryAvailable || boostCapacity.status === "unavailable") && (() => {
              const isUnavailable = !boostCapacity.telemetryAvailable || boostCapacity.status === "unavailable";
              return (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${
                    isUnavailable
                      ? "var(--border-color, rgba(148, 163, 184, 0.35))"
                      : boostCapacity.status === "capped"
                      ? "rgba(239, 68, 68, 0.35)"
                      : boostCapacity.status === "optimal"
                      ? "rgba(16, 185, 129, 0.3)"
                      : "rgba(245, 158, 11, 0.35)"
                  }`,
                  background:
                    isUnavailable
                      ? "rgba(148, 163, 184, 0.08)"
                      : boostCapacity.status === "capped"
                      ? "rgba(239, 68, 68, 0.08)"
                      : boostCapacity.status === "optimal"
                      ? "rgba(16, 185, 129, 0.08)"
                      : "rgba(245, 158, 11, 0.08)",
                  fontSize: "0.78rem",
                  color: isUnavailable ? "var(--text-secondary, #94a3b8)" : undefined,
                  display: "inline-flex",
                  width: "fit-content",
                  maxWidth: "100%",
                  alignSelf: "flex-start",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minWidth: 0 }}>
                  {isUnavailable ? (
                    <Info size={14} color="var(--text-secondary, #94a3b8)" style={{ flexShrink: 0, marginTop: 2 }} />
                  ) : boostCapacity.status === "capped" ? (
                    <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                  ) : boostCapacity.status === "optimal" ? (
                    <CheckCircle2 size={14} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                  ) : (
                    <Info size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                  )}
                  <span>{boostCapacity.message}</span>
                </div>
                {isUnavailable && (
                  <button
                    type="button"
                    onClick={retryBoostCapacityCheck}
                    style={{
                      fontSize: "0.72rem",
                      padding: "3px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--border-color, rgba(255,255,255,0.2))",
                      background: "transparent",
                      color: "inherit",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Retry
                  </button>
                )}
                {boostCapacity.status === "capped" &&
                  boostCapacity.maxOrderableImpressions - remainingBoostBase > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAddImpressions(
                          Math.max(0, boostCapacity.maxOrderableImpressions - remainingBoostBase)
                        )
                      }
                      style={{
                        fontSize: "0.72rem",
                        padding: "3px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border-color, rgba(255,255,255,0.2))",
                        background: "transparent",
                        color: "inherit",
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Use +
                      {Math.max(
                        0,
                        boostCapacity.maxOrderableImpressions - remainingBoostBase
                      ).toLocaleString()}
                    </button>
                  )}
              </div>
              );
            })()}

            <button
              type="button"
              className={`${styles.boostBtn} ${styles.boostLaunchBtn}`}
              onClick={handleInitiateBoost}
              disabled={
                boosting ||
                (shouldCheckBoostCapacity && checkingBoostCapacity) ||
                Boolean(shouldCheckBoostCapacity && boostCapacity?.telemetryAvailable && !boostCapacity.allowed)
              }
            >
              {boosting ? "Processing Booster..." : "Submit"}
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
        serviceTitle="Campaign Attention Booster"
        amountFormatted={formatCurrency(calculateBoosterCost(), boosterAd.country)}
        paymentMethodText={boosterPaymentMethod === "wallet" ? "Wallet Balance" : "Card / Bank Transfer"}
        requireWalletPin={boosterPaymentMethod === "wallet" && calculateBoosterCost() > 0}
        walletPin={walletPin}
        onWalletPinChange={(val) => {
          setWalletPin(val);
          if (pinError) setPinError(null);
        }}
        pinError={pinError}
        summaryItems={[
          { label: "Target Attention Added", value: `+${addImpressions.toLocaleString()} attentions` },
          { label: "Schedule Extension", value: `+${addDays} ${addDays === 1 ? "day" : "days"}` },
          {
            label: "Priority Bid Rate",
            value: `${formatCurrency(
              newBidPrice > 0 && newBidPrice > Number(boosterAd.cost_per_impression || 25)
                ? newBidPrice
                : Number(boosterAd.cost_per_impression || 25),
              boosterAd.country
            )} / attention`,
          },
        ]}
        isSubmitting={boosting}
      />
    </>
  );
}
