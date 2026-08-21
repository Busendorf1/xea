"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "@/lib/supabaseClient";

interface UseLiveFeedUpdatesOptions {
  userInterests?: string[] | string | null;
  onNewItemsAvailable?: (count: number) => void;
}

/**
 * High-Scale Live Feed Updates Hook (Tier-1 Architecture)
 * - Listens for incoming ads & highlights via Realtime broadcast / changes
 * - Accumulates pending count without interrupting active scroll
 * - Pauses connection when tab is backgrounded to eliminate zombie sockets
 */
export function useLiveFeedUpdates({
  userInterests,
  onNewItemsAvailable,
}: UseLiveFeedUpdatesOptions = {}) {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const isTabVisibleRef = useRef<boolean>(true);

  // Normalize interests for topic matching
  const parsedInterests = Array.isArray(userInterests)
    ? userInterests.map((i) => i.toLowerCase().trim())
    : typeof userInterests === "string"
    ? userInterests.split(",").map((i) => i.toLowerCase().trim())
    : [];

  const handleIncomingPost = useCallback(
    (newPost: any) => {
      // If user has targeted interests, verify topic relevance
      if (parsedInterests.length > 0 && newPost?.interest) {
        const postInterests = Array.isArray(newPost.interest)
          ? newPost.interest.map((i: string) => String(i).toLowerCase().trim())
          : [String(newPost.interest).toLowerCase().trim()];

        const isRelevant = postInterests.some((pi: string) => parsedInterests.includes(pi));
        if (!isRelevant) return;
      }

      setPendingCount((prev) => {
        const next = prev + 1;
        onNewItemsAvailable?.(next);
        return next;
      });
    },
    [parsedInterests, onNewItemsAvailable]
  );

  useEffect(() => {
    // 1. Visibility management: Pause when tab is backgrounded
    const handleVisibilityChange = () => {
      isTabVisibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 2. Realtime Channel Subscription
    const channelName = "realtime-feed-broadcast";
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "adds",
        },
        (payload) => {
          if (isTabVisibleRef.current && payload.new) {
            handleIncomingPost(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [handleIncomingPost]);

  const clearPending = useCallback(() => {
    setPendingCount(0);
  }, []);

  return {
    pendingCount,
    clearPending,
  };
}
