import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
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
} from "@/lib/utils/cache";
import { dispatchEarningWebhook } from "@/lib/webhookDispatcher";

function logToTerminal(message: string) {
  if (process.env.NODE_ENV !== "production") {
    console.info(message);
  }
}

export async function POST(request: NextRequest) {
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
    const { adId, token, servedAt, type, deviceId } = body;

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
    const secretKey = env.AUTH0_SECRET;
    const now = Date.now();

    // 2. Cryptographic HMAC verification token & dwell time verification
    if (type === "earn") {
      if (!token || !servedAt) {
        return NextResponse.json(
          { error: "Verification token and timestamp required to claim reward." },
          { status: 403 }
        );
      }

      const payloadSub = `${adId}:${userId}:${servedAt}`;
      const payloadEmail = `${adId}:${emailKey}:${servedAt}`;
      const expectedSub = crypto.createHmac("sha256", secretKey).update(payloadSub).digest("hex");
      const expectedEmail = crypto.createHmac("sha256", secretKey).update(payloadEmail).digest("hex");

      const isValidToken = token === expectedSub || token === expectedEmail;
      if (!isValidToken) {
        console.warn("🚨 Potential ad fraud: HMAC Token mismatch in /api/earn for user:", emailKey, "Ad:", adId);
        return NextResponse.json(
          { error: "Cryptographic token verification failed. Reward rejected." },
          { status: 403 }
        );
      }

      const viewDuration = now - parseInt(servedAt, 10);
      if (viewDuration < 12000) {
        return NextResponse.json(
          { error: "Minimum ad view duration not met." },
          { status: 400 }
        );
      }
      if (viewDuration > 1800000) {
        return NextResponse.json(
          { error: "Ad session expired (Max 30m). Please refresh feed." },
          { status: 400 }
        );
      }
    }

    // 3. Active Earning Cooldown / Suspension Guard
    if (isRedisReady()) {
      try {
        const cooldownKey = `user:cooldown:${emailKey}`;
        const cachedCooldownRaw = await redisConnection.get(cooldownKey).catch(() => null);
        if (cachedCooldownRaw) {
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
      } catch (e) {
        console.warn("Cooldown parse error:", e);
      }
    }

    // 4. Sliding Window Velocity & Entropy (Anti-Bot & Click Farm Defense)
    if (type === "earn" && isRedisReady()) {
      try {
        const historyKey = `user:earn_history:${emailKey}`;
        const violationsKey = `user:violations:${emailKey}`;

        const [historyListRaw, violationsCountRaw] = await Promise.all([
          redisConnection.lrange(historyKey, 0, 19).catch(() => []),
          redisConnection.get(violationsKey).catch(() => "0"),
        ]);

        const lastEarnTimestamps = (historyListRaw || []).map((t) => parseInt(t, 10)).filter((n) => !isNaN(n)).reverse();
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
          const cooldownKey = `user:cooldown:${emailKey}`;

          await Promise.all([
            redisConnection.set(cooldownKey, JSON.stringify({ cooldownUntil, cooldownType }), "EX", cooldownMinutes * 60).catch(() => {}),
            redisConnection.incr(violationsKey).catch(() => {}),
            redisConnection.expire(violationsKey, 7 * 24 * 3600).catch(() => {}),
          ]);

          return NextResponse.json({
            success: false,
            code: "COOLDOWN_ACTIVE",
            cooldownUntil,
            cooldownType,
            message: "Pacing limit reached.",
          });
        }

        // Record timestamp in ring buffer
        await redisConnection.lpush(historyKey, String(now)).catch(() => {});
        await redisConnection.ltrim(historyKey, 0, 19).catch(() => {});
        await redisConnection.expire(historyKey, 24 * 3600).catch(() => {});
      } catch (botErr) {
        console.warn("⚠️ Bot detection Redis error:", botErr);
      }
    }

    // Resolve expected rate (Viewer earns exactly 60% of the ad CPI budget)
    let rawCpi = 25.0;
    let isPlatformPost = false;
    if (isRedisReady()) {
      try {
        const cachedAd = await redisConnection.get(`ad:detail:${adId}`);
        if (cachedAd) {
          const parsed = JSON.parse(cachedAd);
          isPlatformPost = Boolean(
            parsed.is_admin_post ||
            isAdminEmail(parsed.user_email || parsed.email) ||
            !parsed.cost_per_impression ||
            Number(parsed.cost_per_impression) <= 0 ||
            !parsed.impressions ||
            Number(parsed.impressions) <= 0
          );
          if (parsed.cost_per_impression && Number(parsed.cost_per_impression) > 0) {
            rawCpi = parseFloat(String(parsed.cost_per_impression));
          }
        }
      } catch {}
    }

    if (type === "earn" && isPlatformPost) {
      return NextResponse.json({
        success: false,
        error: "This is a platform post without an earning budget. Users cannot earn from platform posts.",
      }, { status: 400 });
    }

    let earnedRateNumber = Math.round(rawCpi * 0.60 * 100) / 100;
    if (earnedRateNumber <= 0) {
      earnedRateNumber = 15.00;
    }

    let updatedBalance: number | null = null;
    let liveClicks = 0;

    if (type === "earn") {
      const earnedSetKey = `earned:ads:${emailKey}`;

      // 5. Atomic Redis Lock: Verify Ad Not Claimed on another device concurrently
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

      logToTerminal(`\n========================================================================\n🟢 [EARN CLAIM INITIATED]\n   👤 User Email : ${emailKey}\n   📢 Ad ID      : ${adId}\n   📊 Base CPI   : ₦${rawCpi.toFixed(2)}\n   💰 60% Rate   : ₦${earnedRateNumber.toFixed(2)}\n========================================================================\n`);

      // 6. Authoritative Atomic Transaction in PostgreSQL (Single ACID RPC)
      atomicViews = 1;
      atomicCap = 1;

      const { data: atomicResult, error: atomicErr } = await supabaseAdmin.rpc("claim_ad_earning_atomic", {
        p_ad_id: adId,
        p_user_email: emailKey,
        p_expected_rate: earnedRateNumber,
        p_device_id: deviceId || null,
      });

      if (atomicErr) {
        console.warn("⚠️ Atomic DB RPC returned error or not found, running direct DB fallback:", atomicErr.message || atomicErr);
        // Fallback gracefully to direct verification if RPC is not yet executed in database
        const { data: dbUser, error: userFetchErr } = await supabaseAdmin
          .from("users")
          .select("balance, monetization_clicks, monetized, referral_downloads_count, suspended_until")
          .ilike("email", emailKey)
          .maybeSingle();

        if (userFetchErr) {
          console.error("❌ DB fallback error fetching user:", userFetchErr);
        }

        if (dbUser?.suspended_until && new Date(dbUser.suspended_until).getTime() > now) {
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
            const isPlatformDb = Boolean(
              adRow.is_admin_post ||
              isAdminEmail(adRow.user_email) ||
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

        if (existingViews >= userFreqCap) {
          if (isRedisReady()) {
            await redisConnection.sadd(earnedSetKey, adId).catch(() => {});
          }
          return NextResponse.json({
            success: false,
            code: "ALREADY_EARNED",
            error: "Frequency cap reached for this ad campaign.",
            views: existingViews,
            cap: userFreqCap,
          }, { status: 400 });
        }

        const rateToApply = Math.round(adCpi * 0.60 * 100) / 100;
        updatedBalance = Math.round((currentBal + rateToApply) * 100) / 100;
        liveClicks = currentClicks + 1;
        earnedRateNumber = rateToApply;

        console.log(`📊 [POST /api/earn] Fallback DB calculation: 60PctRate=${rateToApply} (CPI=${adCpi}), prevBal=${currentBal}, newBalance=${updatedBalance}, newClicks=${liveClicks}, views=${existingViews + 1}/${userFreqCap}`);

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

        // Increment impression count on addsactive
        await supabaseAdmin
          .from("addsactive")
          .update({
            impression_count: impressionCount + 1,
            completed_at: (impressionsTarget > 0 && (impressionCount + 1) >= impressionsTarget) ? new Date().toISOString() : null,
          })
          .eq("id", adId);

        const { error: userUpdateErr } = await supabaseAdmin
          .from("users")
          .update({
            balance: updatedBalance,
            monetization_clicks: liveClicks,
            monetized: (isMonetized || liveClicks >= 300) ? "true" : (dbUser?.monetized ? "true" : "false"),
            last_active_at: new Date().toISOString(),
          })
          .ilike("email", emailKey);

        if (userUpdateErr) {
          console.error("❌ DB fallback error updating user balance:", userUpdateErr);
        } else {
          logToTerminal(`\n========================================================================\n💰 [EARN SUCCESS -> DB COMMITTED (Direct Fallback)]\n   👤 User Email : ${emailKey}\n   📢 Ad ID      : ${adId}\n   💵 60% Amount : ₦${earnedRateNumber.toFixed(2)}\n   🏦 DB Balance : ₦${Number(updatedBalance).toFixed(2)}\n   🎯 DB Clicks  : ${liveClicks}\n========================================================================\n`);
        }
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
        updatedBalance = Number(atomicResult.balance);
        liveClicks = Number(atomicResult.clicks);
        earnedRateNumber = Number(atomicResult.amount);
        atomicViews = Number(atomicResult.views || 1);
        logToTerminal(`\n========================================================================\n💰 [EARN SUCCESS -> DB COMMITTED (Atomic RPC)]\n   👤 User Email : ${emailKey}\n   📢 Ad ID      : ${adId}\n   💵 60% Amount : ₦${earnedRateNumber.toFixed(2)}\n   🏦 DB Balance : ₦${Number(updatedBalance).toFixed(2)}\n   🎯 DB Clicks  : ${liveClicks}\n   👁️ View Cap   : ${atomicViews}/${atomicCap}\n========================================================================\n`);

        // Stream earned impression directly to ClickHouse Cloud (high-throughput non-blocking)
        const { streamImpressionsToClickHouse } = await import("@/lib/clickhouse");
        streamImpressionsToClickHouse([
          {
            ad_id: adId,
            user_email: emailKey,
            cost_per_impression: rawCpi,
            interaction_type: "view",
          },
        ]).catch(() => {});
      }

      // 7. Sync to Redis RAM Cache & Evict from candidate sets ONLY if frequency cap reached
      if (isRedisReady()) {
        try {
          const reachedCap = atomicViews >= atomicCap;

          const syncPromises: Promise<any>[] = [
            redisConnection.set(`user:live_clicks:${emailKey}`, String(liveClicks), "EX", 86400 * 30).catch(() => {}),
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
            parsed.balance = updatedBalance;
            parsed.monetization_clicks = liveClicks;
            if (liveClicks >= 300) parsed.monetized = "true";
            await redisConnection.set(profileKey, JSON.stringify(parsed), "EX", 60);
          }
        } catch (rErr) {
          console.warn("⚠️ Redis sync warning in /api/earn:", rErr);
        }
      }

      // 8. Cross-Device Real-Time Synchronization (Web & Mobile App)
      const broadcastBalance = updatedBalance ?? 0;
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
          monetized: liveClicks >= 300,
          deviceId: deviceId || null,
        },
      }).catch(() => {});

      try {
        await supabaseAdmin.rpc("qualify_referral_on_interaction", { p_referee_email: emailKey });
      } catch {}
    } else if (type === "mutual") {
      // Record mutual click
      try {
        await supabaseAdmin.rpc("handle_mutual_click", {
          p_ad_id: adId,
          p_user_email: emailKey,
        });
        await supabaseAdmin.rpc("qualify_referral_on_interaction", { p_referee_email: emailKey });
      } catch (mErr) {
        console.error("❌ DB mutual error in /api/earn:", mErr);
      }

      try {
        const { data: dbUser } = await supabaseAdmin
          .from("users")
          .select("balance, monetization_clicks, mutual_count")
          .ilike("email", emailKey)
          .maybeSingle();

        if (dbUser) {
          updatedBalance = Number(dbUser.balance) || 0;
          liveClicks = Number(dbUser.monetization_clicks) || 0;
        }
      } catch {}

      if (isRedisReady()) {
        try {
          await Promise.all([
            incrementCachedMutualCount(emailKey),
            incrementCachedMonetizationClicks(emailKey, 1).catch(() => 0),
          ]);
        } catch {}
      }
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
      logToTerminal(`🎉 [POST /api/earn 200 OK] Enforced 60%: ₦${earnedRateNumber.toFixed(2)} sent to DB for ${emailKey} | New DB Balance: ₦${Number(updatedBalance).toFixed(2)}\n`);
    }

    return NextResponse.json({
      success: true,
      result: earnedRateNumber,
      amount: earnedRateNumber,
      balance: updatedBalance,
      clicks: liveClicks,
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

