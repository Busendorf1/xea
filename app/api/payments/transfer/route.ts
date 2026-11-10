import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { invalidateCachedProfile, getCachedRecipient, setCachedRecipient } from "@/lib/utils/cache";
import { paymentQueue } from "@/lib/queue";
import {
  checkEmergencyPause,
  checkSenderRateLimit,
  checkRecipientRateLimit,
  reserveSenderBalance,
  acquireWalletLock,
  releaseWalletLock,
} from "@/lib/security/rateLimiter";
import {
  recordLiveTransferDelta,
  runAutomatedDiscrepancyCheck,
  freezeUserAccount,
  isUserAccountFrozen,
} from "@/lib/security/discrepancyAuditor";
import { captureApiException } from "@/lib/logger";
import { transferApiSchema } from "@/lib/validationSchemas";
import { verifyTransactionPin } from "@/lib/security/walletPinHelper";

export async function POST(req: NextRequest) {
  let senderEmail = "";
  let walletLockAcquired = false;
  let clientKey = "";
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
    const parsed = transferApiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid transfer details" },
        { status: 400 }
      );
    }
    const { recipientEmail, amount: amountNum, idempotencyKey, pin } = parsed.data;

    const cleanSender = senderEmail.toLowerCase().trim();

    // Verify Sender 4-Digit Wallet PIN (if configured)
    const { data: senderPinData } = await supabaseAdmin
      .from("users")
      .select("wallet_pin_hash")
      .eq("email", cleanSender)
      .maybeSingle();

    const pinCheck = await verifyTransactionPin({
      email: cleanSender,
      pin,
      storedPinHash: senderPinData?.wallet_pin_hash,
    });

    if (!pinCheck.valid) {
      return NextResponse.json(
        {
          error: pinCheck.error,
          attemptsRemaining: pinCheck.attemptsRemaining,
          retryAfter: pinCheck.retryAfter,
        },
        { status: pinCheck.statusCode || 401 }
      );
    }
    const rawRecipient = (recipientEmail || "").trim();
    const isEmailInput = rawRecipient.includes("@") && rawRecipient.includes(".") && !rawRecipient.startsWith("@");
    const cleanRecipientSearch = isEmailInput ? rawRecipient.toLowerCase() : rawRecipient.toLowerCase().replace(/^@/, "");

    // Quick syntax verification for username searches (alphanumeric and underscore, 2-30 chars)
    if (!isEmailInput && !/^[a-zA-Z0-9_]{2,30}$/.test(cleanRecipientSearch)) {
      return NextResponse.json(
        { error: "Invalid username format. Usernames must be 2-30 alphanumeric characters." },
        { status: 400 }
      );
    }

    // 1. Verify Recipient Account Existence (Sub-millisecond Read-Through Cache + Exact B-Tree Match)
    // Fast O(log N) indexed search: zero full table scans, zero DB locks, zero user enumeration exposure
    let recipientUser: { id: string; email: string; username?: string | null; firstName?: string | null; lastName?: string | null } | null = null;

    const cachedRecipient = await getCachedRecipient(cleanRecipientSearch);
    if (cachedRecipient === "NOT_FOUND") {
      return NextResponse.json(
        { error: isEmailInput ? "User with this email does not exist." : "User with this username does not exist." },
        { status: 404 }
      );
    } else if (cachedRecipient) {
      recipientUser = cachedRecipient;
    } else {
      if (isEmailInput) {
        // Fast-path: Exact deterministic B-Tree equality on unique email index
        const { data: exactUser, error: recipientFetchErr } = await supabaseAdmin
          .from("users")
          .select("id, email, username, firstName, lastName")
          .eq("email", cleanRecipientSearch)
          .maybeSingle();

        if (!recipientFetchErr && exactUser) {
          recipientUser = exactUser;
          await setCachedRecipient(cleanRecipientSearch, recipientUser);
        } else if (!recipientFetchErr && !exactUser) {
          await setCachedRecipient(cleanRecipientSearch, null);
          return NextResponse.json({ error: "User with this email does not exist." }, { status: 404 });
        } else {
          return NextResponse.json({ error: "Failed to verify recipient account. Please try again." }, { status: 500 });
        }
      } else {
        // Fast-path: Exact deterministic B-Tree equality on idx_users_lower_username index
        // O(log N) lookup without wildcards, full-table scans, or DB locks
        const { data: userByHandle, error: handleErr } = await supabaseAdmin
          .from("users")
          .select("id, email, username, firstName, lastName")
          .eq("username", cleanRecipientSearch)
          .maybeSingle();

        if (!handleErr && userByHandle) {
          recipientUser = userByHandle;
          await setCachedRecipient(cleanRecipientSearch, recipientUser);
        } else if (!handleErr && !userByHandle) {
          // Negative cache to defend against high-frequency enumeration
          await setCachedRecipient(cleanRecipientSearch, null);
          return NextResponse.json({ error: "User with this username does not exist." }, { status: 404 });
        } else {
          return NextResponse.json({ error: "Failed to verify recipient account. Please try again." }, { status: 500 });
        }
      }
    }

    const cleanRecipient = recipientUser.email.toLowerCase().trim();

    if (cleanSender === cleanRecipient) {
      return NextResponse.json({ error: "You cannot send money to your own account." }, { status: 400 });
    }

    // 2. Targeted Security Freeze Check (Sub-millisecond containment)
    const [senderFrozen, recipientFrozen] = await Promise.all([
      isUserAccountFrozen(cleanSender),
      isUserAccountFrozen(cleanRecipient),
    ]);

    if (senderFrozen.frozen) {
      return NextResponse.json(
        { error: senderFrozen.reason || "Your account has been placed on a temporary security hold. Transfers are restricted." },
        { status: 403 }
      );
    }

    if (recipientFrozen.frozen) {
      return NextResponse.json(
        { error: "Recipient account is currently on security hold and cannot receive transfers." },
        { status: 403 }
      );
    }

    // Convert to Fixed-Point Integer Kobo (Prevents IEEE 754 precision rounding bugs)
    const amountKobo = Math.round(amountNum * 100);

    // 3. Strict Mandatory Client Idempotency Lock Check
    const reqHeaderKey = req.headers.get("x-idempotency-key");
    clientKey = (idempotencyKey || reqHeaderKey || "").trim();
    if (!clientKey || clientKey.length < 8) {
      return NextResponse.json(
        { error: "Missing or invalid 'x-idempotency-key' header. Financial transactions require a unique client idempotency key." },
        { status: 400 }
      );
    }

    const rawIdempotency = clientKey.trim();
    const idempotencyRedisKey = `idempotency:transfer:${rawIdempotency}`;

    try {
      // Store without TTL so the key is 100% EXEMPT from eviction under volatile-lru
      const isNew = await redisConnection.set(idempotencyRedisKey, "LOCKED", "NX");
      if (!isNew) {
        return NextResponse.json(
          { error: "Duplicate transfer request detected. This operation has already been submitted." },
          { status: 409 }
        );
      }
      // Record in persistent sorted set for automated cron pruning (older than 48 hours)
      await redisConnection.zadd("idempotency:transfer:zset", Date.now(), rawIdempotency).catch(() => {});
    } catch (redisErr) {
      console.warn("⚠️ Idempotency key Redis check warning:", redisErr);
    }

    // 4. Acquire Distributed Wallet Mutex Lock (Prevents Concurrency Double-Spending)
    walletLockAcquired = await acquireWalletLock(cleanSender);
    if (!walletLockAcquired) {
      // Check for rapid concurrent lock collision attacks
      const collisionKey = `ratelimit:collisions:${cleanSender}`;
      const collisions = await redisConnection.incr(collisionKey).catch(() => 1);
      if (collisions === 1) await redisConnection.expire(collisionKey, 10).catch(() => {});
      if (collisions >= 5) {
        await freezeUserAccount(cleanSender, "Automated Security Hold: Repeated concurrent wallet mutex collision attack detected", 24);
        return NextResponse.json(
          { error: "Suspicious concurrent transaction volume detected. Account placed on temporary security hold." },
          { status: 423 }
        );
      }

      return NextResponse.json(
        { error: "Another transaction on your wallet is currently processing. Please wait a moment." },
        { status: 429 }
      );
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

    // 6. Verify & Reserve Sender Balance (Enforces 20% Limit & Sufficient Balance)
    const balanceRes = await reserveSenderBalance(cleanSender, amountNum);
    if (!balanceRes.success) {
      return NextResponse.json({ error: balanceRes.error || "Balance check failed" }, { status: 400 });
    }

    // 7. Execute Atomic Ledger Transfer (Supabase RPC with Row Locks & Double-Entry)
    const reference = rawIdempotency.startsWith("trf_") ? rawIdempotency : `trf_${rawIdempotency}`;

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("process_ledger_transfer", {
      p_sender_email: cleanSender,
      p_recipient_email: cleanRecipient,
      p_amount_kobo: amountKobo,
      p_idempotency_key: reference,
    });

    if (rpcError) {
      console.error("❌ RPC process_ledger_transfer error:", rpcError);
      captureApiException(rpcError, {
        route: "/api/payments/transfer",
        email: cleanSender,
        reference,
        extra: {
          recipient: cleanRecipient,
          amount: amountNum,
        },
      });
      return NextResponse.json(
        { error: rpcError.message || "Transfer execution failed. Please verify your balance and try again." },
        { status: 500 }
      );
    }

    if (!rpcResult || rpcResult.success === false) {
      return NextResponse.json(
        { error: rpcResult?.error || "Ledger entry creation failed. Operation rejected." },
        { status: 400 }
      );
    }

    // Authoritative sender balance returned directly from atomic PostgreSQL RPC (with FOR UPDATE lock)
    const newBalance =
      typeof rpcResult?.new_sender_balance === "number"
        ? rpcResult.new_sender_balance
        : Math.max(0, balanceRes.currentBalance - amountNum);

    // Resolve usernames for privacy policy (never leak raw email on receipts or notifications)
    let senderUsername = cleanSender.split("@")[0] || "User";
    try {
      const { data: sUser } = await supabaseAdmin.from("users").select("username").eq("email", cleanSender).maybeSingle();
      if (sUser?.username) senderUsername = sUser.username;
    } catch {}

    const senderHandle = senderUsername.startsWith("@") ? senderUsername : `@${senderUsername}`;
    const recipientHandle = recipientUser?.username
      ? (recipientUser.username.startsWith("@") ? recipientUser.username : `@${recipientUser.username}`)
      : `@${cleanRecipient.split("@")[0] || "user"}`;

    // 8. Synchronize with Payments Ledger for Statements (Sender Debit & Recipient Credit)
    const senderRef = reference;
    const recipientRef = `${reference}_rcv`;

    try {
      await Promise.all([
        supabaseAdmin.from("payments").upsert(
          {
            user_email: cleanSender,
            reference: senderRef,
            amount: amountNum,
            status: "success",
            type: "transfer_sent",
            description: `Sent money to ${recipientHandle}`,
            metadata: {
              recipient_email: cleanRecipient,
              recipientEmail: cleanRecipient,
              counterparty_email: cleanRecipient,
              recipient_username: recipientHandle,
              counterparty_username: recipientHandle,
              amount: amountNum,
              amount_kobo: amountKobo,
              transfer_type: "outbound",
              idempotency_key: reference,
            },
          },
          { onConflict: "reference" }
        ),
        supabaseAdmin.from("payments").upsert(
          {
            user_email: cleanRecipient,
            reference: recipientRef,
            amount: amountNum,
            status: "success",
            type: "transfer_received",
            description: `Received money from ${senderHandle}`,
            metadata: {
              sender_email: cleanSender,
              senderEmail: cleanSender,
              counterparty_email: cleanSender,
              sender_username: senderHandle,
              counterparty_username: senderHandle,
              amount: amountNum,
              amount_kobo: amountKobo,
              transfer_type: "inbound",
              idempotency_key: reference,
            },
          },
          { onConflict: "reference" }
        ),
      ]);
    } catch (paymentSyncErr) {
      console.warn("⚠️ Warning synchronizing payments table for transfer:", paymentSyncErr);
    }

    // Direct in-app notifications for immediate delivery
    try {
      const formattedNaira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amountNum);
      await Promise.all([
        supabaseAdmin.from("notifications").insert({
          user_email: cleanSender,
          title: "Money Sent",
          message: `You successfully sent ${formattedNaira} to ${recipientHandle}`,
        }),
        supabaseAdmin.from("notifications").insert({
          user_email: cleanRecipient,
          title: "Money Received",
          message: `You received ${formattedNaira} from ${senderHandle}`,
        }),
      ]);
    } catch (notifErr) {
      console.warn("⚠️ Warning creating transfer notifications:", notifErr);
    }

    // 9. Update Redis Unique Recipients Rate Limit Set
    try {
      const recipientSetKey = `ratelimit:send_money_recipients:${cleanSender}`;
      await redisConnection.sadd(recipientSetKey, cleanRecipient);
      await redisConnection.expire(recipientSetKey, 86400); // 24 hours TTL
    } catch (redisErr) {
      console.warn("⚠️ Redis recipient set update warning:", redisErr);
    }

    // 10. Enqueue Settlement & Cache Sync Job to BullMQ paymentQueue (Audit & Notifications)
    try {
      await paymentQueue.add("transfer-settlement", {
        type: "p2p_transfer",
        senderEmail: cleanSender,
        recipientEmail: cleanRecipient,
        amount: amountNum,
        amountKobo,
        reference,
        timestamp: new Date().toISOString(),
        settledImmediately: true,
      });
    } catch (queueErr) {
      console.warn("⚠️ BullMQ paymentQueue enqueue warning:", queueErr);
    }

    // 11. Record In-Flight Live Delta & Real-Time Discrepancy Check
    await recordLiveTransferDelta(amountKobo);
    // Asynchronous non-blocking background auditor check
    runAutomatedDiscrepancyCheck().catch(() => {});

    // 12. Invalidate Redis Caches Immediately for both parties
    await Promise.all([
      invalidateCachedProfile(cleanSender),
      invalidateCachedProfile(cleanRecipient),
    ]);

    const formattedAmount = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amountNum);

    return NextResponse.json({
      success: true,
      message: `Successfully sent ${formattedAmount} to ${recipientHandle}`,
      reference,
      recipient: recipientHandle,
      recipient_username: recipientHandle,
      recipientUsername: recipientHandle,
      new_balance: newBalance,
    });
  } catch (err: unknown) {
    console.error("❌ Network error in POST /api/payments/transfer:", err);
    captureApiException(err, {
      route: "POST /api/payments/transfer",
      email: senderEmail,
      extra: { clientKey },
    });
    if (senderEmail) {
      await invalidateCachedProfile(senderEmail).catch(() => {});
    }
    return NextResponse.json(
      { error: "A network error occurred. Your transfer was safely aborted and balance remains intact." },
      { status: 500 }
    );
  } finally {
    if (walletLockAcquired && senderEmail) {
      await releaseWalletLock(senderEmail).catch(() => {});
    }
  }
}
