import { NextResponse } from "next/server";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CheckStatus = "ok" | "down";

const CHECK_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: PromiseLike<T>, ms = CHECK_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function checkDatabase(): Promise<CheckStatus> {
  try {
    const { error } = await withTimeout(
      supabaseAdmin.from("users").select("email", { count: "exact", head: true }).limit(1)
    );
    return error ? "down" : "ok";
  } catch {
    return "down";
  }
}

async function checkRedis(): Promise<CheckStatus> {
  try {
    if (!isRedisReady()) return "down";
    const pong = await withTimeout(redisConnection.ping());
    return pong === "PONG" ? "ok" : "down";
  } catch {
    return "down";
  }
}

/**
 * Liveness/readiness probe for uptime monitors and load balancers.
 *
 * - 200 + status "ok"       → database and cache reachable
 * - 200 + status "degraded" → database reachable, Redis down (app falls back to DB)
 * - 503 + status "down"     → database unreachable
 *
 * Intentionally returns only coarse per-dependency status (no hostnames, versions or
 * error messages) because the endpoint is public.
 */
export async function GET() {
  const started = Date.now();
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);

  const status = database === "down" ? "down" : redis === "down" ? "degraded" : "ok";

  return NextResponse.json(
    {
      status,
      checks: { database, redis },
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    },
    {
      status: status === "down" ? 503 : 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}

export async function HEAD() {
  const database = await checkDatabase();
  return new Response(null, {
    status: database === "down" ? 503 : 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
