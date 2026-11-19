import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import { clearMonetizationUnlockDedup } from "@/lib/notifications/milestoneNotifications";

export async function POST(req: NextRequest) {
  try {
    const userEmail = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cleanUserEmail = userEmail.toLowerCase().trim();

    // Guard (M-03): Only allow resuming/resetting monetization if user actually opted out (`has_cancelled_monetization === true`)
    const { data: currentUser, error: fetchErr } = await supabaseAdmin
      .from("users")
      .select("has_cancelled_monetization")
      .ilike("email", cleanUserEmail)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: "Failed to verify monetization state." }, { status: 500 });
    }
    if (!currentUser?.has_cancelled_monetization) {
      return NextResponse.json(
        { error: "Monetization is not cancelled for this account." },
        { status: 400 }
      );
    }

    // Reset monetization_clicks to 0 and set monetized to false to start 500 clicks path
    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update({
        monetized: "false",
        monetized_at: null,
        monetization_clicks: 0,
        atw_tier: "ATW1",
        attention_worth_score: 0.1,
        has_cancelled_monetization: false,
      })
      .ilike("email", cleanUserEmail);

    if (updateErr) {
      console.error("❌ Error resuming monetization path:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Invalidate Redis Caches
    await Promise.all([
      invalidateCachedProfile(cleanUserEmail),
      clearMonetizationUnlockDedup(cleanUserEmail).catch(() => {}),
      redisConnection.del(`monetize:status:${cleanUserEmail}`).catch(() => {}),
      redisConnection.del(`monetize:status:v2:${cleanUserEmail}`).catch(() => {}),
      redisConnection.del(`user:live_clicks:${cleanUserEmail}`).catch(() => {}),
      redisConnection.del(`user:live_clicks:v2:${cleanUserEmail}`).catch(() => {}),
    ]).catch((err) => console.warn("⚠️ Redis cache invalidation error:", err));

    return NextResponse.json({
      success: true,
      message: "Monetization path resumed! Complete 500 clicks on feed ads to activate your account monetization.",
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/monetize/resume:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
