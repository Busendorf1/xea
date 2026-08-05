import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import { paymentQueue } from "@/lib/queue";

export async function POST(req: NextRequest) {
  let senderEmail = "";
  try {
    senderEmail = (await getAuthenticatedEmail(req)) || "";
    if (!senderEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { recipientEmail, amount } = body;

    const cleanSender = senderEmail.toLowerCase().trim();
    const cleanRecipient = recipientEmail ? recipientEmail.toLowerCase().trim() : "";
    const amountNum = parseFloat(amount);

    // 1. Basic Input Validation
    if (!cleanRecipient || !cleanRecipient.includes("@")) {
      return NextResponse.json({ error: "Please provide a valid recipient email address" }, { status: 400 });
    }

    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: "Please enter a valid transfer amount" }, { status: 400 });
    }

    if (cleanSender === cleanRecipient) {
      return NextResponse.json({ error: "You cannot send money to your own email account" }, { status: 400 });
    }

    // 2. Security Rate Limit: Max 6 users per day per sender
    const recipientSetKey = `ratelimit:send_money_recipients:${cleanSender}`;
    const totalCountKey = `ratelimit:send_money_count:${cleanSender}`;

    try {
      const isExistingRecipient = await redisConnection.sismember(recipientSetKey, cleanRecipient);
      const uniqueRecipientCount = await redisConnection.scard(recipientSetKey);

      if (!isExistingRecipient && uniqueRecipientCount >= 6) {
        return NextResponse.json(
          { error: "Daily limit reached. You can only send money to up to 6 unique users per day." },
          { status: 429 }
        );
      }

      const totalSentToday = await redisConnection.incr(totalCountKey);
      if (totalSentToday === 1) {
        await redisConnection.expire(totalCountKey, 86400); // 24 hours TTL
      }

      if (totalSentToday > 6 && !isExistingRecipient) {
        return NextResponse.json(
          { error: "Daily transfer limit reached. You can only send money to up to 6 users per day." },
          { status: 429 }
        );
      }
    } catch (redisErr) {
      console.warn("⚠️ Send money rate limit Redis check warning:", redisErr);
    }

    // 3. Verify Sender Balance & Enforce 20% Limit
    const { data: senderUser, error: senderFetchErr } = await supabaseAdmin
      .from("users")
      .select("balance")
      .ilike("email", cleanSender)
      .maybeSingle();

    if (senderFetchErr || !senderUser) {
      return NextResponse.json({ error: "Sender profile not found" }, { status: 404 });
    }

    const currentBalance = parseFloat(senderUser.balance || 0);

    if (currentBalance < amountNum) {
      return NextResponse.json({ error: "Insufficient wallet balance for this transfer" }, { status: 400 });
    }

    const maxAllowedAtATime = currentBalance * 0.20;
    if (amountNum > maxAllowedAtATime + 0.01) {
      const formattedMax = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(maxAllowedAtATime);
      return NextResponse.json(
        {
          error: `Transfer amount cannot exceed 20% of your total balance at a time. Maximum allowed for this transfer is ${formattedMax}.`,
          max_allowed: maxAllowedAtATime,
          current_balance: currentBalance,
        },
        { status: 400 }
      );
    }

    // 4. Verify Recipient Account Existence
    const { data: recipientUser, error: recipientFetchErr } = await supabaseAdmin
      .from("users")
      .select("id, email, firstName, lastName")
      .ilike("email", cleanRecipient)
      .maybeSingle();

    if (recipientFetchErr || !recipientUser) {
      return NextResponse.json({ error: "Recipient user account with this email does not exist." }, { status: 404 });
    }

    // 5. Execute Atomic Database Transfer via Supabase RPC (Automatic Rollback on Network Error)
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("transfer_user_funds", {
      p_sender_email: cleanSender,
      p_recipient_email: cleanRecipient,
      p_amount: amountNum,
    });

    if (rpcError) {
      console.error("❌ RPC transfer_user_funds error:", rpcError);
      return NextResponse.json(
        { error: "Network or transaction error occurred. Your balance remains unchanged." },
        { status: 500 }
      );
    }

    if (!rpcResult || !rpcResult.success) {
      return NextResponse.json(
        { error: rpcResult?.error || "Failed to complete transfer. Balance returned to sender." },
        { status: 400 }
      );
    }

    // 6. Update Redis Unique Recipients Rate Limit Set
    try {
      await redisConnection.sadd(recipientSetKey, cleanRecipient);
      await redisConnection.expire(recipientSetKey, 86400); // 24 hours TTL
    } catch (redisErr) {
      console.warn("⚠️ Redis recipient set update warning:", redisErr);
    }

    // 7. Enqueue Background Audit & Worker Processing Job
    try {
      await paymentQueue.add("transfer-notification", {
        type: "p2p_transfer",
        senderEmail: cleanSender,
        recipientEmail: cleanRecipient,
        amount: amountNum,
        reference: rpcResult.reference,
        timestamp: new Date().toISOString(),
      });
    } catch (queueErr) {
      console.warn("⚠️ BullMQ paymentQueue enqueue warning:", queueErr);
    }

    // 8. Invalidate Redis Profile & Statement Caches for Both Users
    await Promise.all([
      invalidateCachedProfile(cleanSender),
      invalidateCachedProfile(cleanRecipient),
    ]);

    const formattedAmount = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amountNum);

    return NextResponse.json({
      success: true,
      message: `Successfully sent ${formattedAmount} to ${cleanRecipient}`,
      reference: rpcResult.reference,
      new_balance: rpcResult.new_balance,
    });
  } catch (err: any) {
    console.error("❌ Network error in POST /api/payments/transfer:", err);
    // In case of unexpected server/network failure, ensure sender cache is refreshed
    if (senderEmail) {
      await invalidateCachedProfile(senderEmail).catch(() => {});
    }
    return NextResponse.json(
      { error: "A network error occurred. Your transfer was safely aborted and balance remains intact." },
      { status: 500 }
    );
  }
}
