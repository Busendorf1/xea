import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { computeAtwTierDetails } from "@/lib/attentionTierEngine";
import { checkRateLimit } from "@/lib/edgeRateLimit";
import { isExemptFromBarriersAndInactivity } from "@/lib/adminHelper";
import { flushPendingAffiliateYield } from "@/lib/affiliateEngine";

export const dynamic = "force-dynamic";

const MONETIZE_STATUS_TTL_SECONDS = 15;

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const cacheKey = `monetize:status:v2:${emailLower}`;

    // 1. Edge Redis Cache Read Path for Ultra-Low Latency (<5ms response time) merged with real-time live_clicks
    if (isRedisReady()) {
      try {
        const [cached, liveClicksStr] = await redisConnection.mget(
          cacheKey,
          `user:live_clicks:v2:${emailLower}`
        );
        if (cached) {
          const parsed = JSON.parse(cached);
          const liveVal = liveClicksStr ? Number(liveClicksStr) || 0 : 0;
          const isExempt = isExemptFromBarriersAndInactivity(emailLower) || Boolean(parsed.isUnlimited);
          const effectiveClicks = Math.max(Number(parsed.clicksCount || 0), liveVal);
          const tierDetails = computeAtwTierDetails(effectiveClicks, parsed.atwTier, isExempt);
          parsed.clicksCount = effectiveClicks;
          parsed.clicksRemaining = tierDetails.clicksRemaining;
          parsed.targetClicks = tierDetails.currentMilestoneTarget;
          parsed.atwTier = tierDetails.tierCode;
          parsed.atwLevel = tierDetails.level;
          parsed.isUnlimited = tierDetails.isUnlimited;
          parsed.holdingCap = tierDetails.isUnlimited ? null : tierDetails.holdingCap;
          if (parsed.hasCancelled) {
            parsed.isMonetized = false;
          } else if (effectiveClicks >= 300 || isExempt) {
            parsed.isMonetized = true;
          }
          return NextResponse.json(parsed, {
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          });
        }
      } catch (e: any) {
        if (e?.message !== "Connection is closed.") {
          console.warn("⚠️ Redis get notice in /api/monetize:", e.message || e);
        }
      }
    }

    // 2. High-Scale Parallel Direct Query + Redis Live Clicks Read (~5-10ms)
    if (isExemptFromBarriersAndInactivity(emailLower)) {
      await flushPendingAffiliateYield(emailLower).catch(() => {});
    }

    const [{ data: uData, error: uErr }, rawLiveClicks] = await Promise.all([
      supabaseReadOnly
        .from("users")
        .select("id, balance, monetized, monetization_clicks, referral_code, atw_tier, last_active_at, created_at, is_affiliate, is_career, has_cancelled_monetization")
        .ilike("email", emailLower)
        .maybeSingle(),
      isRedisReady()
        ? redisConnection.get(`user:live_clicks:v2:${emailLower}`).catch(() => null)
        : Promise.resolve(null),
    ]);

    let payload: any;
    const liveClicksDelta = rawLiveClicks ? Number(rawLiveClicks) || 0 : 0;

    if (uErr || !uData) {
      // Fallback to baseline columns if optional column is missing
      const { data: fbUser } = await supabaseReadOnly
        .from("users")
        .select("id, balance, monetized, monetization_clicks, referral_code, atw_tier, created_at, has_cancelled_monetization")
        .ilike("email", emailLower)
        .maybeSingle();

      const rClicks = Number(fbUser?.monetization_clicks ?? 0);
      const isExempt = isExemptFromBarriersAndInactivity(emailLower);
      const clicksCount = Math.max(rClicks, liveClicksDelta);
      const hasCancelled = Boolean(fbUser?.has_cancelled_monetization);
      const isMonetized = !hasCancelled && Boolean(
        isExempt ||
        fbUser?.monetized === true ||
        fbUser?.monetized === "true" ||
        fbUser?.monetized === "yes" ||
        clicksCount >= 300
      );

      const tierDetails = computeAtwTierDetails(clicksCount, fbUser?.atw_tier, isExempt);
      payload = {
        success: true,
        isMonetized,
        hasCancelled,
        clicksCount,
        clicksRemaining: tierDetails.clicksRemaining,
        targetClicks: tierDetails.currentMilestoneTarget,
        atwTier: tierDetails.tierCode,
        atwLevel: tierDetails.level,
        isUnlimited: tierDetails.isUnlimited,
        holdingCap: tierDetails.isUnlimited ? null : tierDetails.holdingCap,
        balance: Number(fbUser?.balance ?? 0),
        daysInactive: 0,
        statusMessage: hasCancelled
          ? "You have voluntarily opted out of monetization. Your seen count continues to increment normally for community discovery. You can reapply for monetization at any time."
          : null,
      };
    } else {
      const isExempt = isExemptFromBarriersAndInactivity(emailLower, uData as any);
      let dbClicks = Number(uData.monetization_clicks || 0);

      // Self-heal if dbClicks was polluted with the legacy 300 floor on an exempt account
      if (isExempt && dbClicks === 300) {
        try {
          const { data: impRows } = await supabaseReadOnly
            .from("ad_impressions")
            .select("view_count")
            .ilike("user_email", emailLower);
          const actualImpSum = (impRows || []).reduce((acc, r: any) => acc + (Number(r.view_count) || 1), 0);
          if (actualImpSum < 290) {
            dbClicks = actualImpSum;
            await supabaseAdmin
              .from("users")
              .update({ monetization_clicks: dbClicks })
              .eq("id", uData.id);
          }
        } catch {}
      }

      const clicks = Math.max(dbClicks, liveClicksDelta);
      const hasCancelled = Boolean(uData.has_cancelled_monetization);
      const isMonetized = !hasCancelled && !!(
        isExempt ||
        uData.monetized === "true" ||
        uData.monetized === "yes" ||
        uData.monetized === true ||
        clicks >= 300
      );

      // Fast in-memory calculation of inactive days (Exempt accounts never accrue inactivity penalties)
      let daysInactive = 0;
      if (!isExempt && uData.last_active_at) {
        const lastActive = new Date(uData.last_active_at).getTime();
        const now = Date.now();
        daysInactive = Math.max(0, Math.floor((now - lastActive) / (1000 * 60 * 60 * 24)));
      }

      let effectiveMonetized = isMonetized;
      let effectiveClicks = clicks;

      // Immediately enforce 7-day inactivity reset if threshold reached (skip for exempt accounts)
      if (!isExempt && daysInactive >= 7 && (isMonetized || clicks > 0)) {
        try {
          const res = await supabaseAdmin.rpc("check_and_update_monetization_status", { user_email_param: emailLower });
          if (res.error) {
            await supabaseAdmin.rpc("check_and_update_monetization_status", { p_email: emailLower });
          }
        } catch {
          try {
            await supabaseAdmin.rpc("check_and_update_monetization_status", { p_email: emailLower });
          } catch {}
        }
        if (isRedisReady()) {
          await redisConnection.del(`user:live_clicks:v2:${emailLower}`).catch(() => {});
        }
        effectiveMonetized = false;
        effectiveClicks = 0;
      }

      const tierDetails = computeAtwTierDetails(
        effectiveClicks,
        effectiveClicks === 0 && !isExempt ? "ATW1" : uData.atw_tier,
        isExempt
      );
      const effectiveAtwTier = tierDetails.tierCode;

      // Guarantee DB is never behind Redis live count when user checks monetization
      if (effectiveClicks > dbClicks) {
        supabaseAdmin
          .from("users")
          .update({
            monetization_clicks: effectiveClicks,
            atw_tier: effectiveAtwTier,
            ...(effectiveMonetized && uData.monetized !== "true" && uData.monetized !== true ? { monetized: "true" } : {}),
          })
          .ilike("email", emailLower)
          .then(() => {});
      }

      // Synchronize Redis live_clicks with effective count
      if (isRedisReady() && effectiveClicks > liveClicksDelta) {
        redisConnection.set(`user:live_clicks:v2:${emailLower}`, String(effectiveClicks), "EX", 86400 * 30).catch(() => {});
      }

      if (effectiveAtwTier !== uData.atw_tier || (effectiveMonetized && uData.monetized !== "true" && uData.monetized !== true)) {
        supabaseAdmin
          .from("users")
          .update({
            atw_tier: effectiveAtwTier,
            monetized: effectiveMonetized ? "true" : "false",
          })
          .eq("id", uData.id)
          .then(() => {});
      }

      payload = {
        success: true,
        isMonetized: effectiveMonetized,
        hasCancelled,
        clicksCount: effectiveClicks,
        clicksRemaining: tierDetails.clicksRemaining,
        targetClicks: tierDetails.currentMilestoneTarget,
        atwTier: effectiveAtwTier,
        atwLevel: tierDetails.level,
        isUnlimited: tierDetails.isUnlimited,
        holdingCap: tierDetails.isUnlimited ? null : tierDetails.holdingCap,
        balance: Number(uData.balance || 0),
        referralCode: uData.referral_code || null,
        daysInactive,
        lastActiveAt: uData.last_active_at || null,
        statusMessage: hasCancelled
          ? "You have voluntarily opted out of monetization. Your seen count continues to increment normally for community discovery. You can reapply for monetization at any time."
          : (daysInactive >= 7 ? "Monetization reset due to 7 days of inactivity" : null),
      };
    }

    // Cache payload in Redis to absorb traffic surges
    if (isRedisReady()) {
      redisConnection.set(cacheKey, JSON.stringify(payload), "EX", MONETIZE_STATUS_TTL_SECONDS).catch(() => {});
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
      },
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/monetize:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await checkRateLimit(req, {
      limit: 10,
      windowSeconds: 60,
      identifierPrefix: "monetize_post",
    });
    if (!rateLimit.allowed && rateLimit.response) {
      return rateLimit.response;
    }

    const email = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const body = await req.json().catch(() => ({}));

    // Require a valid ad interaction context (adId) so unverified direct calls cannot farm free clicks
    if (!body?.adId) {
      const { data: uRow } = await supabaseReadOnly
        .from("users")
        .select("monetized, monetization_clicks, has_cancelled_monetization")
        .eq("email", emailLower)
        .maybeSingle();
      const currentClicks = Number(uRow?.monetization_clicks || 0);
      const hasCancelled = Boolean(uRow?.has_cancelled_monetization);
      return NextResponse.json({
        success: true,
        clicksCount: currentClicks,
        hasCancelled,
        clicksRemaining: Math.max(0, 300 - currentClicks),
        isMonetized: !hasCancelled && !!(uRow?.monetized === "true" || uRow?.monetized === true || currentClicks >= 300),
      });
    }

    const { data, error } = await supabaseAdmin.rpc("increment_user_click_progress", {
      p_email: emailLower,
    });

    if (error) {
      console.error("❌ RPC increment_user_click_progress error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    invalidateCachedProfile(emailLower).catch(() => {});
    if (isRedisReady()) {
      redisConnection.del(`monetize:status:${emailLower}`).catch(() => {});
    }

    const row = data?.[0] || { new_click_count: 0, is_now_monetized: false };
    return NextResponse.json({
      success: true,
      clicksCount: Number(row.new_click_count || 0),
      clicksRemaining: Math.max(0, 300 - Number(row.new_click_count || 0)),
      isMonetized: !!row.is_now_monetized,
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/monetize:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
