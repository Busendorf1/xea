// app/api/withdrawals/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const cacheKey = `statement:withdrawals:${emailLower}`;
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get("refresh") === "true";

    // 1. Redis Cache Read Path (<5ms response time)
    if (!forceRefresh) {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          return NextResponse.json(JSON.parse(cached), {
            headers: {
              "Cache-Control": "private, max-age=5, stale-while-revalidate=60",
            },
          });
        }
      } catch (redisErr) {
        console.warn("⚠️ Redis read warning in withdrawals history:", redisErr);
      }
    }

    // 2. High-Scale Index-Accelerated Database Read (~10ms)
    const { data: withdrawals, error } = await supabaseReadOnly
      .from("payments")
      .select("id, reference, amount, status, type, description, created_at")
      .eq("user_email", emailLower)
      .eq("type", "withdrawal")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Error fetching withdrawal history:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = withdrawals || [];

    // Cache payload in Redis for fast re-reads
    redisConnection.set(cacheKey, JSON.stringify(payload), "EX", 604800).catch(() => {});

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=5, stale-while-revalidate=60",
      },
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/withdrawals/history:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
