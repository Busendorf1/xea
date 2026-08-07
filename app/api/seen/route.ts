import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { feedQueue } from "@/lib/queue";
import redisConnection from "@/lib/redis";

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
    const lockKey = `lock:click:${emailKey}:${adId}:seen`;
    const lockAcquired = await redisConnection.set(lockKey, "1", "EX", 15, "NX");
    if (!lockAcquired) {
      return NextResponse.json({ error: "Duplicate click action detected. Please wait." }, { status: 429 });
    }

    // Enqueue Seen click
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
      redisConnection.sadd(seenSetKey, adId),
      redisConnection.expire(seenSetKey, 86400), // 24 Hours TTL
      redisConnection.hincrby(pacingHashKey, adId, 1),
      redisConnection.expire(pacingHashKey, 86400), // 24 Hours TTL
    ]).catch((err) => console.error("❌ Redis seen set / RAM pacing update error:", err));

    return NextResponse.json({ success: true, queued: true });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/seen:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
