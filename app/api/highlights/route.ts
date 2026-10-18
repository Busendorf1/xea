import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { getCachedProfile, getCachedHighlights, setCachedHighlights } from "@/lib/utils/cache";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { safeParseArray } from "@/lib/utils/parsers";

export const dynamic = "force-dynamic";


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
      } catch (e) {
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
    if (!profileSource || (!profileSource.interest && !profileSource.country)) {
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

    // 1. Check 30-Second Redis Edge Cache for 100M+ Scale Optimization (shared candidate list without per-user state)
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

    // Strict 5-day / 24-hour active window
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    // Primary Query: Active highlights with targeting & bidding metadata (ordered via DB B-Tree Index)
    let query = supabaseReadOnly
      .from("newsactive")
      .select("id, title, content, image_url, interest, created_at, user_email, country, state, province, is_bidded, bid_price, campaign_days, is_paused, admin_statement, is_ai_content")
      .or("is_paused.eq.false,is_paused.is.null")
      .gte("created_at", fiveDaysAgo)
      .order("is_bidded", { ascending: false })
      .order("bid_price", { ascending: false })
      .order("created_at", { ascending: false });

    let rawHighlights: any[] = [];
    const { data: primaryData, error } = await query;

    // Graceful Fallback if new columns (e.g. province) do not exist yet in schema cache
    if (error && (error.code === "42703" || error.message?.includes("does not exist"))) {
      console.warn("⚠️ Column missing on newsactive table — executing graceful fallback query...");
      const fallbackQuery = supabaseReadOnly
        .from("newsactive")
        .select("id, title, content, image_url, interest, created_at, user_email")
        .gte("created_at", fiveDaysAgo);

      const fallbackRes = await fallbackQuery;
      rawHighlights = fallbackRes.data || [];
    } else if (error) {
      console.error("❌ Error fetching highlights:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      rawHighlights = primaryData || [];
    }

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

    // Filter highlights strictly based on expiration rules AND interest/location targeting:
    // - If bidded: expires on the exact date/days bidded for (campaign_days * 24h)
    // - If not bidded: expires strictly after 24 hours
    const nowMs = Date.now();
    const validHighlights = (rawHighlights || []).filter((h: any) => {
      if (h.is_paused) return false;
      const createdAtMs = new Date(h.created_at).getTime();
      const diffHours = (nowMs - createdAtMs) / (1000 * 60 * 60);

      const isNotExpired = h.is_bidded
        ? diffHours < Math.max(1, Number(h.campaign_days || 1)) * 24
        : diffHours < 24;
      if (!isNotExpired) return false;

      // 1. Interest match (case-insensitive against registered user interests)
      if (normalizedViewerInterests.size > 0 && h.interest) {
        const hlInterest = String(h.interest).toLowerCase().trim();
        if (hlInterest && hlInterest !== "all" && hlInterest !== "general" && !normalizedViewerInterests.has(hlInterest)) {
          return false;
        }
      }

      // 2. Country match (if highlight targets a specific country)
      const hlCountry = h.country ? String(h.country).toLowerCase().trim() : "";
      if (hlCountry && hlCountry !== "all" && hlCountry !== "global" && normCountry) {
        if (hlCountry !== normCountry) return false;
      }

      // 3. State / Province / LocationSelector match (if highlight targets a state or province)
      const hlState = h.state ? String(h.state).toLowerCase().replace(/\b(state|province|region|county|district|lga)\b/g, "").trim() : "";
      const hlProvince = h.province ? String(h.province).toLowerCase().replace(/\b(state|province|region|county|district|lga)\b/g, "").trim() : "";

      if (hlState && hlState !== "all" && (normState || normCity)) {
        const stateMatched =
          (normState && (normState.includes(hlState) || hlState.includes(normState))) ||
          (normCity && (normCity.includes(hlState) || hlState.includes(normCity)));
        if (!stateMatched) return false;
      }

      if (hlProvince && hlProvince !== "all" && (normState || normCity)) {
        const provTokens = hlProvince.split(/[;,]/).map((s: string) => s.trim()).filter(Boolean);
        const provMatched = provTokens.some(
          (tok: string) =>
            (normCity && (normCity.includes(tok) || tok.includes(normCity))) ||
            (normState && (normState.includes(tok) || tok.includes(normState)))
        );
        if (!provMatched) return false;
      }

      return true;
    });

    // Rank Bidded highlights at the top sorted by bid_price DESC, then standard highlights by created_at DESC
    const sortedHighlights = validHighlights.sort((a: any, b: any) => {
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
    });

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

    // Cache the shared candidate list in Redis (free of per-user render count pollution)
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

