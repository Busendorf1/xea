import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();

    // Call RPC check_and_update_monetization_status to enforce 7-day inactivity rule and fetch status
    const { data: statusData, error: statusErr } = await supabaseAdmin.rpc("check_and_update_monetization_status", {
      p_email: emailLower,
    });

    if (statusErr || !statusData || statusData.length === 0) {
      console.warn("⚠️ RPC check_and_update_monetization_status warning, querying users directly:", statusErr?.message);
      
      const { data: uData } = await supabaseReadOnly
        .from("users")
        .select("monetized, monetization_clicks, last_active_at, created_at")
        .ilike("email", emailLower)
        .maybeSingle();

      const clicks = uData?.monetization_clicks ?? 0;
      const isMonetized = !!(uData?.monetized === "true" || uData?.monetized === "yes" || uData?.monetized === true || clicks >= 300);
      
      return NextResponse.json({
        success: true,
        isMonetized,
        clicksCount: clicks,
        clicksRemaining: Math.max(0, 300 - clicks),
        targetClicks: 300,
        daysInactive: 0,
        lastActiveAt: uData?.last_active_at || null,
      });
    }

    const row = statusData[0];
    const isMonetized = !!row.monetized;
    const clicksCount = Number(row.monetization_clicks || 0);
    const clicksRemaining = Number(row.clicks_remaining || Math.max(0, 300 - clicksCount));
    const daysInactive = Number(row.days_inactive || 0);

    // Invalidate Redis profile cache to keep session synced
    invalidateCachedProfile(emailLower).catch(() => {});

    return NextResponse.json({
      success: true,
      isMonetized,
      clicksCount,
      clicksRemaining,
      targetClicks: 300,
      daysInactive,
      statusMessage: row.status_message,
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/monetize:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();

    // Increment click progress atomically
    const { data, error } = await supabaseAdmin.rpc("increment_user_click_progress", {
      p_email: emailLower,
    });

    if (error) {
      console.error("❌ RPC increment_user_click_progress error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    invalidateCachedProfile(emailLower).catch(() => {});

    const row = data?.[0] || { new_click_count: 0, is_now_monetized: false };
    return NextResponse.json({
      success: true,
      clicksCount: Number(row.new_click_count || 0),
      clicksRemaining: Math.max(0, 300 - Number(row.new_click_count || 0)),
      isMonetized: !!row.is_now_monetized,
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/monetize:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
