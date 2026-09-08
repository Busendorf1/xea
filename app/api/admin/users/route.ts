import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { verifyAdminUser } from "@/lib/authHelper";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Zod validation schema for POST actions
const adminActionSchema = z.object({
  action: z.enum(["toggle_monetization", "suspend", "adjust_balance", "delete", "ad_account_action"]),
  userId: z.string().min(1, "userId is required"),
  payload: z.record(z.string(), z.any()).optional(),
});

async function recordAdminAudit(
  adminEmail: string,
  action: string,
  targetId?: string,
  targetType: string = "user",
  reason?: string | null,
  previousState?: any,
  newState?: any
) {
  try {
    await supabaseAdmin.from("admin_audit_logs").insert([{
      admin_email: adminEmail.toLowerCase(),
      action,
      target_id: targetId || null,
      target_type: targetType,
      previous_state: previousState ? JSON.parse(JSON.stringify(previousState)) : null,
      new_state: newState ? JSON.parse(JSON.stringify(newState)) : null,
      reason: reason || null,
    }]);
  } catch {}
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdminUser(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type") || "list";

    if (type === "stats") {
      const cacheKey = "admin:overview_stats";

      // 1. Try Redis cache first (60-second TTL)
      try {
        const cachedStatsStr = await redisConnection.get(cacheKey);
        if (cachedStatsStr) {
          return NextResponse.json(JSON.parse(cachedStatsStr));
        }
      } catch (redisErr) {
        console.warn("⚠️ Redis read warning in admin stats:", redisErr);
      }

      // 2. Cache miss: Execute ultra-fast single-pass PostgreSQL aggregate RPC
      const { data: statsJson, error: rpcError } = await supabaseAdmin.rpc("get_admin_overview_stats");

      if (!rpcError && statsJson) {
        await redisConnection.set(cacheKey, JSON.stringify(statsJson), "EX", 60).catch(() => {});
        return NextResponse.json(statsJson);
      }

      // Fallback: fast count queries
      console.warn("⚠️ get_admin_overview_stats RPC fallback triggered in users route:", rpcError?.message);
      const { count: totalUsersCnt } = await supabaseAdmin.from("users").select("*", { count: "exact", head: true });
      const fallbackStats = {
        totalUsers: totalUsersCnt || 0,
        totalBalance: 0,
        totalWithdrawal: 0,
        totalMutuals: 0,
        monetizedUsers: 0,
        suspendedUsers: 0,
      };

      await redisConnection.set(cacheKey, JSON.stringify(fallbackStats), "EX", 60).catch(() => {});
      return NextResponse.json(fallbackStats);

    } else {
      // Paginated and searched users list
      const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
      const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10), 1), 100);
      const search = searchParams.get("search")?.trim() || "";
      const fresh = searchParams.get("fresh") === "true";

      const cacheKey = `admin:users:list:${page}:${limit}:${search.toLowerCase()}`;

      // 1. Try Redis cache first (30-second TTL) for instant response (<2ms)
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
          console.warn("⚠️ Redis read error in /api/admin/users:", err);
        }
      }

      const dbClient = supabaseReadOnly || supabaseAdmin;
      // Fetch only the specific fields needed by the admin dashboard to minimize PostgreSQL memory & wire transfer
      const selectedColumns = "id, username, email, firstName, lastName, business_name, phone, state, country, balance, withdrawal, monetized, monetization_type, monetized_until, monetized_at, suspended_until, ad_account_status, ad_ban_until, ad_ban_reason, mutual_count, created_at";
      let query = dbClient.from("users").select(selectedColumns, { count: "exact" });

      if (search) {
        query = query.or(`email.ilike.%${search}%,username.ilike.%${search}%,firstName.ilike.%${search}%,lastName.ilike.%${search}%,business_name.ilike.%${search}%`);
      }

      const { data: users, count, error } = await query
        .order("created_at", { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

      if (error) {
        console.error("❌ Admin API get users error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const resolvedUsers = users || [];

      // Server-Side Enrichment for the current page (eliminates client-side DB roundtrips)
      let enrichedUsers = resolvedUsers;
      if (resolvedUsers.length > 0) {
        const emails = resolvedUsers.map((u: any) => (u.email || "").toLowerCase()).filter(Boolean);

        const [adsRes, activeAdsRes, newsRes, activeNewsRes] = await Promise.all([
          dbClient.from("adds").select("user_email, impression_count, mutual_adds_count").in("user_email", emails),
          dbClient.from("addsactive").select("user_email, impression_count, mutual_adds_count").in("user_email", emails),
          dbClient.from("news").select("user_email").in("user_email", emails),
          dbClient.from("newsactive").select("user_email").in("user_email", emails),
        ]);

        const adsData = adsRes.data || [];
        const activeAdsData = activeAdsRes.data || [];
        const newsData = newsRes.data || [];
        const activeNewsData = activeNewsRes.data || [];

        enrichedUsers = resolvedUsers.map((user: any) => {
          const emailLower = (user.email || "").toLowerCase();
          const reviewAds = adsData.filter((ad: any) => (ad.user_email || "").toLowerCase() === emailLower);
          const activeAds = activeAdsData.filter((ad: any) => (ad.user_email || "").toLowerCase() === emailLower);

          const reviewHighlights = newsData.filter((h: any) => (h.user_email || "").toLowerCase() === emailLower).length;
          const activeHighlights = activeNewsData.filter((h: any) => (h.user_email || "").toLowerCase() === emailLower).length;

          const adImpressionsCount = [...reviewAds, ...activeAds].reduce((sum: number, ad: any) => sum + parseInt(ad.impression_count || 0), 0);
          const adMutualsCount = [...reviewAds, ...activeAds].reduce((sum: number, ad: any) => sum + parseInt(ad.mutual_adds_count || 0), 0);
          const totalClicksOnAds = adImpressionsCount + adMutualsCount;

          return {
            ...user,
            totalClicksOnAds,
            reviewAdsCount: reviewAds.length,
            activeAdsCount: activeAds.length,
            reviewHighlightsCount: reviewHighlights,
            activeHighlightsCount: activeHighlights,
          };
        });
      }

      const responsePayload = { users: enrichedUsers, count: count || 0, page, limit };

      // Cache enriched user page in Redis with 30s TTL
      try {
        await redisConnection.set(cacheKey, JSON.stringify(responsePayload), "EX", 30);
      } catch (err) {
        console.warn("⚠️ Redis write error in /api/admin/users:", err);
      }

      return NextResponse.json(responsePayload);
    }
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/admin/users:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminUser(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    const rawBody = await req.json();
    const parseResult = adminActionSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid input payload", details: parseResult.error.format() }, { status: 400 });
    }

    const { action, userId, payload } = parseResult.data;
    const adminEmail = admin.email.toLowerCase();

    // Invalidate cached overview stats and user pages in Redis whenever an admin modifies user balances, status, or deletes users
    await redisConnection.del("admin:overview_stats").catch(() => {});
    await redisConnection.del("admin:overview:stats").catch(() => {});
    try {
      const userListKeys = await redisConnection.keys("admin:users:list:*");
      if (userListKeys && userListKeys.length > 0) {
        await redisConnection.del(userListKeys);
      }
    } catch {}

    if (action === "toggle_monetization") {
      const { nextMonetizedVal, nextMonetizedType, nextMonetizedUntil, isCurrentlyMonetized } = payload || {};
      const { error } = await supabaseAdmin
        .from("users")
        .update({
          monetized: nextMonetizedVal,
          monetization_type: nextMonetizedType,
          monetized_until: nextMonetizedUntil,
          monetized_at: isCurrentlyMonetized ? null : new Date().toISOString()
        })
        .eq("id", userId);

      if (error) throw error;

      await recordAdminAudit(
        adminEmail,
        "toggle_monetization",
        userId,
        "user",
        null,
        null,
        { monetized: nextMonetizedVal, monetization_type: nextMonetizedType }
      );

      return NextResponse.json({ success: true });
    } 
    
    else if (action === "suspend") {
      const { suspendedUntil, reason } = payload || {};
      const { error } = await supabaseAdmin
        .from("users")
        .update({ suspended_until: suspendedUntil })
        .eq("id", userId);

      if (error) throw error;

      await recordAdminAudit(
        adminEmail,
        "suspend_user",
        userId,
        "user",
        reason || "Admin suspension",
        null,
        { suspended_until: suspendedUntil }
      );

      return NextResponse.json({ success: true });
    } 
    
    else if (action === "adjust_balance") {
      const { newBalance, reason } = payload || {};
      const { data: previousUser } = await supabaseAdmin
        .from("users")
        .select("balance, email")
        .eq("id", userId)
        .maybeSingle();

      const { error } = await supabaseAdmin
        .from("users")
        .update({ balance: newBalance })
        .eq("id", userId);

      if (error) throw error;

      await recordAdminAudit(
        adminEmail,
        "adjust_user_balance",
        userId,
        "user",
        reason || "Manual administrative adjustment",
        { balance: previousUser?.balance, email: previousUser?.email },
        { balance: newBalance }
      );

      return NextResponse.json({ success: true });
    } 
    
    else if (action === "delete") {
      const { data: previousUser } = await supabaseAdmin
        .from("users")
        .select("email, username")
        .eq("id", userId)
        .maybeSingle();

      const { error } = await supabaseAdmin
        .from("users")
        .delete()
        .eq("id", userId);

      if (error) throw error;

      await recordAdminAudit(
        adminEmail,
        "delete_user",
        userId,
        "user",
        null,
        previousUser,
        null
      );

      return NextResponse.json({ success: true });
    } 
    
    else if (action === "ad_account_action") {
      const { adStatus, banDays, banReason } = payload || {};
      let adBanUntil = null;
      if (adStatus === "temp_banned") {
        const days = parseInt(banDays || "7", 10);
        adBanUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      } else if (adStatus === "perm_banned") {
        adBanUntil = new Date("2099-12-31T23:59:59Z").toISOString();
      }

      const { error } = await supabaseAdmin
        .from("users")
        .update({
          ad_account_status: adStatus,
          ad_ban_until: adBanUntil,
          ad_ban_reason: banReason || null
        })
        .eq("id", userId);

      if (error) throw error;

      await recordAdminAudit(
        adminEmail,
        "update_ad_account_status",
        userId,
        "user",
        banReason || null,
        null,
        { adStatus, adBanUntil, banReason }
      );

      return NextResponse.json({ success: true });
    } 
    
    else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/admin/users:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
