"use client";

import React, { useEffect, useState } from "react";
import { Activity, Zap } from "lucide-react";
import styles from "./AttentionMarketTicker.module.css";

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

export default function AttentionMarketTicker({
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

  const fetchRates = async () => {
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
  };

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 10000);
    return () => clearInterval(interval);
  }, []);

  const catKey = (selectedCategory || "business").toLowerCase();
  const currentCategoryRate = rates[catKey] || {
    floorPrice: 45,
    highestBid: 45,
    totalBids: 0,
  };

  // Calculate percentage increase over floor price
  const percentIncrease = currentCategoryRate.floorPrice > 0
    ? Math.round(((currentCategoryRate.highestBid - currentCategoryRate.floorPrice) / currentCategoryRate.floorPrice) * 100)
    : 0;

  // Sync initial bid price to floor or highest bid if 0
  useEffect(() => {
    if (isBiddingEnabled && (bidPrice <= 0 || bidPrice < currentCategoryRate.floorPrice)) {
      const suggestedBid = Math.max(currentCategoryRate.highestBid, currentCategoryRate.floorPrice);
      onBidPriceChange(suggestedBid);
    }
  }, [isBiddingEnabled, catKey, currentCategoryRate.floorPrice, currentCategoryRate.highestBid]);

  const handlePriceInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (isNaN(val)) {
      onBidPriceChange(0);
      setInputError(`Bid must be at least ₦${currentCategoryRate.floorPrice}`);
      return;
    }
    onBidPriceChange(val);
    if (val < currentCategoryRate.floorPrice) {
      setInputError(`Bid cannot be lower than floor price (₦${currentCategoryRate.floorPrice})`);
    } else {
      setInputError("");
    }
  };

  const handlePresetClick = (multiplier: number) => {
    const base = Math.max(currentCategoryRate.highestBid, currentCategoryRate.floorPrice);
    const newBid = Math.ceil(base * multiplier);
    onBidPriceChange(newBid);
    setInputError("");
  };

  const formatCurrency = (amt: number) => {
    return "₦" + Math.round(amt).toLocaleString("en-NG");
  };

  const totalBiddedCost = (bidPrice || currentCategoryRate.floorPrice) * impressions;

  const categoryDisplayName = CATEGORY_NAMES[catKey] || catKey;

  return (
    <div className={styles.container}>
      {/* Ticker Header */}
      <div className={styles.headerBar}>
        <div className={styles.headerLeft}>
          <Activity size={16} className={styles.tickerPulseIcon} />
          <span className={styles.headerTitle}>Attention Cap</span>
          <span className={styles.liveBadge}>Ticker</span>
        </div>
      </div>

      {/* Show ONLY the advertiser's selected category item */}
      <div className={styles.tickerGrid}>
        <div className={styles.singleTickerCard}>
          <span className={styles.catTickerText}>
            {categoryDisplayName} +{percentIncrease}%
          </span>
          <span className={styles.catPriceTag}>
            {formatCurrency(currentCategoryRate.highestBid)}
          </span>
        </div>
      </div>

      {/* Toggle Bidding Section */}
      <div className={styles.toggleCard}>
        <div className={styles.toggleMainRow}>
          <div className={styles.toggleTextGroup}>
            <div className={styles.toggleTitleRow}>
              <Zap size={16} className={styles.zapIcon} />
              <h4 className={styles.toggleTitle}>Bid for Priority Attention</h4>
            </div>
            <p className={styles.toggleDesc}>Faster delivery</p>
          </div>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={isBiddingEnabled}
              onChange={(e) => onToggleBidding(e.target.checked)}
            />
            <span className={styles.slider}></span>
          </label>
        </div>

        {/* Bidding Control Panel when Toggled ON */}
        {isBiddingEnabled && (
          <div className={styles.biddingPanel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelCatTitle}>
                Category: <strong>{categoryDisplayName}</strong>
              </span>
              <span className={styles.floorNote}>
                Floor Rate: {formatCurrency(currentCategoryRate.floorPrice)} / Attention
              </span>
            </div>

            {/* Outbid Presets */}
            <div className={styles.presetRow}>
              <button
                type="button"
                className={styles.presetBtn}
                onClick={() => handlePresetClick(1.0)}
              >
                Match Top ({formatCurrency(currentCategoryRate.highestBid)})
              </button>
              <button
                type="button"
                className={styles.presetBtn}
                onClick={() => handlePresetClick(1.1)}
              >
                +10% Boost
              </button>
              <button
                type="button"
                className={styles.presetBtn}
                onClick={() => handlePresetClick(1.25)}
              >
                +25% Outbid
              </button>
            </div>

            {/* Custom Input */}
            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Set Custom Bid (per attention):</label>
              <div className={styles.inputWrapper}>
                <span className={styles.currencyPrefix}>₦</span>
                <input
                  type="number"
                  step="1"
                  min={currentCategoryRate.floorPrice}
                  className={`${styles.bidInput} ${inputError ? styles.inputErrorBorder : ""}`}
                  value={bidPrice || ""}
                  onChange={handlePriceInput}
                  placeholder={`Min ${currentCategoryRate.floorPrice}`}
                />
              </div>
              {inputError && <span className={styles.errorText}>{inputError}</span>}
            </div>

            {/* Real-time Calculation Summary */}
            <div className={styles.calcBox}>
              <div className={styles.calcRow}>
                <span>Target Attentions:</span>
                <strong>{impressions.toLocaleString()} attentions</strong>
              </div>
              <div className={styles.calcRow}>
                <span>Effective Bid Rate:</span>
                <strong>{formatCurrency(bidPrice || currentCategoryRate.floorPrice)} / attention</strong>
              </div>
              <div className={`${styles.calcRow} ${styles.calcTotalRow}`}>
                <span>Total Campaign Cost:</span>
                <strong className={styles.totalVal}>{formatCurrency(totalBiddedCost)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
