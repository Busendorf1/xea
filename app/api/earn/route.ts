import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import { isExemptFromBarriersAndInactivity } from "@/lib/adminHelper";
import { creditAffiliatePlatformShare } from "@/lib/affiliateEngine";
import crypto from "crypto";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { env } from "@/lib/env";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import {
  atomicCheckAndAcquireEarnLock,
  releaseEarnLock,
  incrementCachedMutualCount,
  incrementCachedMonetizationClicks,
  publishLiveBalanceUpdate,
  getCachedProfile,
  setCachedProfile,
} from "@/lib/utils/cache";
import { dispatchEarningWebhook } from "@/lib/webhookDispatcher";
import { checkRateLimit } from "@/lib/edgeRateLimit";
import { getEarnTokenSecret } from "@/lib/targetingEngine";
import { bufferAdImpression } from "@/lib/impressionBuffer";

function logToTerminal(message: string) {
  if (process.env.NODE_ENV !== "production") {
    console.info(message);
  }
}

export async function POST(request: NextRequest) {
  // Edge Rate Limiting: max 60 requests/minute per IP to drop flood volume
  const rateLimit = await checkRateLimit(request, {
    limit: 60,
    windowSeconds: 60,
    identifierPrefix: "earn",
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  let emailKey = "";
  let adIdToUnlock: string | null = null;
  let atomicViews = 1;
  let atomicCap = 1;

  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await auth0.getSession();
    const body = await request.json();
    const { adId, token, servedAt, type, deviceId, telemetry, turnstileToken } = body;
    // Server-verified elapsed attention (ms) since the HMAC-signed servedAt timestamp.
    // Used to cap the client-reported attention bonus so it can never exceed real elapsed time.
    let verifiedViewDurationMs = 0;

    if (!adId || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (type !== "earn" && type !== "mutual") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    emailKey = email.toLowerCase().trim();

    if (type === "earn") {
      logToTerminal(`\n========================================================================\n🟢 [EARN CLICK DETECTED] Action received at /api/earn\n   👤 User Email : ${emailKey}\n   📢 Ad ID      : ${adId}\n   ⏰ Timestamp  : ${new Date().toISOString()}\n========================================================================\n`);
    }

    // 1. Server-side rapid click deduplication (3s lock per adId to prevent double-clicks on the same ad)
    if (isRedisReady()) {
      try {
        const rapidClickLock = `lock:click:${emailKey}:${adId}:${type}`;
        const rapidAcquired = await redisConnection.set(rapidClickLock, "1", "EX", 3, "NX");
        if (!rapidAcquired) {
          return NextResponse.json({ error: "Duplicate action detected. Please wait." }, { status: 429 });
        }
      } catch {}
    }

    const userId = session?.user?.sub || email;
    const secretKey = getEarnTokenSecret();
    const fallbackAuth0Key = env.AUTH0_SECRET || process.env.AUTH0_SECRET || "";
    if (!secretKey) {
      console.error("❌ CRITICAL: Earn token secret is not configured in production for /api/earn.");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
    const now = Date.now();

    // 2. Cryptographic HMAC verification token & dwell time verification (enforced for both earn and mutual)
    if (type === "earn" || (type === "mutual" && (token || servedAt))) {
      if (!token || !servedAt) {
        return NextResponse.json(
          { error: "Verification token and timestamp required to claim reward." },
          { status: 403 }
        );
      }

      const rawEmail = (email || "").trim();
      const payloads = [
        `${adId}:${userId}:${servedAt}`,
        `${adId}:${emailKey}:${servedAt}`,
        `${adId}:${rawEmail}:${servedAt}`,
      ];
      const candidateKeys = Array.from(new Set([secretKey, fallbackAuth0Key].filter(Boolean)));
      const isValidToken = candidateKeys.some((k) =>
        payloads.some((p) => crypto.createHmac("sha256", k).update(p).digest("hex") === token)
      );
      if (!isValidToken) {
        console.warn("🚨 Potential ad fraud: HMAC Token mismatch in /api/earn for user:", emailKey, "Ad:", adId);
        return NextResponse.json(
          { error: "Cryptographic token verification failed. Reward rejected." },
          { status: 403 }
        );
      }

      const parsedServedAt = parseInt(servedAt, 10);
      const viewDuration = now - parsedServedAt;
      verifiedViewDurationMs = isNaN(viewDuration) ? 0 : viewDuration;
      if (isNaN(parsedServedAt) || viewDuration < 12000) {
        return NextResponse.json(
          { error: "Minimum attention duration not met. Please view the ad completely before claiming." },
          { status: 400 }
        );
      }
      if (viewDuration > 1800000) {
        return NextResponse.json(
          { error: "Ad session expired (Max 30m). Please refresh feed." },
          { status: 400 }
        );
      }
    } else if (type === "mutual" && isRedisReady()) {
      // Fallback pacing guard if legacy client calls mutual without token
      try {
        const mutualPaceKey = `lock:attention_pace:${emailKey}`;
        const paceAcquired = await redisConnection.set(mutualPaceKey, "1", "EX", 10, "NX");
        if (!paceAcquired) {
          return NextResponse.json(
            { error: "Please view one ad at a time before claiming the next action." },
            { status: 429 }
          );
        }
      } catch {}
    }

    if (type === "earn") {
      // 2.2 Anti-Replay & Global Per-User Attention Pacing Lock (Blocks multi-tab farming & replay scripts)
      if (isRedisReady()) {
        try {
          const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 32);
          const tokenBurnKey = `used:earn_token:${tokenHash}`;
          const globalPaceKey = `lock:attention_pace:${emailKey}`;

          const [tokenFresh, paceAcquired] = await Promise.all([
            redisConnection.set(tokenBurnKey, "1", "EX", 2100, "NX"),
            redisConnection.set(globalPaceKey, "1", "EX", 10, "NX"),
          ]);

          if (!tokenFresh) {
            return NextResponse.json(
              { error: "This verification token has already been used.", code: "ALREADY_EARNED" },
              { status: 403 }
            );
          }

          if (!paceAcquired) {
            return NextResponse.json(
              { error: "Please view one ad at a time before claiming the next reward." },
              { status: 429 }
            );
          }

          // Telemetry Replay Fingerprint Check: Reject recorded/replayed mouse or touch trajectories
          if (Array.isArray(telemetry) && telemetry.length > 0) {
            const normalizedSig = telemetry
              .slice(0, 24)
              .map((pt: any) => `${Math.round(Number(pt.x || 0))},${Math.round(Number(pt.y || 0))},${Math.round(Number(pt.p || 0) * 100)}`)
              .join("|");
            const telemetryHash = crypto.createHash("sha256").update(normalizedSig).digest("hex").slice(0, 24);
            const telemetryReplayKey = `used:telemetry:${emailKey}:${telemetryHash}`;
            const isFreshTelemetry = await redisConnection.set(telemetryReplayKey, "1", "EX", 86400, "NX");
            if (!isFreshTelemetry) {
              console.warn("🚨 Telemetry replay attack blocked in /api/earn for user:", emailKey);
              return NextResponse.json(
                { error: "Synthetic or replayed interaction detected.", code: "POH_RETRY", retryable: true },
                { status: 403 }
              );
            }
          }
        } catch {}
      }

      // 2.5 Proof of Human: Kinematic Motor Biometrics & Adaptive Turnstile Defense
      let isKinematicsHuman = true;
      let kinematicScore = 0;
      let kinematicReasons: string[] = [];

      if (Array.isArray(telemetry) && telemetry.length > 0) {
        const { evaluateKinematics } = await import("@/lib/security/kinematicsEvaluator");
        const evalResult = evaluateKinematics(telemetry);
        isKinematicsHuman = evalResult.isHuman;
        kinematicScore = evalResult.score;
        kinematicReasons = evalResult.reasons;
      } else {
        // Direct script API calls without physical interaction
        isKinematicsHuman = false;
        kinematicScore = 100;
        kinematicReasons = ["No physical interaction telemetry provided (bypassed UI)"];
      }

      // If synthetic / bot kinematics detected (score >= 65), allow soft retries before imposing cooldown
      if (!isKinematicsHuman) {
        console.warn(
          "🚨 Proof of Human retry check in /api/earn for user:",
          emailKey,
          "Ad:",
          adId,
          "Score:",
          kinematicScore,
          "Reasons:",
          kinematicReasons
        );

        // Check retry count in Redis before imposing cooldown
        let retryCount = 1;
        if (isRedisReady()) {
          try {
            const retryKey = `user:poh_retries:${emailKey}`;
            retryCount = await redisConnection.incr(retryKey);
            if (retryCount === 1) {
              await redisConnection.expire(retryKey, 120); // 2-minute sliding window
            }
          } catch {}
        }

        // Only lock account if they repeatedly fail (>= 3 times within 2 minutes)
        if (retryCount >= 3) {
          const cooldownUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          if (isRedisReady()) {
            try {
              const cooldownKey = `user:cooldown:${emailKey}`;
              await redisConnection.set(
                cooldownKey,
                JSON.stringify({ cooldownUntil, cooldownType: "pacing_15m" }),
                "EX",
                900
              );
              const cachedProf = await getCachedProfile<any>(emailKey);
              if (cachedProf) {
                await setCachedProfile(emailKey, {
                  ...cachedProf,
                  cooldown_until: cooldownUntil,
                  cooldown_type: "pacing_15m",
                });
              }
            } catch {}
          }

          return NextResponse.json(
            {
              error: "Repeated invalid interaction attempts. Account placed on temporary pacing cooldown.",
              code: "COOLDOWN_ACTIVE",
              cooldownUntil,
              cooldownType: "pacing_15m",
            },
            { status: 403 }
          );
        }

        // Return a soft retryable error
        return NextResponse.json(
          {
            error: "Verification incomplete. Please retry the challenge or listen again.",
            code: "POH_RETRY",
            retryable: true,
            reasons: kinematicReasons,
          },
          { status: 400 }
        );
      } else {
        // Clear previous retry count on verified human interaction
        if (isRedisReady()) {
          try {
            await redisConnection.del(`user:poh_retries:${emailKey}`);
          } catch {}
        }
      }
    }

    // 3 & 4. Pipelined Cooldown, Velocity History & Ad Detail Lookup (Single Redis Round-Trip)
    let rawCpi = 25.0;
    let isPlatformPost = false;

    if (isRedisReady()) {
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
          return NextResponse.json(
            {
              success: false,
              code: "COOLDOWN_ACTIVE",
              cooldownUntil: cachedProf.suspended_until,
              cooldownType: "review_hours",
              error: "Account is currently under review or suspended.",
            },
            { status: 403 }
          );
        }

        if (!isExemptAccount && cachedCooldownRaw) {
          const { cooldownUntil, cooldownType } = JSON.parse(cachedCooldownRaw);
          if (new Date(cooldownUntil).getTime() > now) {
            return NextResponse.json({
              success: false,
              code: "COOLDOWN_ACTIVE",
              cooldownUntil,
              cooldownType: cooldownType || "pacing_15m",
              message: "Earning is currently in cooldown.",
            });
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
              redisConnection.set(cooldownKey, JSON.stringify({ cooldownUntil, cooldownType }), "EX", cooldownMinutes * 60).catch(() => {}),
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

            return NextResponse.json({
              success: false,
              code: "COOLDOWN_ACTIVE",
              cooldownUntil,
              cooldownType,
              message: "Pacing limit reached.",
            });
          }

          // Pipeline ring buffer update in background (non-blocking)
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
    }

    if (type === "earn" && isPlatformPost) {
      return NextResponse.json({
        success: false,
        error: "This is a platform post without an earning budget. Users cannot earn from platform posts.",
      }, { status: 400 });
    }

    // Dynamic attention share: 30% base (16s focus) scaling linearly to 50% max (32s total focus).
    // Client-reported bonus is clamped to [0,16] AND to the server-verified elapsed time beyond the 16s base,
    // so a scripted client cannot claim the 50% tier without the attention time actually elapsing.
    const clientBonusSeconds =
      typeof body.bonusSeconds === "number" && Number.isFinite(body.bonusSeconds) ? body.bonusSeconds : 0;
    const serverMaxBonusSeconds = Math.max(0, Math.floor(verifiedViewDurationMs / 1000) - 16);
    const bonusSeconds = Math.max(0, Math.min(16, clientBonusSeconds, serverMaxBonusSeconds));
    const attentionSharePercent = 0.30 + (bonusSeconds / 16.0) * 0.20;
    let earnedRateNumber = Math.round(rawCpi * attentionSharePercent * 100) / 100;
    if (earnedRateNumber <= 0) {
      earnedRateNumber = Math.round(25.0 * attentionSharePercent * 100) / 100;
    }

    let updatedBalance: number | null = null;
    let liveClicks = 0;

    if (type === "earn") {
      const earnedSetKey = `earned:ads:${emailKey}`;
      const hasAlreadyEarned = false;

      // 5. Atomic Redis Lua Lock: Verifies ad is NOT in earned:ads:<email> and acquires 30s lock
      if (isRedisReady()) {
        const lockResult = await atomicCheckAndAcquireEarnLock(emailKey, adId, 30);
        if (!lockResult.allowed) {
          if (lockResult.code === "ALREADY_EARNED") {
            return NextResponse.json({
              success: false,
              code: "ALREADY_EARNED",
              error: "This ad reward has already been claimed on your account.",
            }, { status: 400 });
          }
          if (lockResult.code === "CONCURRENT_CLAIM") {
            return NextResponse.json({
              success: false,
              code: "CONCURRENT_CLAIM",
              error: "An earn transaction for this ad is currently being processed on another device.",
            }, { status: 429 });
          }
        }
        adIdToUnlock = adId;
      }

      logToTerminal(`\n========================================================================\n🟢 [EARN CLAIM INITIATED]\n   👤 User Email : ${emailKey}\n   📢 Ad ID      : ${adId}\n   📊 Base CPI   : ₦${rawCpi.toFixed(2)}\n   ⏱️ Focus Bonus: +${bonusSeconds}s (${Math.round(attentionSharePercent * 100)}% Rate: ₦${earnedRateNumber.toFixed(2)})\n========================================================================\n`);

      // 6. Authoritative Atomic Transaction in PostgreSQL (Single ACID RPC)
      atomicViews = 1;
      atomicCap = 1;

      const { data: atomicResult, error: atomicErr } = await supabaseAdmin.rpc("claim_ad_earning_atomic", {
        p_ad_id: adId,
        p_user_email: emailKey,
        p_expected_rate: earnedRateNumber,
        p_device_id: deviceId || null,
        p_skip_ad_counter: isRedisReady(),
      });

      const isLegitRejection =
        atomicResult &&
        !atomicResult.success &&
        (atomicResult.code === "CAMPAIGN_COMPLETED" ||
          atomicResult.code === "USER_SUSPENDED");

      const shouldUseFallback = Boolean(
        atomicErr || (atomicResult && !atomicResult.success && !isLegitRejection)
      );

      if (shouldUseFallback) {
        console.warn("⚠️ Running direct DB fallback for earn claim:", atomicErr?.message || atomicResult?.error || "Reconciling seen view");
        // Fallback gracefully to direct verification if RPC is not yet executed in database
        const { data: dbUser, error: userFetchErr } = await supabaseAdmin
          .from("users")
          .select("balance, monetization_clicks, monetized, referral_downloads_count, suspended_until, atw_tier, is_affiliate, is_career")
          .ilike("email", emailKey)
          .maybeSingle();

        if (userFetchErr) {
          console.error("❌ DB fallback error fetching user:", userFetchErr);
        }

        const isExemptDbUser = isExemptFromBarriersAndInactivity(emailKey, dbUser as any);

        if (!isExemptDbUser && dbUser?.suspended_until && new Date(dbUser.suspended_until).getTime() > now) {
          return NextResponse.json({
            success: false,
            code: "USER_SUSPENDED",
            error: "Account is currently suspended.",
          }, { status: 403 });
        }

        const currentBal = Number(dbUser?.balance) || 0;
        const currentClicks = Number(dbUser?.monetization_clicks) || 0;
        const currentInvites = Number(dbUser?.referral_downloads_count) || 0;
        const isMonetized = Boolean(
          isExemptDbUser ||
          dbUser?.monetized === true ||
          dbUser?.monetized === "true" ||
          dbUser?.monetized === "yes" ||
          dbUser?.monetized === "1" ||
          dbUser?.monetized === "t" ||
          currentClicks >= 300 ||
          currentInvites >= 12
        );

        let adCpi = rawCpi;
        let userFreqCap = 1;
        let adCompleted = false;
        let impressionsTarget = 0;
        let impressionCount = 0;
        let adOwnerEmail: string | null = null;

        try {
          let { data: adRow } = await supabaseAdmin
            .from("addsactive")
            .select("cost_per_impression, user_frequency_cap, impressions, impression_count, completed_at, is_admin_post, user_email")
            .eq("id", adId)
            .maybeSingle();

          if (!adRow) {
            const { data: addsRow } = await supabaseAdmin
              .from("adds")
              .select("cost_per_impression, user_frequency_cap, impressions, impression_count, completed_at, is_admin_post, user_email")
              .eq("id", adId)
              .maybeSingle();
            adRow = addsRow;
          }

          if (adRow) {
            adOwnerEmail = adRow.user_email || null;
            const isPlatformDb = Boolean(
              isAdminEmail(adRow.user_email) ||
              adRow.is_admin_post ||
              !adRow.cost_per_impression ||
              Number(adRow.cost_per_impression) <= 0 ||
              !adRow.impressions ||
              Number(adRow.impressions) <= 0
            );

            if (isPlatformDb) {
              return NextResponse.json({
                success: false,
                error: "This is a platform post without an earning budget. Users cannot earn from platform posts.",
              }, { status: 400 });
            }

            if (adOwnerEmail && adOwnerEmail.toLowerCase().trim() === emailKey) {
              return NextResponse.json({
                success: false,
                error: "You cannot earn from your own advertisement.",
              }, { status: 400 });
            }

            if (adRow.cost_per_impression !== undefined && adRow.cost_per_impression !== null) {
              adCpi = Number(adRow.cost_per_impression) || 0;
            }
            userFreqCap = Number(adRow.user_frequency_cap || 1);
            impressionsTarget = Number(adRow.impressions || 0);
            impressionCount = Number(adRow.impression_count || 0);
            adCompleted = !!adRow.completed_at || (impressionsTarget > 0 && impressionCount >= impressionsTarget);
          }
        } catch (adFetchErr) {
          console.warn("⚠️ DB fallback error fetching ad:", adFetchErr);
        }

        if (adCompleted) {
          return NextResponse.json({
            success: false,
            code: "CAMPAIGN_COMPLETED",
            error: "This ad campaign has completed its impression budget.",
          }, { status: 400 });
        }

        if (adCpi <= 0) {
          adCpi = rawCpi > 0 ? rawCpi : 25.00;
        }

        // Check frequency cap in ad_impressions
        const { data: existingImp } = await supabaseAdmin
          .from("ad_impressions")
          .select("id, view_count")
          .eq("ad_id", adId)
          .ilike("user_email", emailKey)
          .maybeSingle();

        const existingViews = existingImp ? Number(existingImp.view_count || 0) : 0;
        atomicViews = existingViews + 1;
        atomicCap = userFreqCap;

        if (hasAlreadyEarned) {
          if (isRedisReady()) {
            await redisConnection.sadd(earnedSetKey, adId).catch(() => {});
          }
          return NextResponse.json({
            success: false,
            code: "ALREADY_EARNED",
            error: "This ad reward has already been claimed on your account.",
            views: existingViews,
            cap: userFreqCap,
          }, { status: 400 });
        }

        const { computeAtwTierDetails } = await import("@/lib/attentionTierEngine");
        liveClicks = currentClicks + 1;
        const tierDetails = computeAtwTierDetails(liveClicks, dbUser?.atw_tier, isExemptDbUser);
        const holdingCap = tierDetails.isUnlimited ? Infinity : tierDetails.holdingCap;
        const dynamicFallbackShare = 0.30 + (bonusSeconds / 16.0) * 0.20;
        let rateToApply = isMonetized ? Math.round(adCpi * dynamicFallbackShare * 100) / 100 : 0;
        if (currentBal >= holdingCap) {
          rateToApply = 0; // ATW Holding Cap reached: overflow forfeited to platform liquidity
        }
        const uncappedBalance = Math.round((currentBal + rateToApply) * 100) / 100;
        updatedBalance = isMonetized ? Math.min(holdingCap, uncappedBalance) : currentBal;
        earnedRateNumber = rateToApply;
        rawCpi = adCpi;

        console.log(`📊 [POST /api/earn] Fallback DB calculation: DynamicRate=${rateToApply} (${Math.round(dynamicFallbackShare * 100)}%, CPI=${adCpi}), prevBal=${currentBal}, newBalance=${updatedBalance} (ATW Tier=${tierDetails.tierCode}, Cap=${tierDetails.holdingCapFormatted}), newClicks=${liveClicks}, views=${existingViews + 1}/${userFreqCap}`);

        if (existingImp) {
          await supabaseAdmin
            .from("ad_impressions")
            .update({
              view_count: existingViews + 1,
              last_viewed_at: new Date().toISOString(),
            })
            .eq("id", existingImp.id);
        } else {
          await supabaseAdmin
            .from("ad_impressions")
            .insert({
              ad_id: adId,
              user_email: emailKey,
              view_count: 1,
              last_viewed_at: new Date().toISOString(),
            });
        }

        const isNowExhausted = impressionsTarget > 0 && (impressionCount + 1) >= impressionsTarget;
        const completedIso = isNowExhausted ? new Date().toISOString() : null;

        let updatedAdRow: any = null;
        if (isRedisReady()) {
          // Hot-row decoupling: buffer in Redis for 5s batch flush (eliminates hot-row locking)
          bufferAdImpression(adId).catch(() => {});
        } else {
          // Synchronous fallback only when Redis is unavailable
          const adUpdateRes = await supabaseAdmin
            .from("addsactive")
            .update({
              impression_count: impressionCount + 1,
              completed_at: completedIso,
            })
            .eq("id", adId)
            .select("*")
            .maybeSingle();
          updatedAdRow = adUpdateRes.data;

          await supabaseAdmin
            .from("adds")
            .update({ impression_count: impressionCount + 1 })
            .eq("id", adId);

          if (isNowExhausted) {
            try {
              if (updatedAdRow) {
                await supabaseAdmin.from("completed_ads").upsert([updatedAdRow], { onConflict: "id" });
              }
              await supabaseAdmin.from("addsactive").delete().eq("id", adId);
              await supabaseAdmin.from("bidded_ads").delete().eq("ad_id", adId).then(() => {}, () => {});
              await supabaseAdmin.from("adds").update({ completed_at: completedIso, impression_count: impressionCount + 1 }).eq("id", adId);
              try {
                const { evictAdFromL1FeedCaches } = await import("@/lib/utils/cache");
                evictAdFromL1FeedCaches(adId);
              } catch {}
              if (isRedisReady()) {
                await redisConnection.del(`ad:detail:${adId}`, "campaigns:shared_pool:v1").catch(() => {});
              }
            } catch {}
          }
        }

        const adOwnerToInvalidate = updatedAdRow?.user_email || adOwnerEmail;
        if (adOwnerToInvalidate) {
          const { invalidateCachedUserCampaigns } = await import("@/lib/utils/cache");
          invalidateCachedUserCampaigns(adOwnerToInvalidate).catch(() => {});
        }

        const { error: userUpdateErr } = await supabaseAdmin
          .from("users")
          .update({
            balance: updatedBalance,
            monetization_clicks: liveClicks,
            atw_tier: tierDetails.tierCode,
            monetized: (isMonetized || liveClicks >= 300 || isExemptDbUser) ? "true" : (dbUser?.monetized ? "true" : "false"),
            last_active_at: new Date().toISOString(),
          })
          .ilike("email", emailKey);

        if (earnedRateNumber > 0) {
          try {
            await supabaseAdmin.from("wallet_transactions").insert({
              user_email: emailKey,
              type: "earn",
              amount: earnedRateNumber,
              description: `Earned 50% share (₦${earnedRateNumber}) from ad interaction`,
              reference: `EARN_${adId}_${Date.now()}`,
              status: "completed",
            });
          } catch {}
        }

        if (userUpdateErr) {
          console.error("❌ DB fallback error updating user balance:", userUpdateErr);
        } else {
          logToTerminal(`\n========================================================================\n💰 [EARN SUCCESS -> DB COMMITTED (Direct Fallback)]\n   👤 User Email : ${emailKey}\n   📢 Ad ID      : ${adId}\n   💵 Earned Rate: ₦${earnedRateNumber.toFixed(2)} (${Math.round(attentionSharePercent * 100)}% attention share)\n   🏦 DB Balance : ₦${Number(updatedBalance).toFixed(2)}\n   🎯 DB Clicks  : ${liveClicks}\n========================================================================\n`);
        }

        // Credit 10% of ad CPI to each active Affiliate from the Platform's 50% share
        await creditAffiliatePlatformShare(adCpi, adId, emailKey).catch(() => {});
      } else if (atomicResult && !atomicResult.success) {
        console.warn("⚠️ [POST /api/earn] Atomic DB claim rejected:", atomicResult);
        if (atomicResult.code === "ALREADY_EARNED" && isRedisReady()) {
          await redisConnection.sadd(earnedSetKey, adId).catch(() => {});
        }
        return NextResponse.json({
          success: false,
          code: atomicResult.code || "ALREADY_EARNED",
          error: atomicResult.error || "Reward for this ad has already been credited.",
          views: atomicResult.views,
          cap: atomicResult.cap,
        }, { status: 400 });
      } else if (atomicResult && atomicResult.success) {
        updatedBalance = Number(atomicResult.balance ?? atomicResult.new_balance);
        liveClicks = Number(atomicResult.clicks ?? atomicResult.new_clicks);
        earnedRateNumber = Number(atomicResult.amount ?? atomicResult.earned_amount);
        atomicViews = Number(atomicResult.views ?? atomicResult.ad_views ?? 1);
        if (atomicResult.raw_cpi && Number(atomicResult.raw_cpi) > 0) {
          rawCpi = Number(atomicResult.raw_cpi);
        }
        if (atomicResult.cap) {
          atomicCap = Number(atomicResult.cap);
        }
        if (atomicResult.is_exhausted || atomicResult.completed) {
          try {
            const { evictAdFromL1FeedCaches } = await import("@/lib/utils/cache");
            evictAdFromL1FeedCaches(adId);
          } catch {}
          if (isRedisReady()) {
            redisConnection.del(`ad:detail:${adId}`, "campaigns:shared_pool:v1").catch(() => {});
          }
        }
        if (isRedisReady()) {
          bufferAdImpression(adId).catch(() => {});
        }
        // If legacy claim_ad_earning_atomic RPC was executed without affiliate_credited flag, ensure affiliates are credited
        if (!atomicResult.affiliate_credited) {
          await creditAffiliatePlatformShare(rawCpi, adId, emailKey).catch(() => {});
        }
        const { computeAtwTierDetails } = await import("@/lib/attentionTierEngine");
        const isExemptAtomic = isExemptFromBarriersAndInactivity(emailKey);
        const atomicTier = computeAtwTierDetails(liveClicks, undefined, isExemptAtomic);
        logToTerminal(`\n========================================================================\n💰 [EARN SUCCESS -> DB COMMITTED (Atomic RPC)]\n   👤 User Email : ${emailKey}\n   📢 Ad ID      : ${adId}\n   💵 50% Amount : ₦${earnedRateNumber.toFixed(2)}\n   🏦 DB Balance : ₦${Number(updatedBalance).toFixed(2)}\n   🎯 DB Clicks  : ${liveClicks} (${atomicTier.tierCode})\n   👁️ View Cap   : ${atomicViews}/${atomicCap}\n========================================================================\n`);

        // Stream earned impression directly to ClickHouse Cloud (high-throughput non-blocking)
        const ua = request.headers.get("user-agent") || "";
        const deviceType = /Mobile|Android|iP(hone|od|ad)/i.test(ua) ? "mobile" : "desktop";
        const geoCountry =
          request.headers.get("x-vercel-ip-country") ||
          request.headers.get("cf-ipcountry") ||
          "Global";
        const { streamImpressionsToClickHouse } = await import("@/lib/clickhouse");
        streamImpressionsToClickHouse([
          {
            ad_id: adId,
            user_email: emailKey,
            cost_per_impression: rawCpi,
            interaction_type: "view",
            device_type: deviceType,
            country: geoCountry,
          },
        ]).catch(() => {});
      }

      // 6.5 Paayh Agents 1% / 2% Earning Deduction & Upline Commission Credit
      // Unmonetized accounts have not yet started earning, so they generate 0 commission for their Agent.
      const isEarnerNowMonetized = Boolean(
        (atomicResult && atomicResult.monetized) || liveClicks >= 300
      );
      if (isEarnerNowMonetized && earnedRateNumber > 0 && updatedBalance !== null && !isNaN(updatedBalance)) {
        try {
          const { applyAgentCommissionOnEarning } = await import("@/lib/agentSystem");
          const agentSplit = await applyAgentCommissionOnEarning({
            earnerEmail: emailKey,
            grossEarnedAmount: earnedRateNumber,
            currentEarnerBalance: updatedBalance,
            adId,
          });
          if (agentSplit.deductedAmount > 0) {
            earnedRateNumber = agentSplit.netEarnerAmount;
            updatedBalance = agentSplit.adjustedEarnerBalance;
          }
        } catch (agentSplitErr) {
          console.warn("⚠️ Agent earning split warning in /api/earn:", agentSplitErr);
        }
      }

      // 7. Sync to Redis RAM Cache & Evict from candidate sets ONLY if frequency cap reached
      if (isRedisReady()) {
        try {
          const reachedCap = atomicViews >= atomicCap;
          const nowIso = new Date().toISOString();
          const todayDate = nowIso.slice(0, 10);

          const syncPromises: Promise<any>[] = [
            redisConnection.set(`user:live_clicks:v2:${emailKey}`, String(liveClicks), "EX", 86400 * 30).catch(() => {}),
            redisConnection.del(`monetize:status:v2:${emailKey}`).catch(() => {}),
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
          const cachedRaw = await redisConnection.get(profileKey);
          let parsed = cachedRaw ? JSON.parse(cachedRaw) : null;
          if (updatedBalance !== null) {
            if (!parsed) {
              const { data: freshUser } = await supabaseAdmin.from("users").select("*").ilike("email", emailKey).maybeSingle();
              parsed = freshUser || { email: emailKey };
            }
            const { computeAtwTierDetails } = await import("@/lib/attentionTierEngine");
            const isExemptSync = isExemptFromBarriersAndInactivity(emailKey, parsed);
            const syncTier = computeAtwTierDetails(liveClicks, parsed?.atw_tier, isExemptSync);
            parsed.balance = updatedBalance;
            parsed.monetization_clicks = liveClicks;
            parsed.atw_tier = syncTier.tierCode;
            if (liveClicks >= 300 || isExemptSync) parsed.monetized = "true";
            await redisConnection.set(profileKey, JSON.stringify(parsed), "EX", 60);
          }
        } catch (rErr) {
          console.warn("⚠️ Redis sync warning in /api/earn:", rErr);
        }
      }

      // 8. Cross-Device Real-Time Synchronization (Web & Mobile App)
      const broadcastBalance = updatedBalance ?? 0;
      const { computeAtwTierDetails } = await import("@/lib/attentionTierEngine");
      const isExemptEarn = isExemptFromBarriersAndInactivity(emailKey);
      const earnTier = computeAtwTierDetails(liveClicks, undefined, isExemptEarn);
      await publishLiveBalanceUpdate(emailKey, {
        delta: earnedRateNumber,
        newBalance: broadcastBalance,
        clicks: liveClicks,
        earnedAdId: adId,
      }).catch(() => {});

      // 9. Dispatch Asynchronous Earning Webhook (Non-blocking with HMAC signature)
      dispatchEarningWebhook({
        event: "ad.earned",
        timestamp: Date.now(),
        data: {
          userEmail: emailKey,
          adId,
          amount: earnedRateNumber,
          newBalance: broadcastBalance,
          clicks: liveClicks,
          monetized: liveClicks >= 300 || isExemptEarn,
          atwTier: earnTier.tierCode,
          deviceId: deviceId || null,
        },
      }).catch(() => {});

      try {
        await supabaseAdmin.rpc("qualify_referral_on_interaction", { p_referee_email: emailKey });
      } catch {}
    } else if (type === "mutual") {
      // Record mutual click with full atomic DB persistence + fallback reconciliation
      let publisherEmail: string | null = null;
      let updatedMutualCount = 0;
      let updatedImpressionCount: number | undefined;
      try {
        const [{ data: adRow }, { data: dbUserBefore }] = await Promise.all([
          supabaseAdmin
            .from("addsactive")
            .select("user_email, impression_count, mutual_adds_count")
            .eq("id", adId)
            .maybeSingle(),
          supabaseAdmin
            .from("users")
            .select("id, balance, monetization_clicks, monetized, mutuals, mutual_count")
            .ilike("email", emailKey)
            .maybeSingle(),
        ]);

        publisherEmail = adRow?.user_email ? String(adRow.user_email).toLowerCase().trim() : null;
        if (publisherEmail && publisherEmail === emailKey) {
          return NextResponse.json({
            success: false,
            error: "You cannot add mutual from your own advertisement.",
          }, { status: 400 });
        }

        await Promise.resolve(
          supabaseAdmin.rpc("handle_mutual_click", {
            p_ad_id: adId,
            p_user_email: emailKey,
          })
        ).catch(() => {});

        const { data: dbUserAfter } = await supabaseAdmin
          .from("users")
          .select("id, balance, monetization_clicks, monetized, mutuals, mutual_count")
          .ilike("email", emailKey)
          .maybeSingle();

        const userRow = dbUserAfter || dbUserBefore;
        if (userRow) {
          const prevClicks = Number(dbUserBefore?.monetization_clicks || 0);
          const afterClicks = Number(userRow.monetization_clicks || 0);
          const nextClicks = afterClicks > prevClicks ? afterClicks : prevClicks + 1;
          const rawMutuals = Array.isArray(userRow.mutuals)
            ? userRow.mutuals.map((m: any) => String(m).toLowerCase().trim()).filter(Boolean)
            : [];
          if (publisherEmail && !rawMutuals.includes(publisherEmail)) {
            rawMutuals.push(publisherEmail);
          }
          const nextMutualCount = Math.max(Number(userRow.mutual_count || 0), rawMutuals.length);
          const isExemptMut = isExemptFromBarriersAndInactivity(emailKey, userRow as any);
          const { computeAtwTierDetails } = await import("@/lib/attentionTierEngine");
          const mutTier = computeAtwTierDetails(nextClicks, (userRow as any).atw_tier, isExemptMut);
          const nextMonetized =
            isExemptMut ||
            userRow.monetized === true ||
            userRow.monetized === "true" ||
            userRow.monetized === "yes" ||
            nextClicks >= 300;

          await supabaseAdmin
            .from("users")
            .update({
              mutuals: rawMutuals,
              mutual_count: nextMutualCount,
              monetization_clicks: nextClicks,
              atw_tier: mutTier.tierCode,
              ...(nextMonetized ? { monetized: "true" } : {}),
              last_active_at: new Date().toISOString(),
            })
            .eq("id", userRow.id);

          updatedBalance = Number(userRow.balance) || 0;
          liveClicks = nextClicks;
          updatedMutualCount = nextMutualCount;
        }

        if (adRow) {
          const nextImp = Number(adRow.impression_count || 0) + 1;
          const nextMutAdds = Number(adRow.mutual_adds_count || 0) + 1;
          updatedImpressionCount = nextImp;
          if (isRedisReady()) {
            bufferAdImpression(adId).catch(() => {});
            supabaseAdmin
              .from("addsactive")
              .update({ mutual_adds_count: nextMutAdds })
              .eq("id", adId)
              .then(() => {}, () => {});
            supabaseAdmin
              .from("adds")
              .update({ mutual_adds_count: nextMutAdds })
              .eq("id", adId)
              .then(() => {}, () => {});
          } else {
            await Promise.all([
              supabaseAdmin
                .from("addsactive")
                .update({ impression_count: nextImp, mutual_adds_count: nextMutAdds })
                .eq("id", adId),
              supabaseAdmin
                .from("adds")
                .update({ impression_count: nextImp, mutual_adds_count: nextMutAdds })
                .eq("id", adId),
            ]);
          }
        }

        await Promise.resolve(
          supabaseAdmin.rpc("qualify_referral_on_interaction", { p_referee_email: emailKey })
        ).catch(() => {});

        const { streamImpressionsToClickHouse } = await import("@/lib/clickhouse");
        streamImpressionsToClickHouse([
          {
            ad_id: adId,
            user_email: emailKey,
            cost_per_impression: 0,
            interaction_type: "mutual",
          },
        ]).catch(() => {});
      } catch (mErr) {
        console.error("❌ DB mutual error in /api/earn:", mErr);
      }

      if (isRedisReady()) {
        try {
          await Promise.all([
            incrementCachedMutualCount(emailKey),
            redisConnection.set(`user:live_clicks:v2:${emailKey}`, String(liveClicks), "EX", 86400 * 30).catch(() => {}),
            redisConnection.del(`monetize:status:v2:${emailKey}`).catch(() => {}),
            redisConnection.del(`user:profile:${emailKey}`).catch(() => {}),
          ]);
        } catch {}
      }

      dispatchEarningWebhook({
        event: "ad.mutual_added",
        timestamp: Date.now(),
        data: {
          userEmail: emailKey,
          adId,
          amount: 0,
          newBalance: updatedBalance ?? 0,
          clicks: liveClicks,
          monetized: liveClicks >= 300,
          impressionCount: updatedImpressionCount,
          mutualAdded: publisherEmail,
          mutualCount: updatedMutualCount,
          deviceId: deviceId || null,
        },
      }).catch(() => {});
    }

    // Add adId to daily pacing and active seen set ONLY if frequency cap reached
    if (isRedisReady()) {
      try {
        const todayDate = new Date().toISOString().slice(0, 10);
        const seenSetKey = `seen:ads:${emailKey}`;
        const pacingHashKey = `user:pacing:${emailKey}:${todayDate}`;

        const reachedCap = atomicViews >= atomicCap;

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

    if (type === "earn") {
      logToTerminal(`🎉 [POST /api/earn 200 OK] Rate (${Math.round(attentionSharePercent * 100)}%): ₦${earnedRateNumber.toFixed(2)} sent to DB for ${emailKey} | New DB Balance: ₦${Number(updatedBalance).toFixed(2)}\n`);
    }

    const { computeAtwTierDetails } = await import("@/lib/attentionTierEngine");
    const isExemptFinal = isExemptFromBarriersAndInactivity(emailKey);
    const finalTier = computeAtwTierDetails(liveClicks, undefined, isExemptFinal);

    return NextResponse.json({
      success: true,
      result: earnedRateNumber,
      amount: earnedRateNumber,
      balance: updatedBalance,
      clicks: liveClicks,
      atwTier: finalTier.tierCode,
      holdingCap: finalTier.isUnlimited ? null : finalTier.holdingCap,
      views: atomicViews,
      cap: atomicCap,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/earn:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    if (emailKey && adIdToUnlock) {
      await releaseEarnLock(emailKey, adIdToUnlock).catch(() => {});
    }
  }
}

