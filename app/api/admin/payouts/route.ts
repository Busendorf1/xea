// app/api/admin/payouts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminUser } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { PayoutProvider, PayoutGateway } from "@/lib/payment/payoutProvider";
import { KoraService } from "@/lib/payment/kora";
import redisConnection from "@/lib/redis";
import { invalidateCachedProfile } from "@/lib/utils/cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized access: Admin privilege required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "20", 10)), 100);
    const status = (searchParams.get("status") || "all").toLowerCase();
    const search = searchParams.get("search")?.trim() || "";

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Base query for withdrawals
    let query = supabaseAdmin
      .from("payments")
      .select("*", { count: "exact" })
      .eq("type", "withdrawal");

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(`user_email.ilike.%${search}%,reference.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: payouts, count: totalCount, error: fetchErr } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (fetchErr) {
      console.error("❌ Error fetching admin payouts:", fetchErr);
      return NextResponse.json({ error: "Failed to fetch payouts" }, { status: 500 });
    }

    // Real-time Gateway Float & Queue Counts
    const activeGateway: PayoutGateway = PayoutProvider.getActiveGateway();
    const refresh = searchParams.get("refresh") === "true";
    let floatBalance = 0;
    try {
      if (activeGateway === "kora") {
        floatBalance = await KoraService.getNairaBalance(refresh);
      }
    } catch (balErr) {
      console.warn("⚠️ Failed to check gateway float for admin:", balErr);
    }

    // Fast count summaries (Cached in Redis for 15s to keep pagination instant)
    const countsCacheKey = "admin:payouts:count_summaries";
    let countMetrics = null;
    if (!refresh) {
      try {
        const raw = await redisConnection.get(countsCacheKey);
        if (raw) countMetrics = JSON.parse(raw);
      } catch {}
    }

    if (!countMetrics) {
      const [queuedRes, failedRes, pendingRes, processingRes] = await Promise.all([
        supabaseAdmin.from("payments").select("amount", { count: "exact" }).eq("type", "withdrawal").eq("status", "queued").limit(1000),
        supabaseAdmin.from("payments").select("id", { count: "exact" }).eq("type", "withdrawal").eq("status", "failed").limit(1),
        supabaseAdmin.from("payments").select("id", { count: "exact" }).eq("type", "withdrawal").eq("status", "pending").limit(1),
        supabaseAdmin.from("payments").select("id", { count: "exact" }).eq("type", "withdrawal").eq("status", "processing").limit(1),
      ]);

      const queuedCount = queuedRes.count || 0;
      const failedCount = failedRes.count || 0;
      const pendingCount = pendingRes.count || 0;
      const processingCount = processingRes.count || 0;
      const totalQueuedAmount = (queuedRes.data || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

      countMetrics = {
        queuedCount,
        failedCount,
        pendingCount,
        processingCount,
        totalQueuedAmount,
      };

      try {
        await redisConnection.set(countsCacheKey, JSON.stringify(countMetrics), "EX", 15);
      } catch {}
    }

    const { queuedCount, failedCount, pendingCount, processingCount, totalQueuedAmount } = countMetrics;

    return NextResponse.json({
      success: true,
      payouts: payouts || [],
      pagination: {
        page,
        limit,
        totalCount: totalCount || 0,
        totalPages: Math.max(1, Math.ceil((totalCount || 0) / limit)),
        status,
      },
      metrics: {
        floatBalance,
        activeGateway,
        queuedCount,
        failedCount,
        pendingCount,
        processingCount,
        totalQueuedAmount,
      },
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/admin/payouts:", err);
    return NextResponse.json({ error: err.message || "Failed to load payouts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized access: Admin privilege required." }, { status: 403 });
    }

    const body = await req.json();
    const { action, reference, references, allowTestMode, simulate } = body;
    const isTestMode = allowTestMode === true || simulate === true;

    const invalidatePayoutCaches = async () => {
      await KoraService.invalidateBalanceCache();
      try {
        await redisConnection.del("admin:payouts:count_summaries");
      } catch {}
    };

    // -------------------------------------------------------------------------
    // ACTION 1: MANUAL BATCH DISPATCH (Process all queued & pending payouts)
    // -------------------------------------------------------------------------
    if (action === "process_all_queued") {
      const activeGateway = PayoutProvider.getActiveGateway();
      let floatBalance = Infinity;

      if (activeGateway === "kora" && !isTestMode) {
        try {
          floatBalance = await KoraService.getNairaBalance();
          if (floatBalance <= 0) {
            return NextResponse.json({
              error: "Cannot process payouts: Kora float balance is ₦0.00. Please top up your Kora balance first or use Test Mode.",
              floatBalance: 0,
              canSimulate: true,
            }, { status: 400 });
          }
        } catch (balErr: any) {
          return NextResponse.json({ 
            error: `Could not verify Kora balance: ${balErr?.message}`,
            canSimulate: true 
          }, { status: 500 });
        }
      }

      // Fetch queued and pending items
      const { data: queuedPayments, error: fetchErr } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("type", "withdrawal")
        .in("status", ["queued", "pending"])
        .order("created_at", { ascending: true })
        .limit(100);

      if (fetchErr || !queuedPayments || queuedPayments.length === 0) {
        return NextResponse.json({ success: true, message: "No queued or pending payouts found to process." });
      }

      let processedCount = 0;
      let heldCount = 0;
      let runningTotal = 0;

      for (const payment of queuedPayments) {
        const rawAmount = parseFloat(payment.amount);
        const netDisburseAmount = payment.metadata?.net_amount ?? Math.max(0, rawAmount - 35);
        const { bankCode, accountNumber, accountName } = payment.metadata || {};

        if (!bankCode || !accountNumber) {
          continue;
        }

        // Check if float allows this disbursement
        if (runningTotal + netDisburseAmount > floatBalance) {
          heldCount++;
          continue;
        }

        try {
          console.log(`🏦 Admin Manual Payout (${isTestMode ? "TEST MODE" : "LIVE"}): Disbursing ref=${payment.reference} netAmount=₦${netDisburseAmount}`);
          let pStatus = "processing";
          let gatewayRef = "";

          if (isTestMode) {
            pStatus = "success";
            gatewayRef = `test_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          } else {
            const payoutRes = await PayoutProvider.initiatePayout({
              reference: payment.reference,
              amount: netDisburseAmount,
              bankCode,
              accountNumber,
              accountName: accountName || "Paayh User",
              customerEmail: payment.user_email,
              narration: `Paayh Withdrawal to ${accountName || "User"}`,
            });
            pStatus = payoutRes.status === "success" ? "success" : "processing";
            gatewayRef = payoutRes.reference || payment.reference;
          }

          await supabaseAdmin
            .from("payments")
            .update({
              status: pStatus,
              metadata: {
                ...payment.metadata,
                gateway_status: pStatus,
                gateway_reference: gatewayRef,
                manual_admin_dispatched_at: new Date().toISOString(),
                dispatched_by: admin.email,
                simulated_test: isTestMode,
              },
            })
            .eq("id", payment.id);

          // If success, clear user withdrawal escrow hold
          if (pStatus === "success") {
            const { data: userProfile } = await supabaseAdmin
              .from("users")
              .select("withdrawal")
              .ilike("email", payment.user_email)
              .maybeSingle();

            if (userProfile) {
              const currentEscrow = parseFloat(userProfile.withdrawal || 0);
              const newEscrow = Math.max(0, currentEscrow - rawAmount);
              await supabaseAdmin
                .from("users")
                .update({ withdrawal: newEscrow })
                .ilike("email", payment.user_email);
              await invalidateCachedProfile(payment.user_email);
            }
          }

          runningTotal += netDisburseAmount;
          processedCount++;
        } catch (payoutErr: any) {
          console.warn(`⚠️ Failed to disburse payout ${payment.reference}:`, payoutErr?.message);
          // Keep safely queued for retry
          await supabaseAdmin
            .from("payments")
            .update({
              status: "queued",
              metadata: {
                ...payment.metadata,
                queued_reason: payoutErr?.message || "Gateway temporarily throttled",
                last_retry_at: new Date().toISOString(),
              },
            })
            .eq("id", payment.id);
        }
      }

      await invalidatePayoutCaches();

      return NextResponse.json({
        success: true,
        message: isTestMode
          ? `Manual test payout batch completed! Settled: ${processedCount} withdrawals in Test Simulation Mode.`
          : `Manual payout batch finished. Dispatched: ${processedCount}, Held due to float/limits: ${heldCount}.`,
        processedCount,
        heldCount,
        floatBalance,
        isTestMode,
      });
    }

    // -------------------------------------------------------------------------
    // ACTION 2: RETRY SPECIFIC PAYOUT BY REFERENCE
    // -------------------------------------------------------------------------
    if (action === "retry_single") {
      if (!reference) {
        return NextResponse.json({ error: "Transaction reference is required." }, { status: 400 });
      }

      const { data: payment, error: fetchErr } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("reference", reference)
        .eq("type", "withdrawal")
        .maybeSingle();

      if (fetchErr || !payment) {
        return NextResponse.json({ error: `Withdrawal with reference "${reference}" not found.` }, { status: 404 });
      }

      const withdrawAmount = parseFloat(payment.amount);
      const userEmail = payment.user_email;
      const { bankCode, accountNumber, accountName, bankName } = payment.metadata || {};

      if (!bankCode || !accountNumber) {
        return NextResponse.json({ error: "Missing destination bank details in payment record." }, { status: 400 });
      }

      // If the payment was previously marked failed, check if the funds were refunded to user balance
      if (payment.status === "failed") {
        const { data: user } = await supabaseAdmin
          .from("users")
          .select("balance, withdrawal")
          .ilike("email", userEmail)
          .maybeSingle();

        if (!user) {
          return NextResponse.json({ error: "User account not found." }, { status: 404 });
        }

        const currentBalance = parseFloat(user.balance || 0);
        const currentWithdrawal = parseFloat(user.withdrawal || 0);

        // If the balance has the funds, deduct it back to withdrawal escrow
        if (currentBalance >= withdrawAmount) {
          const newBal = currentBalance - withdrawAmount;
          const newWith = currentWithdrawal + withdrawAmount;

          const { error: userUpdateErr } = await supabaseAdmin
            .from("users")
            .update({ balance: newBal, withdrawal: newWith })
            .ilike("email", userEmail)
            .eq("balance", currentBalance);

          if (userUpdateErr) {
            return NextResponse.json({ error: "User balance concurrent update conflict. Please try again." }, { status: 409 });
          }
          await invalidateCachedProfile(userEmail);
        } else if (currentWithdrawal < withdrawAmount) {
          return NextResponse.json({
            error: `User insufficient balance to retry. Current balance is ₦${currentBalance.toLocaleString("en-NG")}.`,
          }, { status: 400 });
        }
      }

      // Attempt disbursement (disburse net amount so user bears the ₦35 fee)
      const netDisburseAmount = payment.metadata?.net_amount ?? Math.max(0, withdrawAmount - 35);
      try {
        console.log(`🏦 Admin Retrying Payout (${isTestMode ? "TEST MODE" : "LIVE"}): ref=${reference} to ${accountNumber} (${bankCode}) netAmount=₦${netDisburseAmount}`);
        let newStatus = "processing";
        let gatewayRef = "";

        if (isTestMode) {
          newStatus = "success";
          gatewayRef = `test_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        } else {
          const payoutRes = await PayoutProvider.initiatePayout({
            reference,
            amount: netDisburseAmount,
            bankCode,
            accountNumber,
            accountName: accountName || "Paayh User",
            customerEmail: userEmail,
            narration: `Paayh Withdrawal to ${accountName || "User"}`,
          });
          newStatus = payoutRes.status === "success" ? "success" : "processing";
          gatewayRef = payoutRes.reference || reference;
        }

        await supabaseAdmin
          .from("payments")
          .update({
            status: newStatus,
            metadata: {
              ...payment.metadata,
              gateway_status: newStatus,
              gateway_reference: gatewayRef,
              admin_retried_at: new Date().toISOString(),
              retried_by: admin.email,
              simulated_test: isTestMode,
            },
          })
          .eq("reference", reference);

        if (newStatus === "success") {
          const { data: userProfile } = await supabaseAdmin
            .from("users")
            .select("withdrawal")
            .ilike("email", userEmail)
            .maybeSingle();

          if (userProfile) {
            const currentEscrow = parseFloat(userProfile.withdrawal || 0);
            const newEscrow = Math.max(0, currentEscrow - withdrawAmount);
            await supabaseAdmin
              .from("users")
              .update({ withdrawal: newEscrow })
              .ilike("email", userEmail);
            await invalidateCachedProfile(userEmail);
          }
        }

        await invalidatePayoutCaches();

        return NextResponse.json({
          success: true,
          message: isTestMode
            ? `Payout [${reference}] settled successfully in Test Simulation Mode!`
            : `Payout successfully dispatched to bank! Current status: ${newStatus}.`,
          status: newStatus,
          reference,
          isTestMode,
        });
      } catch (payoutErr: any) {
        console.warn(`⚠️ Gateway retry failed for ${reference}:`, payoutErr?.message);
        // Put in queued status rather than failing completely
        await supabaseAdmin
          .from("payments")
          .update({
            status: "queued",
            metadata: {
              ...payment.metadata,
              queued_reason: payoutErr?.message || "Retry queued for next window",
              last_retry_at: new Date().toISOString(),
            },
          })
          .eq("reference", reference);

        await invalidatePayoutCaches();

        return NextResponse.json({
          success: true,
          queued: true,
          status: "queued",
          message: `Disbursement was placed in queue due to gateway status: ${payoutErr?.message || "Throttled"}.`,
          reference,
        });
      }
    }

    // -------------------------------------------------------------------------
    // ACTION 3: RETRY BULK PAYOUTS BY REFERENCE LIST
    // -------------------------------------------------------------------------
    if (action === "retry_bulk") {
      const targetRefs: string[] = Array.isArray(references) && references.length > 0 ? references : [];

      let query = supabaseAdmin
        .from("payments")
        .select("*")
        .eq("type", "withdrawal");

      if (targetRefs.length > 0) {
        query = query.in("reference", targetRefs);
      } else {
        query = query.in("status", ["failed", "queued"]);
      }

      const { data: targets, error: targetErr } = await query.limit(50);
      if (targetErr || !targets || targets.length === 0) {
        return NextResponse.json({ success: true, message: "No eligible payouts to retry." });
      }

      let successCount = 0;
      let queuedCount = 0;

      for (const t of targets) {
        const withdrawAmount = parseFloat(t.amount);
        const netDisburseAmount = t.metadata?.net_amount ?? Math.max(0, withdrawAmount - 35);
        const { bankCode, accountNumber, accountName } = t.metadata || {};
        if (!bankCode || !accountNumber) continue;

        try {
          let pStatus = "processing";
          let gRef = "";

          if (isTestMode) {
            pStatus = "success";
            gRef = `test_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          } else {
            const payoutRes = await PayoutProvider.initiatePayout({
              reference: t.reference,
              amount: netDisburseAmount,
              bankCode,
              accountNumber,
              accountName: accountName || "Paayh User",
              customerEmail: t.user_email,
              narration: `Paayh Withdrawal to ${accountName || "User"}`,
            });
            pStatus = payoutRes.status === "success" ? "success" : "processing";
            gRef = payoutRes.reference || t.reference;
          }

          await supabaseAdmin
            .from("payments")
            .update({
              status: pStatus,
              metadata: {
                ...t.metadata,
                gateway_status: pStatus,
                gateway_reference: gRef,
                admin_bulk_retried_at: new Date().toISOString(),
                simulated_test: isTestMode,
              },
            })
            .eq("id", t.id);

          if (pStatus === "success") {
            const { data: userProfile } = await supabaseAdmin
              .from("users")
              .select("withdrawal")
              .ilike("email", t.user_email)
              .maybeSingle();

            if (userProfile) {
              const currentEscrow = parseFloat(userProfile.withdrawal || 0);
              const newEscrow = Math.max(0, currentEscrow - withdrawAmount);
              await supabaseAdmin
                .from("users")
                .update({ withdrawal: newEscrow })
                .ilike("email", t.user_email);
            }
          }

          successCount++;
        } catch {
          await supabaseAdmin
            .from("payments")
            .update({
              status: "queued",
              metadata: {
                ...t.metadata,
                queued_reason: "Bulk retry placed in queue",
                last_retry_at: new Date().toISOString(),
              },
            })
            .eq("id", t.id);

          queuedCount++;
        }
      }

      await invalidatePayoutCaches();

      return NextResponse.json({
        success: true,
        message: isTestMode
          ? `Bulk retry complete in Test Mode. Settled: ${successCount}.`
          : `Bulk retry complete. Dispatched: ${successCount}, Queued: ${queuedCount}.`,
        successCount,
        queuedCount,
        isTestMode,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("❌ Error in POST /api/admin/payouts:", err);
    return NextResponse.json({ error: err.message || "Failed to process admin payout action" }, { status: 500 });
  }
}
