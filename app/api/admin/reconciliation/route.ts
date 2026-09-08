import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

// Helper to check if email is admin
async function isAdmin(email: string): Promise<boolean> {
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());
  if (adminEmails.includes(email.toLowerCase())) return true;

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("role, is_admin")
    .ilike("email", email)
    .maybeSingle();

  return user?.role === "admin" || user?.is_admin === true;
}

// Proactive cache invalidator for reconciliation metrics, treasury, and paginated pages
async function invalidateReconciliationCaches() {
  try {
    const keysToDelete = [
      "admin:reconciliation:metrics_cache",
      "admin:reconciliation:treasury_and_summary",
      "admin:reconciliation:forfeited_page_ALL_10",
      "admin:reconciliation:forfeited_page_ALL_20",
      "admin:reconciliation:forfeited_page_PENDING_10",
      "admin:reconciliation:forfeited_page_PENDING_20",
      "admin:reconciliation:forfeited_page_RESOLVED_10",
      "admin:reconciliation:forfeited_page_RESOLVED_20",
    ];
    await Promise.all(keysToDelete.map((k) => redisConnection.del(k).catch(() => 0)));
  } catch {}
}

export async function GET(req: NextRequest) {
  try {
    const userEmail = await getAuthenticatedEmail(req);
    if (!userEmail || !(await isAdmin(userEmail))) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }

    // Fetch reconciliation logs
    const { data: logs } = await supabaseAdmin
      .from("system_reconciliation_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    // Fetch system P2P transfers pause state from Redis (Sub-millisecond)
    let isPausedRaw: string | null = null;
    try {
      isPausedRaw = await redisConnection.get("system:transfers_paused");
    } catch {
      isPausedRaw = null;
    }

    let transfersPaused = isPausedRaw === "true" || isPausedRaw === "1";

    // If Redis is not connected or returned null, check DB admin audit log
    if (isPausedRaw === null) {
      try {
        const { data: latestAudit } = await supabaseAdmin
          .from("admin_audit_logs")
          .select("new_state")
          .in("action", ["toggle_emergency_p2p_pause", "auto_trip_emergency_circuit_breaker"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestAudit?.new_state?.transfers_paused !== undefined) {
          transfersPaused = Boolean(latestAudit.new_state.transfers_paused);
        }
      } catch {}
    }

    const fresh = req.nextUrl.searchParams.get("fresh") === "true";
    const cacheKey = "admin:reconciliation:metrics_cache";

    // Try Redis cache for audit metrics unless fresh scan requested
    let metrics = null;
    if (!fresh) {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) metrics = JSON.parse(cached);
      } catch {}
    }

    if (!metrics) {
      // Compute wallet totals via high-performance database RPC (Zero-memory database calculation)
      metrics = {
        total_sent_naira: 0,
        total_received_naira: 0,
        variance_naira: 0,
        status: "HEALTHY",
      };

      const { data: rpcMetrics, error: rpcErr } = await supabaseAdmin.rpc("get_admin_reconciliation_metrics");
      if (!rpcErr && rpcMetrics) {
        metrics = rpcMetrics;
      } else {
        console.warn("⚠️ get_admin_reconciliation_metrics RPC fallback triggered:", rpcErr?.message);
        // Fallback: bounded query to avoid full memory blowout
        const [{ data: sentSample }, { data: rcvSample }] = await Promise.all([
          supabaseAdmin.from("payments").select("amount").eq("type", "transfer_sent").eq("status", "success").limit(1000),
          supabaseAdmin.from("payments").select("amount").eq("type", "transfer_received").eq("status", "success").limit(1000),
        ]);
        const sentTotal = (sentSample || []).reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
        const rcvTotal = (rcvSample || []).reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
        metrics = {
          total_sent_naira: sentTotal,
          total_received_naira: rcvTotal,
          variance_naira: Math.abs(sentTotal - rcvTotal),
          status: Math.abs(sentTotal - rcvTotal) === 0 ? "HEALTHY" : "FLAGGED",
        };
      }

      // Cache metrics in Redis for 60 seconds to support 100M+ query volume
      // Cache metrics in Redis for 60 seconds to support 100M+ query volume
      try {
        await redisConnection.set(cacheKey, JSON.stringify(metrics), "EX", 60);
      } catch {}
    }

    // ------------------------------------------------------------------------
    // HIGH-VOLUME FORFEITED BALANCES: CACHED AGGREGATES & PAGINATED QUERIES
    // ------------------------------------------------------------------------
    const forfeitPage = Math.max(1, parseInt(req.nextUrl.searchParams.get("forfeitPage") || "1", 10));
    const forfeitLimit = Math.min(Math.max(1, parseInt(req.nextUrl.searchParams.get("forfeitLimit") || "20", 10)), 100);
    const forfeitStatus = (req.nextUrl.searchParams.get("forfeitStatus") || "ALL").toUpperCase();
    const forfeitSearch = req.nextUrl.searchParams.get("forfeitSearch")?.trim().toLowerCase() || "";

    // 1. Fetch Platform Treasury & Aggregate Summary (Cached in Redis for 60s)
    const summaryCacheKey = "admin:reconciliation:treasury_and_summary";
    let treasurySummary: {
      platformTreasury: { balance: number; total_forfeited_absorbed: number };
      pendingForfeituresCount: number;
      pendingForfeituresTotal: number;
    } | null = null;

    if (!fresh) {
      try {
        const cachedSummary = await redisConnection.get(summaryCacheKey);
        if (cachedSummary) {
          treasurySummary = JSON.parse(cachedSummary);
        }
      } catch {}
    }

    if (!treasurySummary) {
      let platformTreasury = { balance: 0, total_forfeited_absorbed: 0 };
      let pendingForfeituresCount = 0;
      let pendingForfeituresTotal = 0;

      try {
        const [{ data: tData }, { data: rpcSummary, error: rpcSumErr }] = await Promise.all([
          supabaseAdmin
            .from("platform_treasury")
            .select("balance, total_forfeited_absorbed")
            .eq("id", "primary")
            .maybeSingle(),
          supabaseAdmin.rpc("get_forfeited_balances_summary"),
        ]);

        if (tData) {
          platformTreasury = {
            balance: Number(tData.balance) || 0,
            total_forfeited_absorbed: Number(tData.total_forfeited_absorbed) || 0,
          };
        }

        if (!rpcSumErr && rpcSummary) {
          pendingForfeituresCount = Number(rpcSummary.pending_count) || 0;
          pendingForfeituresTotal = Number(rpcSummary.pending_total) || 0;
        } else {
          // Bounded indexed fallback
          const { count, data } = await supabaseAdmin
            .from("forfeited_balances")
            .select("amount", { count: "exact" })
            .eq("status", "PENDING")
            .limit(1000);

          pendingForfeituresCount = count || 0;
          pendingForfeituresTotal = (data || []).reduce((acc: number, f: any) => acc + (parseFloat(f.amount) || 0), 0);
        }

        treasurySummary = {
          platformTreasury,
          pendingForfeituresCount,
          pendingForfeituresTotal,
        };

        // Cache in Redis for 60 seconds
        try {
          await redisConnection.set(summaryCacheKey, JSON.stringify(treasurySummary), "EX", 60);
        } catch {}
      } catch (fErr) {
        console.warn("⚠️ Forfeited balances summary warning:", fErr);
        treasurySummary = {
          platformTreasury: { balance: 0, total_forfeited_absorbed: 0 },
          pendingForfeituresCount: 0,
          pendingForfeituresTotal: 0,
        };
      }
    }

    // 2. Fetch Paginated Records via Bounded Database Query with Index Scan
    let forfeitedBalances: any[] = [];
    let forfeituresTotalCount = 0;
    let forfeituresTotalPages = 1;

    // Cache default first page for 30 seconds for ultra-fast sub-millisecond loads
    const pageCacheKey = (!fresh && !forfeitSearch && forfeitPage === 1)
      ? `admin:reconciliation:forfeited_page_${forfeitStatus}_${forfeitLimit}`
      : null;

    let hasCachedPage = false;
    if (pageCacheKey) {
      try {
        const cachedPage = await redisConnection.get(pageCacheKey);
        if (cachedPage) {
          const parsed = JSON.parse(cachedPage);
          forfeitedBalances = parsed.forfeitedBalances || [];
          forfeituresTotalCount = parsed.forfeituresTotalCount || 0;
          forfeituresTotalPages = parsed.forfeituresTotalPages || 1;
          hasCachedPage = true;
        }
      } catch {}
    }

    if (!hasCachedPage) {
      try {
        const from = (forfeitPage - 1) * forfeitLimit;
        const to = from + forfeitLimit - 1;

        let query = supabaseAdmin
          .from("forfeited_balances")
          .select("id, user_email, username, amount, currency, reason, status, resolved_at, resolved_by, resolution_notes, created_at", { count: "exact" });

        if (forfeitStatus === "PENDING" || forfeitStatus === "RESOLVED" || forfeitStatus === "REVERSED") {
          query = query.eq("status", forfeitStatus);
        }

        if (forfeitSearch) {
          query = query.or(`user_email.ilike.%${forfeitSearch}%,username.ilike.%${forfeitSearch}%`);
        }

        const { data: fList, count: totalCount, error: listErr } = await query
          .order("created_at", { ascending: false })
          .range(from, to);

        if (!listErr && fList) {
          forfeitedBalances = fList;
          forfeituresTotalCount = totalCount || 0;
          forfeituresTotalPages = Math.max(1, Math.ceil((totalCount || 0) / forfeitLimit));

          if (pageCacheKey) {
            try {
              await redisConnection.set(pageCacheKey, JSON.stringify({
                forfeitedBalances: fList,
                forfeituresTotalCount,
                forfeituresTotalPages,
              }), "EX", 30);
            } catch {}
          }
        }
      } catch (listCatchErr) {
        console.warn("⚠️ Forfeited balances paginated fetch warning:", listCatchErr);
      }
    }

    return NextResponse.json({
      success: true,
      transfersPaused,
      metrics,
      logs: logs || [],
      forfeitedBalances,
      forfeituresPagination: {
        page: forfeitPage,
        limit: forfeitLimit,
        totalCount: forfeituresTotalCount,
        totalPages: forfeituresTotalPages,
        status: forfeitStatus,
      },
      platformTreasury: treasurySummary.platformTreasury,
      pendingForfeituresCount: treasurySummary.pendingForfeituresCount,
      pendingForfeituresTotal: treasurySummary.pendingForfeituresTotal,
    });
  } catch (err: any) {
    console.error("❌ GET /api/admin/reconciliation error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch reconciliation state" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userEmail = await getAuthenticatedEmail(req);
    if (!userEmail || !(await isAdmin(userEmail))) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }

    const body = await req.json();
    const { action, logId, notes } = body;

    if (action === "toggle_pause") {
      let isPausedRaw: string | null = null;
      try {
        isPausedRaw = await redisConnection.get("system:transfers_paused");
      } catch {
        isPausedRaw = null;
      }

      let currentState = isPausedRaw === "true" || isPausedRaw === "1";

      // If Redis is not connected or returned null, check DB admin audit log
      if (isPausedRaw === null) {
        try {
          const { data: latestAudit } = await supabaseAdmin
            .from("admin_audit_logs")
            .select("new_state")
            .in("action", ["toggle_emergency_p2p_pause", "auto_trip_emergency_circuit_breaker"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestAudit?.new_state?.transfers_paused !== undefined) {
            currentState = Boolean(latestAudit.new_state.transfers_paused);
          }
        } catch {}
      }

      const newState = !currentState;

      try {
        await redisConnection.set("system:transfers_paused", newState ? "true" : "false");
      } catch (redisErr) {
        console.warn("⚠️ Redis toggle_pause set warning:", redisErr);
      }
      console.log(`🔒 Admin ${userEmail} toggled P2P transfers pause to: ${newState}`);

      // Record audit log entry
      try {
        await supabaseAdmin.from("admin_audit_logs").insert([{
          admin_email: userEmail.toLowerCase(),
          action: "toggle_emergency_p2p_pause",
          previous_state: { transfers_paused: currentState },
          new_state: { transfers_paused: newState },
          reason: newState ? "Emergency Pause Triggered by Admin" : "Emergency Pause Lifted by Admin",
        }]);
      } catch {}

      return NextResponse.json({
        success: true,
        transfersPaused: newState,
        message: newState ? "P2P Transfers Emergency Paused" : "P2P Transfers Resumed",
      });
    }

    if (action === "resolve_issue") {
      if (!logId) {
        return NextResponse.json({ error: "Missing logId" }, { status: 400 });
      }

      const { error: updateErr } = await supabaseAdmin
        .from("system_reconciliation_logs")
        .update({
          status: "RESOLVED",
          notes: `Resolved by ${userEmail}: ${notes || "No extra notes provided"}`,
        })
        .eq("id", logId);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      // Record audit log entry
      try {
        await supabaseAdmin.from("admin_audit_logs").insert([{
          admin_email: userEmail.toLowerCase(),
          action: "resolve_reconciliation_log",
          target_id: logId,
          target_type: "reconciliation_log",
          reason: notes || "Discrepancy reviewed and resolved",
        }]);
      } catch {}

      return NextResponse.json({ success: true, message: "Reconciliation issue marked as resolved" });
    }

    if (action === "resolve_forfeiture") {
      const { forfeitureId } = body;
      if (!forfeitureId) {
        return NextResponse.json({ error: "Missing forfeitureId parameter" }, { status: 400 });
      }

      // 1. Try atomic Postgres RPC first
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("resolve_forfeited_balance", {
        p_admin_email: userEmail,
        p_forfeiture_id: forfeitureId,
        p_notes: notes || "Resolved to platform balance by admin",
      });

      if (!rpcErr && rpcRes && rpcRes.success) {
        await invalidateReconciliationCaches();
        return NextResponse.json(rpcRes);
      }

      if (rpcErr && rpcErr.message && !rpcErr.message.includes("does not exist") && !rpcErr.message.includes("could not find function")) {
        return NextResponse.json({ error: rpcErr.message }, { status: 400 });
      }

      // 2. Direct Database Fallback if RPC function not yet deployed in Supabase
      const { data: forfeiture, error: fFetchErr } = await supabaseAdmin
        .from("forfeited_balances")
        .select("*")
        .eq("id", forfeitureId)
        .maybeSingle();

      if (fFetchErr || !forfeiture) {
        return NextResponse.json({ error: "Forfeited balance record not found." }, { status: 404 });
      }

      if (forfeiture.status !== "PENDING") {
        return NextResponse.json({ error: `This forfeiture has already been resolved (Status: ${forfeiture.status}).` }, { status: 400 });
      }

      const amountNum = parseFloat(forfeiture.amount) || 0;
      const ref = `FORFEIT-RES-${forfeitureId.slice(0, 8)}-${Date.now()}`;

      // Credit platform treasury
      const { data: prevTreasury } = await supabaseAdmin
        .from("platform_treasury")
        .select("balance, total_forfeited_absorbed")
        .eq("id", "primary")
        .maybeSingle();

      const oldBal = parseFloat(prevTreasury?.balance || 0);
      const oldAbsorbed = parseFloat(prevTreasury?.total_forfeited_absorbed || 0);
      const newBal = oldBal + amountNum;
      const newAbsorbed = oldAbsorbed + amountNum;

      await supabaseAdmin
        .from("platform_treasury")
        .upsert({
          id: "primary",
          balance: newBal,
          total_forfeited_absorbed: newAbsorbed,
          updated_at: new Date().toISOString(),
        });

      // Mark forfeiture as resolved
      await supabaseAdmin
        .from("forfeited_balances")
        .update({
          status: "RESOLVED",
          resolved_at: new Date().toISOString(),
          resolved_by: userEmail.toLowerCase().trim(),
          resolution_notes: notes || "Resolved to platform balance by admin",
        })
        .eq("id", forfeitureId);

      // Record in payments
      try {
        await supabaseAdmin.from("payments").insert([{
          user_email: "platform@paayh.com",
          amount: amountNum,
          type: "forfeited_balance_resolution",
          status: "success",
          reference: ref,
          metadata: {
            forfeiture_id: forfeitureId,
            source_user_email: forfeiture.user_email,
            resolved_by: userEmail.toLowerCase().trim(),
            notes: notes || "Resolved to platform balance",
          }
        }]);
      } catch {}

      // Record in ledger_entries
      try {
        await supabaseAdmin.from("ledger_entries").insert([{
          reference: ref,
          sender_email: forfeiture.user_email,
          recipient_email: "platform@paayh.com",
          amount_kobo: Math.round(amountNum * 100),
          entry_type: "CREDIT",
          status: "POSTED",
          metadata: {
            forfeiture_id: forfeitureId,
            resolved_by: userEmail.toLowerCase().trim(),
            notes,
          }
        }]);
      } catch {}

      // Record in admin_audit_logs
      try {
        await supabaseAdmin.from("admin_audit_logs").insert([{
          admin_email: userEmail.toLowerCase().trim(),
          action: "resolve_forfeited_balance",
          target_id: forfeitureId,
          target_type: "forfeited_balance",
          reason: notes || "Resolved deactivated account forfeited balance to platform treasury",
          previous_state: {
            status: "PENDING",
            amount: amountNum,
            user_email: forfeiture.user_email,
            platform_treasury_before: oldBal,
          },
          new_state: {
            status: "RESOLVED",
            amount: amountNum,
            resolved_by: userEmail.toLowerCase().trim(),
            resolved_at: new Date().toISOString(),
            platform_treasury_after: newBal,
            reference: ref,
          }
        }]);
      } catch {}

      // Proactively invalidate Redis caches
      await invalidateReconciliationCaches();

      return NextResponse.json({
        success: true,
        message: `Forfeited balance of ₦${amountNum.toLocaleString("en-NG", { minimumFractionDigits: 2 })} successfully resolved to platform balance.`,
        forfeiture_id: forfeitureId,
        amount: amountNum,
        platform_balance: newBal,
        reference: ref,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("❌ POST /api/admin/reconciliation error:", err);
    return NextResponse.json({ error: err.message || "Failed to execute reconciliation action" }, { status: 500 });
  }
}
