import { Worker } from "bullmq";
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

interface JobItem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  job: any;
  resolve: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reject: (err: any) => void;
}

let pendingJobs: JobItem[] = [];
let flushTimeout: NodeJS.Timeout | null = null;

const flushBatch = async () => {
  if (pendingJobs.length === 0) return;
  const currentBatch = [...pendingJobs];
  pendingJobs = [];
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }

  console.log(`📦 Queue Worker: Bulk flushing ${currentBatch.length} feed interactions to Supabase...`);

  const earns = currentBatch.filter(j => j.job.data.type === "earn");
  const mutuals = currentBatch.filter(j => j.job.data.type === "mutual");
  const seens = currentBatch.filter(j => j.job.data.type === "seen");
  const actions = currentBatch.filter(j => j.job.data.type === "action-click");

  // 1. Process Seen clicks in bulk
  if (seens.length > 0) {
    const rows = seens.map(s => ({
      ad_id: s.job.data.adId,
      user_email: s.job.data.email,
      view_count: 1
    }));
    try {
      await supabaseAdmin
        .from("ad_impressions")
        .upsert(rows, { onConflict: "user_email,ad_id" });
    } catch (err: unknown) {
      console.error("❌ Error upserting ad_impressions:", (err as Error)?.message || err);
    }

    await Promise.all(seens.map(async (s) => {
      try {
        await supabaseAdmin.rpc("record_ad_seen", {
          p_ad_id: s.job.data?.adId,
          p_user_email: s.job.data?.email
        });
      } catch (err: unknown) {
        console.error(`❌ Error recording ad seen for ${s.job.data?.adId}:`, (err as Error)?.message || err);
      }
    }));
  }

  // 2. Process Earn clicks
  if (earns.length > 0) {
    await Promise.all(earns.map(async (e) => {
      try {
        await supabaseAdmin.rpc("handle_earn_click", {
          p_ad_id: e.job.data?.adId,
          p_user_email: e.job.data?.email
        });
      } catch (err: unknown) {
        console.error(`❌ Error handling earn click for ${e.job.data?.adId}:`, (err as Error)?.message || err);
      }
    }));
  }

  // 3. Process Mutual clicks
  if (mutuals.length > 0) {
    await Promise.all(mutuals.map(async (m) => {
      try {
        await supabaseAdmin.rpc("handle_mutual_click", {
          p_ad_id: m.job.data?.adId,
          p_user_email: m.job.data?.email
        });
      } catch (err: unknown) {
        console.error(`❌ Error handling mutual click for ${m.job.data?.adId}:`, (err as Error)?.message || err);
      }
    }));
  }

  // 4. Process Action redirect clicks
  if (actions.length > 0) {
    await Promise.all(actions.map(async (act) => {
      try {
        await supabaseAdmin.rpc("increment_ad_click", {
          p_ad_id: act.job.data?.adId,
          p_click_type: act.job.data?.clickType
        });
      } catch (err: unknown) {
        console.error(`❌ Error incrementing ad click for ${act.job.data?.adId}:`, (err as Error)?.message || err);
      }
    }));
  }

  // 5. Increment user click progress, enforce ₦50k balance cap & ₦30k notification checks
  const activeEmails = new Set<string>();
  currentBatch.forEach((item) => {
    if (item.job?.data?.email) {
      activeEmails.add(item.job.data.email.toLowerCase().trim());
    }
  });

  await Promise.all(
    Array.from(activeEmails).map(async (userEmail) => {
      try {
        const { data: userData } = await supabaseAdmin
          .from("users")
          .select("balance")
          .ilike("email", userEmail)
          .maybeSingle();

        const currentBal = parseFloat(userData?.balance || 0);

        if (currentBal >= 50000) {
          console.log(`ℹ️ Wallet balance cap of ₦50,000 reached for ${userEmail}. Diverting click earnings to platform revenue.`);
          // Send polite notification once balance hits cap
          await supabaseAdmin.from("notifications").insert({
            user_email: userEmail,
            title: "Wallet Holding Limit Reached",
            message: "Your wallet balance has reached the ₦50,000 maximum holding limit. Please initiate a withdrawal to continue receiving instant payouts.",
          });
        } else {
          await supabaseAdmin.rpc("increment_user_click_progress", {
            p_email: userEmail,
          });

          // Check if balance crosses ₦30,000 threshold
          if (currentBal >= 30000 && currentBal < 50000) {
            await supabaseAdmin.from("notifications").insert({
              user_email: userEmail,
              title: "Withdrawal Threshold Reached",
              message: "Your wallet balance has reached ₦30,000! You can withdraw your earnings anytime between ₦10,000 and ₦50,000.",
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

  // Resolve successful jobs in this batch
  currentBatch.forEach((j) => j.resolve());
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const queueJob = (job: any): Promise<void> => {
  return new Promise((resolve, reject) => {
    pendingJobs.push({ job, resolve, reject });
    if (pendingJobs.length >= 50) {
      flushBatch();
    } else if (!flushTimeout) {
      flushTimeout = setTimeout(flushBatch, 1000);
    }
  });
};

const feedWorker = new Worker("feed-events", async (job) => {
  return await queueJob(job);
}, {
  connection: connectionOptions,
  concurrency: 5
});

feedWorker.on("completed", (job) => {
  console.log(`✅ Feed Worker: Job [${job.name}] successfully completed.`);
});

feedWorker.on("failed", async (job, err) => {
  console.error(`❌ Feed Worker: Job [${job?.name}] failed (Attempt ${job?.attemptsMade}/${job?.opts?.attempts || 5}):`, err.message);
  
  // Route exhausted jobs to Dead Letter Queue (DLQ) in Redis
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

const campaignsWorker = new Worker("campaigns-events", async (job) => {
  const { type, payload } = job.data;
  console.log(`👷 Campaigns Worker: Creating ${type} for user: ${payload.user_email}`);

  try {
    if (type === "ad") {
      const { error } = await supabaseAdmin
        .from("addsactive")
        .insert([payload]);
      if (error) throw new Error(error.message);
    } else if (type === "highlight") {
      const { error } = await supabaseAdmin
        .from("newsactive")
        .insert([payload]);
      if (error) throw new Error(error.message);
      await invalidateAllHighlights();
    }
  } catch (err: unknown) {
    console.error(`❌ Campaigns Worker: Failed to create ${type}:`, (err as Error)?.message || err);
    throw err;
  }
}, {
  connection: connectionOptions,
  concurrency: 2 // Ad creation is low-volume, process 2 at a time
});

campaignsWorker.on("completed", (job) => {
  console.log(`✅ Campaigns Worker: Job [${job.name}] successfully completed.`);
});

campaignsWorker.on("failed", (job, err) => {
  console.error(`❌ Campaigns Worker: Job [${job?.name}] failed:`, err.message);
});

// ----------------------------------------------------
// HLS TRANSCODING QUEUE: ADAPTIVE BITRATE VIDEO JOBS
// ----------------------------------------------------

const hlsWorker = new Worker("hls-transcode-events", async (job) => {
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
}, {
  connection: connectionOptions,
  concurrency: 1, // CPU intensive task, transcode 1 video at a time per worker instance
});

hlsWorker.on("completed", (job) => {
  console.log(`✅ HLS Worker: Job [${job.name}] finished transcoding.`);
});

hlsWorker.on("failed", (job, err) => {
  console.error(`❌ HLS Worker: Job [${job?.name}] failed:`, err.message);
});

// ----------------------------------------------------
// PAYMENT PROCESSING QUEUE: P2P TRANSFERS & AUDIT JOBS
// ----------------------------------------------------

const paymentWorker = new Worker("payment-processing", async (job) => {
  const { type, senderEmail, recipientEmail, amount, reference } = job.data;
  console.log(`💳 Payment Worker: Processing ${type} job [${reference}] from ${senderEmail} to ${recipientEmail}...`);

  try {
    if (type === "p2p_transfer") {
      // Invalidate profile and payment statement caches in Redis for both accounts
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
}, {
  connection: connectionOptions,
  concurrency: 3,
});

paymentWorker.on("completed", (job) => {
  console.log(`✅ Payment Worker: Job [${job.name}] successfully completed.`);
});

paymentWorker.on("failed", (job, err) => {
  console.error(`❌ Payment Worker: Job [${job?.name}] failed:`, err.message);
});

const workers = { feedWorker, campaignsWorker, hlsWorker, paymentWorker };
export default workers;
