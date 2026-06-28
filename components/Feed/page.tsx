
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
}


const Feed = ({ userEmail }: FeedProps) => {
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
  } | null>(null);

  const [processingAds, setProcessingAds] = useState<string[]>([]);
  const processingRef = useRef<Set<string>>(new Set());

  const [highlights, setHighlights] = useState<Ad[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const pendingTokenResolverRef = useRef<{
    resolve: (token: string) => void;
    reject: (err: any) => void;
  } | null>(null);

  useEffect(() => {
    let checkInterval: NodeJS.Timeout;
    
    const initTurnstile = () => {
      if (typeof window !== "undefined" && (window as any).turnstile && turnstileContainerRef.current) {
        try {
          turnstileWidgetIdRef.current = (window as any).turnstile.render(turnstileContainerRef.current, {
            sitekey: process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
            size: "invisible",
            appearance: "interaction-only",
            callback: (token: string) => {
              if (pendingTokenResolverRef.current) {
                pendingTokenResolverRef.current.resolve(token);
                pendingTokenResolverRef.current = null;
              }
            },
            "error-callback": (err: any) => {
              console.error("Turnstile challenge error callback:", err);
              if (pendingTokenResolverRef.current) {
                pendingTokenResolverRef.current.reject(new Error("Security check failed"));
                pendingTokenResolverRef.current = null;
              }
            },
            "expired-callback": () => {
              if (turnstileWidgetIdRef.current) {
                (window as any).turnstile.reset(turnstileWidgetIdRef.current);
              }
            }
          });
        } catch (e) {
          console.error("Error rendering Turnstile widget:", e);
        }
      }
    };

    if (typeof window !== "undefined") {
      if ((window as any).turnstile) {
        initTurnstile();
      } else {
        checkInterval = setInterval(() => {
          if ((window as any).turnstile) {
            initTurnstile();
            clearInterval(checkInterval);
          }
        }, 500);
      }
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, []);

  const getFreshTurnstileToken = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !(window as any).turnstile || !turnstileWidgetIdRef.current) {
        resolve("no-turnstile-script");
        return;
      }

      (window as any).turnstile.reset(turnstileWidgetIdRef.current);
      
      pendingTokenResolverRef.current = { resolve, reject };

      try {
        (window as any).turnstile.execute(turnstileWidgetIdRef.current);
      } catch (err) {
        console.error("Error executing Turnstile widget:", err);
        pendingTokenResolverRef.current = null;
        resolve("no-turnstile-script");
      }
    });
  };

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
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    try {
      const { data, error } = await supabase
        .from("newsactive")
        .select("id, title, content, image_url, interest, created_at")
        .in("interest", userInterests)
        .gte("created_at", yesterday)
        .order("created_at", { ascending: false });
      if (!error && data) {
        const hItems = data.map((item: any) => ({
          id: item.id,
          is_highlight: true,
          title: item.title,
          ad_content: item.content,
          ad_media: item.image_url,
          interest: [item.interest],
          created_at: item.created_at,
          user_email: ""
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
      fetchViewerProfile();
    }
  }, [userEmail, fetchViewerProfile]);

  const handleShare = (adId: string) => {
    if (typeof window !== "undefined") {
      const encodedId = btoa(adId.toString());
      const shareUrl = `${window.location.origin}/login?view&Earn Ads by Xea=${encodedId}`;
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
      const bArr = parseToArray(b);
      return a.some((val) =>
        bArr.map((v) => v.toLowerCase()).includes(val.toLowerCase())
      );
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
    setSeenAds((prev) => [...prev, ad.id]);
    try {
      const { error } = await supabase.rpc("record_ad_seen", {
        p_ad_id: ad.id,
        p_user_email: userEmail.toLowerCase(),
      });
      if (error) throw error;
      return true;
    } catch (e) {
      console.error("Error recording ad seen:", e);
      return false;
    }
  };

  const fetchRelevantAds = useCallback(async (pageNum: number, isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setPage(0);
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

      // Fetch pre-filtered and signed ads from secure API route
      const response = await fetch(`/api/feed`);
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

      const LIMIT = 10;
      const offset = pageNum * LIMIT;
      const paginatedAds = finalAds.slice(offset, offset + LIMIT);

      if (offset + LIMIT >= finalAds.length) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }

      setAds((prev) => isLoadMore ? [...prev, ...paginatedAds] : paginatedAds);
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

  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRelevantAds(nextPage, true);
  };

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
      const turnstileToken = await getFreshTurnstileToken();

      const response = await fetch("/api/earn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId: ad.id,
          token: ad.verification_token,
          servedAt: ad.served_at,
          type: "earn",
          turnstileToken: turnstileToken
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to claim earnings");
      }

      const { result: creditResult } = await response.json();
      const rate = parseFloat(creditResult ?? 0);

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
      const turnstileToken = await getFreshTurnstileToken();

      const response = await fetch("/api/earn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId: ad.id,
          token: ad.verification_token,
          servedAt: ad.served_at,
          type: "mutual",
          turnstileToken: turnstileToken
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to add mutual");
      }

      const { result: mutualResult } = await response.json();

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
    const combined = [...ads, ...highlights];
    return combined.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }, [ads, highlights, isMobile]);

  const virtualizer = useVirtualizer({
    count: displayFeed.length,
    getScrollElement: () => parentRef.current?.parentElement || null,
    estimateSize: () => 350,
    overscan: 5,
  });

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

      {hasMore && ads.length > 0 && (
        <div className={styles.loadMoreContainer}>
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className={styles.loadMoreBtn}
          >
            {loadingMore ? <span className={styles.loadingSpinner}></span> : "Load More"}
          </button>
        </div>
      )}
      <div ref={turnstileContainerRef} style={{ width: 0, height: 0, overflow: "hidden", position: "absolute" }} />
    </div>
  );
};

export default Feed;
