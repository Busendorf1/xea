import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { getCachedProfile, getCachedHighlights, setCachedHighlights } from "@/lib/utils/cache";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const interestsParam = searchParams.get("interests");
    let interests: string[] = [];

    if (interestsParam) {
      interests = interestsParam.split(",").map(i => i.trim()).filter(Boolean);
    } else {
      // Fallback: load interests from the user's cached profile
      const user = await getCachedProfile(email);
      if (user && user.interest) {
        interests = Array.isArray(user.interest)
          ? user.interest
          : typeof user.interest === "string"
          ? user.interest.split(",").map((i: string) => i.trim()).filter(Boolean)
          : [];
      } else {
        // If not cached, fetch user interests from Supabase
        const { data: dbUser, error: dbErr } = await supabaseReadOnly
          .from("users")
          .select("interest")
          .ilike("email", email)
          .maybeSingle();

        if (!dbErr && dbUser && dbUser.interest) {
          interests = Array.isArray(dbUser.interest)
            ? dbUser.interest
            : typeof dbUser.interest === "string"
            ? dbUser.interest.split(",").map((i: string) => i.trim()).filter(Boolean)
            : [];
        }
      }
    }

    // Strict 24-hour expiration window for daily highlights
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // If user has interests, try interest-filtered query first
    if (interests.length > 0) {
      // Try to get highlights from Redis cache first
      const cached = await getCachedHighlights(interests);

      if (cached && cached.length > 0) {
        console.log(`🚀 Highlights cache hit for interests: [${interests.join(",")}]`);
        return NextResponse.json(cached);
      }

      console.log(`🔄 Highlights cache miss. Fetching from Supabase for interests: [${interests.join(",")}]...`);

      const { data: matchedHighlights, error: matchError } = await supabaseReadOnly
        .from("newsactive")
        .select("id, title, content, image_url, interest, created_at")
        .in("interest", interests)
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!matchError && matchedHighlights && matchedHighlights.length > 0) {
        const highlights = matchedHighlights.map((h: any) => ({
          id: h.id,
          title: h.title,
          content: h.content,
          image_url: h.image_url,
          interest: h.interest,
          created_at: h.created_at,
        }));
        await setCachedHighlights(interests, highlights);
        return NextResponse.json(highlights);
      }

      console.log(`⚠️ No interest-matched highlights — falling back to all recent highlights.`);
    }

    // Fallback: fetch all recent highlights regardless of interest
    const { data: allHighlights, error: fallbackError } = await supabaseReadOnly
      .from("newsactive")
      .select("id, title, content, image_url, interest, created_at")
      .gte("created_at", twentyFourHoursAgo)
      .order("created_at", { ascending: false })
      .limit(20);

    if (fallbackError) {
      console.error("❌ Error fetching fallback highlights:", fallbackError);
      return NextResponse.json({ error: fallbackError.message }, { status: 500 });
    }

    const highlights = (allHighlights || []).map((h: any) => ({
      id: h.id,
      title: h.title,
      content: h.content,
      image_url: h.image_url,
      interest: h.interest,
      created_at: h.created_at,
    }));

    return NextResponse.json(highlights);
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/highlights:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
