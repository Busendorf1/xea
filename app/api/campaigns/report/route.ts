import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { adId, advertiserEmail, reportType, reason } = body;

    if (!adId || !reportType || !['ad', 'advertiser', 'dont_show'].includes(reportType)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const reporterEmail = email.toLowerCase().trim();
    const targetAdvertiser = (advertiserEmail || "").toLowerCase().trim();

    // 0. Enforce Rate Limit: 4 reports per 24 hours per user
    const rateLimitKey = `ratelimit:report:${reporterEmail}`;
    let currentCount = 0;
    try {
      const cnt = await redisConnection.get(rateLimitKey);
      currentCount = cnt ? parseInt(cnt, 10) : 0;
    } catch (e) {
      currentCount = 0;
    }

    if (currentCount >= 4) {
      return NextResponse.json(
        { error: "Limit reached, try again later." },
        { status: 429 }
      );
    }

    // Increment count & set 24-hour expiry (86400 seconds)
    try {
      await redisConnection.incr(rateLimitKey);
      if (currentCount === 0) {
        await redisConnection.expire(rateLimitKey, 86400);
      }
    } catch (e) {}

    // 1. Insert record into ad_reports only if escalated to admin ('ad' or 'advertiser')
    if (reportType === "ad" || reportType === "advertiser") {
      const { error: reportErr } = await supabaseAdmin
        .from("ad_reports")
        .insert({
          reporter_email: reporterEmail,
          ad_id: adId,
          advertiser_email: targetAdvertiser,
          report_type: reportType,
          reason: reason || null,
          status: "pending"
        });

      if (reportErr) {
        console.error("❌ Failed to insert ad_report:", reportErr);
      }
    }

    // 2. Insert into block table & Redis Sets for sub-millisecond filtering
    if (reportType === "ad" || reportType === "dont_show") {
      await supabaseAdmin
        .from("blocked_ads")
        .upsert({
          reporter_email: reporterEmail,
          ad_id: adId
        }, { onConflict: "reporter_email,ad_id" });

      await redisConnection.sadd(`blocked:ads:${reporterEmail}`, adId).catch(() => {});
    } else if (reportType === "advertiser" && targetAdvertiser) {
      await supabaseAdmin
        .from("blocked_advertisers")
        .upsert({
          reporter_email: reporterEmail,
          advertiser_email: targetAdvertiser
        }, { onConflict: "reporter_email,advertiser_email" });

      await redisConnection.sadd(`blocked:advertisers:${reporterEmail}`, targetAdvertiser).catch(() => {});
    }

    return NextResponse.json({ success: true, message: "Report submitted successfully." });
  } catch (err: any) {
    console.error("❌ Error in /api/campaigns/report:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
