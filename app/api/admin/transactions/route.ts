// app/api/admin/transactions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminUser } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized access: Admin privilege required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "25", 10)), 100);
    const type = (searchParams.get("type") || "all").toLowerCase();
    const status = (searchParams.get("status") || "all").toLowerCase();
    const search = searchParams.get("search")?.trim() || "";
    const email = searchParams.get("email")?.trim() || "";
    const reference = searchParams.get("reference")?.trim() || "";
    const year = searchParams.get("year")?.trim() || "";
    const startDate = searchParams.get("startDate")?.trim() || "";
    const endDate = searchParams.get("endDate")?.trim() || "";
    const exportCsv = searchParams.get("exportCsv") === "true";

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Build base query
    let query = supabaseAdmin
      .from("payments")
      .select("id, user_email, reference, amount, type, status, description, metadata, created_at", { count: "exact" });

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
    if (email) {
      query = query.ilike("user_email", `%${email}%`);
    }

    if (reference) {
      query = query.eq("reference", reference);
    }

    // 4. General Search
    if (search && !reference && !email) {
      query = query.or(`user_email.ilike.%${search}%,reference.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // 5. Date / Year Ranges
    if (year) {
      const startOfYear = `${year}-01-01T00:00:00.000Z`;
      const endOfYear = `${year}-12-31T23:59:59.999Z`;
      query = query.gte("created_at", startOfYear).lte("created_at", endOfYear);
    } else {
      if (startDate) {
        query = query.gte("created_at", new Date(startDate).toISOString());
      }
      if (endDate) {
        // Include full day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }
    }

    // Handle CSV Export Stream (up to 5,000 filtered rows without pagination)
    if (exportCsv) {
      const { data: exportData, error: expErr } = await query
        .order("created_at", { ascending: false })
        .limit(5000);

      if (expErr || !exportData) {
        return NextResponse.json({ error: "Failed to export transactions" }, { status: 500 });
      }

      const headers = ["ID", "Date", "Reference", "User Email", "Type", "Amount (NGN)", "Status", "Description", "Destination/Gateway"];
      const rows = exportData.map((tx: any) => {
        const meta = tx.metadata || {};
        const dest = meta.bankName ? `${meta.bankName} - ${meta.accountNumber} (${meta.accountName || ""})` : (meta.gateway || meta.provider || "");
        return [
          `"${tx.id}"`,
          `"${new Date(tx.created_at).toISOString()}"`,
          `"${tx.reference || ""}"`,
          `"${tx.user_email || ""}"`,
          `"${tx.type || ""}"`,
          `"${tx.amount || 0}"`,
          `"${tx.status || ""}"`,
          `"${(tx.description || "").replace(/"/g, '""')}"`,
          `"${dest.replace(/"/g, '""')}"`,
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

    // Execute Paginated Query
    const { data: transactions, count: totalCount, error: fetchErr } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (fetchErr) {
      console.error("❌ Error fetching master platform transactions:", fetchErr);
      return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
    }

    // Summary Financial Metrics (Cached in Redis for 60s)
    const metricsCacheKey = "admin:master_statement:metrics";
    let cachedMetrics = null;
    try {
      const raw = await redisConnection.get(metricsCacheKey);
      if (raw) cachedMetrics = JSON.parse(raw);
    } catch {}

    if (!cachedMetrics) {
      try {
        // Try ultra-fast PostgreSQL RPC aggregation first
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("get_master_statement_metrics");

        if (!rpcErr && rpcData) {
          cachedMetrics = {
            totalInflows: Number(rpcData.totalInflows || 0),
            totalOutflows: Number(rpcData.totalOutflows || 0),
            netPlatformFlow: Number(rpcData.netPlatformFlow || 0),
            totalSuccessfulCount: Number(rpcData.totalSuccessfulCount || 0),
          };
        } else {
          // Graceful fallback if RPC function has not been applied yet
          const [totalInflowRes, totalOutflowRes, totalSuccessRes] = await Promise.all([
            supabaseAdmin
              .from("payments")
              .select("amount")
              .neq("type", "withdrawal")
              .neq("type", "transfer_sent")
              .eq("status", "success")
              .limit(10000),
            supabaseAdmin
              .from("payments")
              .select("amount")
              .eq("type", "withdrawal")
              .eq("status", "success")
              .limit(10000),
            supabaseAdmin
              .from("payments")
              .select("id", { count: "exact" })
              .eq("status", "success"),
          ]);

          const totalInflows = (totalInflowRes.data || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
          const totalOutflows = (totalOutflowRes.data || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
          const totalSuccessfulCount = totalSuccessRes.count || 0;

          cachedMetrics = {
            totalInflows,
            totalOutflows,
            netPlatformFlow: totalInflows - totalOutflows,
            totalSuccessfulCount,
          };
        }

        await redisConnection.set(metricsCacheKey, JSON.stringify(cachedMetrics), "EX", 60);
      } catch (mErr) {
        cachedMetrics = { totalInflows: 0, totalOutflows: 0, netPlatformFlow: 0, totalSuccessfulCount: 0 };
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
      },
      metrics: cachedMetrics,
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/admin/transactions:", err);
    return NextResponse.json({ error: err.message || "Failed to load master statement" }, { status: 500 });
  }
}
