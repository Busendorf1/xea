import redisConnection, { isRedisReady } from "@/lib/redis";
import { cleanupExpiredApprovedCampaigns } from "./cleanupService";

export interface JobDefinition {
  name: string;
  maxIntervalSeconds: number; // Maximum time allowed before self-healing trigger
  lockTtlSeconds: number;
  run: () => Promise<any>;
}

const JOBS: Record<string, JobDefinition> = {
  "approved-campaigns-cleanup": {
    name: "approved-campaigns-cleanup",
    maxIntervalSeconds: 300, // 5 minutes
    lockTtlSeconds: 60,
    run: async () => cleanupExpiredApprovedCampaigns(true),
  },
  "database-cleanup": {
    name: "database-cleanup",
    maxIntervalSeconds: 43200, // 12 hours
    lockTtlSeconds: 300,
    run: async () => {
      const { default: supabaseAdmin } = await import("@/lib/utils/dbAdmin");
      // Archive expired platform ads
      await supabaseAdmin.rpc("archive_expired_platform_ads");
      // Purge expired approved campaigns older than 3 days
      await cleanupExpiredApprovedCampaigns(true).catch(() => {});
    },
  },
};

/**
 * Self-healing job dispatcher.
 * Checks if any critical maintenance job is overdue.
 * If overdue, acquires a distributed Redis lock and runs asynchronously in the background.
 * Guarantees execution regardless of whether Vercel cron fires or fails.
 */
export async function triggerSelfHealingJobsIfDue(): Promise<void> {
  if (!isRedisReady()) return;

  for (const [jobKey, job] of Object.entries(JOBS)) {
    try {
      const lastRunKey = `cron:last_run:${jobKey}`;
      const lockKey = `cron:lock:${jobKey}`;

      const lastRunStr = await redisConnection.get(lastRunKey).catch(() => null);
      const lastRun = lastRunStr ? parseInt(lastRunStr, 10) : 0;
      const now = Math.floor(Date.now() / 1000);

      if (now - lastRun >= job.maxIntervalSeconds) {
        // Overdue! Attempt to acquire distributed lock
        const locked = await redisConnection.set(lockKey, "1", "EX", job.lockTtlSeconds, "NX").catch(() => null);
        if (locked) {
          // Lock acquired: execute in background
          (async () => {
            try {
              console.log(`⚡ Self-healing Cron Orchestrator: Running overdue job [${jobKey}]...`);
              await job.run();
              await redisConnection.set(lastRunKey, now.toString(), "EX", 86400 * 7).catch(() => {});
              console.log(`✅ Self-healing Cron Orchestrator: Completed job [${jobKey}] successfully.`);
            } catch (err: any) {
              console.error(`❌ Self-healing job [${jobKey}] failed:`, err);
            } finally {
              await redisConnection.del(lockKey).catch(() => {});
            }
          })().catch(() => {});
        }
      }
    } catch (e) {
      // Non-blocking fail-safe
    }
  }
}
