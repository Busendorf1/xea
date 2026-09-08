import { createClient, ClickHouseClient } from "@clickhouse/client";

let clickhouseClientInstance: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient | null {
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
      request_timeout: 30000,
      max_open_connections: 50,
    });
    return clickhouseClientInstance;
  } catch (err) {
    console.warn("⚠️ Failed to initialize ClickHouse client:", err);
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
    console.warn("⚠️ ClickHouse batch ingestion warning:", err?.message || err);
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
