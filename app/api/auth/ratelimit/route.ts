import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import redisConnection from "@/lib/redis";

// Enforce max 6 LOGIN attempts per user in 24 hours (86,400s)
// LOGOUT is NEVER blocked so users can safely log out from any device at any time.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({ action: "login", email: "" }));
    const action = body.action || "login";

    // DO NOT prevent logout! Users must always be able to log out for security.
    if (action === "logout") {
      return NextResponse.json({ success: true, allowed: true });
    }

    const session = await auth0.getSession();
    const sessionEmail = session?.user?.email?.toLowerCase();
    const providedEmail = body.email?.toLowerCase()?.trim();
    const userEmail = providedEmail || sessionEmail;

    // Fallback to IP address if email is not available yet
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous_ip";
    const userIdentifier = userEmail ? userEmail : `ip_${ip}`;

    const rateLimitKey = `ratelimit:login:${userIdentifier}`;
    const currentCount = await redisConnection.incr(rateLimitKey);

    if (currentCount === 1) {
      await redisConnection.expire(rateLimitKey, 86400); // 24 Hours TTL
    }

    if (currentCount > 6) {
      console.warn(`⚠️ Login Limit Exceeded for ${userIdentifier}: ${currentCount} attempts in 24h.`);
      return NextResponse.json(
        {
          error: "Login limit exceeded due to suspicious activity. Please try again after some time.",
          limit: 6,
          current: currentCount,
        },
        { status: 429 }
      );
    }

    return NextResponse.json({ success: true, count: currentCount, limit: 6 });
  } catch (err: any) {
    console.error("❌ Auth login rate limit error:", err);
    // Graceful fallback if Redis issue occurs
    return NextResponse.json({ success: true, fallback: true });
  }
}
