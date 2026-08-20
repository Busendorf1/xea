import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { feedQueue } from "@/lib/queue";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { adId } = body;

    if (!adId) {
      return NextResponse.json({ error: "adId is required" }, { status: 400 });
    }

    const emailKey = email.toLowerCase().trim();

    // Server-side double click check (NX lock in Redis)
    if (isRedisReady()) {
      try {
        const lockKey = `lock:click:${emailKey}:${adId}:seen`;
        const lockAcquired = await redisConnection.set(lockKey, "1", "EX", 15, "NX");
        if (!lockAcquired) {
          return NextResponse.json({ error: "Duplicate click action detected. Please wait." }, { status: 429 });
        }
      } catch {}
    }

    // Direct DB record impression
    try {
      await supabaseAdmin
        .from("ad_impressions")
        .upsert({
          ad_id: adId,
          user_email: emailKey,
          view_count: 1,
          last_viewed_at: new Date().toISOString(),
        }, { onConflict: "ad_id,user_email" });
    } catch {}

    // Enqueue Seen click if Redis/Queue is available
    if (isRedisReady()) {
      try {
        await feedQueue.add("seen-click", {
          adId,
          email: emailKey,
          type: "seen"
        });

        // Add adId to active seen set and increment daily RAM pacing hash for <0.1ms ultra-scale filtering
        const todayDate = new Date().toISOString().slice(0, 10);
        const seenSetKey = `seen:ads:${emailKey}`;
        const pacingHashKey = `user:pacing:${emailKey}:${todayDate}`;

        await Promise.all([
          redisConnection.sadd(seenSetKey, adId).catch(() => null),
          redisConnection.expire(seenSetKey, 86400).catch(() => null),
          redisConnection.hincrby(pacingHashKey, adId, 1).catch(() => null),
          redisConnection.expire(pacingHashKey, 86400).catch(() => null),
        ]);
      } catch {}
    }

    const { incrementCachedMonetizationClicks } = await import("@/lib/utils/cache");
    await incrementCachedMonetizationClicks(emailKey, 1).catch(() => 0);

    return NextResponse.json({ success: true, queued: true });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/seen:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
