import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { feedQueue } from "@/lib/queue";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { streamImpressionsToClickHouse } from "@/lib/clickhouse";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(request, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { adId } = body;

    if (!adId) {
      return NextResponse.json({ error: "adId is required" }, { status: 400 });
    }

    const emailKey = email.toLowerCase().trim();

    // Server-side rapid click deduplication (NX lock in Redis) & Atomic Frequency Counters
    const todayDate = new Date().toISOString().slice(0, 10);
    let userCap = 1;
    if (isRedisReady()) {
      try {
        const lockKey = `lock:click:${emailKey}:${adId}:seen`;
        const lockAcquired = await redisConnection.set(lockKey, "1", "EX", 2, "NX");
        if (!lockAcquired) {
          // Gracefully acknowledge duplicate without throwing or generating client errors
          return NextResponse.json({ success: true, duplicate: true });
        }

        // Check if ad allows retargeting (frequency cap > 1)
        try {
          const cached = await redisConnection.get(`ad:detail:${adId}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            userCap = Number(parsed.user_frequency_cap || 1);
          }
        } catch {}

        // Atomically increment frequency counters in Redis for O(1) feed filtering
        const freqPipe = redisConnection.pipeline();
        freqPipe.hincrby(`user:freq:${emailKey}:${todayDate}`, adId, 1);
        freqPipe.expire(`user:freq:${emailKey}:${todayDate}`, 86400 * 2);
        freqPipe.hincrby(`user:freq_lifetime:${emailKey}`, adId, 1);
        freqPipe.expire(`user:freq_lifetime:${emailKey}`, 86400 * 30);
        if (userCap <= 1) {
          freqPipe.sadd(`seen:ads:${emailKey}`, adId);
          freqPipe.expire(`seen:ads:${emailKey}`, 86400 * 7);
        }
        freqPipe.exec().catch(() => {});
      } catch {}
    }

    // Direct DB record impression
    try {
      await supabaseAdmin
        .from("ad_impressions")
        .upsert({
          ad_id: adId,
          user_email: emailKey,
          view_count: 1,
          last_viewed_at: new Date().toISOString(),
        }, { onConflict: "ad_id,user_email" });
    } catch {}

    // Stream impression event directly to ClickHouse Cloud (high-throughput non-blocking)
    streamImpressionsToClickHouse([
      {
        ad_id: adId,
        user_email: emailKey,
        cost_per_impression: 0,
        interaction_type: "view",
      },
    ]).catch(() => {});

    // Check if ad is a platform post or has no budget (in which case user shouldn't earn click progress)
    let isPlatformPost = false;
    let checkedFromCache = false;
    if (isRedisReady()) {
      try {
        const cached = await redisConnection.get(`ad:detail:${adId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          isPlatformPost = Boolean(
            parsed.is_admin_post ||
            !parsed.cost_per_impression ||
            Number(parsed.cost_per_impression) <= 0 ||
            !parsed.impressions ||
            Number(parsed.impressions) <= 0
          );
          checkedFromCache = true;
        }
      } catch {}
    }

    if (!checkedFromCache) {
      try {
        const { data: adRow } = await supabaseAdmin
          .from("addsactive")
          .select("is_admin_post, cost_per_impression, impressions")
          .eq("id", adId)
          .maybeSingle();
        if (adRow) {
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

    // Enqueue Seen click if Redis/Queue is available
    if (isRedisReady()) {
      try {
        await feedQueue.add("seen-click", {
          adId,
          email: emailKey,
          type: "seen"
        });

        // Add adId to active seen set and increment daily RAM pacing hash for <0.1ms ultra-scale filtering
        const todayDate = new Date().toISOString().slice(0, 10);
        const seenSetKey = `seen:ads:${emailKey}`;
        const pacingHashKey = `user:pacing:${emailKey}:${todayDate}`;

        const syncOps: Promise<any>[] = [
          redisConnection.hincrby(pacingHashKey, adId, 1).catch(() => null),
          redisConnection.expire(pacingHashKey, 86400).catch(() => null),
        ];

        if (userCap <= 1) {
          syncOps.push(
            redisConnection.sadd(seenSetKey, adId).catch(() => null),
            redisConnection.expire(seenSetKey, 86400).catch(() => null)
          );
        }

        await Promise.all(syncOps);
      } catch {}
    }

    let clicksCount: number | undefined;
    let isMonetized: boolean | undefined;

    // Increment monetization clicks atomically if not an unpaid platform post
    if (!isPlatformPost) {
      try {
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("increment_user_click_progress", {
          p_email: emailKey,
          p_count: 1,
        });

        if (!rpcErr && rpcData && rpcData.length > 0) {
          const row = rpcData[0];
          clicksCount = Number(row.new_click_count || 0);
          isMonetized = !!row.is_now_monetized;
        } else if (rpcErr) {
          console.warn("⚠️ RPC increment_user_click_progress notice in /api/seen:", rpcErr.message || rpcErr);
          // Fallback direct update if RPC encounters error
          const { data: uData } = await supabaseAdmin
            .from("users")
            .select("monetization_clicks, monetized")
            .ilike("email", emailKey)
            .maybeSingle();
          if (uData) {
            const nextCount = (Number(uData.monetization_clicks) || 0) + 1;
            const nowMonetized = nextCount >= 300 || uData.monetized === true || uData.monetized === "true";
            await supabaseAdmin
              .from("users")
              .update({
                monetization_clicks: nextCount,
                monetized: nowMonetized ? "true" : "false",
                last_active_at: new Date().toISOString(),
              })
              .ilike("email", emailKey);
            clicksCount = nextCount;
            isMonetized = nowMonetized;
          }
        }
      } catch (dbErr) {
        console.warn("⚠️ DB increment error in /api/seen:", dbErr);
      }

      if (isRedisReady()) {
        try {
          const { incrementCachedMonetizationClicks, invalidateCachedProfile } = await import("@/lib/utils/cache");
          const liveVal = await incrementCachedMonetizationClicks(emailKey, 1).catch(() => 0);
          if (!clicksCount && liveVal) {
            clicksCount = liveVal;
          }
          await invalidateCachedProfile(emailKey).catch(() => {});
          await redisConnection.del(`monetize:status:${emailKey}`).catch(() => {});
        } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      queued: true,
      clicksCount,
      isMonetized,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/seen:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
