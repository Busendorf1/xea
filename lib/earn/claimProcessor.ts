import { NextRequest, NextResponse } from "next/server";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { isAdminEmail } from "@/lib/authHelper";
import { isExemptFromBarriersAndInactivity } from "../adminHelper";
import { atomicCheckAndAcquireEarnLock } from "@/lib/utils/cache";
import { creditAffiliatePlatformShare } from "@/lib/affiliateEngine";
import { bufferAdImpression } from "@/lib/impressionBuffer";
import { computeAtwTierDetails } from "@/lib/attentionTierEngine";
import { syncPostEarnCaches, publishEarnSideEffects } from "./redisSync";

const LEGIT_REJECTION_CODES = new Set([
  "ALREADY_EARNED",
  "FREQUENCY_CAP_REACHED",
  "CONCURRENT_CLAIM",
  "CAMPAIGN_COMPLETED",
  "CAMPAIGN_NOT_FOUND",
  "AD_NOT_FOUND",
  "USER_SUSPENDED",
  "ACCOUNT_DEACTIVATED",
  "SELF_EARN_FORBIDDEN",
  "PLATFORM_POST",
  "USER_NOT_FOUND",
]);

export interface EarnClaimInput {
  request: NextRequest;
  adId: string;
  emailKey: string;
  deviceId?: string | null;
  rawCpi: number;
  bonusSeconds: number;
  attentionSharePercent: number;
  now: number;
  logToTerminal: (msg: string) => void;
}

export interface EarnClaimOutput {
  errorResponse?: NextResponse;
  adIdToUnlock: string | null;
  earnedRateNumber: number;
  updatedBalance: number | null;
  liveClicks: number;
  atomicViews: number;
  atomicCap: number;
  attentionWorthScore?: number | null;
}

async function evictExhaustedAdCaches(adId: string): Promise<void> {
  try {
    const { evictAdFromL1FeedCaches } = await import("@/lib/utils/cache");
    evictAdFromL1FeedCaches(adId);
  } catch {}
  if (isRedisReady()) {
    await redisConnection
      .del(`ad:detail:${adId}`, "campaigns:shared_pool:v1", "bids:zset:global")
      .catch(() => {});
  }
}

export async function processEarnClaim(input: EarnClaimInput): Promise<EarnClaimOutput> {
  const { request, adId, emailKey, deviceId, bonusSeconds, attentionSharePercent, now, logToTerminal } = input;
  let rawCpi = input.rawCpi;

  let earnedRateNumber = Math.round(rawCpi * attentionSharePercent * 100) / 100;
  if (earnedRateNumber <= 0) {
    earnedRateNumber = Math.round(25.0 * attentionSharePercent * 100) / 100;
  }

  let adIdToUnlock: string | null = null;
  let updatedBalance: number | null = null;
  let liveClicks = 0;
  let atomicViews = 1;
  let atomicCap = 1;
  let attentionWorthScore: number | null | undefined;
  let isEarnerNowMonetized = false;

  const earnedSetKey = `earned:ads:${emailKey}`;

  // 1. Atomic Redis Lua Lock: Verifies ad is NOT in earned:ads:<email> and acquires 30s lock
  if (isRedisReady()) {
    const lockResult = await atomicCheckAndAcquireEarnLock(emailKey, adId, 30);
    if (!lockResult.allowed) {
      if (lockResult.code === "ALREADY_EARNED") {
        return {
          errorResponse: NextResponse.json(
            {
              success: false,
              code: "ALREADY_EARNED",
              error: "This ad reward has already been claimed on your account.",
            },
            { status: 400 }
          ),
          adIdToUnlock: null,
          earnedRateNumber: 0,
          updatedBalance: null,
          liveClicks: 0,
          atomicViews: 1,
          atomicCap: 1,
        };
      }
      if (lockResult.code === "CONCURRENT_CLAIM") {
        return {
          errorResponse: NextResponse.json(
            {
              success: false,
              code: "CONCURRENT_CLAIM",
              error: "An earn transaction for this ad is currently being processed on another device.",
            },
            { status: 429 }
          ),
          adIdToUnlock: null,
          earnedRateNumber: 0,
          updatedBalance: null,
          liveClicks: 0,
          atomicViews: 1,
          atomicCap: 1,
        };
      }
    }
    adIdToUnlock = adId;
  }

  logToTerminal(
    `\n========================================================================\n🟢 [EARN CLAIM INITIATED]\n   👤 User Email : ${emailKey}\n   📢 Ad ID      : ${adId}\n   📊 Base CPI   : ₦${rawCpi.toFixed(2)}\n   ⏱️ Focus Bonus: +${bonusSeconds}s (${Math.round(attentionSharePercent * 100)}% Rate: ₦${earnedRateNumber.toFixed(2)})\n========================================================================\n`
  );

  // 2. Authoritative Atomic Transaction in PostgreSQL (Single ACID RPC)
  const { data: atomicResult, error: atomicErr } = await supabaseAdmin.rpc("claim_ad_earning_atomic", {
    p_ad_id: adId,
    p_user_email: emailKey,
    p_expected_rate: earnedRateNumber,
    p_device_id: deviceId || null,
    p_skip_ad_counter: isRedisReady(),
  });

  const isLegitRejection = Boolean(
    atomicResult && !atomicResult.success && LEGIT_REJECTION_CODES.has(String(atomicResult.code || ""))
  );
  const shouldUseFallback = Boolean(atomicErr || !atomicResult || (!atomicResult.success && !isLegitRejection));

  if (shouldUseFallback) {
    console.warn(
      "⚠️ Running direct DB fallback for earn claim:",
      atomicErr?.message || atomicResult?.error || "RPC unavailable"
    );

    const [{ data: dbUser, error: userFetchErr }, { data: deactivatedRow }] = await Promise.all([
      supabaseAdmin
        .from("users")
        .select(
          "id, balance, monetization_clicks, monetized, referral_downloads_count, suspended_until, atw_tier, attention_worth_score, is_affiliate, is_career"
        )
        .ilike("email", emailKey)
        .maybeSingle(),
      supabaseAdmin.from("deactivated_users").select("email").ilike("email", emailKey).maybeSingle(),
    ]);

    if (userFetchErr) {
      console.error("❌ DB fallback error fetching user:", userFetchErr);
    }

    if (!dbUser) {
      return {
        errorResponse: NextResponse.json(
          { success: false, code: "USER_NOT_FOUND", error: "User account not found." },
          { status: 404 }
        ),
        adIdToUnlock,
        earnedRateNumber: 0,
        updatedBalance: null,
        liveClicks: 0,
        atomicViews: 1,
        atomicCap: 1,
      };
    }

    if (deactivatedRow) {
      return {
        errorResponse: NextResponse.json(
          { success: false, code: "ACCOUNT_DEACTIVATED", error: "Account is deactivated." },
          { status: 403 }
        ),
        adIdToUnlock,
        earnedRateNumber: 0,
        updatedBalance: null,
        liveClicks: 0,
        atomicViews: 1,
        atomicCap: 1,
      };
    }

    const isExemptDbUser = isExemptFromBarriersAndInactivity(emailKey, dbUser as any);

    if (!isExemptDbUser && dbUser.suspended_until && new Date(dbUser.suspended_until).getTime() > now) {
      return {
        errorResponse: NextResponse.json(
          { success: false, code: "USER_SUSPENDED", error: "Account is currently suspended." },
          { status: 403 }
        ),
        adIdToUnlock,
        earnedRateNumber: 0,
        updatedBalance: null,
        liveClicks: 0,
        atomicViews: 1,
        atomicCap: 1,
      };
    }

    // Fallback NEVER queries unapproved `adds` and NEVER pays when `!adRow`
    const { data: adRow, error: adFetchErr } = await supabaseAdmin
      .from("addsactive")
      .select(
        "cost_per_impression, user_frequency_cap, impressions, impression_count, completed_at, is_admin_post, user_email"
      )
      .eq("id", adId)
      .maybeSingle();

    if (adFetchErr || !adRow) {
      return {
        errorResponse: NextResponse.json(
          {
            success: false,
            code: "CAMPAIGN_NOT_FOUND",
            error: "Active advertisement not found or already completed.",
          },
          { status: 404 }
        ),
        adIdToUnlock,
        earnedRateNumber: 0,
        updatedBalance: null,
        liveClicks: 0,
        atomicViews: 1,
        atomicCap: 1,
      };
    }

    const adOwnerEmail: string | null = adRow.user_email || null;
    const isPlatformDb = Boolean(
      isAdminEmail(adRow.user_email) ||
        adRow.is_admin_post ||
        !adRow.cost_per_impression ||
        Number(adRow.cost_per_impression) <= 0 ||
        !adRow.impressions ||
        Number(adRow.impressions) <= 0
    );

    if (isPlatformDb) {
      return {
        errorResponse: NextResponse.json(
          {
            success: false,
            code: "PLATFORM_POST",
            error: "This is a platform post without an earning budget. Users cannot earn from platform posts.",
          },
          { status: 400 }
        ),
        adIdToUnlock,
        earnedRateNumber: 0,
        updatedBalance: null,
        liveClicks: 0,
        atomicViews: 1,
        atomicCap: 1,
      };
    }

    if (adOwnerEmail && adOwnerEmail.toLowerCase().trim() === emailKey) {
      return {
        errorResponse: NextResponse.json(
          {
            success: false,
            code: "SELF_EARN_FORBIDDEN",
            error: "You cannot earn from your own advertisement.",
          },
          { status: 400 }
        ),
        adIdToUnlock,
        earnedRateNumber: 0,
        updatedBalance: null,
        liveClicks: 0,
        atomicViews: 1,
        atomicCap: 1,
      };
    }

    const adCpi = Number(adRow.cost_per_impression) || 0;
    const userFreqCap = Math.max(1, Number(adRow.user_frequency_cap || 1));
    const impressionsTarget = Number(adRow.impressions || 0);
    const impressionCount = Number(adRow.impression_count || 0);
    const adCompleted = Boolean(adRow.completed_at) || (impressionsTarget > 0 && impressionCount >= impressionsTarget);

    if (adCompleted) {
      return {
        errorResponse: NextResponse.json(
          {
            success: false,
            code: "CAMPAIGN_COMPLETED",
            error: "This ad campaign has completed its impression budget.",
          },
          { status: 400 }
        ),
        adIdToUnlock,
        earnedRateNumber: 0,
        updatedBalance: null,
        liveClicks: 0,
        atomicViews: 1,
        atomicCap: 1,
      };
    }

    // Enforce per-user frequency cap in fallback
    const { data: existingImp } = await supabaseAdmin
      .from("ad_impressions")
      .select("id, view_count")
      .eq("ad_id", adId)
      .ilike("user_email", emailKey)
      .maybeSingle();

    const existingViews = existingImp ? Number(existingImp.view_count || 0) : 0;
    if (existingViews >= userFreqCap) {
      if (isRedisReady()) {
        await redisConnection.sadd(earnedSetKey, adId).catch(() => {});
      }
      return {
        errorResponse: NextResponse.json(
          {
            success: false,
            code: "ALREADY_EARNED",
            error: "This ad reward has already been claimed on your account.",
            views: existingViews,
            cap: userFreqCap,
          },
          { status: 400 }
        ),
        adIdToUnlock,
        earnedRateNumber: 0,
        updatedBalance: null,
        liveClicks: 0,
        atomicViews: existingViews,
        atomicCap: userFreqCap,
      };
    }

    atomicViews = existingViews + 1;
    atomicCap = userFreqCap;

    const currentBal = Number(dbUser.balance) || 0;
    const currentClicks = Number(dbUser.monetization_clicks) || 0;
    const currentInvites = Number(dbUser.referral_downloads_count) || 0;
    const isMonetized = Boolean(
      isExemptDbUser ||
        dbUser.monetized === true ||
        dbUser.monetized === "true" ||
        dbUser.monetized === "yes" ||
        dbUser.monetized === "1" ||
        dbUser.monetized === "t" ||
        currentClicks >= 300 ||
        currentInvites >= 12
    );
    isEarnerNowMonetized = isMonetized;
    attentionWorthScore = (dbUser as any).attention_worth_score;

    liveClicks = currentClicks + 1;
    const tierDetails = computeAtwTierDetails(
      liveClicks,
      dbUser.atw_tier,
      isExemptDbUser,
      attentionWorthScore
    );
    const holdingCap = tierDetails.isUnlimited ? Infinity : tierDetails.holdingCap;
    const dynamicFallbackShare = 0.3 + (bonusSeconds / 16.0) * 0.2;
    const uncappedEarn = isMonetized ? Math.round(adCpi * dynamicFallbackShare * 100) / 100 : 0;
    const remainingCapRoom = holdingCap === Infinity ? Infinity : Math.max(0, Math.round((holdingCap - currentBal) * 100) / 100);
    const netCredited =
      isMonetized && currentBal < holdingCap ? Math.min(uncappedEarn, remainingCapRoom) : 0;

    updatedBalance = isMonetized
      ? Math.min(holdingCap, Math.round((currentBal + netCredited) * 100) / 100)
      : currentBal;
    earnedRateNumber = netCredited;
    rawCpi = adCpi;

    if (existingImp) {
      await supabaseAdmin
        .from("ad_impressions")
        .update({ view_count: atomicViews, last_viewed_at: new Date().toISOString() })
        .eq("id", existingImp.id);
    } else {
      await supabaseAdmin.from("ad_impressions").insert({
        ad_id: adId,
        user_email: emailKey,
        view_count: 1,
        last_viewed_at: new Date().toISOString(),
      });
    }

    const isNowExhausted = impressionsTarget > 0 && impressionCount + 1 >= impressionsTarget;
    const completedIso = isNowExhausted ? new Date().toISOString() : null;
    let updatedAdRow: any = null;

    if (isRedisReady()) {
      bufferAdImpression(adId).catch(() => {});
    } else {
      const adUpdateRes = await supabaseAdmin
        .from("addsactive")
        .update({ impression_count: impressionCount + 1, completed_at: completedIso })
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
            await supabaseAdmin
              .from("addscompleted")
              .upsert([updatedAdRow], { onConflict: "id" })
              .then(() => {}, () => {});
          }
          await supabaseAdmin.from("addsactive").delete().eq("id", adId);
          await supabaseAdmin.from("bidded_ads").delete().eq("ad_id", adId).then(() => {}, () => {});
          await supabaseAdmin
            .from("adds")
            .update({ completed_at: completedIso, impression_count: impressionCount + 1 })
            .eq("id", adId);
          await evictExhaustedAdCaches(adId);
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
        monetized: isMonetized || liveClicks >= 300 || isExemptDbUser ? "true" : dbUser.monetized ? "true" : "false",
        last_active_at: new Date().toISOString(),
      })
      .ilike("email", emailKey);

    if (earnedRateNumber > 0) {
      try {
        await supabaseAdmin.from("wallet_transactions").insert({
          user_email: emailKey,
          type: "earn",
          amount: earnedRateNumber,
          description: `Earned ${Math.round(dynamicFallbackShare * 100)}% share (₦${earnedRateNumber}) from ad interaction`,
          reference: `EARN_${adId}_${Date.now()}`,
          status: "completed",
        });
      } catch {}
    }

    if (userUpdateErr) {
      console.error("❌ DB fallback error updating user balance:", userUpdateErr);
    }

    if (isMonetized && earnedRateNumber > 0) {
      await creditAffiliatePlatformShare(adCpi, adId, emailKey).catch(() => {});
    }
  } else if (atomicResult && !atomicResult.success) {
    console.warn("⚠️ [POST /api/earn] Atomic DB claim rejected:", atomicResult);
    if (atomicResult.code === "ALREADY_EARNED" && isRedisReady()) {
      await redisConnection.sadd(earnedSetKey, adId).catch(() => {});
    }
    const statusCode =
      atomicResult.code === "CONCURRENT_CLAIM"
        ? 429
        : atomicResult.code === "USER_SUSPENDED" || atomicResult.code === "ACCOUNT_DEACTIVATED"
        ? 403
        : atomicResult.code === "CAMPAIGN_NOT_FOUND" || atomicResult.code === "AD_NOT_FOUND"
        ? 404
        : 400;
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          code: atomicResult.code || "ALREADY_EARNED",
          error: atomicResult.error || "Reward for this ad has already been credited.",
          views: atomicResult.views ?? atomicResult.views_used,
          cap: atomicResult.cap ?? atomicResult.max_views,
        },
        { status: statusCode }
      ),
      adIdToUnlock,
      earnedRateNumber: 0,
      updatedBalance: null,
      liveClicks: 0,
      atomicViews: 1,
      atomicCap: 1,
    };
  } else if (atomicResult && atomicResult.success) {
    updatedBalance = Number(atomicResult.balance ?? atomicResult.new_balance);
    liveClicks = Number(atomicResult.clicks ?? atomicResult.new_clicks);
    earnedRateNumber = Number(
      atomicResult.net_credited ?? atomicResult.amount ?? atomicResult.earned_amount ?? 0
    );
    atomicViews = Number(atomicResult.views_used ?? atomicResult.views ?? atomicResult.ad_views ?? 1);
    attentionWorthScore = atomicResult.attention_worth_score;
    isEarnerNowMonetized = Boolean(
      atomicResult.is_monetized ?? atomicResult.monetized ?? liveClicks >= 300
    );
    if (atomicResult.raw_cpi && Number(atomicResult.raw_cpi) > 0) {
      rawCpi = Number(atomicResult.raw_cpi);
    }
    if (atomicResult.max_views || atomicResult.cap) {
      atomicCap = Number(atomicResult.max_views ?? atomicResult.cap);
    }
    if (atomicResult.is_exhausted || atomicResult.completed) {
      await evictExhaustedAdCaches(adId);
    }
    if (isRedisReady()) {
      bufferAdImpression(adId).catch(() => {});
    }
    if (!atomicResult.affiliate_credited && isEarnerNowMonetized && earnedRateNumber > 0) {
      await creditAffiliatePlatformShare(rawCpi, adId, emailKey).catch(() => {});
    }

    const ua = request.headers.get("user-agent") || "";
    const deviceType = /Mobile|Android|iP(hone|od|ad)/i.test(ua) ? "mobile" : "desktop";
    const geoCountry =
      request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "Global";
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

  // 3. Agent commission deduction & direct referrer credit
  if (
    !atomicResult?.agent_commission_applied &&
    isEarnerNowMonetized &&
    earnedRateNumber > 0 &&
    updatedBalance !== null &&
    !isNaN(updatedBalance)
  ) {
    try {
      const { applyAgentCommissionOnEarning } = await import("@/lib/agentSystem");
      const agentSplit = await applyAgentCommissionOnEarning({
        earnerEmail: emailKey,
        grossEarnedAmount: earnedRateNumber,
        currentEarnerBalance: updatedBalance,
        adId,
      });
      if ((agentSplit?.deductedAmount || 0) > 0) {
        earnedRateNumber = agentSplit.netEarnerAmount;
        updatedBalance = agentSplit.adjustedEarnerBalance;
      }
    } catch (agentSplitErr) {
      console.warn("⚠️ Agent earning split warning in /api/earn:", agentSplitErr);
    }
  }

  // 4. Sync Redis caches, statement/monetize invalidation & live broadcasts
  await syncPostEarnCaches({
    emailKey,
    adId,
    liveClicks,
    updatedBalance,
    atomicViews,
    atomicCap,
    attentionWorthScore,
  });

  const isExemptEarn = isExemptFromBarriersAndInactivity(emailKey);
  const earnTier = computeAtwTierDetails(liveClicks, atomicResult?.atw_tier, isExemptEarn, attentionWorthScore);

  await publishEarnSideEffects({
    emailKey,
    adId,
    earnedRateNumber,
    updatedBalance: updatedBalance ?? 0,
    liveClicks,
    atwTierCode: earnTier.tierCode,
    deviceId,
  });

  return {
    adIdToUnlock,
    earnedRateNumber,
    updatedBalance,
    liveClicks,
    atomicViews,
    atomicCap,
    attentionWorthScore,
  };
}
