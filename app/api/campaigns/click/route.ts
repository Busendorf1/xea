import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { adId, clickType } = body;

    if (!adId || !clickType) {
      return NextResponse.json({ error: "Missing adId or clickType" }, { status: 400 });
    }

    const validClickTypes = ["phone", "whatsapp", "website", "email"];
    if (!validClickTypes.includes(clickType)) {
      return NextResponse.json({ error: "Invalid clickType" }, { status: 400 });
    }

    // Call Supabase RPC increment_ad_click
    const { error } = await supabaseAdmin.rpc("increment_ad_click", {
      p_ad_id: adId,
      p_click_type: clickType
    });

    if (error) {
      console.error("❌ Error incrementing click in DB:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/campaigns/click:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
