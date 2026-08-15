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

export function useFeedHighlights(isMobile: boolean) {
  const [highlights, setHighlights] = useState<Ad[]>([]);

  const fetchHighlights = useCallback(async (userInterests: string[]) => {
    if (!userInterests || userInterests.length === 0) return;
    try {
      const interestsQuery = userInterests.join(",");
      const response = await fetch(`/api/highlights?interests=${encodeURIComponent(interestsQuery)}`);
      if (response.ok) {
        const data: RawHighlightItem[] = await response.json();

        // Filter ONLY Boosted Highlights (is_bidded === true and not paused)
        const boosted = (data || []).filter((item) => !!item.is_bidded && !item.is_paused);

        // Daily render count limit:
        // Highest bidder: limit = 2, Regular: limit = 1
        const eligible = boosted.filter((item) => {
          const count = item.user_render_count || 0;
          const limit = item.is_highest_bidder ? 2 : 1;
          return count < limit;
        });

        // Map to Ad interface
        const hItems = eligible.map(
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

        setHighlights(hItems);
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
    fetchHighlights,
    buildDisplayFeed,
  };
}
