import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile, invalidateAllHighlights } from "@/lib/utils/cache";

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`👤 Deactivating account for: ${email}`);

    // 1. Clear Ads/News queues on primary database
    const deleteQueues = Promise.all([
      supabaseAdmin.from("adds").delete().ilike("user_email", email),
      supabaseAdmin.from("addsactive").delete().ilike("user_email", email),
      supabaseAdmin.from("news").delete().ilike("user_email", email),
      supabaseAdmin.from("newsactive").delete().ilike("user_email", email),
    ]);

    // 2. Update user profile state
    const updateProfile = supabaseAdmin
      .from("users")
      .update({
        balance: 0,
        monetized: "no",
        monetization_type: null,
        monetized_at: null,
        monetized_until: null,
      })
      .ilike("email", email)
      .select()
      .single();

    const [deleteResults, updateResult] = await Promise.all([deleteQueues, updateProfile]);

    const { data: updatedUser, error: updateError } = updateResult;

    if (updateError) {
      console.error("❌ Error deactivating user in database:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 3. Clear Redis Caches
    await Promise.all([
      invalidateCachedProfile(email),
      invalidateAllHighlights()
    ]);

    return NextResponse.json(updatedUser);
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/profile/deactivate:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
