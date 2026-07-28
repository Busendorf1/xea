"use client";

import React, { useEffect, useState } from "react";
import { TrendingUp, Zap, ShieldCheck, DollarSign, Activity } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
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
      console.error("Error fetching attention market rates:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 10000); // 10s Bloomberg ticker update
    return () => clearInterval(interval);
  }, []);

  const catKey = (selectedCategory || "business").toLowerCase();
  const currentCategoryRate = rates[catKey] || {
    floorPrice: 45,
    highestBid: 45,
    totalBids: 0,
  };

  // Sync initial bid price to floor or highest bid if default 0
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
    return "₦" + amt.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const totalBiddedCost = (bidPrice || currentCategoryRate.floorPrice) * impressions;

  return (
    <div className={styles.container}>
      {/* Bloomberg Header Bar */}
      <div className={styles.headerBar}>
        <div className={styles.headerLeft}>
          <Activity size={18} className={styles.tickerPulseIcon} />
          <span className={styles.headerTitle}>ATTENTION ECONOMY MARKET TICKER</span>
          <span className={styles.liveBadge}>LIVE</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.tickerSub}>200 Attention Ratio (75% Bidded Priority / 25% Floor)</span>
        </div>
      </div>

      {/* Real-time Ticker Scroll Grid */}
      <div className={styles.tickerGrid}>
        {Object.entries(rates).map(([cat, rate]) => {
          const isSelected = cat === catKey;
          const isHighBid = rate.highestBid > rate.floorPrice;
          return (
            <div
              key={cat}
              className={`${styles.tickerCard} ${isSelected ? styles.selectedCard : ""}`}
            >
              <div className={styles.catLabelRow}>
                <span className={styles.catName}>{CATEGORY_NAMES[cat] || cat}</span>
                {isHighBid && <span className={styles.upTrendTag}>High Demand</span>}
              </div>
              <div className={styles.catPriceRow}>
                <div className={styles.priceCol}>
                  <span className={styles.priceLabel}>Floor</span>
                  <span className={styles.priceVal}>{formatCurrency(rate.floorPrice)}</span>
                </div>
                <div className={styles.priceColRight}>
                  <span className={styles.priceLabel}>Top Bid</span>
                  <span className={`${styles.priceVal} ${isHighBid ? styles.textSuccess : ""}`}>
                    {formatCurrency(rate.highestBid)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toggle Bidding Section */}
      <div className={styles.toggleCard}>
        <div className={styles.toggleMainRow}>
          <div className={styles.toggleTextGroup}>
            <div className={styles.toggleTitleRow}>
              <Zap size={18} className={styles.zapIcon} />
              <h4 className={styles.toggleTitle}>Bid for Priority Attention & Faster Delivery</h4>
            </div>
            <p className={styles.toggleDesc}>
              Bidding enters your campaign into the 75% market priority window, delivering your ads **75% faster** to viewers.
            </p>
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
                Category: <strong>{CATEGORY_NAMES[catKey] || catKey}</strong>
              </span>
              <span className={styles.floorNote}>
                Floor Rate: {formatCurrency(currentCategoryRate.floorPrice)} / impression
              </span>
            </div>

            {/* Presets */}
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
              <label className={styles.inputLabel}>Your Custom Bid (per impression):</label>
              <div className={styles.inputWrapper}>
                <span className={styles.currencyPrefix}>₦</span>
                <input
                  type="number"
                  step="0.5"
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
                <span>Target Impressions:</span>
                <strong>{impressions.toLocaleString()} views</strong>
              </div>
              <div className={styles.calcRow}>
                <span>Effective Rate:</span>
                <strong>{formatCurrency(bidPrice || currentCategoryRate.floorPrice)} / view</strong>
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
