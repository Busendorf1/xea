import { NextRequest, NextResponse } from "next/server";
import { verifyAdminUser } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection, { scanDeletePattern } from "@/lib/redis";
import { recordAdminAuditTrail } from "@/lib/security/adminGuard";

export const dynamic = "force-dynamic";

function parseSafeInt(raw: string | null, fallback: number): number {
  const n = parseInt(raw || "", 10);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizePostgrestSearch(raw: string): string {
  return raw.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(0, parseSafeInt(searchParams.get("page"), 0));
    const limit = Math.min(50, Math.max(1, parseSafeInt(searchParams.get("limit"), 10)));
    const status = searchParams.get("status") || "all";
    const search = sanitizePostgrestSearch(searchParams.get("search")?.trim().toLowerCase() || "");
    const fresh = searchParams.get("fresh") === "true";

    const cacheKey = `admin:subscribers:list:${page}:${limit}:${status}:${encodeURIComponent(search)}`;

    // Try Redis cache if not forced fresh
    if (!fresh) {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          return NextResponse.json(JSON.parse(cached));
        }
      } catch (cacheErr) {}
    }

    const from = page * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("premium_subscribers")
      .select("*", { count: "exact" });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `business_name.ilike.%${search}%,domain.ilike.%${search}%,user_email.ilike.%${search}%,contact_email.ilike.%${search}%`
      );
    }

    const { data: subscribers, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("❌ Error fetching premium subscribers for admin:", error);
      return NextResponse.json({ error: "Failed to fetch subscribers" }, { status: 500 });
    }

    // Fetch aggregate status counts for metric cards
    const [pendingRes, activeRes, approvedRes, rejectedRes] = await Promise.all([
      supabaseAdmin.from("premium_subscribers").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("premium_subscribers").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabaseAdmin.from("premium_subscribers").select("id", { count: "exact", head: true }).eq("status", "approved"),
      supabaseAdmin.from("premium_subscribers").select("id", { count: "exact", head: true }).eq("status", "rejected"),
    ]);

    const result = {
      subscribers: subscribers || [],
      count: count || 0,
      page,
      limit,
      metrics: {
        total: (pendingRes.count || 0) + (activeRes.count || 0) + (approvedRes.count || 0) + (rejectedRes.count || 0),
        pending: pendingRes.count || 0,
        active: activeRes.count || 0,
        approved: approvedRes.count || 0,
        rejected: rejectedRes.count || 0,
      },
    };

    // Cache for 30s
    try {
      await redisConnection.set(cacheKey, JSON.stringify(result), "EX", 30);
    } catch (e) {}

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("❌ Error in GET /api/admin/subscribers:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }
    const authEmail = admin.email;

    const body = await req.json().catch(() => ({}));
    const { action, subscriber_id, rejection_reason } = body;

    if (!subscriber_id) {
      return NextResponse.json({ error: "Subscriber ID is required." }, { status: 400 });
    }

    if (!["approve_subscriber", "reject_subscriber"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Allowed: approve_subscriber, reject_subscriber" }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (action === "approve_subscriber") {
      const { data: updatedSub, error: updateErr } = await supabaseAdmin
        .from("premium_subscribers")
        .update({
          status: "approved",
          reviewed_by: authEmail,
          reviewed_at: now,
          rejection_reason: null,
        })
        .eq("id", subscriber_id)
        .in("status", ["pending", "rejected"])
        .select()
        .maybeSingle();

      if (updateErr) {
        console.error("❌ Error approving subscriber:", updateErr);
        return NextResponse.json({ error: "Failed to approve subscriber" }, { status: 500 });
      }

      if (!updatedSub) {
        return NextResponse.json(
          { error: "Subscriber not found or is already approved/active and cannot be downgraded." },
          { status: 409 }
        );
      }

      // Invalidate admin cache using non-blocking SCAN
      try {
        await scanDeletePattern("admin:subscribers:*");
      } catch (cacheErr) {}

      await recordAdminAuditTrail({
        adminEmail: authEmail,
        action: "approve_brand_subscriber",
        targetId: String(subscriber_id),
        targetType: "premium_subscriber",
        reason: `Approved brand subscriber ${updatedSub.domain}`,
        newState: { status: "approved", domain: updatedSub.domain },
        req,
      });

      return NextResponse.json({
        success: true,
        message: `Application for ${updatedSub.domain} approved! The brand owner can now complete payment to activate their 30% discount subsidy.`,
        subscriber: updatedSub,
      });
    }

    if (action === "reject_subscriber") {
      const reason = rejection_reason?.trim() || "Application does not meet platform requirements.";
      const { data: updatedSub, error: updateErr } = await supabaseAdmin
        .from("premium_subscribers")
        .update({
          status: "rejected",
          rejection_reason: reason,
          reviewed_by: authEmail,
          reviewed_at: now,
        })
        .eq("id", subscriber_id)
        .select()
        .maybeSingle();

      if (updateErr) {
        console.error("❌ Error rejecting subscriber:", updateErr);
        return NextResponse.json({ error: "Failed to reject subscriber" }, { status: 500 });
      }

      if (!updatedSub) {
        return NextResponse.json({ error: "Subscriber not found." }, { status: 404 });
      }

      // Invalidate admin cache and domain cache if was active
      try {
        await scanDeletePattern("admin:subscribers:*");
        if (updatedSub.domain) {
          await redisConnection.del(`cache:domain_subscriber:${updatedSub.domain.toLowerCase().trim()}`);
        }
      } catch (cacheErr) {}

      await recordAdminAuditTrail({
        adminEmail: authEmail,
        action: "reject_brand_subscriber",
        targetId: String(subscriber_id),
        targetType: "premium_subscriber",
        reason,
        newState: { status: "rejected", domain: updatedSub.domain },
        req,
      });

      return NextResponse.json({
        success: true,
        message: `Application for ${updatedSub.domain} rejected.`,
        subscriber: updatedSub,
      });
    }

    return NextResponse.json({ error: "Unrecognized request" }, { status: 400 });
  } catch (err: any) {
    console.error("❌ Error in POST /api/admin/subscribers:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
