// app/api/withdrawals/initiate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { PaystackService } from "@/lib/payment/paystack";
import supabaseAdmin from "@/lib/utils/dbAdmin";

const MIN_WITHDRAWAL_THRESHOLD = 30000; // 30,000 NGN

export async function POST(req: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = session.user.email?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "No email associated with session" }, { status: 400 });
    }

    const body = await req.json();
    const { bankCode, bankName, accountNumber, amount } = body;

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal amount" }, { status: 400 });
    }

    if (!bankCode || !bankName || !accountNumber) {
      return NextResponse.json({ error: "bankCode, bankName, and accountNumber are required" }, { status: 400 });
    }

    // 1. Fetch user's current balance
    const { data: user, error: userFetchErr } = await supabaseAdmin
      .from("users")
      .select("balance, withdrawal")
      .ilike("email", email)
      .maybeSingle();

    if (userFetchErr || !user) {
      console.error("❌ Error fetching user for withdrawal:", userFetchErr);
      return NextResponse.json({ error: "Failed to verify account balance" }, { status: 500 });
    }

    const currentBalance = parseFloat(user.balance || 0);
    const currentWithdrawal = parseFloat(user.withdrawal || 0);

    // 2. Validate against withdrawal rules
    if (currentBalance < MIN_WITHDRAWAL_THRESHOLD) {
      return NextResponse.json({
        error: `Insufficient balance. Minimum threshold for withdrawal is ₦${MIN_WITHDRAWAL_THRESHOLD.toLocaleString()}.`,
      }, { status: 400 });
    }

    if (withdrawAmount > currentBalance) {
      return NextResponse.json({ error: "Cannot withdraw more than your current wallet balance" }, { status: 400 });
    }

    // 3. Resolve account details to verify account name
    console.log(`🏦 Resolving bank account ${accountNumber} with code ${bankCode}`);
    const resolvedAccount = await PaystackService.resolveAccount(accountNumber, bankCode);
    const accountName = resolvedAccount.account_name;

    // 4. Register recipient on Paystack
    console.log(`🏦 Creating Paystack transfer recipient for ${accountName}`);
    const recipientCode = await PaystackService.createTransferRecipient(accountName, accountNumber, bankCode);

    // 5. Generate reference and initiate transfer
    const reference = `trsf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`🏦 Initiating transfer reference ${reference} for ₦${withdrawAmount}`);
    
    const transferResult = await PaystackService.initiateTransfer(
      recipientCode,
      withdrawAmount,
      `Xea Wallet Withdrawal: ₦${withdrawAmount}`,
      reference
    );

    // 6. Update user's balance and pending withdrawal field (Service role bypasses RLS/Triggers)
    const newBalance = currentBalance - withdrawAmount;
    const newWithdrawal = currentWithdrawal + withdrawAmount; // Mark as pending processing

    const { error: userUpdateErr } = await supabaseAdmin
      .from("users")
      .update({
        balance: newBalance,
        withdrawal: newWithdrawal,
      })
      .ilike("email", email);

    if (userUpdateErr) {
      console.error("❌ Error updating user balance during withdrawal:", userUpdateErr);
      // Even if database update fails, Paystack transfer was initiated. We log it but proceed to log the payment.
    }

    // 7. Log pending withdrawal transaction in payments table
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
        recipientCode,
        transfer_code: transferResult.transfer_code,
      },
    });

    if (paymentInsertErr) {
      console.error("❌ Error inserting withdrawal payment record:", paymentInsertErr);
    }

    // 8. Create user notification
    await supabaseAdmin.from("notifications").insert({
      user_email: email,
      title: "Withdrawal Initiated 🏦",
      message: `Your withdrawal request of ₦${withdrawAmount.toFixed(2)} to ${bankName} (${accountNumber}) has been initiated and is processing.`,
    });

    return NextResponse.json({
      success: true,
      message: "Withdrawal initiated successfully",
      reference,
      newBalance,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/withdrawals/initiate:", err);
    return NextResponse.json({ error: err.message || "Failed to process withdrawal request" }, { status: 500 });
  }
}
