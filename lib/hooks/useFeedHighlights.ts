import { useState, useCallback } from "react";
import { Ad } from "@/components/ui/AdCard";

interface RawHighlightItem {
  id: string;
  is_bidded?: boolean;
  is_paused?: boolean;
  is_highest_bidder?: boolean;
  user_render_count?: number;
  title?: string;
  content?: string;
  image_url?: string;
  interest?: string;
  created_at?: string;
  user_email?: string;
}

function mapRawHighlightsToAds(data: RawHighlightItem[] | undefined | null): Ad[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  const boosted = data.filter((item) => !!item?.is_bidded && !item?.is_paused);
  const eligible = boosted.filter((item) => {
    const count = item.user_render_count || 0;
    const limit = item.is_highest_bidder ? 2 : 1;
    return count < limit;
  });

  return eligible.map(
    (item) =>
      ({
        id: item.id,
        is_highlight: true,
        title: item.title,
        ad_content: item.content || "",
        ad_media: item.image_url || null,
        interest: item.interest ? [item.interest] : [],
        created_at: item.created_at,
        user_email: item.user_email || "",
        impressions: 0,
      } as Ad)
  );
}

export function useFeedHighlights(isMobile: boolean, initialHighlights?: any[]) {
  const [highlights, setHighlights] = useState<Ad[]>(() => {
    if (Array.isArray(initialHighlights) && initialHighlights.length > 0) {
      return mapRawHighlightsToAds(initialHighlights as RawHighlightItem[]);
    }
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_highlights_cache");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
            return mapRawHighlightsToAds(parsed.items);
          }
        }
      } catch {}
    }
    return [];
  });
  const [hasFetched, setHasFetched] = useState<boolean>(
    Array.isArray(initialHighlights) && initialHighlights.length > 0
  );

  const fetchHighlights = useCallback(async (userInterests: string[]) => {
    if (!userInterests || userInterests.length === 0) return;
    try {
      setHasFetched(true);
      const interestsQuery = userInterests.join(",");
      const response = await fetch(`/api/highlights?interests=${encodeURIComponent(interestsQuery)}`);
      if (response.ok) {
        const data: RawHighlightItem[] = await response.json();
        setHighlights(mapRawHighlightsToAds(data));
        if (typeof window !== "undefined" && Array.isArray(data) && data.length > 0) {
          try {
            sessionStorage.setItem(
              "paayh_highlights_cache",
              JSON.stringify({ items: data, timestamp: Date.now() })
            );
          } catch {}
        }
      }
    } catch (e) {
      console.error("❌ useFeedHighlights error:", e);
    }
  }, []);

  const buildDisplayFeed = useCallback(
    (ads: Ad[]) => {
      if (!isMobile || highlights.length === 0) {
        return ads;
      }

      const result: Ad[] = [];
      const hlQueue = [...highlights];

      for (let i = 0; i < ads.length; i++) {
        result.push(ads[i]);
        // Interleave up to 2 boosted highlights per 10-ad batch (at index 2 and index 7)
        if ((i % 10 === 2 || i % 10 === 7) && hlQueue.length > 0) {
          const nextHl = hlQueue.shift();
          if (nextHl && !result.some((item) => item.id === nextHl.id)) {
            result.push(nextHl);
          }
        }
      }

      return result;
    },
    [isMobile, highlights]
  );

  return {
    highlights,
    hasFetched,
    fetchHighlights,
    buildDisplayFeed,
  };
}
