import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { getCachedProfile, getCachedHighlights, setCachedHighlights } from "@/lib/utils/cache";
import redisConnection from "@/lib/redis";
import { safeParseArray } from "@/lib/utils/parsers";

export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const highestBidQuery = searchParams.get("highestBid");
    const interestQuery = searchParams.get("interest");

    // 0. Query highest bid price for an interest to guide advertisers
    if (highestBidQuery === "true" && interestQuery) {
      try {
        const { data: topBid } = await supabaseReadOnly
          .from("newsactive")
          .select("bid_price")
          .eq("interest", interestQuery)
          .eq("is_bidded", true)
          .order("bid_price", { ascending: false })
          .limit(1)
          .maybeSingle();

        const highestBid = topBid?.bid_price ? parseFloat(topBid.bid_price) : 1000;
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

    let interests: string[] = [];

    if (interestsParam) {
      interests = interestsParam.split(",").map(i => i.trim()).filter(Boolean);
    } else {
      const user = await getCachedProfile(email);
      if (user && user.interest) {
        interests = safeParseArray(user.interest);
      } else {
        const { data: dbUser } = await supabaseReadOnly
          .from("users")
          .select("interest")
          .eq("email", email.toLowerCase().trim())
          .maybeSingle();

        if (dbUser && dbUser.interest) {
          interests = safeParseArray(dbUser.interest);
        }
      }
    }

    // 1. Check 30-Second Redis Edge Cache for 100M+ Scale Optimization
    const cachedData = await getCachedHighlights(interests, countryParam, stateParam);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    // Strict 5-day / 24-hour active window
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    // Primary Query: Active highlights with targeting & bidding metadata (ordered via DB B-Tree Index)
    let query = supabaseReadOnly
      .from("newsactive")
      .select("id, title, content, image_url, interest, created_at, user_email, country, state, province, is_bidded, bid_price, campaign_days, is_paused, admin_statement")
      .or("is_paused.eq.false,is_paused.is.null")
      .gte("created_at", fiveDaysAgo)
      .order("is_bidded", { ascending: false })
      .order("bid_price", { ascending: false })
      .order("created_at", { ascending: false });

    if (interests.length > 0) {
      query = query.in("interest", interests);
    }

    if (countryParam) {
      query = query.or(`country.eq.${countryParam},country.is.null`);
    }
    if (stateParam) {
      query = query.or(`state.eq.${stateParam},state.is.null`);
    }

    let rawHighlights: any[] = [];
    const { data: primaryData, error } = await query;

    // Graceful Fallback if new columns (e.g. province) do not exist yet in schema cache
    if (error && (error.code === "42703" || error.message?.includes("does not exist"))) {
      console.warn("⚠️ Column missing on newsactive table — executing graceful fallback query...");
      let fallbackQuery = supabaseReadOnly
        .from("newsactive")
        .select("id, title, content, image_url, interest, created_at, user_email")
        .gte("created_at", fiveDaysAgo);

      if (interests.length > 0) {
        fallbackQuery = fallbackQuery.in("interest", interests);
      }
      const fallbackRes = await fallbackQuery;
      rawHighlights = fallbackRes.data || [];
    } else if (error) {
      console.error("❌ Error fetching highlights:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      rawHighlights = primaryData || [];
    }

    // Find max bid_price for each interest group to identify highest bidders
    const maxBidsByInterest: Record<string, number> = {};
    (rawHighlights || []).forEach((h: any) => {
      if (h.is_bidded && h.interest) {
        const bid = parseFloat(h.bid_price || 0);
        const cat = String(h.interest).toLowerCase();
        if (!maxBidsByInterest[cat] || bid > maxBidsByInterest[cat]) {
          maxBidsByInterest[cat] = bid;
        }
      }
    });

    // Fetch user's daily render count hash from Redis for per-highlight tracking
    const userViewsMap: Record<string, number> = {};
    if (email) {
      try {
        const dateStr = new Date().toISOString().split("T")[0];
        const emailKey = email.toLowerCase().trim();
        const viewsHash = await redisConnection.hgetall(`hl:views:${emailKey}:${dateStr}`);
        if (viewsHash) {
          Object.keys(viewsHash).forEach((hlId) => {
            userViewsMap[hlId] = parseInt(viewsHash[hlId] || "0", 10);
          });
        }
      } catch (err) {
        console.error("⚠️ Error fetching highlight views from Redis:", err);
      }
    }

    // Filter highlights strictly based on expiration rules:
    // - If bidded: expires on the exact date/days bidded for (campaign_days * 24h)
    // - If not bidded: expires strictly after 24 hours
    const nowMs = Date.now();
    const validHighlights = (rawHighlights || []).filter((h: any) => {
      if (h.is_paused) return false;
      const createdAtMs = new Date(h.created_at).getTime();
      const diffHours = (nowMs - createdAtMs) / (1000 * 60 * 60);

      if (h.is_bidded) {
        const allowedHours = Math.max(1, Number(h.campaign_days || 1)) * 24;
        return diffHours < allowedHours;
      } else {
        return diffHours < 24;
      }
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

    const highlights = sortedHighlights.map((h: any) => {
      const cat = String(h.interest || "").toLowerCase();
      const bid = parseFloat(h.bid_price || 0);
      const isHighestBidder = h.is_bidded && maxBidsByInterest[cat] !== undefined && bid >= maxBidsByInterest[cat] && bid > 0;
      const renderCount = userViewsMap[h.id] || 0;

      // Determine hold duration for section hierarchy:
      // Highest boosted = 30 mins hold
      // 2nd highest boosted = 25 mins hold
      // Standard (1000 fee) = 10 mins hold (drop interval)
      let holdMins = 10;
      if (h.is_bidded) {
        if (isHighestBidder) {
          holdMins = 30;
        } else {
          holdMins = 25;
        }
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
        is_highest_bidder: isHighestBidder,
        user_render_count: renderCount,
        guaranteed_hold_mins: holdMins
      };
    });


    // Cache the response in Redis for 30 Seconds
    await setCachedHighlights(interests, highlights, countryParam, stateParam);

    return NextResponse.json(highlights);
  } catch (err: any) {
    console.error("❌ Error in GET /api/highlights:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

