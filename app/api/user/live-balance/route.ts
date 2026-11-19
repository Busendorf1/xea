import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { getCachedProfile } from "@/lib/utils/cache";
import redisConnection, { isRedisReady } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/live-balance
 *
 * Lightweight immediate JSON snapshot (retired infinite SSE stream + leaked ioredis
 * psubscribe connection that caused 10s Vercel timeouts and Redis connection exhaustion).
 */
export async function GET(req: NextRequest) {
  const email = await getAuthenticatedEmail(req, { allowMobileHeader: true });
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const emailLower = email.toLowerCase().trim();
  const [cachedProfile, liveClicksRaw] = await Promise.all([
    getCachedProfile<any>(emailLower).catch(() => null),
    isRedisReady()
      ? redisConnection.get(`user:live_clicks:v2:${emailLower}`).catch(() => null)
      : Promise.resolve(null),
  ]);

  const balance = Number(cachedProfile?.balance ?? 0);
  const clicks = Math.max(
    Number(cachedProfile?.monetization_clicks ?? 0),
    liveClicksRaw ? Number(liveClicksRaw) || 0 : 0
  );

  return NextResponse.json(
    {
      status: "polling",
      mode: "poll",
      balance,
      clicks,
      monetized: Boolean(
        !cachedProfile?.has_cancelled_monetization &&
          (cachedProfile?.monetized === true ||
            cachedProfile?.monetized === "true" ||
            cachedProfile?.monetized === "yes" ||
            clicks >= 500)
      ),
      timestamp: Date.now(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    }
  );
}
