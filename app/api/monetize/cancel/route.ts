import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { invalidateCachedProfile } from "@/lib/utils/cache";

export async function POST(req: NextRequest) {
  try {
    const userEmail = await getAuthenticatedEmail(req);
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { confirmEmail } = body;

    const cleanUserEmail = userEmail.toLowerCase().trim();
    const cleanConfirmEmail = confirmEmail ? String(confirmEmail).toLowerCase().trim() : "";

    // Human Verification: Ensure email matches
    if (!cleanConfirmEmail || cleanConfirmEmail !== cleanUserEmail) {
      return NextResponse.json(
        { error: "Email verification failed. Please type your exact email address to confirm cancellation." },
        { status: 400 }
      );
    }

    // Update user record: Cancel monetization & reset 300 clicks progress (Balance is preserved!)
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

    // Invalidate Redis Caches
    await Promise.all([
      invalidateCachedProfile(cleanUserEmail),
      redisConnection.del(`monetize:status:${cleanUserEmail}`),
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
