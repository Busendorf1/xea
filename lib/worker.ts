import { Worker, Job } from "bullmq";
import supabaseAdmin from "./utils/dbAdmin";
import { invalidateCachedProfile, invalidateAllHighlights } from "./utils/cache";
import { env } from "./env";

const connectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  tls: env.REDIS_TLS === "true" ? {} : undefined,
  maxRetriesPerRequest: null,
};

// ----------------------------------------------------
// FEED EVENTS: BATCH PROCESSING (TIKTOK SCALE BUFFER)
// ----------------------------------------------------

export interface FeedJobData {
  adId: string;
  email: string;
  type: "earn" | "mutual" | "seen" | "action-click";
  clickType?: string;
}

export interface CampaignJobPayload {
  user_email: string;
  is_admin_post?: boolean;
  [key: string]: unknown;
}

export interface CampaignJobData {
  type: "ad" | "highlight";
  payload: CampaignJobPayload;
}

export interface HlsJobData {
  sourceUrl: string;
  mediaId: string;
  bucketName?: string;
  tableName?: string;
  recordId?: string;
}

export interface PaymentJobData {
  type: "p2p_transfer" | "transfer-settlement";
  senderEmail: string;
  recipientEmail: string;
  amount: number;
  amountKobo?: number;
  reference: string;
  timestamp?: string;
}

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

  console.log(`📦 Queue Worker: Bulk flushing ${currentBatch.length} feed interactions to Supabase...`);

  const earns = currentBatch.filter((j) => j.job.data.type === "earn");
  const mutuals = currentBatch.filter((j) => j.job.data.type === "mutual");
  const seens = currentBatch.filter((j) => j.job.data.type === "seen");
  const actions = currentBatch.filter((j) => j.job.data.type === "action-click");

  const failedJobIds = new Set<string>();

  // 1. Process Seen clicks in bulk
  if (seens.length > 0) {
    const rows = seens.map((s) => ({
      ad_id: s.job.data.adId,
      user_email: s.job.data.email,
      view_count: 1,
    }));
    try {
      await supabaseAdmin
        .from("ad_impressions")
        .upsert(rows, { onConflict: "user_email,ad_id" });
    } catch (err: unknown) {
      console.error("❌ Error upserting ad_impressions:", (err as Error)?.message || err);
    }

    await Promise.all(
      seens.map(async (s) => {
        try {
          await supabaseAdmin.rpc("record_ad_seen", {
            p_ad_id: s.job.data?.adId,
            p_user_email: s.job.data?.email,
          });
        } catch (err: unknown) {
          console.error(`❌ Error recording ad seen for ${s.job.data?.adId}:`, (err as Error)?.message || err);
          if (s.job.id) failedJobIds.add(s.job.id);
        }
      })
    );
  }

  // 2. Process Earn clicks
  if (earns.length > 0) {
    await Promise.all(
      earns.map(async (e) => {
        try {
          await supabaseAdmin.rpc("handle_earn_click", {
            p_ad_id: e.job.data?.adId,
            p_user_email: e.job.data?.email,
          });
        } catch (err: unknown) {
          console.error(`❌ Error handling earn click for ${e.job.data?.adId}:`, (err as Error)?.message || err);
          if (e.job.id) failedJobIds.add(e.job.id);
        }
      })
    );
  }

  // 3. Process Mutual clicks
  if (mutuals.length > 0) {
    await Promise.all(
      mutuals.map(async (m) => {
        try {
          await supabaseAdmin.rpc("handle_mutual_click", {
            p_ad_id: m.job.data?.adId,
            p_user_email: m.job.data?.email,
          });
        } catch (err: unknown) {
          console.error(`❌ Error handling mutual click for ${m.job.data?.adId}:`, (err as Error)?.message || err);
          if (m.job.id) failedJobIds.add(m.job.id);
        }
      })
    );
  }

  // 4. Process Action redirect clicks
  if (actions.length > 0) {
    await Promise.all(
      actions.map(async (act) => {
        try {
          await supabaseAdmin.rpc("increment_ad_click", {
            p_ad_id: act.job.data?.adId,
            p_click_type: act.job.data?.clickType,
          });
        } catch (err: unknown) {
          console.error(`❌ Error incrementing ad click for ${act.job.data?.adId}:`, (err as Error)?.message || err);
          if (act.job.id) failedJobIds.add(act.job.id);
        }
      })
    );
  }

  // 5. Count clicks per email in this batch and increment click progress
  const emailClickCounts = new Map<string, number>();
  currentBatch.forEach((item) => {
    const email = item.job?.data?.email?.toLowerCase().trim();
    if (email) {
      emailClickCounts.set(email, (emailClickCounts.get(email) || 0) + 1);
    }
  });

  await Promise.all(
    Array.from(emailClickCounts.entries()).map(async ([userEmail, clickCount]) => {
      try {
        const { data: userData } = await supabaseAdmin
          .from("users")
          .select("balance, atw_tier")
          .ilike("email", userEmail)
          .maybeSingle();

        const currentBal = parseFloat(userData?.balance || "0");
        const { getAtwBalanceLimit } = await import("./attentionTierEngine");
        const { isAdminEmail } = await import("./authHelper");
        const isAdmin = isAdminEmail(userEmail);
        const balanceCap = getAtwBalanceLimit(userData?.atw_tier, isAdmin);
        const formattedCap = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(balanceCap);

        if (currentBal >= balanceCap) {
          console.log(`ℹ️ ATW tier balance cap of ${formattedCap} reached for ${userEmail}. Diverting click earnings to platform revenue.`);
          await supabaseAdmin.from("notifications").insert({
            user_email: userEmail,
            title: "Wallet Holding Limit Reached",
            message: `Your wallet balance has reached the ${formattedCap} maximum holding limit for your ATW level (${userData?.atw_tier || "ATW1"}). Click earnings during this period are permanently missed and will not be paid back later. Please initiate a withdrawal or upgrade your ATW level to resume earning.`,
          });
        } else {
          await supabaseAdmin.rpc("increment_user_click_progress", {
            p_email: userEmail,
            p_count: clickCount,
          });

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

  // Resolve successful jobs and reject failed ones
  currentBatch.forEach((j) => {
    if (j.job.id && failedJobIds.has(j.job.id)) {
      j.reject(new Error(`Batch interaction failed for job ${j.job.id}`));
    } else {
      j.resolve();
    }
  });

  isFlushing = false;
};

const queueJob = (job: Job<FeedJobData>): Promise<void> => {
  return new Promise((resolve, reject) => {
    pendingJobs.push({ job, resolve, reject });
    if (pendingJobs.length >= 50) {
      flushBatch().catch((err) => console.error("❌ Error during flushBatch:", err));
    } else if (!flushTimeout) {
      flushTimeout = setTimeout(() => {
        flushBatch().catch((err) => console.error("❌ Error during timeout flushBatch:", err));
      }, 1000);
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
    concurrency: 5,
  }
);

feedWorker.on("completed", (job) => {
  console.log(`✅ Feed Worker: Job [${job.name}] successfully completed.`);
});

feedWorker.on("failed", async (job, err) => {
  console.error(`❌ Feed Worker: Job [${job?.name}] failed (Attempt ${job?.attemptsMade}/${job?.opts?.attempts || 5}):`, err.message);

  if (job && job.attemptsMade >= (job.opts?.attempts || 5)) {
    try {
      const { default: redisConnection } = await import("./redis");
      const dlqKey = "queue:dlq:dead_letter_events";
      const payload = JSON.stringify({
        id: job.id,
        name: job.name,
        data: job.data,
        failedReason: err.message,
        failedAt: new Date().toISOString(),
      });
      await redisConnection.hset(dlqKey, job.id || `job_${Date.now()}`, payload);
      console.log(`📥 Routed failed job [${job.id}] to Dead Letter Queue (DLQ).`);
    } catch (dlqErr) {
      console.error("❌ Failed to push job to DLQ:", dlqErr);
    }
  }
});

// ----------------------------------------------------
// CAMPAIGNS QUEUE: AD & HIGHLIGHT CREATION EVENTS
// ----------------------------------------------------

export const campaignsWorker = new Worker<CampaignJobData>(
  "campaigns-events",
  async (job) => {
    const { type, payload } = job.data;
    console.log(`👷 Campaigns Worker: Creating ${type} for user: ${payload.user_email}`);

    try {
      if (type === "ad") {
        const targetTable = payload.is_admin_post ? "addsactive" : "adds";
        const { error } = await supabaseAdmin.from(targetTable).insert([payload]);
        if (error) throw new Error(error.message);
      } else if (type === "highlight") {
        const targetTable = payload.is_admin_post ? "newsactive" : "news";
        const { error } = await supabaseAdmin.from(targetTable).insert([payload]);
        if (error) throw new Error(error.message);
        if (payload.is_admin_post) {
          await invalidateAllHighlights();
        }
      }
    } catch (err: unknown) {
      console.error(`❌ Campaigns Worker: Failed to create ${type}:`, (err as Error)?.message || err);
      throw err;
    }
  },
  {
    connection: connectionOptions,
    concurrency: 2,
  }
);

campaignsWorker.on("completed", (job) => {
  console.log(`✅ Campaigns Worker: Job [${job.name}] successfully completed.`);
});

campaignsWorker.on("failed", (job, err) => {
  console.error(`❌ Campaigns Worker: Job [${job?.name}] failed:`, err.message);
});

// ----------------------------------------------------
// HLS TRANSCODING QUEUE: ADAPTIVE BITRATE VIDEO JOBS
// ----------------------------------------------------

export const hlsWorker = new Worker<HlsJobData>(
  "hls-transcode-events",
  async (job) => {
    const { sourceUrl, mediaId, bucketName, tableName, recordId } = job.data;
    console.log(`🎥 HLS Worker: Transcoding video [${mediaId}] from ${sourceUrl}...`);

    const { transcodeVideoToHLS } = await import("./utils/transcoder");
    const result = await transcodeVideoToHLS(sourceUrl, mediaId, bucketName || "ad-media");

    if (result.success && result.masterPlaylistUrl) {
      console.log(`✅ HLS Worker: Successfully generated HLS for [${mediaId}]. Updating DB table [${tableName}]...`);
      if (tableName && recordId) {
        await supabaseAdmin
          .from(tableName)
          .update({ hls_url: result.masterPlaylistUrl })
          .eq("id", recordId);
      }
    } else {
      console.warn(`⚠️ HLS Worker: Transcoding did not produce HLS URL. Reason: ${result.error}`);
    }
  },
  {
    connection: connectionOptions,
    concurrency: 1,
  }
);

hlsWorker.on("completed", (job) => {
  console.log(`✅ HLS Worker: Job [${job.name}] finished transcoding.`);
});

hlsWorker.on("failed", (job, err) => {
  console.error(`❌ HLS Worker: Job [${job?.name}] failed:`, err.message);
});

// ----------------------------------------------------
// PAYMENT PROCESSING QUEUE: P2P TRANSFERS & AUDIT JOBS
// ----------------------------------------------------

export const paymentWorker = new Worker<PaymentJobData>(
  "payment-processing",
  async (job) => {
    const { type, senderEmail, recipientEmail, amount, reference } = job.data;
    console.log(`💳 Payment Worker: Processing ${type} job [${reference}] from ${senderEmail} to ${recipientEmail}...`);

    try {
      if (type === "p2p_transfer" || type === "transfer-settlement") {
        const { data: senderUser } = await supabaseAdmin
          .from("users")
          .select("balance")
          .ilike("email", senderEmail)
          .maybeSingle();

        const { data: recipientUser } = await supabaseAdmin
          .from("users")
          .select("balance")
          .ilike("email", recipientEmail)
          .maybeSingle();

        if (senderUser && recipientUser) {
          const newSenderBal = Math.max(0, parseFloat(senderUser.balance || "0") - amount);
          const newRecipientBal = parseFloat(recipientUser.balance || "0") + amount;

          await Promise.all([
            supabaseAdmin.from("users").update({ balance: newSenderBal }).ilike("email", senderEmail),
            supabaseAdmin.from("users").update({ balance: newRecipientBal }).ilike("email", recipientEmail),
          ]);
        }

        const formattedAmount = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount);
        await Promise.all([
          supabaseAdmin.from("notifications").insert({
            user_email: senderEmail,
            title: "Money Sent",
            message: `You successfully sent ${formattedAmount} to ${recipientEmail}`,
          }),
          supabaseAdmin.from("notifications").insert({
            user_email: recipientEmail,
            title: "Money Received",
            message: `You received ${formattedAmount} from ${senderEmail}`,
          }),
        ]);

        await Promise.all([
          invalidateCachedProfile(senderEmail),
          invalidateCachedProfile(recipientEmail),
        ]);
        console.log(`✅ Payment Worker: Completed P2P transfer audit and cache sync for reference [${reference}].`);
      }
    } catch (err: unknown) {
      console.error(`❌ Payment Worker: Error processing transfer job [${reference}]:`, (err as Error)?.message || err);
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
      const { default: redisConnection } = await import("./redis");
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

/**
 * Gracefully shuts down all BullMQ workers and flushes any pending in-flight batches.
 */
export async function shutdownWorkers(): Promise<void> {
  console.log("🛑 Gracefully shutting down BullMQ workers...");
  try {
    // 1. Flush any pending batch interactions
    await flushBatch();

    // 2. Close all workers cleanly
    await Promise.all([
      feedWorker.close(),
      campaignsWorker.close(),
      hlsWorker.close(),
      paymentWorker.close(),
    ]);
    console.log("✅ All BullMQ workers closed gracefully.");
  } catch (err) {
    console.error("❌ Error during worker shutdown:", err);
  }
}

const workers = { feedWorker, campaignsWorker, hlsWorker, paymentWorker, shutdownWorkers };
export default workers;

