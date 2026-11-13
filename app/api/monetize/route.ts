import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import redisConnection, { isRedisReady } from "@/lib/redis";
import {
  computeAtwTierDetails,
  DEFAULT_ATTENTION_WORTH_SCORE,
} from "@/lib/attentionTierEngine";
import { checkRateLimit } from "@/lib/edgeRateLimit";
import { isExemptFromBarriersAndInactivity } from "@/lib/adminHelper";
import { flushPendingAffiliateYield } from "@/lib/affiliateEngine";
import { getEarnTokenSecret } from "@/lib/targetingEngine";
import { env } from "@/lib/env";

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
          const score =
            parsed.attentionWorthScore !== undefined
              ? Number(parsed.attentionWorthScore)
              : DEFAULT_ATTENTION_WORTH_SCORE;
          const tierDetails = computeAtwTierDetails(effectiveClicks, parsed.atwTier, isExempt, score);
          parsed.clicksCount = effectiveClicks;
          parsed.clicksRemaining = tierDetails.clicksRemaining;
          parsed.targetClicks = tierDetails.currentMilestoneTarget;
          parsed.atwTier = tierDetails.tierCode;
          parsed.atwLevel = tierDetails.level;
          parsed.isUnlimited = tierDetails.isUnlimited;
          parsed.holdingCap = tierDetails.isUnlimited ? null : tierDetails.holdingCap;
          parsed.attentionWorthScore = score;
          parsed.ratingBonusClicks = tierDetails.ratingBonusClicks;
          if (parsed.hasCancelled) {
            parsed.isMonetized = false;
          } else if (effectiveClicks >= 300 || isExempt) {
            parsed.isMonetized = true;
          }
          return NextResponse.json(parsed, {
            headers: { "Cache-Control": "no-store, max-age=0" },
          });
        }
      } catch (e: any) {
        if (e?.message !== "Connection is closed.") {
          console.warn("⚠️ Redis get notice in /api/monetize:", e.message || e);
        }
      }
    }

    if (isExemptFromBarriersAndInactivity(emailLower)) {
      await flushPendingAffiliateYield(emailLower).catch(() => {});
    }

    const [{ data: uData, error: uErr }, rawLiveClicks] = await Promise.all([
      supabaseReadOnly
        .from("users")
        .select(
          "id, balance, monetized, monetization_clicks, referral_code, atw_tier, attention_worth_score, last_active_at, created_at, is_affiliate, is_career, has_cancelled_monetization"
        )
        .eq("email", emailLower)
        .maybeSingle(),
      isRedisReady()
        ? redisConnection.get(`user:live_clicks:v2:${emailLower}`).catch(() => null)
        : Promise.resolve(null),
    ]);

    let payload: any;
    const liveClicksDelta = rawLiveClicks ? Number(rawLiveClicks) || 0 : 0;

    if (uErr || !uData) {
      const { data: fbUser } = await supabaseReadOnly
        .from("users")
        .select("id, balance, monetized, monetization_clicks, referral_code, atw_tier, created_at, has_cancelled_monetization")
        .eq("email", emailLower)
        .maybeSingle();

      const rClicks = Number(fbUser?.monetization_clicks ?? 0);
      const isExempt = isExemptFromBarriersAndInactivity(emailLower);
      const clicksCount = Math.max(rClicks, liveClicksDelta);
      const hasCancelled = Boolean(fbUser?.has_cancelled_monetization);
      const isMonetized = !hasCancelled && Boolean(isExempt || clicksCount >= 300);

      const tierDetails = computeAtwTierDetails(
        clicksCount,
        fbUser?.atw_tier,
        isExempt,
        DEFAULT_ATTENTION_WORTH_SCORE
      );
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
        attentionWorthScore: DEFAULT_ATTENTION_WORTH_SCORE,
        ratingBonusClicks: tierDetails.ratingBonusClicks,
        balance: Number(fbUser?.balance ?? 0),
        daysInactive: 0,
        statusMessage: hasCancelled
          ? "You have voluntarily opted out of monetization. Your seen count continues to increment normally for community discovery. You can reapply for monetization at any time."
          : null,
      };
    } else {
      const isExempt = isExemptFromBarriersAndInactivity(emailLower, uData as any);
      const dbClicks = Number(uData.monetization_clicks || 0);
      const clicks = Math.max(dbClicks, liveClicksDelta);
      const hasCancelled = Boolean(uData.has_cancelled_monetization);
      const isMonetized = !hasCancelled && Boolean(isExempt || clicks >= 300);

      let daysInactive = 0;
      if (!isExempt && uData.last_active_at) {
        const lastActive = new Date(uData.last_active_at).getTime();
        daysInactive = Math.max(0, Math.floor((Date.now() - lastActive) / (1000 * 60 * 60 * 24)));
      }

      let effectiveMonetized = isMonetized;
      let effectiveClicks = clicks;
      let effectiveScore = Number(uData.attention_worth_score ?? DEFAULT_ATTENTION_WORTH_SCORE);

      if (!isExempt && daysInactive >= 7 && (isMonetized || clicks > 0)) {
        try {
          const res = await supabaseAdmin.rpc("check_and_update_monetization_status", {
            user_email_param: emailLower,
          });
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
        effectiveScore = DEFAULT_ATTENTION_WORTH_SCORE;
      }

      const tierDetails = computeAtwTierDetails(
        effectiveClicks,
        effectiveClicks === 0 && !isExempt ? "ATW1" : uData.atw_tier,
        isExempt,
        effectiveScore
      );
      const effectiveAtwTier = tierDetails.tierCode;

      if (effectiveClicks > dbClicks) {
        supabaseAdmin
          .from("users")
          .update({
            monetization_clicks: effectiveClicks,
            atw_tier: effectiveAtwTier,
            ...(effectiveMonetized && uData.monetized !== "true" && uData.monetized !== true
              ? { monetized: "true" }
              : {}),
          })
          .ilike("email", emailLower)
          .then(() => {});
      }

      if (isRedisReady() && effectiveClicks > liveClicksDelta) {
        redisConnection
          .set(`user:live_clicks:v2:${emailLower}`, String(effectiveClicks), "EX", 86400 * 30)
          .catch(() => {});
      }

      const dbIsMonetized =
        uData.monetized === "true" || uData.monetized === "yes" || uData.monetized === true;
      if (effectiveAtwTier !== uData.atw_tier || effectiveMonetized !== dbIsMonetized) {
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
        attentionWorthScore: effectiveScore,
        ratingBonusClicks: tierDetails.ratingBonusClicks,
        balance: Number(uData.balance || 0),
        referralCode: uData.referral_code || null,
        daysInactive,
        lastActiveAt: uData.last_active_at || null,
        statusMessage: hasCancelled
          ? "You have voluntarily opted out of monetization. Your seen count continues to increment normally for community discovery. You can reapply for monetization at any time."
          : daysInactive >= 7
          ? "Monetization reset due to 7 days of inactivity"
          : null,
      };
    }

    if (isRedisReady()) {
      redisConnection.set(cacheKey, JSON.stringify(payload), "EX", MONETIZE_STATUS_TTL_SECONDS).catch(() => {});
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=30" },
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/monetize:", err);
    return NextResponse.json({ error: "Try again later" }, { status: 500 });
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

    // Read-only status query when no adId is supplied
    if (!body?.adId) {
      const { data: uRow } = await supabaseReadOnly
        .from("users")
        .select("monetized, monetization_clicks, has_cancelled_monetization, atw_tier, attention_worth_score, is_affiliate, is_career")
        .eq("email", emailLower)
        .maybeSingle();
      const currentClicks = Number(uRow?.monetization_clicks || 0);
      const hasCancelled = Boolean(uRow?.has_cancelled_monetization);
      const isExempt = isExemptFromBarriersAndInactivity(emailLower, uRow as any);
      const tier = computeAtwTierDetails(
        currentClicks,
        uRow?.atw_tier,
        isExempt,
        uRow?.attention_worth_score
      );
      return NextResponse.json({
        success: true,
        clicksCount: currentClicks,
        hasCancelled,
        clicksRemaining: tier.clicksRemaining,
        targetClicks: tier.currentMilestoneTarget,
        atwTier: tier.tierCode,
        isMonetized: !hasCancelled && !!(uRow?.monetized === "true" || uRow?.monetized === true || currentClicks >= 300 || isExempt),
      });
    }

    const { adId, token, servedAt } = body;

    // Require cryptographic verification token & servedAt to prevent direct click-farming
    if (!token || !servedAt) {
      return NextResponse.json(
        { error: "Verification token and timestamp required to advance progress." },
        { status: 403 }
      );
    }

    const secretKey = getEarnTokenSecret();
    const fallbackAuth0Key = env.AUTH0_SECRET || process.env.AUTH0_SECRET || "";
    if (!secretKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const candidateKeys = Array.from(new Set([secretKey, fallbackAuth0Key].filter(Boolean)));
    const rawEmail = email.trim();
    const payloads = [`${adId}:${emailLower}:${servedAt}`, `${adId}:${rawEmail}:${servedAt}`];
    const isValidToken = candidateKeys.some((k) =>
      payloads.some((p) => crypto.createHmac("sha256", k).update(p).digest("hex") === token)
    );
    if (!isValidToken) {
      return NextResponse.json({ error: "Invalid verification token." }, { status: 403 });
    }

    const parsedServedAt = parseInt(String(servedAt), 10);
    const viewDuration = Date.now() - parsedServedAt;
    if (isNaN(parsedServedAt) || viewDuration < 10000 || viewDuration > 1800000) {
      return NextResponse.json(
        { error: "Minimum dwell time (10s) not met or token expired." },
        { status: 400 }
      );
    }

    // Anti-replay check in Redis
    if (isRedisReady()) {
      const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 32);
      const tokenBurnKey = `used:monetize_token:${tokenHash}`;
      const tokenFresh = await redisConnection.set(tokenBurnKey, "1", "EX", 1800, "NX");
      if (!tokenFresh) {
        return NextResponse.json(
          { error: "Verification token has already been used.", code: "ALREADY_RECORDED" },
          { status: 409 }
        );
      }
    }

    // Validate campaign exists, is not own ad, and frequency cap has not been exhausted
    const [{ data: adRow }, { data: impRow }, { data: uBefore }] = await Promise.all([
      supabaseReadOnly
        .from("addsactive")
        .select("id, user_email, user_frequency_cap, is_paused, completed_at")
        .eq("id", adId)
        .maybeSingle(),
      supabaseReadOnly
        .from("ad_impressions")
        .select("id, view_count")
        .eq("ad_id", adId)
        .ilike("user_email", emailLower)
        .maybeSingle(),
      supabaseReadOnly
        .from("users")
        .select("has_cancelled_monetization, atw_tier, attention_worth_score, is_affiliate, is_career")
        .eq("email", emailLower)
        .maybeSingle(),
    ]);

    if (!adRow || adRow.is_paused || adRow.completed_at) {
      return NextResponse.json({ error: "Active campaign not found." }, { status: 404 });
    }
    if (adRow.user_email && String(adRow.user_email).toLowerCase().trim() === emailLower) {
      return NextResponse.json({ error: "Cannot increment progress from your own ad." }, { status: 400 });
    }

    const userCap = Math.max(1, Number(adRow.user_frequency_cap || 1));
    const currentViews = Number(impRow?.view_count || 0);
    if (!isAdminEmail(emailLower) && currentViews >= userCap) {
      return NextResponse.json(
        { error: "Frequency cap reached for this campaign.", code: "FREQUENCY_CAPPED", views: currentViews, cap: userCap },
        { status: 400 }
      );
    }

    // Record view in ad_impressions BEFORE crediting progress
    if (impRow?.id) {
      await supabaseAdmin
        .from("ad_impressions")
        .update({ view_count: currentViews + 1, last_viewed_at: new Date().toISOString() })
        .eq("id", impRow.id);
    } else {
      await supabaseAdmin.from("ad_impressions").insert({
        ad_id: adId,
        user_email: emailLower,
        view_count: 1,
        last_viewed_at: new Date().toISOString(),
      });
    }

    const { data, error } = await supabaseAdmin.rpc("increment_user_click_progress", {
      p_email: emailLower,
    });

    if (error) {
      console.error("❌ RPC increment_user_click_progress error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = data?.[0] || { new_click_count: 0, is_now_monetized: false };
    const nextClicks = Number(row.new_click_count || 0);
    const hasCancelled = Boolean(uBefore?.has_cancelled_monetization);
    const isExempt = isExemptFromBarriersAndInactivity(emailLower, uBefore as any);
    const tierDetails = computeAtwTierDetails(
      nextClicks,
      uBefore?.atw_tier,
      isExempt,
      uBefore?.attention_worth_score
    );

    invalidateCachedProfile(emailLower).catch(() => {});
    if (isRedisReady()) {
      await Promise.all([
        redisConnection.set(`user:live_clicks:v2:${emailLower}`, String(nextClicks), "EX", 86400 * 30).catch(() => {}),
        redisConnection.del(`monetize:status:v2:${emailLower}`).catch(() => {}),
        redisConnection.del(`monetize:status:${emailLower}`).catch(() => {}),
      ]);
    }

    return NextResponse.json({
      success: true,
      clicksCount: nextClicks,
      clicksRemaining: tierDetails.clicksRemaining,
      targetClicks: tierDetails.currentMilestoneTarget,
      atwTier: tierDetails.tierCode,
      hasCancelled,
      isMonetized: !hasCancelled && (Boolean(row.is_now_monetized) || isExempt),
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/monetize:", err);
    return NextResponse.json({ error: "Try again later" }, { status: 500 });
  }
}
