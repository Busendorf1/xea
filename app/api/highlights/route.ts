import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { getCachedProfile, getCachedHighlights, setCachedHighlights } from "@/lib/utils/cache";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { safeParseArray } from "@/lib/utils/parsers";

export const dynamic = "force-dynamic";

const SHARED_POOL_REDIS_KEY = "highlights:active_pool:v3";
const SHARED_POOL_TTL_SECONDS = 45;
const SHARED_POOL_L1_TTL_MS = 30 * 1000;

let l1SharedHighlightsPool: { rows: any[]; expiresAt: number } | null = null;
let inFlightPoolPromise: Promise<any[]> | null = null;

/**
 * Single-Flight Shared Active Highlights Pool Loader (L1 Memory -> L2 Redis -> Bounded Indexed DB Query).
 * Collapses millions of unique user interest permutations into 1 shared DB query every 45 seconds.
 */
async function loadActiveHighlightsPool(): Promise<any[]> {
  const now = Date.now();
  if (l1SharedHighlightsPool && now < l1SharedHighlightsPool.expiresAt) {
    return l1SharedHighlightsPool.rows;
  }

  if (inFlightPoolPromise) {
    return inFlightPoolPromise;
  }

  inFlightPoolPromise = (async () => {
    try {
      if (isRedisReady()) {
        try {
          const cachedPoolStr = await redisConnection.get(SHARED_POOL_REDIS_KEY);
          if (cachedPoolStr) {
            const parsed = JSON.parse(cachedPoolStr);
            if (Array.isArray(parsed)) {
              l1SharedHighlightsPool = {
                rows: parsed,
                expiresAt: Date.now() + SHARED_POOL_L1_TTL_MS,
              };
              return parsed;
            }
          }
        } catch {}
      }

      // Query up to 35 days back so boosted highlights with up to 30 campaign_days are never prematurely excluded
      const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();

      let rawHighlights: any[] = [];
      const { data: primaryData, error } = await supabaseReadOnly
        .from("newsactive")
        .select(
          "id, title, content, image_url, interest, created_at, user_email, country, state, province, is_bidded, bid_price, campaign_days, is_paused, admin_statement, is_ai_content"
        )
        .or("is_paused.eq.false,is_paused.is.null")
        .gte("created_at", thirtyFiveDaysAgo)
        .order("is_bidded", { ascending: false })
        .order("bid_price", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300);

      if (error && (error.code === "42703" || error.message?.includes("does not exist"))) {
        const fallbackRes = await supabaseReadOnly
          .from("newsactive")
          .select("id, title, content, image_url, interest, created_at, user_email")
          .gte("created_at", thirtyFiveDaysAgo)
          .order("created_at", { ascending: false })
          .limit(300);
        rawHighlights = fallbackRes.data || [];
      } else if (error) {
        console.error("❌ Error fetching highlights pool:", error);
        return l1SharedHighlightsPool?.rows || [];
      } else {
        rawHighlights = primaryData || [];
      }

      l1SharedHighlightsPool = {
        rows: rawHighlights,
        expiresAt: Date.now() + SHARED_POOL_L1_TTL_MS,
      };

      if (isRedisReady()) {
        redisConnection
          .set(SHARED_POOL_REDIS_KEY, JSON.stringify(rawHighlights), "EX", SHARED_POOL_TTL_SECONDS)
          .catch(() => {});
      }

      return rawHighlights;
    } finally {
      inFlightPoolPromise = null;
    }
  })();

  return inFlightPoolPromise;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const highestBidQuery = searchParams.get("highestBid");
    const interestQuery = searchParams.get("interest");

    // 0. Query highest bid price for an interest to guide advertisers (cached 15s in Redis)
    if (highestBidQuery === "true" && interestQuery) {
      const interestKey = `hl:highest_bid:${interestQuery.toLowerCase().trim()}`;
      try {
        if (isRedisReady()) {
          const cachedBid = await redisConnection.get(interestKey);
          if (cachedBid !== null) {
            return NextResponse.json({ highestBid: parseFloat(cachedBid), interest: interestQuery });
          }
        }

        const { data: topBid } = await supabaseReadOnly
          .from("newsactive")
          .select("bid_price")
          .eq("interest", interestQuery)
          .eq("is_bidded", true)
          .order("bid_price", { ascending: false })
          .limit(1)
          .maybeSingle();

        const highestBid = topBid?.bid_price ? parseFloat(topBid.bid_price) : 1000;
        if (isRedisReady()) {
          await redisConnection.set(interestKey, String(highestBid), "EX", 15).catch(() => {});
        }
        return NextResponse.json({ highestBid, interest: interestQuery });
      } catch {
        return NextResponse.json({ highestBid: 1000, interest: interestQuery });
      }
    }

    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const interestsParam = searchParams.get("interests");
    const countryParam = searchParams.get("country");
    const stateParam = searchParams.get("state");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    let limit: number | null = null;
    let offset = 0;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = parsedLimit;
      }
    }
    if (offsetParam) {
      const parsedOffset = parseInt(offsetParam, 10);
      if (!isNaN(parsedOffset) && parsedOffset >= 0) {
        offset = parsedOffset;
      }
    }

    let interests: string[] = [];
    let resolvedCountry = countryParam ? countryParam.trim() : "";
    let resolvedState = stateParam ? stateParam.trim() : "";
    let resolvedCity = "";

    const emailKey = email.toLowerCase().trim();
    const dateStr = new Date().toISOString().split("T")[0];

    // Parallelize cached profile read & Redis daily highlight views hash read (<1ms)
    const [user, viewsHash] = await Promise.all([
      getCachedProfile(emailKey),
      isRedisReady()
        ? redisConnection.hgetall(`hl:views:${emailKey}:${dateStr}`).catch(() => null)
        : Promise.resolve(null),
    ]);

    let profileSource: any = user;
    if (!profileSource && !interestsParam) {
      const { data: dbUser } = await supabaseReadOnly
        .from("users")
        .select("interest, country, state, location")
        .eq("email", emailKey)
        .maybeSingle();
      if (dbUser) profileSource = dbUser;
    }

    if (interestsParam) {
      interests = interestsParam.split(",").map((i) => i.trim()).filter(Boolean);
    } else if (profileSource?.interest) {
      interests = safeParseArray(profileSource.interest);
    }

    if (!resolvedCountry && profileSource?.country && profileSource.country !== "placeholder") {
      resolvedCountry = String(profileSource.country).trim();
    }
    if (!resolvedState && profileSource?.state) {
      resolvedState = String(profileSource.state).trim();
    }
    if (profileSource?.location) {
      resolvedCity = String(profileSource.location).trim();
    }

    const userViewsMap: Record<string, number> = {};
    if (viewsHash) {
      Object.keys(viewsHash).forEach((hlId) => {
        userViewsMap[hlId] = parseInt(viewsHash[hlId] || "0", 10);
      });
    }

    // 1. Check L1/L2 Cache for exact targeting slice
    const cachedData = await getCachedHighlights(interests, resolvedCountry || null, resolvedState || null);
    if (cachedData) {
      const personalizedCached = cachedData.map((h: any) => ({
        ...h,
        user_render_count: userViewsMap[h.id] || 0,
      }));
      const sliced = limit !== null ? personalizedCached.slice(offset, offset + limit) : personalizedCached;
      return NextResponse.json(sliced, {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
        },
      });
    }

    // 2. Load from Single-Flight Shared Active Highlights Pool (1 DB query per 45s across all users)
    const rawHighlights = await loadActiveHighlightsPool();

    // Normalize viewer targeting tokens for accurate case-insensitive interest + LocationSelector matching
    const normalizedViewerInterests = new Set(interests.map((i) => i.toLowerCase().trim()).filter(Boolean));
    const normCountry = resolvedCountry.toLowerCase().trim();
    const normState = resolvedState.toLowerCase().replace(/\b(state|province|region|county|district|lga)\b/g, "").trim();
    const normCity = resolvedCity.toLowerCase().replace(/\b(state|province|region|county|district|lga)\b/g, "").trim();

    // Find max bid_price for each interest group to identify highest bidders
    const maxBidsByInterest: Record<string, number> = {};
    (rawHighlights || []).forEach((h: any) => {
      if (h.is_bidded && h.interest) {
        const bid = parseFloat(h.bid_price || 0);
        const cat = String(h.interest).toLowerCase().trim();
        if (!maxBidsByInterest[cat] || bid > maxBidsByInterest[cat]) {
          maxBidsByInterest[cat] = bid;
        }
      }
    });

    // Filter highlights strictly based on expiration rules, with Progressive Nearest-Match fallback so 0% of active highlights are stranded
    const nowMs = Date.now();
    const strictHighlights: any[] = [];
    const fallbackHighlights: Array<{ hl: any; affinityScore: number }> = [];

    for (const h of rawHighlights || []) {
      if (h.is_paused) continue;
      const createdAtMs = new Date(h.created_at).getTime();
      const diffHours = (nowMs - createdAtMs) / (1000 * 60 * 60);

      const isNotExpired = h.is_bidded
        ? diffHours < Math.max(1, Number(h.campaign_days || 1)) * 24
        : diffHours < 24;
      if (!isNotExpired) continue;

      let interestMatched = true;
      if (normalizedViewerInterests.size > 0 && h.interest) {
        const hlInterest = String(h.interest).toLowerCase().trim();
        if (hlInterest && hlInterest !== "all" && hlInterest !== "general" && !normalizedViewerInterests.has(hlInterest)) {
          interestMatched = false;
        }
      }

      let countryMatched = true;
      const hlCountry = h.country ? String(h.country).toLowerCase().trim() : "";
      if (hlCountry && hlCountry !== "all" && hlCountry !== "global" && normCountry) {
        if (hlCountry !== normCountry) countryMatched = false;
      }

      let stateMatched = true;
      const hlState = h.state ? String(h.state).toLowerCase().replace(/\b(state|province|region|county|district|lga)\b/g, "").trim() : "";
      const hlProvince = h.province ? String(h.province).toLowerCase().replace(/\b(state|province|region|county|district|lga)\b/g, "").trim() : "";

      if (hlState && hlState !== "all" && (normState || normCity)) {
        const stHit =
          (normState && (normState.includes(hlState) || hlState.includes(normState))) ||
          (normCity && (normCity.includes(hlState) || hlState.includes(normCity)));
        if (!stHit) stateMatched = false;
      }

      if (stateMatched && hlProvince && hlProvince !== "all" && (normState || normCity)) {
        const provTokens = hlProvince.split(/[;,]/).map((s: string) => s.trim()).filter(Boolean);
        const provHit = provTokens.some(
          (tok: string) =>
            (normCity && (normCity.includes(tok) || tok.includes(normCity))) ||
            (normState && (normState.includes(tok) || tok.includes(normState)))
        );
        if (!provHit) stateMatched = false;
      }

      if (interestMatched && countryMatched && stateMatched) {
        strictHighlights.push(h);
      } else {
        let affinityScore = 0;
        if (countryMatched) affinityScore += 40;
        if (stateMatched) affinityScore += 25;
        if (interestMatched) affinityScore += 20;
        if (h.is_bidded) affinityScore += Math.min(50, parseFloat(h.bid_price || 0) / 100);
        fallbackHighlights.push({ hl: h, affinityScore });
      }
    }

    // Rank Bidded highlights at the top sorted by bid_price DESC, then standard highlights by created_at DESC
    const sortByBidAndRecency = (a: any, b: any) => {
      const aIsBidded = !!a.is_bidded;
      const bIsBidded = !!b.is_bidded;
      if (aIsBidded && !bIsBidded) return -1;
      if (!aIsBidded && bIsBidded) return 1;
      if (aIsBidded && bIsBidded) {
        const aBid = parseFloat(a.bid_price || 0);
        const bBid = parseFloat(b.bid_price || 0);
        if (aBid !== bBid) return bBid - aBid;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    };

    const sortedHighlights = [...strictHighlights.sort(sortByBidAndRecency)];
    const minHighlightPoolSize = limit ?? 15;
    if (sortedHighlights.length < minHighlightPoolSize && fallbackHighlights.length > 0) {
      fallbackHighlights.sort(
        (a, b) => b.affinityScore - a.affinityScore || sortByBidAndRecency(a.hl, b.hl)
      );
      sortedHighlights.push(
        ...fallbackHighlights.slice(0, minHighlightPoolSize - sortedHighlights.length).map((f) => f.hl)
      );
    }

    // Build shared cacheable highlights (without user-specific render counts)
    const sharedHighlights = sortedHighlights.map((h: any) => {
      const cat = String(h.interest || "").toLowerCase();
      const bid = parseFloat(h.bid_price || 0);
      const isHighestBidder = h.is_bidded && maxBidsByInterest[cat] !== undefined && bid >= maxBidsByInterest[cat] && bid > 0;

      let holdMins = 10;
      if (h.is_bidded) {
        holdMins = isHighestBidder ? 30 : 25;
      }

      return {
        id: h.id,
        title: h.title,
        content: h.content,
        image_url: h.image_url,
        interest: h.interest,
        user_email: h.user_email,
        created_at: h.created_at,
        country: h.country || null,
        state: h.state || null,
        province: h.province || null,
        is_bidded: h.is_bidded || false,
        bid_price: h.bid_price || null,
        campaign_days: h.campaign_days || 1,
        is_paused: h.is_paused || false,
        admin_statement: h.admin_statement || null,
        is_ai_content: !!h.is_ai_content,
        is_highest_bidder: isHighestBidder,
        user_render_count: 0,
        guaranteed_hold_mins: holdMins,
      };
    });

    // Cache the shared candidate list in L1 + L2 Redis
    await setCachedHighlights(interests, sharedHighlights, resolvedCountry || null, resolvedState || null);

    // Overlay per-user render count for this specific viewer
    const personalizedHighlights = sharedHighlights.map((h: any) => ({
      ...h,
      user_render_count: userViewsMap[h.id] || 0,
    }));

    const pagedHighlights = limit !== null ? personalizedHighlights.slice(offset, offset + limit) : personalizedHighlights;

    return NextResponse.json(pagedHighlights, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
      },
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/highlights:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
