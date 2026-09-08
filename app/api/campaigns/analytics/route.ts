import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getCachedUserCampaignAnalytics, setCachedUserCampaignAnalytics } from "@/lib/utils/cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const reportsMap: Record<string, number> = {};
  const dismissalsMap: Record<string, number> = {};
  let advertiserBlockCount = 0;

  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();

    // 1. Check Redis Cache for 1-2ms response time
    const cachedAnalytics = await getCachedUserCampaignAnalytics(emailLower);
    if (cachedAnalytics) {
      return NextResponse.json(cachedAnalytics, {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
          "X-Cache": "HIT",
        },
      });
    }

    // 2. Fetch all user ad IDs across both review queue and active campaigns in parallel
    const [pendingAdsRes, activeAdsRes] = await Promise.all([
      supabaseAdmin.from("adds").select("id").eq("user_email", emailLower),
      supabaseAdmin.from("addsactive").select("id").eq("user_email", emailLower),
    ]);

    const adIds: string[] = [
      ...(pendingAdsRes.data || []).map((a) => a.id),
      ...(activeAdsRes.data || []).map((a) => a.id),
    ];

    // 3. Query reports, dismissals, and advertiser blocks in parallel
    const [reportsRes, blockedAdsRes, advBlockRes] = await Promise.all([
      adIds.length > 0
        ? supabaseAdmin.from("ad_reports").select("ad_id").in("ad_id", adIds)
        : Promise.resolve({ data: null, error: null }),
      adIds.length > 0
        ? supabaseAdmin.from("blocked_ads").select("ad_id").in("ad_id", adIds)
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from("blocked_advertisers")
        .select("id", { count: "exact", head: true })
        .eq("advertiser_email", emailLower),
    ]);

    if (reportsRes.data) {
      reportsRes.data.forEach((r: { ad_id?: string }) => {
        if (r.ad_id) {
          reportsMap[r.ad_id] = (reportsMap[r.ad_id] || 0) + 1;
        }
      });
    }

    if (blockedAdsRes.data) {
      blockedAdsRes.data.forEach((b: { ad_id?: string }) => {
        if (b.ad_id) {
          dismissalsMap[b.ad_id] = (dismissalsMap[b.ad_id] || 0) + 1;
        }
      });
    }

    if (advBlockRes.count !== null && advBlockRes.count !== undefined) {
      advertiserBlockCount = advBlockRes.count;
    }

    const payload = {
      success: true,
      reportsMap,
      dismissalsMap,
      advertiserBlockCount,
    };

    // 4. Save to Redis Cache in background (60s TTL)
    setCachedUserCampaignAnalytics(emailLower, payload).catch(() => {});

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        "X-Cache": "MISS",
      },
    });
  } catch (err: any) {
    console.error("❌ Exception in GET /api/campaigns/analytics:", err?.message || err);
    return NextResponse.json({
      success: true,
      reportsMap,
      dismissalsMap,
      advertiserBlockCount,
      warning: err?.message || "Analytics temporarily unavailable",
    });
  }
}
