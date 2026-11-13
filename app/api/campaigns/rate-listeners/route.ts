import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { adRatingQueue } from "@/lib/queue";
import { getScoreIncrementForStars } from "@/lib/attentionTierEngine";
import {
  snapshotUserLevelsByEmails,
  notifyUpgradedUsersFromLevelMap,
} from "@/lib/notifications/milestoneNotifications";

async function findCampaignOwnerEmail(adId: string): Promise<string | null> {
  const tables = ["completed_ads", "addscompleted", "addsactive", "adds"] as const;
  for (const table of tables) {
    try {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select("user_email")
        .eq("id", adId)
        .maybeSingle();
      if (!error && data?.user_email) {
        return String(data.user_email).toLowerCase().trim();
      }
    } catch {}
  }
  return null;
}

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
      return NextResponse.json(
        { error: "Star rating must be an integer between 1 and 5" },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase().trim();

    // Verify campaign ownership before allowing advertiser rating
    const campaignOwnerEmail = await findCampaignOwnerEmail(String(ad_id));
    if (!campaignOwnerEmail) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    if (campaignOwnerEmail !== emailLower && !isAdminEmail(emailLower)) {
      return NextResponse.json(
        { error: "Forbidden: You can only rate listeners for your own campaigns." },
        { status: 403 }
      );
    }

    // 1. Check if advertiser has already rated this ad
    const { data: existingRating } = await supabaseAdmin
      .from("completed_ads_ratings")
      .select("id, star_rating")
      .eq("ad_id", ad_id)
      .ilike("advertiser_email", emailLower)
      .maybeSingle();

    if (existingRating) {
      return NextResponse.json(
        { error: `You have already rated this campaign (${existingRating.star_rating} Stars).` },
        { status: 409 }
      );
    }

    const scoreIncrement = getScoreIncrementForStars(stars);

    // 2. Enqueue BullMQ chunked ATW update (worker upserts completed_ads_ratings on chunked path,
    // or apply_ad_rating_to_listeners RPC inserts it atomically on legacy/fallback path).
    try {
      await adRatingQueue.add(
        "rate-listeners-job",
        {
          adId: ad_id,
          advertiserEmail: emailLower,
          starRating: stars,
        },
        {
          jobId: `rate_${ad_id}_${emailLower}`,
          removeOnComplete: true,
        }
      );
    } catch (queueErr) {
      console.warn("⚠️ BullMQ unavailable, executing direct RPC fallback:", queueErr);
      const { data: impRows } = await supabaseAdmin
        .from("ad_impressions")
        .select("user_email")
        .eq("ad_id", ad_id)
        .limit(500);
      const beforeSnapshot =
        impRows && impRows.length > 0 && impRows.length <= 500
          ? await snapshotUserLevelsByEmails(impRows.map((r: any) => String(r.user_email || "")))
          : new Map<string, number>();

      const { error: rpcErr } = await supabaseAdmin.rpc("apply_ad_rating_to_listeners", {
        p_ad_id: ad_id,
        p_advertiser_email: emailLower,
        p_star_rating: stars,
      });
      if (rpcErr) {
        if (rpcErr.message?.toLowerCase().includes("already been rated")) {
          return NextResponse.json(
            { error: "You have already rated this campaign." },
            { status: 409 }
          );
        }
        console.error("❌ Fallback RPC execution failed:", rpcErr.message || rpcErr);
        return NextResponse.json(
          { error: rpcErr.message || "Failed to apply listener ratings." },
          { status: 500 }
        );
      }

      if (beforeSnapshot.size > 0) {
        notifyUpgradedUsersFromLevelMap(beforeSnapshot).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      message: `Thank you for rating! +${scoreIncrement.toFixed(2)} Attention Score applied to all participating ad listeners.`,
      star_rating: stars,
      score_increment: scoreIncrement,
      queued: true,
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/campaigns/rate-listeners:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
