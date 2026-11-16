"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import styles from "../Newsdisplay/page.module.css";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import { isConfiguredNextImageSrc } from "@/lib/utils/nextImageSafety";
import Skeleton from "../ui/Skeleton";
import Avatar from "../ui/Avatar";
import VerifiedBadge from "../ui/VerifiedBadge";
import supabase from "@/lib/supabaseClient";
import type { AdvertiserProfile } from "@/types/ads";
import { extractHighlightsPayload } from "../../lib/hooks/useFeedHighlights";
import {
  resolveUserLogoUrl,
  isProfileMonetizedBadgeEligible,
  resolvePublisherDisplayName,
} from "../../lib/utils/profileDisplay";
import {
  formatHighlightInterests,
  HighlightLike,
  isHighlightCurrentlyActive,
  sortHighlightsByBidAndRecency,
} from "@/lib/highlights/highlightLifecycle";

interface Ad extends HighlightLike {
  id: string;
  title: string;
  content: string;
  image_url: string;
  interest: string[] | string;
  user_email: string;
  created_at: string;
  custom_sponsor_name?: string;
  custom_sponsor_handle?: string;
  custom_sponsor_logo?: string;
}

const HIGHLIGHTS_CACHE_TTL_MS = 5 * 60 * 1000;

function readHighlightsCache(): { items: Ad[]; profiles: Record<string, AdvertiserProfile> } {
  if (typeof window === "undefined") return { items: [], profiles: {} };
  try {
    const raw = sessionStorage.getItem("paayh_highlights_cache");
    if (!raw) return { items: [], profiles: {} };
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || Date.now() - Number(parsed.timestamp) > HIGHLIGHTS_CACHE_TTL_MS) {
      return { items: [], profiles: {} };
    }
    if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
      const nowMs = Date.now();
      return {
        items: (parsed.items as Ad[])
          .filter((item) => isHighlightCurrentlyActive(item, nowMs))
          .sort(sortHighlightsByBidAndRecency),
        profiles:
          parsed?.profiles && typeof parsed.profiles === "object"
            ? (parsed.profiles as Record<string, AdvertiserProfile>)
            : {},
      };
    }
  } catch {}
  return { items: [], profiles: {} };
}

function safeRelativeTime(dateInput?: string | null): string {
  if (!dateInput) return "just now";
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) return "recently";
  return `${formatDistanceToNow(parsed)} ago`;
}

export default function AdDisplay({
  userInterest,
  initialHighlights,
  initialHighlightProfiles,
}: {
  userInterest: string[];
  initialHighlights?: Ad[];
  initialHighlightProfiles?: Record<string, AdvertiserProfile>;
}) {
  const [cachedData] = useState<{ items: Ad[]; profiles: Record<string, AdvertiserProfile> }>(() =>
    !initialHighlights || initialHighlights.length === 0
      ? readHighlightsCache()
      : { items: [], profiles: {} }
  );
  const cachedItems = cachedData.items;

  const [profilesMap, setProfilesMap] = useState<Record<string, AdvertiserProfile>>(() => ({
    ...(cachedData.profiles || {}),
    ...(initialHighlightProfiles || {}),
  }));
  const profilesMapRef = useRef<Record<string, AdvertiserProfile>>(profilesMap);
  profilesMapRef.current = profilesMap;

  useEffect(() => {
    if (initialHighlightProfiles && Object.keys(initialHighlightProfiles).length > 0) {
      setProfilesMap((prev) => ({ ...prev, ...initialHighlightProfiles }));
    }
  }, [initialHighlightProfiles]);

  const [ads, setAds] = useState<Ad[]>(() => {
    const nowMs = Date.now();
    if (initialHighlights && initialHighlights.length > 0) {
      return initialHighlights
        .filter((item) => isHighlightCurrentlyActive(item, nowMs))
        .sort(sortHighlightsByBidAndRecency);
    }
    return cachedItems;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (initialHighlights && initialHighlights.length > 0) return false;
    if (cachedItems.length > 0) return false;
    return true;
  });
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const hasAdsRef = useRef<boolean>(ads.length > 0);
  hasAdsRef.current = ads.length > 0;

  const fetchAll = useCallback(
    async (pageNum = 0, isLoadMore = false, isSilentRefresh = false) => {
      if (!userInterest || userInterest.length === 0) {
        setAds([]);
        setLoading(false);
        return;
      }

      if (!isLoadMore) {
        if (!isSilentRefresh && !hasAdsRef.current) {
          setLoading(true);
        }
        setError(false);
        setPage(0);
        setHasMore(true);
      }

      try {
        const interestsQuery = userInterest.join(",");
        const ITEMS_PER_PAGE = 20;
        const offset = pageNum * ITEMS_PER_PAGE;
        const response = await fetch(
          `/api/highlights?interests=${encodeURIComponent(interestsQuery)}&limit=${ITEMS_PER_PAGE}&offset=${offset}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch highlights: ${response.status}`);
        }

        const rawJson = await response.json();
        const { items: extractedItems, profiles: incomingProfiles } = extractHighlightsPayload(rawJson);
        const rawPageItems = extractedItems as unknown as Ad[];
        if (Object.keys(incomingProfiles).length > 0) {
          setProfilesMap((prev) => ({ ...prev, ...incomingProfiles }));
        }
        const nowMs = Date.now();
        const pageItems = rawPageItems
          .filter((item) => isHighlightCurrentlyActive(item, nowMs))
          .sort(sortHighlightsByBidAndRecency);

        if (pageNum === 0 || !isLoadMore) {
          setAds(pageItems);
          if (typeof window !== "undefined") {
            try {
              sessionStorage.setItem(
                "paayh_highlights_cache",
                JSON.stringify({
                  items: pageItems,
                  profiles: { ...profilesMapRef.current, ...incomingProfiles },
                  timestamp: Date.now(),
                })
              );
            } catch {}
          }
        } else {
          setAds((prev) => {
            const seen = new Set(prev.map((a) => a.id));
            const merged = [...prev, ...pageItems.filter((a) => !seen.has(a.id))];
            return merged.sort(sortHighlightsByBidAndRecency);
          });
        }

        setHasMore(rawPageItems.length >= ITEMS_PER_PAGE);
      } catch (err: unknown) {
        console.error("❌ Error fetching highlights:", err);
        if (!hasAdsRef.current) {
          setError(true);
        }
      } finally {
        setLoading(false);
      }
    },
    [userInterest]
  );

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchAll(nextPage, true);
  };

  useEffect(() => {
    if (initialHighlights && initialHighlights.length > 0 && typeof window !== "undefined") {
      const nowMs = Date.now();
      const filtered = initialHighlights
        .filter((item) => isHighlightCurrentlyActive(item, nowMs))
        .sort(sortHighlightsByBidAndRecency);
      setAds(filtered);
      try {
        sessionStorage.setItem(
          "paayh_highlights_cache",
          JSON.stringify({
            items: filtered,
            profiles: { ...profilesMapRef.current, ...(initialHighlightProfiles || {}) },
            timestamp: Date.now(),
          })
        );
      } catch {}
    }
  }, [initialHighlights, initialHighlightProfiles]);

  useEffect(() => {
    if (!initialHighlights || initialHighlights.length === 0) {
      fetchAll(0, false, cachedItems.length > 0);
    }

    // Refresh silently every 10 minutes + prune newly expired highlights every 60s
    const fetchInterval = setInterval(() => {
      fetchAll(0, false, true);
    }, 600_000);

    const expirySweep = setInterval(() => {
      const nowMs = Date.now();
      setAds((prev) => {
        const next = prev.filter((item) => isHighlightCurrentlyActive(item, nowMs));
        return next.length === prev.length ? prev : next;
      });
    }, 60_000);

    return () => {
      clearInterval(fetchInterval);
      clearInterval(expirySweep);
    };
  }, [userInterest, fetchAll, initialHighlights, cachedItems.length]);

  // Real-Time Highlights Auto-Drop, Pause/Expiry Update & Deletion Sync
  useEffect(() => {
    if (!userInterest || userInterest.length === 0) return;

    const normalizedInterests = userInterest.map((i) => i.toLowerCase().trim());
    const channelName = "realtime-newsdisplay-highlights";

    const matchesViewerInterest = (rawInterest: unknown) => {
      const rowInterest = rawInterest
        ? Array.isArray(rawInterest)
          ? rawInterest.map((i: string) => String(i).toLowerCase().trim())
          : [String(rawInterest).toLowerCase().trim()]
        : [];
      return (
        rowInterest.length === 0 ||
        rowInterest.includes("all") ||
        rowInterest.includes("general") ||
        rowInterest.some((ri: string) => normalizedInterests.includes(ri))
      );
    };

    const rowToAd = (row: Record<string, any>): Ad => ({
      id: row.id,
      title: row.title || "Business Highlight",
      content: row.content || "",
      image_url: row.image_url || "",
      interest: Array.isArray(row.interest) ? row.interest : row.interest ? [row.interest] : [],
      user_email: row.user_email || "",
      created_at: row.created_at || new Date().toISOString(),
      expires_at: row.expires_at || null,
      scheduled_start_at: row.scheduled_start_at || null,
      scheduled_end_at: row.scheduled_end_at || null,
      campaign_days: row.campaign_days || 1,
      is_paused: Boolean(row.is_paused),
      is_bidded: Boolean(row.is_bidded || Number(row.bid_price || 0) > 0),
      is_boosted: Boolean(row.is_boosted),
      bid_price: row.bid_price ?? null,
      admin_statement: row.admin_statement || null,
    });

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "newsactive",
        },
        (payload) => {
          if (!payload.new) return;
          const row = payload.new as Record<string, any>;
          if (!matchesViewerInterest(row.interest)) return;
          const newHighlight = rowToAd(row);
          if (!isHighlightCurrentlyActive(newHighlight, Date.now())) return;
          setAds((prev) =>
            [newHighlight, ...prev.filter((a) => a.id !== newHighlight.id)].sort(sortHighlightsByBidAndRecency)
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "newsactive",
        },
        (payload) => {
          const row = payload.new as Record<string, any> | undefined;
          if (!row?.id) return;
          const updated = rowToAd(row);
          setAds((prev) => {
            const exists = prev.some((a) => a.id === updated.id);
            if (!isHighlightCurrentlyActive(updated, Date.now())) {
              return exists ? prev.filter((a) => a.id !== updated.id) : prev;
            }
            if (!exists && !matchesViewerInterest(row.interest)) {
              return prev;
            }
            return [updated, ...prev.filter((a) => a.id !== updated.id)].sort(sortHighlightsByBidAndRecency);
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "newsactive",
        },
        (payload) => {
          const deletedId = (payload.old as Record<string, any> | undefined)?.id;
          if (!deletedId) return;
          setAds((prev) => prev.filter((a) => a.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userInterest]);

  if (loading && page === 0) {
    return (
      <div className={styles.skeletonContainer}>
        {[1, 2].map((n) => (
          <div key={n} className={`${styles.adCard} ${styles.skeletonCard}`}>
            <Skeleton variant="rect" width="100%" height={120} />
            <Skeleton variant="title" width="60%" height={18} className={styles.skeletonTitle} />
            <Skeleton variant="text" width="90%" height={12} />
            <Skeleton variant="text" width="80%" height={12} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <p className={styles.errorMessage}>Failed to load highlights.</p>
        <button type="button" onClick={() => fetchAll(0, false)} className={styles.retryButton}>
          Try Again
        </button>
      </div>
    );
  }

  if (ads.length === 0) {
    return <p className={styles.noAds}>No active highlights match your interests right now.</p>;
  }

  return (
    <div className={styles.adList}>
      {ads.map((ad) => {
        const isVideo = /\.(mp4|webm|mov|m3u8)(\?|#|$)/i.test(ad.image_url || "");
        const hasMedia = Boolean(ad.image_url && String(ad.image_url).trim());
        const isExpanded = Boolean(expandedMap[ad.id]);
        const isLongContent = (ad.content || "").length > 90;
        const isBidded = Boolean(ad.is_bidded || Number(ad.bid_price || 0) > 0);
        const interestText = formatHighlightInterests(ad.interest);
        const emailLower = typeof ad.user_email === "string" ? ad.user_email.toLowerCase().trim() : "";
        const pubProfile = emailLower ? profilesMap[emailLower] : null;
        const pubLogo = resolveUserLogoUrl(ad.custom_sponsor_logo, pubProfile);
        const pubName = resolvePublisherDisplayName({
          customName: ad.custom_sponsor_name,
          profile: pubProfile,
          email: ad.user_email,
          fallbackName: ad.title || "Highlight",
        });
        const isVerified = isProfileMonetizedBadgeEligible(
          pubProfile ? { ...pubProfile, email: pubProfile.email || ad.user_email } : ad.user_email ? { email: ad.user_email } : null
        );

        return (
          <article key={ad.id} className={styles.adCard}>
            <div className={styles.adAuthorRow}>
              <Avatar
                src={pubLogo}
                name={pubName}
                email={ad.user_email}
                size={22}
                gender={pubProfile?.gender || null}
                alt={pubName}
              />
              <span className={styles.adAuthorName} title={pubName}>
                {pubName}
              </span>
              {isVerified && <VerifiedBadge size={12} title="Verified Account" />}
            </div>
            {hasMedia && (
              <div className={styles.adMediaFrame}>
                {isVideo ? (
                  <video
                    src={ad.image_url}
                    autoPlay
                    loop
                    muted
                    controls={false}
                    playsInline
                    preload="metadata"
                    className={`${styles.adImage} ${styles.adVideo}`}
                  />
                ) : isConfiguredNextImageSrc(ad.image_url) ? (
                  <Image
                    width={640}
                    height={400}
                    src={ad.image_url.trim()}
                    alt={ad.title || "Business Highlight"}
                    className={styles.adImage}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={ad.image_url}
                    alt={ad.title || "Business Highlight"}
                    className={styles.adImage}
                    loading="lazy"
                  />
                )}
                {isBidded && (
                  <span className={styles.adBidBadge}>
                    {ad.is_highest_bidder ? "Top Bid" : "Featured"}
                  </span>
                )}
              </div>
            )}

            <div className={styles.adTitleRow}>
              <h4 className={styles.adTitle} title={ad.title || undefined}>
                {ad.title}
              </h4>
              {!hasMedia && isBidded && (
                <span className={styles.adBidBadgeInline}>
                  {ad.is_highest_bidder ? "Top Bid" : "Featured"}
                </span>
              )}
            </div>

            {ad.content && (
              <p
                className={`${styles.adContent} ${isExpanded ? styles.adContentExpanded : ""}`}
                title={ad.content}
              >
                {ad.content}
              </p>
            )}

            {isLongContent && (
              <button
                type="button"
                className={styles.readMoreInline}
                onClick={() =>
                  setExpandedMap((prev) => ({
                    ...prev,
                    [ad.id]: !prev[ad.id],
                  }))
                }
              >
                {isExpanded ? "Show less" : "Read more"}
              </button>
            )}

            <span className={styles.adTag} title={`${interestText} · ${safeRelativeTime(ad.created_at)}`}>
              <span className={styles.adTagInterest}>{interestText}</span>
              <small className={styles.adTagTime}>· {safeRelativeTime(ad.created_at)}</small>
            </span>
          </article>
        );
      })}

      {hasMore && (
        <div className={styles.loadMoreContainer}>
          <button type="button" onClick={handleLoadMore} className={styles.loadMoreButton}>
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
