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
    const { adId } = body;

    if (!adId) {
      return NextResponse.json({ error: "Missing adId" }, { status: 400 });
    }

    // 1. Verify ad ownership and current state
    const { data: ad, error: fetchError } = await supabaseAdmin
      .from("adds")
      .select("user_email, completed_at")
      .eq("id", adId)
      .maybeSingle();

    if (fetchError || !ad) {
      return NextResponse.json({ error: "Ad campaign not found" }, { status: 404 });
    }

    if (ad.user_email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden: You do not own this campaign" }, { status: 403 });
    }

    if (ad.completed_at) {
      return NextResponse.json({ error: "Campaign is already completed" }, { status: 400 });
    }

    const nowTimestamp = new Date().toISOString();

    // 2. Mark completed in 'adds'
    const { error: updateAddsError } = await supabaseAdmin
      .from("adds")
      .update({ completed_at: nowTimestamp })
      .eq("id", adId);

    if (updateAddsError) {
      console.error("❌ Error completing campaign in adds table:", updateAddsError.message);
      return NextResponse.json({ error: "Failed to cancel campaign" }, { status: 500 });
    }

    // 3. Mark completed in 'addsactive'
    const { error: updateAddsActiveError } = await supabaseAdmin
      .from("addsactive")
      .update({ completed_at: nowTimestamp })
      .eq("id", adId);

    if (updateAddsActiveError) {
      console.error("❌ Error completing campaign in addsactive table:", updateAddsActiveError.message);
    }

    return NextResponse.json({ success: true, message: "Campaign cancelled successfully. No refunds were issued." });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/campaigns/cancel:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
