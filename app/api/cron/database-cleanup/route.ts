import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  try {
    // 1. Authenticate the request
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn("⚠️ Unauthorized cron database-cleanup attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🧹 Cron: Starting database-cleanup task...");

    // 2. Archive expired active platform campaigns (moving them from addsactive -> completed_ads)
    try {
      console.log("🧹 Cron: Archiving expired active platform ads...");
      const { error: errPlatform } = await supabaseAdmin.rpc("archive_expired_platform_ads");
      if (errPlatform) {
        console.error("❌ Cron: Failed to archive expired platform ads:", errPlatform.message);
      } else {
        console.log("✅ Cron: Expired platform ads archived successfully.");
      }
    } catch (err: any) {
      console.error("❌ Cron: Unexpected error archiving platform ads:", err.message || err);
    }

    // 3. Purge completed ads older than 24 hours from historical archive
    try {
      console.log("🧹 Cron: Purging expired completed ads from archive...");
      const { error: errAds } = await supabaseAdmin.rpc("delete_expired_completed_ads");
      if (errAds) {
        console.error("❌ Cron: Failed to purge expired completed ads:", errAds.message);
      } else {
        console.log("✅ Cron: Completed ads purged successfully.");
      }
    } catch (err: any) {
      console.error("❌ Cron: Unexpected error purging completed ads:", err.message || err);
    }

    // 4. Purge highlights older than campaign_days (1-5 days)
    try {
      console.log("🧹 Cron: Purging expired highlights...");
      const { error: errNews } = await supabaseAdmin.rpc("delete_expired_news");
      if (errNews) {
        console.warn("⚠️ Cron: RPC delete_expired_news failed, executing direct fallback deletion:", errNews.message);
        // Fallback: direct delete for highlights older than 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        await supabaseAdmin.from("newsactive").delete().lt("created_at", twentyFourHoursAgo);
      } else {
        console.log("✅ Cron: Expired highlights purged successfully.");
      }
    } catch (err: any) {
      console.error("❌ Cron: Unexpected error purging highlights:", err.message || err);
    }

    // 5. Purge resolved help tickets older than 24 hours
    try {
      console.log("🧹 Cron: Purging resolved help tickets older than 24 hours...");
      const { error: errTickets } = await supabaseAdmin.rpc("delete_resolved_help_tickets");
      if (errTickets) {
        console.warn("⚠️ Cron: RPC delete_resolved_help_tickets failed, executing direct fallback deletion:", errTickets.message);
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        await supabaseAdmin
          .from("help_tickets")
          .delete()
          .not("resolved_at", "is", null)
          .lt("resolved_at", twentyFourHoursAgo);
      } else {
        console.log("✅ Cron: Resolved help tickets purged successfully.");
      }
    } catch (err: any) {
      console.error("❌ Cron: Unexpected error purging help tickets:", err.message || err);
    }

    // 6. Purge notifications older than 15 days
    try {
      console.log("🧹 Cron: Purging notifications older than 15 days...");
      const { error: errNotifs } = await supabaseAdmin.rpc("delete_expired_notifications");
      if (errNotifs) {
        console.warn("⚠️ Cron: RPC delete_expired_notifications failed, executing direct fallback deletion:", errNotifs.message);
        const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
        await Promise.all([
          supabaseAdmin.from("notifications").delete().lt("created_at", fifteenDaysAgo),
          supabaseAdmin.from("global_announcements").delete().lt("created_at", fifteenDaysAgo)
        ]);
      } else {
        console.log("✅ Cron: Expired notifications purged successfully.");
      }
    } catch (err: any) {
      console.error("❌ Cron: Unexpected error purging notifications:", err.message || err);
    }

    // 7. Reset 7-day inactive monetized users
    try {
      console.log("🧹 Cron: Resetting 7-day inactive monetized users...");
      const { data: resetCnt, error: errReset } = await supabaseAdmin.rpc("reset_inactive_monetized_users");
      if (errReset) {
        console.warn("⚠️ Cron: RPC reset_inactive_monetized_users failed, executing direct fallback:", errReset.message);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        await supabaseAdmin
          .from("users")
          .update({ monetized: "false", monetization_clicks: 0 })
          .lt("last_active_at", sevenDaysAgo)
          .or("monetized.eq.true,monetized.eq.yes,monetization_clicks.gt.0");
      } else {
        console.log(`✅ Cron: 7-day inactive monetized users reset successfully (Count: ${resetCnt ?? 0}).`);
      }
    } catch (err: any) {
      console.error("❌ Cron: Unexpected error resetting inactive users:", err.message || err);
    }

    // 8. Auto-partition inspector (Triggers automatic partitioning as soon as ad_impressions hits 1 Million rows)
    try {
      console.log("🧹 Cron: Inspecting ad_impressions row count for 1M-row auto-partitioning...");
      const { data: isPartitioned, error: errPartition } = await supabaseAdmin.rpc("check_and_auto_partition_at_1m");
      if (errPartition) {
        console.warn("⚠️ Cron: check_and_auto_partition_at_1m warning:", errPartition.message);
      } else if (isPartitioned) {
        console.log("🚀 Cron: ad_impressions reached 1 Million rows! Automatic table partitioning executed successfully.");
      }
    } catch (err: any) {
      console.error("❌ Cron: Unexpected error inspecting auto-partitioning threshold:", err.message || err);
    }

    // 9. Forfeit balances of accounts inactive for 60+ days (last_active_at < 60 days ago)
    try {
      console.log("🧹 Cron: Checking for 60-day inactive accounts with unclaimed balances...");
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data: forfeitedUsers } = await supabaseAdmin
        .from("users")
        .update({ balance: 0 })
        .lt("last_active_at", sixtyDaysAgo)
        .gt("balance", 0)
        .select("email, balance");

      if (forfeitedUsers && forfeitedUsers.length > 0) {
        console.log(`⚠️ Cron: Forfeited unclaimed balances for ${forfeitedUsers.length} account(s) inactive for 60+ days.`);
      }
    } catch (err: any) {
      console.error("❌ Cron: Error executing 60-day inactive balance forfeiture:", err.message || err);
    }

    console.log("🧹 Cron: Database-cleanup task completed successfully.");

    return NextResponse.json({
      success: true,
      message: "Database cleanup completed successfully.",
    });
  } catch (err: any) {
    console.error("❌ Cron: Unexpected crash in database-cleanup:", err);
    return NextResponse.json({ error: err.message || "Cron task failed" }, { status: 500 });
  }
}
