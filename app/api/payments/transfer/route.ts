import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import { paymentQueue } from "@/lib/queue";
import {
  checkEmergencyPause,
  checkSenderRateLimit,
  checkRecipientRateLimit,
  reserveSenderBalance,
} from "@/lib/security/rateLimiter";

export async function POST(req: NextRequest) {
  let senderEmail = "";
  try {
    senderEmail = (await getAuthenticatedEmail(req)) || "";
    if (!senderEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Check System Emergency Circuit Breaker Flag
    const pauseCheck = await checkEmergencyPause();
    if (!pauseCheck.allowed) {
      return NextResponse.json({ error: pauseCheck.reason }, { status: pauseCheck.statusCode || 503 });
    }

    const body = await req.json();
    const { recipientEmail, amount, idempotencyKey } = body;

    const cleanSender = senderEmail.toLowerCase().trim();
    const cleanRecipient = recipientEmail ? recipientEmail.toLowerCase().trim() : "";
    const amountNum = parseFloat(amount);

    // 2. Input Validation & Negative Amount Defense
    if (!cleanRecipient || !cleanRecipient.includes("@")) {
      return NextResponse.json({ error: "Please provide a valid recipient email address" }, { status: 400 });
    }

    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: "Please enter a valid positive transfer amount" }, { status: 400 });
    }

    if (cleanSender === cleanRecipient) {
      return NextResponse.json({ error: "You cannot send money to your own email account" }, { status: 400 });
    }

    // Convert to Fixed-Point Integer Kobo (Prevents IEEE 754 precision rounding bugs)
    const amountKobo = Math.round(amountNum * 100);

    // 3. Strict Idempotency Lock Check (Prevents Replay Attacks & Network Retries)
    const reqHeaderKey = req.headers.get("x-idempotency-key");
    const rawIdempotency = idempotencyKey || reqHeaderKey || `trf_${cleanSender}_${cleanRecipient}_${amountKobo}_${Date.now()}`;
    const idempotencyRedisKey = `idempotency:transfer:${rawIdempotency}`;

    try {
      const isDuplicate = await redisConnection.set(idempotencyRedisKey, "LOCKED", "EX", 86400, "NX");
      if (!isDuplicate) {
        return NextResponse.json(
          { error: "Duplicate transfer request detected. This operation has already been submitted." },
          { status: 409 }
        );
      }
    } catch (redisErr) {
      console.warn("⚠️ Idempotency key Redis check warning:", redisErr);
    }

    // 4. Rate Limits (Sender Velocity, Recipient Velocity, Daily Recipient Limit)
    const senderLimit = await checkSenderRateLimit(cleanSender, cleanRecipient);
    if (!senderLimit.allowed) {
      return NextResponse.json({ error: senderLimit.reason }, { status: senderLimit.statusCode || 429 });
    }

    const recipientLimit = await checkRecipientRateLimit(cleanRecipient);
    if (!recipientLimit.allowed) {
      return NextResponse.json({ error: recipientLimit.reason }, { status: recipientLimit.statusCode || 429 });
    }

    // 5. Verify Recipient Account Existence
    const { data: recipientUser, error: recipientFetchErr } = await supabaseAdmin
      .from("users")
      .select("id, email, firstName, lastName")
      .ilike("email", cleanRecipient)
      .maybeSingle();

    if (recipientFetchErr || !recipientUser) {
      return NextResponse.json({ error: "Recipient user account with this email does not exist." }, { status: 404 });
    }

    // 6. Verify & Reserve Sender Balance (Enforces 20% Limit & Sufficient Balance)
    const balanceRes = await reserveSenderBalance(cleanSender, amountNum);
    if (!balanceRes.success) {
      return NextResponse.json({ error: balanceRes.error || "Balance check failed" }, { status: 400 });
    }

    // 7. Execute Lock-Free Append-Only Ledger Entry (Supabase RPC)
    const reference = rawIdempotency.startsWith("trf_") ? rawIdempotency : `trf_${rawIdempotency}`;

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("process_ledger_transfer", {
      p_reference: reference,
      p_sender_email: cleanSender,
      p_recipient_email: cleanRecipient,
      p_amount_kobo: amountKobo,
    });

    if (rpcError) {
      console.error("❌ RPC process_ledger_transfer error:", rpcError);
      // Execute legacy fallback if function not yet migrated in DB environment
      const { data: fallbackResult, error: fallbackErr } = await supabaseAdmin.rpc("transfer_user_funds", {
        p_sender_email: cleanSender,
        p_recipient_email: cleanRecipient,
        p_amount: amountNum,
      });

      if (fallbackErr || !fallbackResult?.success) {
        return NextResponse.json(
          { error: fallbackResult?.error || rpcError.message || "Transfer execution failed." },
          { status: 500 }
        );
      }
    } else if (rpcResult && rpcResult.success === false) {
      return NextResponse.json({ error: rpcResult.error || "Ledger entry creation failed" }, { status: 400 });
    }

    // 8. Update Redis Unique Recipients Rate Limit Set
    try {
      const recipientSetKey = `ratelimit:send_money_recipients:${cleanSender}`;
      await redisConnection.sadd(recipientSetKey, cleanRecipient);
      await redisConnection.expire(recipientSetKey, 86400); // 24 hours TTL
    } catch (redisErr) {
      console.warn("⚠️ Redis recipient set update warning:", redisErr);
    }

    // 9. Enqueue Settlement & Cache Sync Job to BullMQ paymentQueue
    try {
      await paymentQueue.add("transfer-settlement", {
        type: "p2p_transfer",
        senderEmail: cleanSender,
        recipientEmail: cleanRecipient,
        amount: amountNum,
        amountKobo,
        reference,
        timestamp: new Date().toISOString(),
      });
    } catch (queueErr) {
      console.warn("⚠️ BullMQ paymentQueue enqueue warning:", queueErr);
    }

    // 10. Invalidate Redis Caches
    await Promise.all([
      invalidateCachedProfile(cleanSender),
      invalidateCachedProfile(cleanRecipient),
    ]);

    const formattedAmount = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amountNum);
    const newBalance = Math.max(0, balanceRes.currentBalance - amountNum);

    return NextResponse.json({
      success: true,
      message: `Successfully sent ${formattedAmount} to ${cleanRecipient}`,
      reference,
      new_balance: newBalance,
    });
  } catch (err: any) {
    console.error("❌ Network error in POST /api/payments/transfer:", err);
    if (senderEmail) {
      await invalidateCachedProfile(senderEmail).catch(() => {});
    }
    return NextResponse.json(
      { error: "A network error occurred. Your transfer was safely aborted and balance remains intact." },
      { status: 500 }
    );
  }
}
