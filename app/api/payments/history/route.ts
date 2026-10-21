// app/api/payments/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const email = await getAuthenticatedEmail(req);

    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const typeParam = url.searchParams.get("type") || "payments";
    const forceRefresh = url.searchParams.get("refresh") === "true";
    const cacheKey = `statement:${typeParam}:${emailLower}`;

    // 1. Redis Cache Read Path (<3ms response time)
    if (!forceRefresh) {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          return NextResponse.json(JSON.parse(cached), {
            headers: {
              "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
              "X-Cache": "HIT",
            },
          });
        }
      } catch (redisErr) {
        console.warn("⚠️ Redis read warning in payments history:", redisErr);
      }
    } else {
      await redisConnection.del(cacheKey).catch(() => {});
    }

    // 2. High-Scale Index-Accelerated Database Read (~8-12ms)
    if (typeParam === "all") {
      const { data: allTransactions, error } = await supabaseReadOnly
        .from("payments")
        .select("id, reference, amount, status, type, description, metadata, created_at")
        .ilike("user_email", emailLower)
        .order("created_at", { ascending: false })
        .limit(300);

      if (error) {
        console.error("❌ Error fetching all statement history:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = allTransactions || [];
      const payments = rows.filter((r) => r.type !== "withdrawal");
      const withdrawals = rows.filter((r) => r.type === "withdrawal");

      const payload = { payments, withdrawals, all: rows };

      // Cache unified statement in Redis with a 60-second TTL for fresh real-time reporting
      redisConnection.set(cacheKey, JSON.stringify(payload), "EX", 60).catch(() => {});

      return NextResponse.json(payload, {
        headers: {
          "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
          "X-Cache": "MISS",
        },
      });
    }

    let query = supabaseReadOnly
      .from("payments")
      .select("id, reference, amount, status, type, description, metadata, created_at")
      .ilike("user_email", emailLower);

    if (typeParam === "withdrawals") {
      query = query.eq("type", "withdrawal");
    } else {
      query = query.not("type", "eq", "withdrawal");
    }

    const { data: payments, error } = await query
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.error("❌ Error fetching payment history:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = payments || [];

    // Cache payload in Redis with 60-second TTL
    redisConnection.set(cacheKey, JSON.stringify(payload), "EX", 60).catch(() => {});

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
        "X-Cache": "MISS",
      },
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/payments/history:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
