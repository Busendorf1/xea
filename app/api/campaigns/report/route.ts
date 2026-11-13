import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { evictAdFromL1FeedCaches } from "@/lib/utils/cache";

type NormalizedReportType = "ad" | "advertiser" | "dont_show";

function normalizeReportType(raw: unknown): NormalizedReportType | null {
  const val = String(raw || "").trim().toLowerCase();
  if (val === "ad" || val === "block_ad") return "ad";
  if (val === "advertiser" || val === "block_advertiser") return "advertiser";
  if (val === "dont_show") return "dont_show";
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { adId, advertiserEmail, reportType: rawReportType, reason } = body;
    const reportType = normalizeReportType(rawReportType);

    if (!adId || !reportType) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const reporterEmail = email.toLowerCase().trim();
    let targetAdvertiser = (advertiserEmail || "").toLowerCase().trim();

    // Enforce rate limit: 4 escalated reports per 24 hours per user (dont_show is private feed hygiene)
    if (reportType === "ad" || reportType === "advertiser") {
      const rateLimitKey = `ratelimit:report:${reporterEmail}`;
      let currentCount = 0;
      if (isRedisReady()) {
        try {
          const cnt = await redisConnection.get(rateLimitKey);
          currentCount = cnt ? parseInt(cnt, 10) : 0;
        } catch {
          currentCount = 0;
        }

        if (currentCount >= 4) {
          return NextResponse.json(
            { error: "Limit reached, try again later." },
            { status: 429 }
          );
        }

        try {
          await redisConnection.incr(rateLimitKey);
          if (currentCount === 0) {
            await redisConnection.expire(rateLimitKey, 86400);
          }
        } catch {}
      }
    }

    // Resolve advertiser email from active campaign if blocking advertiser without explicit email
    if (reportType === "advertiser" && !targetAdvertiser) {
      try {
        const { data: adRow } = await supabaseAdmin
          .from("addsactive")
          .select("user_email")
          .eq("id", adId)
          .maybeSingle();
        if (adRow?.user_email) {
          targetAdvertiser = String(adRow.user_email).toLowerCase().trim();
        }
      } catch {}
    }

    // 1. Escalate report to admin review queue only when user explicitly reports ad or advertiser
    if (reportType === "ad" || reportType === "advertiser") {
      const { error: reportErr } = await supabaseAdmin.from("ad_reports").insert({
        reporter_email: reporterEmail,
        ad_id: adId,
        advertiser_email: targetAdvertiser,
        report_type: reportType,
        reason: reason || null,
        status: "pending",
      });

      if (reportErr) {
        console.error("❌ Failed to insert ad_report:", reportErr);
      }
    }

    // 2. Persist per-user block rules & update Redis sets + invalidate viewer feed caches
    if (reportType === "ad" || reportType === "dont_show") {
      await supabaseAdmin
        .from("blocked_ads")
        .upsert(
          {
            reporter_email: reporterEmail,
            ad_id: adId,
          },
          { onConflict: "reporter_email,ad_id" }
        );

      if (isRedisReady()) {
        await Promise.all([
          redisConnection.sadd(`blocked:ads:${reporterEmail}`, adId).catch(() => {}),
          redisConnection.expire(`blocked:ads:${reporterEmail}`, 86400 * 90).catch(() => {}),
          redisConnection.del(`feed:ad_ids:${reporterEmail}`, `feed:profiles:${reporterEmail}`).catch(() => {}),
        ]);
      }
    } else if (reportType === "advertiser" && targetAdvertiser) {
      await supabaseAdmin
        .from("blocked_advertisers")
        .upsert(
          {
            reporter_email: reporterEmail,
            advertiser_email: targetAdvertiser,
          },
          { onConflict: "reporter_email,advertiser_email" }
        );

      if (isRedisReady()) {
        await Promise.all([
          redisConnection.sadd(`blocked:advertisers:${reporterEmail}`, targetAdvertiser).catch(() => {}),
          redisConnection.expire(`blocked:advertisers:${reporterEmail}`, 86400 * 90).catch(() => {}),
          redisConnection.del(`feed:ad_ids:${reporterEmail}`, `feed:profiles:${reporterEmail}`).catch(() => {}),
        ]);
      }
    }

    // Ensure ad disappears immediately if still in process L1 cache for single-node environments
    if (reportType === "ad" || reportType === "dont_show") {
      evictAdFromL1FeedCaches(adId);
    }

    return NextResponse.json({
      success: true,
      reportType,
      message: "Report submitted successfully.",
    });
  } catch (err: any) {
    console.error("❌ Error in /api/campaigns/report:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
