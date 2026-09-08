import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { verifyAdminUser } from "@/lib/authHelper";
import redisConnection from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10), 1), 100);
    const search = searchParams.get("search")?.trim() || "";
    const fresh = searchParams.get("fresh") === "true";

    const cacheKey = `admin:tickets:page:${page}:${limit}:${search.toLowerCase()}`;

    // 1. Try Redis cache (30s TTL)
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
        console.warn("⚠️ Redis read error in /api/admin/help-tickets:", err);
      }
    }

    const dbClient = supabaseReadOnly || supabaseAdmin;
    let query = dbClient
      .from("help_tickets")
      .select("*", { count: "exact" });

    if (search) {
      query = query.or(
        `user_email.ilike.%${search}%,subject.ilike.%${search}%,category.ilike.%${search}%`
      );
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (error) {
      console.error("❌ Error fetching help tickets:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = {
      tickets: data || [],
      count: count || 0,
      page,
      limit,
    };

    try {
      await redisConnection.set(cacheKey, JSON.stringify(payload), "EX", 30);
    } catch {}

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/admin/help-tickets:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

async function recordAdminAudit(adminEmail: string, action: string, targetId?: string, reason?: string) {
  try {
    await supabaseAdmin.from("admin_audit_logs").insert([{
      admin_email: adminEmail.toLowerCase(),
      action,
      target_id: targetId || null,
      target_type: "help_ticket",
      reason: reason || null,
    }]);
  } catch {}
}

export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const adminEmail = admin.email.toLowerCase();
    const body = await req.json();
    const { action, ticketId, replyText } = body;

    if (!ticketId) {
      return NextResponse.json({ error: "Missing ticketId" }, { status: 400 });
    }

    // Invalidate tickets and overview stats caches on ticket operations
    try {
      const ticketKeys = await redisConnection.keys("admin:tickets:*");
      if (ticketKeys && ticketKeys.length > 0) {
        await redisConnection.del(ticketKeys);
      }
      await redisConnection.del("admin:overview:stats").catch(() => {});
    } catch {}

    if (action === "close" || action === "resolve") {
      const now = new Date().toISOString();
      const { data: ticket, error: fetchErr } = await supabaseAdmin
        .from("help_tickets")
        .select("*")
        .eq("id", ticketId)
        .single();

      if (fetchErr || !ticket) {
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      }

      const { error: updateErr } = await supabaseAdmin
        .from("help_tickets")
        .update({
          status: "closed",
          resolved_at: now,
        })
        .eq("id", ticketId);

      if (updateErr) {
        console.error("❌ Error updating ticket to closed:", updateErr);
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      // Send notification to ticket owner
      if (ticket.user_email) {
        try {
          await supabaseAdmin.from("notifications").insert({
            user_email: ticket.user_email.toLowerCase().trim(),
            title: "Support Ticket Closed",
            message: `Your help request ("${ticket.subject || "Support Request"}") has been marked as CLOSED by our Help Center team and will be automatically deleted in 24 hours.`,
          });
        } catch {}
      }

      await recordAdminAudit(adminEmail, "close_help_ticket", ticketId);

      return NextResponse.json({ success: true, status: "closed", resolved_at: now });
    }

    if (action === "delete") {
      const { error: deleteErr } = await supabaseAdmin
        .from("help_tickets")
        .delete()
        .eq("id", ticketId);

      if (deleteErr) {
        console.error("❌ Error deleting help ticket:", deleteErr);
        return NextResponse.json({ error: deleteErr.message }, { status: 500 });
      }

      await recordAdminAudit(adminEmail, "delete_help_ticket", ticketId);

      return NextResponse.json({ success: true });
    }

    if (action === "reply") {
      if (!replyText || !replyText.trim()) {
        return NextResponse.json({ error: "Reply text is required" }, { status: 400 });
      }

      const { error: replyErr } = await supabaseAdmin
        .from("help_tickets")
        .update({
          admin_reply: replyText.trim(),
          status: "replied",
          replied_at: new Date().toISOString(),
        })
        .eq("id", ticketId);

      if (replyErr) {
        console.error("❌ Error replying to help ticket:", replyErr);
        return NextResponse.json({ error: replyErr.message }, { status: 500 });
      }

      await recordAdminAudit(adminEmail, "reply_help_ticket", ticketId, replyText.trim().slice(0, 200));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/admin/help-tickets:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
