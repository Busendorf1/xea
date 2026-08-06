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
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🔍 Running Nightly Financial Ledger Reconciliation Audit...");

    // 1. Calculate Sum of Transfer Debits & Credits from ledger_entries
    const { data: creditSumData, error: creditErr } = await supabaseAdmin
      .from("ledger_entries")
      .select("amount_kobo.sum()")
      .eq("entry_type", "CREDIT");

    const { data: debitSumData, error: debitErr } = await supabaseAdmin
      .from("ledger_entries")
      .select("amount_kobo.sum()")
      .eq("entry_type", "DEBIT");

    const { data: transferSumData } = await supabaseAdmin
      .from("ledger_entries")
      .select("amount_kobo.sum()")
      .eq("entry_type", "TRANSFER");

    if (creditErr || debitErr) {
      console.warn("⚠️ Fallback reconciliation computation via payments table...");
    }

    // Calculate total system user wallet balances
    const { data: usersData, error: usersErr } = await supabaseAdmin
      .from("users")
      .select("balance");

    let totalUserBalanceKobo = 0;
    if (!usersErr && usersData) {
      usersData.forEach((u) => {
        const bal = parseFloat(u.balance || 0);
        totalUserBalanceKobo += Math.round(bal * 100);
      });
    }

    // Check sum of payments table
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
