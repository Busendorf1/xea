import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import redisConnection from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { highlightId } = await req.json();
    if (!highlightId) {
      return NextResponse.json({ error: "Missing highlightId" }, { status: 400 });
    }

    const dateStr = new Date().toISOString().split("T")[0];
    const emailKey = email.toLowerCase().trim();
    const redisKey = `hl:views:${emailKey}:${dateStr}`;

    let newCount = 1;
    try {
      // Atomically increment render count for this highlight for this user today
      newCount = (await redisConnection.hincrby(redisKey, String(highlightId), 1)) || 1;
      
      // Set 24-hour TTL (86400s) on key so tracking expires naturally
      await redisConnection.expire(redisKey, 86400).catch(() => {});
    } catch (redisErr: any) {
      console.warn("⚠️ Redis highlight view tracking bypassed:", redisErr?.message || redisErr);
    }

    return NextResponse.json({ success: true, highlightId, count: newCount });
  } catch (err: any) {
    console.error("❌ Error in POST /api/highlights/impression:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
