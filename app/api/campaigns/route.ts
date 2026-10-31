import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { getCachedUserCampaigns, setCachedUserCampaigns } from "@/lib/utils/cache";
import { checkRateLimit } from "@/lib/edgeRateLimit";
import { cleanupExpiredApprovedCampaigns } from "@/lib/services/cleanupService";
import { triggerSelfHealingJobsIfDue } from "@/lib/services/cronOrchestrator";
import { overlayPendingBufferedDeltas } from "@/lib/impressionBuffer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Edge Rate Limiting: max 60 requests/minute per IP
  const rateLimit = await checkRateLimit(req, {
    limit: 60,
    windowSeconds: 60,
    identifierPrefix: "campaigns",
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const url = new URL(req.url);
    const email = await getAuthenticatedEmail(req);

    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();

    // Self-healing JIT background cleanup of expired approved campaigns (>3 days)
    cleanupExpiredApprovedCampaigns().catch(() => {});
    triggerSelfHealingJobsIfDue().catch(() => {});
    const forceRefresh = url.searchParams.get("refresh") === "true";

    // 1. Check Redis Cache for ultra-fast 1-2ms response at 100M+ traffic
    if (!forceRefresh) {
      const cachedData = await getCachedUserCampaigns(emailLower);
      if (cachedData) {
        return NextResponse.json(cachedData, {
          headers: {
            "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
            "X-Cache": "HIT",
          },
        });
      }
    }

    // 2. Query all queues in parallel on read replica database using B-tree indexed lookups
    // Only completed ads from the last 72 hours are relevant (older are omitted from UI)
    const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const [
      adsQueue,
      adsActiveReal,
      adsCompleted,
      highlightsQueue,
      highlightsActive,
      ratingsData,
      advBlockRes,
    ] = await Promise.all([
      supabaseReadOnly.from("adds").select("*").ilike("user_email", emailLower).is("completed_at", null),
      supabaseReadOnly.from("addsactive").select("*").ilike("user_email", emailLower),
      supabaseReadOnly
        .from("completed_ads")
        .select("*")
        .ilike("user_email", emailLower)
        .gte("completed_at", seventyTwoHoursAgo)
        .order("completed_at", { ascending: false })
        .limit(50),
      supabaseReadOnly.from("news").select("*").ilike("user_email", emailLower),
      supabaseReadOnly.from("newsactive").select("*").ilike("user_email", emailLower),
      supabaseReadOnly.from("completed_ads_ratings").select("ad_id").ilike("advertiser_email", emailLower),
      supabaseReadOnly
        .from("blocked_advertisers")
        .select("id", { count: "exact", head: true })
        .ilike("advertiser_email", emailLower),
    ]);

    const combinedActive = [
      ...(adsActiveReal.data || []),
      ...(adsCompleted.data || []),
    ];

    const adIds: string[] = [
      ...(adsQueue.data || []).map((a: any) => a.id),
      ...(adsActiveReal.data || []).map((a: any) => a.id),
    ].filter(Boolean);

    const reportsMap: Record<string, number> = {};
    const dismissalsMap: Record<string, number> = {};
    const advertiserBlockCount = advBlockRes.count || 0;

    if (adIds.length > 0) {
      const [reportsRes, blockedAdsRes] = await Promise.all([
        supabaseReadOnly.from("ad_reports").select("ad_id").in("ad_id", adIds).limit(5000),
        supabaseReadOnly.from("blocked_ads").select("ad_id").in("ad_id", adIds).limit(5000),
      ]);
      if (reportsRes.data) {
        for (const r of reportsRes.data) {
          if (r.ad_id) reportsMap[r.ad_id] = (reportsMap[r.ad_id] || 0) + 1;
        }
      }
      if (blockedAdsRes.data) {
        for (const b of blockedAdsRes.data) {
          if (b.ad_id) dismissalsMap[b.ad_id] = (dismissalsMap[b.ad_id] || 0) + 1;
        }
      }
    }

    const ratedAdIds = (ratingsData.data || []).map((r: { ad_id: string }) => r.ad_id);
    const todayUtc = new Date().toISOString().slice(0, 10);

    const sanitizeItem = (item: any) => {
      if (!item) return item;
      let normalized = overlayPendingBufferedDeltas(item);
      // Normalize stale daily_impression_count when last_reset_date is prior to today UTC
      if (
        normalized.last_reset_date &&
        String(normalized.last_reset_date).slice(0, 10) < todayUtc &&
        Number(normalized.daily_impression_count || 0) > 0
      ) {
        normalized = { ...normalized, daily_impression_count: 0 };
      }
      const stmt = normalized.admin_statement;
      if (typeof stmt === "string") {
        const trimmed = stmt.trim();
        if (/^status:\s*pending_review$/i.test(trimmed) || trimmed === "pending_review" || trimmed === "STATUS:pending_review") {
          return { ...normalized, admin_statement: "Status: Pending review" };
        }
        if (trimmed.startsWith("STATUS:")) {
          const rest = trimmed.replace(/^STATUS:\s*/i, "").trim();
          return { ...normalized, admin_statement: rest === "pending_review" ? "Status: Pending review" : `Status: ${rest}` };
        }
      }
      return normalized;
    };

    const result = {
      adsQueue: (adsQueue.data || []).map(sanitizeItem),
      adsActive: combinedActive.map(sanitizeItem),
      highlightsQueue: (highlightsQueue.data || []).map(sanitizeItem),
      highlightsActive: (highlightsActive.data || []).map(sanitizeItem),
      ratedAdIds,
      reportsMap,
      dismissalsMap,
      advertiserBlockCount,
    };

    // 3. Cache in Redis with 30s TTL in the background
    setCachedUserCampaigns(emailLower, result).catch(() => {});

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
        "X-Cache": "MISS",
      },
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/campaigns:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
