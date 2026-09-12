import { NextRequest, NextResponse } from "next/server";
import redisConnection, { isRedisReady } from "./redis";

export interface RateLimitConfig {
  limit: number;                 // Maximum allowed requests in window
  windowSeconds: number;         // Sliding window in seconds
  identifierPrefix: string;
  blockDurationSeconds?: number; // Optional penalty lockout duration (e.g. 6 hours = 21600s) on violation
}

export function getClientIp(request: NextRequest): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) {
    return xRealIp.trim();
  }
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }
  return "127.0.0.1";
}

// ---------------------------------------------------------------------------
// IN-MEMORY FALLBACK STORE (Active even if Redis is disabled or offline)
// ---------------------------------------------------------------------------
interface MemoryRateRecord {
  count: number;
  windowStart: number;
  blockedUntil?: number;
}

const memoryStore = new Map<string, MemoryRateRecord>();

// Routine cleanup every 10 minutes to prevent memory leaks
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memoryStore.entries()) {
      if ((v.blockedUntil && v.blockedUntil < now) || now - v.windowStart > 86400000) {
        memoryStore.delete(k);
      }
    }
  }, 600000);
}

function checkInMemoryRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; reset: number; response?: NextResponse } {
  const now = Date.now();
  let record = memoryStore.get(key);

  if (record && record.blockedUntil && record.blockedUntil > now) {
    const reset = Math.ceil((record.blockedUntil - now) / 1000);
    const response = NextResponse.json(
      {
        error: "Too many requests. Temporary security lockout active.",
        message: `Your IP has been restricted for ${Math.ceil(reset / 3600)} hour(s) due to excessive requests. Please retry later.`,
        retryAfter: reset,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(reset),
          "X-RateLimit-Limit": String(config.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(reset),
        },
      }
    );
    return { allowed: false, remaining: 0, reset, response };
  }

  if (!record || now - record.windowStart > config.windowSeconds * 1000) {
    record = { count: 1, windowStart: now };
    memoryStore.set(key, record);
    return { allowed: true, remaining: config.limit - 1, reset: config.windowSeconds };
  }

  record.count += 1;
  const remaining = Math.max(0, config.limit - record.count);
  const reset = Math.ceil((record.windowStart + config.windowSeconds * 1000 - now) / 1000);

  if (record.count > config.limit) {
    let blockSeconds = reset;
    if (config.blockDurationSeconds && config.blockDurationSeconds > 0) {
      record.blockedUntil = now + config.blockDurationSeconds * 1000;
      blockSeconds = config.blockDurationSeconds;
    }

    const response = NextResponse.json(
      {
        error: "Too many requests. Rate limit exceeded.",
        message: config.blockDurationSeconds
          ? `Excessive requests detected. Rate limited for ${Math.round(blockSeconds / 3600)} hour(s). Please retry in ${blockSeconds}s.`
          : `Rate limit of ${config.limit} requests per minute reached. Please retry in ${reset}s.`,
        retryAfter: blockSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(blockSeconds),
          "X-RateLimit-Limit": String(config.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(blockSeconds),
        },
      }
    );
    return { allowed: false, remaining: 0, reset: blockSeconds, response };
  }

  return { allowed: true, remaining, reset };
}

/**
 * High-performance edge/route rate limiter.
 * Drops malicious traffic bursts before database operations occur.
 * Features dual-layer protection: Redis RAM + In-Memory process fallback with penalty lockout.
 */
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig = { limit: 60, windowSeconds: 60, identifierPrefix: "rl" }
): Promise<{ allowed: boolean; remaining: number; reset: number; response?: NextResponse }> {
  const ip = getClientIp(request);
  const key = `ratelimit:${config.identifierPrefix}:${ip}`;
  const blockKey = `ratelimit:block:${config.identifierPrefix}:${ip}`;

  // Layer 1: In-Memory Fallback if Redis is disabled or offline before an attack begins
  if (!isRedisReady()) {
    return checkInMemoryRateLimit(key, config);
  }

  try {
    // 1. Check if IP is currently under an active penalty block window (e.g. 6-hour lockout)
    if (config.blockDurationSeconds && config.blockDurationSeconds > 0) {
      const blockTtl = await redisConnection.ttl(blockKey).catch(() => -2);
      if (blockTtl > 0) {
        const response = NextResponse.json(
          {
            error: "Too many requests. Temporary security lockout active.",
            message: `Your IP has been restricted for ${Math.ceil(blockTtl / 3600)} hour(s) due to excessive requests. Please retry later.`,
            retryAfter: blockTtl,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(blockTtl),
              "X-RateLimit-Limit": String(config.limit),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(blockTtl),
            },
          }
        );
        return { allowed: false, remaining: 0, reset: blockTtl, response };
      }
    }

    // 2. Atomic INCR + EXPIRE via Redis pipeline for sub-millisecond execution
    const pipeline = redisConnection.pipeline();
    pipeline.incr(key);
    pipeline.ttl(key);

    const results = await pipeline.exec();
    if (!results || results.length < 2) {
      return checkInMemoryRateLimit(key, config);
    }

    const currentCount = Number(results[0][1] || 1);
    let ttl = Number(results[1][1] || -1);

    // Set expiration on initial key creation
    if (ttl === -1) {
      await redisConnection.expire(key, config.windowSeconds);
      ttl = config.windowSeconds;
    }

    const remaining = Math.max(0, config.limit - currentCount);
    const reset = Math.max(0, ttl);

    if (currentCount > config.limit) {
      let penaltySeconds = reset;

      // Apply penalty lockout if configured (e.g. 6 hours = 21,600s)
      if (config.blockDurationSeconds && config.blockDurationSeconds > 0) {
        await redisConnection.set(blockKey, "1", "EX", config.blockDurationSeconds).catch(() => {});
        penaltySeconds = config.blockDurationSeconds;
      }

      const response = NextResponse.json(
        {
          error: "Too many requests. High traffic rate limit exceeded.",
          message: config.blockDurationSeconds
            ? `Excessive requests detected. Rate limited for ${Math.round(penaltySeconds / 3600)} hour(s). Please retry in ${penaltySeconds}s.`
            : `Rate limit of ${config.limit} requests per minute reached. Please retry in ${reset}s.`,
          retryAfter: penaltySeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(penaltySeconds),
            "X-RateLimit-Limit": String(config.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(penaltySeconds),
          },
        }
      );
      return { allowed: false, remaining: 0, reset: penaltySeconds, response };
    }

    return { allowed: true, remaining, reset };
  } catch (err) {
    console.warn("⚠️ Redis rate limiter error, falling back to In-Memory protection:", err);
    return checkInMemoryRateLimit(key, config);
  }
}
