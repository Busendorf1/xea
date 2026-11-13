import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import { PayoutProvider } from "@/lib/payment/payoutProvider";
import { KoraService } from "@/lib/payment/kora";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import { captureApiException } from "@/lib/logger";
import { settleWithdrawalByReference } from "@/lib/services/payoutSettlementService";
import { initiateWithdrawalApiSchema } from "@/lib/validationSchemas";
import { decryptSensitiveField } from "@/lib/security/piiCrypto";
import { verifyTransactionPin, resolveStoredWalletPinHash } from "@/lib/security/walletPinHelper";
import crypto from "crypto";

const MIN_WITHDRAWAL_AMOUNT = 10000; // 10,000 NGN
const l1WithdrawalMutex = new Map<string, number>();

function isTerminalBankAccountError(msg: string): boolean {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("invalid account") ||
    (m.includes("account number") && m.includes("invalid")) ||
    m.includes("could not resolve account") ||
    m.includes("account closed") ||
    m.includes("no such account") ||
    m.includes("invalid bank") ||
    m.includes("unknown bank") ||
    m.includes("bvn") ||
    (m.includes("beneficiary") && m.includes("invalid"))
  );
}

export async function POST(req: NextRequest) {
  let email: string | null = null;
  let emailLower = "";
  let reference = "";
  let withdrawAmount = 0;
  let walletDeducted = false;
  let rollbackAtomicDebit: ((reason: string) => Promise<void>) | null = null;

  try {
    email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 0. Atomic In-Flight Mutex (Prevents concurrent double-click race conditions, resilient to Redis quota cooldown)
    const emailClean = email.toLowerCase().trim();
    const nowMs = Date.now();
    const existingL1Lock = l1WithdrawalMutex.get(emailClean);
    if (existingL1Lock && existingL1Lock > nowMs) {
      return NextResponse.json(
        { error: "A withdrawal request is already processing for this account. Please wait a moment." },
        { status: 429 }
      );
    }
    l1WithdrawalMutex.set(emailClean, nowMs + 5000);
    if (l1WithdrawalMutex.size > 2000) {
      for (const [k, exp] of l1WithdrawalMutex) {
        if (exp <= nowMs) l1WithdrawalMutex.delete(k);
      }
    }

    if (isRedisReady()) {
      const lockKey = `withdrawal:mutex:${emailClean}`;
      try {
        const res = await redisConnection.set(lockKey, "LOCKED", "EX", 5, "NX");
        if (res === null && isRedisReady()) {
          return NextResponse.json(
            { error: "A withdrawal request is already processing for this account. Please wait a moment." },
            { status: 429 }
          );
        }
      } catch {}
    }

    const body = await req.json();
    const parsed = initiateWithdrawalApiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid withdrawal parameters" },
        { status: 400 }
      );
    }
    const { bankCode, bankName, accountNumber, amount: parsedAmount, phone, pin } = parsed.data;
    withdrawAmount = parsedAmount;

    // 1. Flush any buffered/sharded affiliate yield first and fetch user's profile
    emailLower = email.toLowerCase().trim();
    const { isExemptFromBarriersAndInactivity } = await import("@/lib/adminHelper");
    const { flushPendingAffiliateYield } = await import("@/lib/affiliateEngine");
    if (isExemptFromBarriersAndInactivity(emailLower)) {
      await flushPendingAffiliateYield(emailLower).catch(() => {});
    }

    const { data: user, error: userFetchErr } = await supabaseAdmin
      .from("users")
      .select("balance, withdrawal, phone, monetized, monetization_clicks, atw_tier, is_affiliate, is_career, wallet_pin_hash, passphrase")
      .ilike("email", emailLower)
      .maybeSingle();

    if (userFetchErr || !user) {
      console.error("❌ Error fetching user for withdrawal:", userFetchErr);
      return NextResponse.json({ error: "Failed to verify account balance" }, { status: 500 });
    }

    // 2. Enforce 4-Digit Wallet PIN (fail closed when unset)
    const pinCheck = await verifyTransactionPin({
      email: emailLower,
      pin,
      storedPinHash: resolveStoredWalletPinHash(user),
    });

    if (!pinCheck.valid) {
      return NextResponse.json(
        {
          error: pinCheck.error,
          code: pinCheck.code,
          attemptsRemaining: pinCheck.attemptsRemaining,
          retryAfter: pinCheck.retryAfter,
        },
        { status: pinCheck.statusCode || 401 }
      );
    }

    const currentBalance = parseFloat(user.balance || 0);
    const currentWithdrawal = parseFloat(user.withdrawal || 0);

    const isAdmin = isAdminEmail(email) || isExemptFromBarriersAndInactivity(emailLower, user as any);

    // Rule 1: Minimum balance requirement (Bypassed for Admins)
    if (!isAdmin && currentBalance < MIN_WITHDRAWAL_AMOUNT) {
      return NextResponse.json(
        {
          error: `Minimum wallet balance required to initiate a withdrawal is ₦${MIN_WITHDRAWAL_AMOUNT.toLocaleString("en-NG")}. Your current balance is ₦${currentBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}.`,
        },
        { status: 400 }
      );
    }

    // Rule 2: Minimum withdrawal amount per transaction (Bypassed for Admins)
    if (!isAdmin && (!Number.isFinite(withdrawAmount) || withdrawAmount < MIN_WITHDRAWAL_AMOUNT)) {
      return NextResponse.json(
        {
          error: `Minimum withdrawal amount per transaction is ₦${MIN_WITHDRAWAL_AMOUNT.toLocaleString("en-NG")}.`,
        },
        { status: 400 }
      );
    }

    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal amount." }, { status: 400 });
    }

    // Rule 3: Users can withdraw ANY amount up to their full available balance (can empty account to ₦0)
    if (withdrawAmount > currentBalance) {
      return NextResponse.json(
        {
          error: `Insufficient available balance. Your total available balance is ₦${currentBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}.`,
        },
        { status: 400 }
      );
    }

    // Rule C: Registered phone verification (non-placeholder, >= 7 digits, last-10 match)
    const normalizePhone = (num: unknown) => {
      const cleaned = String(num || "").replace(/\D/g, "");
      return cleaned.slice(-10);
    };

    const decryptedProfilePhone = user.phone ? decryptSensitiveField(String(user.phone)) : "";
    const profileDigits = decryptedProfilePhone ? normalizePhone(decryptedProfilePhone) : "";
    const inputDigits = normalizePhone(phone);
    if (
      !decryptedProfilePhone ||
      decryptedProfilePhone.startsWith("PLACEHOLDER") ||
      profileDigits.length < 7 ||
      inputDigits.length < 7 ||
      profileDigits !== inputDigits
    ) {
      console.warn(`❌ Security Block: Registered phone verification failed for ${emailLower}`);
      return NextResponse.json(
        { error: "Verification failed. Phone number must match your registered account phone number." },
        { status: 400 }
      );
    }

    // Attempt Bank Resolution with High-Volume Queue Fallback (Never reject on gateway timeout/rate-limit)
    let accountName = "Verified Account";
    let shouldQueue = false;
    let queueReason = "";

    try {
      console.log(`🏦 Resolving bank account ${accountNumber} with code ${bankCode}`);
      const resolvedAccount = await PayoutProvider.resolveAccount(accountNumber, bankCode);
      if (resolvedAccount && resolvedAccount.account_name) {
        accountName = resolvedAccount.account_name;
      }
    } catch (netErr: any) {
      const errMsg = netErr?.message || "";
      if (isTerminalBankAccountError(errMsg)) {
        return NextResponse.json(
          {
            error: `Bank account verification failed: ${errMsg}. Your wallet balance was not deducted.`,
          },
          { status: 400 }
        );
      }
      // High-volume / transient bank resolution timeout: Do NOT cancel! Queue for batch window.
      console.warn("⚠️ Gateway busy during bank resolution — queueing withdrawal instead of cancelling:", errMsg);
      accountName = "Verified Beneficiary";
      shouldQueue = true;
      queueReason = "High-volume payout queue (bank verification deferred to batch dispatch)";
    }

    // Generate unique transaction reference BEFORE atomic wallet debit for idempotent ledger tracking
    reference = `trsf_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").substring(0, 12)}`;

    // Deduct user's balance atomically via PostgreSQL FOR UPDATE row-lock RPC (no non-atomic OCC fallback)
    let newBalance = Math.max(0, Number((currentBalance - withdrawAmount).toFixed(2)));
    let newWithdrawal = Number((currentWithdrawal + withdrawAmount).toFixed(2));

    const { data: deductRes, error: deductErr } = await supabaseAdmin.rpc("deduct_wallet_atomic", {
      p_user_email: emailLower,
      p_amount: withdrawAmount,
      p_reason: "withdrawal_debit",
      p_reference: reference,
    });

    if (!deductErr && deductRes) {
      if (deductRes.success === false) {
        return NextResponse.json(
          { error: deductRes.error || "Insufficient wallet balance for withdrawal." },
          { status: 400 }
        );
      }
      walletDeducted = true;
      newBalance = Number(deductRes.new_balance ?? newBalance);
      await supabaseAdmin
        .from("users")
        .update({ withdrawal: newWithdrawal })
        .ilike("email", emailLower);
    } else {
      // Compatibility fallback to initiate_atomic_withdrawal if deduct_wallet_atomic is not yet deployed
      const { data: atomicResult, error: atomicErr } = await supabaseAdmin.rpc("initiate_atomic_withdrawal", {
        p_email: emailLower,
        p_amount: withdrawAmount,
        p_min_amount: MIN_WITHDRAWAL_AMOUNT,
        p_is_admin: isAdmin,
      });

      if (atomicErr || !atomicResult) {
        console.error("❌ Atomic withdrawal RPC unavailable:", deductErr?.message || atomicErr?.message);
        return NextResponse.json(
          { error: "Unable to process withdrawal safely at this time. Please try again later." },
          { status: 503 }
        );
      }
      if (atomicResult.success === false) {
        return NextResponse.json({ error: atomicResult.error || "Withdrawal validation failed." }, { status: 400 });
      }
      walletDeducted = true;
      newBalance = Number(atomicResult.new_balance ?? newBalance);
      newWithdrawal = Number(atomicResult.new_withdrawal ?? newWithdrawal);
    }

    rollbackAtomicDebit = async (reason: string) => {
      if (!walletDeducted) return;
      walletDeducted = false;
      const { error: refundErr } = await supabaseAdmin.rpc("refund_wallet_atomic", {
        p_user_email: emailLower,
        p_amount: withdrawAmount,
        p_reason: reason,
        p_reference: reference,
      });
      if (refundErr) {
        await supabaseAdmin.rpc("refund_wallet_deduction_atomic", {
          p_user_email: emailLower,
          p_amount: withdrawAmount,
          p_reason: reason,
          p_reference: reference,
        });
      }
      await Promise.all([
        invalidateCachedProfile(emailLower).catch(() => {}),
        redisConnection.incr(`statement:ver:${emailLower}`).catch(() => {}),
      ]);
    };

    // Dynamic Gateway Payout Fee Breakdown: User is responsible for active gateway (Paystack/Kora) interbank charges
    const activeGateway = PayoutProvider.getActiveGateway();
    const WITHDRAWAL_TRANSFER_FEE = PayoutProvider.calculateTransferFee(withdrawAmount, activeGateway);
    const netDisbursementAmount = Number(Math.max(0, withdrawAmount - WITHDRAWAL_TRANSFER_FEE).toFixed(2));

    // Record processing withdrawal in payments ledger
    const paymentMetadata = {
      bankCode,
      bankName,
      accountNumber,
      accountName,
      phone,
      provider: activeGateway,
      fee: WITHDRAWAL_TRANSFER_FEE,
      net_amount: netDisbursementAmount,
      fee_bearer: "user",
    };

    const { error: paymentInsertErr } = await supabaseAdmin.from("payments").insert({
      user_email: emailLower,
      reference,
      amount: withdrawAmount,
      status: "processing",
      type: "withdrawal",
      description: `Withdrawal to ${bankName} (${accountNumber})`,
      metadata: paymentMetadata,
    });

    if (paymentInsertErr) {
      console.error("❌ Error inserting payment ledger record:", paymentInsertErr);
      await rollbackAtomicDebit("withdrawal_ledger_insert_failed");
      return NextResponse.json(
        { error: "Failed to queue withdrawal record due to network error. Balance restored." },
        { status: 500 }
      );
    }

    // 4. Check available disbursement float balance & queue depth before attempting immediate payout
    try {
      if (!shouldQueue && activeGateway === "kora") {
        const floatBal = await KoraService.getNairaBalance();
        if (floatBal < netDisbursementAmount) {
          shouldQueue = true;
          queueReason = "Scheduled payout window (batch processing)";
          console.log(
            `⏳ Kora float balance (₦${floatBal}) is below net withdrawal amount (₦${netDisbursementAmount}). Queuing ref=${reference}.`
          );
        }
      }
    } catch (checkErr) {
      console.warn("⚠️ Could not check gateway float balance:", checkErr);
    }

    if (shouldQueue) {
      await supabaseAdmin
        .from("payments")
        .update({
          status: "queued",
          metadata: {
            ...paymentMetadata,
            queued_reason: queueReason,
            queued_at: new Date().toISOString(),
          },
        })
        .eq("reference", reference);

      try {
        await redisConnection.rpush(
          "queue:payouts",
          JSON.stringify({
            reference,
            amount: netDisbursementAmount,
            grossAmount: withdrawAmount,
            fee: WITHDRAWAL_TRANSFER_FEE,
            email: emailLower,
            bankCode,
            bankName,
            accountNumber,
            accountName,
            queuedAt: new Date().toISOString(),
          })
        );
      } catch (redisErr) {
        console.warn("⚠️ Failed to push withdrawal to Redis payout queue:", redisErr);
      }

      await Promise.all([
        invalidateCachedProfile(emailLower),
        redisConnection.incr(`statement:ver:${emailLower}`).catch(() => {}),
        redisConnection.del(`statement:withdrawals:${emailLower}`, `statement:all:${emailLower}`).catch(() => {}),
      ]);

      await supabaseAdmin.from("notifications").insert({
        user_email: emailLower,
        title: "Withdrawal Queued",
        message: `Your withdrawal of ₦${withdrawAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Net: ₦${netDisbursementAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} after ₦${WITHDRAWAL_TRANSFER_FEE} network transfer fee) has been queued for our scheduled payout window.`,
      });

      walletDeducted = false;
      return NextResponse.json({
        success: true,
        queued: true,
        status: "queued",
        message: `Withdrawal queued! ₦${netDisbursementAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} will arrive during our scheduled payout window (₦${WITHDRAWAL_TRANSFER_FEE} transfer fee applied).`,
        reference,
        newBalance,
        fee: WITHDRAWAL_TRANSFER_FEE,
        netAmount: netDisbursementAmount,
      });
    }

    // Call payout provider immediately to disburse funds (disburse net amount so user bears fee)
    let payoutStatus = "processing";
    try {
      console.log(
        `🚀 Dispatching immediate payout via [${activeGateway.toUpperCase()}] ref=${reference} (Gross: ₦${withdrawAmount}, Net: ₦${netDisbursementAmount})`
      );
      const payoutRes = await PayoutProvider.initiatePayout({
        reference,
        amount: netDisbursementAmount,
        bankCode,
        accountNumber,
        accountName,
        customerEmail: emailLower,
        narration: `Paayh Withdrawal to ${accountName}`,
      });

      payoutStatus = payoutRes.status || "processing";
      console.log(`✅ Gateway payout accepted: status=${payoutStatus}, ref=${payoutRes.reference}`);

      // Update payment record with gateway response
      await supabaseAdmin
        .from("payments")
        .update({
          status: payoutStatus === "success" ? "success" : "processing",
          metadata: {
            ...paymentMetadata,
            gateway_status: payoutStatus,
          },
        })
        .eq("reference", reference);
    } catch (payoutErr: any) {
      console.error("❌ Payout Gateway disbursement error:", payoutErr);
      const errMsg = payoutErr?.message || "Gateway disbursement error";

      // Only fail & refund immediately if the bank explicitly rejected the beneficiary account.
      // For ANY high-volume spike, rate limit, timeout, float depletion, or 5xx error, QUEUE IT!
      if (!isTerminalBankAccountError(errMsg)) {
        console.log(`⏳ Holding withdrawal [${reference}] in high-volume queue due to transient gateway status: ${errMsg}`);

        await supabaseAdmin
          .from("payments")
          .update({
            status: "queued",
            metadata: {
              ...paymentMetadata,
              queued_reason: errMsg || "Held for scheduled payout window",
              queued_at: new Date().toISOString(),
            },
          })
          .eq("reference", reference);

        try {
          await redisConnection.rpush(
            "queue:payouts",
            JSON.stringify({
              reference,
              amount: netDisbursementAmount,
              grossAmount: withdrawAmount,
              fee: WITHDRAWAL_TRANSFER_FEE,
              email: emailLower,
              bankCode,
              bankName,
              accountNumber,
              accountName,
              queuedAt: new Date().toISOString(),
            })
          );
        } catch (redisErr) {
          console.warn("⚠️ Failed to push withdrawal to Redis payout queue:", redisErr);
        }

        await Promise.all([
          invalidateCachedProfile(emailLower),
          redisConnection.incr(`statement:ver:${emailLower}`).catch(() => {}),
          redisConnection.del(`statement:withdrawals:${emailLower}`, `statement:all:${emailLower}`).catch(() => {}),
        ]);

        await supabaseAdmin.from("notifications").insert({
          user_email: emailLower,
          title: "Withdrawal Queued",
          message: `Your withdrawal of ₦${withdrawAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been safely queued and will be disbursed during our next payout batch window.`,
        });

        walletDeducted = false;
        return NextResponse.json({
          success: true,
          queued: true,
          status: "queued",
          message: "Withdrawal received! Your request has been safely queued and will be disbursed during our next payout batch window.",
          reference,
          newBalance,
          fee: WITHDRAWAL_TRANSFER_FEE,
          netAmount: netDisbursementAmount,
        });
      }

      // Terminal failure (e.g. Invalid/closed bank account): Atomically refund user's full gross balance
      await settleWithdrawalByReference(reference, "failed", errMsg, {
        error: errMsg,
        refunded_at: new Date().toISOString(),
      });
      await redisConnection.incr(`statement:ver:${emailLower}`).catch(() => {});
      walletDeducted = false;

      return NextResponse.json(
        {
          error: `Bank rejected beneficiary account (${errMsg}). Your full ₦${withdrawAmount.toLocaleString("en-NG")} balance has been restored to your wallet. Disbursements are settled via Nigerian clearing rails; please verify your bank details or try using a Nigerian bank account (NUBAN).`,
        },
        { status: 400 }
      );
    }

    walletDeducted = false;
    await Promise.all([
      invalidateCachedProfile(emailLower),
      redisConnection.incr(`statement:ver:${emailLower}`).catch(() => {}),
      redisConnection.del(`statement:withdrawals:${emailLower}`, `statement:all:${emailLower}`).catch(() => {}),
    ]);

    // Send user notification
    await supabaseAdmin.from("notifications").insert({
      user_email: emailLower,
      title: "Withdrawal Processing",
      message: `Your withdrawal of ₦${withdrawAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} to ${bankName} (${accountNumber}) has been sent to the bank and is processing.`,
    });

    return NextResponse.json({
      success: true,
      message: "Withdrawal initiated successfully! The funds will arrive in your bank account shortly.",
      reference,
      status: payoutStatus,
      newBalance,
      fee: WITHDRAWAL_TRANSFER_FEE,
      netAmount: netDisbursementAmount,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/withdrawals/initiate:", err);
    if (walletDeducted && rollbackAtomicDebit) {
      await rollbackAtomicDebit("withdrawal_unexpected_error").catch(() => {});
    }
    captureApiException(err, {
      route: "POST /api/withdrawals/initiate",
      email: email || undefined,
    });
    return NextResponse.json(
      {
        error: "Failed to process withdrawal request. Disbursements are settled via Nigerian clearing rails; please verify your bank details or try again.",
      },
      { status: 500 }
    );
  }
}
