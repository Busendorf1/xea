"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Zap, Crown, Award, ChevronRight, TrendingUp, Sparkles, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./AttentionMarketTicker.module.css";
import RollingCounter from "@/components/ui/RollingCounter";

export interface MarketRate {
  floorPrice: number;
  highestBid: number;
  totalBids: number;
}

interface AttentionMarketTickerProps {
  selectedCategory: string;
  isBiddingEnabled: boolean;
  onToggleBidding: (enabled: boolean) => void;
  bidPrice: number;
  onBidPriceChange: (price: number) => void;
  impressions: number;
}

const CATEGORY_NAMES: Record<string, string> = {
  politics: "Politics",
  business: "Business",
  government: "Government",
  individual: "Individual",
  religion: "Religion",
  product_sales: "Product Sales",
};

function AttentionMarketTicker({
  selectedCategory,
  isBiddingEnabled,
  onToggleBidding,
  bidPrice,
  onBidPriceChange,
  impressions,
}: AttentionMarketTickerProps) {
  const [rates, setRates] = useState<Record<string, MarketRate>>({
    politics: { floorPrice: 1500, highestBid: 1500, totalBids: 0 },
    business: { floorPrice: 45, highestBid: 45, totalBids: 0 },
    government: { floorPrice: 2000, highestBid: 2000, totalBids: 0 },
    individual: { floorPrice: 25, highestBid: 25, totalBids: 0 },
    religion: { floorPrice: 1500, highestBid: 1500, totalBids: 0 },
    product_sales: { floorPrice: 55, highestBid: 55, totalBids: 0 },
  });
  const [inputError, setInputError] = useState("");

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch("/api/bidding/market-rates");
      if (res.ok) {
        const data = await res.json();
        if (data.marketRates) {
          setRates(data.marketRates);
        }
      }
    } catch (e) {
      console.error("Error fetching market rates:", e);
    }
  }, []);

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 10000);
    return () => clearInterval(interval);
  }, [fetchRates]);

  const catKey = (selectedCategory || "business").toLowerCase();
  const currentCategoryRate = rates[catKey] || {
    floorPrice: 45,
    highestBid: 45,
    totalBids: 0,
  };

  const categoryDisplayName = CATEGORY_NAMES[catKey] || catKey;

  // Sync initial bid price to floor or highest bid if 0 or below floor
  useEffect(() => {
    if (isBiddingEnabled && (bidPrice <= 0 || bidPrice < currentCategoryRate.floorPrice)) {
      const suggestedBid = Math.max(currentCategoryRate.highestBid, currentCategoryRate.floorPrice);
      onBidPriceChange(suggestedBid);
    }
  }, [isBiddingEnabled, catKey, bidPrice, currentCategoryRate.floorPrice, currentCategoryRate.highestBid, onBidPriceChange]);

  const handlePriceInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (isNaN(val)) {
      onBidPriceChange(0);
      setInputError(`Bid must be at least ₦${currentCategoryRate.floorPrice.toLocaleString()}`);
      return;
    }
    onBidPriceChange(val);
    if (val < currentCategoryRate.floorPrice) {
      setInputError(`Bid cannot be lower than floor rate (₦${currentCategoryRate.floorPrice.toLocaleString()})`);
    } else {
      setInputError("");
    }
  };

  const handlePresetClick = (multiplier: number, addition: number = 0) => {
    const base = Math.max(currentCategoryRate.highestBid, currentCategoryRate.floorPrice);
    const newBid = Math.ceil(base * multiplier + addition);
    onBidPriceChange(newBid);
    setInputError("");
  };

  const formatCurrency = (amt: number) => {
    return "₦" + Math.round(amt).toLocaleString("en-NG");
  };

  const activeBidRate = bidPrice || currentCategoryRate.floorPrice;
  const totalBiddedCost = activeBidRate * (impressions || 1000);

  // Projected Rank Logic
  const rankStatus = useMemo(() => {
    if (!isBiddingEnabled) return "standard";
    if (bidPrice > currentCategoryRate.highestBid) return "spotlight";
    if (bidPrice === currentCategoryRate.highestBid && bidPrice > currentCategoryRate.floorPrice) return "matched";
    return "challenger";
  }, [isBiddingEnabled, bidPrice, currentCategoryRate.highestBid, currentCategoryRate.floorPrice]);

  return (
    <div className={`${styles.container} ${isBiddingEnabled ? styles.containerActive : ""}`}>
      {/* Header with Title and Toggle */}
      <div className={styles.headerBar}>
        <div className={styles.headerLeft}>
          <div className={styles.iconCircle}>
            <Zap size={18} className={styles.zapIcon} />
          </div>
          <div className={styles.titleColumn}>
            <div className={styles.titleRow}>
              <h4 className={styles.headerTitle}>Priority Spotlight Auction</h4>
              <span className={`${styles.statusBadge} ${isBiddingEnabled ? styles.statusBadgeActive : ""}`}>
                {isBiddingEnabled ? "Priority Active" : "Standard Feed"}
              </span>
            </div>
            <p className={styles.headerSubtitle}>
              Outbid competitor campaigns to secure the #1 position at the top of the user feed
            </p>
          </div>
        </div>

        {/* Minimalist Apple Toggle */}
        <label className={styles.switch} aria-label="Toggle Priority Spotlight Auction">
          <input
            type="checkbox"
            checked={isBiddingEnabled}
            onChange={(e) => onToggleBidding(e.target.checked)}
          />
          <span className={styles.slider}></span>
        </label>
      </div>

      {/* Expanded Spotlight Bidding Panel */}
      <AnimatePresence initial={false}>
        {isBiddingEnabled && (
          <motion.div
            key="bidding-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={styles.biddingPanel}
          >
            {/* Market Context Banner */}
            <div className={styles.marketContextBanner}>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Target Category</span>
                <span className={styles.contextValue}>{categoryDisplayName}</span>
              </div>
              <div className={styles.contextDivider} />
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Floor Rate</span>
                <span className={styles.contextValue}>{formatCurrency(currentCategoryRate.floorPrice)}</span>
              </div>
              <div className={styles.contextDivider} />
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Current Top Bid</span>
                <span className={`${styles.contextValue} ${styles.topBidValue}`}>
                  {formatCurrency(currentCategoryRate.highestBid)}
                </span>
              </div>
            </div>

            {/* Projected Rank Card */}
            <div className={`${styles.rankCard} ${styles[`rankCard_${rankStatus}`]}`}>
              <div className={styles.rankHeader}>
                <div className={styles.rankIconWrap}>
                  {rankStatus === "spotlight" ? (
                    <Crown size={18} className={styles.goldCrown} />
                  ) : rankStatus === "matched" ? (
                    <Sparkles size={18} className={styles.matchedSparkle} />
                  ) : (
                    <TrendingUp size={18} className={styles.challengerIcon} />
                  )}
                </div>
                <div className={styles.rankTextColumn}>
                  <div className={styles.rankPillRow}>
                    <span className={styles.rankTitle}>
                      {rankStatus === "spotlight"
                        ? "★ #1 Spotlight Winner (Lead Position)"
                        : rankStatus === "matched"
                        ? "⚡ Matched Top Bid (Shared Spotlight)"
                        : "Challenger Position (Standard Feed Priority)"}
                    </span>
                  </div>
                  <p className={styles.rankDescription}>
                    {rankStatus === "spotlight"
                      ? "Your ad will hold exclusive #1 placement in the feed with ~4.5× faster delivery."
                      : rankStatus === "matched"
                      ? "Sharing top-of-feed rotation with current top bidder."
                      : "Placed in prioritized rotation. Increase bid above current top to claim #1 Spotlight."}
                  </p>
                </div>
              </div>
            </div>

            {/* Outbid Presets Chips */}
            <div className={styles.presetsSection}>
              <span className={styles.sectionLabel}>Quick Outbid Presets</span>
              <div className={styles.presetChipsRow}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  className={`${styles.presetChip} ${bidPrice === currentCategoryRate.highestBid ? styles.presetChipActive : ""}`}
                  onClick={() => handlePresetClick(1.0)}
                >
                  <span>Match Top</span>
                  <strong>{formatCurrency(currentCategoryRate.highestBid)}</strong>
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  className={`${styles.presetChip} ${bidPrice === Math.ceil(currentCategoryRate.highestBid * 1.1) ? styles.presetChipActive : ""}`}
                  onClick={() => handlePresetClick(1.1)}
                >
                  <span>+10% Lead</span>
                  <strong>{formatCurrency(Math.ceil(currentCategoryRate.highestBid * 1.1))}</strong>
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  className={`${styles.presetChip} ${bidPrice === Math.ceil(currentCategoryRate.highestBid * 1.25) ? styles.presetChipActive : ""}`}
                  onClick={() => handlePresetClick(1.25)}
                >
                  <span>+25% Outbid</span>
                  <strong>{formatCurrency(Math.ceil(currentCategoryRate.highestBid * 1.25))}</strong>
                </motion.button>
              </div>
            </div>

            {/* Custom Bid Input */}
            <div className={styles.customBidSection}>
              <div className={styles.inputHeader}>
                <span className={styles.sectionLabel}>Custom Bid Rate (per attention)</span>
                <span className={styles.currencyBadge}>NGN</span>
              </div>
              <div className={styles.inputContainer}>
                <input
                  type="number"
                  step="1"
                  min={currentCategoryRate.floorPrice}
                  className={`${styles.bidInput} ${inputError ? styles.bidInputError : ""}`}
                  value={bidPrice || ""}
                  onChange={handlePriceInput}
                  placeholder={currentCategoryRate.floorPrice.toString()}
                />
              </div>
              {inputError && <p className={styles.errorText}>{inputError}</p>}
            </div>

            {/* Real-time Impact Calculation Summary */}
            <div className={styles.calcSummaryBox}>
              <div className={styles.calcRow}>
                <span className={styles.calcLabel}>Target Attentions:</span>
                <strong className={styles.calcValue}>{impressions.toLocaleString()} attentions</strong>
              </div>
              <div className={styles.calcRow}>
                <span className={styles.calcLabel}>Rate per Attention:</span>
                <strong className={styles.calcValue}>{formatCurrency(activeBidRate)}</strong>
              </div>
              <div className={`${styles.calcRow} ${styles.calcTotalRow}`}>
                <span className={styles.totalLabel}>Total Campaign Cost:</span>
                <div className={styles.totalNumberWrap}>
                  <RollingCounter value={totalBiddedCost} currencyPrefix="₦" decimals={0} durationMs={600} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default React.memo(AttentionMarketTicker);
