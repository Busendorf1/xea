import crypto from "crypto";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";

export interface EarningWebhookPayload {
  event: "ad.earned" | "balance.updated" | "monetization.achieved" | "ad.seen" | "ad.mutual_added";
  timestamp: number;
  data: {
    userEmail: string;
    adId: string;
    amount: number;
    newBalance: number;
    clicks: number;
    monetized: boolean;
    atwTier?: string;
    impressionCount?: number;
    mutualAdded?: string | null;
    mutualCount?: number;
    deviceId?: string | null;
  };
}

export interface ImpressionWebhookPayload {
  event: "ad.seen" | "monetization.updated" | "campaign.impression";
  timestamp: number;
  data: {
    userEmail: string;
    adId: string;
    clicksCount: number;
    isMonetized: boolean;
    impressionCount?: number;
    atwTier?: string;
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
export const LIVE_NOTIFICATION_CHANNEL = "live:notifications";

export interface NotificationWebhookPayload {
  event: "notification.created";
  timestamp: number;
  data: {
    id?: string;
    user_email: string;
    title: string;
    message: string;
    created_at: string;
  };
}

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
 * Dispatches an asynchronous earning / mutual / seen event webhook to external platforms,
 * Redis PubSub channels, and Supabase Realtime broadcast channels for 0ms client sync.
 * Executes non-blockingly (fire-and-forget with background error trapping).
 */
export async function dispatchEarningWebhook(payload: EarningWebhookPayload): Promise<void> {
  const emailKey = String(payload.data?.userEmail || "").toLowerCase().trim();
  const payloadString = JSON.stringify(payload);

  // 1. Invalidate L2 monetization cache & publish on Redis PubSub
  try {
    if (emailKey && isRedisReady()) {
      const pipe = redisConnection.pipeline();
      pipe.del(`monetize:status:${emailKey}`);
      if (typeof payload.data.clicks === "number" && payload.data.clicks > 0) {
        pipe.set(`user:live_clicks:${emailKey}`, String(payload.data.clicks), "EX", 3600);
      }
      pipe.publish(`live:monetization:${emailKey}`, payloadString);
      await pipe.exec().catch(() => {});
    }
  } catch {}

  // 2. Push zero-latency Supabase Realtime webhook broadcast to connected mobile/web clients
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && serviceKey && emailKey) {
    const userTopic = `realtime:user:${emailKey.replace(/[^a-zA-Z0-9]/g, "_")}`;
    (async () => {
      try {
        const messages: any[] = [
          {
            topic: userTopic,
            event: "monetization_updated",
            payload: {
              userEmail: emailKey,
              adId: payload.data.adId,
              clicksCount: payload.data.clicks,
              isMonetized: payload.data.monetized,
              newBalance: payload.data.newBalance,
              earnedAmount: payload.data.amount,
              impressionCount: payload.data.impressionCount,
              mutualAdded: payload.data.mutualAdded || null,
              mutualCount: payload.data.mutualCount,
              timestamp: payload.timestamp,
            },
          },
        ];
        if (payload.data.adId) {
          messages.push({
            topic: "campaigns_realtime",
            event: "campaign_impression",
            payload: {
              adId: payload.data.adId,
              impressionCount: payload.data.impressionCount,
              timestamp: payload.timestamp,
            },
          });
        }
        await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ messages }),
        });
      } catch {}
    })();
  }

  // 3. Signed HTTP Webhook delivery (if external URL configured)
  const webhookUrl = process.env.EARNING_WEBHOOK_URL || process.env.NEXT_PUBLIC_WEBHOOK_URL;
  const webhookSecret = getWebhookSecret();

  if (!webhookUrl || !webhookSecret) {
    return;
  }

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
 * Dispatches an ultra-fast (<5ms non-blocking) webhook & Realtime broadcast whenever
 * a user clicks "Seen" on an ad so Monetization Hub, Ad Manager, Web, and Mobile
 * reflect the exact incremented counter in real time.
 */
export async function dispatchImpressionWebhook(payload: ImpressionWebhookPayload): Promise<void> {
  const emailKey = String(payload.data?.userEmail || "").toLowerCase().trim();
  const payloadString = JSON.stringify(payload);

  try {
    if (emailKey && isRedisReady()) {
      const pipe = redisConnection.pipeline();
      pipe.del(`monetize:status:${emailKey}`);
      if (typeof payload.data.clicksCount === "number" && payload.data.clicksCount > 0) {
        pipe.set(`user:live_clicks:${emailKey}`, String(payload.data.clicksCount), "EX", 3600);
      }
      pipe.publish(`live:monetization:${emailKey}`, payloadString);
      await pipe.exec().catch(() => {});
    }
  } catch {}

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && serviceKey && emailKey) {
    const userTopic = `realtime:user:${emailKey.replace(/[^a-zA-Z0-9]/g, "_")}`;
    (async () => {
      try {
        const messages: any[] = [
          {
            topic: userTopic,
            event: "monetization_updated",
            payload: {
              userEmail: emailKey,
              adId: payload.data.adId,
              clicksCount: payload.data.clicksCount,
              isMonetized: payload.data.isMonetized,
              impressionCount: payload.data.impressionCount,
              atwTier: payload.data.atwTier,
              timestamp: payload.timestamp,
            },
          },
        ];
        if (payload.data.adId) {
          messages.push({
            topic: "campaigns_realtime",
            event: "campaign_impression",
            payload: {
              adId: payload.data.adId,
              impressionCount: payload.data.impressionCount,
              timestamp: payload.timestamp,
            },
          });
        }
        await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ messages }),
        });
      } catch {}
    })();
  }

  const webhookUrl =
    process.env.IMPRESSION_WEBHOOK_URL ||
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
        const timeout = setTimeout(() => controller.abort(), 3500);
        await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Xea-Signature-256": signature,
            "X-Xea-Timestamp": timestamp,
            "X-Xea-Nonce": nonce,
            "User-Agent": "Xea-Impression-Webhook/2.0",
          },
          body: payloadString,
          signal: controller.signal,
        });
        clearTimeout(timeout);
      } catch {}
    })();
  }
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

/**
 * High-speed notification webhook & Redis PubSub dispatcher.
 * Invalidates the user's L2 notification cache, broadcasts on `live:notifications`,
 * and dispatches a signed HTTP webhook in <5ms non-blockingly.
 */
export async function dispatchNotificationWebhook(notification: {
  id?: string;
  user_email: string;
  title: string;
  message: string;
  created_at?: string;
}): Promise<void> {
  const emailKey = String(notification.user_email || "").toLowerCase().trim();
  if (!emailKey) return;

  const createdAt = notification.created_at || new Date().toISOString();
  const payload: NotificationWebhookPayload = {
    event: "notification.created",
    timestamp: Date.now(),
    data: {
      id: notification.id || crypto.randomUUID(),
      user_email: emailKey,
      title: notification.title,
      message: notification.message,
      created_at: createdAt,
    },
  };

  const payloadString = JSON.stringify(payload);

  try {
    if (isRedisReady()) {
      const pipe = redisConnection.pipeline();
      pipe.del(`notifications:${emailKey}`);
      pipe.publish(LIVE_NOTIFICATION_CHANNEL, payloadString);
      pipe.publish(`${LIVE_NOTIFICATION_CHANNEL}:${emailKey}`, payloadString);
      await pipe.exec().catch(() => {});
    }
  } catch {}

  // Push zero-latency Supabase Realtime webhook broadcast to connected mobile/web clients
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && serviceKey) {
    const userTopic = `realtime:user:${emailKey.replace(/[^a-zA-Z0-9]/g, "_")}`;
    (async () => {
      try {
        await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            messages: [
              {
                topic: userTopic,
                event: "notification",
                payload: {
                  ...payload.data,
                  read: false,
                },
              },
            ],
          }),
        });
      } catch {}
    })();
  }

  const webhookUrl =
    process.env.NOTIFICATION_WEBHOOK_URL ||
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
        const timeout = setTimeout(() => controller.abort(), 3500);
        await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Xea-Signature-256": signature,
            "X-Xea-Timestamp": timestamp,
            "X-Xea-Nonce": nonce,
            "User-Agent": "Xea-Notification-Webhook/2.0",
          },
          body: payloadString,
          signal: controller.signal,
        });
        clearTimeout(timeout);
      } catch {}
    })();
  }
}

