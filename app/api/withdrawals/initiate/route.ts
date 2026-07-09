import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { PaystackService } from "@/lib/payment/paystack";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { createHash } from "crypto";
import { invalidateCachedProfile } from "@/lib/utils/cache";

const MIN_WITHDRAWAL_THRESHOLD = 30000; // 30,000 NGN

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { bankCode, bankName, accountNumber, amount, phone, bvn } = body;

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal amount" }, { status: 400 });
    }

    if (!bankCode || !bankName || !accountNumber || !phone) {
      return NextResponse.json({ error: "bankCode, bankName, accountNumber, and phone are required" }, { status: 400 });
    }

    // 1. Fetch user's current profile details
    const { data: user, error: userFetchErr } = await supabaseAdmin
      .from("users")
      .select("balance, withdrawal, phone, bvn_hash, monetized")
      .ilike("email", email)
      .maybeSingle();

    if (userFetchErr || !user) {
      console.error("❌ Error fetching user for withdrawal:", userFetchErr);
      return NextResponse.json({ error: "Failed to verify account balance" }, { status: 500 });
    }

    const currentBalance = parseFloat(user.balance || 0);
    const currentWithdrawal = parseFloat(user.withdrawal || 0);

    // 2. Validate against withdrawal rules
    // Rule A: Minimum threshold of 30,000 NGN for everyone
    if (currentBalance < MIN_WITHDRAWAL_THRESHOLD) {
      return NextResponse.json({
        error: `Insufficient balance. Minimum threshold for withdrawal is ₦${MIN_WITHDRAWAL_THRESHOLD.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      }, { status: 400 });
    }

    // Rule B: Deplete to zero (must withdraw exact total balance)
    if (withdrawAmount !== currentBalance) {
      return NextResponse.json({
        error: "Withdrawals must deplete your account to zero. You must withdraw your entire available balance.",
      }, { status: 400 });
    }

    // Rule C: Phone matching user profile (Normalized comparison of the last 10 digits)
    const normalizePhone = (num: string) => {
      const cleaned = num.replace(/\D/g, "");
      return cleaned.slice(-10);
    };

    if (!user.phone || normalizePhone(user.phone) !== normalizePhone(phone)) {
      console.warn(`❌ Security Block: Phone mismatch. Input: "${phone}" (normalized: "${normalizePhone(phone)}"), Profile: "${user.phone}" (normalized: "${normalizePhone(user.phone)}")`);
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
      return NextResponse.json({ error: "Verification failed. Please review your account details or contact support." }, { status: 400 });
    }

    // Rule E: First Bank Account Enforcement (Fraud Prevention)
    const { data: pastWithdrawal, error: pastWithdrawalErr } = await supabaseAdmin
      .from("payments")
      .select("metadata")
      .eq("user_email", email)
      .eq("type", "withdrawal")
      .in("status", ["success", "pending"])
      .order("created_at", { ascending: true })
      .limit(1);

    if (pastWithdrawalErr) {
      console.error("❌ Database error checking past withdrawals:", pastWithdrawalErr);
      return NextResponse.json({ error: "Verification failed. Please review your account details or contact support." }, { status: 500 });
    }

    if (pastWithdrawal && pastWithdrawal.length > 0) {
      const firstMeta = pastWithdrawal[0].metadata as any;
      const firstAccNum = firstMeta?.accountNumber;
      const firstBankCode = firstMeta?.bankCode;

      if (firstAccNum && firstBankCode) {
        if (firstAccNum.trim() !== accountNumber.trim() || firstBankCode.trim() !== bankCode.trim()) {
          console.warn(`❌ Security Block: Bank mismatch for ${email}. First: ${firstAccNum} (${firstBankCode}), Input: ${accountNumber} (${bankCode})`);
          return NextResponse.json({ error: "For security and fraud prevention, you must continue to withdraw to the bank account used on your first withdrawal. Please contact support to update your bank details." }, { status: 400 });
        }
      }
    }

    // 3. Resolve account details to verify account name (for transaction log description)
    console.log(`🏦 Resolving bank account ${accountNumber} with code ${bankCode}`);
    const resolvedAccount = await PaystackService.resolveAccount(accountNumber, bankCode);
    const accountName = resolvedAccount.account_name;

    // 4. Update user's balance atomically using Optimistic Concurrency Control (OCC)
    const newBalance = 0;
    const newWithdrawal = currentWithdrawal + withdrawAmount;

    const { data: updatedUser, error: userUpdateErr } = await supabaseAdmin
      .from("users")
      .update({
        balance: newBalance,
        withdrawal: newWithdrawal,
      })
      .ilike("email", email)
      .eq("balance", currentBalance) // Ensures no race conditions / double spends occurred
      .select();

    if (userUpdateErr || !updatedUser || updatedUser.length === 0) {
      console.error("❌ Error updating user balance during withdrawal (OCC check failed):", userUpdateErr);
      return NextResponse.json({ error: "Verification failed. Please review your account details or contact support." }, { status: 400 });
    }

    // Invalidate cached profile in Redis
    await invalidateCachedProfile(email);

    // Generate a unique transaction reference
    const reference = `trsf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 5. Log pending withdrawal transaction in payments table
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
        requires_review: false, // Since it's automatically approved for the next batch run
      },
    });

    if (paymentInsertErr) {
      console.error("❌ Error inserting withdrawal payment record:", paymentInsertErr);
    }

    // 6. Create user notification
    await supabaseAdmin.from("notifications").insert({
      user_email: email,
      title: "Withdrawal Queued 🏦",
      message: `Your withdrawal of ₦${withdrawAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} to ${bankName} (${accountNumber}) has been queued and will be processed in the next batch.`,
    });

    return NextResponse.json({
      success: true,
      message: "Withdrawal requested and queued successfully.",
      reference,
      newBalance,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/withdrawals/initiate:", err);
    return NextResponse.json({ error: err.message || "Failed to process withdrawal request" }, { status: 500 });
  }
}
