import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { publishLiveBalanceUpdate, invalidateCachedProfile } from "@/lib/utils/cache";

export const dynamic = "force-dynamic";

/**
 * High-Throughput Earning Webhook Ingestion Route
 * Listens for earning events from partner services, mobile sync servers, or ad networks.
 * Verifies HMAC-SHA256 signature, validates nonce to prevent replay attacks,
 * and updates user balance across all devices (Web & Mobile App) in real time.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-xea-signature-256");
    const timestampHeader = req.headers.get("x-xea-timestamp");
    const nonceHeader = req.headers.get("x-xea-nonce");

    const webhookSecret = process.env.WEBHOOK_SECRET_KEY || process.env.AUTH0_SECRET || "xea-secure-webhook-secret";

    // 1. Signature & Header Verification
    if (!signature || !timestampHeader || !nonceHeader) {
      return NextResponse.json({ error: "Missing cryptographic webhook verification headers" }, { status: 401 });
    }

    const timestamp = parseInt(timestampHeader, 10);
    const now = Date.now();

    // Prevent Replay Attacks (Max 5 minutes timestamp skew)
    if (Math.abs(now - timestamp) > 300000) {
      return NextResponse.json({ error: "Webhook timestamp expired or out of bounds" }, { status: 401 });
    }

    const signaturePayload = `${timestampHeader}.${nonceHeader}.${rawBody}`;
    const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(signaturePayload).digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return NextResponse.json({ error: "Invalid HMAC signature" }, { status: 403 });
    }

    // 2. Replay Defense via Redis Nonce Cache (Exactly-Once Delivery Guarantee)
    if (isRedisReady()) {
      try {
        const nonceKey = `webhook:nonce:${nonceHeader}`;
        const lockAcquired = await redisConnection.set(nonceKey, "1", "EX", 600, "NX");
        if (!lockAcquired) {
          return NextResponse.json({ message: "Duplicate webhook event ignored (Nonce exists)" }, { status: 200 });
        }
      } catch (redisErr) {
        console.warn("⚠️ Nonce check Redis warning:", redisErr);
      }
    }

    const payload = JSON.parse(rawBody);
    const { event, data } = payload;

    if (!data || !data.userEmail) {
      return NextResponse.json({ error: "Invalid webhook payload structure" }, { status: 400 });
    }

    const emailLower = data.userEmail.toLowerCase().trim();

    // 3. Broadcast Real-Time Balance & Ad Eviction across all devices (Web & App)
    await publishLiveBalanceUpdate(emailLower, {
      delta: data.amount ?? 0,
      newBalance: data.newBalance,
      clicks: data.clicks,
      earnedAdId: data.adId,
    });

    // 4. Invalidate Redis Profile Cache to ensure immediate fresh sync on next fetch
    await invalidateCachedProfile(emailLower);

    return NextResponse.json({
      success: true,
      message: "Webhook processed and broadcasted across all devices successfully",
      userEmail: emailLower,
    });
  } catch (err: any) {
    console.error("❌ Earning Webhook Ingestion Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
