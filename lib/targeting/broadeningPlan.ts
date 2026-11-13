import type { BroadeningStage, CampaignBroadeningPlan, TargetableAd } from "./types";

/**
 * Determines whether a campaign is an unpaid / platform post rather than a paid
 * impression-budgeted campaign eligible for Rollover Mode.
 */
export function isUnpaidPlatformCampaign(ad: TargetableAd): boolean {
  const hasExplicitZeroCpi =
    ad.cost_per_impression !== undefined &&
    ad.cost_per_impression !== null &&
    Number(ad.cost_per_impression) <= 0;
  const hasExplicitZeroImps =
    ad.impressions !== undefined &&
    ad.impressions !== null &&
    Number(ad.impressions) <= 0;
  const isUnpaidAdmin = Boolean(ad.is_admin_post) && Number(ad.cost_per_impression || 0) <= 0;

  return Boolean(isUnpaidAdmin || hasExplicitZeroCpi || hasExplicitZeroImps);
}

/**
 * Computes progressive broadening and rollover schedule plan for a campaign.
 * Paid campaigns enter Stage 2 Rollover Mode when endMs passes with remaining
 * impressions; unpaid platform posts never enter rollover and expire at endMs.
 */
export function computeCampaignBroadeningPlan(
  ad: TargetableAd,
  nowMs: number = Date.now()
): CampaignBroadeningPlan {
  const scheduledStartMs = ad.scheduled_start_at ? new Date(ad.scheduled_start_at).getTime() : NaN;
  const scheduledEndMs = ad.scheduled_end_at ? new Date(ad.scheduled_end_at).getTime() : NaN;
  const approvedMs = ad.approved_at ? new Date(ad.approved_at).getTime() : NaN;
  const createdMs = ad.created_at ? new Date(ad.created_at).getTime() : NaN;

  const baseLaunchMs =
    !isNaN(approvedMs) && approvedMs > 0
      ? approvedMs
      : !isNaN(createdMs) && createdMs > 0
      ? createdMs
      : nowMs;

  const startMs =
    !isNaN(scheduledStartMs) && scheduledStartMs > 0
      ? Math.max(baseLaunchMs, scheduledStartMs)
      : baseLaunchMs;
  const isScheduledFuture = !isNaN(scheduledStartMs) && scheduledStartMs > nowMs;

  const campaignDays = Math.max(1, Math.min(365, Number(ad.campaign_days) || 1));
  const computedEndMs = startMs + campaignDays * 86_400_000;
  const endMs =
    !isNaN(scheduledEndMs) && scheduledEndMs > startMs ? scheduledEndMs : computedEndMs;

  const durationMs = Math.max(3600_000, endMs - startMs);
  const elapsedMs = isScheduledFuture ? 0 : Math.max(0, nowMs - startMs);
  const durationRatio = durationMs > 0 ? elapsedMs / durationMs : 0;

  const isPlatformPost = isUnpaidPlatformCampaign(ad);
  const rawImpressions = Number(ad.impressions);
  const targetImpressions = isPlatformPost
    ? Math.max(0, Number.isFinite(rawImpressions) ? rawImpressions : 0)
    : Math.max(1, Number.isFinite(rawImpressions) && rawImpressions > 0 ? rawImpressions : 1000);

  const deliveredImpressions = Math.max(
    0,
    Math.max(Number(ad.impression_count) || 0, Number(ad.view_count) || 0)
  );
  const impressionRatio =
    isPlatformPost || targetImpressions <= 0
      ? 1
      : Math.min(1, deliveredImpressions / targetImpressions);
  const remainingRatio = isPlatformPost ? 0 : Math.max(0, 1 - impressionRatio);

  const isUnpaidAdmin = Boolean(ad.is_admin_post) && Number(ad.cost_per_impression || 0) <= 0;
  const baseUserCap = isUnpaidAdmin
    ? 10
    : Math.max(1, Math.min(100, Number(ad.user_frequency_cap) || 1));

  let broadeningStage: BroadeningStage = 0;
  let capExpansion = 0;

  if (!isPlatformPost && !isScheduledFuture && durationRatio >= 1.0 && remainingRatio > 0) {
    broadeningStage = 2;
    if (impressionRatio < 0.5) capExpansion = 2;
    else if (impressionRatio < 0.85) capExpansion = 1;
  } else if (!isPlatformPost && !isScheduledFuture && durationRatio >= 0.8 && impressionRatio < 0.8) {
    broadeningStage = 1;
    if (impressionRatio < 0.65) capExpansion = 1;
  }

  const isExpiredPlatformPost = isPlatformPost && !isScheduledFuture && durationRatio >= 1.0;
  const isRollover = !isPlatformPost && !isScheduledFuture && broadeningStage === 2 && remainingRatio > 0;
  const effectiveUserCap = baseUserCap + capExpansion;
  const maxPossibleUserCap = isPlatformPost ? baseUserCap : Math.min(102, baseUserCap + 2);

  const remainingDays = Math.max(
    1,
    Math.ceil((durationMs - Math.min(elapsedMs, durationMs * 0.95)) / 86_400_000)
  );
  const baseDailyCap = Math.max(1, Math.ceil(baseUserCap / campaignDays));

  const dailyUserCap =
    broadeningStage === 2
      ? Math.max(baseDailyCap + 1, Math.ceil(effectiveUserCap / Math.max(1, remainingDays)))
      : broadeningStage === 1
      ? Math.max(baseDailyCap, Math.ceil(effectiveUserCap / Math.max(1, remainingDays)))
      : baseDailyCap;

  let minSpacingMs: number;
  if (effectiveUserCap <= 1) {
    minSpacingMs = durationMs * 2;
  } else if (broadeningStage === 2) {
    minSpacingMs = Math.max(
      90 * 60_000,
      Math.min(4 * 3600_000, Math.floor(durationMs / (effectiveUserCap * 2)))
    );
  } else if (broadeningStage === 1) {
    minSpacingMs = Math.max(
      2 * 3600_000,
      Math.min(6 * 3600_000, Math.floor(durationMs / (effectiveUserCap * 2)))
    );
  } else {
    minSpacingMs = Math.max(
      2 * 3600_000,
      Math.min(12 * 3600_000, Math.floor(durationMs / Math.max(2, effectiveUserCap * 2)))
    );
  }

  const deliveryLag = Math.max(0, Math.min(1.5, durationRatio) - impressionRatio);
  const boostFactor = ad.is_boosted || Number(ad.boosted_amount || 0) > 0 ? 1.25 : 1.0;
  const stageUrgency =
    broadeningStage === 2 ? 1.45 : broadeningStage === 1 ? 1.22 : 1.0 + deliveryLag * 0.35;
  const urgencyMultiplier = Number((boostFactor * stageUrgency).toFixed(3));

  return {
    isScheduledFuture,
    isPlatformPost,
    isRollover,
    isExpiredPlatformPost,
    startMs,
    endMs,
    durationMs,
    elapsedMs,
    durationRatio,
    impressionRatio,
    remainingRatio,
    broadeningStage,
    baseUserCap,
    effectiveUserCap,
    maxPossibleUserCap,
    dailyUserCap,
    minSpacingMs,
    urgencyMultiplier,
  };
}
