import Redis, { RedisOptions } from "ioredis";

const redisHost = process.env.REDIS_HOST;
const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
const redisPassword = process.env.REDIS_PASSWORD;
const redisTls = process.env.REDIS_TLS === "true" || process.env.REDIS_TLS === "1";

const redisUrl = process.env.REDIS_URL || (redisHost && redisPassword
  ? `${redisTls ? "rediss" : "redis"}://:${encodeURIComponent(redisPassword)}@${redisHost}:${redisPort}`
  : (process.env.NODE_ENV === "production" ? "" : "redis://127.0.0.1:6379"));

const globalForRedis = global as unknown as { redisRaw: Redis | undefined; redisSafe: Redis | undefined };

const useTls = redisTls || (!!redisUrl && redisUrl.startsWith("rediss://"));

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: 2,
  connectTimeout: 4000, // Fail fast on network/DNS timeout instead of freezing requests for 10s
  commandTimeout: 2500,
  keepAlive: 15000,      // Keep TCP socket alive over NAT firewalls and idle connections
  autoResubscribe: true,
  enableOfflineQueue: false, // Handled via safe proxy below so offline calls fail fast without queuing
  lazyConnect: false,    // Connect immediately on boot so it's ready when requests arrive
  retryStrategy(times: number) {
    // Continual exponential backoff with max 3s delay - NEVER stop reconnecting
    return Math.min(times * 250, 3000);
  },
  reconnectOnError(err: Error) {
    const targetError = "READONLY";
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
};

if (useTls) {
  redisOptions.tls = {
    rejectUnauthorized: false,
  };
}

function createRawRedisClient(): Redis {
  const client = new Redis(redisUrl, redisOptions);

  let lastWarnTime = 0;
  client.on("error", (err: any) => {
    // Only log actionable network errors, not transient expected closed states or DNS lookups during reconnect
    const isTransient =
      err?.code === "ECONNREFUSED" ||
      err?.code === "ENOTFOUND" ||
      err?.code === "EAI_AGAIN" ||
      err?.code === "ETIMEDOUT" ||
      err?.message === "Connection is closed." ||
      err?.message?.includes("ETIMEDOUT") ||
      err?.message?.includes("ENOTFOUND");

    if (!isTransient) {
      console.warn("⚠️ Redis Connection Alert:", err.message || err);
    } else {
      // Throttle transient warnings to once every 30 seconds
      const now = Date.now();
      if (now - lastWarnTime > 30000) {
        lastWarnTime = now;
        console.warn("⚠️ Redis offline / unreachable (transient):", err?.message || err?.code);
      }
    }
  });

  client.on("connect", () => {
    console.log("⚡ Upstash Redis connected successfully");
  });

  return client;
}

const rawClient: Redis = globalForRedis.redisRaw ?? createRawRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisRaw = rawClient;
}

/**
 * Creates a fail-safe Proxy around ioredis that guarantees callers NEVER crash
 * with "Error: Connection is closed."
 * - If Redis is ready: executes the command immediately.
 * - If Redis is connecting or disconnected: safe reads return null, safe writes return null/0,
 *   and it triggers background reconnection without blocking or throwing.
 */
function createSafeRedisProxy(client: Redis): Redis {
  return new Proxy(client, {
    get(target: any, prop: string | symbol, receiver: any) {
      const orig = Reflect.get(target, prop, receiver);

      if (typeof orig === "function") {
        const method = String(prop).toLowerCase();

        // Handle multi and pipeline chaining safely
        if (method === "multi" || method === "pipeline") {
          return (...args: any[]) => {
            const batch = orig.apply(target, args);
            if (batch && typeof batch.exec === "function") {
              const origExec = batch.exec;
              batch.exec = async (...execArgs: any[]) => {
                if (target.status !== "ready") {
                  return [];
                }
                try {
                  return await origExec.apply(batch, execArgs);
                } catch (err: any) {
                  const msg = String(err?.message || "");
                  if (
                    msg.includes("Connection is closed") ||
                    msg.includes("closed") ||
                    msg.includes("Command timed out") ||
                    msg.includes("enableOfflineQueue")
                  ) {
                    if (target.status === "close" || target.status === "end") {
                      try { target.connect().catch(() => {}); } catch {}
                    }
                    return [];
                  }
                  throw err;
                }
              };
            }
            return batch;
          };
        }

        // Intercept async redis commands
        return async (...args: any[]) => {
          const status = target.status;
          const isReady = status === "ready";

          // If client was closed or ended, automatically initiate reconnection
          if (status === "close" || status === "end") {
            try {
              target.connect().catch(() => {});
            } catch {}
          }

          // If Redis is not ready, fail fast and return safe fallbacks instead of throwing
          if (!isReady) {
            if (method === "hgetall") {
              return {};
            }
            // Common read methods
            if (method === "get" || method === "hget" || method === "mget" || method === "lrange" || method === "smembers") {
              return null;
            }
            // Common boolean, counter, or count methods
            if (
              method === "exists" ||
              method === "del" ||
              method === "hdel" ||
              method === "publish" ||
              method === "srem" ||
              method === "scard" ||
              method === "hlen" ||
              method === "sismember" ||
              method === "incr" ||
              method === "incrby" ||
              method === "hincrby" ||
              method === "decr" ||
              method === "decrby"
            ) {
              return 0;
            }
            // Mutation methods
            if (method === "set" || method === "hset" || method === "setex" || method === "expire") {
              return null;
            }
            return null;
          }

          // Never allow blocking O(N) KEYS command in production; transparently route to cursor-based SCAN
          if (method === "keys") {
            const pattern = String(args[0] || "*");
            return scanKeys(pattern);
          }

          // Redis is ready: execute command with protection against mid-flight disconnects
          try {
            return await orig.apply(target, args);
          } catch (err: any) {
            const errMsg = String(err?.message || "");
            const isConnectionError =
              errMsg.includes("Connection is closed") ||
              errMsg.includes("closed") ||
              errMsg.includes("Command timed out") ||
              errMsg.includes("enableOfflineQueue") ||
              errMsg.includes("Stream isn't writeable") ||
              errMsg.includes("not writeable") ||
              err?.code === "ECONNREFUSED" ||
              err?.code === "ECONNRESET" ||
              err?.code === "ETIMEDOUT";

            if (isConnectionError) {
              if (target.status === "close" || target.status === "end") {
                try {
                  target.connect().catch(() => {});
                } catch {}
              }
              if (method === "hgetall") {
                return {};
              }
              if (
                method === "exists" ||
                method === "del" ||
                method === "hdel" ||
                method === "publish" ||
                method === "srem" ||
                method === "scard" ||
                method === "hlen" ||
                method === "sismember" ||
                method === "incr" ||
                method === "incrby" ||
                method === "hincrby" ||
                method === "decr" ||
                method === "decrby"
              ) {
                return 0;
              }
              return null;
            }
            throw err;
          }
        };
      }

      return orig;
    },
  });
}

// Always wrap rawClient with the fail-safe proxy
export const redisConnection: Redis = createSafeRedisProxy(rawClient);

export const isRedisReady = (): boolean => {
  return !!rawClient && rawClient.status === "ready";
};

/**
 * Non-blocking cursor-based SCAN replacement for Redis `KEYS`.
 * Prevents O(N) global event-loop stalls at 100M+ scale.
 */
export async function scanKeys(pattern: string, maxKeys = 2000): Promise<string[]> {
  if (!isRedisReady()) return [];
  const collected: string[] = [];
  let cursor = "0";
  let iterations = 0;
  const maxIterations = 50;

  try {
    do {
      const res = await rawClient.scan(cursor, "MATCH", pattern, "COUNT", 250);
      if (!res || !Array.isArray(res)) break;
      cursor = String(res[0] || "0");
      const batch = Array.isArray(res[1]) ? res[1] : [];
      for (const k of batch) {
        collected.push(k);
        if (collected.length >= maxKeys) return collected;
      }
      iterations++;
    } while (cursor !== "0" && iterations < maxIterations);
  } catch {}

  return collected;
}

/**
 * Non-blocking pattern invalidation using cursor-based SCAN + UNLINK/DEL in chunks.
 */
export async function scanDeletePattern(pattern: string): Promise<number> {
  if (!isRedisReady()) return 0;
  const keys = await scanKeys(pattern, 2000);
  if (keys.length === 0) return 0;

  let deleted = 0;
  const chunkSize = 200;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const slice = keys.slice(i, i + chunkSize);
    try {
      const count = await redisConnection.del(...slice);
      deleted += Number(count || 0);
    } catch {}
  }
  return deleted;
}

export default redisConnection;


