import { NextResponse } from "next/server";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { isExemptFromBarriersAndInactivity } from "../adminHelper";
import { incrementCachedMutualCount } from "@/lib/utils/cache";
import { bufferAdImpression } from "@/lib/impressionBuffer";
import { dispatchEarningWebhook } from "@/lib/webhookDispatcher";
import { computeAtwTierDetails } from "@/lib/attentionTierEngine";
import { checkAndNotifyClickAndAtwMilestones } from "@/lib/notifications/milestoneNotifications";

export interface MutualClaimInput {
  adId: string;
  emailKey: string;
  deviceId?: string | null;
}

export interface MutualClaimOutput {
  errorResponse?: NextResponse;
  updatedBalance: number | null;
  liveClicks: number;
  attentionWorthScore?: number | null;
  milestoneNotified?: boolean;
  monetizationUnlocked?: boolean;
  atwUpgraded?: boolean;
}

export async function processMutualClaim(input: MutualClaimInput): Promise<MutualClaimOutput> {
  const { adId, emailKey, deviceId } = input;
  let updatedBalance: number | null = null;
  let liveClicks = 0;
  let attentionWorthScore: number | null | undefined;
  let publisherEmail: string | null = null;
  let updatedMutualCount = 0;
  let updatedImpressionCount: number | undefined;
  let milestoneNotified = false;
  let monetizationUnlocked = false;
  let atwUpgraded = false;

  try {
    const [{ data: adRow }, { data: dbUserBefore }] = await Promise.all([
      supabaseAdmin
        .from("addsactive")
        .select("id, user_email, impression_count, mutual_adds_count, is_paused, completed_at")
        .eq("id", adId)
        .maybeSingle(),
      supabaseAdmin
        .from("users")
        .select("id, balance, monetization_clicks, monetized, has_cancelled_monetization, atw_tier, attention_worth_score, is_affiliate, is_career, mutuals, mutual_count")
        .eq("email", emailKey)
        .maybeSingle(),
    ]);

    if (!adRow || adRow.is_paused || adRow.completed_at) {
      return {
        errorResponse: NextResponse.json(
          { success: false, error: "Active campaign not found." },
          { status: 404 }
        ),
        updatedBalance: null,
        liveClicks: 0,
      };
    }

    publisherEmail = adRow.user_email ? String(adRow.user_email).toLowerCase().trim() : null;
    if (publisherEmail && publisherEmail === emailKey) {
      return {
        errorResponse: NextResponse.json(
          { success: false, error: "You cannot add mutual from your own advertisement." },
          { status: 400 }
        ),
        updatedBalance: null,
        liveClicks: 0,
      };
    }

    // Security (C-16): Enforce 50-mutual cap before mutating mutuals
    const existingMutualsBefore = Array.isArray(dbUserBefore?.mutuals)
      ? dbUserBefore.mutuals.map((m: any) => String(m).toLowerCase().trim()).filter(Boolean)
      : [];
    const currentMutualCountBefore = Math.max(
      Number(dbUserBefore?.mutual_count || 0),
      existingMutualsBefore.length
    );
    if (
      publisherEmail &&
      !existingMutualsBefore.includes(publisherEmail) &&
      currentMutualCountBefore >= 50
    ) {
      return {
        errorResponse: NextResponse.json(
          { success: false, code: "MUTUAL_LIMIT_REACHED", error: "Mutual limit reached (50 max)." },
          { status: 400 }
        ),
        updatedBalance: Number(dbUserBefore?.balance ?? 0),
        liveClicks: Number(dbUserBefore?.monetization_clicks ?? 0),
      };
    }

    await Promise.resolve(
      supabaseAdmin.rpc("handle_mutual_click", {
        p_ad_id: adId,
        p_user_email: emailKey,
      })
    ).catch(() => {});

    const { data: dbUserAfter } = await supabaseAdmin
      .from("users")
      .select("id, balance, monetization_clicks, monetized, has_cancelled_monetization, atw_tier, attention_worth_score, is_affiliate, is_career, mutuals, mutual_count")
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
      if (publisherEmail && !rawMutuals.includes(publisherEmail) && rawMutuals.length < 50) {
        rawMutuals.push(publisherEmail);
      }
      const nextMutualCount = Math.min(50, Math.max(Number(userRow.mutual_count || 0), rawMutuals.length));
      const isExemptMut = isExemptFromBarriersAndInactivity(emailKey, userRow as any);
      const hasCancelledMut = Boolean((userRow as any).has_cancelled_monetization);
      attentionWorthScore = (userRow as any).attention_worth_score;
      const mutTier = computeAtwTierDetails(
        nextClicks,
        (userRow as any).atw_tier,
        isExemptMut,
        attentionWorthScore
      );
      const nextMonetized =
        !hasCancelledMut &&
        (isExemptMut ||
          userRow.monetized === true ||
          userRow.monetized === "true" ||
          userRow.monetized === "yes" ||
          userRow.monetized === "1" ||
          userRow.monetized === "t" ||
          nextClicks >= 500);

      const prevMonetized = Boolean(
        dbUserBefore &&
          !hasCancelledMut &&
          (dbUserBefore.monetized === true ||
            dbUserBefore.monetized === "true" ||
            dbUserBefore.monetized === "yes" ||
            dbUserBefore.monetized === "1" ||
            dbUserBefore.monetized === "t")
      );

      await supabaseAdmin
        .from("users")
        .update({
          mutuals: rawMutuals,
          mutual_count: nextMutualCount,
          monetization_clicks: nextClicks,
          atw_tier: mutTier.tierCode,
          ...(nextMonetized ? { monetized: "true" } : {}),
          ...(nextMonetized && !prevMonetized ? { monetized_at: new Date().toISOString() } : {}),
          last_active_at: new Date().toISOString(),
        })
        .eq("id", userRow.id);

      const milestoneRes = await checkAndNotifyClickAndAtwMilestones({
        email: emailKey,
        prevClicks,
        prevMonetized,
        prevAtwTier: (dbUserBefore as any)?.atw_tier,
        nextClicks,
        nextMonetized,
        nextAtwTier: mutTier.tierCode,
        attentionWorthScore,
        isExempt: isExemptMut,
        hasCancelled: hasCancelledMut,
      }).catch(() => null);

      if (milestoneRes) {
        monetizationUnlocked = Boolean(milestoneRes.monetizationNotified);
        atwUpgraded = Boolean(milestoneRes.atwNotified);
        milestoneNotified = monetizationUnlocked || atwUpgraded;
      }

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
        redisConnection.del(`monetize:status:${emailKey}`).catch(() => {}),
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
      monetized: liveClicks >= 500,
      impressionCount: updatedImpressionCount,
      mutualAdded: publisherEmail,
      mutualCount: updatedMutualCount,
      deviceId: deviceId || null,
    },
  }).catch(() => {});

  return {
    updatedBalance,
    liveClicks,
    attentionWorthScore,
    milestoneNotified,
    monetizationUnlocked,
    atwUpgraded,
  };
}
