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

    const cleanUserEmail = userEmail.toLowerCase().trim();

    // Reset monetization_clicks to 0 and set monetized to false to start 300 clicks path
    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update({
        monetized: "false",
        monetization_clicks: 0,
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
      redisConnection.del(`monetize:status:${cleanUserEmail}`),
    ]).catch((err) => console.warn("⚠️ Redis cache invalidation error:", err));

    return NextResponse.json({
      success: true,
      message: "Monetization path resumed! Complete 300 clicks on feed ads to activate your account monetization.",
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/monetize/resume:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
