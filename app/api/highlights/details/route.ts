import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Highlight ID parameter is required" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    let isDeliveringActive = false;
    let { data: highlight } = await supabaseAdmin
      .from("news")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!highlight) {
      const { data: activeHl } = await supabaseAdmin
        .from("newsactive")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      highlight = activeHl;
      if (activeHl) isDeliveringActive = true;
    } else {
      const { data: activeHl } = await supabaseAdmin
        .from("newsactive")
        .select("id, campaign_days, bid_price, is_bidded")
        .eq("id", id)
        .maybeSingle();
      if (activeHl) isDeliveringActive = true;
    }

    if (!highlight) {
      return NextResponse.json({ error: "Highlight not found" }, { status: 404 });
    }

    if (highlight.user_email?.toLowerCase().trim() !== emailLower) {
      return NextResponse.json({ error: "Access denied. You do not own this highlight." }, { status: 403 });
    }

    const days = highlight.campaign_days || 1;
    const rate = highlight.is_bidded && highlight.bid_price ? Number(highlight.bid_price) : 1000;
    const originalTotalCost = days * rate;

    return NextResponse.json({
      success: true,
      highlight,
      isDeliveringActive,
      originalTotalCost,
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/highlights/details:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
