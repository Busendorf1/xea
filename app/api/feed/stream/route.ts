import { NextRequest } from "next/server";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { getCachedProfile } from "@/lib/utils/cache";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import {
  evaluateAdTargeting,
  signAdImpressionToken,
  ViewerTargetingProfile,
} from "@/lib/targetingEngine";
import { LIVE_FEED_DROP_CHANNEL } from "@/lib/webhookDispatcher";
import type Redis from "ioredis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FeedDropListener = (rawMessage: string) => void;

interface SharedFeedSubscriberState {
  subscriber: Redis | null;
  connecting: boolean;
  listeners: Set<FeedDropListener>;
}

const globalForFeedPubSub = globalThis as unknown as {
  __xeaFeedDropPubSubState?: SharedFeedSubscriberState;
};

function getFeedPubSubState(): SharedFeedSubscriberState {
  if (!globalForFeedPubSub.__xeaFeedDropPubSubState) {
    globalForFeedPubSub.__xeaFeedDropPubSubState = {
      subscriber: null,
      connecting: false,
      listeners: new Set(),
    };
  }
  return globalForFeedPubSub.__xeaFeedDropPubSubState;
}

async function subscribeToFeedDrops(listener: FeedDropListener): Promise<() => void> {
  const state = getFeedPubSubState();
  state.listeners.add(listener);

  if (!state.subscriber && !state.connecting && isRedisReady()) {
    state.connecting = true;
    try {
      const sub = redisConnection.duplicate({
        lazyConnect: false,
        enableReadyCheck: false,
      });
      sub.on("error", () => {});
      sub.on("message", (channel: string, message: string) => {
        if (channel !== LIVE_FEED_DROP_CHANNEL) return;
        for (const cb of state.listeners) {
          try {
            cb(message);
          } catch {}
        }
      });
      await sub.subscribe(LIVE_FEED_DROP_CHANNEL);
      state.subscriber = sub;
    } catch {
      state.subscriber = null;
    } finally {
      state.connecting = false;
    }
  }

  return () => {
    state.listeners.delete(listener);
  };
}

/**
 * GET /api/feed/stream
 *
 * Multiplexed Server-Sent Events (SSE) stream for real-time webhook-dropped ads.
 * Evaluates full demographic, geographic, and psychographic targeting per viewer
 * and signs each delivered ad with a viewer-specific HMAC token so it can be
 * staged while scrolling and interacted with immediately upon prepend.
 */
export async function GET(request: NextRequest) {
  const email = await getAuthenticatedEmail(request);
  if (!email) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const emailKey = email.toLowerCase().trim();

  // Resolve viewer targeting profile once at stream connection time (cached in Redis)
  let viewerProfile: ViewerTargetingProfile = { email: emailKey };
  try {
    const cached = await getCachedProfile(emailKey);
    if (cached) {
      viewerProfile = { ...(cached as any), email: emailKey };
    } else {
      const { data: dbUser } = await supabaseReadOnly
        .from("users")
        .select("email, dob, country, state, location, gender, employment, employment_status, interest, lifestyle, behavior, personality, industry")
        .ilike("email", emailKey)
        .maybeSingle();
      if (dbUser) {
        viewerProfile = { ...(dbUser as any), email: emailKey };
      }
    }
  } catch {}

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let isClosed = false;

  const cleanup = () => {
    if (isClosed) return;
    isClosed = true;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };

      sendEvent({ type: "connected", email: emailKey, timestamp: Date.now() });

      unsubscribe = await subscribeToFeedDrops((rawMessage: string) => {
        if (isClosed) return;
        try {
          const parsed = JSON.parse(rawMessage);
          const ad = parsed?.data?.ad || parsed?.ad;
          const publisherProfile = parsed?.data?.publisherProfile || null;
          if (!ad || !ad.id) return;

          // Strictly verify that this dropped ad matches the scrolling viewer's targeting criteria
          const matchResult = evaluateAdTargeting(ad, viewerProfile, { allowRolloverPsychographics: false });
          if (!matchResult.matches) return;

          const servedAt = Date.now();
          const isPlatformPost = Boolean(
            ad.is_admin_post ||
            isAdminEmail(ad.user_email || ad.email) ||
            !ad.cost_per_impression ||
            Number(ad.cost_per_impression) <= 0 ||
            !ad.impressions ||
            Number(ad.impressions) <= 0
          );
          const token = signAdImpressionToken(String(ad.id), emailKey, servedAt);

          const signedAd = {
            ...ad,
            is_admin_post: isPlatformPost,
            cost_per_impression: isPlatformPost ? 0 : Number(ad.cost_per_impression || 0),
            impressions: isPlatformPost ? 0 : Number(ad.impressions || 0),
            _token: token,
            _served_at: servedAt,
            verification_token: token,
            served_at: servedAt,
          };

          sendEvent({
            type: "ad.dropped",
            ad: signedAd,
            publisherProfile,
            relevanceScore: matchResult.relevanceScore,
            matchedDimensions: matchResult.matchedDimensions,
            timestamp: servedAt,
          });
        } catch {}
      });

      heartbeatInterval = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, 25000);

      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
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
