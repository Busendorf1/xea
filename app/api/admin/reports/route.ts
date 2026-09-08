import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { verifyAdminUser } from "@/lib/authHelper";
import redisConnection from "@/lib/redis";

export const dynamic = "force-dynamic";

// GET /api/admin/reports?page=0
export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "0", 10);
    const search = searchParams.get("search")?.trim() || "";
    const fresh = searchParams.get("fresh") === "true";
    const pageSize = 15;

    const cacheKey = `admin:reports:page:${page}:${search.toLowerCase()}`;

    // 1. Try Redis cache (30s TTL)
    if (!fresh) {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          return NextResponse.json({ ...JSON.parse(cached), cached: true }, {
            headers: {
              "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
              "X-Cache": "HIT",
            },
          });
        }
      } catch (err) {
        console.warn("⚠️ Redis read error in /api/admin/reports:", err);
      }
    }

    let query = supabaseAdmin
      .from("ad_reports")
      .select("*", { count: "exact" });

    if (search) {
      query = query.or(`ad_id.ilike.%${search}%,reporter_email.ilike.%${search}%,advertiser_email.ilike.%${search}%,reason.ilike.%${search}%`);
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("❌ Error fetching ad_reports:", error);
      return NextResponse.json({ reports: [], count: 0, error: error.message });
    }

    const payload = { reports: data || [], count: count || 0 };

    try {
      await redisConnection.set(cacheKey, JSON.stringify(payload), "EX", 30);
    } catch {}

    return NextResponse.json(payload);
  } catch (e: any) {
    console.error("❌ Exception in GET /api/admin/reports:", e);
    return NextResponse.json({ reports: [], count: 0, error: e.message });
  }
}

// POST /api/admin/reports
export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { action, reportId, adId, advertiserEmail, statement } = body;
    const adminEmail = admin.email.toLowerCase();

    const now = new Date().toISOString();
    const adminStatement = statement || "Deactivated by Admin due to Ad Guard content safety reports.";

    if (action === "deactivate_ad") {
      if (!adId) return NextResponse.json({ error: "Missing adId" }, { status: 400 });

      const updateData = {
        completed_at: now,
        is_paused: true,
        admin_statement: adminStatement
      };

      await Promise.all([
        supabaseAdmin.from("addsactive").update(updateData).eq("id", adId),
        supabaseAdmin.from("adds").update(updateData).eq("id", adId),
      ]);

      if (reportId) {
        await supabaseAdmin.from("ad_reports").update({ status: "action_taken" }).eq("id", reportId);
      }

      // Evict Redis caches & record audit log
      try {
        await redisConnection.del(`ad:detail:${adId}`).catch(() => {});
        const feedKeys = await redisConnection.keys("feed:ads:*");
        if (feedKeys && feedKeys.length > 0) {
          await redisConnection.del(feedKeys);
        }
        const campaignKeys = await redisConnection.keys("admin:campaigns:*");
        if (campaignKeys && campaignKeys.length > 0) {
          await redisConnection.del(campaignKeys);
        }
        const reportKeys = await redisConnection.keys("admin:reports:*");
        if (reportKeys && reportKeys.length > 0) {
          await redisConnection.del(reportKeys);
        }
        await redisConnection.del("admin:overview:stats").catch(() => {});
        await supabaseAdmin.from("admin_audit_logs").insert([{
          admin_email: adminEmail,
          action: "deactivate_reported_ad",
          target_id: adId,
          target_type: "ad_campaign",
          reason: adminStatement,
        }]);
      } catch {}

      return NextResponse.json({ success: true, message: "Ad campaign deactivated successfully for all users." });
    }

    if (action === "block_advertiser") {
      if (!advertiserEmail) return NextResponse.json({ error: "Missing advertiserEmail" }, { status: 400 });

      const targetEmail = advertiserEmail.toLowerCase().trim();
      const updateData = {
        completed_at: now,
        is_paused: true,
        admin_statement: adminStatement
      };

      // 1. Fetch all ads by this advertiser to evict their Redis detail caches
      const { data: userAds } = await supabaseAdmin
        .from("addsactive")
        .select("id")
        .ilike("user_email", targetEmail);

      await Promise.all([
        supabaseAdmin.from("addsactive").update(updateData).ilike("user_email", targetEmail),
        supabaseAdmin.from("adds").update(updateData).ilike("user_email", targetEmail),
        // Update public.users account status to perm_banned
        supabaseAdmin.from("users").update({
          ad_account_status: "perm_banned",
          ad_ban_until: "2099-12-31T23:59:59Z",
          ad_ban_reason: adminStatement
        }).ilike("email", targetEmail)
      ]);

      if (reportId) {
        await supabaseAdmin.from("ad_reports").update({ status: "action_taken" }).eq("id", reportId);
      }

      try {
        if (userAds && userAds.length > 0) {
          const detailKeys = userAds.map((a: any) => `ad:detail:${a.id}`);
          await redisConnection.del(detailKeys);
        }
        const feedKeys = await redisConnection.keys("feed:ads:*");
        if (feedKeys && feedKeys.length > 0) {
          await redisConnection.del(feedKeys);
        }
        const campaignKeys = await redisConnection.keys("admin:campaigns:*");
        if (campaignKeys && campaignKeys.length > 0) {
          await redisConnection.del(campaignKeys);
        }
        const reportKeys = await redisConnection.keys("admin:reports:*");
        if (reportKeys && reportKeys.length > 0) {
          await redisConnection.del(reportKeys);
        }
        const userListKeys = await redisConnection.keys("admin:users:list:*");
        if (userListKeys && userListKeys.length > 0) {
          await redisConnection.del(userListKeys);
        }
        await redisConnection.del("admin:overview:stats").catch(() => {});
        await supabaseAdmin.from("admin_audit_logs").insert([{
          admin_email: adminEmail,
          action: "block_reported_advertiser",
          target_id: targetEmail,
          target_type: "advertiser_account",
          reason: adminStatement,
        }]);
      } catch {}

      return NextResponse.json({ success: true, message: `Advertiser ${targetEmail} banned and all active campaigns deactivated.` });
    }

    if (action === "dismiss_report") {
      if (!reportId) return NextResponse.json({ error: "Missing reportId" }, { status: 400 });

      await supabaseAdmin.from("ad_reports").update({ status: "dismissed" }).eq("id", reportId);

      try {
        const reportKeys = await redisConnection.keys("admin:reports:*");
        if (reportKeys && reportKeys.length > 0) {
          await redisConnection.del(reportKeys);
        }
        await supabaseAdmin.from("admin_audit_logs").insert([{
          admin_email: adminEmail,
          action: "dismiss_ad_report",
          target_id: reportId,
          target_type: "ad_report",
        }]);
      } catch {}

      return NextResponse.json({ success: true, message: "Report dismissed." });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) {
    console.error("❌ Exception in POST /api/admin/reports:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
