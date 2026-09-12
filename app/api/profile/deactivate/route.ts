import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { invalidateCachedProfile, invalidateAllHighlights } from "@/lib/utils/cache";
import { checkRateLimit } from "@/lib/edgeRateLimit";

export async function POST(req: NextRequest) {
  try {
    // 1. Abuse & Brute-Force Rate Limiting (5 attempts per 15 minutes per IP)
    const rateLimit = await checkRateLimit(req, {
      limit: 5,
      windowSeconds: 900,
      identifierPrefix: "deactivate",
      blockDurationSeconds: 1800,
    });
    if (!rateLimit.allowed && rateLimit.response) {
      return rateLimit.response;
    }

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
      .select('username, balance, "profileImage"')
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

    // 1. Asynchronous Media Cleanup: Schedule storage asset purging in background without delaying user response
    (async () => {
      try {
        const [userAds, userNews] = await Promise.all([
          supabaseAdmin.from("adds").select("ad_media_url").eq("user_email", emailLower),
          supabaseAdmin.from("news").select("image_url").eq("user_email", emailLower),
        ]);

        // Purge profile avatar from 'dp' bucket
        if (userProfile?.profileImage && userProfile.profileImage.includes("storage.supabase")) {
          const parts = userProfile.profileImage.split("/");
          const existingPath = `${parts.at(-2)}/${parts.at(-1)}`;
          await supabaseAdmin.storage.from("dp").remove([existingPath]).catch(() => {});
        }

        // Purge ad creative media from 'ad-media' bucket
        const adFilesToRemove: string[] = [];
        (userAds.data || []).forEach((ad: any) => {
          if (ad.ad_media_url && typeof ad.ad_media_url === "string") {
            ad.ad_media_url.split(",").forEach((url: string) => {
              const trimmed = url.trim();
              if (trimmed.includes("/ad-media/")) {
                const filename = trimmed.split("/ad-media/").pop()?.split("?")[0];
                if (filename) adFilesToRemove.push(filename);
              }
            });
          }
        });
        if (adFilesToRemove.length > 0) {
          await supabaseAdmin.storage.from("ad-media").remove(adFilesToRemove).catch(() => {});
        }

        // Purge highlight media from 'news' bucket
        const newsFilesToRemove: string[] = [];
        (userNews.data || []).forEach((item: any) => {
          if (item.image_url && typeof item.image_url === "string") {
            const trimmed = item.image_url.trim();
            if (trimmed.includes("/news/")) {
              const filename = trimmed.split("/news/").pop()?.split("?")[0];
              if (filename) newsFilesToRemove.push(filename);
            }
          }
        });
        if (newsFilesToRemove.length > 0) {
          await supabaseAdmin.storage.from("news").remove(newsFilesToRemove).catch(() => {});
        }
      } catch (storageErr) {
        console.warn("⚠️ Background storage cleanup notice:", storageErr);
      }
    })().catch(() => {});

    // 2. High-Speed Atomic Deletion: Try single-transaction PostgreSQL stored procedure first (~10ms)
    let rpcSucceeded = false;
    try {
      const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc("deactivate_user_atomic", {
        p_email: emailLower,
      });
      if (!rpcErr && rpcResult && (rpcResult as any).success === true) {
        rpcSucceeded = true;
      } else if (rpcErr) {
        console.warn("⚠️ deactivate_user_atomic RPC unavailable or failed, switching to direct fallback:", rpcErr.message);
      }
    } catch (rpcEx: any) {
      console.warn("⚠️ deactivate_user_atomic RPC exception, running direct fallback:", rpcEx?.message || rpcEx);
    }

    // 2b. Zero-Downtime Fallback: Execute comprehensive direct table deletions if RPC is not yet applied
    if (!rpcSucceeded) {
      await Promise.allSettled([
        supabaseAdmin.from("adds").delete().eq("user_email", emailLower),
        supabaseAdmin.from("addsactive").delete().eq("user_email", emailLower),
        supabaseAdmin.from("completed_ads").delete().eq("user_email", emailLower),
        supabaseAdmin.from("bidded_ads").delete().eq("user_email", emailLower),
        supabaseAdmin.from("news").delete().eq("user_email", emailLower),
        supabaseAdmin.from("newsactive").delete().eq("user_email", emailLower),
        supabaseAdmin.from("bidded_highlights").delete().eq("user_email", emailLower),
        supabaseAdmin.from("payments").delete().eq("user_email", emailLower),
        supabaseAdmin.from("notifications").delete().eq("user_email", emailLower),
        supabaseAdmin.from("ad_impressions").delete().eq("user_email", emailLower),
        supabaseAdmin.from("read_announcements").delete().eq("user_email", emailLower),
        supabaseAdmin.from("help_tickets").delete().eq("user_email", emailLower),
        supabaseAdmin.from("referrals").delete().or(`referrer_email.eq.${emailLower},referee_email.eq.${emailLower}`),
        supabaseAdmin.from("ad_reports").delete().or(`reporter_email.eq.${emailLower},advertiser_email.eq.${emailLower}`),
        supabaseAdmin.from("blocked_advertisers").delete().or(`reporter_email.eq.${emailLower},advertiser_email.eq.${emailLower}`),
        supabaseAdmin.from("blocked_ads").delete().eq("reporter_email", emailLower),
        supabaseAdmin.from("completed_ads_ratings").delete().eq("advertiser_email", emailLower),
        supabaseAdmin.from("newsletter_subscribers").delete().eq("email", emailLower),
        supabaseAdmin.from("premium_subscribers").delete().eq("user_email", emailLower),
      ]);

      // Delete user primary record from users table
      const { error: deleteUserErr } = await supabaseAdmin
        .from("users")
        .delete()
        .eq("email", emailLower);

      if (deleteUserErr) {
        console.error("❌ Error deleting user from users table:", deleteUserErr);
        return NextResponse.json({ error: deleteUserErr.message }, { status: 500 });
      }
    }

    // 3. Set Redis Replay-Attack Tombstone & Invalidate All Caches Instantly (<5ms)
    await Promise.allSettled([
      redisConnection.set(`deactivated:${emailLower}`, "1", "EX", 86400),
      invalidateCachedProfile(emailLower),
      invalidateAllHighlights(),
      redisConnection.del(`feed:ad_ids:${emailLower}`),
      redisConnection.del(`feed:ads:${emailLower}`),
      redisConnection.del(`feed:profiles:${emailLower}`),
      redisConnection.del(`feed:impressions:${emailLower}`),
      redisConnection.del(`statement:payments:${emailLower}`),
      redisConnection.del(`statement:withdrawals:${emailLower}`),
      redisConnection.del(`statement:all:${emailLower}`),
      redisConnection.del(`monetize:${emailLower}`),
      redisConnection.del(`atw:${emailLower}`),
      redisConnection.del(`rate:feed:${emailLower}`),
      redisConnection.del(`user:${emailLower}`),
      redisConnection.del(`profile:${emailLower}`),
    ]);

    // 4. Build response and revoke session authentication cookies immediately
    const res = NextResponse.json({ success: true, message: "Account deleted successfully" });
    res.cookies.set("appSession", "", { path: "/", expires: new Date(0), httpOnly: true, secure: process.env.NODE_ENV === "production" });
    res.cookies.set("auth0.is.authenticated", "", { path: "/", expires: new Date(0) });
    res.cookies.set("paayh_statement_cache", "", { path: "/", expires: new Date(0) });
    res.cookies.set("xea_session", "", { path: "/", expires: new Date(0) });

    return res;
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/profile/deactivate:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
