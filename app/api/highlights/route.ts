import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { getCachedProfile, getCachedHighlights, setCachedHighlights } from "@/lib/utils/cache";

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
        interests = Array.isArray(user.interest)
          ? user.interest
          : typeof user.interest === "string"
          ? user.interest.split(",").map((i: string) => i.trim()).filter(Boolean)
          : [];
      } else {
        const { data: dbUser } = await supabaseReadOnly
          .from("users")
          .select("interest")
          .ilike("email", email)
          .maybeSingle();

        if (dbUser && dbUser.interest) {
          interests = Array.isArray(dbUser.interest)
            ? dbUser.interest
            : typeof dbUser.interest === "string"
            ? dbUser.interest.split(",").map((i: string) => i.trim()).filter(Boolean)
            : [];
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

    // Primary Query: Active highlights with targeting & bidding metadata
    let query = supabaseReadOnly
      .from("newsactive")
      .select("id, title, content, image_url, interest, created_at, user_email, country, state, province, is_bidded, bid_price, campaign_days, is_paused, admin_statement")
      .or("is_paused.eq.false,is_paused.is.null")
      .gte("created_at", fiveDaysAgo);

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

    // Rank Bidded highlights at the top sorted by bid_price DESC, then standard highlights by created_at DESC
    const sortedHighlights = (rawHighlights || []).sort((a: any, b: any) => {
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

    const highlights = sortedHighlights.map((h: any) => ({
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
      admin_statement: h.admin_statement || null
    }));

    // Cache the response in Redis for 30 Seconds
    await setCachedHighlights(interests, highlights, countryParam, stateParam);

    return NextResponse.json(highlights);
  } catch (err: any) {
    console.error("❌ Error in GET /api/highlights:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
