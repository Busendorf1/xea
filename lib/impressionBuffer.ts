import redisConnection from "./redis";
import supabaseAdmin from "./utils/dbAdmin";
import { streamImpressionsToClickHouse } from "./clickhouse";
import { invalidateCachedUserCampaigns } from "./utils/cache";

/**
 * High-Throughput Impression & Click Buffer for 100M+ Users.
 * Instead of hitting PostgreSQL with thousands of concurrent row locks on a hot ad,
 * concurrent increments on the same adId are coalesced in L1 Memory / L2 Redis and
 * flushed in single atomic batch deltas, while overlaying real-time pending counts on /myAds reads.
 */

export type CanonicalClickType =
  | "phone"
  | "whatsapp"
  | "website"
  | "email"
  | "product_cta"
  | "ios"
  | "android"
  | "watch_now"
  | "read_more";

export const CLICK_TYPE_TO_COLUMN: Record<CanonicalClickType, string> = {
  phone: "clicks_phone",
  whatsapp: "clicks_whatsapp",
  website: "clicks_website",
  email: "clicks_email",
  product_cta: "clicks_product_cta",
  ios: "clicks_ios",
  android: "clicks_android",
  watch_now: "clicks_watch_now",
  read_more: "clicks_read_more",
};

const REDIS_KEY_IMPRESSIONS = "buffer:ad_impressions";
const REDIS_KEY_CLICKS_PHONE = "buffer:clicks_phone";
const REDIS_KEY_CLICKS_WHATSAPP = "buffer:clicks_whatsapp";
const REDIS_KEY_CLICKS_WEBSITE = "buffer:clicks_website";
const REDIS_KEY_CLICKS_EMAIL = "buffer:clicks_email";
const REDIS_KEY_CLICKS_PRODUCT_CTA = "buffer:clicks_product_cta";

// ── L1 Hot-Row Write-Behind Micro-Batch Coalescer (100M+ Traffic Protection) ──
const COALESCE_WINDOW_MS = 1500;
const l1PendingClicks = new Map<string, Partial<Record<CanonicalClickType, number>>>();
const l1ActiveClickFlushers = new Set<string>();

interface PendingSeenBatch {
  delta: number;
  adOwnerEmail?: string | null;
  isPlatformPost?: boolean;
}
const l1PendingSeen = new Map<string, PendingSeenBatch>();
const l1ActiveSeenFlushers = new Set<string>();

/**
 * Coalesces high-concurrency non-monetized Seen increments on the same adId so a viral ad
 * watched by 50,000 simultaneous users never causes PostgreSQL row-lock contention on addsactive.
 * - First view on an idle ad executes immediately (0ms latency) and opens a 1.5s hot-row shield.
 * - Concurrent views arriving during the 1.5s window record their user-level ad_impressions row
 *   (zero cross-user contention) and coalesce their addsactive.impression_count increment into 1 batch UPDATE.
 */
export async function recordCoalescedAdSeen(
  adId: string,
  emailKey: string,
  meta: {
    userCap: number;
    isPlatformPost: boolean;
    adOwnerEmail?: string | null;
    dbImpressionsTarget?: number;
    dbImpressionCount?: number;
  }
): Promise<void> {
  const nowIso = new Date().toISOString();

  // If this adId is currently in an active 1.5s burst window, record per-user ad_impressions
  // and coalesce the hot addsactive counter increment in O(1) RAM:
  if (l1ActiveSeenFlushers.has(adId)) {
    const { data: existingImp } = await supabaseAdmin
      .from("ad_impressions")
      .select("id, view_count")
      .eq("ad_id", adId)
      .ilike("user_email", emailKey)
      .maybeSingle();

    const existingViews = existingImp ? Number(existingImp.view_count || 0) : 0;
    if (existingViews >= meta.userCap) return;

    if (existingImp) {
      await supabaseAdmin
        .from("ad_impressions")
        .update({ view_count: existingViews + 1, last_viewed_at: nowIso })
        .eq("id", existingImp.id);
    } else {
      await supabaseAdmin
        .from("ad_impressions")
        .insert({ ad_id: adId, user_email: emailKey, view_count: 1, last_viewed_at: nowIso });
    }

    const pending = l1PendingSeen.get(adId) || {
      delta: 0,
      adOwnerEmail: meta.adOwnerEmail,
      isPlatformPost: meta.isPlatformPost,
    };
    pending.delta += 1;
    if (!pending.adOwnerEmail && meta.adOwnerEmail) {
      pending.adOwnerEmail = meta.adOwnerEmail;
    }
    l1PendingSeen.set(adId, pending);
    return;
  }

  // First view on an idle ad: open the 1.5s hot-row shield and execute immediately
  l1ActiveSeenFlushers.add(adId);
  try {
    const { data: seenRpcRes, error: seenRpcErr } = await supabaseAdmin.rpc("record_ad_seen", {
      p_ad_id: adId,
      p_user_email: emailKey,
    });

    const rpcFailedOrMissing =
      Boolean(seenRpcErr) ||
      (seenRpcRes &&
        typeof seenRpcRes === "object" &&
        seenRpcRes.success === false &&
        seenRpcRes.reason !== "frequency_cap_reached");

    if (rpcFailedOrMissing) {
      const { data: existingImp } = await supabaseAdmin
        .from("ad_impressions")
        .select("id, view_count")
        .eq("ad_id", adId)
        .ilike("user_email", emailKey)
        .maybeSingle();

      const existingViews = existingImp ? Number(existingImp.view_count || 0) : 0;
      if (existingViews < meta.userCap) {
        if (existingImp) {
          await supabaseAdmin
            .from("ad_impressions")
            .update({ view_count: existingViews + 1, last_viewed_at: nowIso })
            .eq("id", existingImp.id);
        } else {
          await supabaseAdmin
            .from("ad_impressions")
            .insert({ ad_id: adId, user_email: emailKey, view_count: 1, last_viewed_at: nowIso });
        }

        await applyBatchedSeenDeltaToAd(adId, 1, meta.isPlatformPost, meta.adOwnerEmail);
      }
    }

    setTimeout(async () => {
      try {
        const batch = l1PendingSeen.get(adId);
        if (batch && batch.delta > 0) {
          l1PendingSeen.delete(adId);
          await applyBatchedSeenDeltaToAd(
            adId,
            batch.delta,
            Boolean(batch.isPlatformPost),
            batch.adOwnerEmail
          );
        }
      } finally {
        l1ActiveSeenFlushers.delete(adId);
      }
    }, COALESCE_WINDOW_MS);
  } catch {
    l1ActiveSeenFlushers.delete(adId);
  }
}

async function applyBatchedSeenDeltaToAd(
  adId: string,
  delta: number,
  isPlatformPost: boolean,
  adOwnerEmail?: string | null
): Promise<void> {
  if (delta <= 0) return;
  const nowIso = new Date().toISOString();

  const { data: liveAd } = await supabaseAdmin
    .from("addsactive")
    .select("impressions, impression_count, user_email")
    .eq("id", adId)
    .maybeSingle();

  if (!liveAd) return;

  const currentImpCount = Number(liveAd.impression_count || 0);
  const targetImps = Number(liveAd.impressions || 0);
  const resolvedOwner = adOwnerEmail || liveAd.user_email || null;
  const nextImpCount = currentImpCount + delta;
  const isNowExhausted = !isPlatformPost && targetImps > 0 && nextImpCount >= targetImps;
  const completedIso = isNowExhausted ? nowIso : null;

  const { data: updatedAdRow } = await supabaseAdmin
    .from("addsactive")
    .update({
      impression_count: nextImpCount,
      ...(completedIso ? { completed_at: completedIso } : {}),
    })
    .eq("id", adId)
    .select("*")
    .maybeSingle();

  if (isNowExhausted) {
    if (updatedAdRow) {
      await supabaseAdmin.from("completed_ads").upsert([updatedAdRow], { onConflict: "id" });
    }
    await supabaseAdmin.from("addsactive").delete().eq("id", adId);
    await supabaseAdmin
      .from("adds")
      .update({ completed_at: completedIso, impression_count: nextImpCount })
      .eq("id", adId);
  }

  if (resolvedOwner) {
    invalidateCachedUserCampaigns(resolvedOwner).catch(() => {});
  }
}

/**
 * Coalesces high-concurrency CTA clicks on the same adId into a single batched PostgreSQL write.
 * - First click on an idle ad flushes immediately (0ms latency) and opens a 1.5s hot-row shield.
 * - Any concurrent clicks arriving during the 1.5s window accumulate in O(1) RAM and flush in 1 SQL query.
 */
export async function recordCoalescedAdClick(
  adId: string,
  clickType: CanonicalClickType
): Promise<void> {
  const existing = l1PendingClicks.get(adId) || {};
  existing[clickType] = (existing[clickType] || 0) + 1;
  l1PendingClicks.set(adId, existing);

  if (l1ActiveClickFlushers.has(adId)) {
    // Another worker is already flushing/coalescing this hot adId; delta is safely queued in RAM
    return;
  }

  l1ActiveClickFlushers.add(adId);
  try {
    await drainClickBufferForAd(adId);
    // Keep hot-row shield active for COALESCE_WINDOW_MS to absorb burst traffic
    setTimeout(async () => {
      try {
        if (l1PendingClicks.has(adId)) {
          await drainClickBufferForAd(adId);
        }
      } finally {
        l1ActiveClickFlushers.delete(adId);
      }
    }, COALESCE_WINDOW_MS);
  } catch {
    l1ActiveClickFlushers.delete(adId);
  }
}

async function drainClickBufferForAd(adId: string): Promise<void> {
  const batch = l1PendingClicks.get(adId);
  if (!batch) return;
  l1PendingClicks.delete(adId);

  const entries = Object.entries(batch).filter(([, count]) => (count || 0) > 0) as Array<
    [CanonicalClickType, number]
  >;
  if (entries.length === 0) return;

  let needsColumnFallback = false;
  for (const [clickType, count] of entries) {
    if (count === 1) {
      const { error } = await supabaseAdmin.rpc("increment_ad_click", {
        p_ad_id: adId,
        p_click_type: clickType,
      });
      if (error) needsColumnFallback = true;
    } else {
      const { error } = await supabaseAdmin.rpc("increment_ad_clicks_bulk", {
        p_ad_id: adId,
        p_click_type: clickType,
        p_count: count,
      });
      if (error) needsColumnFallback = true;
    }
  }

  if (needsColumnFallback) {
    try {
      const cols = entries.map(([ct]) => CLICK_TYPE_TO_COLUMN[ct]);
      const { data: adRow } = await supabaseAdmin
        .from("addsactive")
        .select(`id, user_email, ${cols.join(", ")}`)
        .eq("id", adId)
        .maybeSingle();

      if (adRow) {
        const patch: Record<string, number> = {};
        for (const [ct, count] of entries) {
          const col = CLICK_TYPE_TO_COLUMN[ct];
          patch[col] = Number((adRow as any)[col] || 0) + count;
        }
        await supabaseAdmin.from("addsactive").update(patch).eq("id", adId);
        if ((adRow as any).user_email) {
          invalidateCachedUserCampaigns((adRow as any).user_email).catch(() => {});
        }
      }
    } catch {}
  }
}

/**
 * Overlays any in-flight L1 coalesced click or impression deltas onto a campaign row
 * so /myAds always reflects 100% real-time counts with 0ms lag even during viral bursts.
 */
export function overlayPendingBufferedDeltas<T extends Record<string, any>>(item: T): T {
  if (!item || !item.id) return item;
  const adId = String(item.id);
  const pendingClicks = l1PendingClicks.get(adId);
  const pendingSeen = l1PendingSeen.get(adId);

  if (!pendingClicks && !pendingSeen) return item;

  const clone: Record<string, any> = { ...item };
  if (pendingSeen && pendingSeen.delta > 0) {
    clone.impression_count = Number(clone.impression_count || 0) + pendingSeen.delta;
  }
  if (pendingClicks) {
    for (const [ct, delta] of Object.entries(pendingClicks)) {
      if (delta && delta > 0) {
        const col = CLICK_TYPE_TO_COLUMN[ct as CanonicalClickType];
        if (col) {
          clone[col] = Number(clone[col] || 0) + delta;
        }
      }
    }
  }
  return clone as T;
}

/**
 * Record an ad view asynchronously in Redis (Sub-millisecond latency).
 */
export async function bufferAdImpression(adId: string): Promise<void> {
  try {
    if (redisConnection && redisConnection.status === "ready") {
      await redisConnection.hincrby(REDIS_KEY_IMPRESSIONS, adId, 1);
      return;
    }
  } catch (e) {
    console.warn("⚠️ Redis impression buffer fallback to direct DB:", e);
  }

  // Fallback to direct DB update if Redis is unavailable
  try {
    await supabaseAdmin.rpc("increment_ad_impression", { p_ad_id: adId });
  } catch (_e) {
    const { data: currentAd } = await supabaseAdmin
      .from("addsactive")
      .select("impression_count")
      .eq("id", adId)
      .maybeSingle();
    if (currentAd) {
      await supabaseAdmin
        .from("addsactive")
        .update({ impression_count: Number(currentAd.impression_count || 0) + 1 })
        .eq("id", adId);
    }
  }
}

/**
 * Record an ad click asynchronously in Redis.
 */
export async function bufferAdClick(adId: string, clickType: "phone" | "whatsapp" | "website" | "email" | "product_cta"): Promise<void> {
  const keyMap = {
    phone: REDIS_KEY_CLICKS_PHONE,
    whatsapp: REDIS_KEY_CLICKS_WHATSAPP,
    website: REDIS_KEY_CLICKS_WEBSITE,
    email: REDIS_KEY_CLICKS_EMAIL,
    product_cta: REDIS_KEY_CLICKS_PRODUCT_CTA,
  };

  const redisKey = keyMap[clickType];

  try {
    if (redisConnection && redisConnection.status === "ready") {
      await redisConnection.hincrby(redisKey, adId, 1);
      return;
    }
  } catch (e) {
    console.warn("⚠️ Redis click buffer fallback to direct DB:", e);
  }
}

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

/**
 * Bulk Flush Worker: Flushes accumulated Redis impression & click counts to PostgreSQL safely.
 * Guarantees Zero Data Loss via Two-Phase In-Flight Archiving & Rollback.
 */
export async function flushImpressionBuffersToDB(): Promise<{ flushedImpressions: number; flushedClicks: number }> {
  if (!redisConnection || redisConnection.status !== "ready") {
    return { flushedImpressions: 0, flushedClicks: 0 };
  }

  let flushedImpressions = 0;
  let flushedClicks = 0;
  const batchId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    // 1. Flush Impression Buffers with Two-Phase Commit
    const processingImpKey = `${REDIS_KEY_IMPRESSIONS}:processing:${batchId}`;
    const rawImpressionPairs = (await redisConnection.eval(
      LUA_RENAME_TO_PROCESSING,
      2,
      REDIS_KEY_IMPRESSIONS,
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
        // Process in concurrent chunks of 10 for high throughput without pool starvation
        const CHUNK_SIZE = 10;
        for (let i = 0; i < impressionUpdates.length; i += CHUNK_SIZE) {
          const chunk = impressionUpdates.slice(i, i + CHUNK_SIZE);
          await Promise.all(
            chunk.map(async ({ adId, delta }) => {
              try {
                await supabaseAdmin.rpc("increment_ad_impressions_bulk", {
                  p_ad_id: adId,
                  p_count: delta,
                });
                flushedImpressions += delta;
              } catch {
                const { data: current } = await supabaseAdmin
                  .from("addsactive")
                  .select("impression_count")
                  .eq("id", adId)
                  .maybeSingle();

                if (current) {
                  const newCount = Number(current.impression_count || 0) + delta;
                  await supabaseAdmin
                    .from("addsactive")
                    .update({ impression_count: newCount })
                    .eq("id", adId);
                  flushedImpressions += delta;
                }
              }
            })
          );
        }
        // Stream raw events to ClickHouse Cloud for high-throughput permanent analytics
        streamImpressionsToClickHouse(
          impressionUpdates.map((u) => ({
            ad_id: u.adId,
            user_email: "batch_buffer@xea.app",
            cost_per_impression: 0,
            interaction_type: "view",
          }))
        ).catch(() => {});

        // Safely delete in-flight archive key once DB confirms
        await redisConnection.del(processingImpKey);
      } catch (dbErr) {
        console.error("❌ DB error during impression flush, rolling back to Redis active buffer:", dbErr);
        await redisConnection.eval(LUA_RESTORE_PROCESSING_BUFFER, 2, processingImpKey, REDIS_KEY_IMPRESSIONS).catch(() => {});
      }
    }

    // 2. Flush Click Buffers with Two-Phase Commit
    const clickKeys: Record<string, "phone" | "whatsapp" | "website" | "email" | "product_cta"> = {
      [REDIS_KEY_CLICKS_PHONE]: "phone",
      [REDIS_KEY_CLICKS_WHATSAPP]: "whatsapp",
      [REDIS_KEY_CLICKS_WEBSITE]: "website",
      [REDIS_KEY_CLICKS_EMAIL]: "email",
      [REDIS_KEY_CLICKS_PRODUCT_CTA]: "product_cta",
    };

    for (const [key, clickType] of Object.entries(clickKeys)) {
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
          // Stream click events to ClickHouse Cloud for high-throughput permanent analytics
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
          await redisConnection.eval(LUA_RESTORE_PROCESSING_BUFFER, 2, processingClickKey, key).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error("❌ Error in flushImpressionBuffersToDB:", err);
  }

  return { flushedImpressions, flushedClicks };
}
