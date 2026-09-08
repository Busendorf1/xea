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
    const body = await req.json().catch(() => ({}));
    const forfeitConfirmed = body?.forfeitConfirmed === true;
    const confirmEmail = body?.confirmEmail ? String(body.confirmEmail).toLowerCase().trim() : "";

    // Human Action Verification: Ensure confirmEmail matches authenticated email
    if (!confirmEmail || confirmEmail !== emailLower) {
      return NextResponse.json(
        { error: "Email verification failed. Please type your exact email address to confirm account deactivation." },
        { status: 400 }
      );
    }

    // 0. Verify User Balance Status
    const { data: userProfile } = await supabaseAdmin
      .from("users")
      .select("username, balance")
      .eq("email", emailLower)
      .maybeSingle();

    const currentBalance = parseFloat(userProfile?.balance || 0);

    if (currentBalance >= 10000) {
      const formattedBal = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(currentBalance);
      return NextResponse.json(
        { error: `You have an active balance of ${formattedBal}. Please initiate a withdrawal before deactivating your account.` },
        { status: 400 }
      );
    }

    if (currentBalance > 0 && !forfeitConfirmed) {
      const formattedBal = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(currentBalance);
      return NextResponse.json(
        {
          error: "FORFEIT_REQUIRED",
          message: `Your balance of ${formattedBal} is below the ₦10,000 minimum withdrawal limit. You must confirm that you willingly forfeit these remaining funds before deactivating your account.`,
          balance: currentBalance,
        },
        { status: 400 }
      );
    }

    // If balance is being forfeited (> 0), record in forfeited_balances queue and notify admin
    if (currentBalance > 0) {
      try {
        const username = userProfile?.username || emailLower.split("@")[0];

        // 0a. Insert into forfeited_balances table
        const { error: forfeitErr } = await supabaseAdmin
          .from("forfeited_balances")
          .insert([{
            user_email: emailLower,
            username,
            amount: currentBalance,
            currency: "NGN",
            reason: `Account deactivation forfeiture (Balance: ₦${currentBalance.toFixed(2)})`,
            status: "PENDING",
          }]);

        if (forfeitErr) {
          console.warn("⚠️ Warning: Could not insert into forfeited_balances:", forfeitErr.message);
        }

        // 0b. Notify all system administrators
        const envAdminEmails = (process.env.ADMIN_EMAILS || "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);

        const { data: dbAdmins } = await supabaseAdmin
          .from("users")
          .select("email")
          .or("is_admin.eq.true,role.eq.admin");

        const allAdminEmails = Array.from(new Set([
          ...envAdminEmails,
          ...((dbAdmins || []).map((a: any) => a.email.toLowerCase().trim()))
        ]));

        if (allAdminEmails.length > 0) {
          const formattedBal = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(currentBalance);
          const notificationRows = allAdminEmails.map((adminEmail) => ({
            user_email: adminEmail,
            title: "⚠️ Forfeited Balance: Account Deactivated",
            message: `User @${username} (${emailLower}) has deactivated their account and forfeited ${formattedBal}. This amount is queued for resolution to the platform treasury in the Admin Dashboard.`,
          }));

          try {
            await supabaseAdmin.from("notifications").insert(notificationRows);
          } catch (nErr) {
            console.warn("⚠️ Warning: Failed to send admin notifications for forfeited balance:", nErr);
          }
        }

        // 0c. Record entry in system_reconciliation_logs
        try {
          await supabaseAdmin.from("system_reconciliation_logs").insert([{
            status: "FLAGGED",
            total_credits_kobo: Math.round(currentBalance * 100),
            total_debits_kobo: 0,
            variance_kobo: Math.round(currentBalance * 100),
            notes: `Account deactivation forfeiture: @${username} (${emailLower}) forfeited ₦${currentBalance.toFixed(2)}. Awaiting admin resolution to platform balance.`,
          }]);
        } catch {}

      } catch (forfeitProcessingErr) {
        console.error("❌ Error tracking forfeited balance during deactivation:", forfeitProcessingErr);
      }
    }

    console.log(`👤 Permanently deactivating and deleting account for: ${emailLower} (Forfeited Balance: ₦${currentBalance})`);

    // 1. Delete all associated user campaigns, bids, highlights, payments, impressions, and notifications
    await Promise.all([
      supabaseAdmin.from("adds").delete().eq("user_email", emailLower),
      supabaseAdmin.from("addsactive").delete().eq("user_email", emailLower),
      supabaseAdmin.from("bidded_ads").delete().eq("user_email", emailLower),
      supabaseAdmin.from("news").delete().eq("user_email", emailLower),
      supabaseAdmin.from("newsactive").delete().eq("user_email", emailLower),
      supabaseAdmin.from("payments").delete().eq("user_email", emailLower),
      supabaseAdmin.from("notifications").delete().eq("user_email", emailLower),
      supabaseAdmin.from("ad_impressions").delete().eq("user_email", emailLower),
      supabaseAdmin.from("read_announcements").delete().eq("user_email", emailLower),
    ]).catch((err) => console.error("⚠️ Error deleting user active campaigns:", err));

    // 2. Delete user profile record from users table
    const { error: deleteUserErr } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("email", emailLower);

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
