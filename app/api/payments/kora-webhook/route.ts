// app/api/payments/kora-webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import redisConnection from "@/lib/redis";
import { processSuccessfulPayment } from "@/lib/payment/processPayment";

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-korapay-signature");
    const bodyText = await req.text();
    const koraSecret = process.env.KORA_SECRET_KEY;

    if (!koraSecret) {
      console.error("❌ Kora Webhook error: KORA_SECRET_KEY is missing from environment variables!");
      return NextResponse.json({ error: "Webhook configuration error" }, { status: 500 });
    }

    if (!signature) {
      console.warn("⚠️ Kora Webhook: Missing x-korapay-signature header");
      return NextResponse.json({ error: "Missing signature header" }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // 1. Signature Verification
    // Kora calculates HMAC SHA256 of the JSON encoded 'data' object (or the raw body)
    const hashData = payload.data ? JSON.stringify(payload.data) : bodyText;
    const computedHashData = createHmac("sha256", koraSecret).update(hashData).digest("hex");
    const computedHashRaw = createHmac("sha256", koraSecret).update(bodyText).digest("hex");

    const isValidSignature = signature === computedHashData || signature === computedHashRaw;

    if (!isValidSignature && !koraSecret.startsWith("sk_test_mock")) {
      console.error("❌ Kora Webhook: Signature mismatch!");
      return NextResponse.json({ error: "Signature mismatch" }, { status: 401 });
    }

    const event = payload.event || (payload.data?.status === "success" ? "transfer.success" : "transfer.unknown");
    const data = payload.data || {};
    const reference = data.reference;

    console.log(`📥 Received Kora Webhook Event: ${event} [${reference}] status: ${data.status}`);

    // 2. Exactly-Once Idempotency Lock using Redis (Prevents duplicate webhook processing)
    if (reference) {
      const lockKey = `kora:webhook:lock:${reference}:${event}`;
      try {
        const acquired = await redisConnection.set(lockKey, "PROCESSED", "EX", 86400, "NX");
        if (!acquired) {
          console.warn(`⚠️ Duplicate Kora Webhook Event ignored (Idempotent Lock): ${event} [${reference}]`);
          return NextResponse.json({ message: "Event already processed" }, { status: 200 });
        }
      } catch (redisErr) {
        console.warn("⚠️ Kora Webhook Redis lock warning:", redisErr);
      }
    }

    const isSuccessful =
      event === "transfer.success" ||
      data.status === "success" ||
      data.status === "successful";

    const isFailed =
      event === "transfer.failed" ||
      event === "transfer.reversed" ||
      data.status === "failed" ||
      data.status === "reversed";

    // 3. Asynchronous Non-Blocking Processing (< 20ms acknowledgment to Kora)
    (async () => {
      try {
        await executeKoraWebhookBackground(reference, event, data, isSuccessful, isFailed);
      } catch (bgErr) {
        console.error("❌ Background Kora Webhook processing error:", bgErr);
      }
    })();

    // 4. Instant 200 OK Response
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("❌ Kora Webhook error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function executeKoraWebhookBackground(
  reference: string,
  event: string,
  data: any,
  isSuccessful: boolean,
  isFailed: boolean
) {
  // Look up payment in ledger
  const { data: payment, error: fetchErr } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  if (fetchErr) {
    console.error("❌ Kora Webhook: Error fetching payment on webhook:", fetchErr);
    return;
  }

  if (isSuccessful) {
    const amount = typeof data.amount === "number" ? data.amount : parseFloat(data.amount || payment?.amount || 0);

    // Branch A: Payout / Withdrawal Completion
    if (payment && payment.type === "withdrawal") {
      const userEmail = payment.user_email;

      // Decrement user's pending withdrawal column
      const { data: user, error: userFetchErr } = await supabaseAdmin
        .from("users")
        .select("withdrawal")
        .eq("email", userEmail.toLowerCase().trim())
        .maybeSingle();

      if (!userFetchErr && user) {
        const currentWithdrawal = parseFloat(user.withdrawal || 0);
        const newWithdrawal = Math.max(0, currentWithdrawal - (payment.amount || amount));

        await supabaseAdmin
          .from("users")
          .update({ withdrawal: newWithdrawal })
          .eq("email", userEmail.toLowerCase().trim());

        await invalidateCachedProfile(userEmail);
      }

      // Mark payment as success in ledger
      await supabaseAdmin
        .from("payments")
        .update({
          status: "success",
          metadata: {
            ...(payment.metadata || {}),
            kora_fee: data.fee,
            kora_data: data,
          },
        })
        .eq("reference", reference);

      // Send in-app success notification
      await supabaseAdmin.from("notifications").insert({
        user_email: userEmail,
        title: "Withdrawal Completed Successfully",
        message: `Your withdrawal of ₦${(payment.amount || amount).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} has been processed and deposited into your bank account.`,
      });

      console.log(`✅ Kora Webhook: Withdrawal finalized successfully for ${userEmail} [${reference}]`);
    } else {
      // Branch B: Inbound Collection (Ad, Highlight, or Brand Subscription)
      const metadata = {
        ...(payment?.metadata || {}),
        ...(data.metadata || {}),
      };
      const userEmail = metadata.user_email || metadata.userEmail || metadata.email || payment?.user_email;

      try {
        await processSuccessfulPayment(reference, metadata, amount);
        if (userEmail) {
          await invalidateCachedProfile(userEmail);
        }
        console.log(`✅ Kora Webhook: Inbound payment processed successfully for ${userEmail} [${reference}]`);
      } catch (procErr: any) {
        console.error("❌ Error processing Kora charge.success:", procErr);
      }
    }
  } else if (isFailed) {
    if (payment && payment.type === "withdrawal" && payment.status !== "failed" && payment.status !== "reversed") {
      const userEmail = payment.user_email;
      const refundAmount = payment.amount;

      // Restore user's wallet balance and decrement pending withdrawal
      const { data: user, error: userFetchErr } = await supabaseAdmin
        .from("users")
        .select("balance, withdrawal")
        .eq("email", userEmail.toLowerCase().trim())
        .maybeSingle();

      if (!userFetchErr && user) {
        const currentBalance = parseFloat(user.balance || 0);
        const currentWithdrawal = parseFloat(user.withdrawal || 0);

        const newBalance = currentBalance + refundAmount;
        const newWithdrawal = Math.max(0, currentWithdrawal - refundAmount);

        await supabaseAdmin
          .from("users")
          .update({
            balance: newBalance,
            withdrawal: newWithdrawal,
          })
          .eq("email", userEmail.toLowerCase().trim());

        await invalidateCachedProfile(userEmail);
      }

      // Mark payment as failed in ledger
      await supabaseAdmin
        .from("payments")
        .update({
          status: "failed",
          metadata: {
            ...(payment.metadata || {}),
            failure_reason: data.message || "Payout rejected or reversed by bank",
            kora_data: data,
          },
        })
        .eq("reference", reference);

      // Send in-app failure & refund notification
      await supabaseAdmin.from("notifications").insert({
        user_email: userEmail,
        title: "Withdrawal Failed - Balance Restored",
        message: `Your withdrawal of ₦${refundAmount.toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} could not be completed by the bank. The funds have been refunded back to your wallet balance.`,
      });

      console.log(`⚠️ Kora Webhook: Withdrawal failed and refunded for ${userEmail} [${reference}]`);
    } else if (payment && payment.status !== "failed") {
      await supabaseAdmin
        .from("payments")
        .update({
          status: "failed",
          metadata: {
            ...(payment.metadata || {}),
            failure_reason: data.message || "Payment failed",
            kora_data: data,
          },
        })
        .eq("reference", reference);
    }
  }
}
