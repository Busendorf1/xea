import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { z } from "zod";

// Admin email whitelist logic
const getAdminEmails = (): string[] => {
  const defaultAdmins = ["admin@xea.com", "nonsom019@gmail.com", "nonsom2023@gmail.com"];
  const envAdmins = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map(e => e.trim().toLowerCase())
    : [];
  return envAdmins.length > 0 ? envAdmins : defaultAdmins;
};

// Middleware-like verification helper
async function verifyAdmin() {
  const session = await auth0.getSession();
  if (!session || !session.user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), email: null };
  }

  const email = session.user.email?.toLowerCase();
  if (!email) {
    return { errorResponse: NextResponse.json({ error: "No email associated with session" }, { status: 400 }), email: null };
  }

  const adminEmails = getAdminEmails();
  if (!adminEmails.includes(email)) {
    return { errorResponse: NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 }), email };
  }

  return { errorResponse: null, email };
}

// Zod validation schema for POST actions
const adminActionSchema = z.object({
  action: z.enum(["toggle_monetization", "suspend", "adjust_balance", "delete"]),
  userId: z.string().min(1, "userId is required"),
  payload: z.record(z.string(), z.any()).optional(),
});

export async function GET(req: NextRequest) {
  const { errorResponse } = await verifyAdmin();
  if (errorResponse) return errorResponse;

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
        // Cache result in Redis for 60 seconds
        await redisConnection.set(cacheKey, JSON.stringify(statsJson), "EX", 60).catch(() => {});
        return NextResponse.json(statsJson);
      }

      // Fallback: If RPC is not created yet, run optimized database count queries
      console.warn("⚠️ get_admin_overview_stats RPC fallback triggered:", rpcError?.message);
      const { data: users, error } = await supabaseAdmin
        .from("users")
        .select("balance, withdrawal, mutual_count, suspended_until, monetized");

      if (error) {
        console.error("❌ Admin API get stats error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const resolvedUsers = users || [];
      const totalBalance = resolvedUsers.reduce((sum, u) => sum + parseFloat(u.balance || 0), 0);
      const totalWithdrawal = resolvedUsers.reduce((sum, u) => sum + parseFloat(u.withdrawal || 0), 0);
      const totalMutuals = resolvedUsers.reduce((sum, u) => sum + parseInt(u.mutual_count || 0), 0);
      const monetizedCount = resolvedUsers.filter(u => u.monetized === "yes" || u.monetized === true).length;
      const suspendedCount = resolvedUsers.filter(u => u.suspended_until && new Date(u.suspended_until).getTime() > Date.now()).length;

      const fallbackStats = {
        totalUsers: resolvedUsers.length,
        totalBalance,
        totalWithdrawal,
        totalMutuals,
        monetizedUsers: monetizedCount,
        suspendedUsers: suspendedCount
      };

      await redisConnection.set(cacheKey, JSON.stringify(fallbackStats), "EX", 60).catch(() => {});
      return NextResponse.json(fallbackStats);

    } else {
      // Paginated and searched users list
      const page = parseInt(searchParams.get("page") || "0", 10);
      const search = searchParams.get("search") || "";

      let query = supabaseAdmin.from("users").select("*", { count: "exact" });

      if (search) {
        query = query.or(`email.ilike.%${search}%,username.ilike.%${search}%,firstName.ilike.%${search}%,lastName.ilike.%${search}%,business_name.ilike.%${search}%`);
      }

      const { data: users, count, error } = await query
        .order("created_at", { ascending: false })
        .range(page * 10, (page + 1) * 10 - 1);

      if (error) {
        console.error("❌ Admin API get users error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ users: users || [], count: count || 0 });
    }
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/admin/users:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { errorResponse } = await verifyAdmin();
  if (errorResponse) return errorResponse;

  try {
    const rawBody = await req.json();
    const parseResult = adminActionSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid input payload", details: parseResult.error.format() }, { status: 400 });
    }

    const { action, userId, payload } = parseResult.data;

    // Invalidate cached overview stats in Redis whenever an admin modifies user balances, status, or deletes users
    await redisConnection.del("admin:overview_stats").catch(() => {});

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
      return NextResponse.json({ success: true });
    } 
    
    else if (action === "suspend") {
      const { suspendedUntil } = payload || {};
      const { error } = await supabaseAdmin
        .from("users")
        .update({ suspended_until: suspendedUntil })
        .eq("id", userId);

      if (error) throw error;
      return NextResponse.json({ success: true });
    } 
    
    else if (action === "adjust_balance") {
      const { newBalance } = payload || {};
      const { error } = await supabaseAdmin
        .from("users")
        .update({ balance: newBalance })
        .eq("id", userId);

      if (error) throw error;
      return NextResponse.json({ success: true });
    } 
    
    else if (action === "delete") {
      const { error } = await supabaseAdmin
        .from("users")
        .delete()
        .eq("id", userId);

      if (error) throw error;
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
