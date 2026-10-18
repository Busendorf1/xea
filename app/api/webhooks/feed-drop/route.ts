import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { verifyAdminUser } from "@/lib/authHelper";
import {
  dispatchFeedDropWebhook,
  getWebhookSecret,
  signWebhookPayload,
} from "@/lib/webhookDispatcher";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/feed-drop
 *
 * Receives real-time ad drop webhooks from:
 * 1. Internal/External HMAC-SHA256 signed webhook dispatches (`X-Xea-Signature-256`)
 * 2. Supabase Database Webhooks on `public.addsactive` (`INSERT` / `UPDATE`) authenticated via `x-webhook-secret`
 * 3. Authenticated Admin triggers
 *
 * Enriches the dropped ad with publisher metadata, caches `ad:detail:{id}`,
 * and broadcasts to scrolling users via `live:feed:new_ad` Redis PubSub.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (!rawBody) {
      return NextResponse.json({ error: "Empty webhook payload" }, { status: 400 });
    }

    const webhookSecret = getWebhookSecret();
    const signatureHeader = req.headers.get("x-xea-signature-256") || "";
    const timestampHeader = req.headers.get("x-xea-timestamp") || "";
    const nonceHeader = req.headers.get("x-xea-nonce") || "";
    const supabaseWebhookSecret = req.headers.get("x-webhook-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";

    let isAuthorized = false;

    // 1. Check HMAC-SHA256 signature (`X-Xea-Signature-256`)
    if (signatureHeader && timestampHeader && nonceHeader && webhookSecret) {
      const ts = parseInt(timestampHeader, 10);
      if (!isNaN(ts) && Math.abs(Date.now() - ts) <= 5 * 60 * 1000) {
        const expectedSig = signWebhookPayload(`${timestampHeader}.${nonceHeader}.${rawBody}`, webhookSecret);
        try {
          if (
            expectedSig.length === signatureHeader.length &&
            crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signatureHeader))
          ) {
            isAuthorized = true;
          }
        } catch {}
      }
    }

    // 2. Check Supabase Database Webhook secret header
    if (!isAuthorized && supabaseWebhookSecret && webhookSecret) {
      try {
        if (
          supabaseWebhookSecret.length === webhookSecret.length &&
          crypto.timingSafeEqual(Buffer.from(supabaseWebhookSecret), Buffer.from(webhookSecret))
        ) {
          isAuthorized = true;
        }
      } catch {}
    }

    // 3. Fallback: check if triggered by an authenticated Admin session
    if (!isAuthorized) {
      const admin = await verifyAdminUser(req).catch(() => null);
      if (admin) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: "Invalid webhook signature or unauthorized" }, { status: 401 });
    }

    // Replay protection on nonce if provided
    if (nonceHeader && isRedisReady()) {
      const nonceKey = `webhook:feed_drop:nonce:${nonceHeader}`;
      const acquired = await redisConnection.set(nonceKey, "1", "EX", 300, "NX").catch(() => "OK");
      if (!acquired) {
        return NextResponse.json({ received: true, duplicate: true });
      }
    }

    const parsed = JSON.parse(rawBody);

    // Support both standard `{ event: "ad.dropped", data: { ad, publisherProfile } }`
    // and Supabase DB Webhook `{ type: "INSERT" | "UPDATE", table: "addsactive", record: {...} }`
    const adRecord = parsed?.data?.ad || parsed?.record || parsed?.ad || null;
    const publisherProfile = parsed?.data?.publisherProfile || parsed?.publisherProfile || null;

    if (!adRecord || !adRecord.id) {
      return NextResponse.json({ error: "Missing ad record in webhook payload" }, { status: 400 });
    }

    if (adRecord.is_paused === true || adRecord.completed_at) {
      return NextResponse.json({ received: true, skipped: "Ad is paused or completed" });
    }

    await dispatchFeedDropWebhook(adRecord, publisherProfile);

    return NextResponse.json({
      received: true,
      event: "ad.dropped",
      adId: adRecord.id,
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/webhooks/feed-drop:", err?.message || err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
