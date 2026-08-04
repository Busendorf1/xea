import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import crypto from "crypto";
import redisConnection from "@/lib/redis";
import { env } from "@/lib/env";
import { Ad, AdvertiserProfile } from "@/types/ads";

export const dynamic = "force-dynamic";

// Optimized TTLs for high-scalability candidate ID caching
const USER_FEED_IDS_TTL_SECONDS = 600; // 10 minutes TTL for candidate ID pool
const AD_DETAIL_TTL_SECONDS = 1800;    // 30 minutes TTL for shared ad details

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await auth0.getSession();
    const userId = session?.user?.sub || email;
    const now = new Date();
    const servedAt = Date.now();

    // Parse pagination and refresh parameters
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "15", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const refresh = searchParams.get("refresh") === "true";

    const emailKey = email.toLowerCase().trim();
    const adIdsCacheKey = `feed:ad_ids:${emailKey}`;
    const legacyAdsCacheKey = `feed:ads:${emailKey}`;
    const profilesCacheKey = `feed:profiles:${emailKey}`;
    const seenAdsSetKey = `seen:ads:${emailKey}`;

    const blockedAdsSetKey = `blocked:ads:${emailKey}`;
    const blockedAdvertisersSetKey = `blocked:advertisers:${emailKey}`;

    let pageAds: Ad[] = [];
    let profilesMap: Record<string, AdvertiserProfile> = {};

    let cacheHit = false;

    // Fetch user's active seen set and blocked sets in Redis to exclude seen/blocked ads without purging candidate feed
    const [seenAdIdsList, blockedAdIdsList, blockedAdvertisersList] = await Promise.all([
      redisConnection.smembers(seenAdsSetKey).catch(() => []),
      redisConnection.smembers(blockedAdsSetKey).catch(() => []),
      redisConnection.smembers(blockedAdvertisersSetKey).catch(() => []),
    ]);

    const seenAdIdsSet = new Set<string>(seenAdIdsList);
    const blockedAdIdsSet = new Set<string>(blockedAdIdsList);
    const blockedAdvertisersSet = new Set<string>(blockedAdvertisersList.map(e => e.toLowerCase()));

    // Try to retrieve cached candidate ad IDs and profiles unless refresh is requested
    if (!refresh) {
      try {
        const [cachedAdIdsStr, cachedProfilesStr] = await Promise.all([
          redisConnection.get(adIdsCacheKey),
          redisConnection.get(profilesCacheKey),
        ]);

        if (cachedAdIdsStr && cachedProfilesStr) {
          const cachedAdIds: string[] = JSON.parse(cachedAdIdsStr);
          profilesMap = JSON.parse(cachedProfilesStr);

          // Filter out ads already seen or blocked by the user in this session & preserve single-fetch uniqueness
          const eligibleIds = Array.from(new Set(cachedAdIds)).filter((id) => !seenAdIdsSet.has(id) && !blockedAdIdsSet.has(id));

          // Extract slice of IDs for the requested page
          const slicedIds = eligibleIds.slice(offset, offset + limit);

          if (slicedIds.length > 0) {
            // Fetch shared ad details from Redis in bulk
            const detailKeys = slicedIds.map((id) => `ad:detail:${id}`);
            const cachedDetailsRaw = await redisConnection.mget(...detailKeys);

            const missingIds: string[] = [];
            const fetchedDetailsMap: Record<string, Ad> = {};

            cachedDetailsRaw.forEach((raw, idx) => {
              const adId = slicedIds[idx];
              if (raw) {
                try {
                  const adDetail: Ad = JSON.parse(raw);
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

            // Backfill missing ad details from Supabase if evicted from Redis
            if (missingIds.length > 0) {
              const { data: dbMissing, error: dbErr } = await supabaseReadOnly
                .from("addsactive")
                .select("*")
                .in("id", missingIds);

              if (!dbErr && dbMissing) {
                const setPromises = dbMissing.map((ad: any) => {
                  if (ad.user_email && blockedAdvertisersSet.has(ad.user_email.toLowerCase())) {
                    return Promise.resolve();
                  }
                  fetchedDetailsMap[ad.id] = ad;
                  return redisConnection.set(
                    `ad:detail:${ad.id}`,
                    JSON.stringify(ad),
                    "EX",
                    AD_DETAIL_TTL_SECONDS
                  );
                });
                await Promise.all(setPromises).catch((err) =>
                  console.error("❌ Redis write error backfilling ad details:", err)
                );
              }
            }

            pageAds = slicedIds.map((id) => fetchedDetailsMap[id]).filter(Boolean);
          }

          cacheHit = true;
          console.log(`🚀 Scalable Feed cache hit for user: ${emailKey} (Offset: ${offset}, Limit: ${limit})`);
        }
      } catch (err: any) {
        console.error("❌ Redis read error in feed route:", err.message || err);
      }
    }

    if (!cacheHit) {
      console.log(`🔄 Feed cache miss/refresh for user: ${emailKey}. Fetching matching campaigns...`);

      // Call Supabase RPC get_user_feed with 100 limit to cache candidate pool
      let { data: ads, error } = await supabaseReadOnly.rpc("get_user_feed", {
        p_user_email: email,
        p_limit: 100,
        p_offset: 0
      });

      // Fallback: If RPC fails or is missing, query addsactive directly so feed NEVER breaks!
      if (error) {
        console.warn("⚠️ RPC get_user_feed error/fallback:", error.message || error);
        const { data: fallbackAds, error: fallbackErr } = await supabaseReadOnly
          .from("addsactive")
          .select("*")
          .is("completed_at", null)
          .neq("user_email", email)
          .limit(100);

        if (fallbackErr) {
          console.error("❌ Fallback query on addsactive failed:", fallbackErr);
          return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
        }
        ads = fallbackAds;
      }

      // Filter active ads and enforce single-fetch uniqueness
      const candidateAdsMap = new Map<string, Ad>();
      (ads || []).forEach((ad: any) => {
        if (ad.completed_at) return;
        if (seenAdIdsSet.has(ad.id) || blockedAdIdsSet.has(ad.id)) return; // Exclude currently seen/blocked ads
        if (ad.user_email && blockedAdvertisersSet.has(ad.user_email.toLowerCase())) return; // Exclude blocked advertisers

        // Exclude expired active platform campaigns
        const isPlatformAd = !ad.cost_per_impression || Number(ad.cost_per_impression) === 0;
        if (isPlatformAd && ad.created_at && ad.campaign_days) {
          const createdAt = new Date(ad.created_at);
          const diffTime = now.getTime() - createdAt.getTime();
          const diffDays = diffTime / (1000 * 60 * 60 * 24);
          if (diffDays > ad.campaign_days) {
            return;
          }
        }
        if (!candidateAdsMap.has(ad.id)) {
          candidateAdsMap.set(ad.id, ad);
        }
      });

      const candidateAds = Array.from(candidateAdsMap.values());

      // Shuffle candidate ads in memory using performant O(N) Fisher-Yates shuffle
      const shuffledCandidateAds = [...candidateAds];
      for (let i = shuffledCandidateAds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledCandidateAds[i], shuffledCandidateAds[j]] = [shuffledCandidateAds[j], shuffledCandidateAds[i]];
      }
      const candidateAdIds = shuffledCandidateAds.map((a: Ad) => a.id);

      // Extract publisher emails to fetch basic profile info server-side
      const publisherEmails = Array.from(
        new Set(shuffledCandidateAds.map((ad: Ad) => ad.user_email).filter(Boolean))
      ) as string[];

      if (publisherEmails.length > 0) {
        const { data: profiles, error: profilesError } = await supabaseReadOnly
          .from("users")
          .select('email, business_name, "firstName", "profileImage"')
          .in("email", publisherEmails);

        if (!profilesError && profiles) {
          profiles.forEach((p: any) => {
            if (p.email) {
              profilesMap[p.email.toLowerCase()] = {
                business_name: p.business_name || "",
                firstName: p.firstName || "",
                profileImage: p.profileImage || ""
              };
            }
          });
        }
      }

      // Store shared ad details, candidate ID array, and profiles map in Redis
      try {
        const cacheOps: Promise<any>[] = [
          redisConnection.set(adIdsCacheKey, JSON.stringify(candidateAdIds), "EX", USER_FEED_IDS_TTL_SECONDS),
          redisConnection.set(profilesCacheKey, JSON.stringify(profilesMap), "EX", USER_FEED_IDS_TTL_SECONDS),
          redisConnection.del(legacyAdsCacheKey) // clear legacy heavy cache key if present
        ];

        // Cache individual ad objects in shared keys `ad:detail:${ad.id}`
        shuffledCandidateAds.forEach((ad: Ad) => {
          cacheOps.push(
            redisConnection.set(`ad:detail:${ad.id}`, JSON.stringify(ad), "EX", AD_DETAIL_TTL_SECONDS)
          );
        });

        await Promise.all(cacheOps);
        console.log(`✅ Cached ${candidateAdIds.length} candidate ad IDs for user: ${emailKey}`);
      } catch (err: any) {
        console.error("❌ Redis write error in feed route:", err.message || err);
      }

      // Slice requested page from candidate list
      pageAds = shuffledCandidateAds.slice(offset, offset + limit);
    }

    // Sign each ad in the page slice using env.AUTH0_SECRET (no hardcoded fallback)
    const secretKey = env.AUTH0_SECRET;
    const signedAds = pageAds.map((ad: Ad) => {
      const payload = `${ad.id}:${userId}:${servedAt}`;
      const token = crypto.createHmac("sha256", secretKey).update(payload).digest("hex");
      return {
        ...ad,
        verification_token: token,
        served_at: servedAt,
      };
    });

    return NextResponse.json({ ads: signedAds, profiles: profilesMap });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/feed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
