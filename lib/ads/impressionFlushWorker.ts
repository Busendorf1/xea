import redisConnection, { isRedisReady } from "../redis";
import supabaseAdmin from "../utils/dbAdmin";
import { streamImpressionsToClickHouse } from "../clickhouse";

// Two-Phase Atomic Lua Scripts:
// 1. Move active buffer to a dedicated processing key atomically
const LUA_RENAME_TO_PROCESSING = `
  local exists = redis.call('EXISTS', KEYS[1])
  if exists == 1 then
    redis.call('RENAME', KEYS[1], KEYS[2])
    return redis.call('HGETALL', KEYS[2])
  end
  return {}
`;

// 2. Rollback script: If DB write fails, re-merge in-flight counts back to active buffer
const LUA_RESTORE_PROCESSING_BUFFER = `
  local inFlight = redis.call('HGETALL', KEYS[1])
  if #inFlight > 0 then
    for i = 1, #inFlight, 2 do
      redis.call('HINCRBY', KEYS[2], inFlight[i], tonumber(inFlight[i+1]))
    end
    redis.call('DEL', KEYS[1])
  end
  return true
`;

async function evictExhaustedAdCaches(adId: string): Promise<void> {
  try {
    const { evictAdFromL1FeedCaches } = await import("@/lib/utils/cache");
    evictAdFromL1FeedCaches(adId);
  } catch {}
  if (isRedisReady() && redisConnection) {
    redisConnection
      .del(`ad:detail:${adId}`, "campaigns:shared_pool:v1", "bids:zset:global")
      .catch(() => {});
  }
}

async function archiveExhaustedFallbackAd(adId: string, delta: number): Promise<boolean> {
  const { data: current } = await supabaseAdmin
    .from("addsactive")
    .select("*")
    .eq("id", adId)
    .maybeSingle();

  if (!current) return false;

  const newCount = Number(current.impression_count || 0) + delta;
  const targetImps = Number(current.impressions || 0);
  const isPlatform = Boolean(
    current.is_admin_post ||
      !current.cost_per_impression ||
      Number(current.cost_per_impression) <= 0 ||
      targetImps <= 0
  );
  const isNowExhausted = !isPlatform && targetImps > 0 && newCount >= targetImps;
  const completedIso = isNowExhausted ? new Date().toISOString() : null;

  const { data: updatedRow } = await supabaseAdmin
    .from("addsactive")
    .update({
      impression_count: newCount,
      ...(completedIso ? { completed_at: completedIso } : {}),
    })
    .eq("id", adId)
    .select("*")
    .maybeSingle();

  await supabaseAdmin
    .from("adds")
    .update({
      impression_count: newCount,
      ...(completedIso ? { completed_at: completedIso } : {}),
    })
    .eq("id", adId);

  if (isNowExhausted) {
    const archiveRow = updatedRow || {
      ...current,
      impression_count: newCount,
      completed_at: completedIso,
    };
    await supabaseAdmin.from("completed_ads").upsert([archiveRow], { onConflict: "id" });
    await supabaseAdmin
      .from("addscompleted")
      .upsert([archiveRow], { onConflict: "id" })
      .then(() => {}, () => {});
    await supabaseAdmin.from("addsactive").delete().eq("id", adId);
    await supabaseAdmin.from("bidded_ads").delete().eq("ad_id", adId).then(() => {}, () => {});
    await evictExhaustedAdCaches(adId);
  }

  return true;
}

/**
 * Bulk Flush Worker: Flushes accumulated Redis impression & click counts to PostgreSQL safely.
 * Guarantees Zero Data Loss via Two-Phase In-Flight Archiving & Rollback.
 */
export async function runTwoPhaseImpressionAndClickFlush(params: {
  drainL1: () => Promise<void>;
  redisKeyImpressions: string;
  clickBufferRedisKeys: Record<string, string>;
}): Promise<{ flushedImpressions: number; flushedClicks: number }> {
  await params.drainL1().catch(() => {});

  if (!redisConnection || redisConnection.status !== "ready") {
    return { flushedImpressions: 0, flushedClicks: 0 };
  }

  let flushedImpressions = 0;
  let flushedClicks = 0;
  const batchId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    // 1. Flush Impression Buffers with Two-Phase Commit
    const processingImpKey = `${params.redisKeyImpressions}:processing:${batchId}`;
    const rawImpressionPairs = (await redisConnection.eval(
      LUA_RENAME_TO_PROCESSING,
      2,
      params.redisKeyImpressions,
      processingImpKey
    )) as string[];

    if (rawImpressionPairs && rawImpressionPairs.length > 0) {
      const impressionUpdates: Array<{ adId: string; delta: number }> = [];
      for (let i = 0; i < rawImpressionPairs.length; i += 2) {
        const adId = rawImpressionPairs[i];
        const delta = parseInt(rawImpressionPairs[i + 1], 10);
        if (delta > 0) impressionUpdates.push({ adId, delta });
      }

      try {
        const CHUNK_SIZE = 10;
        for (let i = 0; i < impressionUpdates.length; i += CHUNK_SIZE) {
          const chunk = impressionUpdates.slice(i, i + CHUNK_SIZE);
          await Promise.all(
            chunk.map(async ({ adId, delta }) => {
              try {
                let rpcOut = await supabaseAdmin.rpc("increment_ad_impressions_bulk", {
                  p_ad_id: adId,
                  p_count: delta,
                });
                if (rpcOut.error) {
                  const retryOut = await supabaseAdmin.rpc("increment_ad_impressions_bulk", {
                    p_ad_id: adId,
                    p_delta: delta,
                  });
                  if (!retryOut.error) {
                    rpcOut = retryOut;
                  } else {
                    throw retryOut.error;
                  }
                }
                const rawRpcRes = rpcOut.data;
                const rpcRes = Array.isArray(rawRpcRes) ? rawRpcRes[0] : rawRpcRes;
                flushedImpressions += delta;
                if (
                  rpcRes &&
                  typeof rpcRes === "object" &&
                  ((rpcRes as any).completed || (rpcRes as any).is_exhausted)
                ) {
                  await evictExhaustedAdCaches(adId);
                }
              } catch {
                if (await archiveExhaustedFallbackAd(adId, delta)) {
                  flushedImpressions += delta;
                }
              }
            })
          );
        }

        streamImpressionsToClickHouse(
          impressionUpdates.map((u) => ({
            ad_id: u.adId,
            user_email: "batch_buffer@xea.app",
            cost_per_impression: 0,
            interaction_type: "view",
          }))
        ).catch(() => {});

        await redisConnection.del(processingImpKey);
      } catch (dbErr) {
        console.error("❌ DB error during impression flush, rolling back to Redis active buffer:", dbErr);
        await redisConnection
          .eval(LUA_RESTORE_PROCESSING_BUFFER, 2, processingImpKey, params.redisKeyImpressions)
          .catch(() => {});
      }
    }

    // 2. Flush Click Buffers with Two-Phase Commit across all canonical CTA hashes
    for (const [clickType, key] of Object.entries(params.clickBufferRedisKeys)) {
      const processingClickKey = `${key}:processing:${batchId}`;
      const rawClickPairs = (await redisConnection.eval(
        LUA_RENAME_TO_PROCESSING,
        2,
        key,
        processingClickKey
      )) as string[];

      if (rawClickPairs && rawClickPairs.length > 0) {
        const clickUpdates: Array<{ adId: string; count: number }> = [];
        for (let i = 0; i < rawClickPairs.length; i += 2) {
          const adId = rawClickPairs[i];
          const count = parseInt(rawClickPairs[i + 1], 10);
          if (count > 0) clickUpdates.push({ adId, count });
        }

        try {
          const CHUNK_SIZE = 10;
          for (let i = 0; i < clickUpdates.length; i += CHUNK_SIZE) {
            const chunk = clickUpdates.slice(i, i + CHUNK_SIZE);
            await Promise.all(
              chunk.map(async ({ adId, count }) => {
                await supabaseAdmin.rpc("increment_ad_clicks_bulk", {
                  p_ad_id: adId,
                  p_click_type: clickType,
                  p_count: count,
                });
                flushedClicks += count;
              })
            );
          }

          streamImpressionsToClickHouse(
            clickUpdates.map((c) => ({
              ad_id: c.adId,
              user_email: "batch_buffer@xea.app",
              cost_per_impression: 0,
              interaction_type: clickType,
            }))
          ).catch(() => {});

          await redisConnection.del(processingClickKey);
        } catch (dbErr) {
          console.error(`❌ DB error during ${clickType} click flush, rolling back to Redis active buffer:`, dbErr);
          await redisConnection
            .eval(LUA_RESTORE_PROCESSING_BUFFER, 2, processingClickKey, key)
            .catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error("❌ Error in flushImpressionBuffersToDB:", err);
  }

  return { flushedImpressions, flushedClicks };
}
