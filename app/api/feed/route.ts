import { transformMediaUrlsToCdn } from "@/lib/utils/cdnUrl";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import { isExemptFromBarriersAndInactivity } from "../../../lib/adminHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { getCachedProfile } from "@/lib/utils/cache";
import { Ad, AdvertiserProfile } from "@/types/ads";
import { checkRateLimit } from "@/lib/edgeRateLimit";
import {
  computeCampaignBroadeningPlan,
  evaluateAdTargeting,
  signAdImpressionToken,
  ViewerTargetingProfile,
} from "@/lib/targetingEngine";
import {
  AD_DETAIL_TTL_SECONDS,
  AD_SELECT_FIELDS,
  AD_SELECT_FIELDS_FALLBACK,
  USER_FEED_IDS_TTL_SECONDS,
  hasViewerLocationEnabled,
  l1AdDetailsCache,
  l1UserFeedCache,
  setL1UserFeed,
} from "../../../lib/feed/feedCaches";
import { hydratePublisherProfiles, loadSharedActiveAdsForCountry } from "../../../lib/feed/poolLoader";
import { buildOrderedCandidateFeed, UserImpressionInfo } from "../../../lib/feed/feedRankerAndInterleaver";
import { resolveSharedAdForFeed } from "../../../lib/feed/sharedAdResolver";
import { triggerSelfHealingJobsIfDue } from "../../../lib/services/cronOrchestrator";

export const dynamic = "force-dynamic";

let rpcGetFeedBrokenUntil = 0;

export async function GET(req: NextRequest) {
  try {
    let email = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!email && process.env.NODE_ENV !== "production") {
      const devHeader = req.headers.get("x-user-email");
      if (devHeader && devHeader.includes("@")) {
        email = devHeader.toLowerCase().trim();
      }
    }
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "true";
    const locationSkipped = searchParams.get("locationSkipped") === "true";

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
    const origin = req.nextUrl.origin || "https://paayh.com";
    const signFeedAds = (adsToSign: Ad[]) =>
      adsToSign.map((ad: Ad) => {
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
          ad_media: transformMediaUrlsToCdn(ad.ad_media, origin),
          is_admin_post: isPlatformPost,
          cost_per_impression: isPlatformPost ? 0 : Number(ad.cost_per_impression || 0),
          impressions: isPlatformPost ? 0 : Number(ad.impressions || 0),
          _token: token,
          _served_at: servedAt,
          verification_token: token,
          served_at: servedAt,
        };
      });

    // Dedicated single-ad branch: return ONLY the shared ad (never other feed ads)
    if (sharedAdId) {
      const sharedResult = await resolveSharedAdForFeed({
        sharedAdId,
        offset,
        pageAds: [],
        profilesMap: {},
      });
      const signedSharedAds = signFeedAds(sharedResult.pageAds);
      return NextResponse.json(
        {
          ads: signedSharedAds,
          profiles: sharedResult.profilesMap,
          sharedAdMode: true,
          ...(sharedResult.sharedAdUnavailable ? { sharedAdUnavailable: true } : {}),
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        }
      );
    }

    const isViewerAdmin = isAdminEmail(emailKey);
    const adIdsCacheKey = `feed:ad_ids:${emailKey}`;
    const legacyAdsCacheKey = `feed:ads:${emailKey}`;
    const profilesCacheKey = `feed:profiles:${emailKey}`;
    const viewerProfileCacheKey = `user:profile:${emailKey}`;
    const seenAdsSetKey = `seen:ads:${emailKey}`;
    const blockedAdsSetKey = `blocked:ads:${emailKey}`;
    const blockedAdvertisersSetKey = `blocked:advertisers:${emailKey}`;
    const todayDate = now.toISOString().slice(0, 10);
    const pacingHashKey = `user:pacing:${emailKey}:${todayDate}`;
    const lastViewedHashKey = `user:last_viewed:${emailKey}`;

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

    if (!refresh) {
      const l1Feed = l1UserFeedCache.get(emailKey);
      if (l1Feed && Date.now() < l1Feed.expiresAt) {
        cachedAdIdsStr = JSON.stringify(l1Feed.adIds);
        cachedProfilesStr = JSON.stringify(l1Feed.profilesMap);
      }
    }

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

    // Resolve viewer profile from DB if still absent before location/targeting checks
    if (!viewerProfile) {
      const { data: dbUser } = await supabaseReadOnly
        .from("users")
        .select(
          "email, dob, country, state, location, gender, employment, employment_status, interest, lifestyle, behavior, personality, industry, is_career, is_affiliate"
        )
        .ilike("email", emailKey)
        .maybeSingle();
      viewerProfile = (dbUser as ViewerTargetingProfile) || { email: emailKey };
    } else {
      viewerProfile = { ...viewerProfile, email: emailKey };
    }

    const isViewerExempt = isExemptFromBarriersAndInactivity(emailKey, viewerProfile as any);
    const locationEnabled = hasViewerLocationEnabled(viewerProfile, locationSkipped, isViewerExempt);

    // Enforce Terms §1.4: general feed remains empty when location is skipped or missing
    if (!locationEnabled && !sharedAdId) {
      return NextResponse.json(
        {
          ads: [],
          profiles: {},
          locationRequired: true,
        },
        {
          headers: {
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
          },
        }
      );
    }

    const userImpressionMap = new Map<string, UserImpressionInfo>();
    const completedOrCappedAdIds: string[] = [];

    Object.entries(lifetimeFreqMap).forEach(([adId, countStr]) => {
      userImpressionMap.set(adId, {
        view_count: Number(countStr) || 0,
        today_view_count: Number(todayFreqMap[adId]) || 0,
        last_viewed_at: lastViewedMap[adId] || null,
      });
    });

    const isInstantEmptyL1Hit = !refresh && cachedAdIdsStr === "[]";
    if (userImpressionMap.size === 0 && !isInstantEmptyL1Hit && locationEnabled) {
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

    let pageAds: Ad[] = [];
    let profilesMap: Record<string, AdvertiserProfile> = {};
    let cacheHit = false;

    if (locationEnabled && !refresh && cachedAdIdsStr && cachedProfilesStr) {
      try {
        const cachedAdIds: string[] = JSON.parse(cachedAdIdsStr);
        profilesMap = JSON.parse(cachedProfilesStr);

        const uniqueCachedIds = Array.from(new Set(cachedAdIds));
        const seenOrBlockedBeforeOffset = uniqueCachedIds
          .slice(0, offset)
          .filter((id) => seenAdIdsSet.has(id) || blockedAdIdsSet.has(id)).length;
        const effectiveOffset = Math.max(0, offset - seenOrBlockedBeforeOffset);

        const eligibleIds = uniqueCachedIds.filter(
          (id) => !seenAdIdsSet.has(id) && !blockedAdIdsSet.has(id)
        );
        const slicedIds = eligibleIds.slice(effectiveOffset, effectiveOffset + limit);

        if (slicedIds.length > 0) {
          const fetchedDetailsMap: Record<string, Ad> = {};
          const redisLookupIds: string[] = [];

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

          const missingIds: string[] = [];
          if (redisLookupIds.length > 0 && isRedisReady()) {
            const detailKeys = redisLookupIds.map((id) => `ad:detail:${id}`);
            const cachedDetailsRaw = await redisConnection.mget(detailKeys);
            if (Array.isArray(cachedDetailsRaw)) {
              cachedDetailsRaw.forEach((raw, idx) => {
                const adId = redisLookupIds[idx];
                if (raw) {
                  try {
                    const adDetail: Ad = JSON.parse(raw);
                    l1AdDetailsCache.set(adId, {
                      ad: adDetail,
                      expiresAt: Date.now() + AD_DETAIL_TTL_SECONDS * 1000,
                    });
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
          } else {
            missingIds.push(...redisLookupIds);
          }

          if (missingIds.length > 0) {
            const primaryMissingRes = await supabaseReadOnly
              .from("addsactive")
              .select(AD_SELECT_FIELDS)
              .in("id", missingIds);
            let dbMissing = primaryMissingRes.data as any[] | null;
            let dbErr = primaryMissingRes.error;

            if (dbErr) {
              const fbMissing = await supabaseReadOnly
                .from("addsactive")
                .select(AD_SELECT_FIELDS_FALLBACK)
                .in("id", missingIds);
              dbMissing = fbMissing.data as any[] | null;
              dbErr = fbMissing.error;
            }

            if (!dbErr && dbMissing) {
              const pipeline = isRedisReady() ? redisConnection.pipeline() : null;
              dbMissing.forEach((ad: any) => {
                l1AdDetailsCache.set(ad.id, {
                  ad,
                  expiresAt: Date.now() + AD_DETAIL_TTL_SECONDS * 1000,
                });
                if (ad.user_email && blockedAdvertisersSet.has(ad.user_email.toLowerCase())) {
                  return;
                }
                fetchedDetailsMap[ad.id] = ad;
                if (pipeline) {
                  pipeline.set(`ad:detail:${ad.id}`, JSON.stringify(ad), "EX", AD_DETAIL_TTL_SECONDS);
                }
              });
              if (pipeline) pipeline.exec().catch(() => {});
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

              const plan = computeCampaignBroadeningPlan(ad as any, now.getTime());
              if (plan.isScheduledFuture || plan.isExpiredPlatformPost) return false;

              const dailyCap = Number((ad as any).daily_impression_cap || 0);
              if (dailyCap > 0 && (ad as any).last_reset_date === todayDate) {
                const effectiveDailyCap = dailyCap + Math.max(0, Number((ad as any).rollover_balance || 0));
                if (Number((ad as any).daily_impression_count || 0) >= effectiveDailyCap) return false;
              }

              const check = evaluateAdTargeting(
                ad as any,
                { ...viewerProfile, email: emailKey },
                {
                  allowRolloverPsychographics: plan.broadeningStage >= 1,
                  broadeningStage: plan.broadeningStage,
                }
              );
              if (!check.matches) return false;

              const imp = userImpressionMap.get(ad.id);
              const totalViews = imp
                ? imp.view_count || 0
                : seenAdIdsSet.has(ad.id)
                ? plan.baseUserCap
                : 0;
              if (!isViewerAdmin && !ad.is_admin_post && totalViews >= plan.effectiveUserCap) return false;

              const isToday = imp?.last_viewed_at && imp.last_viewed_at.slice(0, 10) === todayDate;
              const viewsToday = Math.max(
                Number(todayPacingMap[ad.id] || 0),
                isToday ? imp?.today_view_count || 0 : 0
              );
              if (totalViews > 0) {
                if (viewsToday >= plan.dailyUserCap) return false;
                if (imp?.last_viewed_at) {
                  const lastViewedMs = new Date(imp.last_viewed_at).getTime();
                  if (!isNaN(lastViewedMs) && now.getTime() - lastViewedMs < plan.minSpacingMs) {
                    return false;
                  }
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

    if (locationEnabled && !cacheHit) {
      let rawAds: any[] = [];
      if (Date.now() >= rpcGetFeedBrokenUntil) {
        const rpcRes = await supabaseReadOnly.rpc("get_user_feed", {
          p_user_email: email,
          p_limit: 100,
          p_offset: 0,
        });
        if (rpcRes.error) {
          rpcGetFeedBrokenUntil = Date.now() + 30 * 60 * 1000;
          console.warn("⚠️ RPC get_user_feed schema mismatch (circuit-breaker active for 30m); using indexed addsactive pool.");
        } else if (rpcRes.data && rpcRes.data.length > 0) {
          rawAds = rpcRes.data;
        }
      }

      if (rawAds.length === 0) {
        rawAds = await loadSharedActiveAdsForCountry(viewerProfile?.country || "");
      }

      const built = buildOrderedCandidateFeed({
        rawAds,
        viewerProfile,
        emailKey,
        isViewerAdmin,
        seenAdIdsSet,
        blockedAdIdsSet,
        blockedAdvertisersSet,
        userImpressionMap,
        todayPacingMap,
        todayDate,
        nowMs: now.getTime(),
      });
      const orderedCandidateAds = built.orderedCandidateAds;
      completedOrCappedAdIds.push(...built.completedOrCappedAdIds);

      const candidateAdIds = orderedCandidateAds.map((a: Ad) => a.id);
      const publisherEmails = Array.from(
        new Set(orderedCandidateAds.map((ad: Ad) => ad.user_email).filter(Boolean))
      ) as string[];

      await hydratePublisherProfiles(publisherEmails, profilesMap);
      setL1UserFeed(emailKey, candidateAdIds, profilesMap);

      const detailExp = Date.now() + AD_DETAIL_TTL_SECONDS * 1000;
      orderedCandidateAds.forEach((ad: Ad) => {
        l1AdDetailsCache.set(ad.id, { ad, expiresAt: detailExp });
      });

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

    const signedAds = signFeedAds(pageAds);
    triggerSelfHealingJobsIfDue().catch(() => {});

    return NextResponse.json(
      {
        ads: signedAds,
        profiles: profilesMap,
        ...(!locationEnabled ? { locationRequired: true } : {}),
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/feed:", err);
    return NextResponse.json({ error: "Try again later" }, { status: 500 });
  }
}
