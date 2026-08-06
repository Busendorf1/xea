import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { PaystackService } from "@/lib/payment/paystack";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { createHash } from "crypto";
import { invalidateCachedProfile } from "@/lib/utils/cache";

const MIN_WITHDRAWAL_AMOUNT = 10000; // 10,000 NGN
const MAX_WITHDRAWAL_AMOUNT = 50000; // 50,000 NGN

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { bankCode, bankName, accountNumber, amount, phone } = body;

    // 1. Fetch user's current profile details
    const { data: user, error: userFetchErr } = await supabaseAdmin
      .from("users")
      .select("balance, withdrawal, phone, bvn_hash, monetized, monetized_until, monetization_clicks, atw_tier")
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

    // Rule 1: Minimum balance requirement (User must have at least ₦10,000 to initiate a withdrawal)
    if (currentBalance < MIN_WITHDRAWAL_AMOUNT) {
      return NextResponse.json({
        error: `Minimum wallet balance required to initiate a withdrawal is ₦${MIN_WITHDRAWAL_AMOUNT.toLocaleString("en-NG")}. Your current balance is ₦${currentBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}.`,
      }, { status: 400 });
    }

    // Rule 2: Minimum withdrawal amount per transaction is ₦10,000
    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount < MIN_WITHDRAWAL_AMOUNT) {
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

    // Rule D: Bank account uniqueness (no multi-accounting)
    const { data: duplicateBank, error: dupBankErr } = await supabaseAdmin
      .from("payments")
      .select("user_email")
      .eq("type", "withdrawal")
      .in("status", ["success", "pending"])
      .neq("user_email", email)
      .eq("metadata->>accountNumber", accountNumber)
      .eq("metadata->>bankCode", bankCode)
      .limit(1);

    if (dupBankErr) {
      console.error("❌ Database error checking duplicate bank account:", dupBankErr);
      return NextResponse.json({ error: "Verification failed. Please review your account details or contact support." }, { status: 500 });
    }

    if (duplicateBank && duplicateBank.length > 0) {
      console.warn(`❌ Security Block: Bank details already used by ${duplicateBank[0].user_email}`);
      return NextResponse.json({ error: "Verification failed. Bank account details are registered to another profile." }, { status: 400 });
    }

    // Rule E: First Bank Account Enforcement
    const { data: pastWithdrawal, error: pastWithdrawalErr } = await supabaseAdmin
      .from("payments")
      .select("metadata")
      .eq("user_email", email)
      .eq("type", "withdrawal")
      .in("status", ["success", "pending"])
      .order("created_at", { ascending: true })
      .limit(1);

    if (!pastWithdrawalErr && pastWithdrawal && pastWithdrawal.length > 0) {
      const firstMeta = pastWithdrawal[0].metadata as any;
      const firstAccNum = firstMeta?.accountNumber;
      const firstBankCode = firstMeta?.bankCode;

      if (firstAccNum && firstBankCode) {
        if (firstAccNum.trim() !== accountNumber.trim() || firstBankCode.trim() !== bankCode.trim()) {
          return NextResponse.json({ error: "For security and fraud prevention, withdrawals must use the bank account associated with your initial payout." }, { status: 400 });
        }
      }
    }

    // Attempt Bank Resolution & Payout Initiation with Network Fault Recovery
    let accountName = "Verified Account";
    try {
      console.log(`🏦 Resolving bank account ${accountNumber} with code ${bankCode}`);
      const resolvedAccount = await PaystackService.resolveAccount(accountNumber, bankCode);
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

    // Record pending withdrawal in payments ledger
    const { error: paymentInsertErr } = await supabaseAdmin.from("payments").insert({
      user_email: email,
      reference,
      amount: withdrawAmount,
      status: "pending",
      type: "withdrawal",
      description: `Withdrawal to ${bankName} (${accountNumber})`,
      metadata: {
        bankCode,
        bankName,
        accountNumber,
        accountName,
        phone,
      },
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

    await invalidateCachedProfile(email);

    // Send user notification
    await supabaseAdmin.from("notifications").insert({
      user_email: email,
      title: "Withdrawal Queued",
      message: `Your withdrawal of ₦${withdrawAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} to ${bankName} (${accountNumber}) has been queued and will be processed shortly.`,
    });

    return NextResponse.json({
      success: true,
      message: "Withdrawal requested successfully.",
      reference,
      newBalance,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/withdrawals/initiate:", err);
    return NextResponse.json({ error: err.message || "Failed to process withdrawal request" }, { status: 500 });
  }
}
