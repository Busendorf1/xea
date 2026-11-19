import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { dispatchNotificationWebhook } from "@/lib/webhookDispatcher";
import { computeAtwTierDetails, MAX_ATW_LEVEL } from "@/lib/attentionTierEngine";
import { isExemptFromBarriersAndInactivity } from "../adminHelper";
import { invalidateL1UserNotif, getUserNotifCacheKey } from "./notificationCache";

export function parseNumericAtwLevel(tierCode?: string | null): number {
  if (!tierCode || typeof tierCode !== "string") return 1;
  const trimmed = tierCode.trim();
  if (trimmed.toLowerCase() === "unlimited") return MAX_ATW_LEVEL;
  const match = /^ATW(\d+)$/i.exec(trimmed);
  if (!match) return 1;
  const parsed = parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(MAX_ATW_LEVEL, parsed);
}

export async function invalidateUserNotificationAndTierCaches(emailLower: string): Promise<void> {
  const clean = String(emailLower || "").toLowerCase().trim();
  if (!clean) return;
  invalidateL1UserNotif(clean);
  if (!isRedisReady()) return;
  await Promise.allSettled([
    redisConnection.del(getUserNotifCacheKey(clean)),
    redisConnection.del(`notifications:${clean}`),
    redisConnection.del(`monetize:status:v2:${clean}`),
    redisConnection.del(`monetize:status:${clean}`),
    redisConnection.del(`user:profile:${clean}`),
  ]);
}

/**
 * Clears Redis milestone deduplication keys when a user opts out, reapplies,
 * or is reset due to 7-day inactivity so they receive the congratulatory
 * notification again when they re-qualify at 500 clicks.
 */
export async function clearMonetizationUnlockDedup(email: string): Promise<void> {
  const emailLower = String(email || "").toLowerCase().trim();
  if (!emailLower || !isRedisReady()) return;
  await Promise.allSettled([
    redisConnection.del(`notif:milestone:v2:monetized:500:${emailLower}`),
    redisConnection.del(`notif:milestone:v2:monetized:500:${emailLower}:lock`),
    redisConnection.del(`notif:milestone:monetized:500:${emailLower}`),
  ]);
}

async function insertDeduplicatedNotification(params: {
  emailLower: string;
  title: string;
  message: string;
  dedupKey: string;
  dedupTtlSeconds: number;
  dbDedupLookbackDays?: number;
  sqlAlreadyInserted?: boolean;
}): Promise<boolean> {
  const {
    emailLower,
    title,
    message,
    dedupKey,
    dedupTtlSeconds,
    dbDedupLookbackDays = 30,
    sqlAlreadyInserted = false,
  } = params;

  if (!emailLower) return false;

  const lockKey = `${dedupKey}:lock`;
  let lockAcquired = false;

  if (isRedisReady()) {
    try {
      // Fast-path check: only set AFTER a DB row is confirmed to exist
      if (typeof redisConnection.get === "function") {
        const alreadySent = await redisConnection.get(dedupKey);
        if (alreadySent === "1") return false;
      }
      // Short 30s in-flight lock prevents duplicate concurrent inserts without permanent suppression on error
      const acquired = await redisConnection.set(lockKey, "1", "EX", 30, "NX");
      if (!acquired) return false;
      lockAcquired = true;
    } catch {
      // Fall through to DB dedup check
    }
  }

  const releaseLock = async () => {
    if (lockAcquired && isRedisReady()) {
      await redisConnection.del(lockKey).catch(() => {});
      lockAcquired = false;
    }
  };

  try {
    const sinceIso = new Date(Date.now() - dbDedupLookbackDays * 86400_000).toISOString();
    const { data: existing, error: selectErr } = await supabaseAdmin
      .from("notifications")
      .select("id, created_at")
      .ilike("user_email", emailLower)
      .eq("title", title)
      .gte("created_at", sinceIso)
      .limit(1)
      .maybeSingle();

    if (selectErr) {
      console.warn("⚠️ Error checking existing milestone notification:", selectErr.message);
    }

    if (existing?.id) {
      const createdMs = existing.created_at ? new Date(existing.created_at).getTime() : 0;
      const insertedJustNow =
        sqlAlreadyInserted || (createdMs > 0 && Date.now() - createdMs <= 15_000);

      if (isRedisReady()) {
        await redisConnection.set(dedupKey, "1", "EX", dedupTtlSeconds).catch(() => {});
      }
      await releaseLock();

      if (insertedJustNow) {
        await invalidateUserNotificationAndTierCaches(emailLower);
        await dispatchNotificationWebhook({
          id: existing.id,
          user_email: emailLower,
          title,
          message,
          created_at: existing.created_at || new Date().toISOString(),
        }).catch(() => {});
        return true;
      }

      return false;
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("notifications")
      .insert([{ user_email: emailLower, title, message }])
      .select("id, user_email, title, message, created_at")
      .maybeSingle();

    if (insertErr) {
      console.warn("⚠️ Failed inserting milestone notification:", insertErr.message);
      await releaseLock();
      return false;
    }

    // Confirm long-TTL Redis dedup ONLY after DB insert succeeded
    if (isRedisReady()) {
      await redisConnection.set(dedupKey, "1", "EX", dedupTtlSeconds).catch(() => {});
    }
    await releaseLock();

    await invalidateUserNotificationAndTierCaches(emailLower);

    await dispatchNotificationWebhook({
      id: inserted?.id,
      user_email: emailLower,
      title,
      message,
      created_at: inserted?.created_at || new Date().toISOString(),
    }).catch(() => {});

    return true;
  } catch (err: unknown) {
    console.warn("⚠️ Milestone notification error:", (err as Error)?.message || err);
    await releaseLock();
    return false;
  }
}

/**
 * Notifies a user once when reaching 500 clicks and unlocking monetization.
 */
export async function notifyMonetizationUnlocked(
  email: string,
  options?: { sqlAlreadyInserted?: boolean }
): Promise<boolean> {
  const emailLower = String(email || "").toLowerCase().trim();
  if (!emailLower) return false;

  return insertDeduplicatedNotification({
    emailLower,
    title: "Monetization Unlocked! Welcome to ATW1",
    message:
      "Congratulations! You have reached 500 clicks and unlocked monetization (ATW1, ₦30,000 balance cap). Start earning on ads now, and remember to withdraw promptly.",
    dedupKey: `notif:milestone:v2:monetized:500:${emailLower}`,
    dedupTtlSeconds: 86400 * 7,
    dbDedupLookbackDays: 7,
    sqlAlreadyInserted: options?.sqlAlreadyInserted,
  });
}

/**
 * Notifies a user once per ATW tier upgrade with their new holding balance cap and withdrawal reminder.
 */
export async function notifyAtwLevelIncreased(
  email: string,
  tierCode: string,
  holdingCapFormatted: string,
  options?: { sqlAlreadyInserted?: boolean }
): Promise<boolean> {
  const emailLower = String(email || "").toLowerCase().trim();
  if (!emailLower || !tierCode || tierCode.toLowerCase() === "unlimited") return false;

  return insertDeduplicatedNotification({
    emailLower,
    title: `ATW Level Upgraded to ${tierCode}`,
    message: `Congratulations! Your ATW level has increased to ${tierCode}, raising your new balance cap to ${holdingCapFormatted}. Please withdraw your earnings promptly so you don't hit your limit.`,
    dedupKey: `notif:milestone:v2:atw:${emailLower}:${tierCode.toUpperCase()}`,
    dedupTtlSeconds: 86400 * 180,
    dbDedupLookbackDays: 180,
    sqlAlreadyInserted: options?.sqlAlreadyInserted,
  });
}

export interface ClickAndAtwMilestoneCheckInput {
  email: string;
  prevClicks?: number;
  prevMonetized?: boolean;
  prevAtwTier?: string | null;
  nextClicks: number;
  nextMonetized: boolean;
  nextAtwTier?: string | null;
  attentionWorthScore?: number | null;
  isExempt?: boolean;
  hasCancelled?: boolean;
  checkRecentUnlock?: boolean;
  sqlMonetizationNotified?: boolean;
  sqlAtwNotified?: boolean;
}

export interface MilestoneNotificationResult {
  monetizationNotified: boolean;
  atwNotified: boolean;
  notifiedAtwTier?: string;
}

/**
 * Checks whether a click/earn/mutual update unlocked monetization at 500 clicks or raised ATW level,
 * and emits warm, deduplicated congratulatory notifications.
 */
export async function checkAndNotifyClickAndAtwMilestones(
  input: ClickAndAtwMilestoneCheckInput
): Promise<MilestoneNotificationResult> {
  const {
    email,
    prevClicks,
    prevMonetized,
    prevAtwTier,
    nextClicks,
    nextMonetized,
    nextAtwTier,
    attentionWorthScore,
    isExempt = false,
    hasCancelled = false,
    checkRecentUnlock = false,
    sqlMonetizationNotified = false,
    sqlAtwNotified = false,
  } = input;

  if (!email || isExempt || hasCancelled) {
    return { monetizationNotified: false, atwNotified: false };
  }

  const crossedMonetizationThreshold =
    nextMonetized &&
    nextClicks >= 500 &&
    (prevMonetized === false ||
      (typeof prevClicks === "number" && prevClicks < 500) ||
      nextClicks === 500 ||
      checkRecentUnlock ||
      sqlMonetizationNotified);

  const nextDetails = computeAtwTierDetails(
    nextClicks,
    nextAtwTier,
    isExempt,
    attentionWorthScore
  );

  const hasExplicitPrevTier =
    typeof prevAtwTier === "string" && prevAtwTier.trim().length > 0;
  const prevLevel = hasExplicitPrevTier
    ? parseNumericAtwLevel(prevAtwTier)
    : typeof prevClicks === "number"
    ? computeAtwTierDetails(prevClicks, undefined, isExempt, attentionWorthScore).level
    : nextDetails.level;

  const atwIncreased =
    !nextDetails.isUnlimited &&
    nextDetails.level >= 2 &&
    (nextDetails.level > prevLevel || sqlAtwNotified);

  let monetizationNotified = false;
  let atwNotified = false;

  const tasks: Promise<void>[] = [];
  if (crossedMonetizationThreshold) {
    tasks.push(
      notifyMonetizationUnlocked(email, { sqlAlreadyInserted: sqlMonetizationNotified }).then(
        (sent) => {
          monetizationNotified = sent;
        }
      )
    );
  }
  if (atwIncreased) {
    tasks.push(
      notifyAtwLevelIncreased(email, nextDetails.tierCode, nextDetails.holdingCapFormatted, {
        sqlAlreadyInserted: sqlAtwNotified,
      }).then((sent) => {
        atwNotified = sent;
      })
    );
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }

  return {
    monetizationNotified,
    atwNotified,
    notifiedAtwTier: atwNotified ? nextDetails.tierCode : undefined,
  };
}

export interface SqlUpgradedAtwUser {
  email: string;
  atw_tier: string;
  level: number;
}

/**
 * Invalidates Redis/L1 caches and dispatches notification webhooks after SQL RPCs insert ATW upgrade notifications.
 */
export async function syncSqlAtwUpgradeNotifications(
  upgradedUsers: SqlUpgradedAtwUser[]
): Promise<void> {
  if (!Array.isArray(upgradedUsers) || upgradedUsers.length === 0) return;

  const nowIso = new Date().toISOString();
  await Promise.allSettled(
    upgradedUsers.map(async (u) => {
      const emailLower = String(u?.email || "").toLowerCase().trim();
      const level = Math.max(2, Math.min(MAX_ATW_LEVEL, Number(u?.level || 2)));
      const tierCode = u?.atw_tier || `ATW${level}`;
      if (!emailLower || tierCode.toLowerCase() === "unlimited") return;

      const capFormatted = `₦${(level * 30000).toLocaleString("en-US")}`;
      if (isRedisReady()) {
        await redisConnection
          .set(`notif:milestone:v2:atw:${emailLower}:${tierCode.toUpperCase()}`, "1", "EX", 86400 * 180)
          .catch(() => {});
      }
      await invalidateUserNotificationAndTierCaches(emailLower);

      await dispatchNotificationWebhook({
        user_email: emailLower,
        title: `ATW Level Upgraded to ${tierCode}`,
        message: `Congratulations! Your ATW level has increased to ${tierCode}, raising your new balance cap to ${capFormatted}. Please withdraw your earnings promptly so you don't hit your limit.`,
        created_at: nowIso,
      }).catch(() => {});
    })
  );
}

/**
 * Fallback helper for environments whose SQL RPC has not yet been updated to return `upgraded_users`.
 * Compares listener ATW tiers before & after an ad rating or buffer flush.
 */
export async function snapshotUserLevelsByEmails(
  emails: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const clean = Array.from(
    new Set(emails.map((e) => String(e || "").toLowerCase().trim()).filter(Boolean))
  ).slice(0, 500);
  if (clean.length === 0) return map;

  const { data } = await supabaseAdmin
    .from("users")
    .select("email, atw_tier")
    .in("email", clean);

  for (const row of data || []) {
    if (row?.email) {
      map.set(String(row.email).toLowerCase().trim(), parseNumericAtwLevel(row.atw_tier));
    }
  }
  return map;
}

export async function notifyUpgradedUsersFromLevelMap(
  beforeLevels: Map<string, number>
): Promise<void> {
  if (beforeLevels.size === 0) return;
  const emails = Array.from(beforeLevels.keys());
  const { data } = await supabaseAdmin
    .from("users")
    .select("email, atw_tier, monetization_clicks, attention_worth_score, is_affiliate, is_career")
    .in("email", emails);

  const tasks: Promise<unknown>[] = [];
  for (const row of data || []) {
    const emailLower = String(row?.email || "").toLowerCase().trim();
    if (!emailLower || isExemptFromBarriersAndInactivity(emailLower, row as any)) continue;

    const prevLevel = beforeLevels.get(emailLower) ?? 1;
    const details = computeAtwTierDetails(
      Number(row.monetization_clicks || 0),
      row.atw_tier,
      false,
      row.attention_worth_score
    );
    if (!details.isUnlimited && details.level >= 2 && details.level > prevLevel) {
      tasks.push(notifyAtwLevelIncreased(emailLower, details.tierCode, details.holdingCapFormatted));
    }
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}
