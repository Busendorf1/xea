// app/api/withdrawals/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function GET(req: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = session.user.email?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "No email associated with session" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();
    const cacheKey = `statement:withdrawals:${emailLower}`;
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get("refresh") === "true";

    // 1. Redis Cache Read Path (bypassed if forceRefresh=true)
    if (!forceRefresh) {
      try {
        const { default: redisConnection } = await import("@/lib/redis");
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          return NextResponse.json(JSON.parse(cached));
        }
      } catch (redisErr) {
        console.warn("⚠️ Redis read warning in withdrawals history:", redisErr);
      }
    }

    // 2. Database Fetch Path
    const { data: withdrawals, error } = await supabaseAdmin
      .from("payments")
      .select("*")
      .ilike("user_email", emailLower)
      .eq("type", "withdrawal")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Error fetching withdrawal history:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = withdrawals || [];

    // Cache in Redis for 7 days (604,800s) — invalidated event-driven when new transactions occur
    try {
      const { default: redisConnection } = await import("@/lib/redis");
      await redisConnection.set(cacheKey, JSON.stringify(payload), "EX", 604800);
    } catch (redisErr) {
      console.warn("⚠️ Redis write warning in withdrawals history:", redisErr);
    }

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/withdrawals/history:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
