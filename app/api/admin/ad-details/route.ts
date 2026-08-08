import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { verifyAdminUser } from "@/lib/authHelper";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Ad ID parameter is required" }, { status: 400 });
    }

    const cleanId = id.trim();

    // 1. Search in active ads table
    const { data: initialAd } = await supabaseAdmin
      .from("addsactive")
      .select("*")
      .eq("id", cleanId)
      .maybeSingle();

    let ad = initialAd;

    let table = "addsactive";

    // 2. If not found in addsactive, search in adds (pending review queue)
    if (!ad) {
      const { data: pendingAd } = await supabaseAdmin
        .from("adds")
        .select("*")
        .eq("id", cleanId)
        .maybeSingle();
      if (pendingAd) {
        ad = pendingAd;
        table = "adds";
      }
    }

    // 3. If not found in adds, search in completed_ads (archived)
    if (!ad) {
      const { data: completedAd } = await supabaseAdmin
        .from("completed_ads")
        .select("*")
        .eq("id", cleanId)
        .maybeSingle();
      if (completedAd) {
        ad = completedAd;
        table = "completed_ads";
      }
    }

    if (!ad) {
      return NextResponse.json({ error: `Ad campaign with ID '${cleanId}' was not found in database.` }, { status: 404 });
    }

    return NextResponse.json({ success: true, ad, table });

  } catch (err: any) {
    console.error("❌ Error in GET /api/admin/ad-details:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
