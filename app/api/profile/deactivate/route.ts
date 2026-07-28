import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { invalidateCachedProfile, invalidateAllHighlights } from "@/lib/utils/cache";

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    console.log(`👤 Permanently deactivating and deleting account for: ${emailLower}`);

    // 1. Delete all associated user campaigns, bids, highlights, payments, impressions, and notifications
    await Promise.all([
      supabaseAdmin.from("adds").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("addsactive").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("bidded_ads").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("news").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("newsactive").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("payments").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("notifications").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("ad_impressions").delete().ilike("user_email", emailLower),
      supabaseAdmin.from("read_announcements").delete().ilike("user_email", emailLower),
    ]).catch((err) => console.error("⚠️ Error deleting user active campaigns:", err));

    // 2. Delete user profile record from users table
    const { error: deleteUserErr } = await supabaseAdmin
      .from("users")
      .delete()
      .ilike("email", emailLower);

    if (deleteUserErr) {
      console.error("❌ Error deleting user from users table:", deleteUserErr);
      return NextResponse.json({ error: deleteUserErr.message }, { status: 500 });
    }

    // 3. Clear Redis Caches
    await Promise.all([
      invalidateCachedProfile(emailLower),
      invalidateAllHighlights(),
      redisConnection.del(`feed:ad_ids:${emailLower}`),
      redisConnection.del(`feed:ads:${emailLower}`),
      redisConnection.del(`feed:profiles:${emailLower}`),
    ]).catch((err) => console.error("⚠️ Redis cache invalidation error:", err));

    return NextResponse.json({ success: true, message: "Account deleted successfully" });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/profile/deactivate:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
