import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { invalidateCachedProfile } from "@/lib/utils/cache";

export async function POST(req: NextRequest) {
  try {
    const userEmail = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { confirmEmail, holdConfirmed } = body;

    const cleanUserEmail = userEmail.toLowerCase().trim();
    let isConfirmed = Boolean(holdConfirmed);

    if (!isConfirmed && confirmEmail) {
      const cleanConfirm = String(confirmEmail).toLowerCase().trim().replace(/^@/, "");
      if (cleanConfirm === cleanUserEmail) {
        isConfirmed = true;
      } else {
        const { data: u } = await supabaseAdmin
          .from("users")
          .select("username")
          .ilike("email", cleanUserEmail)
          .maybeSingle();
        if (u?.username && cleanConfirm === u.username.toLowerCase().trim().replace(/^@/, "")) {
          isConfirmed = true;
        }
      }
    }

    if (!isConfirmed) {
      return NextResponse.json(
        { error: "Confirmation required. Please confirm your email, username, or hold to confirm cancellation." },
        { status: 400 }
      );
    }

    // Update user record: Cancel monetization & reset progress (Balance is preserved!)
    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update({
        monetized: "false",
        monetization_clicks: 0,
        has_cancelled_monetization: true,
      })
      .ilike("email", cleanUserEmail);

    if (updateErr) {
      console.error("❌ Error cancelling monetization:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Invalidate L1 & L2 Redis Caches including live_clicks counter so GET /api/monetize never re-monetizes
    await Promise.all([
      invalidateCachedProfile(cleanUserEmail),
      redisConnection.del(`monetize:status:${cleanUserEmail}`).catch(() => {}),
      redisConnection.del(`monetize:status:v2:${cleanUserEmail}`).catch(() => {}),
      redisConnection.del(`user:live_clicks:${cleanUserEmail}`).catch(() => {}),
      redisConnection.del(`user:live_clicks:v2:${cleanUserEmail}`).catch(() => {}),
    ]).catch((err) => console.warn("⚠️ Redis cache invalidation error:", err));

    return NextResponse.json({
      success: true,
      message: "Monetization cancelled successfully. Your wallet balance is preserved and remains available for withdrawal.",
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/monetize/cancel:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
