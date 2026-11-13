import { getClickHouseClient } from "../clickhouse";
import { flushAtwScoreBufferToDB } from "../atwBuffer";
import { feedWorker, flushBatch } from "./feedWorker";
import { campaignsWorker, hlsWorker } from "./campaignHlsWorkers";
import { adRatingWorker, paymentWorker } from "./paymentRatingWorkers";

const CLICKHOUSE_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const ATW_FLUSH_INTERVAL_MS = 10 * 1000;

export async function pingClickHouseHeartbeat(): Promise<boolean> {
  const client = getClickHouseClient();
  if (!client) return false;

  try {
    const pingResult = await client.ping();
    if (pingResult.success) {
      await client.query({
        query: "SELECT 1",
        format: "JSONEachRow",
      });
      console.log("⚡ [Render Worker] ClickHouse Cloud keep-alive ping successful (Instance Warm)");
      return true;
    }
    return false;
  } catch (err: any) {
    console.warn("⚠️ [Render Worker] ClickHouse keep-alive ping warning:", err?.message || err);
    return false;
  }
}

let clickhouseHeartbeatTimer: NodeJS.Timeout | null = null;
let atwFlushTimer: NodeJS.Timeout | null = null;

if (process.env.NODE_ENV !== "test") {
  setTimeout(() => {
    pingClickHouseHeartbeat().catch(() => {});
  }, 10000);

  clickhouseHeartbeatTimer = setInterval(() => {
    pingClickHouseHeartbeat().catch(() => {});
  }, CLICKHOUSE_HEARTBEAT_INTERVAL_MS);

  atwFlushTimer = setInterval(() => {
    flushAtwScoreBufferToDB().catch((err) => {
      console.warn("⚠️ [Write-Behind] ATW flush interval warning:", err?.message || err);
    });
  }, ATW_FLUSH_INTERVAL_MS);
}

export async function shutdownWorkers(): Promise<void> {
  console.log("🛑 Gracefully shutting down BullMQ workers...");
  if (clickhouseHeartbeatTimer) {
    clearInterval(clickhouseHeartbeatTimer);
    clickhouseHeartbeatTimer = null;
  }
  if (atwFlushTimer) {
    clearInterval(atwFlushTimer);
    atwFlushTimer = null;
  }
  await flushAtwScoreBufferToDB().catch(() => {});

  try {
    await flushBatch();
    await Promise.all([
      feedWorker.close(),
      campaignsWorker.close(),
      hlsWorker.close(),
      paymentWorker.close(),
      adRatingWorker.close(),
    ]);
    console.log("✅ All BullMQ workers closed gracefully.");
  } catch (err) {
    console.error("❌ Error during worker shutdown:", err);
  }
}
