import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import crypto from "crypto";
import { feedQueue } from "@/lib/queue";
import redisConnection from "@/lib/redis";

const SECRET_KEY = process.env.AUTH0_SECRET;
if (!SECRET_KEY && process.env.NODE_ENV === "production") {
  console.warn("⚠️ AUTH0_SECRET environment variable is missing.");
}

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await auth0.getSession();
    const body = await request.json();
    const { adId, token, servedAt, type, turnstileToken } = body;

    if (!adId || !token || !servedAt || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (type !== "earn" && type !== "mutual") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    // Server-side double click check (NX lock in Redis)
    const lockKey = `lock:click:${email.toLowerCase().trim()}:${adId}:${type}`;
    const lockAcquired = await redisConnection.set(lockKey, "1", "EX", 15, "NX");
    if (!lockAcquired) {
      return NextResponse.json({ error: "Duplicate click action detected. Please wait." }, { status: 429 });
    }

    const userId = session?.user?.sub || email;

    // 1. Verify PoV Token signature
    const activeSecretKey = SECRET_KEY || "BhrjJEt523QxdiWWsOI73y5hJyVQkqlGoIp08xPUJBxlkoJ5q0ELp75RsmxfOF3S";
    const payload = `${adId}:${userId}:${servedAt}`;
    const expectedToken = crypto.createHmac("sha256", activeSecretKey).update(payload).digest("hex");
    
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
      email: email.toLowerCase().trim(),
      type
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
    console.error("❌ Unexpected error in POST /api/earn:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
