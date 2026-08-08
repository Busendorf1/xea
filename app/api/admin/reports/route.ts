import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { verifyAdminUser } from "@/lib/authHelper";

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
    const pageSize = 15;

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

    return NextResponse.json({ reports: data || [], count: count || 0 });
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

    const now = new Date().toISOString();
    const adminStatement = statement || "Deactivated by Admin due to Ad Guard content safety reports.";

    if (action === "deactivate_ad") {
      if (!adId) return NextResponse.json({ error: "Missing adId" }, { status: 400 });

      const updateData = {
        completed_at: now,
        is_paused: true,
        admin_statement: adminStatement
      };

      await supabaseAdmin.from("addsactive").update(updateData).eq("id", adId);
      await supabaseAdmin.from("adds").update(updateData).eq("id", adId);

      if (reportId) {
        await supabaseAdmin.from("ad_reports").update({ status: "action_taken" }).eq("id", reportId);
      }

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

      await supabaseAdmin.from("addsactive").update(updateData).eq("user_email", targetEmail);
      await supabaseAdmin.from("adds").update(updateData).eq("user_email", targetEmail);

      if (reportId) {
        await supabaseAdmin.from("ad_reports").update({ status: "action_taken" }).eq("id", reportId);
      }

      return NextResponse.json({ success: true, message: `All active campaigns by ${targetEmail} have been deactivated.` });
    }

    if (action === "dismiss_report") {
      if (!reportId) return NextResponse.json({ error: "Missing reportId" }, { status: 400 });

      await supabaseAdmin.from("ad_reports").update({ status: "dismissed" }).eq("id", reportId);
      return NextResponse.json({ success: true, message: "Report dismissed." });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) {
    console.error("❌ Exception in POST /api/admin/reports:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
