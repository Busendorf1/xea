import { NextResponse } from "next/server";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { isExemptFromBarriersAndInactivity } from "../adminHelper";
import { incrementCachedMutualCount } from "@/lib/utils/cache";
import { bufferAdImpression } from "@/lib/impressionBuffer";
import { dispatchEarningWebhook } from "@/lib/webhookDispatcher";
import { computeAtwTierDetails } from "@/lib/attentionTierEngine";

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
}

export async function processMutualClaim(input: MutualClaimInput): Promise<MutualClaimOutput> {
  const { adId, emailKey, deviceId } = input;
  let updatedBalance: number | null = null;
  let liveClicks = 0;
  let attentionWorthScore: number | null | undefined;
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
        .select("id, balance, monetization_clicks, monetized, atw_tier, attention_worth_score, mutuals, mutual_count")
        .ilike("email", emailKey)
        .maybeSingle(),
    ]);

    publisherEmail = adRow?.user_email ? String(adRow.user_email).toLowerCase().trim() : null;
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

    await Promise.resolve(
      supabaseAdmin.rpc("handle_mutual_click", {
        p_ad_id: adId,
        p_user_email: emailKey,
      })
    ).catch(() => {});

    const { data: dbUserAfter } = await supabaseAdmin
      .from("users")
      .select("id, balance, monetization_clicks, monetized, atw_tier, attention_worth_score, mutuals, mutual_count")
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
      attentionWorthScore = (userRow as any).attention_worth_score;
      const mutTier = computeAtwTierDetails(
        nextClicks,
        (userRow as any).atw_tier,
        isExemptMut,
        attentionWorthScore
      );
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
      monetized: liveClicks >= 300,
      impressionCount: updatedImpressionCount,
      mutualAdded: publisherEmail,
      mutualCount: updatedMutualCount,
      deviceId: deviceId || null,
    },
  }).catch(() => {});

  return { updatedBalance, liveClicks, attentionWorthScore };
}
