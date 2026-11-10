import redisConnection, { isRedisReady } from "@/lib/redis";
import { flushImpressionBuffersToDB } from "@/lib/impressionBuffer";

let workerInterval: NodeJS.Timeout | null = null;
let isFlushing = false;

const FLUSH_INTERVAL_MS = 5000; // 5 seconds interval
const DISTRIBUTED_LOCK_KEY = "lock:cron:flush_impressions";
const DISTRIBUTED_LOCK_TTL_SEC = 4;

/**
 * High-Throughput Background Impression Flush Worker (500M+ Scale Protection).
 * Periodically drains Redis and L1 impression & click buffers and flushes them to PostgreSQL.
 * Uses a distributed Redis NX lock so that across multi-container / multi-pod environments,
 * only 1 instance performs the batched SQL commit per 5-second window.
 */
export async function runImpressionFlushTick(): Promise<{ flushedImpressions: number; flushedClicks: number } | null> {
  if (isFlushing) return null;
  if (!isRedisReady() || !redisConnection) return null;

  try {
    isFlushing = true;
    // Acquire distributed lock so only 1 worker flushes at a time across all servers
    const locked = await redisConnection.set(DISTRIBUTED_LOCK_KEY, "1", "EX", DISTRIBUTED_LOCK_TTL_SEC, "NX").catch(() => null);
    if (!locked) {
      // Another worker/server instance is already performing the flush
      return null;
    }

    const result = await flushImpressionBuffersToDB();
    if (result.flushedImpressions > 0 || result.flushedClicks > 0) {
      if (process.env.NODE_ENV !== "production") {
        console.info(`⚡ [Batch Flush] Flushed ${result.flushedImpressions} impressions, ${result.flushedClicks} clicks to DB.`);
      }
    }
    return result;
  } catch (err) {
    console.error("❌ Error in impression flush worker tick:", err);
    return null;
  } finally {
    isFlushing = false;
  }
}

/**
 * Starts the continuous 5-second background flush worker on the server runtime.
 */
export function startImpressionFlushWorker(): void {
  if (typeof window !== "undefined") return; // Server only
  if (workerInterval) return; // Already running in this process

  workerInterval = setInterval(() => {
    runImpressionFlushTick().catch(() => {});
  }, FLUSH_INTERVAL_MS);

  // Unref so worker doesn't prevent graceful Node.js shutdown
  if (typeof workerInterval.unref === "function") {
    workerInterval.unref();
  }

  console.info("🚀 High-Throughput Impression Batch Flush Worker started (5s interval).");
}

/**
 * Stops the continuous flush worker.
 */
export function stopImpressionFlushWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
