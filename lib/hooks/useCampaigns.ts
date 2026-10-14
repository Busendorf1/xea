"use client";

import { useState, useEffect, useCallback } from "react";
import { Ad } from "@/components/MyAds/types";
import { fetchUserCampaignsShared, clearUserCampaignsCache } from "@/lib/campaignsClient";

interface UseCampaignsOptions {
  email?: string | null;
  autoPollIntervalMs?: number;
}

export function useCampaigns({ email, autoPollIntervalMs = 0 }: UseCampaignsOptions) {
  const [reviewAds, setReviewAds] = useState<Ad[]>([]);
  const [activeAds, setActiveAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [reportsMap, setReportsMap] = useState<Record<string, number>>({});
  const [dismissalsMap, setDismissalsMap] = useState<Record<string, number>>({});
  const [advertiserBlockCount, setAdvertiserBlockCount] = useState<number>(0);

  const fetchAds = useCallback(
    async (bypassCache: boolean = false) => {
      if (!email) {
        setLoading(false);
        return;
      }

      const cacheKey = `my_ads_cache_${email.toLowerCase()}`;
      const THIRTY_SECONDS = 30 * 1000;

      if (!bypassCache && typeof window !== "undefined") {
        try {
          const cachedRaw = sessionStorage.getItem(cacheKey);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (cached && cached.timestamp && Date.now() - cached.timestamp < THIRTY_SECONDS) {
              setReviewAds(cached.reviewAds || []);
              setActiveAds(cached.activeAds || []);
              setReportsMap(cached.reportsMap || {});
              setDismissalsMap(cached.dismissalsMap || {});
              setAdvertiserBlockCount(cached.advertiserBlockCount || 0);
              setLoading(false);
              return;
            }
          }
        } catch (cacheErr) {
          console.warn("sessionStorage cache read error:", cacheErr);
        }
      }

      try {
        const [campaignsRes, analyticsRes] = await Promise.all([
          fetchUserCampaignsShared(email, bypassCache),
          fetch("/api/campaigns/analytics")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);

        if (!campaignsRes) {
          throw new Error("Failed to fetch campaigns");
        }

        const data = campaignsRes;
        const rev = data.adsQueue || data.reviewAds || [];
        const act = data.adsActive || data.activeAds || [];

        setReviewAds(rev);
        setActiveAds(act);

        let repMap: Record<string, number> = {};
        let disMap: Record<string, number> = {};
        let blkCount = 0;

        if (analyticsRes && analyticsRes.success) {
          repMap = analyticsRes.reportsMap || {};
          disMap = analyticsRes.dismissalsMap || {};
          blkCount = analyticsRes.advertiserBlockCount || 0;
          setReportsMap(repMap);
          setDismissalsMap(disMap);
          setAdvertiserBlockCount(blkCount);
        }

        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(
              cacheKey,
              JSON.stringify({
                timestamp: Date.now(),
                reviewAds: rev,
                activeAds: act,
                reportsMap: repMap,
                dismissalsMap: disMap,
                advertiserBlockCount: blkCount,
              })
            );
          } catch (storageErr) {
            console.warn("sessionStorage cache write error:", storageErr);
          }
        }

        setError(false);
      } catch (err) {
        console.error("Error loading campaigns:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [email]
  );

  const invalidateCache = useCallback(() => {
    if (email) {
      clearUserCampaignsCache(email);
    }
    if (typeof window !== "undefined" && email) {
      sessionStorage.removeItem(`my_ads_cache_${email.toLowerCase()}`);
    }
    return fetchAds(true);
  }, [email, fetchAds]);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  useEffect(() => {
    if (autoPollIntervalMs <= 0) return;
    const interval = setInterval(() => {
      fetchAds(false);
    }, autoPollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchAds, autoPollIntervalMs]);

  return {
    reviewAds,
    activeAds,
    loading,
    error,
    reportsMap,
    dismissalsMap,
    advertiserBlockCount,
    setReviewAds,
    setActiveAds,
    refetch: fetchAds,
    invalidateCache,
  };
}
