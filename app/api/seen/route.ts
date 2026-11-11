import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { streamImpressionsToClickHouse } from "@/lib/clickhouse";
import {
  incrementCachedMonetizationClicks,
  invalidateCachedProfile,
  invalidateCachedUserCampaigns,
} from "@/lib/utils/cache";
import { checkRateLimit } from "@/lib/edgeRateLimit";
import { getEarnTokenSecret } from "@/lib/targetingEngine";
import { env } from "@/lib/env";
import { recordCoalescedAdSeen } from "@/lib/impressionBuffer";
import { dispatchImpressionWebhook } from "@/lib/webhookDispatcher";
import { isExemptFromBarriersAndInactivity } from "@/lib/adminHelper";
import { computeAtwTierDetails } from "@/lib/attentionTierEngine";

export const dynamic = "force-dynamic";

// L1 In-Memory deduplication & pacing lock when Redis is in circuit-breaker cooldown
const l1SeenLocks = new Map<string, number>();
const l1PaceLocks = new Map<string, number>();

export async function POST(request: NextRequest) {
  try {
    // 1. Edge Rate Limit: Max 15 seen actions per minute (since each ad requires >= 10-12s attention)
    const rateLimit = await checkRateLimit(request, {
      limit: 15,
      windowSeconds: 60,
      identifierPrefix: "seen",
    });
    if (!rateLimit.allowed && rateLimit.response) {
      return rateLimit.response;
    }

    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { adId, token, servedAt } = body;

    if (!adId) {
      return NextResponse.json({ error: "adId is required" }, { status: 400 });
    }

    const emailKey = email.toLowerCase().trim();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // 2. Cryptographic HMAC Token Verification
    if (token || servedAt || process.env.NODE_ENV === "production") {
      if (!token || !servedAt) {
        return NextResponse.json(
          { error: "Verification token and timestamp required." },
          { status: 403 }
        );
      }
      const secretKey = getEarnTokenSecret();
      const fallbackAuth0Key = env.AUTH0_SECRET || process.env.AUTH0_SECRET || "";
      const candidateKeys = Array.from(new Set([secretKey, fallbackAuth0Key].filter(Boolean)));
      const rawEmail = (email || "").trim();
      const payloads = [
        `${adId}:${emailKey}:${servedAt}`,
        `${adId}:${rawEmail}:${servedAt}`,
      ];
      const isValidToken = candidateKeys.some((k) =>
        payloads.some((p) => crypto.createHmac("sha256", k).update(p).digest("hex") === token)
      );
      if (!isValidToken) {
        console.warn("🚨 Potential fraud: Invalid verification token on ad seen:", adId, "user:", emailKey);
        return NextResponse.json(
          { error: "Cryptographic token verification failed. Seen rejected." },
          { status: 403 }
        );
      }
    }

    // L1 In-Memory Anti-Bot Pacing & Deduplication Lock
    // Pacing per unique ad: 2500ms (prevents double tap). Inter-ad pacing: 500ms (blocks robot flood, allows human feed scrolls)
    const l1SeenKey = `${emailKey}:${adId}`;
    const existingSeenExpiry = l1SeenLocks.get(l1SeenKey);
    const existingPaceExpiry = l1PaceLocks.get(emailKey);
    if ((existingSeenExpiry && existingSeenExpiry > now) || (existingPaceExpiry && existingPaceExpiry > now)) {
      const fallbackClicks = isRedisReady()
        ? Number(await redisConnection.get(`user:live_clicks:${emailKey}`).catch(() => 0)) || undefined
        : undefined;
      return NextResponse.json({
        success: true,
        duplicate: true,
        clicksCount: fallbackClicks,
        isMonetized: fallbackClicks !== undefined ? fallbackClicks >= 300 : undefined,
      });
    }
    l1SeenLocks.set(l1SeenKey, now + 2500);
    l1PaceLocks.set(emailKey, now + 500);
    if (l1SeenLocks.size > 5000) {
      for (const [k, exp] of l1SeenLocks) {
        if (exp <= now) l1SeenLocks.delete(k);
      }
    }
    if (l1PaceLocks.size > 5000) {
      for (const [k, exp] of l1PaceLocks) {
        if (exp <= now) l1PaceLocks.delete(k);
      }
    }

    // 3. Server-side Anti-Bot Pacing Lock, Token Burn & Atomic Frequency Cap Enforcement
    const todayDate = nowIso.slice(0, 10);
    let userCap = 1;
    let isPlatformPost = false;
    let checkedFromCache = false;
    let currentLifetimeViews = 0;
    let adOwnerEmail: string | null = null;
    let adCpi = 0;

    if (isRedisReady()) {
      try {
        const lockKey = `lock:click:${emailKey}:${adId}:seen`;
        const globalPaceKey = `lock:attention_pace:${emailKey}`;

        const [lockAcquired, paceAcquired, cached, existingLifetimeStr, activeCooldownRaw] = await Promise.all([
          redisConnection.set(lockKey, "1", "EX", 3, "NX"),
          redisConnection.set(globalPaceKey, "1", "PX", 500, "NX"),
          redisConnection.get(`ad:detail:${adId}`).catch(() => null),
          redisConnection.hget(`user:freq_lifetime:${emailKey}`, adId).catch(() => null),
          redisConnection.get(`user:cooldown:${emailKey}`).catch(() => null),
        ]);

        if (activeCooldownRaw) {
          try {
            const parsedCooldown = JSON.parse(activeCooldownRaw);
            if (parsedCooldown?.cooldownUntil && new Date(parsedCooldown.cooldownUntil).getTime() > now) {
              return NextResponse.json(
                {
                  success: false,
                  code: "COOLDOWN_ACTIVE",
                  cooldownUntil: parsedCooldown.cooldownUntil,
                  cooldownType: parsedCooldown.cooldownType || "pacing_15m",
                  error: "Account is currently in pacing cooldown.",
                },
                { status: 429 }
              );
            }
          } catch {}
        }

        if (!lockAcquired || !paceAcquired) {
          const fallbackClicks = Number(await redisConnection.get(`user:live_clicks:v2:${emailKey}`).catch(() => 0)) || undefined;
          return NextResponse.json({
            success: true,
            duplicate: true,
            clicksCount: fallbackClicks,
            isMonetized: fallbackClicks !== undefined ? fallbackClicks >= 300 : undefined,
          });
        }

        if (token) {
          const tokenBurnKey = `used:seen_token:${crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 32)}`;
          const tokenFresh = await redisConnection.set(tokenBurnKey, "1", "EX", 1800, "NX");
          if (!tokenFresh) {
            return NextResponse.json({ success: true, duplicate: true });
          }
        }

        currentLifetimeViews = Number(existingLifetimeStr || 0);

        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            userCap = Math.max(1, Number(parsed.user_frequency_cap || 1));
            adOwnerEmail = parsed.user_email || parsed.email || null;
            adCpi = Number(parsed.cost_per_impression || 0);
            isPlatformPost = Boolean(
              parsed.is_admin_post ||
              !parsed.cost_per_impression ||
              Number(parsed.cost_per_impression) <= 0 ||
              !parsed.impressions ||
              Number(parsed.impressions) <= 0
            );
            checkedFromCache = true;
          } catch {}
        }
      } catch {}
    }

    // Resolve ad metadata BEFORE evaluating frequency cap when cache misses
    let dbImpressionsTarget = 0;
    let dbImpressionCount = 0;
    if (!checkedFromCache) {
      try {
        const { data: adRow } = await supabaseAdmin
          .from("addsactive")
          .select("is_admin_post, cost_per_impression, impressions, impression_count, user_frequency_cap, user_email")
          .eq("id", adId)
          .maybeSingle();
        if (adRow) {
          userCap = Math.max(1, Number(adRow.user_frequency_cap || 1));
          adOwnerEmail = adRow.user_email || null;
          adCpi = Number(adRow.cost_per_impression || 0);
          dbImpressionsTarget = Number(adRow.impressions || 0);
          dbImpressionCount = Number(adRow.impression_count || 0);
          isPlatformPost = Boolean(
            adRow.is_admin_post ||
            !adRow.cost_per_impression ||
            Number(adRow.cost_per_impression) <= 0 ||
            !adRow.impressions ||
            Number(adRow.impressions) <= 0
          );
        }
      } catch {}
    }

    // Server-side guard: Ad owners viewing their own ad do not deplete their impressions or qualify referral bonuses
    if (adOwnerEmail && adOwnerEmail.toLowerCase().trim() === emailKey) {
      return NextResponse.json({
        success: true,
        message: "Owner preview recorded (impressions and budget preserved).",
        isOwner: true,
      });
    }

    // Token and dwell time soft verification for paid advertiser campaigns
    if (!isPlatformPost && (!token || !servedAt)) {
      console.log("ℹ️ Seen recorded via client feed interaction without verification token for ad:", adId);
    }

    if (isRedisReady()) {
      try {
        const newLifetimeViews = currentLifetimeViews + 1;

        // Atomically increment frequency, pacing, and last_viewed_at in a single Redis pipeline
        const freqPipe = redisConnection.pipeline();
        freqPipe.hincrby(`user:freq:${emailKey}:${todayDate}`, adId, 1);
        freqPipe.expire(`user:freq:${emailKey}:${todayDate}`, 86400 * 2);
        freqPipe.hincrby(`user:pacing:${emailKey}:${todayDate}`, adId, 1);
        freqPipe.expire(`user:pacing:${emailKey}:${todayDate}`, 86400);
        freqPipe.hincrby(`user:freq_lifetime:${emailKey}`, adId, 1);
        freqPipe.expire(`user:freq_lifetime:${emailKey}`, 86400 * 30);
        freqPipe.hset(`user:last_viewed:${emailKey}`, adId, nowIso);
        freqPipe.expire(`user:last_viewed:${emailKey}`, 86400 * 30);

        if (newLifetimeViews >= userCap) {
          freqPipe.sadd(`seen:ads:${emailKey}`, adId);
          freqPipe.expire(`seen:ads:${emailKey}`, 86400 * 30);
        }
        freqPipe.del(`monetize:status:${emailKey}`);
        await freqPipe.exec().catch(() => {});
      } catch {}
    }

    // Extract client device type and geo headers for ClickHouse telemetry
    const ua = request.headers.get("user-agent") || "";
    const deviceType = /Mobile|Android|iP(hone|od|ad)/i.test(ua) ? "mobile" : "desktop";
    const geoCountry =
      request.headers.get("x-vercel-ip-country") ||
      request.headers.get("cf-ipcountry") ||
      "Global";

    // Run single atomic DB impression record and click progress increment concurrently
    let clicksCount: number | undefined;
    let isMonetized: boolean | undefined;
    let impressionCount: number | undefined;

    await Promise.all([
      (async () => {
        try {
          const [updatedImpCount] = await Promise.all([
            recordCoalescedAdSeen(adId, emailKey, {
              userCap,
              isPlatformPost,
              adOwnerEmail,
              dbImpressionsTarget,
              dbImpressionCount,
            }),
            supabaseAdmin.rpc("qualify_referral_on_interaction", {
              p_referee_email: emailKey,
            }),
          ]);
          if (typeof updatedImpCount === "number") {
            impressionCount = updatedImpCount;
          }
        } catch {}

        if (adOwnerEmail) {
          invalidateCachedUserCampaigns(adOwnerEmail).catch(() => {});
        }

        streamImpressionsToClickHouse([
          {
            ad_id: adId,
            user_email: emailKey,
            cost_per_impression: adCpi,
            interaction_type: "view",
            device_type: deviceType,
            country: geoCountry,
          },
        ]).catch(() => {});
      })(),
      (async () => {
        const [rpcRes, liveVal] = await Promise.all([
          supabaseAdmin.rpc("increment_user_click_progress", {
            p_email: emailKey,
            p_count: 1,
          }),
          isRedisReady() ? incrementCachedMonetizationClicks(emailKey, 1).catch(() => 0) : Promise.resolve(0),
        ]);

        const rpcCount =
          !rpcRes.error &&
          rpcRes.data &&
          rpcRes.data.length > 0 &&
          typeof rpcRes.data[0].new_click_count === "number"
            ? Number(rpcRes.data[0].new_click_count)
            : null;

        if (rpcCount !== null && rpcCount > 0) {
          clicksCount = Math.max(rpcCount, liveVal || 0);
          isMonetized = Boolean(rpcRes.data[0]?.is_now_monetized);
        } else {
          const { data: userRow } = await supabaseAdmin
            .from("users")
            .select("id, monetization_clicks, monetized, has_cancelled_monetization")
            .eq("email", emailKey)
            .maybeSingle();

          const hasCancelled = Boolean(userRow?.has_cancelled_monetization);
          const currentDbClicks = Number(userRow?.monetization_clicks || 0);
          const nextDbClicks = Math.max(currentDbClicks + 1, liveVal || 0);
          const nextMon = hasCancelled
            ? false
            : (userRow?.monetized === true ||
               userRow?.monetized === "true" ||
               userRow?.monetized === "yes" ||
               nextDbClicks >= 300);

          if (userRow?.id) {
            await supabaseAdmin
              .from("users")
              .update({
                monetization_clicks: nextDbClicks,
                monetized: nextMon ? "true" : "false",
              })
              .eq("id", userRow.id);
          }
          clicksCount = nextDbClicks;
          isMonetized = nextMon;
        }

        const isExempt = isExemptFromBarriersAndInactivity(emailKey);
        const tierDetails = computeAtwTierDetails(clicksCount || 0, undefined, isExempt);
        const nextAtwTier = tierDetails.tierCode;

        if (nextAtwTier) {
          supabaseAdmin
            .from("users")
            .update({
              atw_tier: nextAtwTier,
            })
            .eq("email", emailKey)
            .then(() => {});
        }

        if (clicksCount !== undefined && clicksCount > 0 && isRedisReady()) {
          redisConnection.set(`user:live_clicks:v2:${emailKey}`, String(clicksCount), "EX", 86400 * 30).catch(() => {});
          redisConnection.del(`monetize:status:v2:${emailKey}`).catch(() => {});
        }

        invalidateCachedProfile(emailKey).catch(() => {});
      })(),
    ]);

    const isExempt = isExemptFromBarriersAndInactivity(emailKey);
    const tierDetails = computeAtwTierDetails(clicksCount || 0, undefined, isExempt);
    if (typeof clicksCount === "number") {
      dispatchImpressionWebhook({
        event: "ad.seen",
        timestamp: Date.now(),
        data: {
          userEmail: emailKey,
          adId,
          clicksCount,
          isMonetized: Boolean(isMonetized || isExempt),
          impressionCount,
          atwTier: tierDetails.tierCode,
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      queued: false,
      clicksCount,
      isMonetized: Boolean(isMonetized || isExempt),
      atwTier: tierDetails.tierCode,
      holdingCap: tierDetails.isUnlimited ? null : tierDetails.holdingCap,
      impressionCount,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/seen:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

