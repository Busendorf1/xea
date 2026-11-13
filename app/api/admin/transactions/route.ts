// app/api/admin/transactions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminUser } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

export const dynamic = "force-dynamic";

function sanitizeFilterInput(raw: string): string {
  return raw.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
}

function escapeIlikeLiteral(raw: string): string {
  return raw.replace(/[%_\\]/g, "\\$&");
}

function escapeCsvCell(val: unknown): string {
  let str = val === null || val === undefined ? "" : String(val);
  // Neutralize CSV formula injection (Excel, LibreOffice Calc, Google Sheets)
  if (/^[=+\-@\t\r]/.test(str) || /^[\s\u0000-\u001f]*[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized access: Admin privilege required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "25", 10) || 25), 100);
    const cursor = searchParams.get("cursor")?.trim() || "";
    const type = (searchParams.get("type") || "all").toLowerCase().trim();
    const status = (searchParams.get("status") || "all").toLowerCase().trim();
    const rawSearch = searchParams.get("search")?.trim() || "";
    const rawEmail = searchParams.get("email")?.trim() || "";
    const reference = searchParams.get("reference")?.trim() || "";
    const year = searchParams.get("year")?.trim() || "";
    const startDate = searchParams.get("startDate")?.trim() || "";
    const endDate = searchParams.get("endDate")?.trim() || "";
    const exportCsv = searchParams.get("exportCsv") === "true";

    const cleanSearch = sanitizeFilterInput(rawSearch);
    const cleanEmail = escapeIlikeLiteral(rawEmail);

    let query = supabaseAdmin
      .from("payments")
      .select(
        "id, user_email, reference, amount, type, status, description, metadata, created_at",
        { count: cursor ? "planned" : "exact" }
      );

    // 1. Status Filter
    if (status !== "all") {
      query = query.eq("status", status);
    }

    // 2. Type Filter
    if (type !== "all") {
      if (type === "transfers") {
        query = query.in("type", ["transfer_sent", "transfer_received"]);
      } else if (type === "campaigns") {
        query = query.in("type", ["ad", "highlight", "ad_payment", "highlight_payment"]);
      } else {
        query = query.eq("type", type);
      }
    }

    // 3. Exact Email / Reference
    if (cleanEmail) {
      query = query.ilike("user_email", `%${cleanEmail}%`);
    }

    if (reference) {
      query = query.eq("reference", reference);
    }

    // 4. General Search (sanitized against PostgREST .or() filter injection)
    if (cleanSearch && !reference && !cleanEmail) {
      query = query.or(
        `user_email.ilike.%${cleanSearch}%,reference.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%`
      );
    }

    // 5. Date / Year Ranges
    if (year && /^\d{4}$/.test(year)) {
      const startOfYear = `${year}-01-01T00:00:00.000Z`;
      const endOfYear = `${year}-12-31T23:59:59.999Z`;
      query = query.gte("created_at", startOfYear).lte("created_at", endOfYear);
    } else {
      if (startDate && !Number.isNaN(Date.parse(startDate))) {
        query = query.gte("created_at", new Date(startDate).toISOString());
      }
      if (endDate && !Number.isNaN(Date.parse(endDate))) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }
    }

    // Handle CSV Export Stream (keyset-bounded up to 5,000 filtered rows, CSV-injection safe)
    if (exportCsv) {
      const { data: exportData, error: expErr } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(5000);

      if (expErr || !exportData) {
        return NextResponse.json({ error: "Failed to export transactions" }, { status: 500 });
      }

      const headers = [
        "ID",
        "Date",
        "Reference",
        "User Email",
        "Type",
        "Amount (NGN)",
        "Status",
        "Description",
        "Destination/Gateway",
      ];
      const rows = exportData.map((tx: any) => {
        const meta = tx.metadata || {};
        const dest = meta.bankName
          ? `${meta.bankName} - ${meta.accountNumber} (${meta.accountName || ""})`
          : meta.gateway || meta.provider || "";
        return [
          escapeCsvCell(tx.id),
          escapeCsvCell(tx.created_at ? new Date(tx.created_at).toISOString() : ""),
          escapeCsvCell(tx.reference || ""),
          escapeCsvCell(tx.user_email || ""),
          escapeCsvCell(tx.type || ""),
          escapeCsvCell(tx.amount ?? 0),
          escapeCsvCell(tx.status || ""),
          escapeCsvCell(tx.description || ""),
          escapeCsvCell(dest),
        ].join(",");
      });

      const csvContent = [headers.join(","), ...rows].join("\n");
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="Paayh_Master_Statement_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // Execute Indexed Keyset Cursor or Offset Paginated Query
    let transactions: any[] | null = null;
    let totalCount: number | null = 0;
    let fetchErr: any = null;
    let nextCursor: string | null = null;
    let hasMore = false;

    if (cursor) {
      const [cursorCreatedAt, cursorId] = cursor.split("|");
      if (cursorCreatedAt && !Number.isNaN(Date.parse(cursorCreatedAt))) {
        if (cursorId) {
          query = query.or(
            `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${sanitizeFilterInput(cursorId)})`
          );
        } else {
          query = query.lt("created_at", cursorCreatedAt);
        }
      }
      const res = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit + 1);
      fetchErr = res.error;
      totalCount = res.count ?? 0;
      const rows = res.data || [];
      hasMore = rows.length > limit;
      transactions = hasMore ? rows.slice(0, limit) : rows;
      if (hasMore && transactions.length > 0) {
        const last = transactions[transactions.length - 1];
        nextCursor = `${last.created_at}|${last.id}`;
      }
    } else {
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      const res = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      transactions = res.data;
      totalCount = res.count ?? 0;
      fetchErr = res.error;
      hasMore = from + (transactions?.length || 0) < (totalCount || 0);
      if (hasMore && transactions && transactions.length > 0) {
        const last = transactions[transactions.length - 1];
        nextCursor = `${last.created_at}|${last.id}`;
      }
    }

    if (fetchErr) {
      console.error("❌ Error fetching master platform transactions:", fetchErr);
      return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
    }

    // Summary Financial Metrics via SQL RPC (Cached in Redis for 60s; zero large JS row scans)
    const metricsCacheKey = "admin:master_statement:metrics";
    let cachedMetrics = null;
    try {
      const raw = await redisConnection.get(metricsCacheKey);
      if (raw) cachedMetrics = JSON.parse(raw);
    } catch {}

    if (!cachedMetrics) {
      try {
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("get_master_statement_metrics");

        if (!rpcErr && rpcData) {
          cachedMetrics = {
            totalInflows: Number(rpcData.totalInflows || 0),
            totalOutflows: Number(rpcData.totalOutflows || 0),
            netPlatformFlow: Number(rpcData.netPlatformFlow || 0),
            totalSuccessfulCount: Number(rpcData.totalSuccessfulCount || 0),
          };
          await redisConnection.set(metricsCacheKey, JSON.stringify(cachedMetrics), "EX", 60).catch(() => {});
        } else {
          console.warn("⚠️ get_master_statement_metrics RPC unavailable:", rpcErr?.message);
          // Count-only indexed head query (never pulls 10k rows into JS)
          const { count: successCount } = await supabaseAdmin
            .from("payments")
            .select("id", { count: "exact", head: true })
            .eq("status", "success");

          cachedMetrics = {
            totalInflows: 0,
            totalOutflows: 0,
            netPlatformFlow: 0,
            totalSuccessfulCount: successCount || 0,
            metricsDegraded: true,
          };
        }
      } catch {
        cachedMetrics = {
          totalInflows: 0,
          totalOutflows: 0,
          netPlatformFlow: 0,
          totalSuccessfulCount: 0,
          metricsDegraded: true,
        };
      }
    }

    return NextResponse.json({
      success: true,
      transactions: transactions || [],
      pagination: {
        page,
        limit,
        totalCount: totalCount || 0,
        totalPages: Math.max(1, Math.ceil((totalCount || 0) / limit)),
        nextCursor,
        hasMore,
      },
      metrics: cachedMetrics,
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/admin/transactions:", err);
    return NextResponse.json({ error: err.message || "Failed to load master statement" }, { status: 500 });
  }
}
