import { NextRequest } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = await getAuthenticatedEmail(req);
  if (!email) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const emailLower = email.toLowerCase().trim();
  const channelName = `live:balance:${emailLower}`;

  const redisHost = process.env.REDIS_HOST;
  const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
  const redisPassword = process.env.REDIS_PASSWORD;
  const redisTls = process.env.REDIS_TLS === "true" || process.env.REDIS_TLS === "1";

  const redisUrl =
    process.env.REDIS_URL ||
    (redisHost && redisPassword
      ? `${redisTls ? "rediss" : "redis"}://:${encodeURIComponent(redisPassword)}@${redisHost}:${redisPort}`
      : "redis://127.0.0.1:6379");

  const sub = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ status: "connected", email: emailLower })}\n\n`
        )
      );

      try {
        await sub.connect();
        await sub.subscribe(channelName);

        sub.on("message", (_chan, message) => {
          try {
            controller.enqueue(encoder.encode(`event: balance\ndata: ${message}\n\n`));
          } catch {
            // Stream controller already closed
          }
        });
      } catch (err) {
        console.warn("⚠️ SSE Redis Subscriber error:", err);
      }

      // Keep-alive heartbeat every 15 seconds
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        sub.unsubscribe(channelName).catch(() => {});
        sub.quit().catch(() => {});
      });
    },
    cancel() {
      sub.unsubscribe(channelName).catch(() => {});
      sub.quit().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
