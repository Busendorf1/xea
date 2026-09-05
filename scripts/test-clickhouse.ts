import dotenv from "dotenv";
dotenv.config();

import { streamImpressionsToClickHouse, getClickHouseClient } from "../lib/clickhouse";

async function main() {
  console.log("Connecting to ClickHouse Cloud...");
  const client = getClickHouseClient();
  if (!client) {
    console.error("Failed to initialize client - check .env");
    process.exit(1);
  }

  const pingResult = await client.ping();
  console.log("ClickHouse ping success:", pingResult.success);

  const testEvent = {
    ad_id: "00000000-0000-0000-0000-000000000001",
    user_email: "test_verification@xea.app",
    cost_per_impression: 25.0,
    interaction_type: "view" as const,
    device_type: "mobile_android",
    country: "NG",
  };

  const inserted = await streamImpressionsToClickHouse([testEvent]);
  console.log("Stream test impression inserted:", inserted);

  const queryResult = await client.query({
    query: "SELECT count(*) AS total FROM default.ad_impressions",
    format: "JSONEachRow",
  });
  const rows = await queryResult.json();
  console.log("Total rows in ClickHouse ad_impressions:", rows);

  await client.close();
}

main().catch(console.error);
