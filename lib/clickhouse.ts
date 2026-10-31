import { createClient, ClickHouseClient, ClickHouseLogLevel } from "@clickhouse/client";

let clickhouseClientInstance: ClickHouseClient | null = null;
let clickhouseOfflineUntil = 0;
let lastClickhouseWarnTime = 0;

function handleClickHouseOfflineError(context: string, err: any) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  const isDnsOrNetwork =
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT");

  const now = Date.now();
  if (isDnsOrNetwork) {
    // Pause ClickHouse attempts for 5 minutes when host is unreachable
    clickhouseOfflineUntil = now + 5 * 60 * 1000;
  }
  if (now - lastClickhouseWarnTime > 60000) {
    lastClickhouseWarnTime = now;
    console.warn(`⚠️ ClickHouse ${context} notice (circuit-breaker 5m): ${msg}`);
  }
}

export function getClickHouseClient(): ClickHouseClient | null {
  if (Date.now() < clickhouseOfflineUntil) return null;
  if (clickhouseClientInstance) return clickhouseClientInstance;

  const url = process.env.CLICKHOUSE_HOST;
  const username = process.env.CLICKHOUSE_USER || "default";
  const password = process.env.CLICKHOUSE_PASSWORD;
  const database = process.env.CLICKHOUSE_DATABASE || "default";

  if (!url || !password) {
    return null;
  }

  try {
    clickhouseClientInstance = createClient({
      url,
      username,
      password,
      database,
      request_timeout: 10000,
      max_open_connections: 50,
      log: {
        level: ClickHouseLogLevel.OFF,
      },
    });
    return clickhouseClientInstance;
  } catch (err) {
    handleClickHouseOfflineError("initialization", err);
    return null;
  }
}

export interface ClickHouseImpressionEvent {
  ad_id: string;
  user_email: string;
  cost_per_impression: number;
  interaction_type: string;
  device_type?: string;
  country?: string;
}

// In-memory micro-batch queue:
// Merges rapid concurrent requests into unified bulk HTTP inserts (ClickHouse native design)
const eventQueue: ClickHouseImpressionEvent[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let isFlushing = false;

export async function flushClickHouseQueue(): Promise<boolean> {
  if (isFlushing || eventQueue.length === 0) return true;
  isFlushing = true;

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const batch = eventQueue.splice(0, eventQueue.length);
  const client = getClickHouseClient();
  if (!client) {
    isFlushing = false;
    return false;
  }

  try {
    await client.insert({
      table: "ad_impressions",
      values: batch.map((e) => ({
        ad_id: e.ad_id,
        user_email: e.user_email.toLowerCase().trim(),
        cost_per_impression: Number(e.cost_per_impression) || 0,
        interaction_type: e.interaction_type,
        device_type: e.device_type || "unknown",
        country: e.country || "NG",
      })),
      format: "JSONEachRow",
    });
    return true;
  } catch (err: any) {
    handleClickHouseOfflineError("batch ingestion", err);
    return false;
  } finally {
    isFlushing = false;
    if (eventQueue.length > 0) {
      scheduleFlush();
    }
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushClickHouseQueue().catch(() => {});
  }, 1000); // 1-second debounce buffer for high-throughput batching
}

/**
 * High-Throughput Micro-Batch Ingestion into ClickHouse Cloud.
 * Ingests viral impression logs in debounced, compressed bulk batches.
 */
export async function streamImpressionsToClickHouse(events: ClickHouseImpressionEvent[]): Promise<boolean> {
  if (!events || events.length === 0) return true;

  eventQueue.push(...events);

  // If buffer reaches 25+ events, flush immediately without waiting for debounce timer
  if (eventQueue.length >= 25) {
    flushClickHouseQueue().catch(() => {});
  } else {
    scheduleFlush();
  }

  return true;
}

/**
 * Fast analytical query to retrieve campaign impression count per ad from ClickHouse.
 * Executes across millions of rows in single-digit milliseconds.
 */
export async function getCampaignDeliveryCounts(adIds?: string[]): Promise<Record<string, number>> {
  const client = getClickHouseClient();
  if (!client) return {};

  try {
    const hasFilter = Array.isArray(adIds) && adIds.length > 0;
    const whereClause = hasFilter ? "WHERE ad_id IN ({adIds:Array(String)})" : "";

    const resultSet = await client.query({
      query: `
        SELECT ad_id, count() AS total_delivered
        FROM default.ad_impressions
        ${whereClause}
        GROUP BY ad_id
      `,
      query_params: hasFilter ? { adIds } : undefined,
      format: "JSONEachRow",
    });

    const rows: { ad_id: string; total_delivered: string | number }[] = await resultSet.json();
    const result: Record<string, number> = {};
    rows.forEach((r) => {
      if (r.ad_id) {
        result[r.ad_id] = Number(r.total_delivered || 0);
      }
    });
    return result;
  } catch (err: any) {
    handleClickHouseOfflineError("delivery counts query", err);
    return {};
  }
}
