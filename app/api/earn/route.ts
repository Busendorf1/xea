import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import crypto from "crypto";
import { feedQueue } from "@/lib/queue";
import redisConnection from "@/lib/redis";

const SECRET_KEY = process.env.AUTH0_SECRET || "BhrjJEt523QxdiWWsOI73y5hJyVQkqlGoIp08xPUJBxlkoJ5q0ELp75RsmxfOF3S";

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

    // 1. Verify Cloudflare Turnstile CAPTCHA token (Disabled temporarily per user request)
    /*
    const turnstileSecret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      if (!turnstileToken) {
        return NextResponse.json({ error: "Security check token missing. Please try again." }, { status: 400 });
      }

      if (turnstileToken === "no-turnstile-script" && turnstileSecret === "1x00000000000000000000000000000000A") {
        console.log("⚠️ Skipping Turnstile check since script was blocked and test keys are active.");
      } else {
        const verifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
        try {
          const verifyRes = await fetch(verifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              secret: turnstileSecret,
              response: turnstileToken
            }).toString()
          });

          const verifyData = await verifyRes.json();
          if (!verifyData.success) {
            console.error("❌ Cloudflare Turnstile verification failed:", verifyData);
            return NextResponse.json({ error: "Security check failed. Please refresh and try again." }, { status: 400 });
          }
        } catch (verifyErr) {
          console.error("❌ Error contacting Cloudflare Turnstile API:", verifyErr);
          if (turnstileSecret !== "1x00000000000000000000000000000000A") {
            return NextResponse.json({ error: "Unable to verify security challenge. Please try again." }, { status: 400 });
          }
        }
      }
    }
    */

    const userId = session?.user?.sub || email;

    // 1. Verify PoV Token signature
    const payload = `${adId}:${userId}:${servedAt}`;
    const expectedToken = crypto.createHmac("sha256", SECRET_KEY).update(payload).digest("hex");
    
    if (token !== expectedToken) {
      return NextResponse.json({ error: "Invalid Proof-of-View token" }, { status: 400 });
    }

    const now = Date.now();
    const viewDuration = now - parseInt(servedAt, 10);

    // 2. Enforce 16-second minimum view duration
    if (viewDuration < 16000) {
      return NextResponse.json({ error: "View duration too short. Please watch the ad for at least 16 seconds." }, { status: 400 });
    }

    // 3. Enforce 30-minute maximum token age
    if (viewDuration > 1800000) {
      return NextResponse.json({ error: "Proof-of-View token has expired. Please refresh the feed." }, { status: 400 });
    }

    // 4. Enqueue the task to Redis Queue for high-concurrency buffering
    await feedQueue.add(`${type}-click`, {
      adId,
      email: email.toLowerCase().trim(),
      type
    });

    return NextResponse.json({ success: true, queued: true });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/earn:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
