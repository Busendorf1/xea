import { NextResponse } from "next/server";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { isAdminEmail } from "@/lib/authHelper";
import { isExemptFromBarriersAndInactivity } from "../adminHelper";
import { getCachedProfile, setCachedProfile, publishLiveBalanceUpdate } from "@/lib/utils/cache";
import { dispatchEarningWebhook } from "@/lib/webhookDispatcher";
import { computeAtwTierDetails } from "@/lib/attentionTierEngine";

export interface VelocityAndAdCheckResult {
  errorResponse?: NextResponse;
  rawCpi: number;
  isPlatformPost: boolean;
}

export async function checkVelocityAndAdCache(
  emailKey: string,
  adId: string,
  type: "earn" | "mutual",
  now: number
): Promise<VelocityAndAdCheckResult> {
  let rawCpi = 25.0;
  let isPlatformPost = false;

  if (!isRedisReady()) {
    return { rawCpi, isPlatformPost };
  }

  try {
    const cooldownKey = `user:cooldown:${emailKey}`;
    const historyKey = `user:earn_history:${emailKey}`;
    const violationsKey = `user:violations:${emailKey}`;
    const adDetailKey = `ad:detail:${adId}`;

    const [cachedCooldownRaw, historyListRaw, violationsCountRaw, cachedAd, cachedProf] = await Promise.all([
      redisConnection.get(cooldownKey).catch(() => null),
      type === "earn" ? redisConnection.lrange(historyKey, 0, 19).catch(() => []) : Promise.resolve([]),
      type === "earn" ? redisConnection.get(violationsKey).catch(() => "0") : Promise.resolve("0"),
      redisConnection.get(adDetailKey).catch(() => null),
      getCachedProfile<any>(emailKey).catch(() => null),
    ]);

    const isExemptAccount = isExemptFromBarriersAndInactivity(emailKey, cachedProf);

    if (!isExemptAccount && cachedProf?.suspended_until && new Date(cachedProf.suspended_until).getTime() > now) {
      return {
        errorResponse: NextResponse.json(
          {
            success: false,
            code: "COOLDOWN_ACTIVE",
            cooldownUntil: cachedProf.suspended_until,
            cooldownType: "review_hours",
            error: "Account is currently under review or suspended.",
          },
          { status: 403 }
        ),
        rawCpi,
        isPlatformPost,
      };
    }

    if (!isExemptAccount && cachedCooldownRaw) {
      const { cooldownUntil, cooldownType } = JSON.parse(cachedCooldownRaw);
      if (new Date(cooldownUntil).getTime() > now) {
        return {
          errorResponse: NextResponse.json({
            success: false,
            code: "COOLDOWN_ACTIVE",
            cooldownUntil,
            cooldownType: cooldownType || "pacing_15m",
            message: "Earning is currently in cooldown.",
          }),
          rawCpi,
          isPlatformPost,
        };
      }
    }

    if (type === "earn" && !isExemptAccount) {
      const lastEarnTimestamps = (historyListRaw || [])
        .map((t) => parseInt(t, 10))
        .filter((n) => !isNaN(n))
        .reverse();
      const consecutivePacingViolations = parseInt(violationsCountRaw || "0", 10) || 0;

      const { evaluateEarningVelocity } = await import("@/lib/botDetection");
      const velocityResult = evaluateEarningVelocity(now, {
        lastEarnTimestamps,
        consecutivePacingViolations,
      });

      if (velocityResult.isBotSuspect && velocityResult.cooldownDurationMinutes) {
        const cooldownMinutes = velocityResult.cooldownDurationMinutes;
        const cooldownUntil = new Date(now + cooldownMinutes * 60 * 1000).toISOString();
        const cooldownType = velocityResult.cooldownType || "pacing_15m";

        await Promise.all([
          redisConnection
            .set(cooldownKey, JSON.stringify({ cooldownUntil, cooldownType }), "EX", cooldownMinutes * 60)
            .catch(() => {}),
          redisConnection.incr(violationsKey).catch(() => {}),
          redisConnection.expire(violationsKey, 7 * 24 * 3600).catch(() => {}),
          cachedProf
            ? setCachedProfile(emailKey, {
                ...cachedProf,
                cooldown_until: cooldownUntil,
                cooldown_type: cooldownType,
              }).catch(() => {})
            : Promise.resolve(),
        ]);

        if (cooldownType === "review_hours") {
          supabaseAdmin
            .from("users")
            .update({ suspended_until: cooldownUntil })
            .ilike("email", emailKey)
            .then(() => {});
        }

        return {
          errorResponse: NextResponse.json({
            success: false,
            code: "COOLDOWN_ACTIVE",
            cooldownUntil,
            cooldownType,
            message: "Pacing limit reached.",
          }),
          rawCpi,
          isPlatformPost,
        };
      }

      const pipe = redisConnection.pipeline();
      pipe.lpush(historyKey, String(now));
      pipe.ltrim(historyKey, 0, 19);
      pipe.expire(historyKey, 24 * 3600);
      pipe.exec().catch(() => {});
    }

    if (cachedAd) {
      const parsed = JSON.parse(cachedAd);
      isPlatformPost = Boolean(
        isAdminEmail(parsed.user_email) ||
          parsed.is_admin_post ||
          !parsed.cost_per_impression ||
          Number(parsed.cost_per_impression) <= 0 ||
          !parsed.impressions ||
          Number(parsed.impressions) <= 0
      );
      if (parsed.cost_per_impression && Number(parsed.cost_per_impression) > 0) {
        rawCpi = parseFloat(String(parsed.cost_per_impression));
      }
    }
  } catch (botErr) {
    console.warn("⚠️ Pipelined earn Redis check warning:", botErr);
  }

  return { rawCpi, isPlatformPost };
}

export async function syncPostEarnCaches(params: {
  emailKey: string;
  adId: string;
  liveClicks: number;
  updatedBalance: number | null;
  atomicViews: number;
  atomicCap: number;
  maxCap?: number;
  attentionWorthScore?: number | null;
}): Promise<void> {
  const { emailKey, adId, liveClicks, updatedBalance, atomicViews, atomicCap, maxCap, attentionWorthScore } = params;
  if (!isRedisReady()) return;

  try {
    const permanentCap = maxCap !== undefined ? Math.max(atomicCap, maxCap) : atomicCap;
    const reachedCap = atomicViews >= permanentCap;
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.slice(0, 10);
    const earnedSetKey = `earned:ads:${emailKey}`;

    const syncPromises: Promise<any>[] = [
      redisConnection.set(`user:live_clicks:v2:${emailKey}`, String(liveClicks), "EX", 86400 * 30).catch(() => {}),
      redisConnection.del(`monetize:status:v2:${emailKey}`).catch(() => {}),
      redisConnection.del(`monetize:status:${emailKey}`).catch(() => {}),
      redisConnection.del(`statement:payments:${emailKey}`).catch(() => {}),
      redisConnection.del(`statement:withdrawals:${emailKey}`).catch(() => {}),
      redisConnection.del(`statement:all:${emailKey}`).catch(() => {}),
      redisConnection.hincrby(`user:freq:${emailKey}:${todayDate}`, adId, 1).catch(() => {}),
      redisConnection.expire(`user:freq:${emailKey}:${todayDate}`, 86400 * 2).catch(() => {}),
      redisConnection.hincrby(`user:freq_lifetime:${emailKey}`, adId, 1).catch(() => {}),
      redisConnection.expire(`user:freq_lifetime:${emailKey}`, 86400 * 30).catch(() => {}),
      redisConnection.hset(`user:last_viewed:${emailKey}`, adId, nowIso).catch(() => {}),
      redisConnection.expire(`user:last_viewed:${emailKey}`, 86400 * 30).catch(() => {}),
    ];

    if (reachedCap) {
      syncPromises.push(
        redisConnection.sadd(earnedSetKey, adId).catch(() => null),
        redisConnection.expire(earnedSetKey, 86400 * 30).catch(() => null)
      );
    }

    await Promise.all(syncPromises);

    const profileKey = `user:profile:${emailKey}`;
    const cachedRaw = await redisConnection.get(profileKey).catch(() => null);
    let parsed = cachedRaw ? JSON.parse(cachedRaw) : null;
    if (updatedBalance !== null) {
      if (!parsed) {
        const { data: freshUser } = await supabaseAdmin
          .from("users")
          .select("*")
          .ilike("email", emailKey)
          .maybeSingle();
        parsed = freshUser || { email: emailKey };
      }
      const isExemptSync = isExemptFromBarriersAndInactivity(emailKey, parsed);
      const effectiveScore = attentionWorthScore ?? parsed?.attention_worth_score;
      const syncTier = computeAtwTierDetails(liveClicks, parsed?.atw_tier, isExemptSync, effectiveScore);
      parsed.balance = updatedBalance;
      parsed.monetization_clicks = liveClicks;
      parsed.atw_tier = syncTier.tierCode;
      if (effectiveScore !== undefined && effectiveScore !== null) {
        parsed.attention_worth_score = effectiveScore;
      }
      if (liveClicks >= 300 || isExemptSync) parsed.monetized = "true";
      await redisConnection.set(profileKey, JSON.stringify(parsed), "EX", 60).catch(() => {});
    }
  } catch (rErr) {
    console.warn("⚠️ Redis sync warning in /api/earn:", rErr);
  }
}

export async function syncPacingAndSeenSet(
  emailKey: string,
  adId: string,
  atomicViews: number,
  atomicCap: number,
  maxCap?: number
): Promise<void> {
  if (!isRedisReady()) return;
  try {
    const todayDate = new Date().toISOString().slice(0, 10);
    const seenSetKey = `seen:ads:${emailKey}`;
    const pacingHashKey = `user:pacing:${emailKey}:${todayDate}`;
    const permanentCap = maxCap !== undefined ? Math.max(atomicCap, maxCap) : atomicCap;
    const reachedCap = atomicViews >= permanentCap;

    const pacingPromises: Promise<any>[] = [
      redisConnection.hincrby(pacingHashKey, adId, 1).catch(() => null),
      redisConnection.expire(pacingHashKey, 86400).catch(() => null),
    ];

    if (reachedCap) {
      pacingPromises.push(
        redisConnection.sadd(seenSetKey, adId).catch(() => null),
        redisConnection.expire(seenSetKey, 86400).catch(() => null)
      );
    }

    await Promise.all(pacingPromises);
  } catch {}
}

export async function publishEarnSideEffects(params: {
  emailKey: string;
  adId: string;
  earnedRateNumber: number;
  updatedBalance: number;
  liveClicks: number;
  atwTierCode: string;
  deviceId?: string | null;
}): Promise<void> {
  const { emailKey, adId, earnedRateNumber, updatedBalance, liveClicks, atwTierCode, deviceId } = params;
  const isExemptEarn = isExemptFromBarriersAndInactivity(emailKey);

  await publishLiveBalanceUpdate(emailKey, {
    delta: earnedRateNumber,
    newBalance: updatedBalance,
    clicks: liveClicks,
    earnedAdId: adId,
  }).catch(() => {});

  dispatchEarningWebhook({
    event: "ad.earned",
    timestamp: Date.now(),
    data: {
      userEmail: emailKey,
      adId,
      amount: earnedRateNumber,
      newBalance: updatedBalance,
      clicks: liveClicks,
      monetized: liveClicks >= 300 || isExemptEarn,
      atwTier: atwTierCode,
      deviceId: deviceId || null,
    },
  }).catch(() => {});

  try {
    await supabaseAdmin.rpc("qualify_referral_on_interaction", { p_referee_email: emailKey });
  } catch {}
}
