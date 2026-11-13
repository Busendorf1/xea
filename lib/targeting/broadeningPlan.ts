import type { BroadeningStage, CampaignBroadeningPlan, TargetableAd } from "./types";

export function computeCampaignBroadeningPlan(
  ad: TargetableAd,
  nowMs: number = Date.now()
): CampaignBroadeningPlan {
  const scheduledMs = ad.scheduled_start_at ? new Date(ad.scheduled_start_at).getTime() : NaN;
  const approvedMs = ad.approved_at ? new Date(ad.approved_at).getTime() : NaN;
  const createdMs = ad.created_at ? new Date(ad.created_at).getTime() : NaN;

  const baseLaunchMs =
    !isNaN(approvedMs) && approvedMs > 0
      ? approvedMs
      : !isNaN(createdMs) && createdMs > 0
      ? createdMs
      : nowMs;

  const startMs = !isNaN(scheduledMs) && scheduledMs > 0 ? Math.max(baseLaunchMs, scheduledMs) : baseLaunchMs;
  const isScheduledFuture = !isNaN(scheduledMs) && scheduledMs > nowMs;

  const campaignDays = Math.max(1, Math.min(365, Number(ad.campaign_days) || 1));
  const endMs = startMs + campaignDays * 86_400_000;
  const durationMs = Math.max(3600_000, endMs - startMs);
  const elapsedMs = isScheduledFuture ? 0 : Math.max(0, nowMs - startMs);
  const durationRatio = durationMs > 0 ? elapsedMs / durationMs : 0;

  const targetImpressions = Math.max(1, Number(ad.impressions) || 1000);
  const deliveredImpressions = Math.max(
    0,
    Math.max(Number(ad.impression_count) || 0, Number(ad.view_count) || 0)
  );
  const impressionRatio = Math.min(1, deliveredImpressions / targetImpressions);
  const remainingRatio = Math.max(0, 1 - impressionRatio);

  const isUnpaidAdmin = Boolean(ad.is_admin_post) && Number(ad.cost_per_impression || 0) <= 0;
  const baseUserCap = isUnpaidAdmin ? 10 : Math.max(1, Math.min(100, Number(ad.user_frequency_cap) || 1));

  let broadeningStage: BroadeningStage = 0;
  let capExpansion = 0;

  if (!isScheduledFuture && durationRatio >= 1.0 && remainingRatio > 0) {
    broadeningStage = 2;
    if (!isUnpaidAdmin) {
      if (impressionRatio < 0.5) capExpansion = 2;
      else if (impressionRatio < 0.85) capExpansion = 1;
    }
  } else if (!isScheduledFuture && durationRatio >= 0.8 && impressionRatio < 0.8) {
    broadeningStage = 1;
    if (!isUnpaidAdmin && impressionRatio < 0.65) capExpansion = 1;
  }

  const effectiveUserCap = baseUserCap + capExpansion;
  const remainingDays = Math.max(1, Math.ceil((durationMs - Math.min(elapsedMs, durationMs * 0.95)) / 86_400_000));
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
    minSpacingMs = Math.max(90 * 60_000, Math.min(4 * 3600_000, Math.floor(durationMs / (effectiveUserCap * 2))));
  } else if (broadeningStage === 1) {
    minSpacingMs = Math.max(2 * 3600_000, Math.min(6 * 3600_000, Math.floor(durationMs / (effectiveUserCap * 2))));
  } else {
    minSpacingMs = Math.max(
      2 * 3600_000,
      Math.min(12 * 3600_000, Math.floor(durationMs / Math.max(2, effectiveUserCap * 2)))
    );
  }

  const deliveryLag = Math.max(0, Math.min(1.5, durationRatio) - impressionRatio);
  const boostFactor = ad.is_boosted || Number(ad.boosted_amount || 0) > 0 ? 1.25 : 1.0;
  const stageUrgency = broadeningStage === 2 ? 1.45 : broadeningStage === 1 ? 1.22 : 1.0 + deliveryLag * 0.35;
  const urgencyMultiplier = Number((boostFactor * stageUrgency).toFixed(3));

  return {
    isScheduledFuture,
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
    dailyUserCap,
    minSpacingMs,
    urgencyMultiplier,
  };
}
