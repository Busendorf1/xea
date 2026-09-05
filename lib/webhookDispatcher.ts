import crypto from "crypto";

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

/**
 * Signs an outgoing webhook payload using HMAC-SHA256.
 */
export function signWebhookPayload(payloadString: string, secretKey: string): string {
  return crypto.createHmac("sha256", secretKey).update(payloadString).digest("hex");
}

/**
 * Dispatches an asynchronous earning event webhook to external platforms,
 * mobile push notification relays, and partner integrations.
 * Executes non-blockingly (fire-and-forget with background error trapping).
 */
export async function dispatchEarningWebhook(payload: EarningWebhookPayload): Promise<void> {
  const webhookUrl = process.env.EARNING_WEBHOOK_URL || process.env.NEXT_PUBLIC_WEBHOOK_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET_KEY || process.env.AUTH0_SECRET || "xea-secure-webhook-secret";

  if (!webhookUrl) {
    // No external webhook URL configured, skip network call
    return;
  }

  const payloadString = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const signaturePayload = `${timestamp}.${nonce}.${payloadString}`;
  const signature = signWebhookPayload(signaturePayload, webhookSecret);

  // Non-blocking fire-and-forget dispatch
  (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000); // 4-second hard timeout

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
