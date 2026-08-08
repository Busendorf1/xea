import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { processSuccessfulPayment } from "@/lib/payment/processPayment";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import redisConnection from "@/lib/redis";

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-paystack-signature");
    const bodyText = await req.text();
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) {
      console.error("❌ Webhook error: PAYSTACK_SECRET_KEY is missing from environment variables!");
      return NextResponse.json({ error: "Webhook configuration error" }, { status: 500 });
    }

    if (!signature) {
      return NextResponse.json({ error: "Missing signature header" }, { status: 401 });
    }

    // 1. HMAC Signature Verification
    const hash = createHmac("sha512", paystackSecret).update(bodyText).digest("hex");
    if (hash !== signature) {
      console.error("❌ Webhook Signature mismatch!");
      return NextResponse.json({ error: "Signature mismatch" }, { status: 401 });
    }

    const payload = JSON.parse(bodyText);
    const event = payload.event;
    const data = payload.data;
    const reference = data?.reference;

    console.log(`📥 Received Paystack Webhook Event: ${event} [${reference}]`);

    // 2. Atomic Exactly-Once Execution Lock (Prevents Replay Attacks & Concurrent Double Refunds)
    if (reference) {
      const lockKey = `webhook:lock:${reference}:${event}`;
      try {
        const acquired = await redisConnection.set(lockKey, "PROCESSED", "EX", 86400, "NX");
        if (!acquired) {
          console.warn(`⚠️ Duplicate Webhook Event ignored (Idempotent Lock): ${event} [${reference}]`);
          return NextResponse.json({ message: "Event already processed" }, { status: 200 });
        }
      } catch (redisErr) {
        console.warn("⚠️ Webhook Redis lock error:", redisErr);
      }
    }

    // 3. Process Specific Events
    if (event === "charge.success") {
      const amount = data.amount / 100; // convert kobo to Naira
      const metadata = data.metadata || {};

      try {
        await processSuccessfulPayment(reference, metadata, amount);
        const userEmail = metadata.user_email || metadata.userEmail || metadata.email;
        if (userEmail) {
          await invalidateCachedProfile(userEmail);
        }
      } catch (procErr: any) {
        console.error("❌ Error processing webhook charge.success:", procErr);
      }
    } else if (event === "transfer.success") {
      const amount = data.amount / 100; // in Naira

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

        const { data: user, error: userFetchErr } = await supabaseAdmin
          .from("users")
          .select("withdrawal")
          .eq("email", userEmail.toLowerCase().trim())
          .maybeSingle();

        if (!userFetchErr && user) {
          const currentWithdrawal = parseFloat(user.withdrawal || 0);
          const newWithdrawal = Math.max(0, currentWithdrawal - amount);

          await supabaseAdmin
            .from("users")
            .update({ withdrawal: newWithdrawal })
            .eq("email", userEmail.toLowerCase().trim());

          await invalidateCachedProfile(userEmail);
        }

        await supabaseAdmin
          .from("payments")
          .update({ status: "success" })
          .eq("reference", reference);

        await supabaseAdmin.from("notifications").insert({
          user_email: userEmail,
          title: "Withdrawal Completed Successfully",
          message: `Your withdrawal of ₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been processed and sent to your bank account.`,
        });

        console.log(`✅ Webhook: Withdrawal successful for ${userEmail}`);
      }
    } else if (event === "transfer.failed" || event === "transfer.reversed") {
      const amount = data.amount / 100; // in Naira

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

        const { data: user, error: userFetchErr } = await supabaseAdmin
          .from("users")
          .select("balance, withdrawal")
          .eq("email", userEmail.toLowerCase().trim())
          .maybeSingle();

        if (!userFetchErr && user) {
          const currentBalance = parseFloat(user.balance || 0);
          const currentWithdrawal = parseFloat(user.withdrawal || 0);

          const newBalance = currentBalance + amount;
          const newWithdrawal = Math.max(0, currentWithdrawal - amount);

          await supabaseAdmin
            .from("users")
            .update({ balance: newBalance, withdrawal: newWithdrawal })
            .eq("email", userEmail.toLowerCase().trim());

          await invalidateCachedProfile(userEmail);
        }

        await supabaseAdmin
          .from("payments")
          .update({ status: event === "transfer.reversed" ? "reversed" : "failed" })
          .eq("reference", reference);

        await supabaseAdmin.from("notifications").insert({
          user_email: userEmail,
          title: `Withdrawal ${event === "transfer.reversed" ? "Reversed" : "Failed"}`,
          message: `Your withdrawal of ₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} failed. The funds have been refunded to your wallet balance.`,
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
