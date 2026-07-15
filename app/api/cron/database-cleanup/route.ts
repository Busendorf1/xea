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

    // 4. Purge highlights older than 24 hours
    try {
      console.log("🧹 Cron: Purging expired highlights...");
      const { error: errNews } = await supabaseAdmin.rpc("delete_expired_news");
      if (errNews) {
        console.error("❌ Cron: Failed to purge expired highlights:", errNews.message);
      } else {
        console.log("✅ Cron: Expired highlights purged successfully.");
      }
    } catch (err: any) {
      console.error("❌ Cron: Unexpected error purging highlights:", err.message || err);
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
