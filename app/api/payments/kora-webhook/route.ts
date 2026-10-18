// app/api/payments/kora-webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import redisConnection from "@/lib/redis";
import { processSuccessfulPayment } from "@/lib/payment/processPayment";
import { captureApiException } from "@/lib/logger";
import { settleWithdrawalByReference } from "@/lib/services/payoutSettlementService";

function safeCompareHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  let lockKey: string | null = null;
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

    // 1. Constant-Time Signature Verification
    const hashData = payload.data ? JSON.stringify(payload.data) : bodyText;
    const computedHashData = createHmac("sha256", koraSecret).update(hashData).digest("hex");
    const computedHashRaw = createHmac("sha256", koraSecret).update(bodyText).digest("hex");

    const isValidSignature =
      safeCompareHex(signature, computedHashData) ||
      safeCompareHex(signature, computedHashRaw);

    const allowMockBypass =
      process.env.NODE_ENV !== "production" && koraSecret.startsWith("sk_test_mock");

    if (!isValidSignature && !allowMockBypass) {
      console.error("❌ Kora Webhook: Signature mismatch!");
      return NextResponse.json({ error: "Signature mismatch" }, { status: 401 });
    }

    const event = payload.event || (payload.data?.status === "success" ? "transfer.success" : "transfer.unknown");
    const data = payload.data || {};
    const reference = data.reference;

    console.log(`📥 Received Kora Webhook Event: ${event} [${reference}] status: ${data.status}`);

    // 2. Exactly-Once Idempotency Lock using Redis (Prevents duplicate webhook processing)
    if (reference) {
      lockKey = `kora:webhook:lock:${reference}:${event}`;
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

    // 3. Await Deterministic Processing Before Returning 200 OK
    await executeKoraWebhook(reference, event, data, isSuccessful, isFailed);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    if (lockKey) {
      await redisConnection.del(lockKey).catch(() => {});
    }
    console.error("❌ Kora Webhook error:", err);
    captureApiException(err, {
      route: "POST /api/payments/kora-webhook",
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function executeKoraWebhook(
  reference: string,
  event: string,
  data: any,
  isSuccessful: boolean,
  isFailed: boolean
) {
  const { data: payment, error: fetchErr } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  if (fetchErr) {
    throw new Error(`Kora Webhook: Failed to fetch payment record: ${fetchErr.message}`);
  }

  if (isSuccessful) {
    const amount = typeof data.amount === "number" ? data.amount : parseFloat(data.amount || payment?.amount || 0);

    // Branch A: Payout / Withdrawal Completion
    if (payment && payment.type === "withdrawal") {
      await settleWithdrawalByReference(reference, "success", "Kora transfer.success", {
        kora_fee: data.fee,
        kora_data: data,
      });
      console.log(`✅ Kora Webhook: Withdrawal finalized successfully for ${payment.user_email} [${reference}]`);
    } else {
      // Branch B: Inbound Collection (Ad, Highlight, Boost, Monetization, or Brand Subscription)
      const metadata = {
        ...(payment?.metadata || {}),
        ...(data.metadata || {}),
      };
      const userEmail = metadata.user_email || metadata.userEmail || metadata.email || payment?.user_email;

      await processSuccessfulPayment(reference, metadata, amount);
      if (userEmail) {
        await invalidateCachedProfile(userEmail);
      }
      console.log(`✅ Kora Webhook: Inbound payment processed successfully for ${userEmail} [${reference}]`);
    }
  } else if (isFailed) {
    if (payment && payment.type === "withdrawal") {
      const outcome = event === "transfer.reversed" || data.status === "reversed" ? "reversed" : "failed";
      await settleWithdrawalByReference(
        reference,
        outcome,
        data.message || "Payout rejected or reversed by bank",
        { kora_data: data }
      );
      console.log(`⚠️ Kora Webhook: Withdrawal ${outcome} and refunded for ${payment.user_email} [${reference}]`);
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
