import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import crypto from "crypto";
import redisConnection from "@/lib/redis";

const SECRET_KEY = process.env.AUTH0_SECRET || "BhrjJEt523QxdiWWsOI73y5hJyVQkqlGoIp08xPUJBxlkoJ5q0ELp75RsmxfOF3S";
const CACHE_TTL_SECONDS = 1800; // 30 minutes

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

    // 1. Parse pagination and refresh parameters
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "15", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const refresh = searchParams.get("refresh") === "true";

    const emailKey = email.toLowerCase();
    const adsCacheKey = `feed:ads:${emailKey}`;
    const profilesCacheKey = `feed:profiles:${emailKey}`;

    let cachedAds: any[] = [];
    let profilesMap: Record<string, any> = {};

    // 2. Try to get cached feed from Redis unless refreshing or fetching page 0 with refresh
    let cacheHit = false;
    if (!refresh) {
      try {
        const [cachedAdsStr, cachedProfilesStr] = await Promise.all([
          redisConnection.get(adsCacheKey),
          redisConnection.get(profilesCacheKey),
        ]);

        if (cachedAdsStr && cachedProfilesStr) {
          cachedAds = JSON.parse(cachedAdsStr);
          profilesMap = JSON.parse(cachedProfilesStr);
          cacheHit = true;
          console.log(`🚀 Feed cache hit for user: ${emailKey} (Offset: ${offset}, Limit: ${limit})`);
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

      // Filter active ads (skip ads already completed)
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
            return; // Exclude from feed
          }
        }
        candidateAds.push(ad);
      });

      // Shuffle candidate ads in memory to resolve random() DB bottleneck and provide variety
      cachedAds = candidateAds.sort(() => 0.5 - Math.random());

      // Extract publisher emails to fetch basic profile info server-side
      const publisherEmails = Array.from(
        new Set(cachedAds.map((ad: any) => ad.user_email).filter(Boolean))
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

      // Store in Redis cache
      try {
        await Promise.all([
          redisConnection.set(adsCacheKey, JSON.stringify(cachedAds), "EX", CACHE_TTL_SECONDS),
          redisConnection.set(profilesCacheKey, JSON.stringify(profilesMap), "EX", CACHE_TTL_SECONDS)
        ]);
        console.log(`✅ Cached ${cachedAds.length} candidate ads for user: ${emailKey}`);
      } catch (err: any) {
        console.error("❌ Redis write error in feed route:", err.message || err);
      }
    }

    // 3. Slice the cached ads array for the requested page
    const pageAds = cachedAds.slice(offset, offset + limit);

    // 4. Sign each ad in the slice in memory to establish security signatures
    const signedAds = pageAds.map((ad: any) => {
      const payload = `${ad.id}:${userId}:${servedAt}`;
      const token = crypto.createHmac("sha256", SECRET_KEY).update(payload).digest("hex");
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
