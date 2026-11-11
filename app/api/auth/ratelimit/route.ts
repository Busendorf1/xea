import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { isAdminEmail } from "@/lib/authHelper";

// GET /api/auth/ratelimit?reset=all -> reset limits for all accounts
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reset = searchParams.get("reset");

    if (reset === "all" || reset === "true") {
      let deletedCount = 0;
      if (isRedisReady()) {
        const keys = await redisConnection.keys("ratelimit:login:*");
        if (keys.length > 0) {
          deletedCount = await redisConnection.del(...keys);
        }
      }
      return NextResponse.json({
        success: true,
        message: `Successfully reset login limits for all accounts (${deletedCount} keys deleted).`,
        deletedCount,
      });
    }

    return NextResponse.json({ success: true, message: "Login rate limit service active." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to check rate limit" }, { status: 500 });
  }
}

// POST /api/auth/ratelimit -> record attempt or reset
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({ action: "login", email: "" }));
    const action = body.action || "login";

    // 1. Explicit Reset Action
    if (action === "reset_all" || action === "reset") {
      let deletedCount = 0;
      if (isRedisReady()) {
        const keys = await redisConnection.keys("ratelimit:login:*");
        if (keys.length > 0) {
          deletedCount = await redisConnection.del(...keys);
        }
      }
      return NextResponse.json({
        success: true,
        message: `Login limits reset for all accounts.`,
        deletedCount,
      });
    }

    // DO NOT prevent logout! Users must always be able to log out for security.
    if (action === "logout") {
      return NextResponse.json({ success: true, allowed: true });
    }

    const session = await auth0.getSession();
    const sessionEmail = session?.user?.email?.toLowerCase();
    const providedEmail = body.email?.toLowerCase()?.trim();
    const userEmail = providedEmail || sessionEmail;

    // 2. Admins are completely exempt from login rate limits
    if (userEmail && isAdminEmail(userEmail)) {
      return NextResponse.json({ success: true, allowed: true, exempt: true });
    }

    // 3. Non-production / local test environments are exempt
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ success: true, allowed: true, dev: true });
    }

    // Fallback to IP address if email is not available yet
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous_ip";
    const userIdentifier = userEmail ? userEmail : `ip_${ip}`;

    const MAX_LOGIN_ATTEMPTS = 30; // 30 attempts per hour (sliding window)
    const WINDOW_SECONDS = 3600;

    const rateLimitKey = `ratelimit:login:${userIdentifier}`;
    const currentCount = await redisConnection.incr(rateLimitKey);

    if (currentCount === 1) {
      await redisConnection.expire(rateLimitKey, WINDOW_SECONDS);
    }

    if (currentCount > MAX_LOGIN_ATTEMPTS) {
      console.warn(`⚠️ Login Limit Exceeded for ${userIdentifier}: ${currentCount} attempts in 1h.`);
      return NextResponse.json(
        {
          error: "Login limit exceeded due to suspicious activity. Please try again in an hour.",
          limit: MAX_LOGIN_ATTEMPTS,
          current: currentCount,
        },
        { status: 429 }
      );
    }

    return NextResponse.json({ success: true, count: currentCount, limit: MAX_LOGIN_ATTEMPTS });
  } catch (err: any) {
    console.error("❌ Auth login rate limit error:", err);
    // Graceful fallback if Redis issue occurs
    return NextResponse.json({ success: true, fallback: true });
  }
}
