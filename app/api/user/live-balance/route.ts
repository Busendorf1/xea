import { NextRequest } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

type BalanceListener = (message: string) => void;

interface LiveBalanceMux {
  sub: Redis;
  listeners: Map<string, Set<BalanceListener>>;
  connecting: Promise<void> | null;
}

const globalForLiveBalance = globalThis as unknown as {
  __xeaLiveBalanceMux?: LiveBalanceMux;
};

function getLiveBalanceMux(): LiveBalanceMux {
  if (globalForLiveBalance.__xeaLiveBalanceMux) {
    return globalForLiveBalance.__xeaLiveBalanceMux;
  }

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

  const listeners = new Map<string, Set<BalanceListener>>();

  sub.on("pmessage", (_pattern, channel, message) => {
    const channelListeners = listeners.get(channel);
    if (!channelListeners || channelListeners.size === 0) return;
    for (const cb of channelListeners) {
      try {
        cb(message);
      } catch {
        // Ignore individual listener errors
      }
    }
  });

  sub.on("error", (err) => {
    console.warn("⚠️ SSE Multiplexed Redis Subscriber error:", err?.message || err);
  });

  const mux: LiveBalanceMux = {
    sub,
    listeners,
    connecting: null,
  };

  globalForLiveBalance.__xeaLiveBalanceMux = mux;
  return mux;
}

async function ensureMuxSubscribed(mux: LiveBalanceMux): Promise<void> {
  if (mux.sub.status === "ready") return;
  if (mux.connecting) {
    await mux.connecting;
    return;
  }
  mux.connecting = (async () => {
    try {
      if (mux.sub.status === "wait") {
        await mux.sub.connect();
      }
      await mux.sub.psubscribe("live:balance:*");
    } catch (err) {
      console.warn("⚠️ SSE Redis psubscribe warning:", err);
    } finally {
      mux.connecting = null;
    }
  })();
  await mux.connecting;
}

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
  const mux = getLiveBalanceMux();
  const encoder = new TextEncoder();

  let cleanupListener: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ status: "connected", email: emailLower })}\n\n`
        )
      );

      const onBalanceMessage: BalanceListener = (message) => {
        try {
          controller.enqueue(encoder.encode(`event: balance\ndata: ${message}\n\n`));
        } catch {
          // Stream controller already closed
        }
      };

      let set = mux.listeners.get(channelName);
      if (!set) {
        set = new Set();
        mux.listeners.set(channelName, set);
      }
      set.add(onBalanceMessage);

      await ensureMuxSubscribed(mux);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      cleanupListener = () => {
        clearInterval(heartbeat);
        const currentSet = mux.listeners.get(channelName);
        if (currentSet) {
          currentSet.delete(onBalanceMessage);
          if (currentSet.size === 0) {
            mux.listeners.delete(channelName);
          }
        }
      };

      req.signal.addEventListener("abort", () => {
        if (cleanupListener) cleanupListener();
      });
    },
    cancel() {
      if (cleanupListener) cleanupListener();
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

