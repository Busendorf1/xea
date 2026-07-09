import { Worker } from "bullmq";
import supabaseAdmin from "./utils/dbAdmin";
import { invalidateCachedProfile, invalidateAllHighlights } from "./utils/cache";

const connectionOptions = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_TLS === "true" ? {} : undefined,
  maxRetriesPerRequest: null,
};

// ----------------------------------------------------
// FEED EVENTS: BATCH PROCESSING (TIKTOK SCALE BUFFER)
// ----------------------------------------------------

interface JobItem {
  job: any;
  resolve: () => void;
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

  try {
    // 1. Process Seen clicks in bulk
    if (seens.length > 0) {
      const rows = seens.map(s => ({
        ad_id: s.job.data.adId,
        user_email: s.job.data.email,
        view_count: 1
      }));
      const { error } = await supabaseAdmin
        .from("ad_impressions")
        .upsert(rows, { onConflict: "user_email,ad_id" });
      if (error) throw new Error(error.message);

      // Increment counts in active ads
      await Promise.all(seens.map(async (s) => {
        await supabaseAdmin.rpc("record_ad_seen", {
          p_ad_id: s.job.data.adId,
          p_user_email: s.job.data.email
        });
      }));
    }

    // 2. Process Earn clicks
    if (earns.length > 0) {
      await Promise.all(earns.map(async (e) => {
        await supabaseAdmin.rpc("handle_earn_click", {
          p_ad_id: e.job.data.adId,
          p_user_email: e.job.data.email
        });
      }));
    }

    // 3. Process Mutual clicks
    if (mutuals.length > 0) {
      await Promise.all(mutuals.map(async (m) => {
        await supabaseAdmin.rpc("handle_mutual_click", {
          p_ad_id: m.job.data.adId,
          p_user_email: m.job.data.email
        });
      }));
    }

    // 4. Process Action redirect clicks
    if (actions.length > 0) {
      await Promise.all(actions.map(async (act) => {
        await supabaseAdmin.rpc("increment_ad_click", {
          p_ad_id: act.job.data.adId,
          p_click_type: act.job.data.clickType
        });
      }));
    }

    // Invalidate profile caches in Redis for processed earn and mutual actions
    const emailsToInvalidate = new Set<string>();
    earns.forEach(e => {
      if (e.job.data.email) emailsToInvalidate.add(e.job.data.email);
    });
    mutuals.forEach(m => {
      if (m.job.data.email) emailsToInvalidate.add(m.job.data.email);
    });

    await Promise.all(
      Array.from(emailsToInvalidate).map(async (email) => {
        await invalidateCachedProfile(email);
      })
    );

    // Resolve all jobs in this batch on success
    currentBatch.forEach(j => j.resolve());
  } catch (err: any) {
    console.error("❌ Queue Worker: Failed to flush batch:", err.message);
    // Reject all jobs in this batch so BullMQ retries them automatically
    currentBatch.forEach(j => j.reject(err));
  }
};

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

feedWorker.on("failed", (job, err) => {
  console.error(`❌ Feed Worker: Job [${job?.name}] failed:`, err.message);
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
  } catch (err: any) {
    console.error(`❌ Campaigns Worker: Failed to create ${type}:`, err.message);
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

export default { feedWorker, campaignsWorker };
