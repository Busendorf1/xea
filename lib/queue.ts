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
    removeOnComplete: true,
  },
});

