import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
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

export async function GET(req: NextRequest) {
  try {
    const userEmail = await getAuthenticatedEmail(req);
    if (!userEmail || !(await isAdmin(userEmail))) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }

    // Fetch reconciliation logs
    const { data: logs, error: logsErr } = await supabaseAdmin
      .from("system_reconciliation_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    // Fetch system P2P transfers pause state from Redis
    const isPausedRaw = await redisConnection.get("system:transfers_paused").catch(() => "false");
    const transfersPaused = isPausedRaw === "true" || isPausedRaw === "1";

    // Compute wallet totals
    const { data: sentPayments } = await supabaseAdmin
      .from("payments")
      .select("amount")
      .eq("type", "transfer_sent")
      .eq("status", "success");

    const { data: rcvPayments } = await supabaseAdmin
      .from("payments")
      .select("amount")
      .eq("type", "transfer_received")
      .eq("status", "success");

    let totalSentKobo = 0;
    let totalRcvKobo = 0;

    if (sentPayments) {
      sentPayments.forEach((p) => {
        totalSentKobo += Math.round(parseFloat(p.amount || 0) * 100);
      });
    }

    if (rcvPayments) {
      rcvPayments.forEach((p) => {
        totalRcvKobo += Math.round(parseFloat(p.amount || 0) * 100);
      });
    }

    const varianceKobo = Math.abs(totalSentKobo - totalRcvKobo);

    return NextResponse.json({
      success: true,
      transfersPaused,
      metrics: {
        total_sent_naira: totalSentKobo / 100,
        total_received_naira: totalRcvKobo / 100,
        variance_naira: varianceKobo / 100,
        status: varianceKobo === 0 ? "HEALTHY" : "FLAGGED",
      },
      logs: logs || [],
    });
  } catch (err: any) {
    console.error("❌ GET /api/admin/reconciliation error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch reconciliation state" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userEmail = await getAuthenticatedEmail(req);
    if (!userEmail || !(await isAdmin(userEmail))) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }

    const body = await req.json();
    const { action, logId, notes } = body;

    if (action === "toggle_pause") {
      const isPausedRaw = await redisConnection.get("system:transfers_paused").catch(() => "false");
      const currentState = isPausedRaw === "true" || isPausedRaw === "1";
      const newState = !currentState;

      await redisConnection.set("system:transfers_paused", newState ? "true" : "false");
      console.log(`🔒 Admin ${userEmail} toggled P2P transfers pause to: ${newState}`);

      return NextResponse.json({
        success: true,
        transfersPaused: newState,
        message: newState ? "P2P Transfers Emergency Paused" : "P2P Transfers Resumed",
      });
    }

    if (action === "resolve_issue") {
      if (!logId) {
        return NextResponse.json({ error: "Missing logId" }, { status: 400 });
      }

      const { error: updateErr } = await supabaseAdmin
        .from("system_reconciliation_logs")
        .update({
          status: "RESOLVED",
          notes: `Resolved by ${userEmail}: ${notes || "No extra notes provided"}`,
        })
        .eq("id", logId);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "Reconciliation issue marked as resolved" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("❌ POST /api/admin/reconciliation error:", err);
    return NextResponse.json({ error: err.message || "Failed to execute reconciliation action" }, { status: 500 });
  }
}
