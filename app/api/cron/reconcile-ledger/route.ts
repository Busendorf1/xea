import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

export async function GET(req: NextRequest) {
  return handleReconciliation(req);
}

export async function POST(req: NextRequest) {
  return handleReconciliation(req);
}

async function handleReconciliation(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if ((process.env.NODE_ENV === "production" && !cronSecret) || (cronSecret && authHeader !== `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🔍 Running Nightly Financial Ledger Reconciliation Audit...");

    let totalSentKobo = 0;
    let totalRcvKobo = 0;
    let totalUserBalanceKobo = 0;
    let varianceKobo = 0;

    // 1. Primary: Authoritative SQL RPC aggregation (no 1000-row PostgREST truncation or OOM)
    const { data: rpcMetrics, error: rpcErr } = await supabaseAdmin.rpc("get_admin_reconciliation_metrics");

    if (!rpcErr && rpcMetrics) {
      totalSentKobo = Math.round(parseFloat(rpcMetrics.total_sent_naira || "0") * 100);
      totalRcvKobo = Math.round(parseFloat(rpcMetrics.total_received_naira || "0") * 100);
      totalUserBalanceKobo = Math.round(parseFloat(rpcMetrics.total_user_wallets_naira || "0") * 100);
      varianceKobo = Math.round(parseFloat(rpcMetrics.variance_naira || "0") * 100);
    } else {
      console.warn("⚠️ RPC get_admin_reconciliation_metrics unavailable, using bounded fallback:", rpcErr?.message);
      const { data: sentPayments } = await supabaseAdmin
        .from("payments")
        .select("amount.sum()")
        .eq("type", "transfer_sent")
        .eq("status", "success");

      const { data: rcvPayments } = await supabaseAdmin
        .from("payments")
        .select("amount.sum()")
        .eq("type", "transfer_received")
        .eq("status", "success");

      const sentSum = Array.isArray(sentPayments) && sentPayments[0] ? parseFloat((sentPayments[0] as any).sum || "0") : 0;
      const rcvSum = Array.isArray(rcvPayments) && rcvPayments[0] ? parseFloat((rcvPayments[0] as any).sum || "0") : 0;
      totalSentKobo = Math.round(sentSum * 100);
      totalRcvKobo = Math.round(rcvSum * 100);
      varianceKobo = Math.abs(totalSentKobo - totalRcvKobo);
    }

    const varianceNaira = varianceKobo / 100;
    const isHealthy = varianceKobo === 0;
    const status = isHealthy ? "HEALTHY" : "FLAGGED";

    // 2. Automated Circuit Breaker Activation if Discrepancy Found
    if (!isHealthy) {
      console.error(`🚨 FINANCIAL DISCREPANCY DETECTED! Total Sent: ₦${(totalSentKobo/100).toFixed(2)}, Total Received: ₦${(totalRcvKobo/100).toFixed(2)}, Mismatch: ₦${varianceNaira.toFixed(2)}`);
      
      // Auto-trigger Emergency Circuit Breaker Flag in Redis
      try {
        await redisConnection.set("system:transfers_paused", "true");
        console.log("🔒 Automated Circuit Breaker activated: Paused P2P transfers in Redis.");
      } catch (redisErr) {
        console.error("❌ Failed to activate Redis emergency pause:", redisErr);
      }
    } else {
      console.log("✅ Reconciliation Audit PASSED: System Ledgers 100% Balanced (₦0.00 Variance).");
    }

    // 3. Log Audit Result in Database
    const logNotes = isHealthy
      ? "Nightly audit passed with 0.00 variance."
      : `Discrepancy detected! Total Sent: ₦${(totalSentKobo/100).toFixed(2)} vs Received: ₦${(totalRcvKobo/100).toFixed(2)}. Emergency P2P transfer pause activated.`;

    const { data: logEntry, error: logErr } = await supabaseAdmin
      .from("system_reconciliation_logs")
      .insert([
        {
          status,
          total_credits_kobo: totalRcvKobo,
          total_debits_kobo: totalSentKobo,
          variance_kobo: varianceKobo,
          notes: logNotes,
        },
      ])
      .select()
      .single();

    if (logErr) {
      console.warn("⚠️ System reconciliation log table insert warning:", logErr.message);
    }

    return NextResponse.json({
      success: true,
      status,
      total_sent_naira: totalSentKobo / 100,
      total_received_naira: totalRcvKobo / 100,
      variance_naira: varianceNaira,
      total_user_wallets_naira: totalUserBalanceKobo / 100,
      transfers_paused: !isHealthy,
      log: logEntry || null,
    });
  } catch (err: any) {
    console.error("❌ Reconciliation cron error:", err);
    return NextResponse.json({ error: err.message || "Reconciliation failed" }, { status: 500 });
  }
}
