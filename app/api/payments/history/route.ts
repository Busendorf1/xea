// app/api/payments/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import {
  normalizeReceiptTransaction,
  encodeStatementCursor as encodeCursor,
  decodeStatementCursor as decodeCursor,
} from "@/lib/payment/historyHelpers";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_LIMIT = 250;
const MAX_PAGE_LIMIT = 500;

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
    const cursorParam = url.searchParams.get("cursor");
    const hasExplicitLimit = url.searchParams.has("limit");
    const requestedLimit = Number(url.searchParams.get("limit"));
    const pageLimit =
      hasExplicitLimit && Number.isFinite(requestedLimit) && requestedLimit >= 1
        ? Math.min(MAX_PAGE_LIMIT, Math.floor(requestedLimit))
        : DEFAULT_PAGE_LIMIT;
    const isEnvelopeRequested =
      url.searchParams.get("paginated") === "true" || cursorParam !== null || hasExplicitLimit;

    if (cursorParam !== null && !decodeCursor(cursorParam)) {
      return NextResponse.json({ error: "Invalid pagination cursor" }, { status: 400 });
    }
    const decodedCursor = decodeCursor(cursorParam);

    const versionKey = `statement:ver:${emailLower}`;
    if (forceRefresh) {
      await Promise.all([
        redisConnection.incr(versionKey).catch(() => {}),
        redisConnection
          .del(
            `statement:${typeParam}:${emailLower}`,
            `statement:all:${emailLower}`,
            `statement:payments:${emailLower}`,
            `statement:withdrawals:${emailLower}`
          )
          .catch(() => {}),
      ]);
    }

    const ver = (await redisConnection.get(versionKey).catch(() => null)) || "0";
    const cursorTag = cursorParam ? cursorParam.slice(0, 32) : "first";
    const cacheKey = `statement:v2:${emailLower}:v${ver}:${typeParam}:${pageLimit}:${cursorTag}`;

    // 1. Redis Cache Read Path (<3ms response time)
    if (!forceRefresh) {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          const parsedCached = JSON.parse(cached);
          const bodyOut =
            typeParam !== "all" && !isEnvelopeRequested && Array.isArray(parsedCached?.items)
              ? parsedCached.items
              : parsedCached;
          return NextResponse.json(bodyOut, {
            headers: {
              "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
              "X-Cache": "HIT",
              ...(parsedCached?.nextCursor ? { "X-Next-Cursor": String(parsedCached.nextCursor) } : {}),
              "X-Has-More": String(Boolean(parsedCached?.hasMore)),
            },
          });
        }
      } catch (redisErr) {
        console.warn("⚠️ Redis read warning in payments history:", redisErr);
      }
    }

    // 2. Keyset-Paginated Index-Accelerated Database Read
    let query = supabaseReadOnly
      .from("payments")
      .select("id, reference, amount, status, type, description, metadata, created_at")
      .ilike("user_email", emailLower);

    if (typeParam === "withdrawals") {
      query = query.eq("type", "withdrawal");
    } else if (typeParam !== "all") {
      query = query.not("type", "eq", "withdrawal");
    }

    if (decodedCursor) {
      query = query.or(
        `created_at.lt.${decodedCursor.createdAt},and(created_at.eq.${decodedCursor.createdAt},id.lt.${decodedCursor.id})`
      );
    }

    const { data: rawRows, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageLimit + 1);

    if (error) {
      console.error("❌ Error fetching statement history:", error);
      return NextResponse.json({ error: "Try again later" }, { status: 500 });
    }

    const fetched = rawRows || [];
    const hasMore = fetched.length > pageLimit;
    const sliced = hasMore ? fetched.slice(0, pageLimit) : fetched;
    const rows = sliced.map(normalizeReceiptTransaction);
    const nextCursor = hasMore && rows.length > 0 ? encodeCursor(rows[rows.length - 1]) : null;

    if (typeParam === "all") {
      const payments = rows.filter((r: any) => r.type !== "withdrawal");
      const withdrawals = rows.filter((r: any) => r.type === "withdrawal");
      const payload = {
        payments,
        withdrawals,
        all: rows,
        nextCursor,
        hasMore,
        limit: pageLimit,
      };

      redisConnection.set(cacheKey, JSON.stringify(payload), "EX", 60).catch(() => {});

      return NextResponse.json(payload, {
        headers: {
          "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
          "X-Cache": "MISS",
          ...(nextCursor ? { "X-Next-Cursor": nextCursor } : {}),
          "X-Has-More": String(hasMore),
        },
      });
    }

    const cachePayload = { items: rows, nextCursor, hasMore, limit: pageLimit };
    redisConnection.set(cacheKey, JSON.stringify(cachePayload), "EX", 60).catch(() => {});

    const responseBody = isEnvelopeRequested ? cachePayload : rows;
    return NextResponse.json(responseBody, {
      headers: {
        "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
        "X-Cache": "MISS",
        ...(nextCursor ? { "X-Next-Cursor": nextCursor } : {}),
        "X-Has-More": String(hasMore),
      },
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/payments/history:", err);
    return NextResponse.json({ error: "Try again later" }, { status: 500 });
  }
}
