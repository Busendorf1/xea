import { useState, useEffect, useCallback, useRef } from "react";
import { Ad } from "@/types/ads";

interface UseFeedAdsOptions {
  userEmail: string;
  initialLimit?: number;
}

export function useFeedAds({ userEmail, initialLimit = 10 }: UseFeedAdsOptions) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [advertiserProfiles, setAdvertiserProfiles] = useState<Record<string, unknown>>({});
  const processingRef = useRef<Set<string>>(new Set());

  // Fetch paginated feed ads from server API
  const fetchAds = useCallback(
    async (pageNum: number, isLoadMore = false) => {
      if (!userEmail) return;

      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setPage(0);
      }
      setError(null);

      try {
        const offset = pageNum * initialLimit;
        const refreshParam = pageNum === 0 ? "&refresh=true" : "";
        const response = await fetch(`/api/feed?offset=${offset}&limit=${initialLimit}${refreshParam}`);

        if (!response.ok) {
          throw new Error("Failed to fetch ad feed");
        }

        const data = await response.json();
        const incomingAds: Ad[] = data.ads || [];
        const profilesMap = data.profiles || {};

        if (Object.keys(profilesMap).length > 0) {
          setAdvertiserProfiles((prev) => ({ ...prev, ...profilesMap }));
        }

        // Deduplicate incoming ads against existing list
        setAds((prev) => {
          if (!isLoadMore) return incomingAds;
          const existingIds = new Set(prev.map((a) => a.id));
          const uniqueNew = incomingAds.filter((a) => !existingIds.has(a.id));
          return [...prev, ...uniqueNew];
        });

        setHasMore(incomingAds.length >= initialLimit);
      } catch (err: unknown) {
        console.error("❌ useFeedAds error:", err);
        setError((err as Error)?.message || "Failed to load feed");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [userEmail, initialLimit]
  );

  useEffect(() => {
    fetchAds(0, false);
  }, [fetchAds]);

  const loadNextPage = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchAds(nextPage, true);
  }, [loading, loadingMore, hasMore, page, fetchAds]);

  // Instant Optimistic Dismissal (< 1ms UI response)
  const dismissAd = useCallback((adId: string) => {
    setAds((prev) => prev.filter((a) => a.id !== adId));
  }, []);

  // Record Seen click with Optimistic UI dismissal
  const recordSeen = useCallback(
    async (ad: Ad): Promise<boolean> => {
      if (!ad || !ad.id) return false;
      if (processingRef.current.has(ad.id)) return false;
      processingRef.current.add(ad.id);

      // Optimistically remove from local UI list
      dismissAd(ad.id);

      try {
        const response = await fetch("/api/seen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adId: ad.id }),
        });
        if (!response.ok) throw new Error("Failed to record ad seen");
        return true;
      } catch (err) {
        console.error("❌ Error in recordSeen:", err);
        return false;
      } finally {
        processingRef.current.delete(ad.id);
      }
    },
    [dismissAd]
  );

  return {
    ads,
    loading,
    loadingMore,
    error,
    hasMore,
    advertiserProfiles,
    loadNextPage,
    dismissAd,
    recordSeen,
    refetch: () => fetchAds(0, false),
  };
}
