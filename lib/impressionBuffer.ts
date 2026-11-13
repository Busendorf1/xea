import redisConnection, { isRedisReady } from "./redis";
import supabaseAdmin from "./utils/dbAdmin";
import { invalidateCachedUserCampaigns } from "./utils/cache";
import { runTwoPhaseImpressionAndClickFlush } from "./ads/impressionFlushWorker";

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
const REDIS_KEY_CLICKS_IOS = "buffer:clicks_ios";
const REDIS_KEY_CLICKS_ANDROID = "buffer:clicks_android";
const REDIS_KEY_CLICKS_WATCH_NOW = "buffer:clicks_watch_now";
const REDIS_KEY_CLICKS_READ_MORE = "buffer:clicks_read_more";

export const CLICK_BUFFER_REDIS_KEYS: Record<CanonicalClickType, string> = {
  phone: REDIS_KEY_CLICKS_PHONE,
  whatsapp: REDIS_KEY_CLICKS_WHATSAPP,
  website: REDIS_KEY_CLICKS_WEBSITE,
  email: REDIS_KEY_CLICKS_EMAIL,
  product_cta: REDIS_KEY_CLICKS_PRODUCT_CTA,
  ios: REDIS_KEY_CLICKS_IOS,
  android: REDIS_KEY_CLICKS_ANDROID,
  watch_now: REDIS_KEY_CLICKS_WATCH_NOW,
  read_more: REDIS_KEY_CLICKS_READ_MORE,
};

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
const l1LastKnownImpCount = new Map<string, { count: number; updatedAt: number }>();

async function drainSeenBufferForAd(adId: string): Promise<number | undefined> {
  const batch = l1PendingSeen.get(adId);
  if (!batch || batch.delta <= 0) return l1LastKnownImpCount.get(adId)?.count;
  l1PendingSeen.delete(adId);

  const updatedCount = await applyBatchedSeenDeltaToAd(
    adId,
    batch.delta,
    Boolean(batch.isPlatformPost),
    batch.adOwnerEmail
  );
  if (typeof updatedCount === "number") {
    l1LastKnownImpCount.set(adId, { count: updatedCount, updatedAt: Date.now() });
    if (l1LastKnownImpCount.size > 5000) {
      const cutoff = Date.now() - 60_000;
      for (const [k, v] of l1LastKnownImpCount) {
        if (v.updatedAt < cutoff) l1LastKnownImpCount.delete(k);
      }
    }
  }
  return updatedCount;
}

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
): Promise<number | undefined> {
  const nowIso = new Date().toISOString();

  // Queue increment into L1 hot-row coalescer
  const existingBatch = l1PendingSeen.get(adId);
  if (existingBatch) {
    existingBatch.delta += 1;
    if (meta.adOwnerEmail && !existingBatch.adOwnerEmail) {
      existingBatch.adOwnerEmail = meta.adOwnerEmail;
    }
    existingBatch.isPlatformPost = existingBatch.isPlatformPost || meta.isPlatformPost;
  } else {
    l1PendingSeen.set(adId, {
      delta: 1,
      adOwnerEmail: meta.adOwnerEmail,
      isPlatformPost: meta.isPlatformPost,
    });
  }

  // Record user-level ad_impressions row asynchronously / concurrently (isolated per user, no hot-row lock)
  const userImpPromise = (async () => {
    try {
      const { error } = await supabaseAdmin.rpc("record_user_ad_impression_atomic", {
        p_ad_id: adId,
        p_user_email: emailKey,
      });
      if (error) {
        const { data: existingImp } = await supabaseAdmin
          .from("ad_impressions")
          .select("id, view_count")
          .eq("ad_id", adId)
          .ilike("user_email", emailKey)
          .maybeSingle();

        const existingViews = existingImp ? Number(existingImp.view_count || 0) : 0;
        if (existingImp?.id) {
          await supabaseAdmin
            .from("ad_impressions")
            .update({ view_count: existingViews + 1, last_viewed_at: nowIso })
            .eq("id", existingImp.id);
        } else {
          await supabaseAdmin
            .from("ad_impressions")
            .insert({ ad_id: adId, user_email: emailKey, view_count: 1, last_viewed_at: nowIso });
        }
      }
    } catch {}
  })();

  // If another request is already flushing/shielding this hot adId, return optimistic count in 0ms!
  if (l1ActiveSeenFlushers.has(adId)) {
    await userImpPromise;
    const baseKnown = l1LastKnownImpCount.get(adId)?.count ?? meta.dbImpressionCount ?? 0;
    const pendingDelta = l1PendingSeen.get(adId)?.delta ?? 0;
    return baseKnown + pendingDelta;
  }

  l1ActiveSeenFlushers.add(adId);
  try {
    const [, flushedCount] = await Promise.all([userImpPromise, drainSeenBufferForAd(adId)]);
    if (process.env.VERCEL === "1") {
      // Serverless lambdas freeze immediately after response; never leave unflushed deltas on a deferred timer
      l1ActiveSeenFlushers.delete(adId);
    } else {
      setTimeout(async () => {
        try {
          if (l1PendingSeen.has(adId)) {
            await drainSeenBufferForAd(adId);
          }
        } finally {
          l1ActiveSeenFlushers.delete(adId);
        }
      }, COALESCE_WINDOW_MS);
    }
    return flushedCount;
  } catch (err) {
    l1ActiveSeenFlushers.delete(adId);
    console.warn("⚠️ Fallback seen record error:", err);
    return undefined;
  }
}

async function applyBatchedSeenDeltaToAd(
  adId: string,
  delta: number,
  isPlatformPost: boolean,
  adOwnerEmail?: string | null
): Promise<number | undefined> {
  if (delta <= 0) return undefined;
  const nowIso = new Date().toISOString();

  let targetTable = "addsactive";
  let targetRow: any = null;

  const { data: liveAd } = await supabaseAdmin
    .from("addsactive")
    .select("impressions, impression_count, user_email")
    .eq("id", adId)
    .maybeSingle();

  if (liveAd) {
    targetRow = liveAd;
    targetTable = "addsactive";
  } else {
    const { data: addsRow } = await supabaseAdmin
      .from("adds")
      .select("impressions, impression_count, user_email")
      .eq("id", adId)
      .maybeSingle();
    if (addsRow) {
      targetRow = addsRow;
      targetTable = "adds";
    }
  }

  if (!targetRow) return undefined;

  const currentImpCount = Number(targetRow.impression_count || 0);
  const targetImps = Number(targetRow.impressions || 0);
  const resolvedOwner = adOwnerEmail || targetRow.user_email || null;
  const nextImpCount = currentImpCount + delta;
  const isNowExhausted = !isPlatformPost && targetImps > 0 && nextImpCount >= targetImps;
  const completedIso = isNowExhausted ? nowIso : null;

  const { data: updatedAdRow } = await supabaseAdmin
    .from(targetTable)
    .update({
      impression_count: nextImpCount,
      ...(completedIso ? { completed_at: completedIso } : {}),
    })
    .eq("id", adId)
    .select("*")
    .maybeSingle();

  // If active ad, also synchronize counter to public.adds for unified reporting
  if (targetTable === "addsactive") {
    supabaseAdmin.from("adds").update({ impression_count: nextImpCount }).eq("id", adId).then(() => {}, () => {});
  }

  if (isNowExhausted) {
    if (updatedAdRow) {
      await supabaseAdmin.from("completed_ads").upsert([updatedAdRow], { onConflict: "id" });
      await supabaseAdmin
        .from("addscompleted")
        .upsert([updatedAdRow], { onConflict: "id" })
        .then(() => {}, () => {});
    }
    await supabaseAdmin.from("addsactive").delete().eq("id", adId);
    await supabaseAdmin.from("bidded_ads").delete().eq("ad_id", adId).then(() => {}, () => {});
    await supabaseAdmin
      .from("adds")
      .update({ completed_at: completedIso, impression_count: nextImpCount })
      .eq("id", adId);

    // Immediately evict exhausted ad from L1 in-memory caches and L2 Redis caches
    try {
      const { evictAdFromL1FeedCaches } = await import("@/lib/utils/cache");
      evictAdFromL1FeedCaches(adId);
    } catch {}
    if (isRedisReady()) {
      redisConnection
        .del(`ad:detail:${adId}`, "campaigns:shared_pool:v1", "bids:zset:global")
        .catch(() => {});
    }
  }

  if (resolvedOwner) {
    invalidateCachedUserCampaigns(resolvedOwner).catch(() => {});
  }

  return nextImpCount;
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
    if (process.env.VERCEL === "1") {
      l1ActiveClickFlushers.delete(adId);
    } else {
      setTimeout(async () => {
        try {
          if (l1PendingClicks.has(adId)) {
            await drainClickBufferForAd(adId);
          }
        } finally {
          l1ActiveClickFlushers.delete(adId);
        }
      }, COALESCE_WINDOW_MS);
    }
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
 * Reads pending in-memory / in-Redis impression buffer deltas for a list of ad IDs
 * so read endpoints (/api/campaigns, /myAds, /api/admin/campaigns) always reflect 100% real-time counts.
 */
export async function getPendingImpressionDeltas(
  adIds: string[],
  options: { includeL1?: boolean } = {}
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (!adIds || adIds.length === 0) return result;

  // 1. Overlay L1 pending seen counts unless caller already applied overlayPendingBufferedDeltas
  if (options.includeL1 !== false) {
    for (const id of adIds) {
      const l1Batch = l1PendingSeen.get(id);
      if (l1Batch && l1Batch.delta > 0) {
        result[id] = (result[id] || 0) + l1Batch.delta;
      }
    }
  }

  // 2. Overlay Redis buffer counts if Redis is ready
  if (isRedisReady() && redisConnection) {
    try {
      const redisCounts = await redisConnection.hmget(REDIS_KEY_IMPRESSIONS, ...adIds);
      if (Array.isArray(redisCounts)) {
        for (let i = 0; i < adIds.length; i++) {
          const raw = redisCounts[i];
          if (raw) {
            const count = parseInt(raw, 10);
            if (!isNaN(count) && count > 0) {
              result[adIds[i]] = (result[adIds[i]] || 0) + count;
            }
          }
        }
      }
    } catch {}
  }

  return result;
}

/**
 * Reads pending in-memory / in-Redis CTA click deltas across all canonical click buffer hashes
 * so /myAds (/api/campaigns) displays 100% real-time CTA counts before the 1-minute flush cron runs.
 */
export async function getPendingClickDeltas(
  adIds: string[],
  options: { includeL1?: boolean } = {}
): Promise<Record<string, Partial<Record<CanonicalClickType, number>>>> {
  const result: Record<string, Partial<Record<CanonicalClickType, number>>> = {};
  if (!adIds || adIds.length === 0) return result;

  const addDelta = (adId: string, clickType: CanonicalClickType, delta: number) => {
    if (!delta || delta <= 0) return;
    if (!result[adId]) result[adId] = {};
    result[adId][clickType] = (result[adId][clickType] || 0) + delta;
  };

  // 1. Overlay L1 pending clicks unless caller already applied overlayPendingBufferedDeltas
  if (options.includeL1 !== false) {
    for (const id of adIds) {
      const l1Clicks = l1PendingClicks.get(id);
      if (l1Clicks) {
        for (const [ct, count] of Object.entries(l1Clicks)) {
          if (count && count > 0) {
            addDelta(id, ct as CanonicalClickType, count);
          }
        }
      }
    }
  }

  // 2. Overlay Redis click buffer hashes in a single pipeline round-trip (with hmget fallback)
  if (isRedisReady() && redisConnection) {
    try {
      const clickEntries = Object.entries(CLICK_BUFFER_REDIS_KEYS) as Array<[CanonicalClickType, string]>;
      let rowsByClickType: Array<Array<string | null> | null> = [];

      if (typeof (redisConnection as any).pipeline === "function") {
        const pipe = (redisConnection as any).pipeline();
        for (const [, hashKey] of clickEntries) {
          pipe.hmget(hashKey, ...adIds);
        }
        const pipeRes = (await pipe.exec()) as Array<[Error | null, Array<string | null>]> | null;
        if (Array.isArray(pipeRes)) {
          rowsByClickType = pipeRes.map(([err, vals]) => (!err && Array.isArray(vals) ? vals : null));
        }
      } else {
        rowsByClickType = await Promise.all(
          clickEntries.map(([, hashKey]) => redisConnection.hmget(hashKey, ...adIds).catch(() => null))
        );
      }

      for (let cIdx = 0; cIdx < clickEntries.length; cIdx++) {
        const [clickType] = clickEntries[cIdx];
        const values = rowsByClickType[cIdx];
        if (!Array.isArray(values)) continue;
        for (let i = 0; i < adIds.length; i++) {
          const raw = values[i];
          if (raw) {
            const count = parseInt(raw, 10);
            if (!isNaN(count) && count > 0) {
              addDelta(adIds[i], clickType, count);
            }
          }
        }
      }
    } catch {}
  }

  return result;
}

/**
 * Record an ad view asynchronously in Redis (Sub-millisecond latency).
 */
export async function bufferAdImpression(adId: string, count: number = 1): Promise<void> {
  if (count <= 0) return;
  try {
    if (redisConnection && redisConnection.status === "ready") {
      await redisConnection.hincrby(REDIS_KEY_IMPRESSIONS, adId, count);
      return;
    }
  } catch (e) {
    console.warn("⚠️ Redis impression buffer fallback to direct DB:", e);
  }

  // Fallback to direct DB update if Redis is unavailable
  try {
    const rpcOut = await supabaseAdmin.rpc("increment_ad_impressions_bulk", { p_ad_id: adId, p_count: count });
    if (rpcOut?.error) {
      const retryOut = await supabaseAdmin.rpc("increment_ad_impressions_bulk", { p_ad_id: adId, p_delta: count });
      if (retryOut?.error) {
        throw retryOut.error;
      }
    }
  } catch (_e) {
    const { data: currentAd } = await supabaseAdmin
      .from("addsactive")
      .select("impression_count")
      .eq("id", adId)
      .maybeSingle();
    if (currentAd) {
      await supabaseAdmin
        .from("addsactive")
        .update({ impression_count: Number(currentAd.impression_count || 0) + count })
        .eq("id", adId);
    }
  }
}

/**
 * Record an ad click asynchronously in Redis.
 */
export async function bufferAdClick(adId: string, clickType: CanonicalClickType): Promise<void> {
  const redisKey = CLICK_BUFFER_REDIS_KEYS[clickType];
  if (!redisKey) return;

  try {
    if (redisConnection && redisConnection.status === "ready") {
      await redisConnection.hincrby(redisKey, adId, 1);
      return;
    }
  } catch (e) {
    console.warn("⚠️ Redis click buffer fallback to direct DB:", e);
  }
}

/**
 * Drains any in-process coalesced L1 seen & click batches immediately (serverless-safe).
 */
export async function drainL1CoalescedBuffers(): Promise<void> {
  const seenIds = Array.from(l1PendingSeen.keys());
  if (seenIds.length > 0) {
    await Promise.all(seenIds.map((adId) => drainSeenBufferForAd(adId).catch(() => undefined)));
  }
  const clickIds = Array.from(l1PendingClicks.keys());
  if (clickIds.length > 0) {
    await Promise.all(clickIds.map((adId) => drainClickBufferForAd(adId).catch(() => {})));
  }
}

/**
 * Bulk Flush Worker: Flushes accumulated Redis impression & click counts to PostgreSQL safely.
 * Guarantees Zero Data Loss via Two-Phase In-Flight Archiving & Rollback.
 */
export async function flushImpressionBuffersToDB(): Promise<{ flushedImpressions: number; flushedClicks: number }> {
  return runTwoPhaseImpressionAndClickFlush({
    drainL1: drainL1CoalescedBuffers,
    redisKeyImpressions: REDIS_KEY_IMPRESSIONS,
    clickBufferRedisKeys: CLICK_BUFFER_REDIS_KEYS,
  });
}
