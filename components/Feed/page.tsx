
// Feed.tsx
"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import supabase from "@/lib/utils/db";
import styles from "../Feed/page.module.css";
import { useVirtualizer } from "@tanstack/react-virtual";
import AdCard, { Ad } from "../ui/AdCard";
import Skeleton from "../ui/Skeleton";

interface FeedProps {
  userEmail: string;
  initialProfile?: any;
  onEarnSuccess?: () => void;
  onMutualSuccess?: () => void;
}


const Feed = ({ userEmail, initialProfile, onEarnSuccess, onMutualSuccess }: FeedProps) => {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [seenAds, setSeenAds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [advertiserProfiles, setAdvertiserProfiles] = useState<Record<string, { business_name?: string; firstName?: string; profileImage?: string }>>({});
  const [viewerProfile, setViewerProfile] = useState<{
    balance: number;
    mutual_count: number;
    mutuals: string[];
    monetized: boolean;
    suspended_until?: string | null;
  } | null>(() => {
    if (initialProfile) {
      return {
        balance: parseFloat(initialProfile.balance ?? 0),
        mutual_count: initialProfile.mutual_count ?? 0,
        mutuals: Array.isArray(initialProfile.mutuals) ? initialProfile.mutuals : [],
        monetized: (initialProfile.monetized === "yes" || initialProfile.monetized === "true" || initialProfile.monetized === true) &&
                   (!initialProfile.monetized_until || new Date(initialProfile.monetized_until).getTime() > Date.now()),
        suspended_until: initialProfile.suspended_until || null,
      };
    }
    return null;
  });

  const [processingAds, setProcessingAds] = useState<string[]>([]);
  const processingRef = useRef<Set<string>>(new Set());

  const [highlights, setHighlights] = useState<Ad[]>([]);
  const [isMobile, setIsMobile] = useState(false);



  // Sync window size state
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const fetchHighlights = useCallback(async (userInterests: string[]) => {
    if (!userInterests || userInterests.length === 0) return;
    try {
      const interestsQuery = userInterests.join(",");
      const response = await fetch(`/api/highlights?interests=${encodeURIComponent(interestsQuery)}`);
      if (response.ok) {
        const data: any[] = await response.json();
        
        // Filter ONLY Boosted Highlights (is_bidded === true)
        const boosted = (data || []).filter((item: any) => !!item.is_bidded && !item.is_paused);
        
        // Filter by user daily render count limit:
        // Highest bidder (is_highest_bidder === true): limit = 2
        // Regular boosted bidder: limit = 1
        const eligible = boosted.filter((item: any) => {
          const count = item.user_render_count || 0;
          const limit = item.is_highest_bidder ? 2 : 1;
          return count < limit;
        });

        // Map to Ad interface with is_highlight = true
        const hItems = eligible.map((item: any) => ({
          id: item.id,
          is_highlight: true,
          title: item.title,
          ad_content: item.content,
          ad_media: item.image_url,
          interest: [item.interest],
          created_at: item.created_at,
          user_email: item.user_email || "",
          is_highest_bidder: item.is_highest_bidder || false,
          user_render_count: item.user_render_count || 0
        }));

        setHighlights(hItems as any[]);
      }
    } catch (e) {
      console.error("Error fetching highlights for feed:", e);
    }
  }, []);


  const fetchViewerProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setViewerProfile({
          balance: parseFloat(data.balance ?? 0),
          mutual_count: data.mutual_count ?? 0,
          mutuals: Array.isArray(data.mutuals) ? data.mutuals : [],
          monetized: (data.monetized === "yes" || data.monetized === "true" || data.monetized === true) &&
                     (!data.monetized_until || new Date(data.monetized_until).getTime() > Date.now()),
          suspended_until: data.suspended_until || null,
        });

        // Dynamic fetch of highlights for mobile
        if (isMobile) {
          const rawInterest = data.interest;
          const parsedInterests = Array.isArray(rawInterest)
            ? rawInterest
            : typeof rawInterest === "string"
            ? rawInterest.split(",").map((v: string) => v.trim())
            : [];
          fetchHighlights(parsedInterests);
        }
      }
    } catch (e) {
      console.error("Error fetching viewer profile:", e);
    }
  }, [isMobile, fetchHighlights]);

  useEffect(() => {
    if (userEmail) {
      if (!viewerProfile) {
        fetchViewerProfile();
      } else if (isMobile && highlights.length === 0) {
        const rawInterest = initialProfile?.interest;
        const parsedInterests = Array.isArray(rawInterest)
          ? rawInterest
          : typeof rawInterest === "string"
          ? rawInterest.split(",").map((v: string) => v.trim())
          : [];
        if (parsedInterests.length > 0) {
          fetchHighlights(parsedInterests);
        }
      }
    }
  }, [userEmail, viewerProfile, isMobile, highlights.length, fetchViewerProfile, fetchHighlights, initialProfile]);

  const handleShare = (adId: string) => {
    if (typeof window !== "undefined") {
      const encodedId = btoa(adId.toString());
      const shareUrl = `${window.location.origin}/login?view&Earn Ads by Paayh=${encodedId}`;
      navigator.clipboard.writeText(shareUrl)
        .then(() => alert("Ad share link copied to clipboard."))
        .catch((err) => console.error("Failed to copy link:", err));
    }
  };

  const parseToArray = (val: string[] | string | null): string[] => {
    if (!val) return [];
    return Array.isArray(val) ? val : val.split(",").map((v) => v.trim());
  };

  const calculateAge = (dob: string): number => {
    if (!dob) return 0;
    let birthDate: Date;
    if (dob.includes("-")) {
      const parts = dob.split("-").map(Number);
      if (parts[0] > 1000) {
        // YYYY-MM-DD
        const [year, month, day] = parts;
        birthDate = new Date(year, month - 1, day);
      } else {
        // DD-MM-YYYY
        const [day, month, year] = parts;
        birthDate = new Date(year, month - 1, day);
      }
    } else {
      birthDate = new Date(dob);
    }
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const getMatchScore = (
    ad: Ad,
    user: {
      interest: string[];
      industry: string[];
      behavior: string[];
      lifestyle: string[];
      personality: string[];
      country: string | null;
      state: string | null;
      gender: string | null;
      employment: string | null;
      dob: string | null;
      location: string | null;
    }
  ): number => {
    let score = 0;
    const stringMatch = (a: string | null, b: string | null) =>
      a?.toLowerCase() === b?.toLowerCase();

    const hasOverlap = (a: string[], b: string[] | string | null) => {
      if (!a || a.length === 0 || !b) return false;
      const bSet = new Set(parseToArray(b).map((v) => v.toLowerCase()));
      return a.some((val) => bSet.has(val.toLowerCase()));
    };

    if (ad.province && stringMatch(ad.province, user.location)) score += 5;
    else if (ad.state && stringMatch(ad.state, user.state)) score += 4;
    else if (ad.country && stringMatch(ad.country, user.country)) score += 3;

    if (ad.gender && (stringMatch(ad.gender, user.gender) || ad.gender.toLowerCase() === 'both')) score += 2;
    if (ad.employment_status && user.employment) {
      const targetedStatuses = ad.employment_status.split(",").map((s) => s.trim().toLowerCase());
      if (targetedStatuses.includes(user.employment.toLowerCase())) {
        score += 2;
      }
    }

    if (ad.age_range && user.dob) {
      const rangeArr = Array.isArray(ad.age_range)
        ? ad.age_range
        : typeof ad.age_range === "string"
        ? (ad.age_range as string).split(",").map((v) => v.trim())
        : [];
      const [minAge, maxAge] = rangeArr.map(Number);
      const age = calculateAge(user.dob);
      if (age >= minAge && age <= maxAge) score += 3;
    }

    if (hasOverlap(user.interest, ad.interest)) score += 1;
    if (hasOverlap(user.lifestyle, ad.lifestyle)) score += 1;
    if (hasOverlap(user.personality, ad.personality)) score += 1;
    if (hasOverlap(user.behavior, ad.behavior)) score += 1;
    if (hasOverlap(user.industry, ad.industry)) score += 1;

    return score;
  };

  // Dismiss an ad: records impression via RPC then removes it from local feed.
  const handleAdSeen = async (ad: Ad): Promise<boolean> => {
    if (!ad || !ad.id) return false;
    if (ad.user_email && ad.user_email.toLowerCase() === userEmail.toLowerCase()) {
      alert("This is your own ad. Seen action is disabled.");
      return false;
    }
    if (processingRef.current.has(ad.id)) return false;
    processingRef.current.add(ad.id);
    setProcessingAds((prev) => [...prev, ad.id]);
    setSeenAds((prev) => [...prev, ad.id]);
    try {
      const response = await fetch("/api/seen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ adId: ad.id })
      });
      if (!response.ok) throw new Error("Failed to record ad seen via API");
      return true;
    } catch (e) {
      console.error("Error recording ad seen via queue API:", e);
      return false;
    } finally {
      processingRef.current.delete(ad.id);
      setProcessingAds((prev) => prev.filter((id) => id !== ad.id));
    }
  };

  const fetchRelevantAds = useCallback(async (pageNum: number, isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setPage(0);
      setSeenAds([]); // Reset client-side seen ads array on initial load / refresh
    }
    setError(false);

    try {
      let sharedAdPrepend: Ad | null = null;
      if (!isLoadMore && typeof window !== "undefined") {
        const sharedAdId = localStorage.getItem("sharedAdId");
        if (sharedAdId) {
          try {
            const { data, error: fetchErr } = await supabase
              .from("addsactive")
              .select("*")
              .eq("id", sharedAdId)
              .single();
            if (!fetchErr && data) {
              if (!data.completed_at) {
                sharedAdPrepend = data as Ad;
              }
            }
            localStorage.removeItem("sharedAdId");
          } catch (e) {
            console.error("Error fetching shared ad:", e);
          }
        }
      }

      // Fetch paginated ads from secure API route with Redis caching
      const LIMIT = 10;
      const offset = pageNum * LIMIT;
      const refreshParam = pageNum === 0 ? "&refresh=true" : "";
      const response = await fetch(`/api/feed?offset=${offset}&limit=${LIMIT}${refreshParam}`);
      if (!response.ok) {
        throw new Error("Failed to fetch ad feed");
      }
      const data = await response.json();
      const feedAds: Ad[] = data.ads || [];
      const profilesMap = data.profiles || {};

      if (Object.keys(profilesMap).length > 0) {
        setAdvertiserProfiles((prev) => ({ ...prev, ...profilesMap }));
      }

      let finalAds = feedAds;
      if (sharedAdPrepend) {
        finalAds = [sharedAdPrepend, ...feedAds.filter((a: Ad) => a.id !== sharedAdPrepend!.id)];
      }

      if (feedAds.length < LIMIT) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }

      setAds((prev) => isLoadMore ? [...prev, ...finalAds] : finalAds);
      setLoading(false);
      setLoadingMore(false);
    } catch (err) {
      console.error("Error loading feed:", err);
      setError(true);
      setLoading(false);
      setLoadingMore(false);
    }
  }, [userEmail]);

  useEffect(() => {
    fetchRelevantAds(0, false);
  }, [fetchRelevantAds]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRelevantAds(nextPage, true);
  }, [loading, loadingMore, hasMore, page, fetchRelevantAds]);

  // markSeen is an alias kept for prop compatibility
  const markSeen = handleAdSeen;

  const handleAdEarn = async (ad: Ad): Promise<boolean> => {
    if (!ad || !ad.id) return false;
    if (ad.user_email && ad.user_email.toLowerCase() === userEmail.toLowerCase()) {
      alert("This is your own ad. Earning is disabled.");
      return false;
    }
    if (processingRef.current.has(ad.id)) return false;
    processingRef.current.add(ad.id);
    setProcessingAds((prev) => [...prev, ad.id]);

    try {
      const response = await fetch("/api/earn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId: ad.id,
          token: ad.verification_token,
          servedAt: ad.served_at,
          type: "earn",
          turnstileToken: "no-turnstile-script"
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to claim earnings");
      }

      const resData = await response.json();
      const rate = resData.result !== undefined 
        ? parseFloat(resData.result ?? 0) 
        : (ad.cost_per_impression ?? 0.50);

      // Suspension: do NOT dismiss the ad
      if (rate === -1 || rate === -2) {
        alert("Clicking suspended: You are clicking too fast! Clicking is suspended for 2 hours.");
        setViewerProfile((prev) =>
          prev ? { ...prev, suspended_until: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() } : null
        );
        return false;
      }

      setSeenAds((prev) => [...prev, ad.id]);

      if (rate > 0 && viewerProfile) {
        setViewerProfile((prev) => prev ? ({ ...prev, balance: prev.balance + rate }) : null);
      }

      if (viewerProfile && !viewerProfile.monetized) {
        alert("Monetize to start earning.");
      }

      onEarnSuccess?.();
      return true;
    } catch (e: any) {
      console.error("Unexpected error in handleAdEarn:", e);
      alert(e.message || "An unexpected error occurred. Please try again.");
      return false;
    } finally {
      processingRef.current.delete(ad.id);
      setProcessingAds((prev) => prev.filter((id) => id !== ad.id));
    }
  };

  const handleAdMutual = async (ad: Ad): Promise<boolean> => {
    if (!ad || !ad.id || !ad.user_email) return false;
    if (ad.user_email.toLowerCase() === userEmail.toLowerCase()) {
      alert("This is your own ad. You cannot add yourself to mutuals.");
      return false;
    }
    if (viewerProfile && viewerProfile.mutual_count >= 50) {
      alert("⚠️ Mutual Limit Reached\nYou have reached the maximum limit of 50 mutuals.");
      return false;
    }
    if (processingRef.current.has(ad.id)) return false;
    processingRef.current.add(ad.id);
    setProcessingAds((prev) => [...prev, ad.id]);

    const publisherEmail = ad.user_email.toLowerCase();

    try {
      const response = await fetch("/api/earn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId: ad.id,
          token: ad.verification_token,
          servedAt: ad.served_at,
          type: "mutual",
          turnstileToken: "no-turnstile-script"
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to add mutual");
      }

      const resData = await response.json();
      const mutualResult = resData.result !== undefined ? resData.result : 1;

      // Suspension: do NOT dismiss the ad
      if (mutualResult === -1 || mutualResult === -2) {
        alert("Clicking suspended: You are clicking too fast! Clicking is suspended for 2 hours.");
        setViewerProfile((prev) =>
          prev ? { ...prev, suspended_until: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() } : null
        );
        return false;
      }

      setSeenAds((prev) => [...prev, ad.id]);

      if (mutualResult === 1 && viewerProfile) {
        const currentMutuals = viewerProfile.mutuals || [];
        if (!currentMutuals.map((m) => m.toLowerCase()).includes(publisherEmail)) {
          const newMutuals = [...currentMutuals, publisherEmail];
          setViewerProfile((prev) => prev ? ({ ...prev, mutuals: newMutuals, mutual_count: newMutuals.length }) : null);
        }
      }
      onMutualSuccess?.();
      return true;
    } catch (e: any) {
      console.error("Unexpected error in handleAdMutual:", e);
      alert(e.message || "An unexpected error occurred. Please try again.");
      return false;
    } finally {
      processingRef.current.delete(ad.id);
      setProcessingAds((prev) => prev.filter((id) => id !== ad.id));
    }
  };



  const handleDismissAd = useCallback((adId: string) => {
    setAds((prev) => prev.filter((a) => a.id !== adId));
  }, []);

  const parentRef = useRef<HTMLDivElement>(null);
  const displayFeed = useMemo(() => {
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
  }, [ads, highlights, isMobile]);


  const virtualizer = useVirtualizer({
    count: displayFeed.length,
    getScrollElement: () => parentRef.current?.parentElement || null,
    estimateSize: () => 480,
    getItemKey: useCallback((index: number) => displayFeed[index]?.id || index, [displayFeed]),
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (virtualItems.length > 0 && hasMore && !loadingMore && !loading) {
      const lastItemIndex = virtualItems[virtualItems.length - 1].index;
      if (lastItemIndex >= displayFeed.length - 2) {
        loadMore();
      }
    }
  }, [virtualItems, hasMore, loadingMore, loading, displayFeed.length, loadMore]);

  return (
    <div ref={parentRef} className={styles.feedContainer}>
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "1.25rem 1rem" }}>
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ display: "flex", gap: "0.75rem" }}>
              <Skeleton variant="avatar" width={40} height={40} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <Skeleton variant="title" width="40%" height={16} />
                <Skeleton variant="text" width="90%" height={12} />
                <Skeleton variant="text" width="85%" height={12} />
                <Skeleton variant="rect" width="100%" height={220} />
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && error && (
        <p className={styles.error}>Error loading ads.</p>
      )}
      {!loading && !error && ads.length === 0 && (
        <p className={styles.noAds}>No matching ads found for your profile.</p>
      )}

      {!loading && !error && displayFeed.length > 0 && (
        <div 
          className={styles.adGrid}
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const ad = displayFeed[virtualRow.index];
            return (
              <div
                key={ad.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  zIndex: displayFeed.length - virtualRow.index,
                }}
              >
                <AdCard
                  ad={ad}
                  userEmail={userEmail}
                  advertiserProfiles={advertiserProfiles}
                  viewerProfile={viewerProfile}
                  seenAds={seenAds}
                  processingAds={processingAds}
                  onAdEarn={handleAdEarn}
                  onAdMutual={handleAdMutual}
                  onMarkSeen={handleAdSeen}
                  onShare={handleShare}
                  onDismiss={handleDismissAd}
                />
              </div>
            );
          })}
        </div>
      )}

      {loadingMore && (
        <div className={styles.loadMoreContainer}>
          <span className={styles.loadingSpinner}></span>
        </div>
      )}
    </div>
  );
};

export default Feed;