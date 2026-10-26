import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { purgeStorageMedia } from "@/lib/utils/storageCleaner";

const CLEANUP_THROTTLE_KEY = "cron:last_approved_cleanup";
const CLEANUP_INTERVAL_SECONDS = 300; // Run at most once every 5 minutes during traffic

export interface CleanupResult {
  adsPurged: number;
  newsPurged: number;
  skipped: boolean;
  error?: string;
}

/**
 * High-reliability cleanup for approved campaigns that were not published within 3 days (72 hours).
 * Runs completely independent of external cron jobs (Vercel cron) using a distributed Redis throttle.
 */
export async function cleanupExpiredApprovedCampaigns(force: boolean = false): Promise<CleanupResult> {
  // 1. Concurrency and Throttling via Redis
  if (!force && isRedisReady()) {
    try {
      const lock = await redisConnection.set(CLEANUP_THROTTLE_KEY, "RUNNING", "EX", CLEANUP_INTERVAL_SECONDS, "NX");
      if (!lock) {
        // Throttled: cleanup ran less than 5 minutes ago, skip safely
        return { adsPurged: 0, newsPurged: 0, skipped: true };
      }
    } catch (e) {
      console.warn("⚠️ Redis throttle error in cleanupExpiredApprovedCampaigns:", e);
    }
  }

  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  let adsPurged = 0;
  let newsPurged = 0;

  try {
    // 2. Find expired approved ads (filter directly in SQL to avoid full-table scans)
    const { data: pendingAds, error: adsFetchErr } = await supabaseAdmin
      .from("adds")
      .select("id, ad_media, ad_media_url, admin_statement, user_email, created_at")
      .like("admin_statement", "APPROVED:%")
      .limit(500);

    if (!adsFetchErr && pendingAds && pendingAds.length > 0) {
      const expiredAdIds: string[] = [];
      const mediaToPurge: string[] = [];

      for (const ad of pendingAds) {
        let isExpired = false;

        // Check structured statement fallback: APPROVED:2026-10-17T...
        if (ad.admin_statement && ad.admin_statement.startsWith("APPROVED:")) {
          const approvedTimestamp = ad.admin_statement.replace("APPROVED:", "").trim();
          const approvedDate = new Date(approvedTimestamp);
          if (!isNaN(approvedDate.getTime()) && approvedDate.getTime() < Date.now() - 72 * 60 * 60 * 1000) {
            isExpired = true;
          }
        }

        if (isExpired) {
          expiredAdIds.push(ad.id);
          if (ad.ad_media) mediaToPurge.push(ad.ad_media);
          if (ad.ad_media_url) mediaToPurge.push(ad.ad_media_url);
        }
      }

      if (expiredAdIds.length > 0) {
        // Purge media
        if (mediaToPurge.length > 0) {
          await purgeStorageMedia(mediaToPurge, "ad-media").catch((err) =>
            console.warn("Storage media purge notice:", err)
          );
        }

        // Delete from adds table
        const { error: delErr } = await supabaseAdmin.from("adds").delete().in("id", expiredAdIds);
        if (!delErr) {
          adsPurged = expiredAdIds.length;
          console.log(`🧹 Auto-cleanup: Successfully purged ${adsPurged} expired approved ad(s) older than 3 days.`);
        }
      }
    }

    // 3. Find expired approved highlights (news) — filter directly in SQL
    const { data: pendingNews, error: newsFetchErr } = await supabaseAdmin
      .from("news")
      .select("id, image_url, admin_statement, user_email, created_at")
      .like("admin_statement", "APPROVED:%")
      .limit(500);

    if (!newsFetchErr && pendingNews && pendingNews.length > 0) {
      const expiredNewsIds: string[] = [];
      const newsMediaToPurge: string[] = [];

      for (const item of pendingNews) {
        let isExpired = false;
        if (item.admin_statement && item.admin_statement.startsWith("APPROVED:")) {
          const approvedTimestamp = item.admin_statement.replace("APPROVED:", "").trim();
          const approvedDate = new Date(approvedTimestamp);
          if (!isNaN(approvedDate.getTime()) && approvedDate.getTime() < Date.now() - 72 * 60 * 60 * 1000) {
            isExpired = true;
          }
        }

        if (isExpired) {
          expiredNewsIds.push(item.id);
          if (item.image_url) newsMediaToPurge.push(item.image_url);
        }
      }

      if (expiredNewsIds.length > 0) {
        if (newsMediaToPurge.length > 0) {
          await purgeStorageMedia(newsMediaToPurge, "news").catch((err) =>
            console.warn("News media purge notice:", err)
          );
        }

        const { error: delNewsErr } = await supabaseAdmin.from("news").delete().in("id", expiredNewsIds);
        if (!delNewsErr) {
          newsPurged = expiredNewsIds.length;
          console.log(`🧹 Auto-cleanup: Successfully purged ${newsPurged} expired approved highlight(s) older than 3 days.`);
        }
      }
    }

    return { adsPurged, newsPurged, skipped: false };
  } catch (err: any) {
    console.error("❌ Error in cleanupExpiredApprovedCampaigns:", err);
    return { adsPurged, newsPurged, skipped: false, error: err.message };
  }
}
