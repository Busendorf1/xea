import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { processSuccessfulPayment } from "@/lib/payment/processPayment";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import redisConnection from "@/lib/redis";
import { captureApiException } from "@/lib/logger";
import { settleWithdrawalByReference } from "@/lib/services/payoutSettlementService";

export async function POST(req: NextRequest) {
  let lockKey: string | null = null;
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

    // 1. Constant-Time HMAC Signature Verification
    const hash = createHmac("sha512", paystackSecret).update(bodyText).digest("hex");
    const sigBuf = Buffer.from(signature, "utf8");
    const hashBuf = Buffer.from(hash, "utf8");
    if (sigBuf.length !== hashBuf.length || !timingSafeEqual(sigBuf, hashBuf)) {
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
      lockKey = `webhook:lock:${reference}:${event}`;
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

    // 3. Await Deterministic Processing Before Returning 200 OK (Prevents Serverless Freeze Drop)
    await executePaystackWebhook(reference, event, data);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    if (lockKey) {
      await redisConnection.del(lockKey).catch(() => {});
    }
    console.error("❌ Webhook error:", err);
    captureApiException(err, {
      route: "POST /api/payments/webhook",
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function executePaystackWebhook(reference: string, event: string, data: any) {
  if (event === "charge.success") {
    const amount = data.amount / 100; // convert kobo to Naira
    const metadata = data.metadata || {};

    await processSuccessfulPayment(reference, metadata, amount);
    const userEmail = metadata.user_email || metadata.userEmail || metadata.email;
    if (userEmail) {
      await invalidateCachedProfile(userEmail);
    }
  } else if (event === "transfer.success") {
    await settleWithdrawalByReference(reference, "success", "Paystack transfer.success", {
      paystack_data: data,
    });
    console.log(`✅ Webhook: Withdrawal settled successfully for ref=${reference}`);
  } else if (event === "transfer.failed" || event === "transfer.reversed") {
    const outcome = event === "transfer.reversed" ? "reversed" : "failed";
    await settleWithdrawalByReference(
      reference,
      outcome,
      data?.reason || `Paystack ${event}`,
      { paystack_data: data }
    );
    console.log(`⚠️ Webhook: Withdrawal ${outcome} and refunded for ref=${reference}`);
  }
}

