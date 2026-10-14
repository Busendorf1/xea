"use client";

import { useState, useEffect, useCallback } from "react";
import { UserProfile } from "@/components/DashboardClient/types";

interface UseWalletOptions {
  initialUser: UserProfile;
  autoRefreshIntervalMs?: number;
}

export function useWallet({ initialUser, autoRefreshIntervalMs = 20000 }: UseWalletOptions) {
  const [user, setUser] = useState<UserProfile>(initialUser);
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  const toggleShowBalance = useCallback(() => {
    setShowBalance((prev) => !prev);
  }, []);

  const refreshProfile = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [pRes, mRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/monetize")
      ]);

      if (pRes.ok) {
        const data = await pRes.json();
        let liveClicks = data.monetization_clicks ?? 0;
        let isMonetized = data.monetized;

        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData && mData.success) {
            liveClicks = Math.max(liveClicks, mData.clicksCount || 0);
            if (mData.isMonetized) isMonetized = true;
          }
        }

        if (data && !data.error && data.email) {
          setUser((prev) => ({
            ...data,
            monetization_clicks: Math.max(prev.monetization_clicks || 0, liveClicks),
            mutual_count: Math.max(prev.mutual_count || 0, Number(data.mutual_count) || 0),
            monetized: isMonetized ?? prev.monetized,
            balance:
              typeof data.balance !== "undefined" && !isNaN(Number(data.balance))
                ? Math.max(prev.balance || 0, Number(data.balance))
                : prev.balance || 0,
          }));
        }
      }
    } catch (e) {
      console.warn("Silent profile refresh error:", e);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleEarnSuccess = useCallback((earnedAmount?: number, newBalance?: number, newClicks?: number) => {
    if (typeof newBalance === "number" && !isNaN(newBalance)) {
      setUser((prev) => ({
        ...prev,
        balance: newBalance,
        monetization_clicks:
          typeof newClicks === "number" ? Math.max(prev.monetization_clicks || 0, newClicks) : prev.monetization_clicks,
        monetized: (typeof newClicks === "number" && newClicks >= 300) || prev.monetized,
      }));
      return;
    }

    const delta = typeof earnedAmount === "number" ? earnedAmount : 15;
    if (delta !== 0) {
      setUser((prev) => ({
        ...prev,
        balance: Math.max(0, Math.round(((prev.balance || 0) + delta) * 100) / 100),
      }));
    }
  }, []);

  const handleMutualSuccess = useCallback(() => {
    setUser((prev) => ({
      ...prev,
      mutual_count: Math.min(50, (prev.mutual_count || 0) + 1),
    }));
  }, []);

  const deductBalance = useCallback((amount: number) => {
    setUser((prev) => ({
      ...prev,
      balance: Math.max(0, Math.round(((prev.balance || 0) - amount) * 100) / 100),
    }));
  }, []);

  useEffect(() => {
    if (autoRefreshIntervalMs <= 0) return;

    const initialTimer = setTimeout(() => {
      refreshProfile();
    }, 3000);

    const interval = setInterval(() => {
      refreshProfile();
    }, autoRefreshIntervalMs);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [refreshProfile, autoRefreshIntervalMs]);

  return {
    user,
    setUser,
    showBalance,
    toggleShowBalance,
    refreshProfile,
    isRefreshing,
    handleEarnSuccess,
    handleMutualSuccess,
    deductBalance,
  };
}
