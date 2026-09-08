import { NextRequest, NextResponse } from "next/server";
import redisConnection, { isRedisReady } from "./redis";

export interface RateLimitConfig {
  limit: number;      // Maximum allowed requests in window
  windowSeconds: number; // Sliding window in seconds
  identifierPrefix: string;
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

/**
 * High-performance edge/route rate limiter.
 * Drops malicious traffic bursts (e.g. >60 req/min per IP) before database operations occur.
 */
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig = { limit: 60, windowSeconds: 60, identifierPrefix: "rl" }
): Promise<{ allowed: boolean; remaining: number; reset: number; response?: NextResponse }> {
  if (!isRedisReady()) {
    // Fail open if Redis is unreachable so valid users are never blocked
    return { allowed: true, remaining: config.limit, reset: 0 };
  }

  try {
    const ip = getClientIp(request);
    const key = `ratelimit:${config.identifierPrefix}:${ip}`;
    
    // Atomic INCR + EXPIRE via Redis pipeline for sub-millisecond execution
    const pipeline = redisConnection.pipeline();
    pipeline.incr(key);
    pipeline.ttl(key);
    
    const results = await pipeline.exec();
    if (!results || results.length < 2) {
      return { allowed: true, remaining: config.limit, reset: 0 };
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
      const response = NextResponse.json(
        {
          error: "Too many requests. High traffic rate limit exceeded.",
          message: `Rate limit of ${config.limit} requests per minute reached. Please retry in ${reset}s.`,
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

    return { allowed: true, remaining, reset };
  } catch (err) {
    console.warn("⚠️ Rate limiter check failed, failing open:", err);
    return { allowed: true, remaining: config.limit, reset: 0 };
  }
}
