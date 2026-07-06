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
    const { adId, clickType } = body;

    if (!adId || !clickType) {
      return NextResponse.json({ error: "Missing adId or clickType" }, { status: 400 });
    }

    const validClickTypes = ["phone", "whatsapp", "website", "email", "buy_now", "shop", "order", "visit_website", "product_cta"];
    if (!validClickTypes.includes(clickType)) {
      return NextResponse.json({ error: "Invalid clickType" }, { status: 400 });
    }

    // Server-side double click prevention (NX lock in Redis)
    const lockKey = `lock:click:${email.toLowerCase().trim()}:${adId}:${clickType}`;
    const lockAcquired = await redisConnection.set(lockKey, "1", "EX", 15, "NX");
    if (!lockAcquired) {
      return NextResponse.json({ error: "Duplicate click detected." }, { status: 429 });
    }

    // Enqueue Action click to Upstash Redis queue
    await feedQueue.add("action-click", {
      adId,
      clickType,
      email: email.toLowerCase().trim(),
      type: "action-click"
    });

    return NextResponse.json({ success: true, queued: true });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/campaigns/click:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
