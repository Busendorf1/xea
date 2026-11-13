// app/api/withdrawals/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { normalizeReceiptTransaction } from "@/lib/payment/historyHelpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const email = await getAuthenticatedEmail(req);

    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const forceRefresh = url.searchParams.get("refresh") === "true";
    const versionKey = `statement:ver:${emailLower}`;

    if (forceRefresh) {
      await Promise.all([
        redisConnection.incr(versionKey).catch(() => {}),
        redisConnection.del(`statement:withdrawals:${emailLower}`).catch(() => {}),
      ]);
    }

    const ver = (await redisConnection.get(versionKey).catch(() => null)) || "0";
    const cacheKey = `statement:withdrawals:v2:${emailLower}:v${ver}`;

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
      .select("id, reference, amount, status, type, description, metadata, created_at")
      .ilike("user_email", emailLower)
      .eq("type", "withdrawal")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(250);

    if (error) {
      console.error("❌ Error fetching withdrawal history:", error);
      return NextResponse.json({ error: "Try again later" }, { status: 500 });
    }

    const payload = (withdrawals || []).map(normalizeReceiptTransaction);

    // Cache payload in Redis for fast re-reads (bounded TTL)
    redisConnection.set(cacheKey, JSON.stringify(payload), "EX", 60).catch(() => {});

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=5, stale-while-revalidate=60",
      },
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/withdrawals/history:", err);
    return NextResponse.json({ error: "Try again later" }, { status: 500 });
  }
}
