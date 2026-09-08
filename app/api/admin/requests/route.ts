import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { recordAdminAuditTrail } from "@/lib/security/adminGuard";
import redisConnection from "@/lib/redis";

// Helper to check if email is admin
async function isAdmin(email: string): Promise<boolean> {
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());
  if (adminEmails.includes(email.toLowerCase())) return true;

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("role, is_admin")
    .ilike("email", email)
    .maybeSingle();

  return user?.role === "admin" || user?.is_admin === true;
}

// Helper to proactively invalidate dual auth and related reconciliation caches
async function invalidateDualAuthCaches() {
  try {
    const keysToDelete = [
      "admin:dual_auth:summary",
      "admin:dual_auth:page_PENDING_10",
      "admin:dual_auth:page_PENDING_20",
      "admin:dual_auth:page_APPROVED_10",
      "admin:dual_auth:page_APPROVED_20",
      "admin:dual_auth:page_REJECTED_10",
      "admin:dual_auth:page_REJECTED_20",
      "admin:dual_auth:page_ALL_10",
      "admin:dual_auth:page_ALL_20",
      "admin:reconciliation:metrics_cache",
      "admin:reconciliation:treasury_and_summary",
    ];
    await Promise.all(keysToDelete.map((k) => redisConnection.del(k)));
  } catch {}
}

export async function GET(req: NextRequest) {
  try {
    const adminEmail = await getAuthenticatedEmail(req);
    if (!adminEmail || !(await isAdmin(adminEmail))) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "10", 10)), 100);
    const status = (searchParams.get("status") || "PENDING").toUpperCase();
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const fresh = searchParams.get("fresh") === "true";

    // 1. Dual-Auth Requests Summary (Cached in Redis for 60s)
    const summaryCacheKey = "admin:dual_auth:summary";
    let summary: { pending_count: number; approved_count: number; rejected_count: number; total_count: number } | null = null;

    if (!fresh) {
      try {
        const cached = await redisConnection.get(summaryCacheKey);
        if (cached) summary = JSON.parse(cached);
      } catch {}
    }

    if (!summary) {
      try {
        const { data: rpcSum, error: rpcErr } = await supabaseAdmin.rpc("get_admin_requests_summary");
        if (!rpcErr && rpcSum) {
          summary = rpcSum;
        } else {
          // Bounded index-backed fallback
          const [{ count: pCount }, { count: aCount }, { count: rCount }, { count: tCount }] = await Promise.all([
            supabaseAdmin.from("pending_admin_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
            supabaseAdmin.from("pending_admin_requests").select("id", { count: "exact", head: true }).eq("status", "APPROVED"),
            supabaseAdmin.from("pending_admin_requests").select("id", { count: "exact", head: true }).eq("status", "REJECTED"),
            supabaseAdmin.from("pending_admin_requests").select("id", { count: "exact", head: true }),
          ]);
          summary = {
            pending_count: pCount || 0,
            approved_count: aCount || 0,
            rejected_count: rCount || 0,
            total_count: tCount || 0,
          };
        }

        try {
          await redisConnection.set(summaryCacheKey, JSON.stringify(summary), "EX", 60);
        } catch {}
      } catch (sumErr) {
        summary = { pending_count: 0, approved_count: 0, rejected_count: 0, total_count: 0 };
      }
    }

    // 2. Paginated and Indexed Query (with 30s Redis memory cache for instant loads)
    const pageCacheKey = (!fresh && !search && page === 1)
      ? `admin:dual_auth:page_${status}_${limit}`
      : null;

    let hasCachedPage = false;
    let requests: any[] = [];
    let totalCount = 0;
    let totalPages = 1;

    if (pageCacheKey) {
      try {
        const cachedPage = await redisConnection.get(pageCacheKey);
        if (cachedPage) {
          const parsed = JSON.parse(cachedPage);
          requests = parsed.requests || [];
          totalCount = parsed.totalCount || 0;
          totalPages = parsed.totalPages || 1;
          hasCachedPage = true;
        }
      } catch {}
    }

    if (!hasCachedPage) {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabaseAdmin
        .from("pending_admin_requests")
        .select("id, action_type, requested_by, target_identifier, amount_naira, payload, reason, status, approved_by, rejected_by, rejection_reason, created_at, updated_at", { count: "exact" });

      if (status && status !== "ALL") {
        query = query.eq("status", status);
      }

      if (search) {
        query = query.or(`requested_by.ilike.%${search}%,target_identifier.ilike.%${search}%,reason.ilike.%${search}%`);
      }

      const { data: dbRequests, count, error } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      requests = dbRequests || [];
      totalCount = count || 0;
      totalPages = Math.max(1, Math.ceil(totalCount / limit));

      if (pageCacheKey) {
        try {
          await redisConnection.set(pageCacheKey, JSON.stringify({
            requests,
            totalCount,
            totalPages,
          }), "EX", 30);
        } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      requests: requests || [],
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        status,
      },
      summary,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminEmail = await getAuthenticatedEmail(req);
    if (!adminEmail || !(await isAdmin(adminEmail))) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }

    const body = await req.json();
    const { action, requestId, rejectionReason } = body;

    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    if (action === "approve") {
      // Execute the approval RPC which strictly prevents self-approval (Four-Eyes Rule)
      const { data: result, error: rpcErr } = await supabaseAdmin.rpc("approve_admin_request", {
        p_approving_admin_email: adminEmail,
        p_request_id: requestId,
      });

      if (rpcErr || !result?.success) {
        return NextResponse.json(
          { error: result?.error || rpcErr?.message || "Failed to approve admin request" },
          { status: 400 }
        );
      }

      await recordAdminAuditTrail({
        adminEmail,
        action: "approve_dual_auth_request",
        targetId: requestId,
        targetType: "pending_admin_request",
        reason: "Approved by second administrator",
        newState: result,
        req,
      });

      // Invalidate caches
      await invalidateDualAuthCaches();

      return NextResponse.json({
        success: true,
        message: result.message || "Request approved and executed successfully.",
      });
    } else if (action === "reject") {
      const { error: updateErr } = await supabaseAdmin
        .from("pending_admin_requests")
        .update({
          status: "REJECTED",
          rejected_by: adminEmail.toLowerCase().trim(),
          rejection_reason: rejectionReason || "Rejected by administrator",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      await recordAdminAuditTrail({
        adminEmail,
        action: "reject_dual_auth_request",
        targetId: requestId,
        targetType: "pending_admin_request",
        reason: rejectionReason || "Rejected by administrator",
        req,
      });

      // Invalidate caches
      await invalidateDualAuthCaches();

      return NextResponse.json({
        success: true,
        message: "Request successfully rejected.",
      });
    }

    return NextResponse.json({ error: "Invalid action. Must be 'approve' or 'reject'" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
