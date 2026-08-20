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
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
  commandTimeout: 1500,
  retryStrategy(times) {
    if (times > 3) return null; // stop retrying and fail fast
    return Math.min(times * 500, 2000);
  },
  enableOfflineQueue: false, // Fail fast instead of queuing and hanging API requests
  lazyConnect: true,
  autoResubscribe: false,
});

redisConnection.on("error", (err) => {
  console.warn("⚠️ Upstash Redis Connection Alert:", err.message || err);
});

export const isRedisReady = (): boolean => {
  return !!redisConnection && redisConnection.status === "ready";
};

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redisConnection;
}

export default redisConnection;
