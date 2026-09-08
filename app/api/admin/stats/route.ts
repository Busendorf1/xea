import { NextRequest, NextResponse } from "next/server";
import { verifyAdminUser } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const fresh = searchParams.get("fresh") === "true";
    const cacheKey = "admin:overview:stats";
    
    // 1. Try fetching from Redis cache (120-second TTL unless fresh requested)
    if (!fresh) {
      try {
        const cachedStats = await redisConnection.get(cacheKey);
        if (cachedStats) {
          return NextResponse.json({
            ...JSON.parse(cachedStats),
            cached: true
          });
        }
      } catch (e) {
        console.warn("⚠️ Redis admin stats cache read error:", e);
      }
    }

    // 2. Cache Miss or Fresh requested: First attempt single-pass Postgres RPC (Zero-memory database aggregation)
    const { data: rpcStats, error: rpcError } = await supabaseAdmin.rpc("get_admin_overview_stats");

    if (!rpcError && rpcStats) {
      const statsData = {
        ...rpcStats,
        cached: false,
      };

      try {
        await redisConnection.set(cacheKey, JSON.stringify(statsData), "EX", 120);
      } catch (e) {
        console.warn("⚠️ Redis admin stats cache write error:", e);
      }

      return NextResponse.json(statsData);
    }

    console.warn("⚠️ get_admin_overview_stats RPC fallback triggered:", rpcError?.message);

    // 3. Fallback: Execute fast parallel count queries using head: true (zero row payload)
    const [
      { count: totalUsersCnt },
      { count: monetizedUsersCnt },
      { count: suspendedUsersCnt },
      { count: pAdsCount },
      { count: aAdsCount },
      { count: pHighlightsCount },
      { count: aHighlightsCount },
      { count: pausedAddsCnt },
      { count: pausedActiveCnt },
      { count: reportsCnt },
      { count: ticketsCnt },
      { data: recentAds }
    ] = await Promise.all([
      supabaseAdmin.from("users").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("users").select("*", { count: "exact", head: true }).or("monetized.eq.yes,monetized.eq.true"),
      supabaseAdmin.from("users").select("*", { count: "exact", head: true }).gt("suspended_until", new Date().toISOString()),
      supabaseAdmin.from("adds").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("addsactive").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("news").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("newsactive").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("adds").select("*", { count: "exact", head: true }).eq("is_paused", true),
      supabaseAdmin.from("addsactive").select("*", { count: "exact", head: true }).eq("is_paused", true),
      supabaseAdmin.from("ad_reports").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("help_tickets").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("addsactive").select("impression_count, mutual_adds_count, impressions").limit(100)
    ]);

    const resolvedAds = recentAds || [];
    const activeImpressions = resolvedAds.reduce((sum, ad) => sum + parseInt(ad.impression_count || 0), 0);
    const activeMutuals = resolvedAds.reduce((sum, ad) => sum + parseInt(ad.mutual_adds_count || 0), 0);
    const totalTargetImpressions = resolvedAds.reduce((sum, ad) => sum + parseInt(ad.impressions || 0), 0);
    const totalClicks = activeImpressions + activeMutuals;
    const clickRate = totalTargetImpressions > 0 ? (totalClicks / totalTargetImpressions) * 100 : 0;

    const statsData = {
      totalUsers: totalUsersCnt || 0,
      monetizedUsers: monetizedUsersCnt || 0,
      suspendedUsers: suspendedUsersCnt || 0,
      totalBalance: 0, // Computed by RPC
      totalWithdrawal: 0, // Computed by RPC
      pendingAdsCount: pAdsCount || 0,
      activeAdsCount: aAdsCount || 0,
      pendingHighlightsCount: pHighlightsCount || 0,
      activeHighlightsCount: aHighlightsCount || 0,
      totalClicks,
      totalMutuals: activeMutuals,
      clickRate,
      reportedCount: reportsCnt || 0,
      helpTicketsCount: ticketsCnt || 0,
      pausedAdsCount: (pausedAddsCnt || 0) + (pausedActiveCnt || 0),
      timestamp: new Date().toISOString()
    };

    try {
      await redisConnection.set(cacheKey, JSON.stringify(statsData), "EX", 60);
    } catch (e) {
      console.warn("⚠️ Redis admin stats cache write error:", e);
    }

    return NextResponse.json({
      ...statsData,
      cached: false
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/admin/stats:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
