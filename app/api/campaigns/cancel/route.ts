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
    console.log("📥 Cancel Ad Request parsed body:", body);

    const adIdInput = body.adId || body.id;
    if (!adIdInput) {
      return NextResponse.json({ error: "Missing adId" }, { status: 400 });
    }

    // Clean UUID string if it has surrounding quotes or whitespace
    const adId = String(adIdInput).replace(/^["']|["']$/g, "").trim();
    console.log(`🔍 Cleaned adId for cancel lookup: "${adId}"`);

    // 1. Try finding in 'adds' master table
    let { data: ad, error: fetchError } = await supabaseAdmin
      .from("adds")
      .select("user_email, completed_at")
      .eq("id", adId)
      .maybeSingle();

    if (fetchError) {
      console.error("❌ Error fetching from adds table:", fetchError.message);
    }

    // 2. Fallback to 'addsactive' table
    if (!ad) {
      const { data: activeAd, error: activeFetchError } = await supabaseAdmin
        .from("addsactive")
        .select("user_email, completed_at")
        .eq("id", adId)
        .maybeSingle();

      if (activeFetchError) {
        console.error("❌ Error fetching from addsactive table:", activeFetchError.message);
      }
      ad = activeAd;
    }

    if (!ad) {
      console.error(`❌ Ad campaign ${adId} not found in adds or addsactive. User email: ${email}`);
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
