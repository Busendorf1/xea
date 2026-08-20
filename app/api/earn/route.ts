import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import crypto from "crypto";
import { feedQueue } from "@/lib/queue";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { env } from "@/lib/env";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { incrementCachedProfileBalance, incrementCachedMutualCount } from "@/lib/utils/cache";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await auth0.getSession();
    const body = await request.json();
    const { adId, token, servedAt, type } = body;

    if (!adId || !token || !servedAt || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (type !== "earn" && type !== "mutual") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const emailKey = email.toLowerCase().trim();

    // Server-side double click check (NX lock in Redis if available)
    if (isRedisReady()) {
      try {
        const lockKey = `lock:click:${emailKey}:${adId}:${type}`;
        const lockAcquired = await redisConnection.set(lockKey, "1", "EX", 15, "NX");
        if (!lockAcquired) {
          return NextResponse.json({ error: "Duplicate click action detected. Please wait." }, { status: 429 });
        }
      } catch {}
    }

    const userId = session?.user?.sub || email;

    // 1. Verify PoV Token signature using env.AUTH0_SECRET
    const secretKey = env.AUTH0_SECRET;
    const payload = `${adId}:${userId}:${servedAt}`;
    const expectedToken = crypto.createHmac("sha256", secretKey).update(payload).digest("hex");
    
    if (token !== expectedToken) {
      return NextResponse.json({ error: "Please refresh" }, { status: 400 });
    }

    const now = Date.now();
    const viewDuration = now - parseInt(servedAt, 10);

    // 2. Enforce 16-second minimum view duration
    if (viewDuration < 16000) {
      return NextResponse.json({ error: "View duration too short. Please watch the ad for at least 16 seconds." }, { status: 400 });
    }

    // 3. Enforce 30-minute maximum token age
    if (viewDuration > 1800000) {
      return NextResponse.json({ error: "Please refresh" }, { status: 400 });
    }

    // 4. Check active earning cooldown
    if (isRedisReady()) {
      try {
        const cooldownKey = `user:cooldown:${emailKey}`;
        const cachedCooldownRaw = await redisConnection.get(cooldownKey).catch(() => null);
        if (cachedCooldownRaw) {
          const { cooldownUntil, cooldownType } = JSON.parse(cachedCooldownRaw);
          if (new Date(cooldownUntil).getTime() > now) {
            // Record ad impression for advertiser delivery with 0 balance payout
            await supabaseAdmin
              .from("ad_impressions")
              .upsert({
                ad_id: adId,
                user_email: emailKey,
                view_count: 1,
                last_viewed_at: new Date().toISOString(),
              }, { onConflict: "ad_id,user_email" });

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

    // 5. Evaluate sliding window velocity & entropy (Anti-Bot Engine)
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

          // Set Redis cooldown key with TTL
          await Promise.all([
            redisConnection.set(cooldownKey, JSON.stringify({ cooldownUntil, cooldownType }), "EX", cooldownMinutes * 60).catch(() => {}),
            redisConnection.incr(violationsKey).catch(() => {}),
            redisConnection.expire(violationsKey, 7 * 24 * 3600).catch(() => {}),
          ]);

          // Record ad impression for advertiser delivery
          await supabaseAdmin
            .from("ad_impressions")
            .upsert({
              ad_id: adId,
              user_email: emailKey,
              view_count: 1,
              last_viewed_at: new Date().toISOString(),
            }, { onConflict: "ad_id,user_email" });

          return NextResponse.json({
            success: false,
            code: "COOLDOWN_ACTIVE",
            cooldownUntil,
            cooldownType,
            message: "Pacing limit reached.",
          });
        }

        // Record this timestamp in rolling history (keep last 20)
        await redisConnection.lpush(historyKey, String(now)).catch(() => {});
        await redisConnection.ltrim(historyKey, 0, 19).catch(() => {});
        await redisConnection.expire(historyKey, 24 * 3600).catch(() => {});
      } catch (botErr) {
        console.warn("⚠️ Bot detection Redis error:", botErr);
      }
    }

    let rpcResult: number | null = null;
    let dbSuccess = false;

    // 4. Directly update Supabase database so balance & mutuals take effect immediately
    if (type === "earn") {
      let earnedRateNumber = 0;

      // Step A: Attempt RPC
      try {
        const { data: earnedRate, error: earnErr } = await supabaseAdmin.rpc("handle_earn_click", {
          p_ad_id: adId,
          p_user_email: emailKey,
        });
        if (!earnErr && typeof earnedRate === "number" && earnedRate > 0) {
          earnedRateNumber = earnedRate;
          rpcResult = earnedRate;
          dbSuccess = true;
        } else if (earnErr) {
          console.warn("⚠️ handle_earn_click RPC warning, falling back to direct table update:", earnErr.message);
        }
      } catch (e) {
        console.warn("⚠️ handle_earn_click RPC exception:", e);
      }

      // Step B: Direct DB Fallback if RPC didn't credit
      if (!dbSuccess) {
        try {
          const { data: viewerData, error: vErr } = await supabaseAdmin
            .from("users")
            .select("balance, monetized, monetized_until")
            .ilike("email", emailKey)
            .maybeSingle();

          if (!vErr && viewerData) {
            const isMonetized = (viewerData.monetized === "yes" || viewerData.monetized === "true" || viewerData.monetized === true) &&
              (!viewerData.monetized_until || new Date(viewerData.monetized_until).getTime() > Date.now());

            if (isMonetized) {
              let adRate = 25.0;
              const { data: adRow } = await supabaseAdmin
                .from("addsactive")
                .select("cost_per_impression")
                .eq("id", adId)
                .maybeSingle();

              if (adRow?.cost_per_impression) {
                adRate = parseFloat(String(adRow.cost_per_impression));
              }

              const currentBalNum = parseFloat(String(viewerData.balance || "0"));
              const newBal = Math.round((currentBalNum + adRate) * 100) / 100;

              const { error: updErr } = await supabaseAdmin
                .from("users")
                .update({ balance: newBal })
                .ilike("email", emailKey);

              if (!updErr) {
                earnedRateNumber = adRate;
                rpcResult = adRate;
                dbSuccess = true;
                console.log(`✅ Direct DB credit success for ${emailKey}: +₦${adRate} (New Balance: ₦${newBal})`);
              } else {
                console.error("❌ Direct DB user balance update error:", updErr);
              }

              await supabaseAdmin
                .from("ad_impressions")
                .upsert({
                  ad_id: adId,
                  user_email: emailKey,
                  view_count: 1,
                  last_viewed_at: new Date().toISOString(),
                }, { onConflict: "ad_id,user_email" });
            }
          }
        } catch (fbErr) {
          console.error("❌ Direct DB fallback exception in /api/earn:", fbErr);
        }
      }

      await supabaseAdmin.rpc("qualify_referral_on_interaction", { p_referee_email: emailKey });

      // Update in-memory Redis cache balance immediately (0ms cache consistency)
      await incrementCachedProfileBalance(emailKey, earnedRateNumber > 0 ? earnedRateNumber : (rpcResult ?? 25));
    } else if (type === "mutual") {
      try {
        const { data: mutualRes, error: mutualErr } = await supabaseAdmin.rpc("handle_mutual_click", {
          p_ad_id: adId,
          p_user_email: emailKey,
        });
        if (!mutualErr && mutualRes !== null) {
          rpcResult = mutualRes;
          dbSuccess = true;
        } else if (mutualErr) {
          console.warn("⚠️ handle_mutual_click RPC error, falling back to direct table update:", mutualErr.message);
        }
      } catch (e) {
        console.warn("⚠️ Direct mutual RPC fallback to queue & DLQ:", e);
      }

      // Direct mutual fallback
      if (!dbSuccess) {
        try {
          const { data: adData } = await supabaseAdmin
            .from("addsactive")
            .select("user_email")
            .eq("id", adId)
            .maybeSingle();

          const publisherEmail = adData?.user_email?.toLowerCase();
          if (publisherEmail && publisherEmail !== emailKey) {
            const { data: uData } = await supabaseAdmin
              .from("users")
              .select("mutuals, mutual_count")
              .ilike("email", emailKey)
              .maybeSingle();

            const currentMutuals: string[] = Array.isArray(uData?.mutuals) ? uData.mutuals : [];
            if (!currentMutuals.map((m) => m.toLowerCase()).includes(publisherEmail) && currentMutuals.length < 50) {
              const updated = [...currentMutuals, publisherEmail];
              await supabaseAdmin
                .from("users")
                .update({ mutuals: updated, mutual_count: updated.length })
                .ilike("email", emailKey);
              dbSuccess = true;
            }
          }
        } catch (mErr) {
          console.error("❌ Direct mutual fallback exception:", mErr);
        }
      }

      await supabaseAdmin.rpc("qualify_referral_on_interaction", { p_referee_email: emailKey });

      // Update in-memory Redis cache mutuals count immediately
      await incrementCachedMutualCount(emailKey);
    }

    // 5. Zero-Loss Guard: If direct DB write had any issue, record in Dead-Letter Queue (DLQ) for Admin recovery
    if (!dbSuccess && isRedisReady()) {
      try {
        const dlqJobId = `earn_fail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await redisConnection.hset(
          "queue:dlq:dead_letter_events",
          dlqJobId,
          JSON.stringify({
            name: `${type}-click-retry`,
            data: { adId, email: emailKey, type, amount: rpcResult ?? 25 },
            failedAt: new Date().toISOString(),
            error: "Direct DB write timeout/failure. Ready for automatic/admin retry.",
          })
        );
      } catch {}
    }

    // 6. Enqueue the task to BullMQ for batch stream tracking if Redis is available
    if (isRedisReady()) {
      try {
        await feedQueue.add(`${type}-click`, {
          adId,
          email: emailKey,
          type
        });
      } catch {}
    }

    // Add adId to active seen set and increment daily RAM pacing hash
    if (isRedisReady()) {
      try {
        const todayDate = new Date().toISOString().slice(0, 10);
        const seenSetKey = `seen:ads:${emailKey}`;
        const pacingHashKey = `user:pacing:${emailKey}:${todayDate}`;

        await Promise.all([
          redisConnection.sadd(seenSetKey, adId).catch(() => null),
          redisConnection.expire(seenSetKey, 86400).catch(() => null),
          redisConnection.hincrby(pacingHashKey, adId, 1).catch(() => null),
          redisConnection.expire(pacingHashKey, 86400).catch(() => null),
        ]);
      } catch {}
    }

    const { incrementCachedMonetizationClicks } = await import("@/lib/utils/cache");
    await incrementCachedMonetizationClicks(emailKey, 1).catch(() => 0);

    return NextResponse.json({ success: true, result: rpcResult ?? 25 });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/earn:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
