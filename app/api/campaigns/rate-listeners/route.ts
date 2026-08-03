import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { ad_id, star_rating } = body;

    if (!ad_id) {
      return NextResponse.json({ error: "Missing required field: ad_id" }, { status: 400 });
    }

    const stars = parseInt(star_rating, 10);
    if (isNaN(stars) || stars < 1 || stars > 5) {
      return NextResponse.json({ error: "Star rating must be an integer between 1 and 5" }, { status: 400 });
    }

    // Check if advertiser has already rated this ad
    const { data: existingRating } = await supabaseAdmin
      .from("completed_ads_ratings")
      .select("id, star_rating")
      .eq("ad_id", ad_id)
      .ilike("advertiser_email", email)
      .maybeSingle();

    if (existingRating) {
      return NextResponse.json(
        { error: `You have already rated this campaign (${existingRating.star_rating} Stars).` },
        { status: 409 }
      );
    }

    // Execute RPC function to batch update listener ATW scores
    const { data: increment, error: rpcErr } = await supabaseAdmin.rpc("apply_ad_rating_to_listeners", {
      p_ad_id: ad_id,
      p_advertiser_email: email,
      p_star_rating: stars,
    });

    if (rpcErr) {
      console.error("❌ Error running apply_ad_rating_to_listeners RPC:", rpcErr);
      return NextResponse.json({ error: "Failed to apply listener rating" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Thank you for rating! +${increment} Attention Score applied to all participating ad listeners.`,
      star_rating: stars,
      score_increment: increment,
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/campaigns/rate-listeners:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
