// app/api/cron/process-payouts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PayoutProvider, PayoutGateway } from "@/lib/payment/payoutProvider";
import { KoraService } from "@/lib/payment/kora";
import { PaystackService } from "@/lib/payment/paystack";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

// Kora supports up to 50 payouts per bulk batch; Paystack supports up to 100.
// Setting safe threshold to 45 items per batch.
const BATCH_SIZE = 45;
const COOLDOWN_MS = 5000; // 5 seconds cool-down between batch dispatches

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  const lockKey = "REDIS_LOCK:cron:process_payouts";
  let lockAcquired = false;

  try {
    // 1. Optional security check: verify CRON_SECRET if configured
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn("⚠️ Unauthorized cron trigger attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Acquire Distributed Mutex Lock (TTL 5 minutes)
    try {
      const lockRes = await redisConnection.set(lockKey, "LOCKED", "EX", 300, "NX");
      if (!lockRes) {
        console.warn("⚠️ Payout cron skipped: Previous payout batch job is still running.");
        return NextResponse.json({
          success: true,
          message: "Previous payout cron is currently running. Skipping duplicate trigger.",
        });
      }
      lockAcquired = true;
    } catch (redisLockErr) {
      console.warn("⚠️ Distributed cron lock Redis warning:", redisLockErr);
    }

    // 2. Fetch all pending and queued withdrawals, oldest first
    const { data: pendingPayments, error: fetchErr } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("type", "withdrawal")
      .in("status", ["pending", "queued"])
      .order("created_at", { ascending: true });

    if (fetchErr) {
      console.error("❌ Cron: Error fetching pending payouts:", fetchErr);
      return NextResponse.json({ error: "Failed to fetch payouts" }, { status: 500 });
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      return NextResponse.json({ success: true, message: "No pending or queued payouts to process." });
    }

    const activeGateway: PayoutGateway = PayoutProvider.getActiveGateway();
    console.log(
      `🏦 Cron: Found ${pendingPayments.length} pending/queued payouts. Using gateway: [${activeGateway.toUpperCase()}].`
    );

    // 3. Pre-flight Balance Verification (ensures float is sufficient)
    let eligiblePayments = pendingPayments;
    if (activeGateway === "kora") {
      try {
        const floatBalance = await KoraService.getNairaBalance();
        const totalPending = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        console.log(`💰 Kora Available Float: ₦${floatBalance.toLocaleString()} | Required: ₦${totalPending.toLocaleString()}`);

        if (floatBalance <= 0) {
          console.warn("⚠️ Kora float balance is empty (₦0). Holding all queued withdrawals until merchant funds account.");
          return NextResponse.json({
            success: true,
            message: "Disbursement float balance is ₦0. All withdrawal requests held safely in queue.",
            heldCount: pendingPayments.length,
          });
        }

        if (floatBalance < totalPending) {
          console.warn("⚠️ Insufficient Kora float balance to process all payouts. Batching up to available float.");
          let runningTotal = 0;
          eligiblePayments = [];
          for (const payment of pendingPayments) {
            if (runningTotal + (payment.amount || 0) <= floatBalance) {
              runningTotal += payment.amount || 0;
              eligiblePayments.push(payment);
            } else {
              console.log(`⏳ Holding payout ${payment.reference} in queue (surpasses available float).`);
            }
          }
        }
      } catch (balErr) {
        console.warn("⚠️ Failed to check Kora float balance before dispatch:", balErr);
      }
    }

    if (eligiblePayments.length === 0) {
      return NextResponse.json({ success: true, message: "No payouts eligible within current float limit." });
    }

    // 4. Split eligible payouts into safe chunks
    const chunks = [];
    for (let i = 0; i < eligiblePayments.length; i += BATCH_SIZE) {
      chunks.push(eligiblePayments.slice(i, i + BATCH_SIZE));
    }

    let processedCount = 0;
    let failedCount = 0;

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      console.log(`🏦 Cron: Processing batch ${idx + 1}/${chunks.length} containing ${chunk.length} items via ${activeGateway.toUpperCase()}.`);

      if (activeGateway === "kora") {
        // =========================================================================
        // KORA BULK PAYOUT ENGINE (Primary / Default)
        // Direct disburse from Kora available balance (No recipient creation needed)
        // =========================================================================
        const validPayouts: any[] = [];
        const paymentUpdates: Promise<any>[] = [];

        for (const payment of chunk) {
          const { bankCode, bankName, accountNumber, accountName } = payment.metadata || {};

          if (!bankCode || !accountNumber) {
            console.error(`❌ Cron: Missing bank metadata for payment reference ${payment.reference}`);
            failedCount++;
            paymentUpdates.push(failPayment(payment, "Missing bank details"));
            continue;
          }

          validPayouts.push({
            id: payment.id,
            reference: payment.reference,
            amount: payment.amount,
            bankCode,
            bankName,
            accountNumber,
            accountName: accountName || "Paayh User",
            customerEmail: payment.user_email,
            narration: payment.description || "Paayh Withdrawal",
            metadata: payment.metadata,
          });
        }

        if (validPayouts.length === 1) {
          // Kora bulk requires at least 2 items; for a single withdrawal, use direct instant payout API
          const vp = validPayouts[0];
          const rawAmount = vp.amount;
          const netAmount = vp.metadata?.net_amount ?? Math.max(0, rawAmount - 35);

          try {
            console.log(`🏦 Cron: 1 withdrawal in batch. Dispatching via Kora Single Payout ref=${vp.reference} netAmount=₦${netAmount}`);
            const pRes = await KoraService.initiateSinglePayout({
              reference: vp.reference,
              amount: netAmount,
              bankCode: vp.bankCode,
              accountNumber: vp.accountNumber,
              accountName: vp.accountName,
              customerEmail: vp.customerEmail,
              narration: vp.narration,
            });

            paymentUpdates.push(
              updatePaymentStatus(vp.id, pRes.status === "success" ? "success" : "processing", {
                ...vp.metadata,
                gateway: "kora",
                dispatched_at: new Date().toISOString(),
              })
            );
            processedCount++;
          } catch (singleErr: any) {
            console.error(`❌ Cron: Single payout failed for ${vp.reference}:`, singleErr?.message);
            paymentUpdates.push(
              updatePaymentStatus(vp.id, "queued", {
                ...vp.metadata,
                hold_reason: singleErr?.message || "Held for retry",
                held_at: new Date().toISOString(),
              })
            );
          }
        } else if (validPayouts.length >= 2) {
          try {
            const batchReference = `kora_batch_${Date.now()}_${idx}`;
            console.log(`🏦 Cron: Calling Kora Bulk Payout API for ${validPayouts.length} items (batchRef=${batchReference})`);

            await KoraService.initiateBulkPayout({
              batchReference,
              merchantBearsCost: false, // User bears withdrawal charges
              description: `Paayh Batch Withdrawal Payout #${idx + 1}`,
              payouts: validPayouts.map((vp) => ({
                reference: vp.reference,
                amount: vp.metadata?.net_amount ?? Math.max(0, vp.amount - 35),
                bankCode: vp.bankCode,
                accountNumber: vp.accountNumber,
                accountName: vp.accountName,
                customerEmail: vp.customerEmail,
                narration: vp.narration,
              })),
            });

            // Mark batch records as 'processing'
            for (const vp of validPayouts) {
              paymentUpdates.push(
                updatePaymentStatus(vp.id, "processing", {
                  ...vp.metadata,
                  gateway: "kora",
                  batchReference,
                  dispatched_at: new Date().toISOString(),
                })
              );
              processedCount++;
            }
          } catch (bulkErr: any) {
            console.error(`❌ Cron: Kora bulk payout failed for batch ${idx + 1}:`, bulkErr?.message || bulkErr);
            const errStr = (bulkErr?.message || "").toLowerCase();
            const isFloatOrTemp =
              errStr.includes("balance") ||
              errStr.includes("insufficient") ||
              errStr.includes("fund") ||
              errStr.includes("temporarily") ||
              errStr.includes("limit");

            // If float or temporary downtime, keep queued; only refund on invalid account data
            for (const vp of validPayouts) {
              if (isFloatOrTemp) {
                paymentUpdates.push(
                  updatePaymentStatus(vp.id, "queued", {
                    ...vp.metadata,
                    gateway: "kora",
                    hold_reason: bulkErr?.message || "Held for next payout window",
                    held_at: new Date().toISOString(),
                  })
                );
              } else {
                failedCount++;
                paymentUpdates.push(failPayment(vp, bulkErr?.message || "Kora bulk payout initiation failed"));
              }
            }
          }
        }

        await Promise.all(paymentUpdates);
      } else {
        // =========================================================================
        // PAYSTACK BULK TRANSFER ENGINE (Fallback / Alternative)
        // Activated when PAYOUT_PROVIDER=paystack in .env
        // Requires: 1) createTransferRecipient, 2) initiateBulkTransfer
        // =========================================================================
        const validTransfers: any[] = [];
        const paymentUpdates: Promise<any>[] = [];

        for (const payment of chunk) {
          const { bankCode, bankName, accountNumber, accountName } = payment.metadata || {};

          if (!bankCode || !accountNumber || !accountName) {
            console.error(`❌ Cron (Paystack): Missing bank metadata for reference ${payment.reference}`);
            failedCount++;
            paymentUpdates.push(failPayment(payment, "Missing bank details"));
            continue;
          }

          try {
            const recipientCode = await PaystackService.createTransferRecipient(
              accountName,
              accountNumber,
              bankCode
            );

            validTransfers.push({
              id: payment.id,
              amountInNaira: payment.amount,
              recipientCode,
              reference: payment.reference,
              reason: payment.description || "Wallet Withdrawal",
              metadata: payment.metadata,
            });
          } catch (recipErr: any) {
            console.error(`❌ Cron (Paystack): Recipient creation failed for ${payment.reference}:`, recipErr.message);
            failedCount++;
            paymentUpdates.push(failPayment(payment, recipErr.message || "Failed to create transfer recipient"));
          }
        }

        if (validTransfers.length > 0) {
          try {
            console.log(`🏦 Cron: Triggering bulk transfer on Paystack for ${validTransfers.length} items`);
            const bulkResults = await PaystackService.initiateBulkTransfer(
              validTransfers.map((vt) => ({
                amountInNaira: vt.amountInNaira,
                recipientCode: vt.recipientCode,
                reference: vt.reference,
                reason: vt.reason,
              }))
            );

            for (const vt of validTransfers) {
              const matchResult = bulkResults.find((r) => r.reference === vt.reference);
              const transferCode = matchResult?.transfer_code || null;

              paymentUpdates.push(
                updatePaymentStatus(vt.id, "processing", {
                  ...vt.metadata,
                  gateway: "paystack",
                  recipientCode: vt.recipientCode,
                  transfer_code: transferCode,
                  dispatched_at: new Date().toISOString(),
                })
              );
              processedCount++;
            }
          } catch (bulkErr: any) {
            console.error(`❌ Cron (Paystack): Bulk transfer call failed:`, bulkErr.message);
            for (const vt of validTransfers) {
              failedCount++;
              paymentUpdates.push(failPayment(vt, bulkErr.message || "Bulk transfer initiation failed"));
            }
          }
        }

        await Promise.all(paymentUpdates);
      }

      // Cool-down delay between chunks to respect API rate limits
      if (idx < chunks.length - 1) {
        await sleep(COOLDOWN_MS);
      }
    }

    console.log(`✅ Cron: Completed processing. Processed: ${processedCount}, Failed: ${failedCount}`);

    return NextResponse.json({
      success: true,
      gateway: activeGateway,
      message: `Completed processing. Processed: ${processedCount}, Failed: ${failedCount}`,
    });
  } catch (err: any) {
    console.error("❌ Cron: Unexpected crash in process-payouts:", err);
    return NextResponse.json({ error: err.message || "Cron task failed" }, { status: 500 });
  } finally {
    if (lockAcquired) {
      await redisConnection.del(lockKey).catch(() => {});
    }
  }
}

/**
 * Marks a payment as failed, refunds the user's balance, and alerts them via notification
 */
async function failPayment(payment: any, reason: string) {
  const userEmail = payment.user_email;
  const refundAmount = payment.amount;

  try {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("balance, withdrawal")
      .ilike("email", userEmail)
      .maybeSingle();

    if (user) {
      const currentBalance = parseFloat(user.balance || 0);
      const currentWithdrawal = parseFloat(user.withdrawal || 0);

      await supabaseAdmin
        .from("users")
        .update({
          balance: currentBalance + refundAmount,
          withdrawal: Math.max(0, currentWithdrawal - refundAmount),
        })
        .ilike("email", userEmail);
    }

    await supabaseAdmin
      .from("payments")
      .update({
        status: "failed",
        metadata: {
          ...(payment.metadata || {}),
          failure_reason: reason,
        },
      })
      .eq("id", payment.id);

    await supabaseAdmin.from("notifications").insert({
      user_email: userEmail,
      title: "Withdrawal Failed",
      message: `Your withdrawal of ₦${refundAmount.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} could not be processed. The funds have been refunded to your wallet.`,
    });

    console.log(`⚠️ Cron: Refunded payment ${payment.reference} for ${userEmail}`);
  } catch (err) {
    console.error(`❌ Cron: Error refunding payment ${payment.reference}:`, err);
  }
}

async function updatePaymentStatus(id: string, status: string, metadata: any) {
  const { error } = await supabaseAdmin
    .from("payments")
    .update({ status, metadata })
    .eq("id", id);
  if (error) {
    console.error(`❌ Cron: Failed to update payment ${id} status:`, error);
  }
}
