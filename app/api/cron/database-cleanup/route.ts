import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { purgeStorageMedia } from "@/lib/utils/storageCleaner";
import { cleanupExpiredApprovedCampaigns } from "@/lib/services/cleanupService";
import { runRolloverSweep } from "../../../../lib/services/rolloverService";
import { isExemptFromBarriersAndInactivity } from "@/lib/adminHelper";
import { flushPendingAffiliateYield } from "@/lib/affiliateEngine";

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

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.warn("⚠️ Unauthorized cron database-cleanup attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🧹 Cron: Starting database-cleanup task...");

    // Flush any buffered/sharded affiliate yield
    try {
      await flushPendingAffiliateYield();
    } catch {}

    // Purge approved campaigns not published after 3 days
    try {
      console.log("🧹 Cron: Purging expired approved campaigns older than 3 days...");
      const cleanupApprovedRes = await cleanupExpiredApprovedCampaigns(true);
      console.log("✅ Cron: Expired approved campaigns purge result:", cleanupApprovedRes);
    } catch (cleanupErr: any) {
      console.error("❌ Cron: Error purging expired approved campaigns:", cleanupErr?.message || cleanupErr);
    }

    // 1.5. Transition eligible paid campaigns into Rollover Mode & roll unspent daily caps
    try {
      const rolloverRes = await runRolloverSweep({ batchSize: 200, maxBatches: 15 });
      console.log("✅ Cron: Ad rollover sweep result:", rolloverRes);
    } catch (rolloverErr: any) {
      console.error("❌ Cron: Error in rollover sweep:", rolloverErr?.message || rolloverErr);
    }

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

    // 3. Purge completed ads older than 48 hours from historical archive and active tables
    try {
      console.log("🧹 Cron: Purging expired completed ads from archive...");
      const { error: errAds } = await supabaseAdmin.rpc("delete_expired_completed_ads");
      if (errAds) {
        console.warn("⚠️ Cron: RPC delete_expired_completed_ads failed, executing direct fallback:", errAds.message);
      }
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const { data: expiredAds } = await supabaseAdmin
        .from("adds")
        .select("ad_media, ad_media_url")
        .not("completed_at", "is", null)
        .lt("completed_at", fortyEightHoursAgo);

      if (expiredAds && expiredAds.length > 0) {
        const mediaList: string[] = [];
        expiredAds.forEach((ad: any) => {
          if (ad.ad_media) mediaList.push(ad.ad_media);
          if (ad.ad_media_url) mediaList.push(ad.ad_media_url);
        });
        await purgeStorageMedia(mediaList, "ad-media");
      }

      await Promise.all([
        supabaseAdmin.from("addsactive").delete().not("completed_at", "is", null).lt("completed_at", fortyEightHoursAgo),
        supabaseAdmin.from("adds").delete().not("completed_at", "is", null).lt("completed_at", fortyEightHoursAgo),
        supabaseAdmin.from("completed_ads").delete().lt("completed_at", fortyEightHoursAgo),
      ]);
      console.log("✅ Cron: Completed ads purged successfully.");
    } catch (err: any) {
      console.error("❌ Cron: Unexpected error purging completed ads:", err.message || err);
    }

    // 4. Purge highlights past their actual expires_at / scheduled_end_at / campaign_days
    try {
      console.log("🧹 Cron: Purging expired highlights...");
      const { error: errNews } = await supabaseAdmin.rpc("delete_expired_news");
      if (errNews) {
        console.warn("⚠️ Cron: RPC delete_expired_news failed, executing duration-aware fallback deletion:", errNews.message);
        const nowMs = Date.now();
        const { data: activeNews } = await supabaseAdmin
          .from("newsactive")
          .select("id, image_url, expires_at, scheduled_end_at, scheduled_start_at, created_at, campaign_days")
          .limit(1000);

        const expiredRows = (activeNews || []).filter((n: any) => {
          const createdMs = n.created_at ? new Date(n.created_at).getTime() : nowMs;
          const scheduledStartMs = n.scheduled_start_at ? new Date(n.scheduled_start_at).getTime() : NaN;
          const startMs = !isNaN(scheduledStartMs) && scheduledStartMs > 0 ? Math.max(createdMs, scheduledStartMs) : createdMs;
          const explicitEndMs = n.expires_at
            ? new Date(n.expires_at).getTime()
            : n.scheduled_end_at
            ? new Date(n.scheduled_end_at).getTime()
            : NaN;
          const days = Math.max(1, Math.min(90, Number(n.campaign_days || 1)));
          const endMs = !isNaN(explicitEndMs) && explicitEndMs > startMs ? explicitEndMs : startMs + days * 86_400_000;
          return nowMs > endMs;
        });

        if (expiredRows.length > 0) {
          const imgList = expiredRows.map((n: any) => n.image_url).filter(Boolean);
          await purgeStorageMedia(imgList, "news");
          const expiredIds = expiredRows.map((n: any) => n.id).filter(Boolean);
          if (expiredIds.length > 0) {
            await supabaseAdmin.from("newsactive").delete().in("id", expiredIds);
          }
        }
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
          supabaseAdmin.from("global_announcements").delete().lt("created_at", fifteenDaysAgo),
        ]);
      } else {
        console.log("✅ Cron: Expired notifications purged successfully.");
      }
    } catch (err: any) {
      console.error("❌ Cron: Unexpected error purging notifications:", err.message || err);
    }

    // 7. Reset 7-day inactive monetized users (Exempts Admin, Career, and Affiliate accounts)
    try {
      console.log("🧹 Cron: Resetting 7-day inactive monetized users...");
      const { data: resetCnt, error: errReset } = await supabaseAdmin.rpc("reset_inactive_monetized_users");
      if (errReset) {
        console.warn("⚠️ Cron: RPC reset_inactive_monetized_users failed, executing direct fallback:", errReset.message);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: candidates } = await supabaseAdmin
          .from("users")
          .select("id, email, is_affiliate, is_career")
          .lt("last_active_at", sevenDaysAgo)
          .or("monetized.eq.true,monetized.eq.yes,monetization_clicks.gt.0")
          .limit(500);

        const resetIds = (candidates || [])
          .filter((u: any) => !isExemptFromBarriersAndInactivity(u.email, u))
          .map((u: any) => u.id);

        if (resetIds.length > 0) {
          await supabaseAdmin
            .from("users")
            .update({
              monetized: "false",
              monetization_clicks: 0,
              atw_tier: "ATW1",
              attention_worth_score: 0.1,
            })
            .in("id", resetIds);
        }
      } else {
        console.log(`✅ Cron: 7-day inactive monetized users reset successfully (Count: ${resetCnt ?? 0}).`);
      }
    } catch (err: any) {
      console.error("❌ Cron: Unexpected error resetting inactive users:", err.message || err);
    }

    // 8. Auto-partition inspector
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

    // 9. Forfeit balances & deactivate accounts inactive for 60+ days (Exempts Admin, Career, and Affiliate accounts)
    try {
      console.log("🧹 Cron: Checking for 60-day inactive accounts with unclaimed balances...");
      const { data: dormancyRpcRes, error: dormancyRpcErr } = await supabaseAdmin.rpc(
        "forfeit_dormant_user_balances_60_days"
      );

      if (dormancyRpcErr) {
        console.warn("⚠️ Cron: RPC forfeit_dormant_user_balances_60_days failed, executing hardened fallback:", dormancyRpcErr.message);
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        const { data: candidateUsers } = await supabaseAdmin
          .from("users")
          .select("id, email, username, balance, is_affiliate, is_career, ad_account_status")
          .lt("last_active_at", sixtyDaysAgo)
          .neq("ad_account_status", "deactivated")
          .limit(500);

        const eligibleUsers = (candidateUsers || []).filter(
          (u: any) => !isExemptFromBarriersAndInactivity(u.email, u)
        );

        let forfeitedCount = 0;
        const nowIso = new Date().toISOString();
        for (const u of eligibleUsers) {
          const emailLower = String(u.email || "").toLowerCase().trim();
          const bal = Number(u.balance || 0);
          if (bal > 0) {
            await supabaseAdmin.from("forfeited_balances").insert({
              user_email: emailLower,
              username: u.username || null,
              amount: bal,
              currency: "NGN",
              reason: "60-day dormant inactivity forfeiture",
              status: "PENDING",
              created_at: nowIso,
            });
            forfeitedCount++;
          }

          await supabaseAdmin
            .from("users")
            .update({
              balance: 0,
              monetized: "false",
              monetization_clicks: 0,
              atw_tier: "ATW1",
              ad_account_status: "deactivated",
            })
            .eq("id", u.id);

          try {
            await supabaseAdmin.rpc("deactivate_user_atomic", { p_email: emailLower });
          } catch {
            await supabaseAdmin
              .from("deactivated_users")
              .upsert({ email: emailLower, reason: "60_day_inactivity", deactivated_at: nowIso }, { onConflict: "email" })
              .then(() => {}, () => {});
          }
        }

        if (eligibleUsers.length > 0) {
          console.log(
            `⚠️ Cron: Fallback processed ${eligibleUsers.length} 60-day dormant account(s) (${forfeitedCount} forfeited).`
          );
        }
      } else {
        console.log("✅ Cron: 60-day dormancy RPC completed:", dormancyRpcRes);
      }
    } catch (err: any) {
      console.error("❌ Cron: Error executing 60-day inactive balance forfeiture:", err.message || err);
    }

    // 10. Prune persistent financial transfer idempotency keys older than 48 hours from Redis
    try {
      const redis = (await import("@/lib/redis")).default;
      const fortyEightHoursAgoMs = Date.now() - 48 * 60 * 60 * 1000;
      const expiredKeys = await redis.zrangebyscore("idempotency:transfer:zset", 0, fortyEightHoursAgoMs);
      if (expiredKeys && expiredKeys.length > 0) {
        const pipeline = redis.pipeline();
        expiredKeys.forEach((keyId) => {
          pipeline.del(`idempotency:transfer:${keyId}`);
        });
        pipeline.zremrangebyscore("idempotency:transfer:zset", 0, fortyEightHoursAgoMs);
        await pipeline.exec();
        console.log(`🧹 Cron: Purged ${expiredKeys.length} aged (>48h) transfer idempotency records from Redis.`);
      }
    } catch (err: any) {
      console.warn("⚠️ Cron: Idempotency pruning warning:", err?.message || err);
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
