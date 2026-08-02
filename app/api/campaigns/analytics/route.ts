import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function GET(req: NextRequest) {
  let reportsMap: Record<string, number> = {};
  let dismissalsMap: Record<string, number> = {};
  let advertiserBlockCount = 0;

  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();

    // 1. Fetch user's ad IDs safely
    let adIds: string[] = [];
    try {
      const { data: ads, error: adsErr } = await supabaseAdmin
        .from("adds")
        .select("id")
        .ilike("user_email", emailLower);

      if (!adsErr && ads) {
        adIds = ads.map((a) => a.id);
      }
    } catch (e: any) {
      console.warn("⚠️ Warning fetching user ads for analytics:", e?.message || e);
    }

    // 2. Query ad reports count per ad safely
    if (adIds.length > 0) {
      try {
        const { data: reports, error: reportsErr } = await supabaseAdmin
          .from("ad_reports")
          .select("ad_id")
          .in("ad_id", adIds);

        if (!reportsErr && reports) {
          reports.forEach((r) => {
            if (r.ad_id) {
              reportsMap[r.ad_id] = (reportsMap[r.ad_id] || 0) + 1;
            }
          });
        }
      } catch (e: any) {
        console.warn("⚠️ Warning fetching ad reports for analytics:", e?.message || e);
      }

      // 3. Query "Don't show again" dismissals count per ad safely
      try {
        const { data: blockedAds, error: blockedErr } = await supabaseAdmin
          .from("blocked_ads")
          .select("ad_id")
          .in("ad_id", adIds);

        if (!blockedErr && blockedAds) {
          blockedAds.forEach((b) => {
            if (b.ad_id) {
              dismissalsMap[b.ad_id] = (dismissalsMap[b.ad_id] || 0) + 1;
            }
          });
        }
      } catch (e: any) {
        console.warn("⚠️ Warning fetching blocked ads for analytics:", e?.message || e);
      }
    }

    // 4. Query total advertiser blocks count against this user safely
    try {
      const { count, error: advBlockErr } = await supabaseAdmin
        .from("blocked_advertisers")
        .select("id", { count: "exact", head: true })
        .ilike("advertiser_email", emailLower);

      if (!advBlockErr && count !== null && count !== undefined) {
        advertiserBlockCount = count;
      }
    } catch (e: any) {
      console.warn("⚠️ Warning fetching advertiser block count:", e?.message || e);
    }

    return NextResponse.json({
      success: true,
      reportsMap,
      dismissalsMap,
      advertiserBlockCount,
    });
  } catch (err: any) {
    console.error("❌ Exception in GET /api/campaigns/analytics:", err?.message || err);
    // Return graceful fallback rather than breaking client rendering
    return NextResponse.json({
      success: true,
      reportsMap,
      dismissalsMap,
      advertiserBlockCount,
      warning: err?.message || "Analytics temporarily unavailable"
    });
  }
}
