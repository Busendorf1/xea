// app/api/payments/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { processSuccessfulPayment } from "@/lib/payment/processPayment";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-paystack-signature");
    const bodyText = await req.text();
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY || "sk_test_mock_1234567890abcdef";

    // 1. Verify Signature (only check if NOT mock key)
    if (!paystackSecret.startsWith("sk_test_mock")) {
      if (!signature) {
        return NextResponse.json({ error: "Missing signature header" }, { status: 401 });
      }
      const hash = createHmac("sha512", paystackSecret).update(bodyText).digest("hex");
      if (hash !== signature) {
        console.error("❌ Webhook Signature mismatch!");
        return NextResponse.json({ error: "Signature mismatch" }, { status: 401 });
      }
    }

    const payload = JSON.parse(bodyText);
    const event = payload.event;
    const data = payload.data;

    console.log(`📥 Received Paystack Webhook Event: ${event}`);

    // 2. Handle specific Paystack Webhook events
    if (event === "charge.success") {
      const reference = data.reference;
      const amount = data.amount / 100; // convert kobo to Naira
      const metadata = data.metadata || {};

      try {
        await processSuccessfulPayment(reference, metadata, amount);
      } catch (procErr: any) {
        console.error("❌ Error processing webhook charge.success:", procErr);
        // Return 200 so Paystack doesn't keep retrying, but we log the error
      }
    } else if (event === "transfer.success") {
      const reference = data.reference;
      const amount = data.amount / 100; // in Naira

      // Fetch payment record
      const { data: payment, error: fetchErr } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("reference", reference)
        .eq("type", "withdrawal")
        .maybeSingle();

      if (fetchErr) {
        console.error("❌ Error fetching withdrawal payment on success webhook:", fetchErr);
      } else if (payment) {
        const userEmail = payment.user_email;

        // Fetch user current withdrawal balance
        const { data: user, error: userFetchErr } = await supabaseAdmin
          .from("users")
          .select("withdrawal")
          .ilike("email", userEmail)
          .maybeSingle();

        if (!userFetchErr && user) {
          const currentWithdrawal = parseFloat(user.withdrawal || 0);
          const newWithdrawal = Math.max(0, currentWithdrawal - amount);

          // Update user withdrawal balance
          await supabaseAdmin
            .from("users")
            .update({ withdrawal: newWithdrawal })
            .ilike("email", userEmail);
        }

        // Update payment status
        await supabaseAdmin
          .from("payments")
          .update({ status: "success" })
          .eq("reference", reference);

        // Add user notification
        await supabaseAdmin.from("notifications").insert({
          user_email: userEmail,
          title: "Withdrawal Completed Successfully 🏦",
          message: `Your withdrawal of ₦${amount.toFixed(2)} has been processed and sent to your bank account.`,
        });

        console.log(`✅ Webhook: Withdrawal successful for ${userEmail}`);
      }
    } else if (event === "transfer.failed" || event === "transfer.reversed") {
      const reference = data.reference;
      const amount = data.amount / 100; // in Naira

      // Fetch payment record
      const { data: payment, error: fetchErr } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("reference", reference)
        .eq("type", "withdrawal")
        .maybeSingle();

      if (fetchErr) {
        console.error("❌ Error fetching withdrawal payment on fail webhook:", fetchErr);
      } else if (payment && payment.status !== "failed" && payment.status !== "reversed") {
        const userEmail = payment.user_email;

        // Fetch user current balances
        const { data: user, error: userFetchErr } = await supabaseAdmin
          .from("users")
          .select("balance, withdrawal")
          .ilike("email", userEmail)
          .maybeSingle();

        if (!userFetchErr && user) {
          const currentBalance = parseFloat(user.balance || 0);
          const currentWithdrawal = parseFloat(user.withdrawal || 0);

          const newBalance = currentBalance + amount; // refund
          const newWithdrawal = Math.max(0, currentWithdrawal - amount);

          // Update user balances (refund)
          await supabaseAdmin
            .from("users")
            .update({ balance: newBalance, withdrawal: newWithdrawal })
            .ilike("email", userEmail);
        }

        // Update payment status to failed or reversed
        await supabaseAdmin
          .from("payments")
          .update({ status: event === "transfer.reversed" ? "reversed" : "failed" })
          .eq("reference", reference);

        // Add user notification
        await supabaseAdmin.from("notifications").insert({
          user_email: userEmail,
          title: `Withdrawal ${event === "transfer.reversed" ? "Reversed" : "Failed"} ⚠️`,
          message: `Your withdrawal of ₦${amount.toFixed(2)} failed. The funds have been refunded to your wallet balance.`,
        });

        console.log(`⚠️ Webhook: Withdrawal failed/reversed and refunded for ${userEmail}`);
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("❌ Webhook error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
