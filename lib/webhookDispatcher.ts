import crypto from "crypto";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";

export interface EarningWebhookPayload {
  event: "ad.earned" | "balance.updated" | "monetization.achieved";
  timestamp: number;
  data: {
    userEmail: string;
    adId: string;
    amount: number;
    newBalance: number;
    clicks: number;
    monetized: boolean;
    deviceId?: string | null;
  };
}

export interface FeedDropWebhookPayload {
  event: "ad.dropped";
  timestamp: number;
  data: {
    ad: Record<string, any>;
    publisherProfile?: Record<string, any> | null;
  };
}

export const LIVE_FEED_DROP_CHANNEL = "live:feed:new_ad";

/**
 * Signs an outgoing webhook payload using HMAC-SHA256.
 */
export function signWebhookPayload(payloadString: string, secretKey: string): string {
  return crypto.createHmac("sha256", secretKey).update(payloadString).digest("hex");
}

/**
 * Resolves the webhook signing secret.
 */
export function getWebhookSecret(): string {
  return (
    process.env.WEBHOOK_SECRET_KEY ||
    process.env.AUTH0_SECRET ||
    (process.env.NODE_ENV === "production" ? "" : "xea-secure-webhook-secret")
  );
}

/**
 * Dispatches an asynchronous earning event webhook to external platforms,
 * mobile push notification relays, and partner integrations.
 * Executes non-blockingly (fire-and-forget with background error trapping).
 */
export async function dispatchEarningWebhook(payload: EarningWebhookPayload): Promise<void> {
  const webhookUrl = process.env.EARNING_WEBHOOK_URL || process.env.NEXT_PUBLIC_WEBHOOK_URL;
  const webhookSecret = getWebhookSecret();

  if (!webhookUrl || !webhookSecret) {
    return;
  }

  const payloadString = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const signaturePayload = `${timestamp}.${nonce}.${payloadString}`;
  const signature = signWebhookPayload(signaturePayload, webhookSecret);

  (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Xea-Signature-256": signature,
          "X-Xea-Timestamp": timestamp,
          "X-Xea-Nonce": nonce,
          "User-Agent": "Xea-Earning-Engine/2.0 (Google-Performance-Standard)",
        },
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`⚠️ Earning Webhook delivery returned status ${response.status} for user: ${payload.data.userEmail}`);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.warn("⚠️ Earning Webhook dispatch warning:", err.message || err);
      }
    }
  })();
}

/**
 * Enriches a newly activated ad with its publisher profile, caches it in Redis,
 * broadcasts it to the multiplexed live feed Redis PubSub channel (`live:feed:new_ad`),
 * and dispatches an outgoing signed webhook (`ad.dropped`) if configured.
 */
export async function dispatchFeedDropWebhook(
  ad: Record<string, any>,
  providedProfile?: Record<string, any> | null
): Promise<void> {
  if (!ad || !ad.id) return;

  try {
    let publisherProfile = providedProfile || null;
    const ownerEmail = String(ad.user_email || ad.email || "").toLowerCase().trim();

    if (!publisherProfile && ownerEmail) {
      try {
        const { data: p } = await supabaseReadOnly
          .from("users")
          .select('email, username, business_name, "firstName", "lastName", "profileImage", gender, bio, location, country, created_at, monetized')
          .ilike("email", ownerEmail)
          .maybeSingle();

        if (p && p.email) {
          publisherProfile = {
            email: p.email,
            username: p.username || "",
            business_name: p.business_name || "",
            firstName: p.firstName || "",
            lastName: p.lastName || "",
            profileImage: p.profileImage || "",
            gender: p.gender || "",
            bio: p.bio || "",
            location: p.location || "",
            country: p.country || "",
            created_at: p.created_at || "",
            monetized: p.monetized === true || p.monetized === "true" || p.monetized === "yes",
          };
        }
      } catch {}
    }

    const webhookPayload: FeedDropWebhookPayload = {
      event: "ad.dropped",
      timestamp: Date.now(),
      data: {
        ad,
        publisherProfile,
      },
    };

    const payloadString = JSON.stringify(webhookPayload);

    // 1. Cache ad detail & broadcast on Redis PubSub for connected SSE feed streams
    if (isRedisReady()) {
      const pipe = redisConnection.pipeline();
      pipe.set(`ad:detail:${ad.id}`, JSON.stringify(ad), "EX", 1800);
      pipe.publish(LIVE_FEED_DROP_CHANNEL, payloadString);
      await pipe.exec().catch(() => {});
    }

    // 2. Dispatch external / configured HTTP webhook non-blockingly
    const webhookUrl =
      process.env.FEED_DROP_WEBHOOK_URL ||
      process.env.EARNING_WEBHOOK_URL ||
      process.env.NEXT_PUBLIC_WEBHOOK_URL;
    const webhookSecret = getWebhookSecret();

    if (webhookUrl && webhookSecret) {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const signaturePayload = `${timestamp}.${nonce}.${payloadString}`;
      const signature = signWebhookPayload(signaturePayload, webhookSecret);

      (async () => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);
          await fetch(webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Xea-Signature-256": signature,
              "X-Xea-Timestamp": timestamp,
              "X-Xea-Nonce": nonce,
              "User-Agent": "Xea-FeedDrop-Webhook/2.0",
            },
            body: payloadString,
            signal: controller.signal,
          });
          clearTimeout(timeout);
        } catch {}
      })();
    }
  } catch (err: any) {
    console.warn("⚠️ dispatchFeedDropWebhook warning:", err?.message || err);
  }
}
