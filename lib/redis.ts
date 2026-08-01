import Redis from "ioredis";

const redisHost = process.env.REDIS_HOST;
const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
const redisPassword = process.env.REDIS_PASSWORD;
const redisTls = process.env.REDIS_TLS === "true" || process.env.REDIS_TLS === "1";

const redisUrl = process.env.REDIS_URL || (redisHost && redisPassword
  ? `${redisTls ? "rediss" : "redis"}://:${encodeURIComponent(redisPassword)}@${redisHost}:${redisPort}`
  : "redis://127.0.0.1:6379");

const globalForRedis = global as unknown as { redis: Redis | undefined };

export const redisConnection = globalForRedis.redis ?? new Redis(redisUrl, {
  maxRetriesPerRequest: 2,
  connectTimeout: 5000,
  commandTimeout: 3000,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
  enableOfflineQueue: true,
});

redisConnection.on("error", (err) => {
  console.warn("⚠️ Upstash Redis Connection Alert:", err.message || err);
});

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redisConnection;
}

export default redisConnection;
