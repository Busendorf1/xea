import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cacheKey = "admin:overview:stats";
    
    // 1. Try fetching from Redis cache (10-minute TTL = 600s)
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

    // 2. Cache Miss: Execute parallel aggregated queries via supabaseAdmin
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
      { data: activeAdsStats },
      { data: pendingAdsStats },
      { data: profileStats }
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
      supabaseAdmin.from("addsactive").select("impression_count, mutual_adds_count, impressions"),
      supabaseAdmin.from("adds").select("impression_count, mutual_adds_count, impressions"),
      supabaseAdmin.from("users").select("balance, withdrawal, mutual_count")
    ]);

    const resolvedActiveAds = activeAdsStats || [];
    const resolvedPendingAds = pendingAdsStats || [];
    const resolvedProfiles = profileStats || [];

    const totalBalance = resolvedProfiles.reduce((sum, u) => sum + (parseFloat(u.balance) || 0), 0);
    const totalWithdrawal = resolvedProfiles.reduce((sum, u) => sum + (parseFloat(u.withdrawal) || 0), 0);
    const totalMutuals = resolvedProfiles.reduce((sum, u) => sum + (parseInt(u.mutual_count) || 0), 0);

    const activeImpressions = resolvedActiveAds.reduce((sum, ad) => sum + parseInt(ad.impression_count || 0), 0);
    const pendingImpressions = resolvedPendingAds.reduce((sum, ad) => sum + parseInt(ad.impression_count || 0), 0);
    const activeMutuals = resolvedActiveAds.reduce((sum, ad) => sum + parseInt(ad.mutual_adds_count || 0), 0);
    const pendingMutuals = resolvedPendingAds.reduce((sum, ad) => sum + parseInt(ad.mutual_adds_count || 0), 0);

    const totalTargetImpressions = [...resolvedActiveAds, ...resolvedPendingAds].reduce((sum, ad) => sum + parseInt(ad.impressions || 0), 0);
    const totalClicks = activeImpressions + pendingImpressions + activeMutuals + pendingMutuals;
    const clickRate = totalTargetImpressions > 0 ? (totalClicks / totalTargetImpressions) * 100 : 0;

    const statsData = {
      totalUsers: totalUsersCnt || 0,
      monetizedUsers: monetizedUsersCnt || 0,
      suspendedUsers: suspendedUsersCnt || 0,
      totalBalance,
      totalWithdrawal,
      pendingAdsCount: pAdsCount || 0,
      activeAdsCount: aAdsCount || 0,
      pendingHighlightsCount: pHighlightsCount || 0,
      activeHighlightsCount: aHighlightsCount || 0,
      totalClicks,
      totalMutuals,
      clickRate,
      reportedCount: reportsCnt || 0,
      helpTicketsCount: ticketsCnt || 0,
      pausedAdsCount: (pausedAddsCnt || 0) + (pausedActiveCnt || 0),
      timestamp: new Date().toISOString()
    };

    // 3. Cache in Redis with 600-second (10-minute) TTL
    try {
      await redisConnection.set(cacheKey, JSON.stringify(statsData), "EX", 600);
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
