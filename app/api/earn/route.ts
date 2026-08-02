import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import crypto from "crypto";
import { feedQueue } from "@/lib/queue";
import redisConnection from "@/lib/redis";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await auth0.getSession();
    const body = await request.json();
    const { adId, token, servedAt, type } = body;

    if (!adId || !token || !servedAt || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (type !== "earn" && type !== "mutual") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const emailKey = email.toLowerCase().trim();

    // Server-side double click check (NX lock in Redis)
    const lockKey = `lock:click:${emailKey}:${adId}:${type}`;
    const lockAcquired = await redisConnection.set(lockKey, "1", "EX", 15, "NX");
    if (!lockAcquired) {
      return NextResponse.json({ error: "Duplicate click action detected. Please wait." }, { status: 429 });
    }

    const userId = session?.user?.sub || email;

    // 1. Verify PoV Token signature using env.AUTH0_SECRET
    const secretKey = env.AUTH0_SECRET;
    const payload = `${adId}:${userId}:${servedAt}`;
    const expectedToken = crypto.createHmac("sha256", secretKey).update(payload).digest("hex");
    
    if (token !== expectedToken) {
      return NextResponse.json({ error: "Please refresh" }, { status: 400 });
    }

    const now = Date.now();
    const viewDuration = now - parseInt(servedAt, 10);

    // 2. Enforce 16-second minimum view duration
    if (viewDuration < 16000) {
      return NextResponse.json({ error: "View duration too short. Please watch the ad for at least 16 seconds." }, { status: 400 });
    }

    // 3. Enforce 30-minute maximum token age
    if (viewDuration > 1800000) {
      return NextResponse.json({ error: "Please refresh" }, { status: 400 });
    }

    // 4. Enqueue the task to Redis Queue for high-concurrency buffering
    await feedQueue.add(`${type}-click`, {
      adId,
      email: emailKey,
      type
    });

    // Add adId to active seen set in Redis so next feed load filters it out instantly
    const seenSetKey = `seen:ads:${emailKey}`;
    await Promise.all([
      redisConnection.sadd(seenSetKey, adId),
      redisConnection.expire(seenSetKey, 86400), // 24 Hours TTL
    ]).catch((err) => console.error("❌ Redis seen set update error:", err));

    return NextResponse.json({ success: true, queued: true });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/earn:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
