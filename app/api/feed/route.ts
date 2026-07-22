import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import crypto from "crypto";
import redisConnection from "@/lib/redis";

const SECRET_KEY = process.env.AUTH0_SECRET;
if (!SECRET_KEY && process.env.NODE_ENV === "production") {
  console.warn("⚠️ AUTH0_SECRET environment variable is missing.");
}

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

    let pageAds: any[] = [];
    let profilesMap: Record<string, any> = {};

    let cacheHit = false;

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

          // Extract slice of IDs for the requested page
          const slicedIds = cachedAdIds.slice(offset, offset + limit);

          if (slicedIds.length > 0) {
            // Fetch shared ad details from Redis in bulk
            const detailKeys = slicedIds.map((id) => `ad:detail:${id}`);
            const cachedDetailsRaw = await redisConnection.mget(...detailKeys);

            const missingIds: string[] = [];
            const fetchedDetailsMap: Record<string, any> = {};

            cachedDetailsRaw.forEach((raw, idx) => {
              const adId = slicedIds[idx];
              if (raw) {
                try {
                  fetchedDetailsMap[adId] = JSON.parse(raw);
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
      console.log(`🔄 Feed cache miss/refresh for user: ${emailKey}. Fetching matching campaigns from Supabase...`);

      // Call Supabase RPC get_user_feed with 100 limit to cache the candidate pool
      const { data: ads, error } = await supabaseReadOnly.rpc("get_user_feed", {
        p_user_email: email,
        p_limit: 100,
        p_offset: 0
      });

      if (error) {
        console.error("❌ RPC get_user_feed error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Filter active ads (skip ads already completed or expired)
      const candidateAds: any[] = [];
      (ads || []).forEach((ad: any) => {
        if (ad.completed_at) return;

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
        candidateAds.push(ad);
      });

      // Shuffle candidate ads in memory
      const shuffledCandidateAds = candidateAds.sort(() => 0.5 - Math.random());
      const candidateAdIds = shuffledCandidateAds.map((a: any) => a.id);

      // Extract publisher emails to fetch basic profile info server-side
      const publisherEmails = Array.from(
        new Set(shuffledCandidateAds.map((ad: any) => ad.user_email).filter(Boolean))
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
        shuffledCandidateAds.forEach((ad: any) => {
          cacheOps.push(
            redisConnection.set(`ad:detail:${ad.id}`, JSON.stringify(ad), "EX", AD_DETAIL_TTL_SECONDS)
          );
        });

        await Promise.all(cacheOps);
        console.log(`✅ Cached ${candidateAdIds.length} candidate ad IDs for user: ${emailKey}`);
      } catch (err: any) {
        console.error("❌ Redis write error in feed route:", err.message || err);
      }

      // Slice requested page from shuffled candidate list
      pageAds = shuffledCandidateAds.slice(offset, offset + limit);
    }

    // Sign each ad in the page slice in memory to establish security signatures
    const activeSecretKey = SECRET_KEY || "BhrjJEt523QxdiWWsOI73y5hJyVQkqlGoIp08xPUJBxlkoJ5q0ELp75RsmxfOF3S";
    const signedAds = pageAds.map((ad: any) => {
      const payload = `${ad.id}:${userId}:${servedAt}`;
      const token = crypto.createHmac("sha256", activeSecretKey).update(payload).digest("hex");
      return {
        id: ad.id,
        ad_type: ad.ad_type || null,
        product_name: ad.product_name || null,
        product_price: ad.product_price || null,
        product_cta_type: ad.product_cta_type || null,
        product_cta_link: ad.product_cta_link || null,
        ad_content: ad.ad_content || "",
        ad_media: ad.ad_media || null,
        action_phone: ad.action_phone || null,
        action_email: ad.action_email || null,
        action_website: ad.action_website || null,
        action_whatsapp: ad.action_whatsapp || null,
        display_mutual_button: ad.display_mutual_button === true,
        mutual_targets: ad.mutual_targets || [],
        user_email: ad.user_email || null,
        verification_token: token,
        served_at: servedAt,
        created_at: ad.created_at || null,
      };
    });

    return NextResponse.json({ ads: signedAds, profiles: profilesMap });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/feed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
