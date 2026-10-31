import { Queue, QueueOptions } from "bullmq";
import { env } from "./env";
import { isRedisReady } from "./redis";

const connectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  tls: env.REDIS_TLS === "true" ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: true,
};

const queueInstances = new Map<string, Queue>();
let lastQueueQuotaWarn = 0;

function getOrCreateQueue(name: string, defaultJobOptions: QueueOptions["defaultJobOptions"]): Queue | null {
  if (!isRedisReady()) {
    return null;
  }
  let q = queueInstances.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: connectionOptions,
      defaultJobOptions,
    });
    q.on("error", (err: any) => {
      const msg = String(err?.message || err || "");
      if (msg.includes("max requests limit exceeded") || msg.includes("NOPERM")) {
        const now = Date.now();
        if (now - lastQueueQuotaWarn > 60000) {
          lastQueueQuotaWarn = now;
          console.warn(`⚠️ Queue [${name}] paused (Upstash quota limit reached)`);
        }
        return;
      }
      if (err?.code !== "ECONNREFUSED" && err?.code !== "ENOTFOUND" && err?.code !== "ETIMEDOUT") {
        console.warn(`⚠️ Queue [${name}] connection warning:`, msg);
      }
    });
    queueInstances.set(name, q);
  }
  return q;
}

function createSafeLazyQueue(name: string, defaultJobOptions: QueueOptions["defaultJobOptions"]): Queue {
  const dummyTarget = { name } as unknown as Queue;
  return new Proxy(dummyTarget, {
    get(_target, prop, receiver) {
      if (prop === "name") return name;
      if (prop === "on") return () => receiver;
      if (prop === "add" || prop === "addBulk") {
        return async (...args: any[]) => {
          const q = getOrCreateQueue(name, defaultJobOptions);
          if (!q) return null;
          try {
            return await (q as any)[prop](...args);
          } catch {
            return null;
          }
        };
      }
      const q = getOrCreateQueue(name, defaultJobOptions);
      if (!q) return () => Promise.resolve(null);
      const val = Reflect.get(q, prop, q);
      return typeof val === "function" ? val.bind(q) : val;
    },
  });
}

export const feedQueue = createSafeLazyQueue("feed-events", {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: { count: 1000, age: 3600 },
  removeOnFail: { count: 5000, age: 86400 },
});

export const paymentQueue = createSafeLazyQueue("payment-processing", {
  attempts: 5,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { count: 1000, age: 3600 },
  removeOnFail: { count: 5000, age: 86400 },
});

export const campaignsQueue = createSafeLazyQueue("campaigns-events", {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { count: 500, age: 3600 },
  removeOnFail: { count: 2000, age: 86400 },
});

export const hlsQueue = createSafeLazyQueue("hls-transcode-events", {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { count: 200, age: 3600 },
  removeOnFail: { count: 1000, age: 86400 },
});

export const adRatingQueue = createSafeLazyQueue("ad-rating-events", {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { count: 500, age: 3600 },
  removeOnFail: { count: 2000, age: 86400 },
});


