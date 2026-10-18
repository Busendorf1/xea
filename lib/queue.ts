import { Queue } from "bullmq";
import { env } from "./env";

const connectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  tls: env.REDIS_TLS === "true" ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: null,
};

export const feedQueue = new Queue("feed-events", {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: { count: 1000, age: 3600 },
    removeOnFail: { count: 5000, age: 86400 },
  },
});

export const paymentQueue = new Queue("payment-processing", {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: { count: 1000, age: 3600 },
    removeOnFail: { count: 5000, age: 86400 },
  },
});

export const campaignsQueue = new Queue("campaigns-events", {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: { count: 500, age: 3600 },
    removeOnFail: { count: 2000, age: 86400 },
  },
});

export const hlsQueue = new Queue("hls-transcode-events", {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 200, age: 3600 },
    removeOnFail: { count: 1000, age: 86400 },
  },
});

export const adRatingQueue = new Queue("ad-rating-events", {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: { count: 500, age: 3600 },
    removeOnFail: { count: 2000, age: 86400 },
  },
});

// Suppress unhandled ioredis connection error events during transient network/DNS blips
const allQueues = [feedQueue, paymentQueue, campaignsQueue, hlsQueue, adRatingQueue];
allQueues.forEach((q) => {
  q.on("error", (err: any) => {
    // Only log once or ignore transient offline events
    if (err?.code !== "ECONNREFUSED" && err?.code !== "ENOTFOUND" && err?.code !== "ETIMEDOUT") {
      console.warn(`⚠️ Queue [${q.name}] connection warning:`, err?.message || err);
    }
  });
});


