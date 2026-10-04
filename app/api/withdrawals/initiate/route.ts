import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import { PayoutProvider } from "@/lib/payment/payoutProvider";
import { KoraService } from "@/lib/payment/kora";
import redisConnection from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";

const MIN_WITHDRAWAL_AMOUNT = 10000; // 10,000 NGN

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 0. Atomic In-Flight Mutex (Prevents concurrent double-click race conditions)
    const lockKey = `withdrawal:mutex:${email.toLowerCase()}`;
    let lockAcquired = false;
    try {
      lockAcquired = !!(await redisConnection.set(lockKey, "LOCKED", "EX", 5, "NX"));
    } catch {
      lockAcquired = true; // Fallback if Redis is down
    }

    if (!lockAcquired) {
      return NextResponse.json({ error: "A withdrawal request is already processing for this account. Please wait a moment." }, { status: 429 });
    }

    const body = await req.json();
    const { bankCode, bankName, accountNumber, amount, phone } = body;

    // 1. Fetch user's current profile details
    const { data: user, error: userFetchErr } = await supabaseAdmin
      .from("users")
      .select("balance, withdrawal, phone, bvn_hash, monetized, monetization_clicks, atw_tier")
      .ilike("email", email)
      .maybeSingle();

    if (userFetchErr || !user) {
      console.error("❌ Error fetching user for withdrawal:", userFetchErr);
      return NextResponse.json({ error: "Failed to verify account balance" }, { status: 500 });
    }

    if (!bankCode || !bankName || !accountNumber || !phone) {
      return NextResponse.json({ error: "bankCode, bankName, accountNumber, and phone are required" }, { status: 400 });
    }

    const currentBalance = parseFloat(user.balance || 0);
    const currentWithdrawal = parseFloat(user.withdrawal || 0);

    const isAdmin = isAdminEmail(email);
    const withdrawAmount = parseFloat(amount);

    // Rule 1: Minimum balance requirement (Bypassed for Admins)
    if (!isAdmin && currentBalance < MIN_WITHDRAWAL_AMOUNT) {
      return NextResponse.json({
        error: `Minimum wallet balance required to initiate a withdrawal is ₦${MIN_WITHDRAWAL_AMOUNT.toLocaleString("en-NG")}. Your current balance is ₦${currentBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}.`,
      }, { status: 400 });
    }

    // Rule 2: Minimum withdrawal amount per transaction (Bypassed for Admins)
    if (!isAdmin && (isNaN(withdrawAmount) || withdrawAmount < MIN_WITHDRAWAL_AMOUNT)) {
      return NextResponse.json({
        error: `Minimum withdrawal amount per transaction is ₦${MIN_WITHDRAWAL_AMOUNT.toLocaleString("en-NG")}.`,
      }, { status: 400 });
    }

    // Rule 3: Users can withdraw ANY amount up to their full available balance (can empty account to ₦0)
    if (withdrawAmount > currentBalance) {
      return NextResponse.json({
        error: `Insufficient available balance. Your total available balance is ₦${currentBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}.`,
      }, { status: 400 });
    }

    // Rule C: Phone matching user profile (Normalized comparison of last 10 digits)
    const normalizePhone = (num: string) => {
      const cleaned = num.replace(/\D/g, "");
      return cleaned.slice(-10);
    };

    if (!user.phone || normalizePhone(user.phone) !== normalizePhone(phone)) {
      console.warn(`❌ Security Block: Phone mismatch. Input: "${phone}", Profile: "${user.phone}"`);
      return NextResponse.json({ error: "Verification failed. Phone number must match your registered account phone number." }, { status: 400 });
    }

    // Attempt Bank Resolution & Payout Initiation with Network Fault Recovery
    let accountName = "Verified Account";
    try {
      console.log(`🏦 Resolving bank account ${accountNumber} with code ${bankCode}`);
      const resolvedAccount = await PayoutProvider.resolveAccount(accountNumber, bankCode);
      if (resolvedAccount && resolvedAccount.account_name) {
        accountName = resolvedAccount.account_name;
      }
    } catch (netErr: any) {
      console.warn("⚠️ Network/API issue resolving bank account. Resetting balance state for user retry:", netErr?.message || netErr);
      return NextResponse.json({
        error: "Network error connecting to payout gateway. Your balance remains unchanged. Please try again shortly.",
      }, { status: 503 });
    }

    // Deduct user's balance atomically using Optimistic Concurrency Control (OCC)
    const newBalance = Math.max(0, currentBalance - withdrawAmount);
    const newWithdrawal = currentWithdrawal + withdrawAmount;

    const { data: updatedUser, error: userUpdateErr } = await supabaseAdmin
      .from("users")
      .update({
        balance: newBalance,
        withdrawal: newWithdrawal,
      })
      .ilike("email", email)
      .eq("balance", currentBalance)
      .select();

    if (userUpdateErr || !updatedUser || updatedUser.length === 0) {
      console.error("❌ OCC check failed during withdrawal balance deduction:", userUpdateErr);
      return NextResponse.json({ error: "Balance mismatch or concurrent transaction detected. Please refresh and try again." }, { status: 409 });
    }

    // Generate unique transaction reference
    const reference = `trsf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Payout Fee Breakdown: User is responsible for Kora/interbank transfer charges (₦35)
    const WITHDRAWAL_TRANSFER_FEE = 35;
    const netDisbursementAmount = Math.max(0, withdrawAmount - WITHDRAWAL_TRANSFER_FEE);

    // Record processing withdrawal in payments ledger
    const paymentMetadata = {
      bankCode,
      bankName,
      accountNumber,
      accountName,
      phone,
      provider: PayoutProvider.getActiveGateway(),
      fee: WITHDRAWAL_TRANSFER_FEE,
      net_amount: netDisbursementAmount,
      fee_bearer: "user",
    };

    const { error: paymentInsertErr } = await supabaseAdmin.from("payments").insert({
      user_email: email,
      reference,
      amount: withdrawAmount,
      status: "processing",
      type: "withdrawal",
      description: `Withdrawal to ${bankName} (${accountNumber})`,
      metadata: paymentMetadata,
    });

    if (paymentInsertErr) {
      console.error("❌ Error inserting payment ledger record:", paymentInsertErr);
      // Auto-rollback balance update on ledger write error to ensure zero locked balance
      await supabaseAdmin
        .from("users")
        .update({ balance: currentBalance, withdrawal: currentWithdrawal })
        .ilike("email", email);

      await invalidateCachedProfile(email);
      return NextResponse.json({ error: "Failed to queue withdrawal record due to network error. Balance restored." }, { status: 500 });
    }

    // 4. Check available disbursement float balance before attempting payout
    let shouldQueue = false;
    let queueReason = "";

    try {
      if (PayoutProvider.getActiveGateway() === "kora") {
        const floatBal = await KoraService.getNairaBalance();
        if (floatBal < netDisbursementAmount) {
          shouldQueue = true;
          queueReason = "Scheduled payout window (batch processing)";
          console.log(`⏳ Kora float balance (₦${floatBal}) is below net withdrawal amount (₦${netDisbursementAmount}). Queuing ref=${reference}.`);
        }
      }
    } catch (checkErr) {
      console.warn("⚠️ Could not check gateway float balance:", checkErr);
    }

    if (shouldQueue) {
      // Mark payment as queued (balance remains safely in withdrawal column)
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
            email,
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

      await invalidateCachedProfile(email);

      await supabaseAdmin.from("notifications").insert({
        user_email: email,
        title: "Withdrawal Queued",
        message: `Your withdrawal of ₦${withdrawAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Net: ₦${netDisbursementAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} after ₦${WITHDRAWAL_TRANSFER_FEE} network transfer fee) has been queued for our scheduled payout window.`,
      });

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
      console.log(`🚀 Dispatching immediate payout via [${PayoutProvider.getActiveGateway().toUpperCase()}] ref=${reference} (Gross: ₦${withdrawAmount}, Net: ₦${netDisbursementAmount})`);
      const payoutRes = await PayoutProvider.initiatePayout({
        reference,
        amount: netDisbursementAmount,
        bankCode,
        accountNumber,
        accountName,
        customerEmail: email,
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
      const errMsg = (payoutErr?.message || "").toLowerCase();
      const isBalanceOrTempIssue =
        errMsg.includes("balance") ||
        errMsg.includes("insufficient") ||
        errMsg.includes("fund") ||
        errMsg.includes("unavailable") ||
        errMsg.includes("timeout") ||
        errMsg.includes("network") ||
        errMsg.includes("rate limit") ||
        errMsg.includes("limit reached") ||
        errMsg.includes("exceeded");

      if (isBalanceOrTempIssue) {
        console.log(`⏳ Holding withdrawal [${reference}] in queue due to gateway status: ${payoutErr?.message}`);

        await supabaseAdmin
          .from("payments")
          .update({
            status: "queued",
            metadata: {
              ...paymentMetadata,
              queued_reason: payoutErr?.message || "Held for payout window",
              queued_at: new Date().toISOString(),
            },
          })
          .eq("reference", reference);

        try {
          await redisConnection.rpush(
            "queue:payouts",
            JSON.stringify({
              reference,
              amount: withdrawAmount,
              email,
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

        await invalidateCachedProfile(email);

        await supabaseAdmin.from("notifications").insert({
          user_email: email,
          title: "Withdrawal Queued",
          message: `Your withdrawal of ₦${withdrawAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been queued and will be disbursed during our scheduled payout window.`,
        });

        return NextResponse.json({
          success: true,
          queued: true,
          status: "queued",
          message: "Withdrawal received! Your request has been queued and will be disbursed during our scheduled payout window.",
          reference,
          newBalance,
        });
      }

      // Permanent failure (e.g. Invalid account details): Auto-rollback user's balance
      await supabaseAdmin
        .from("users")
        .update({ balance: currentBalance, withdrawal: currentWithdrawal })
        .ilike("email", email);

      await supabaseAdmin
        .from("payments")
        .update({
          status: "failed",
          metadata: {
            ...paymentMetadata,
            error: payoutErr?.message || "Gateway disbursement failed",
          },
        })
        .eq("reference", reference);

      await invalidateCachedProfile(email);

      return NextResponse.json({
        error: `Payout gateway error: ${payoutErr?.message || "Transaction could not be processed"}. Your balance has been restored.`,
      }, { status: 400 });
    }

    await invalidateCachedProfile(email);

    // Send user notification
    await supabaseAdmin.from("notifications").insert({
      user_email: email,
      title: "Withdrawal Processing",
      message: `Your withdrawal of ₦${withdrawAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} to ${bankName} (${accountNumber}) has been sent to the bank and is processing.`,
    });

    return NextResponse.json({
      success: true,
      message: "Withdrawal initiated successfully! The funds will arrive in your bank account shortly.",
      reference,
      status: payoutStatus,
      newBalance,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/withdrawals/initiate:", err);
    return NextResponse.json({ error: err.message || "Failed to process withdrawal request" }, { status: 500 });
  }
}
