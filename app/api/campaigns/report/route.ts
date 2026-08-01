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

    // 3. Invalidate Redis candidate feed cache for this user so blocked items evaporate immediately
    await redisConnection.del(`feed:ad_ids:${reporterEmail}`).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/campaigns/report:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
