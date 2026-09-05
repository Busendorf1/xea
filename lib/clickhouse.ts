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
      request_timeout: 10000,
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
  interaction_type: "view" | "phone" | "whatsapp" | "website" | "email" | "product_cta";
  device_type?: string;
  country?: string;
}

/**
 * High-Throughput Batch Ingestion into ClickHouse Cloud.
 * Ingests viral impression logs in a single compressed HTTP request.
 */
export async function streamImpressionsToClickHouse(events: ClickHouseImpressionEvent[]): Promise<boolean> {
  if (!events || events.length === 0) return true;

  const client = getClickHouseClient();
  if (!client) return false;

  try {
    await client.insert({
      table: "ad_impressions",
      values: events.map((e) => ({
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
  } catch (err) {
    console.warn("⚠️ ClickHouse batch ingestion warning:", err);
    return false;
  }
}
