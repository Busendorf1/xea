// app/api/payments/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const cacheKey = `statement:payments:${emailLower}`;

    // 1. Redis Cache Read Path
    try {
      const { default: redisConnection } = await import("@/lib/redis");
      const cached = await redisConnection.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }
    } catch (redisErr) {
      console.warn("⚠️ Redis read warning in payments history:", redisErr);
    }

    // 2. Database Fetch Path
    const { data: payments, error } = await supabaseAdmin
      .from("payments")
      .select("*")
      .ilike("user_email", emailLower)
      .not("type", "eq", "withdrawal")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Error fetching payment history:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = payments || [];

    // Cache in Redis for 5 minutes (invalidated when new transactions occur)
    try {
      const { default: redisConnection } = await import("@/lib/redis");
      await redisConnection.set(cacheKey, JSON.stringify(payload), "EX", 300);
    } catch (redisErr) {
      console.warn("⚠️ Redis write warning in payments history:", redisErr);
    }

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/payments/history:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
