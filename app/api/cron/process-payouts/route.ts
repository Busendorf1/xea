// app/api/cron/process-payouts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PaystackService } from "@/lib/payment/paystack";
import supabaseAdmin from "@/lib/utils/dbAdmin";

const BATCH_SIZE = 80; // Safe threshold under Paystack's 100 limit
const COOLDOWN_MS = 6000; // 6 seconds delay between bulk calls

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  try {
    // 1. Optional security check: verify CRON_SECRET if configured
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn("⚠️ Unauthorized cron trigger attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch all pending withdrawals, oldest first
    const { data: pendingPayments, error: fetchErr } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("type", "withdrawal")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (fetchErr) {
      console.error("❌ Cron: Error fetching pending payouts:", fetchErr);
      return NextResponse.json({ error: "Failed to fetch payouts" }, { status: 500 });
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      return NextResponse.json({ success: true, message: "No pending payouts to process." });
    }

    console.log(`🏦 Cron: Found ${pendingPayments.length} pending payouts. Starting batch execution.`);

    // 3. Process payouts in chunks of 80
    const chunks = [];
    for (let i = 0; i < pendingPayments.length; i += BATCH_SIZE) {
      chunks.push(pendingPayments.slice(i, i + BATCH_SIZE));
    }

    let processedCount = 0;
    let failedCount = 0;

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const validTransfers: any[] = [];
      const paymentUpdates: Promise<any>[] = [];

      console.log(`🏦 Cron: Processing batch ${idx + 1}/${chunks.length} containing ${chunk.length} items.`);

      // For each item in the chunk, resolve transfer recipient on Paystack
      for (const payment of chunk) {
        const { bankCode, bankName, accountNumber, accountName } = payment.metadata || {};

        if (!bankCode || !accountNumber || !accountName) {
          console.error(`❌ Cron: Missing bank metadata for payment reference ${payment.reference}`);
          failedCount++;
          // Fail this payment individually
          paymentUpdates.push(failPayment(payment, "Missing bank details"));
          continue;
        }

        try {
          console.log(`🏦 Cron: Registering transfer recipient for ${accountName} (${accountNumber})`);
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
          console.error(`❌ Cron: Failed to create recipient for ${payment.reference}:`, recipErr.message);
          failedCount++;
          // Fail this payment individually and refund user
          paymentUpdates.push(failPayment(payment, recipErr.message || "Failed to create transfer recipient"));
        }
      }

      // If we have valid recipients to pay, trigger bulk transfer for this batch
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

          // Update payments status to 'processing' and save recipient/transfer codes
          for (const vt of validTransfers) {
            const matchResult = bulkResults.find((r) => r.reference === vt.reference);
            const transferCode = matchResult?.transfer_code || null;

            paymentUpdates.push(
              updatePaymentStatus(vt.id, "processing", {
                ...vt.metadata,
                recipientCode: vt.recipientCode,
                transfer_code: transferCode,
              })
            );
            processedCount++;
          }
        } catch (bulkErr: any) {
          console.error(`❌ Cron: Bulk transfer call failed for batch ${idx + 1}:`, bulkErr.message);
          // Fail the whole valid transfers list in this batch
          for (const vt of validTransfers) {
            failedCount++;
            paymentUpdates.push(failPayment(vt, bulkErr.message || "Bulk transfer initiation failed"));
          }
        }
      }

      // Run database updates for the current batch concurrently
      await Promise.all(paymentUpdates);

      // 4. Cool-down: sleep 6 seconds before initiating the next chunk
      if (idx < chunks.length - 1) {
        console.log(`⏳ Cron: Sleeping for ${COOLDOWN_MS / 1000}s to respect Paystack rate limits...`);
        await sleep(COOLDOWN_MS);
      }
    }

    console.log(`✅ Cron: Completed processing. Processed: ${processedCount}, Failed: ${failedCount}`);

    return NextResponse.json({
      success: true,
      message: `Completed processing. Processed: ${processedCount}, Failed: ${failedCount}`,
    });
  } catch (err: any) {
    console.error("❌ Cron: Unexpected crash in process-payouts:", err);
    return NextResponse.json({ error: err.message || "Cron task failed" }, { status: 500 });
  }
}

/**
 * Marks a payment as failed, refunds the user's balance, and alerts them via notification
 */
async function failPayment(payment: any, reason: string) {
  const userEmail = payment.user_email;
  const refundAmount = payment.amount;

  try {
    // 1. Fetch user's current balance
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("balance, withdrawal")
      .ilike("email", userEmail)
      .maybeSingle();

    if (user) {
      const currentBalance = parseFloat(user.balance || 0);
      const currentWithdrawal = parseFloat(user.withdrawal || 0);

      // Refund balance and decrement pending withdrawal
      await supabaseAdmin
        .from("users")
        .update({
          balance: currentBalance + refundAmount,
          withdrawal: Math.max(0, currentWithdrawal - refundAmount),
        })
        .ilike("email", userEmail);
    }

    // 2. Mark payment as failed
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

    // 3. Insert notification
    await supabaseAdmin.from("notifications").insert({
      user_email: userEmail,
      title: "Withdrawal Failed ⚠️",
      message: `Your withdrawal of ₦${refundAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} could not be processed. The funds have been refunded to your wallet.`,
    });

    console.log(`⚠️ Cron: Successfully failed and refunded payment ${payment.reference} for ${userEmail}`);
  } catch (err) {
    console.error(`❌ Cron: Critical error failing/refunding payment ${payment.reference}:`, err);
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
