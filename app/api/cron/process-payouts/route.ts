// app/api/cron/process-payouts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PayoutProvider, PayoutGateway } from "@/lib/payment/payoutProvider";
import { KoraService } from "@/lib/payment/kora";
import { PaystackService } from "@/lib/payment/paystack";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { settleWithdrawalByReference } from "@/lib/services/payoutSettlementService";

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
    // 1. Mandatory CRON_SECRET verification in production
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if ((process.env.NODE_ENV === "production" && !cronSecret) || (cronSecret && authHeader !== `Bearer ${cronSecret}`)) {
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

    // 3. Pre-flight Balance Verification (ensures float is sufficient against net disbursement amounts)
    let eligiblePayments = pendingPayments;
    if (activeGateway === "kora") {
      try {
        const floatBalance = await KoraService.getNairaBalance();
        const getNetAmt = (p: any) => p.metadata?.net_amount ?? Math.max(0, (p.amount || 0) - 35);
        const totalPendingNet = pendingPayments.reduce((sum, p) => sum + getNetAmt(p), 0);
        console.log(`💰 Kora Available Float: ₦${floatBalance.toLocaleString()} | Required Net: ₦${totalPendingNet.toLocaleString()}`);

        if (floatBalance <= 0) {
          console.warn("⚠️ Kora float balance is empty (₦0). Holding all queued withdrawals until merchant funds account.");
          return NextResponse.json({
            success: true,
            message: "Disbursement float balance is ₦0. All withdrawal requests held safely in queue.",
            heldCount: pendingPayments.length,
          });
        }

        if (floatBalance < totalPendingNet) {
          console.warn("⚠️ Insufficient Kora float balance to process all payouts. Batching up to available float.");
          let runningTotal = 0;
          eligiblePayments = [];
          for (const payment of pendingPayments) {
            const netAmt = getNetAmt(payment);
            if (runningTotal + netAmt <= floatBalance) {
              runningTotal += netAmt;
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

            if (pRes.status === "success") {
              paymentUpdates.push(
                settleWithdrawalByReference(vp.reference, "success", "Dispatched and settled via Kora Single Payout", {
                  gateway: "kora",
                  dispatched_at: new Date().toISOString(),
                })
              );
            } else {
              paymentUpdates.push(
                updatePaymentStatus(vp.id, "processing", {
                  ...vp.metadata,
                  gateway: "kora",
                  dispatched_at: new Date().toISOString(),
                })
              );
            }
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

            // Note: Since `net_amount` already has the ₦35 fee deducted from the user's gross withdrawal,
            // `merchantBearsCost` MUST be `true` so Kora does not deduct the fee a second time from the user's payout.
            await KoraService.initiateBulkPayout({
              batchReference,
              merchantBearsCost: true,
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
            const isTerminalAccountErr =
              errStr.includes("invalid account") ||
              errStr.includes("account closed") ||
              errStr.includes("no such account") ||
              errStr.includes("invalid bank");

            // Keep queued for retry unless explicit terminal account rejection
            for (const vp of validPayouts) {
              const retries = Number(vp.metadata?.retry_count || 0) + 1;
              if (!isTerminalAccountErr && retries < 6) {
                paymentUpdates.push(
                  updatePaymentStatus(vp.id, "queued", {
                    ...vp.metadata,
                    gateway: "kora",
                    retry_count: retries,
                    hold_reason: bulkErr?.message || "Held for next payout window",
                    held_at: new Date().toISOString(),
                  })
                );
              } else {
                failedCount++;
                paymentUpdates.push(failPayment(vp, bulkErr?.message || "Kora bulk payout terminal failure"));
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
              amountInNaira: payment.metadata?.net_amount ?? Math.max(0, (payment.amount || 0) - 35),
              recipientCode,
              reference: payment.reference,
              reason: payment.description || "Wallet Withdrawal",
              metadata: payment.metadata,
            });
          } catch (recipErr: any) {
            console.error(`❌ Cron (Paystack): Recipient creation failed for ${payment.reference}:`, recipErr.message);
            const rErrStr = (recipErr?.message || "").toLowerCase();
            const isTerminalRecipErr =
              rErrStr.includes("invalid") ||
              rErrStr.includes("cannot resolve") ||
              rErrStr.includes("account");
            if (isTerminalRecipErr) {
              failedCount++;
              paymentUpdates.push(failPayment(payment, recipErr.message || "Invalid bank beneficiary details"));
            } else {
              paymentUpdates.push(
                updatePaymentStatus(payment.id, "queued", {
                  ...payment.metadata,
                  hold_reason: recipErr.message || "Held for retry",
                  held_at: new Date().toISOString(),
                })
              );
            }
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
              const retries = Number(vt.metadata?.retry_count || 0) + 1;
              if (retries < 6) {
                paymentUpdates.push(
                  updatePaymentStatus(vt.id, "queued", {
                    ...vt.metadata,
                    gateway: "paystack",
                    retry_count: retries,
                    hold_reason: bulkErr.message || "Held for next payout window",
                    held_at: new Date().toISOString(),
                  })
                );
              } else {
                failedCount++;
                paymentUpdates.push(failPayment(vt, bulkErr.message || "Bulk transfer initiation failed after retries"));
              }
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

    // 5. Clean up processed references from Redis queue:payouts
    try {
      const queuedItems = await redisConnection.lrange("queue:payouts", 0, -1);
      if (queuedItems && queuedItems.length > 0) {
        const processedRefs = new Set(eligiblePayments.map((p: any) => p.reference));
        const pipe = redisConnection.pipeline();
        for (const itemStr of queuedItems) {
          try {
            const item = JSON.parse(itemStr);
            if (processedRefs.has(item.reference)) {
              pipe.lrem("queue:payouts", 0, itemStr);
            }
          } catch {}
        }
        await pipe.exec();
      }
    } catch (cleanErr) {
      console.warn("⚠️ Redis queue:payouts cleanup warning:", cleanErr);
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
 * Marks a payment as failed, refunds the user's gross balance atomically, and alerts them via notification
 */
async function failPayment(payment: any, reason: string) {
  try {
    await settleWithdrawalByReference(payment.reference, "failed", reason);
    console.log(`⚠️ Cron: Refunded payment ${payment.reference}`);
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
