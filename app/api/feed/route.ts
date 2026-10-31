import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { getCachedProfile } from "@/lib/utils/cache";
import { Ad, AdvertiserProfile } from "@/types/ads";
import { checkRateLimit } from "@/lib/edgeRateLimit";
import {
  evaluateAdTargeting,
  rankAndFilterTargetedAds,
  signAdImpressionToken,
  ViewerTargetingProfile,
} from "@/lib/targetingEngine";

export const dynamic = "force-dynamic";

// Optimized TTLs for high-scalability candidate ID caching
const USER_FEED_IDS_TTL_SECONDS = 600; // 10 minutes TTL for candidate ID pool
const AD_DETAIL_TTL_SECONDS = 1800;    // 30 minutes TTL for shared ad details
const L1_USER_FEED_TTL_MS = 120 * 1000; // 2 minutes L1 fallback cache (absorbs repeat fetches even when Redis is over quota)
const L1_SHARED_ADS_POOL_TTL_MS = 25 * 1000; // 25s shared active campaign pool

const AD_SELECT_FIELDS = "id, user_email, ad_media, ad_media_type, ad_content, ad_type, product_name, product_price, product_cta_type, product_cta_link, action_phone, action_whatsapp, action_email, action_website, action_ios, action_android, action_watch_now, ad_action_buttons, cost_per_impression, display_mutual_button, mutual_targets, mutual_adds_count, interest, industry, behavior, lifestyle, personality, country, state, province, gender, employment_status, age_range, targeting_all, is_paused, is_admin_post, user_frequency_cap, campaign_days, impressions, impression_count, completed_at, created_at, is_ai_content";

// Circuit breaker when DB RPC get_user_feed has a return-type mismatch (avoids wasted 500ms roundtrip per request)
let rpcGetFeedBrokenUntil = 0;

// L1 Shared Active Campaigns Pool by normalized country key (Single-Flight Coalesced)
const l1SharedCampaignsPool = new Map<string, { ads: any[]; expiresAt: number }>();
const inFlightCampaignPoolPromises = new Map<string, Promise<any[]>>();

// L1 Shared Ad Detail Map & Publisher Profile Map
const l1AdDetailsCache = new Map<string, { ad: Ad; expiresAt: number }>();
const l1PublisherProfilesCache = new Map<string, { profile: AdvertiserProfile; expiresAt: number }>();

// L1 Per-User Candidate Feed Cache (prevents repeated DB scans when candidateAdIds is empty or Redis is in quota cooldown)
interface L1UserFeedEntry {
  adIds: string[];
  profilesMap: Record<string, AdvertiserProfile>;
  expiresAt: number;
}
const l1UserFeedCache = new Map<string, L1UserFeedEntry>();
const MAX_L1_USER_FEEDS = 3000;

function setL1UserFeed(emailKey: string, adIds: string[], profilesMap: Record<string, AdvertiserProfile>) {
  if (l1UserFeedCache.size >= MAX_L1_USER_FEEDS && !l1UserFeedCache.has(emailKey)) {
    const firstKey = l1UserFeedCache.keys().next().value;
    if (firstKey) l1UserFeedCache.delete(firstKey);
  }
  l1UserFeedCache.set(emailKey, {
    adIds,
    profilesMap,
    expiresAt: Date.now() + L1_USER_FEED_TTL_MS,
  });
}

/**
 * Single-Flight Loader for Active Unpaused Campaigns by Country Slice.
 * Collapses thousands of concurrent user feed refreshes into 1 indexed DB query per 25 seconds.
 */
async function loadSharedActiveAdsForCountry(viewerCountryRaw: string): Promise<any[]> {
  const cleanCountry = (viewerCountryRaw || "").trim();
  const poolKey =
    cleanCountry && cleanCountry.toUpperCase() !== "PLACEHOLDER"
      ? cleanCountry.toLowerCase()
      : "__global__";

  const cachedPool = l1SharedCampaignsPool.get(poolKey);
  if (cachedPool && Date.now() < cachedPool.expiresAt) {
    return cachedPool.ads;
  }

  const existingPromise = inFlightCampaignPoolPromises.get(poolKey);
  if (existingPromise) {
    return existingPromise;
  }

  const fetchPromise = (async () => {
    try {
      let query = supabaseReadOnly
        .from("addsactive")
        .select(AD_SELECT_FIELDS)
        .is("completed_at", null)
        .or("is_paused.is.null,is_paused.eq.false");

      if (poolKey !== "__global__") {
        const safeCountry = cleanCountry.replace(/[,()]/g, "");
        query = query.or(
          `targeting_all.eq.true,is_admin_post.eq.true,country.is.null,country.eq.,country.ilike.%${safeCountry}%,country.ilike.%all%`
        );
      }

      const { data: fallbackAds } = await query
        .order("cost_per_impression", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(250);

      const rows = fallbackAds || [];
      l1SharedCampaignsPool.set(poolKey, {
        ads: rows,
        expiresAt: Date.now() + L1_SHARED_ADS_POOL_TTL_MS,
      });

      const detailExp = Date.now() + AD_DETAIL_TTL_SECONDS * 1000;
      rows.forEach((ad: any) => {
        if (ad?.id) {
          l1AdDetailsCache.set(ad.id, { ad, expiresAt: detailExp });
        }
      });

      return rows;
    } finally {
      inFlightCampaignPoolPromises.delete(poolKey);
    }
  })();

  inFlightCampaignPoolPromises.set(poolKey, fetchPromise);
  return fetchPromise;
}

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "true";

    // Rate limit feed fetches: Stricter cap of 8 refreshes/min with 6-hour lockout penalty on violation
    const rateLimit = await checkRateLimit(req, {
      limit: refresh ? 8 : 45,
      windowSeconds: 60,
      identifierPrefix: refresh ? "feed_refresh" : "feed_paginate",
      blockDurationSeconds: refresh ? 21600 : undefined,
    });

    if (!rateLimit.allowed) {
      return rateLimit.response!;
    }

    const now = new Date();
    const servedAt = Date.now();

    const limit = parseInt(searchParams.get("limit") || "15", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const sharedAdId = searchParams.get("sharedAdId");

    const emailKey = email.toLowerCase().trim();
    const adIdsCacheKey = `feed:ad_ids:${emailKey}`;
    const legacyAdsCacheKey = `feed:ads:${emailKey}`;
    const profilesCacheKey = `feed:profiles:${emailKey}`;
    const viewerProfileCacheKey = `user:profile:${emailKey}`;
    const seenAdsSetKey = `seen:ads:${emailKey}`;

    const blockedAdsSetKey = `blocked:ads:${emailKey}`;
    const blockedAdvertisersSetKey = `blocked:advertisers:${emailKey}`;

    let pageAds: Ad[] = [];
    let profilesMap: Record<string, AdvertiserProfile> = {};
    let cacheHit = false;

    const todayDate = now.toISOString().slice(0, 10);
    const pacingHashKey = `user:pacing:${emailKey}:${todayDate}`;
    const lastViewedHashKey = `user:last_viewed:${emailKey}`;
    const RETARGET_MIN_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours minimum gap between retargeted views

    // Check L1 profile cache first (<0.05ms)
    let viewerProfile: ViewerTargetingProfile | null = await getCachedProfile<ViewerTargetingProfile>(emailKey);

    let cachedAdIdsStr: string | null = null;
    let cachedProfilesStr: string | null = null;
    let seenAdIdsList: string[] = [];
    let blockedAdIdsList: string[] = [];
    let blockedAdvertisersList: string[] = [];
    let todayPacingMap: Record<string, string> = {};
    let todayFreqMap: Record<string, string> = {};
    let lifetimeFreqMap: Record<string, string> = {};
    let cachedViewerProfileStr: string | null = null;
    let lastViewedMap: Record<string, string> = {};

    // Check L1 per-user feed cache before network call when not refreshing
    if (!refresh) {
      const l1Feed = l1UserFeedCache.get(emailKey);
      if (l1Feed && Date.now() < l1Feed.expiresAt) {
        cachedAdIdsStr = JSON.stringify(l1Feed.adIds);
        cachedProfilesStr = JSON.stringify(l1Feed.profilesMap);
      }
    }

    // Pipeline Redis lookups only when Redis is online and under quota
    if (isRedisReady()) {
      const redisPipe = redisConnection.pipeline();
      const needRedisFeedCache = !refresh && (!cachedAdIdsStr || !cachedProfilesStr);
      if (needRedisFeedCache) {
        redisPipe.get(adIdsCacheKey);
        redisPipe.get(profilesCacheKey);
      }
      redisPipe.smembers(seenAdsSetKey);
      redisPipe.smembers(blockedAdsSetKey);
      redisPipe.smembers(blockedAdvertisersSetKey);
      redisPipe.hgetall(pacingHashKey);
      redisPipe.hgetall(`user:freq:${emailKey}:${todayDate}`);
      redisPipe.hgetall(`user:freq_lifetime:${emailKey}`);
      if (!viewerProfile) {
        redisPipe.get(viewerProfileCacheKey);
      }
      redisPipe.hgetall(lastViewedHashKey);

      const redisResultsRaw = await redisPipe.exec().catch(() => []);

      if (Array.isArray(redisResultsRaw) && redisResultsRaw.length > 0) {
        let offsetIdx = 0;
        if (needRedisFeedCache) {
          cachedAdIdsStr = (redisResultsRaw[0]?.[1] as string | null) || cachedAdIdsStr;
          cachedProfilesStr = (redisResultsRaw[1]?.[1] as string | null) || cachedProfilesStr;
          offsetIdx = 2;
        }
        seenAdIdsList = (redisResultsRaw[offsetIdx]?.[1] as string[]) || [];
        blockedAdIdsList = (redisResultsRaw[offsetIdx + 1]?.[1] as string[]) || [];
        blockedAdvertisersList = (redisResultsRaw[offsetIdx + 2]?.[1] as string[]) || [];
        todayPacingMap = (redisResultsRaw[offsetIdx + 3]?.[1] as Record<string, string>) || {};
        todayFreqMap = (redisResultsRaw[offsetIdx + 4]?.[1] as Record<string, string>) || {};
        lifetimeFreqMap = (redisResultsRaw[offsetIdx + 5]?.[1] as Record<string, string>) || {};
        if (!viewerProfile) {
          cachedViewerProfileStr = (redisResultsRaw[offsetIdx + 6]?.[1] as string | null) || null;
          lastViewedMap = (redisResultsRaw[offsetIdx + 7]?.[1] as Record<string, string>) || {};
        } else {
          lastViewedMap = (redisResultsRaw[offsetIdx + 6]?.[1] as Record<string, string>) || {};
        }
      }
    }

    if (!viewerProfile && cachedViewerProfileStr) {
      try {
        viewerProfile = JSON.parse(cachedViewerProfileStr);
      } catch {}
    }

    const userImpressionMap = new Map<string, { view_count: number; today_view_count: number; last_viewed_at: string | null }>();
    const completedOrCappedAdIds: string[] = [];

    // 1. Populate frequency counters directly from in-memory Redis hashes (O(1) lookup)
    Object.entries(lifetimeFreqMap).forEach(([adId, countStr]) => {
      userImpressionMap.set(adId, {
        view_count: Number(countStr) || 0,
        today_view_count: Number(todayFreqMap[adId]) || 0,
        last_viewed_at: lastViewedMap[adId] || null,
      });
    });

    // 2. If Redis frequency counters are cold and we don't already have an empty L1 feed hit, hydrate once from DB (bounded to latest 1000)
    const isInstantEmptyL1Hit = !refresh && cachedAdIdsStr === "[]";
    if (userImpressionMap.size === 0 && !isInstantEmptyL1Hit) {
      try {
        const { data: dbImpressions } = await supabaseReadOnly
          .from("ad_impressions")
          .select("ad_id, view_count, today_view_count, last_viewed_at")
          .eq("user_email", emailKey)
          .order("last_viewed_at", { ascending: false })
          .limit(1000);

        if (dbImpressions && dbImpressions.length > 0) {
          const backfillPipe = isRedisReady() ? redisConnection.pipeline() : null;
          dbImpressions.forEach((imp: any) => {
            if (imp.ad_id) {
              userImpressionMap.set(imp.ad_id, {
                view_count: Number(imp.view_count || 0),
                today_view_count: Number(imp.today_view_count || 0),
                last_viewed_at: imp.last_viewed_at,
              });
              if (backfillPipe) {
                backfillPipe.hset(`user:freq_lifetime:${emailKey}`, imp.ad_id, String(imp.view_count || 1));
                if (imp.last_viewed_at) {
                  backfillPipe.hset(lastViewedHashKey, imp.ad_id, imp.last_viewed_at);
                }
                if (imp.today_view_count && imp.last_viewed_at && imp.last_viewed_at.slice(0, 10) === todayDate) {
                  backfillPipe.hset(`user:freq:${emailKey}:${todayDate}`, imp.ad_id, String(imp.today_view_count));
                }
              }
            }
          });
          if (backfillPipe) {
            backfillPipe.expire(`user:freq_lifetime:${emailKey}`, 86400 * 30);
            backfillPipe.expire(lastViewedHashKey, 86400 * 30);
            backfillPipe.expire(`user:freq:${emailKey}:${todayDate}`, 86400 * 2);
            backfillPipe.exec().catch(() => {});
          }
        }
      } catch {}
    }

    const seenAdIdsSet = new Set<string>(seenAdIdsList);
    const blockedAdIdsSet = new Set<string>(blockedAdIdsList);
    const blockedAdvertisersSet = new Set<string>(blockedAdvertisersList.map((e) => e.toLowerCase()));

    // Try to retrieve cached candidate ad IDs and profiles unless refresh is requested
    if (!refresh && cachedAdIdsStr && cachedProfilesStr) {
      try {
        const cachedAdIds: string[] = JSON.parse(cachedAdIdsStr);
        profilesMap = JSON.parse(cachedProfilesStr);

        // Filter out ads already seen or blocked by the user in this session & preserve single-fetch uniqueness
        const uniqueCachedIds = Array.from(new Set(cachedAdIds));
        const seenOrBlockedBeforeOffset = uniqueCachedIds
          .slice(0, offset)
          .filter((id) => seenAdIdsSet.has(id) || blockedAdIdsSet.has(id)).length;
        const effectiveOffset = Math.max(0, offset - seenOrBlockedBeforeOffset);

        const eligibleIds = uniqueCachedIds.filter(
          (id) => !seenAdIdsSet.has(id) && !blockedAdIdsSet.has(id)
        );

        // Extract slice of IDs for the requested page without skipping unseen ads
        const slicedIds = eligibleIds.slice(effectiveOffset, effectiveOffset + limit);

        if (slicedIds.length > 0) {
          const fetchedDetailsMap: Record<string, Ad> = {};
          const redisLookupIds: string[] = [];

          // 1. Check L1 Ad Details Cache first (0ms)
          for (const adId of slicedIds) {
            const l1Detail = l1AdDetailsCache.get(adId);
            if (l1Detail && Date.now() < l1Detail.expiresAt) {
              const adDetail = l1Detail.ad;
              if (!adDetail.user_email || !blockedAdvertisersSet.has(adDetail.user_email.toLowerCase())) {
                fetchedDetailsMap[adId] = adDetail;
              }
            } else {
              redisLookupIds.push(adId);
            }
          }

          // 2. Check L2 Redis for any IDs not in L1
          const missingIds: string[] = [];
          if (redisLookupIds.length > 0 && isRedisReady()) {
            const detailKeys = redisLookupIds.map((id) => `ad:detail:${id}`);
            const cachedDetailsRaw = await redisConnection.mget(detailKeys);
            cachedDetailsRaw.forEach((raw, idx) => {
              const adId = redisLookupIds[idx];
              if (raw) {
                try {
                  const adDetail: Ad = JSON.parse(raw);
                  l1AdDetailsCache.set(adId, { ad: adDetail, expiresAt: Date.now() + AD_DETAIL_TTL_SECONDS * 1000 });
                  if (adDetail.user_email && blockedAdvertisersSet.has(adDetail.user_email.toLowerCase())) {
                    return;
                  }
                  fetchedDetailsMap[adId] = adDetail;
                } catch {
                  missingIds.push(adId);
                }
              } else {
                missingIds.push(adId);
              }
            });
          } else {
            missingIds.push(...redisLookupIds);
          }

          // 3. Backfill missing ad details from Supabase if evicted from L1 & L2
          if (missingIds.length > 0) {
            const { data: dbMissing, error: dbErr } = await supabaseReadOnly
              .from("addsactive")
              .select(AD_SELECT_FIELDS)
              .in("id", missingIds);

            if (!dbErr && dbMissing) {
              const pipeline = isRedisReady() ? redisConnection.pipeline() : null;
              dbMissing.forEach((ad: any) => {
                l1AdDetailsCache.set(ad.id, { ad, expiresAt: Date.now() + AD_DETAIL_TTL_SECONDS * 1000 });
                if (ad.user_email && blockedAdvertisersSet.has(ad.user_email.toLowerCase())) {
                  return;
                }
                fetchedDetailsMap[ad.id] = ad;
                if (pipeline) {
                  pipeline.set(`ad:detail:${ad.id}`, JSON.stringify(ad), "EX", AD_DETAIL_TTL_SECONDS);
                }
              });
              if (pipeline) {
                pipeline.exec().catch(() => {});
              }
            }
          }

          pageAds = slicedIds
            .map((id) => fetchedDetailsMap[id])
            .filter(Boolean)
            .filter((ad: Ad) => {
              if ((ad as any).is_paused === true || ad.completed_at) return false;
              const impressionsTarget = Number(ad.impressions || 0);
              const impressionCount = Number(ad.impression_count ?? ad.view_count ?? 0);
              if (impressionsTarget > 0 && impressionCount >= impressionsTarget) return false;

              if (viewerProfile) {
                const check = evaluateAdTargeting(ad as any, { ...viewerProfile, email: emailKey }, { allowRolloverPsychographics: true });
                if (!check.matches) return false;
              }
              const userCap = Math.max(1, Number(ad.user_frequency_cap || 1));
              const imp = userImpressionMap.get(ad.id);
              const totalViews = Math.max(imp?.view_count || 0, seenAdIdsSet.has(ad.id) ? userCap : 0);
              if (totalViews >= userCap) return false;

              if (totalViews > 0 && imp?.last_viewed_at) {
                const lastViewedMs = new Date(imp.last_viewed_at).getTime();
                if (!isNaN(lastViewedMs) && now.getTime() - lastViewedMs < RETARGET_MIN_COOLDOWN_MS) {
                  return false;
                }
              }
              return true;
            });
        }

        cacheHit = true;
      } catch (err: any) {
        console.error("❌ Cache read error in feed route:", err.message || err);
      }
    }

    if (!cacheHit) {
      // Resolve viewer profile (L1/L2 cached or DB fallback)
      if (!viewerProfile) {
        const { data: dbUser } = await supabaseReadOnly
          .from("users")
          .select("email, dob, country, state, location, gender, employment, employment_status, interest, lifestyle, behavior, personality, industry")
          .ilike("email", emailKey)
          .maybeSingle();
        viewerProfile = (dbUser as ViewerTargetingProfile) || { email: emailKey };
      } else {
        viewerProfile = { ...viewerProfile, email: emailKey };
      }

      let rawAds: any[] = [];

      // Only attempt RPC get_user_feed if not in schema-mismatch circuit-breaker cooldown
      if (Date.now() >= rpcGetFeedBrokenUntil) {
        const rpcRes = await supabaseReadOnly.rpc("get_user_feed", {
          p_user_email: email,
          p_limit: 100,
          p_offset: 0,
        });
        if (rpcRes.error) {
          // Trip 30-minute circuit breaker so we don't waste a 500ms round-trip on every subsequent request
          rpcGetFeedBrokenUntil = Date.now() + 30 * 60 * 1000;
          console.warn("⚠️ RPC get_user_feed schema mismatch (circuit-breaker active for 30m); using indexed addsactive pool.");
        } else if (rpcRes.data && rpcRes.data.length > 0) {
          rawAds = rpcRes.data;
        }
      }

      // Fast Single-Flight Shared Active Campaign Pool (1 DB query per 25s across all users in country)
      if (rawAds.length === 0) {
        rawAds = await loadSharedActiveAdsForCountry(viewerProfile?.country || "");
      }

      // Enforce accurate demographic, geographic (country + state/province), employment, and psychographic targeting
      const ads = rankAndFilterTargetedAds(rawAds, { ...viewerProfile, email: emailKey }, {
        minResults: 15,
        seenAdIds: seenAdIdsSet,
      });

      // Filter active ads and enforce single-fetch uniqueness + hard frequency caps + retargeting spacing
      const freshAdsList: Ad[] = [];
      const retargetedAdsList: Ad[] = [];
      const seenCandidateIds = new Set<string>();

      (ads || []).forEach((ad: any) => {
        if (!ad || !ad.id || seenCandidateIds.has(ad.id)) return;
        if (ad.completed_at || ad.is_paused === true) return;
        if (blockedAdIdsSet.has(ad.id)) return;
        if (ad.user_email && blockedAdvertisersSet.has(ad.user_email.toLowerCase())) return;

        const impressionsTarget = Number(ad.impressions || 0);
        const impressionCount = Number(ad.impression_count ?? ad.view_count ?? 0);

        if (impressionsTarget > 0 && impressionCount >= impressionsTarget) {
          return;
        }

        const userCap = Math.max(1, Number(ad.user_frequency_cap || 1));
        const imp = userImpressionMap.get(ad.id);
        const totalViews = Math.max(imp?.view_count || 0, seenAdIdsSet.has(ad.id) ? userCap : 0);

        if (totalViews >= userCap) {
          completedOrCappedAdIds.push(ad.id);
          return;
        }

        const campaignDays = Number(ad.campaign_days || 1);
        const dailyUserCap = Math.max(1, Math.ceil(userCap / Math.max(campaignDays, 1)));
        const isToday = imp?.last_viewed_at && imp.last_viewed_at.slice(0, 10) === todayDate;
        const viewsToday = Math.max(
          Number((todayPacingMap as Record<string, string>)[ad.id] || 0),
          isToday ? (imp?.today_view_count || 0) : 0
        );

        if (totalViews > 0) {
          if (viewsToday >= dailyUserCap) {
            return;
          }
          if (imp?.last_viewed_at) {
            const lastViewedMs = new Date(imp.last_viewed_at).getTime();
            if (!isNaN(lastViewedMs) && now.getTime() - lastViewedMs < RETARGET_MIN_COOLDOWN_MS) {
              return;
            }
          }
        }

        const createdAt = ad.created_at ? new Date(ad.created_at).getTime() : now.getTime();
        const diffDays = (now.getTime() - createdAt) / (1000 * 60 * 60 * 24);
        const isRollover = diffDays > campaignDays && impressionsTarget > 0 && impressionCount < impressionsTarget;
        ad.is_rollover = isRollover;

        const isPlatformFreeAd = (!ad.cost_per_impression || Number(ad.cost_per_impression) === 0) && impressionsTarget === 0;
        if (isPlatformFreeAd && diffDays > campaignDays) {
          return;
        }

        seenCandidateIds.add(ad.id);
        if (totalViews > 0) {
          retargetedAdsList.push(ad);
        } else {
          freshAdsList.push(ad);
        }
      });

      // Well-spaced retargeting: interleave at most 1 retargeted ad after every 3 fresh ads
      const candidateAds: Ad[] = [];
      let fIdx = 0;
      let rIdx = 0;
      while (fIdx < freshAdsList.length || rIdx < retargetedAdsList.length) {
        for (let i = 0; i < 3 && fIdx < freshAdsList.length; i++) {
          candidateAds.push(freshAdsList[fIdx++]);
        }
        if (rIdx < retargetedAdsList.length) {
          candidateAds.push(retargetedAdsList[rIdx++]);
        }
      }

      // Google Enterprise Tiered Priority Interleaver
      const biddedTier: Ad[] = [];
      const standardTier: Ad[] = [];

      candidateAds.forEach((ad: Ad) => {
        const isBiddedAd = (ad as any).is_bidded || ((ad as any).bid_price && Number((ad as any).bid_price) > Number(ad.cost_per_impression || 0));
        if (isBiddedAd) {
          biddedTier.push(ad);
        } else {
          standardTier.push(ad);
        }
      });

      const interleavedAds: Ad[] = [];
      let bIdx = 0;
      let sIdx = 0;

      while (bIdx < biddedTier.length || sIdx < standardTier.length) {
        for (let k = 0; k < 3 && bIdx < biddedTier.length; k++) {
          const candidate = biddedTier[bIdx++];
          if (interleavedAds.length > 0 && interleavedAds[interleavedAds.length - 1].user_email === candidate.user_email && bIdx < biddedTier.length) {
            const nextCandidate = biddedTier[bIdx];
            biddedTier[bIdx] = candidate;
            interleavedAds.push(nextCandidate);
            bIdx++;
          } else {
            interleavedAds.push(candidate);
          }
        }

        if (sIdx < standardTier.length) {
          interleavedAds.push(standardTier[sIdx++]);
        }
      }

      const orderedCandidateAds = interleavedAds;
      const candidateAdIds = orderedCandidateAds.map((a: Ad) => a.id);

      // Extract publisher emails and resolve from L1 cache before querying Supabase
      const publisherEmails = Array.from(
        new Set(orderedCandidateAds.map((ad: Ad) => ad.user_email).filter(Boolean))
      ) as string[];

      const missingPublisherEmails: string[] = [];
      for (const pubEmail of publisherEmails) {
        const lower = pubEmail.toLowerCase();
        const cachedPub = l1PublisherProfilesCache.get(lower);
        if (cachedPub && Date.now() < cachedPub.expiresAt) {
          profilesMap[lower] = cachedPub.profile;
        } else {
          missingPublisherEmails.push(pubEmail);
        }
      }

      if (missingPublisherEmails.length > 0) {
        const { data: profiles, error: profilesError } = await supabaseReadOnly
          .from("users")
          .select('email, username, business_name, "firstName", "lastName", "profileImage", gender, bio, location, country, created_at, monetized')
          .in("email", missingPublisherEmails);

        if (!profilesError && profiles) {
          const pubExp = Date.now() + 5 * 60 * 1000;
          profiles.forEach((p: any) => {
            if (p.email) {
              const lower = p.email.toLowerCase();
              const formatted: AdvertiserProfile = {
                email: p.email,
                username: p.username || "",
                business_name: p.business_name || "",
                firstName: p.firstName || "",
                lastName: p.lastName || "",
                profileImage: p.profileImage || "",
                gender: p.gender || "",
                bio: p.bio || "",
                location: p.location || "",
                country: p.country || "",
                created_at: p.created_at || "",
                monetized: p.monetized === true || p.monetized === "true" || p.monetized === "yes",
              };
              profilesMap[lower] = formatted;
              l1PublisherProfilesCache.set(lower, { profile: formatted, expiresAt: pubExp });
            }
          });
        }
      }

      // Always store in L1 per-user cache (even if candidateAdIds is empty `[]`) so repeat calls resolve in 0ms
      setL1UserFeed(emailKey, candidateAdIds, profilesMap);

      const detailExp = Date.now() + AD_DETAIL_TTL_SECONDS * 1000;
      orderedCandidateAds.forEach((ad: Ad) => {
        l1AdDetailsCache.set(ad.id, { ad, expiresAt: detailExp });
      });

      // Store in L2 Redis via a Single Atomic Pipeline when Redis is online
      if (isRedisReady()) {
        try {
          const pipeline = redisConnection.pipeline();
          pipeline.set(adIdsCacheKey, JSON.stringify(candidateAdIds), "EX", USER_FEED_IDS_TTL_SECONDS);
          pipeline.set(profilesCacheKey, JSON.stringify(profilesMap), "EX", USER_FEED_IDS_TTL_SECONDS);
          pipeline.del(legacyAdsCacheKey);

          if (completedOrCappedAdIds.length > 0) {
            pipeline.sadd(seenAdsSetKey, ...completedOrCappedAdIds);
            pipeline.expire(seenAdsSetKey, 86400 * 30);
          }

          orderedCandidateAds.forEach((ad: Ad) => {
            pipeline.set(`ad:detail:${ad.id}`, JSON.stringify(ad), "EX", AD_DETAIL_TTL_SECONDS);
          });

          await pipeline.exec();
        } catch {}
      }

      pageAds = orderedCandidateAds.slice(offset, offset + limit);
    }

    // Server-side Shared Ad Resolution (Zero Client Waterfall)
    if (sharedAdId && offset === 0) {
      try {
        const l1Shared = l1AdDetailsCache.get(sharedAdId);
        let sharedAd: Ad | null = l1Shared && Date.now() < l1Shared.expiresAt ? l1Shared.ad : null;

        if (!sharedAd && isRedisReady()) {
          const cachedRaw = await redisConnection.get(`ad:detail:${sharedAdId}`);
          if (cachedRaw) sharedAd = JSON.parse(cachedRaw);
        }

        if (!sharedAd) {
          const { data: sharedDb } = await supabaseReadOnly
            .from("addsactive")
            .select(AD_SELECT_FIELDS)
            .eq("id", sharedAdId)
            .maybeSingle();

          if (sharedDb && !sharedDb.completed_at) {
            sharedAd = sharedDb as Ad;
            l1AdDetailsCache.set(sharedAd.id, { ad: sharedAd, expiresAt: Date.now() + AD_DETAIL_TTL_SECONDS * 1000 });
            if (isRedisReady()) {
              redisConnection.set(`ad:detail:${sharedAd.id}`, JSON.stringify(sharedAd), "EX", AD_DETAIL_TTL_SECONDS).catch(() => {});
            }
          }
        }

        if (sharedAd && !pageAds.some((a) => a.id === sharedAd!.id)) {
          pageAds.unshift(sharedAd);
        }
      } catch (sErr) {
        console.error("❌ Error resolving shared ad on server:", sErr);
      }
    }

    // Sign each ad in the page slice using unified signAdImpressionToken for deterministic verification
    const signedAds = pageAds.map((ad: Ad) => {
      const isPlatformPost = Boolean(
        ad.is_admin_post ||
        isAdminEmail(ad.user_email || (ad as any).email) ||
        !ad.cost_per_impression ||
        Number(ad.cost_per_impression) <= 0 ||
        !ad.impressions ||
        Number(ad.impressions) <= 0
      );
      const token = signAdImpressionToken(String(ad.id), emailKey, servedAt);
      return {
        ...ad,
        is_admin_post: isPlatformPost,
        cost_per_impression: isPlatformPost ? 0 : Number(ad.cost_per_impression || 0),
        impressions: isPlatformPost ? 0 : Number(ad.impressions || 0),
        _token: token,
        _served_at: servedAt,
        verification_token: token,
        served_at: servedAt,
      };
    });

    return NextResponse.json(
      { ads: signedAds, profiles: profilesMap },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/feed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
