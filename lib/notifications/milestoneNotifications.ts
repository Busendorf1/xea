import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { dispatchNotificationWebhook } from "@/lib/webhookDispatcher";
import { computeAtwTierDetails, MAX_ATW_LEVEL } from "@/lib/attentionTierEngine";

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

async function invalidateUserNotificationAndTierCaches(emailLower: string): Promise<void> {
  if (!isRedisReady()) return;
  await Promise.allSettled([
    redisConnection.del(`notifications:user:${emailLower}`),
    redisConnection.del(`monetize:status:v2:${emailLower}`),
    redisConnection.del(`monetize:status:${emailLower}`),
    redisConnection.del(`user:profile:${emailLower}`),
  ]);
}

async function insertDeduplicatedNotification(params: {
  emailLower: string;
  title: string;
  message: string;
  dedupKey: string;
  dedupTtlSeconds: number;
  dbDedupLookbackDays?: number;
}): Promise<boolean> {
  const {
    emailLower,
    title,
    message,
    dedupKey,
    dedupTtlSeconds,
    dbDedupLookbackDays = 30,
  } = params;

  if (!emailLower) return false;

  if (isRedisReady()) {
    try {
      const acquired = await redisConnection.set(dedupKey, "1", "EX", dedupTtlSeconds, "NX");
      if (!acquired) return false;
    } catch {
      // Fall through to DB dedup check
    }
  }

  try {
    const sinceIso = new Date(Date.now() - dbDedupLookbackDays * 86400_000).toISOString();
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .ilike("user_email", emailLower)
      .eq("title", title)
      .gte("created_at", sinceIso)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return false;
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("notifications")
      .insert([{ user_email: emailLower, title, message }])
      .select("id, user_email, title, message, created_at")
      .maybeSingle();

    if (insertErr) {
      console.warn("⚠️ Failed inserting milestone notification:", insertErr.message);
      return false;
    }

    await invalidateUserNotificationAndTierCaches(emailLower);

    if (inserted) {
      dispatchNotificationWebhook({
        id: inserted.id,
        user_email: emailLower,
        title,
        message,
        created_at: inserted.created_at,
      }).catch(() => {});
    }

    return true;
  } catch (err: unknown) {
    console.warn("⚠️ Milestone notification error:", (err as Error)?.message || err);
    return false;
  }
}

/**
 * Notifies a user once when reaching 300 clicks and unlocking monetization.
 */
export async function notifyMonetizationUnlocked(email: string): Promise<boolean> {
  const emailLower = String(email || "").toLowerCase().trim();
  if (!emailLower) return false;

  return insertDeduplicatedNotification({
    emailLower,
    title: "Monetization Unlocked! Welcome to ATW1",
    message:
      "Congratulations! You have reached 300 clicks and unlocked monetization (ATW1, ₦30,000 balance cap). Start earning on ads now, and remember to withdraw promptly.",
    dedupKey: `notif:milestone:monetized:300:${emailLower}`,
    dedupTtlSeconds: 86400 * 7,
    dbDedupLookbackDays: 7,
  });
}

/**
 * Notifies a user once per ATW tier upgrade with their new holding balance cap and withdrawal reminder.
 */
export async function notifyAtwLevelIncreased(
  email: string,
  tierCode: string,
  holdingCapFormatted: string
): Promise<boolean> {
  const emailLower = String(email || "").toLowerCase().trim();
  if (!emailLower || !tierCode || tierCode.toLowerCase() === "unlimited") return false;

  return insertDeduplicatedNotification({
    emailLower,
    title: `ATW Level Upgraded to ${tierCode}`,
    message: `Congratulations! Your ATW level has increased to ${tierCode}, raising your new balance cap to ${holdingCapFormatted}. Please withdraw your earnings promptly so you don't hit your limit.`,
    dedupKey: `notif:milestone:atw:${emailLower}:${tierCode.toUpperCase()}`,
    dedupTtlSeconds: 86400 * 180,
    dbDedupLookbackDays: 180,
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
}

/**
 * Checks whether a click/earn/mutual update unlocked monetization at 300 clicks or raised ATW level,
 * and emits warm, deduplicated congratulatory notifications.
 */
export async function checkAndNotifyClickAndAtwMilestones(
  input: ClickAndAtwMilestoneCheckInput
): Promise<void> {
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
  } = input;

  if (!email || isExempt || hasCancelled) return;

  const crossedMonetizationThreshold =
    nextMonetized &&
    nextClicks >= 300 &&
    (prevMonetized === false ||
      (typeof prevClicks === "number" && prevClicks < 300) ||
      nextClicks === 300);

  const nextDetails = computeAtwTierDetails(
    nextClicks,
    nextAtwTier,
    isExempt,
    attentionWorthScore
  );

  const prevLevel =
    prevAtwTier !== undefined
      ? parseNumericAtwLevel(prevAtwTier)
      : typeof prevClicks === "number"
      ? computeAtwTierDetails(prevClicks, undefined, isExempt, attentionWorthScore).level
      : nextDetails.level;

  const atwIncreased =
    !nextDetails.isUnlimited &&
    nextDetails.level >= 2 &&
    nextDetails.level > prevLevel;

  const tasks: Promise<unknown>[] = [];
  if (crossedMonetizationThreshold) {
    tasks.push(notifyMonetizationUnlocked(email));
  }
  if (atwIncreased) {
    tasks.push(
      notifyAtwLevelIncreased(email, nextDetails.tierCode, nextDetails.holdingCapFormatted)
    );
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}

export interface SqlUpgradedAtwUser {
  email: string;
  atw_tier: string;
  level: number;
}

/**
 * Invalidates Redis caches and dispatches notification webhooks after SQL RPCs insert ATW upgrade notifications.
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
          .set(`notif:milestone:atw:${emailLower}:${tierCode.toUpperCase()}`, "1", "EX", 86400 * 180, "NX")
          .catch(() => {});
      }
      await invalidateUserNotificationAndTierCaches(emailLower);

      dispatchNotificationWebhook({
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
    if (!emailLower || row.is_affiliate || row.is_career) continue;

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
