"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "@/lib/supabaseClient";
import { Ad, AdvertiserProfile } from "@/types/ads";

export interface UseLiveFeedUpdatesOptions {
  userInterests?: string[] | string | null;
  userEmail?: string | null;
  viewerProfile?: Record<string, any> | null;
  existingAdIds?: string[];
  onNewItemsAvailable?: (count: number) => void;
}

function normalizeTokens(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.flatMap((v) => normalizeTokens(v));
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
        }
      } catch {}
    }
    return trimmed
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return [String(val).trim().toLowerCase()].filter(Boolean);
}

const WILDCARDS = new Set(["all", "any", "global", "everyone", "both", "none", "placeholder", "*"]);

function isWildcard(tokens: string[]): boolean {
  return tokens.length === 0 || tokens.some((t) => WILDCARDS.has(t));
}

function normalizeStateToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(state|province|region|territory|fct)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Client-side defense-in-depth targeting matcher for live ad drops.
 */
function matchesViewerOnClient(
  ad: Record<string, any>,
  viewer: Record<string, any> | null | undefined,
  fallbackEmail: string | null | undefined,
  fallbackInterests: string[]
): boolean {
  if (!ad || !ad.id) return false;
  if (ad.is_paused === true || ad.completed_at) return false;

  const isAdminPost = Boolean(ad.is_admin_post);
  const viewerEmail = String(viewer?.email || fallbackEmail || "").toLowerCase().trim();
  const ownerEmail = String(ad.user_email || ad.email || "").toLowerCase().trim();
  if (!isAdminPost && viewerEmail && ownerEmail && viewerEmail === ownerEmail) {
    return false;
  }

  if (isAdminPost || ad.targeting_all === true) {
    return true;
  }

  // 1. Country check
  const adCountries = normalizeTokens(ad.country);
  const viewerCountry = String(viewer?.country || "").trim().toLowerCase();
  if (!isWildcard(adCountries) && viewerCountry && viewerCountry !== "placeholder") {
    if (!adCountries.includes(viewerCountry)) return false;
  }

  // 2. State / Province check
  const adStates = [...normalizeTokens(ad.state), ...normalizeTokens(ad.province)];
  if (!isWildcard(adStates) && viewer) {
    const vStates = [
      viewer.state ? normalizeStateToken(String(viewer.state)) : "",
      viewer.location ? normalizeStateToken(String(viewer.location)) : "",
    ].filter(Boolean);
    if (vStates.length > 0) {
      const normAdStates = adStates.map(normalizeStateToken).filter(Boolean);
      const matchedState =
        normAdStates.length === 0 ||
        normAdStates.some((as) => vStates.some((vs) => vs === as || vs.includes(as) || as.includes(vs)));
      if (!matchedState) return false;
    }
  }

  // 3. Gender check
  const adGenders = normalizeTokens(ad.gender);
  const viewerGender = String(viewer?.gender || "").trim().toLowerCase();
  if (!isWildcard(adGenders) && viewerGender && viewerGender !== "placeholder") {
    if (!adGenders.includes(viewerGender)) return false;
  }

  // 4. Psychographic check
  const adPersona = [
    ...normalizeTokens(ad.interest),
    ...normalizeTokens(ad.industry),
    ...normalizeTokens(ad.behavior),
    ...normalizeTokens(ad.lifestyle),
    ...normalizeTokens(ad.personality),
  ].filter((t) => !WILDCARDS.has(t));

  if (adPersona.length > 0) {
    const viewerPersona = new Set([
      ...fallbackInterests,
      ...normalizeTokens(viewer?.interest),
      ...normalizeTokens(viewer?.industry),
      ...normalizeTokens(viewer?.behavior),
      ...normalizeTokens(viewer?.lifestyle),
      ...normalizeTokens(viewer?.personality),
    ]);
    if (viewerPersona.size > 0) {
      const hasOverlap = adPersona.some((tag) => viewerPersona.has(tag));
      if (!hasOverlap) return false;
    }
  }

  return true;
}

/**
 * High-Scale Live Feed Updates Hook (Webhook SSE + Supabase Realtime `addsactive`)
 * - Receives real-time webhook-dropped ads via `/api/feed/stream` and `addsactive` inserts
 * - Filters strictly by the scrolling user's full targeting profile
 * - Stages matching new ads in `pendingAds` without jumping the active scroll position
 */
export function useLiveFeedUpdates({
  userInterests,
  userEmail,
  viewerProfile,
  existingAdIds = [],
  onNewItemsAvailable,
}: UseLiveFeedUpdatesOptions = {}) {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [pendingAds, setPendingAds] = useState<Ad[]>([]);
  const [pendingProfiles, setPendingProfiles] = useState<Record<string, AdvertiserProfile>>({});
  const isTabVisibleRef = useRef<boolean>(true);
  const stagedIdsRef = useRef<Set<string>>(new Set());

  const existingIdsRef = useRef<Set<string>>(new Set());
  existingIdsRef.current = new Set(existingAdIds.map(String));

  const viewerProfileRef = useRef(viewerProfile);
  viewerProfileRef.current = viewerProfile;

  const userEmailRef = useRef(userEmail);
  userEmailRef.current = userEmail;

  const parsedInterestsRef = useRef<string[]>([]);
  parsedInterestsRef.current = normalizeTokens(userInterests);

  const onNewItemsAvailableRef = useRef(onNewItemsAvailable);
  onNewItemsAvailableRef.current = onNewItemsAvailable;

  const handleIncomingAdDrop = useCallback(
    (incomingAd: any, incomingProfile?: AdvertiserProfile | null) => {
      if (!incomingAd || !incomingAd.id) return;
      const adId = String(incomingAd.id);

      // Deduplicate against already-displayed ads and already-staged ads
      if (existingIdsRef.current.has(adId) || stagedIdsRef.current.has(adId)) {
        return;
      }

      // Verify full targeting accuracy before notifying the scrolling user
      const isTargeted = matchesViewerOnClient(
        incomingAd,
        viewerProfileRef.current,
        userEmailRef.current,
        parsedInterestsRef.current
      );
      if (!isTargeted) return;

      stagedIdsRef.current.add(adId);

      setPendingAds((prev) => {
        if (prev.some((a) => String(a.id) === adId)) return prev;
        return [incomingAd as Ad, ...prev];
      });

      if (incomingProfile && incomingProfile.email) {
        const emailLower = incomingProfile.email.toLowerCase();
        setPendingProfiles((prev) => ({
          ...prev,
          [emailLower]: incomingProfile,
        }));
      }

      setPendingCount((prev) => {
        const next = prev + 1;
        onNewItemsAvailableRef.current?.(next);
        return next;
      });
    },
    []
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      isTabVisibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 1. Connect to Multiplexed Webhook SSE Stream (`/api/feed/stream`)
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/feed/stream");
      eventSource.onmessage = (event) => {
        if (!event.data) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === "ad.dropped" && payload.ad) {
            handleIncomingAdDrop(payload.ad, payload.publisherProfile || null);
          }
        } catch {}
      };
      eventSource.onerror = () => {
        // Browser EventSource automatically reconnects with backoff
      };
    } catch {}

    // 2. Redundant Realtime Subscription on `addsactive` (active approved ads table)
    const channel = supabase
      .channel("realtime-feed-addsactive")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "addsactive",
        },
        (payload) => {
          if (isTabVisibleRef.current && payload.new) {
            handleIncomingAdDrop(payload.new, null);
          }
        }
      )
      .subscribe();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (eventSource) {
        eventSource.close();
      }
      supabase.removeChannel(channel);
    };
  }, [handleIncomingAdDrop]);

  const clearPending = useCallback(() => {
    stagedIdsRef.current.clear();
    setPendingAds([]);
    setPendingProfiles({});
    setPendingCount(0);
  }, []);

  const consumePendingAds = useCallback(() => {
    const adsToPrepend = [...pendingAds];
    const profilesToMerge = { ...pendingProfiles };
    stagedIdsRef.current.clear();
    setPendingAds([]);
    setPendingProfiles({});
    setPendingCount(0);
    return {
      ads: adsToPrepend,
      profiles: profilesToMerge,
    };
  }, [pendingAds, pendingProfiles]);

  return {
    pendingCount,
    pendingAds,
    pendingProfiles,
    clearPending,
    consumePendingAds,
  };
}
