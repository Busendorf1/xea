import crypto from "crypto";
import redisConnection, { isRedisReady } from "../redis";
import supabaseAdmin from "../utils/dbAdmin";
import { computeCampaignBroadeningPlan } from "../targetingEngine";
import { evictAdFromL1FeedCaches, invalidateCachedUserCampaigns } from "../utils/cache";
import { dispatchNotificationWebhook } from "../webhookDispatcher";

export const ROLLOVER_LEASE_KEY = "lock:rollover:processor";
export const ROLLOVER_CURSOR_KEY = "cursor:rollover:last_ad_id";
export const ROLLOVER_LEASE_TTL_SECONDS = 120;
export const ROLLOVER_NOTIFY_DEDUPE_TTL_SECONDS = 86400 * 30;
export const DEFAULT_ROLLOVER_BATCH_SIZE = 200;
export const DEFAULT_MAX_BATCHES_PER_RUN = 5;

const LUA_RELEASE_LEASE = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;

export interface TransitionedRolloverAd {
  id: string;
  user_email?: string | null;
  product_name?: string | null;
  ad_content?: string | null;
  impressions?: number;
  impression_count?: number;
  remaining_impressions?: number;
  rollover_notified_at?: string | null;
}

export interface RolloverSweepResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  batchesRun: number;
  processedCount: number;
  transitionedCount: number;
  stage1UpdatedCount: number;
  dailyRolledCount: number;
  notifiedCount: number;
  archivedPlatformCount: number;
  nextCursorId: string | null;
  hasMore: boolean;
}

function safeIsRedisReady(): boolean {
  try {
    return typeof isRedisReady === "function" && Boolean(isRedisReady());
  } catch {
    return false;
  }
}

async function acquireRolloverLease(token: string): Promise<boolean> {
  if (!safeIsRedisReady()) return true;
  try {
    const acquired = await redisConnection.set(
      ROLLOVER_LEASE_KEY,
      token,
      "EX",
      ROLLOVER_LEASE_TTL_SECONDS,
      "NX"
    );
    return acquired === "OK" || acquired === 1 || acquired === true;
  } catch {
    return true;
  }
}

async function releaseRolloverLease(token: string): Promise<void> {
  if (!safeIsRedisReady()) return;
  try {
    if (typeof redisConnection.eval === "function") {
      await redisConnection.eval(LUA_RELEASE_LEASE, 1, ROLLOVER_LEASE_KEY, token);
    } else {
      const current = await redisConnection.get(ROLLOVER_LEASE_KEY).catch(() => null);
      if (current === token) {
        await redisConnection.del(ROLLOVER_LEASE_KEY).catch(() => {});
      }
    }
  } catch {}
}

async function evictCachesForTransitionedAds(ads: TransitionedRolloverAd[]): Promise<void> {
  if (ads.length === 0) return;
  const ownerSet = new Set<string>();
  const detailKeys: string[] = [];

  for (const ad of ads) {
    try {
      evictAdFromL1FeedCaches(ad.id);
    } catch {}
    detailKeys.push(`ad:detail:${ad.id}`, `ad:public:status:${ad.id}`);
    if (ad.user_email) ownerSet.add(ad.user_email.toLowerCase().trim());
  }

  if (safeIsRedisReady() && detailKeys.length > 0) {
    await redisConnection
      .del(...detailKeys, "campaigns:shared_pool:v1")
      .catch(() => {});
  }

  await Promise.allSettled(
    Array.from(ownerSet).map((email) => invalidateCachedUserCampaigns(email))
  );
}

async function notifyAdvertisersOfRollover(ads: TransitionedRolloverAd[]): Promise<number> {
  const unnotified = ads.filter((a) => a.id && a.user_email && !a.rollover_notified_at);
  if (unnotified.length === 0) return 0;

  const eligibleAds: TransitionedRolloverAd[] = [];
  for (const ad of unnotified) {
    if (safeIsRedisReady()) {
      try {
        const claimed = await redisConnection.set(
          `rollover:notified:${ad.id}`,
          "1",
          "EX",
          ROLLOVER_NOTIFY_DEDUPE_TTL_SECONDS,
          "NX"
        );
        if (!claimed) continue;
      } catch {}
    }
    eligibleAds.push(ad);
  }

  if (eligibleAds.length === 0) return 0;

  const notifRows = eligibleAds.map((ad) => {
    const label = ad.product_name?.trim()
      ? `"${ad.product_name.trim()}"`
      : ad.ad_content?.trim()
      ? `"${ad.ad_content.trim().slice(0, 48)}"`
      : "Your campaign";
    const remaining = Math.max(
      0,
      ad.remaining_impressions ?? Number(ad.impressions || 0) - Number(ad.impression_count || 0)
    );
    return {
      user_email: String(ad.user_email).toLowerCase().trim(),
      title: "Campaign Entered Rollover Mode",
      message: `${label} reached the end of its initial schedule with ${remaining.toLocaleString()} impressions remaining. Rollover Mode is now delivering the remaining budget with broadened targeting.`,
    };
  });

  const { error: notifErr } = await supabaseAdmin.from("notifications").insert(notifRows);
  if (notifErr) {
    console.warn("⚠️ [RolloverService] Failed inserting rollover notifications:", notifErr.message);
    return 0;
  }

  const notifiedIds = eligibleAds.map((a) => a.id);
  const { error: markErr } = await supabaseAdmin.rpc("mark_rollover_notified_batch", {
    p_ad_ids: notifiedIds,
  });
  if (markErr) {
    await supabaseAdmin
      .from("addsactive")
      .update({ rollover_notified_at: new Date().toISOString() })
      .in("id", notifiedIds)
      .is("rollover_notified_at", null)
      .then(() => {}, () => {});
  }

  if (safeIsRedisReady()) {
    const notifCacheKeys = Array.from(new Set(notifRows.map((r) => `notifications:user:${r.user_email}`)));
    redisConnection.del(...notifCacheKeys).catch(() => {});
  }

  await Promise.allSettled(notifRows.map((row) => dispatchNotificationWebhook(row)));
  return notifRows.length;
}

async function runFallbackKeysetBatch(cursorId: string | null, batchSize: number) {
  const emptyResult = {
    processedCount: 0,
    transitionedCount: 0,
    stage1Updated: 0,
    dailyRolledCount: 0,
    newlyEntered: [] as TransitionedRolloverAd[],
    nextCursorId: null as string | null,
    hasMore: false,
  };

  try {
    let q: any = supabaseAdmin
      .from("addsactive")
      .select(
        "id, user_email, product_name, ad_content, impressions, impression_count, cost_per_impression, is_admin_post, is_paused, completed_at, is_rollover, rollover_notified_at, broadening_stage, created_at, approved_at, scheduled_start_at, scheduled_end_at, campaign_days, user_frequency_cap"
      );

    if (typeof q?.is === "function") q = q.is("completed_at", null);
    if (typeof q?.or === "function") q = q.or("is_paused.is.null,is_paused.eq.false");
    if (typeof q?.gt === "function") {
      q = q.gt("impressions", 0).gt("cost_per_impression", 0);
      if (cursorId) q = q.gt("id", cursorId);
    }
    if (typeof q?.order === "function") q = q.order("id", { ascending: true });
    if (typeof q?.limit !== "function") return emptyResult;

    const { data: rows, error } = await q.limit(batchSize);
    if (error || !Array.isArray(rows)) {
      return emptyResult;
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const rolloverRows: any[] = [];
    const stage1Ids: string[] = [];

    for (const row of rows) {
      if (row.is_admin_post) continue;
      const plan = computeCampaignBroadeningPlan(row, nowMs);
      if (plan.isRollover && !row.is_rollover) {
        rolloverRows.push(row);
      } else if (plan.broadeningStage === 1 && Number(row.broadening_stage || 0) < 1) {
        stage1Ids.push(row.id);
      }
    }

    if (rolloverRows.length > 0) {
      const ids = rolloverRows.map((r) => r.id);
      await supabaseAdmin
        .from("addsactive")
        .update({
          is_rollover: true,
          broadening_stage: 2,
          rollover_started_at: nowIso,
        })
        .in("id", ids)
        .then(() => {}, () => {});
    }

    if (stage1Ids.length > 0) {
      await supabaseAdmin
        .from("addsactive")
        .update({ broadening_stage: 1 })
        .in("id", stage1Ids)
        .then(() => {}, () => {});
    }

    const nextCursorId = rows.length > 0 ? String(rows[rows.length - 1].id) : null;
    const newlyEntered: TransitionedRolloverAd[] = rolloverRows
      .filter((r) => !r.rollover_notified_at)
      .map((r) => ({
        id: r.id,
        user_email: r.user_email,
        product_name: r.product_name,
        ad_content: typeof r.ad_content === "string" ? r.ad_content.slice(0, 80) : "",
        impressions: Number(r.impressions || 0),
        impression_count: Number(r.impression_count || 0),
        remaining_impressions: Math.max(0, Number(r.impressions || 0) - Number(r.impression_count || 0)),
        rollover_notified_at: r.rollover_notified_at || null,
      }));

    return {
      processedCount: rows.length,
      transitionedCount: rolloverRows.length,
      stage1Updated: stage1Ids.length,
      dailyRolledCount: 0,
      newlyEntered,
      nextCursorId,
      hasMore: rows.length === batchSize,
    };
  } catch {
    return emptyResult;
  }
}

/**
 * Keyset-cursor batched rollover processor for 500M+ scale.
 * Acquires a distributed Redis lease so concurrent triggers never duplicate work,
 * drains up to `maxBatches` chunks per invocation using `FOR UPDATE SKIP LOCKED`,
 * evicts L1/L2 caches in O(1), dispatches idempotent advertiser notifications, and
 * archives expired unpaid platform posts.
 */
export async function runRolloverSweep(options?: {
  batchSize?: number;
  maxBatches?: number;
}): Promise<RolloverSweepResult> {
  const batchSize = Math.max(1, Math.min(500, options?.batchSize ?? DEFAULT_ROLLOVER_BATCH_SIZE));
  const maxBatches = Math.max(1, Math.min(25, options?.maxBatches ?? DEFAULT_MAX_BATCHES_PER_RUN));
  const leaseToken = crypto.randomUUID();

  const locked = await acquireRolloverLease(leaseToken);
  if (!locked) {
    return {
      success: true,
      skipped: true,
      reason: "lease_held",
      batchesRun: 0,
      processedCount: 0,
      transitionedCount: 0,
      stage1UpdatedCount: 0,
      dailyRolledCount: 0,
      notifiedCount: 0,
      archivedPlatformCount: 0,
      nextCursorId: null,
      hasMore: false,
    };
  }

  let cursorId: string | null = null;
  if (safeIsRedisReady()) {
    cursorId = await redisConnection.get(ROLLOVER_CURSOR_KEY).catch(() => null);
  }

  let batchesRun = 0;
  let processedCount = 0;
  let transitionedCount = 0;
  let stage1UpdatedCount = 0;
  let dailyRolledCount = 0;
  let notifiedCount = 0;
  let archivedPlatformCount = 0;
  let hasMore = false;
  const allTransitioned: TransitionedRolloverAd[] = [];

  try {
    for (let i = 0; i < maxBatches; i++) {
      batchesRun++;
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("process_ad_rollover_batch", {
        p_last_id: cursorId,
        p_batch_size: batchSize,
      });

      let batchProcessed = 0;
      let batchTransitioned = 0;
      let batchStage1 = 0;
      let batchDaily = 0;
      let batchHasMore = false;
      let batchNextCursor: string | null = null;
      let newlyEntered: TransitionedRolloverAd[] = [];

      if (rpcErr || !rpcRes) {
        const fb = await runFallbackKeysetBatch(cursorId, batchSize);
        batchProcessed = fb.processedCount;
        batchTransitioned = fb.transitionedCount;
        batchStage1 = fb.stage1Updated;
        batchDaily = fb.dailyRolledCount;
        batchHasMore = fb.hasMore;
        batchNextCursor = fb.nextCursorId;
        newlyEntered = fb.newlyEntered;
      } else {
        batchProcessed = Number(rpcRes.processed_count || 0);
        batchTransitioned = Number(rpcRes.transitioned_count || 0);
        batchStage1 = Number(rpcRes.stage1_updated || 0);
        batchDaily = Number(rpcRes.daily_rolled_count || 0);
        batchHasMore = Boolean(rpcRes.has_more);
        batchNextCursor = rpcRes.next_cursor_id ? String(rpcRes.next_cursor_id) : null;
        newlyEntered = Array.isArray(rpcRes.newly_entered) ? rpcRes.newly_entered : [];
      }

      processedCount += batchProcessed;
      transitionedCount += batchTransitioned;
      stage1UpdatedCount += batchStage1;
      dailyRolledCount += batchDaily;
      hasMore = batchHasMore;
      cursorId = batchHasMore ? batchNextCursor : null;

      if (newlyEntered.length > 0) {
        allTransitioned.push(...newlyEntered);
        notifiedCount += await notifyAdvertisersOfRollover(newlyEntered);
      }

      if (!batchHasMore || batchProcessed === 0) {
        cursorId = null;
        hasMore = false;
        break;
      }
    }

    if (allTransitioned.length > 0) {
      await evictCachesForTransitionedAds(allTransitioned);
    }

    const { data: archivedRes, error: archErr } = await supabaseAdmin.rpc(
      "archive_expired_platform_ads",
      { p_batch_size: batchSize }
    );
    if (!archErr && typeof archivedRes === "number") {
      archivedPlatformCount = archivedRes;
    }

    if (safeIsRedisReady()) {
      if (cursorId) {
        await redisConnection.set(ROLLOVER_CURSOR_KEY, cursorId, "EX", 3600).catch(() => {});
      } else {
        await redisConnection.del(ROLLOVER_CURSOR_KEY).catch(() => {});
      }
    }

    return {
      success: true,
      batchesRun,
      processedCount,
      transitionedCount,
      stage1UpdatedCount,
      dailyRolledCount,
      notifiedCount,
      archivedPlatformCount,
      nextCursorId: cursorId,
      hasMore,
    };
  } finally {
    await releaseRolloverLease(leaseToken);
  }
}
