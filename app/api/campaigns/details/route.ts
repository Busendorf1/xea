import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Ad ID parameter is required" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    // Query adds (pending/review queue) or addsactive (active)
    let { data: ad } = await supabaseAdmin
      .from("adds")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!ad) {
      const { data: activeAd } = await supabaseAdmin
        .from("addsactive")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      ad = activeAd;
    }

    if (!ad) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (ad.user_email?.toLowerCase().trim() !== emailLower) {
      return NextResponse.json({ error: "Access denied. You do not own this campaign." }, { status: 403 });
    }

    return NextResponse.json({ success: true, ad });

  } catch (err: any) {
    console.error("❌ Error in GET /api/campaigns/details:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
