import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { feedQueue } from "@/lib/queue";
import redisConnection from "@/lib/redis";

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

    // Server-side double click check (NX lock in Redis)
    const lockKey = `lock:click:${email.toLowerCase().trim()}:${adId}:seen`;
    const lockAcquired = await redisConnection.set(lockKey, "1", "EX", 15, "NX");
    if (!lockAcquired) {
      return NextResponse.json({ error: "Duplicate click action detected. Please wait." }, { status: 429 });
    }

    // Enqueue Seen click
    await feedQueue.add("seen-click", {
      adId,
      email: email.toLowerCase().trim(),
      type: "seen"
    });

    // Invalidate user's feed cache immediately so the next load/refresh excludes this ad
    const emailKey = email.toLowerCase().trim();
    await Promise.all([
      redisConnection.del(`feed:ad_ids:${emailKey}`),
      redisConnection.del(`feed:ads:${emailKey}`),
      redisConnection.del(`feed:profiles:${emailKey}`),
    ]).catch((err) => console.error("❌ Redis feed cache delete error:", err));

    return NextResponse.json({ success: true, queued: true });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/seen:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
