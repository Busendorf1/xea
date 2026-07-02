import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { PaystackService } from "@/lib/payment/paystack";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { createHash } from "crypto";

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

    // Rule C: Phone matching user profile (Secure Obfuscation on Failure)
    if (!user.phone || user.phone.trim() !== phone.trim()) {
      console.warn(`❌ Security Block: Phone mismatch. Input: "${phone}", Profile: "${user.phone}"`);
      return NextResponse.json({ error: "Verification failed. Please review your account details or contact support." }, { status: 400 });
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

    // Rule E: BVN verification (first time only)
    if (!user.bvn_hash) {
      if (!bvn) {
        return NextResponse.json({ error: "Identity verification required. Please provide your BVN." }, { status: 400 });
      }

      if (!/^\d{11}$/.test(bvn)) {
        console.warn(`❌ Security Block: Invalid BVN format (must be 11 digits)`);
        return NextResponse.json({ error: "Verification failed. Please review your account details or contact support." }, { status: 400 });
      }

      try {
        // Resolve names and mobile on Paystack
        console.log(`🏦 Resolving BVN ${bvn.slice(0, 4)}******* via Paystack`);
        await PaystackService.resolveBVN(bvn);

        // Check if bank account belongs to BVN holder
        console.log(`🏦 Verifying if bank account ${accountNumber} matches BVN`);
        const isBvnMatch = await PaystackService.matchBVN(accountNumber, bankCode, bvn);
        if (!isBvnMatch) {
          console.warn(`❌ Security Block: Bank account does not match the BVN owner.`);
          return NextResponse.json({ error: "Verification failed. Please review your account details or contact support." }, { status: 400 });
        }

        // Hash BVN
        const bvnHash = createHash("sha256").update(bvn).digest("hex");

        // Verify BVN uniqueness across database
        const { data: duplicateBvnUser } = await supabaseAdmin
          .from("users")
          .select("email")
          .eq("bvn_hash", bvnHash)
          .maybeSingle();

        if (duplicateBvnUser) {
          console.warn(`❌ Security Block: BVN already registered by user: ${duplicateBvnUser.email}`);
          return NextResponse.json({ error: "Verification failed. Please review your account details or contact support." }, { status: 400 });
        }

        // Update user profile with the hashed BVN
        const { error: bvnUpdateErr } = await supabaseAdmin
          .from("users")
          .update({ bvn_hash: bvnHash })
          .ilike("email", email);

        if (bvnUpdateErr) {
          console.error("❌ Database error saving BVN hash:", bvnUpdateErr);
          return NextResponse.json({ error: "Verification failed. Please review your account details or contact support." }, { status: 500 });
        }

        console.log(`✅ Security: BVN successfully verified and linked to ${email}`);
      } catch (bvnErr: any) {
        console.error("❌ Security Block: Paystack BVN verification exception:", bvnErr);
        return NextResponse.json({ error: "Verification failed. Please review your account details or contact support." }, { status: 400 });
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
