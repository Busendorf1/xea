import { Worker, Job } from "bullmq";
import supabaseAdmin from "../utils/dbAdmin";
import { invalidateCachedProfile } from "../utils/cache";
import { streamImpressionsToClickHouse } from "../clickhouse";
import { connectionOptions, FeedJobData } from "./config";

interface JobItem {
  job: Job<FeedJobData>;
  resolve: () => void;
  reject: (err: Error) => void;
}

let pendingJobs: JobItem[] = [];
let flushTimeout: NodeJS.Timeout | null = null;
let isFlushing = false;

export const flushBatch = async (): Promise<void> => {
  if (pendingJobs.length === 0 || isFlushing) return;
  isFlushing = true;

  const currentBatch = [...pendingJobs];
  pendingJobs = [];

  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }

  try {
    console.log(`📦 Queue Worker: Bulk flushing ${currentBatch.length} feed interactions to Supabase...`);

    const earns = currentBatch.filter((j) => j.job.data.type === "earn");
    const mutuals = currentBatch.filter((j) => j.job.data.type === "mutual");
    const seens = currentBatch.filter((j) => j.job.data.type === "seen");
    const actions = currentBatch.filter((j) => j.job.data.type === "action-click");
    const failedJobIds = new Set<string>();

    if (seens.length > 0) {
      await Promise.all(
        seens.map(async (s) => {
          try {
            await supabaseAdmin.rpc("record_ad_seen", {
              p_ad_id: s.job.data?.adId,
              p_user_email: s.job.data?.email,
            });
            await supabaseAdmin.rpc("qualify_referral_on_interaction", {
              p_referee_email: s.job.data?.email,
            });
          } catch (err: unknown) {
            console.error(`❌ Error recording ad seen for ${s.job.data?.adId}:`, (err as Error)?.message || err);
            if (s.job.id) failedJobIds.add(s.job.id);
          }
        })
      );

      streamImpressionsToClickHouse(
        seens.map((s) => ({
          ad_id: s.job.data.adId,
          user_email: s.job.data.email,
          cost_per_impression: 0,
          interaction_type: "view",
        }))
      ).catch((err) => console.warn("⚠️ Worker ClickHouse stream (seen) warning:", err));
    }

    if (earns.length > 0) {
      const adIds = earns.map((e) => e.job.data.adId);
      const emails = earns.map((e) => e.job.data.email);

      try {
        await supabaseAdmin.rpc("bulk_handle_earn_clicks", {
          p_ad_ids: adIds,
          p_user_emails: emails,
        });
      } catch (bulkErr: unknown) {
        console.warn("⚠️ bulk_handle_earn_clicks fallback to individual processing:", (bulkErr as Error)?.message || bulkErr);
        await Promise.all(
          earns.map(async (e) => {
            try {
              await supabaseAdmin.rpc("handle_earn_click", {
                p_ad_id: e.job.data?.adId,
                p_user_email: e.job.data?.email,
              });
              await supabaseAdmin.rpc("qualify_referral_on_interaction", {
                p_referee_email: e.job.data?.email,
              });
            } catch (err: unknown) {
              console.error(`❌ Error handling earn click for ${e.job.data?.adId}:`, (err as Error)?.message || err);
              if (e.job.id) failedJobIds.add(e.job.id);
            }
          })
        );
      }

      streamImpressionsToClickHouse(
        earns.map((e) => ({
          ad_id: e.job.data.adId,
          user_email: e.job.data.email,
          cost_per_impression: 0,
          interaction_type: "view",
        }))
      ).catch((err) => console.warn("⚠️ Worker ClickHouse stream (earn) warning:", err));
    }

    if (mutuals.length > 0) {
      await Promise.all(
        mutuals.map(async (m) => {
          try {
            await supabaseAdmin.rpc("handle_mutual_click", {
              p_ad_id: m.job.data?.adId,
              p_user_email: m.job.data?.email,
            });
            await supabaseAdmin.rpc("qualify_referral_on_interaction", {
              p_referee_email: m.job.data?.email,
            });
          } catch (err: unknown) {
            console.error(`❌ Error handling mutual click for ${m.job.data?.adId}:`, (err as Error)?.message || err);
            if (m.job.id) failedJobIds.add(m.job.id);
          }
        })
      );

      streamImpressionsToClickHouse(
        mutuals.map((m) => ({
          ad_id: m.job.data.adId,
          user_email: m.job.data.email,
          cost_per_impression: 0,
          interaction_type: "mutual",
        }))
      ).catch((err) => console.warn("⚠️ Worker ClickHouse stream (mutual) warning:", err));
    }

    if (actions.length > 0) {
      await Promise.all(
        actions.map(async (act) => {
          try {
            await supabaseAdmin.rpc("increment_ad_click", {
              p_ad_id: act.job.data?.adId,
              p_click_type: act.job.data?.clickType,
            });
            await supabaseAdmin.rpc("qualify_referral_on_interaction", {
              p_referee_email: act.job.data?.email,
            });
          } catch (err: unknown) {
            console.error(`❌ Error incrementing ad click for ${act.job.data?.adId}:`, (err as Error)?.message || err);
            if (act.job.id) failedJobIds.add(act.job.id);
          }
        })
      );

      streamImpressionsToClickHouse(
        actions.map((act) => ({
          ad_id: act.job.data?.adId,
          user_email: act.job.data?.email,
          cost_per_impression: 0,
          interaction_type: act.job.data?.clickType || "website",
        }))
      ).catch((err) => console.warn("⚠️ Worker ClickHouse stream (action) warning:", err));
    }

    const emailClickCounts = new Map<string, number>();
    currentBatch.forEach((item) => {
      const email = item.job?.data?.email?.toLowerCase().trim();
      if (email) {
        const needsClickIncrement = item.job?.data?.type === "action-click";
        emailClickCounts.set(email, (emailClickCounts.get(email) || 0) + (needsClickIncrement ? 1 : 0));
      }
    });

    await Promise.all(
      Array.from(emailClickCounts.entries()).map(async ([userEmail, clickCount]) => {
        try {
          const { data: userData } = await supabaseAdmin
            .from("users")
            .select("balance, monetization_clicks, atw_tier, attention_worth_score, is_affiliate, is_career")
            .ilike("email", userEmail)
            .maybeSingle();

          const currentBal = parseFloat(userData?.balance || "0");
          const { getAtwBalanceLimit } = await import("../attentionTierEngine");
          const { isExemptFromBarriersAndInactivity } = await import("../adminHelper");
          const isExempt = isExemptFromBarriersAndInactivity(userEmail, userData as any);
          const balanceCap = getAtwBalanceLimit(
            userData?.atw_tier,
            isExempt,
            userData?.monetization_clicks,
            userData?.attention_worth_score
          );
          const formattedCap = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(balanceCap);

          if (clickCount > 0) {
            await supabaseAdmin.rpc("increment_user_click_progress", {
              p_email: userEmail,
              p_count: clickCount,
            });
          }

          if (currentBal >= balanceCap) {
            console.log(`ℹ️ ATW tier balance cap of ${formattedCap} reached for ${userEmail}. Diverting click earnings to platform revenue.`);
            await supabaseAdmin.from("notifications").insert({
              user_email: userEmail,
              title: "Wallet Holding Limit Reached",
              message: `Your wallet balance has reached the ${formattedCap} maximum holding limit for your ATW level (${userData?.atw_tier || "ATW1"}). Click earnings during this period are permanently missed and will not be paid back later. Please initiate a withdrawal or upgrade your ATW level to resume earning.`,
            });
          } else {
            const alertThreshold = balanceCap * 0.5;
            if (currentBal >= alertThreshold && currentBal < balanceCap) {
              await supabaseAdmin.from("notifications").insert({
                user_email: userEmail,
                title: "Withdrawal Threshold Reached",
                message: `Your wallet balance has reached ₦${currentBal.toLocaleString("en-NG")}! You can withdraw your earnings anytime up to your ATW limit of ${formattedCap}.`,
              });
            }
          }
        } catch (err: unknown) {
          console.error("❌ Error updating user click progress / balance limits:", (err as Error)?.message || err);
        }

        try {
          await invalidateCachedProfile(userEmail);
        } catch (err: unknown) {
          console.error(`❌ Error invalidating profile cache for ${userEmail}:`, (err as Error)?.message || err);
        }
      })
    );

    if (failedJobIds.size > 0) {
      const { default: redisConn } = await import("../redis");
      await Promise.all(
        currentBatch
          .filter((j) => j.job.id && failedJobIds.has(j.job.id))
          .map(async (failedItem) => {
            try {
              await redisConn.hset(
                "queue:dlq:dead_letter_events",
                failedItem.job.id!,
                JSON.stringify({
                  name: failedItem.job.name,
                  data: failedItem.job.data,
                  failedAt: new Date().toISOString(),
                })
              );
            } catch (dlqErr) {
              console.error("❌ Failed to buffer to DLQ:", dlqErr);
            }
          })
      );
    }

    currentBatch.forEach((j) => {
      if (j.job.id && failedJobIds.has(j.job.id)) {
        j.reject(new Error(`Batch interaction failed for job ${j.job.id}`));
      } else {
        j.resolve();
      }
    });
  } catch (batchErr) {
    console.error("❌ Critical error during flushBatch execution:", batchErr);
    currentBatch.forEach((j) => j.reject(batchErr as Error));
  } finally {
    isFlushing = false;
    if (pendingJobs.length > 0 && !flushTimeout) {
      flushTimeout = setTimeout(() => {
        flushBatch().catch((err) => console.error("❌ Error during follow-up flushBatch:", err));
      }, 50);
    }
  }
};

const queueJob = (job: Job<FeedJobData>): Promise<void> => {
  return new Promise((resolve, reject) => {
    pendingJobs.push({ job, resolve, reject });
    if (pendingJobs.length >= 50) {
      flushBatch().catch((err) => console.error("❌ Error during flushBatch:", err));
    } else if (!flushTimeout) {
      flushTimeout = setTimeout(() => {
        flushBatch().catch((err) => console.error("❌ Error during timeout flushBatch:", err));
      }, 200);
    }
  });
};

export const feedWorker = new Worker<FeedJobData>(
  "feed-events",
  async (job) => {
    return await queueJob(job);
  },
  {
    connection: connectionOptions,
    concurrency: 50,
  }
);

feedWorker.on("completed", (job) => {
  console.log(`✅ Feed Worker: Job [${job.name}] successfully completed.`);
});

feedWorker.on("failed", async (job, err) => {
  console.error(`❌ Feed Worker: Job [${job?.name}] failed (Attempt ${job?.attemptsMade}/${job?.opts?.attempts || 5}):`, err.message);

  if (job && job.attemptsMade >= (job.opts?.attempts || 5)) {
    try {
      const { default: redisConnection } = await import("../redis");
      const dlqKey = "queue:dlq:dead_letter_events";
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
      console.log(`📥 Routed failed job [${job.id}] to Dead Letter Queue (DLQ).`);
    } catch (dlqErr) {
      console.error("❌ Failed to push job to DLQ:", dlqErr);
    }
  }
});
