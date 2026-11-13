import { Worker } from "bullmq";
import supabaseAdmin from "../utils/dbAdmin";
import { invalidateCachedProfile } from "../utils/cache";
import { AdRatingJobData, PaymentJobData, connectionOptions } from "./config";
import {
  syncSqlAtwUpgradeNotifications,
  snapshotUserLevelsByEmails,
  notifyUpgradedUsersFromLevelMap,
} from "../notifications/milestoneNotifications";

export const paymentWorker = new Worker<PaymentJobData>(
  "payment-processing",
  async (job) => {
    const { type, senderEmail, recipientEmail, amount, reference, amountKobo } = job.data;
    const finalAmountKobo = amountKobo ?? Math.round(amount * 100);
    console.log(`💳 Payment Worker: Processing ${type} job [${reference}] from ${senderEmail} to ${recipientEmail}...`);

    const transferRef = reference || job.id || `tx_${Date.now()}`;
    const idempotencyKey = `idempotency:transfer:${transferRef}`;
    const lockKey = `lock:transfer:${transferRef}`;
    const { default: redisClient } = await import("../redis");

    const alreadyCompleted = await redisClient.get(idempotencyKey);
    if (alreadyCompleted === "completed") {
      console.log(`ℹ️ Payment Worker: Transfer [${transferRef}] already settled and audited. Skipping duplicate job.`);
      return;
    }

    const lockAcquired = await redisClient.set(lockKey, "processing", "EX", 300, "NX");
    if (!lockAcquired) {
      console.warn(`⚠️ Payment Worker: Transfer [${transferRef}] is currently in-flight by another worker instance. Skipping.`);
      return;
    }

    try {
      if (type === "p2p_transfer" || type === "transfer-settlement") {
        const [{ data: senderUser }, { data: recipientUser }] = await Promise.all([
          supabaseAdmin.from("users").select("balance").ilike("email", senderEmail).maybeSingle(),
          supabaseAdmin.from("users").select("balance").ilike("email", recipientEmail).maybeSingle(),
        ]);

        if (!job.data.settledImmediately && senderUser && recipientUser) {
          const newSenderBal = Math.max(0, parseFloat(senderUser.balance || "0") - amount);
          const newRecipientBal = parseFloat(recipientUser.balance || "0") + amount;

          await Promise.all([
            supabaseAdmin.from("users").update({ balance: newSenderBal }).ilike("email", senderEmail),
            supabaseAdmin.from("users").update({ balance: newRecipientBal }).ilike("email", recipientEmail),
          ]);
        }

        const senderRef = transferRef;
        const recipientRef = `${transferRef}_rcv`;

        await Promise.all([
          supabaseAdmin.from("payments").upsert(
            {
              user_email: senderEmail.toLowerCase().trim(),
              reference: senderRef,
              amount,
              status: "success",
              type: "transfer_sent",
              description: `Sent money to ${recipientEmail}`,
              metadata: {
                recipient_email: recipientEmail,
                recipientEmail,
                counterparty_email: recipientEmail,
                amount,
                amount_kobo: finalAmountKobo,
                transfer_type: "outbound",
                idempotency_key: transferRef,
              },
            },
            { onConflict: "reference" }
          ),
          supabaseAdmin.from("payments").upsert(
            {
              user_email: recipientEmail.toLowerCase().trim(),
              reference: recipientRef,
              amount,
              status: "success",
              type: "transfer_received",
              description: `Received money from ${senderEmail}`,
              metadata: {
                sender_email: senderEmail,
                senderEmail,
                counterparty_email: senderEmail,
                amount,
                amount_kobo: finalAmountKobo,
                transfer_type: "inbound",
                idempotency_key: transferRef,
              },
            },
            { onConflict: "reference" }
          ),
        ]);

        await Promise.all([
          invalidateCachedProfile(senderEmail),
          invalidateCachedProfile(recipientEmail),
        ]);

        await redisClient.set(idempotencyKey, "completed", "EX", 86400);
        await redisClient.del(lockKey).catch(() => {});

        console.log(`✅ Payment Worker: Completed P2P transfer audit and cache sync for reference [${transferRef}].`);
      }
    } catch (err: unknown) {
      await redisClient.del(lockKey).catch(() => {});
      console.error(`❌ Payment Worker: Error processing transfer job [${transferRef}]:`, (err as Error)?.message || err);
      throw err;
    }
  },
  {
    connection: connectionOptions,
    concurrency: 5,
  }
);

paymentWorker.on("completed", (job) => {
  console.log(`✅ Payment Worker: Job [${job.name}] successfully completed.`);
});

paymentWorker.on("failed", async (job, err) => {
  console.error(`❌ Payment Worker: Job [${job?.name}] failed:`, err.message);
  if (job && job.attemptsMade >= (job.opts?.attempts || 5)) {
    try {
      const { default: redisConnection } = await import("../redis");
      const dlqKey = "queue:dlq:payment_transfers";
      await redisConnection.hset(
        dlqKey,
        job.id || `job_${Date.now()}`,
        JSON.stringify({
          id: job.id,
          name: job.name,
          data: job.data,
          failedReason: err.message,
          failedAt: new Date().toISOString(),
        })
      );
      console.log(`📥 Routed failed payment job [${job.id}] to Payment Dead Letter Queue (DLQ).`);
    } catch (dlqErr) {
      console.error("❌ Failed to push payment job to DLQ:", dlqErr);
    }
  }
});

export const adRatingWorker = new Worker<AdRatingJobData>(
  "ad-rating-events",
  async (job) => {
    const { adId, advertiserEmail, starRating } = job.data;
    console.log(`⭐ Ad Rating Worker: Processing ${starRating}-star audience rating for ad [${adId}]...`);

    try {
      let hasMore = true;
      let lastEmail: string | null = null;
      let totalUpdated = 0;
      let batchCount = 0;
      const CHUNK_SIZE = 5000;
      let increment = 0;
      let usedChunked = false;
      let sqlReturnedUpgradedList = false;

      // Capture lightweight snapshot for legacy unmigrated DB fallback (capped at 500 rows)
      const { data: impRows } = await supabaseAdmin
        .from("ad_impressions")
        .select("user_email")
        .eq("ad_id", adId)
        .limit(500);
      const fallbackSnapshot =
        impRows && impRows.length > 0 && impRows.length <= 500
          ? await snapshotUserLevelsByEmails(impRows.map((r: any) => String(r.user_email || "")))
          : new Map<string, number>();

      while (hasMore) {
        batchCount++;
        const { data: chunkRes, error: chunkErr } = await supabaseAdmin.rpc("apply_ad_rating_chunk", {
          p_ad_id: adId,
          p_star_rating: starRating,
          p_batch_size: CHUNK_SIZE,
          p_last_email: lastEmail,
        });

        if (chunkErr) {
          console.warn(`⚠️ Ad Rating Worker: Chunked RPC not available (${chunkErr.message}), falling back to direct RPC.`);
          break;
        }

        usedChunked = true;
        const res = chunkRes as {
          updated_count: number;
          last_email: string | null;
          has_more: boolean;
          increment: number;
          upgraded_users?: Array<{ email: string; atw_tier: string; level: number }>;
        };
        totalUpdated += res?.updated_count || 0;
        increment = res?.increment || 0;
        hasMore = Boolean(res?.has_more && res?.last_email);
        lastEmail = res?.last_email || null;

        if (Array.isArray(res?.upgraded_users)) {
          sqlReturnedUpgradedList = true;
          if (res.upgraded_users.length > 0) {
            await syncSqlAtwUpgradeNotifications(res.upgraded_users).catch(() => {});
          }
        }

        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      if (usedChunked) {
        if (!sqlReturnedUpgradedList && fallbackSnapshot.size > 0) {
          await notifyUpgradedUsersFromLevelMap(fallbackSnapshot).catch(() => {});
        }
        await supabaseAdmin.from("completed_ads_ratings").upsert(
          {
            ad_id: adId,
            advertiser_email: advertiserEmail.toLowerCase(),
            star_rating: starRating,
            score_increment: increment,
            listeners_count: totalUpdated,
          },
          { onConflict: "ad_id,advertiser_email" }
        );

        console.log(`✅ Ad Rating Worker: Successfully updated ${totalUpdated} listeners across ${batchCount} streaming chunk(s) (+${increment} ATW).`);
        return { totalUpdated, increment, mode: "chunked_streaming" };
      }

      const { data: legacyIncrement, error: rpcErr } = await supabaseAdmin.rpc("apply_ad_rating_to_listeners", {
        p_ad_id: adId,
        p_advertiser_email: advertiserEmail,
        p_star_rating: starRating,
      });

      if (rpcErr) {
        console.error(`❌ Ad Rating Worker RPC error for ad [${adId}]:`, rpcErr);
        throw new Error(rpcErr.message || "Failed to apply ad rating to listeners");
      }

      if (fallbackSnapshot.size > 0) {
        await notifyUpgradedUsersFromLevelMap(fallbackSnapshot).catch(() => {});
      }

      console.log(`✅ Ad Rating Worker: Successfully applied +${legacyIncrement} ATW score increment to listeners of ad [${adId}].`);
      return { increment: legacyIncrement, mode: "legacy_set" };
    } catch (err: unknown) {
      console.error(`❌ Ad Rating Worker: Error rating ad [${adId}]:`, (err as Error)?.message || err);
      throw err;
    }
  },
  {
    connection: connectionOptions,
    concurrency: 5,
  }
);

adRatingWorker.on("completed", (job) => {
  console.log(`✅ Ad Rating Worker: Job [${job.name}] successfully completed.`);
});

adRatingWorker.on("failed", (job, err) => {
  console.error(`❌ Ad Rating Worker: Job [${job?.name}] failed:`, err.message);
});
