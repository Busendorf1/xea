import type { TargetableAd, ViewerTargetingProfile } from "./types";
import { computeCampaignBroadeningPlan } from "./broadeningPlan";
import { evaluateAdTargeting } from "./matchEvaluator";
import {
  WILDCARD_VALUES,
  getViewerAge,
  isUnrestrictedTarget,
  matchesAgeRange,
  normalizeGender,
  normalizeLocationToken,
  normalizeStringArray,
} from "./tokensAndGeo";

function scoreNearestAvailableMatch(ad: TargetableAd, viewer: ViewerTargetingProfile): number {
  let score = 0;

  const viewerCountryNorm = (viewer.country || "").trim().toLowerCase();
  const viewerStateNorm = viewer.state ? normalizeLocationToken(viewer.state) : "";
  const viewerCityNorm = viewer.location ? normalizeLocationToken(viewer.location) : "";

  const adCountries = normalizeStringArray(ad.country);
  if (isUnrestrictedTarget(adCountries)) {
    score += 30;
  } else if (viewerCountryNorm && adCountries.includes(viewerCountryNorm)) {
    score += 40;
  }

  const adStates = [...normalizeStringArray(ad.state), ...normalizeStringArray(ad.province)];
  if (isUnrestrictedTarget(adStates)) {
    score += 15;
  } else if (viewerStateNorm || viewerCityNorm) {
    const normAdStates = adStates.map(normalizeLocationToken).filter(Boolean);
    const viewerLocs = [viewerStateNorm, viewerCityNorm].filter(Boolean);
    if (normAdStates.some((st) => viewerLocs.some((vl) => vl === st || vl.includes(st) || st.includes(vl)))) {
      score += 25;
    }
  }

  const adGenders = normalizeStringArray(ad.gender).map(normalizeGender).filter(Boolean);
  const viewerGender = normalizeGender(viewer.gender);
  if (isUnrestrictedTarget(adGenders) || (viewerGender && adGenders.includes(viewerGender))) {
    score += 15;
  }

  const viewerAge = getViewerAge(viewer);
  if (matchesAgeRange(viewerAge, ad.age_range)) {
    score += 15;
  }

  const adEmployment = normalizeStringArray(ad.employment_status);
  const viewerEmp = [
    ...normalizeStringArray(viewer.employment),
    ...normalizeStringArray(viewer.employment_status),
  ];
  if (isUnrestrictedTarget(adEmployment) || viewerEmp.some((e) => adEmployment.includes(e))) {
    score += 10;
  }

  const viewerPersona = new Set([
    ...normalizeStringArray(viewer.interest),
    ...normalizeStringArray(viewer.industry),
    ...normalizeStringArray(viewer.behavior),
    ...normalizeStringArray(viewer.lifestyle),
    ...normalizeStringArray(viewer.personality),
  ]);
  const adPersona = [
    ...normalizeStringArray(ad.interest),
    ...normalizeStringArray(ad.industry),
    ...normalizeStringArray(ad.behavior),
    ...normalizeStringArray(ad.lifestyle),
    ...normalizeStringArray(ad.personality),
  ].filter((t) => !WILDCARD_VALUES.has(t));

  for (const tag of adPersona) {
    if (viewerPersona.has(tag)) {
      score += 20;
    }
  }

  return score;
}

/**
 * Ranks and filters candidate ads for a viewer, prioritizing `bid_price` auction weighting.
 * When `options.allowNearestFallback === false`, Pass 3 fallback is strictly disabled so
 * untargeted ads are never served on an empty candidate pool.
 */
export function rankAndFilterTargetedAds<T extends TargetableAd>(
  ads: T[],
  viewer: ViewerTargetingProfile,
  options: { minResults?: number; seenAdIds?: Set<string>; allowNearestFallback?: boolean } = {}
): T[] {
  const minResults = options.minResults ?? 10;
  const seenAdIds = options.seenAdIds;
  const nowMs = Date.now();
  const disableNearestFallback = options.allowNearestFallback === false;

  const strictMatches: Array<{ ad: T; totalScore: number; bidPrice: number; createdAtMs: number }> = [];
  const geoDemoMatches: Array<{ ad: T; totalScore: number; bidPrice: number; createdAtMs: number }> = [];
  const nearestFallbackMatches: Array<{ ad: T; totalScore: number; bidPrice: number; createdAtMs: number }> = [];

  for (const ad of ads) {
    if (!ad || !ad.id) continue;
    if (seenAdIds && seenAdIds.has(String(ad.id))) continue;

    const plan = computeCampaignBroadeningPlan(ad, nowMs);
    if (plan.isScheduledFuture) continue;

    const strictEval = evaluateAdTargeting(ad, viewer, {
      allowRolloverPsychographics: false,
      broadeningStage: 0,
    });
    const bidPrice = Number(ad.bid_price || ad.cost_per_impression || ad.impression || 25);
    const bidBonus = Math.min(250, Math.max(0, bidPrice)) * plan.urgencyMultiplier;
    const createdAtMs = ad.created_at ? new Date(ad.created_at).getTime() || 0 : 0;

    if (strictEval.matches && strictEval.isStrictMatch) {
      strictMatches.push({
        ad,
        totalScore: strictEval.relevanceScore * 2 * plan.urgencyMultiplier + bidBonus,
        bidPrice,
        createdAtMs,
      });
      continue;
    }

    if (
      strictEval.reason === "paused" ||
      strictEval.reason === "completed" ||
      strictEval.reason === "impressions_exhausted" ||
      strictEval.reason === "own_ad" ||
      strictEval.reason === "scheduled_future"
    ) {
      continue;
    }

    if (plan.broadeningStage >= 1) {
      const broadenedEval = evaluateAdTargeting(ad, viewer, {
        allowRolloverPsychographics: true,
        broadeningStage: plan.broadeningStage,
      });
      if (broadenedEval.matches) {
        const nearestScore = scoreNearestAvailableMatch(ad, viewer);
        const combinedRelevance = Math.max(broadenedEval.relevanceScore, nearestScore);
        strictMatches.push({
          ad,
          totalScore: combinedRelevance * 1.35 * plan.urgencyMultiplier + bidBonus * 0.85,
          bidPrice,
          createdAtMs,
        });
        continue;
      }
    }

    const relaxedEval = evaluateAdTargeting(ad, viewer, {
      allowRolloverPsychographics: true,
      broadeningStage: 0,
    });
    if (relaxedEval.matches) {
      geoDemoMatches.push({
        ad,
        totalScore: relaxedEval.relevanceScore * plan.urgencyMultiplier + bidBonus * 0.5,
        bidPrice,
        createdAtMs,
      });
      continue;
    }

    if (!disableNearestFallback) {
      const nearestScore = scoreNearestAvailableMatch(ad, viewer);
      nearestFallbackMatches.push({
        ad,
        totalScore:
          plan.broadeningStage === 2 || plan.durationRatio >= 1.0
            ? (nearestScore + bidBonus * 0.35) * plan.urgencyMultiplier
            : nearestScore + bidBonus * 0.25,
        bidPrice,
        createdAtMs,
      });
    }
  }

  const sortByScoreThenBid = (
    a: { totalScore: number; bidPrice: number; createdAtMs: number },
    b: { totalScore: number; bidPrice: number; createdAtMs: number }
  ) => b.totalScore - a.totalScore || b.bidPrice - a.bidPrice || b.createdAtMs - a.createdAtMs;

  strictMatches.sort(sortByScoreThenBid);

  if (strictMatches.length >= minResults) {
    return spaceFeedAdsByAdvertiser(strictMatches.map((item) => item.ad));
  }

  geoDemoMatches.sort(sortByScoreThenBid);
  const combined = [
    ...strictMatches.map((item) => item.ad),
    ...geoDemoMatches.slice(0, minResults - strictMatches.length).map((item) => item.ad),
  ];

  if (
    !disableNearestFallback &&
    (options.allowNearestFallback || combined.length === 0) &&
    combined.length < minResults &&
    nearestFallbackMatches.length > 0
  ) {
    nearestFallbackMatches.sort(sortByScoreThenBid);
    combined.push(
      ...nearestFallbackMatches.slice(0, minResults - combined.length).map((item) => item.ad)
    );
  }

  return spaceFeedAdsByAdvertiser(combined);
}

export function spaceFeedAdsByAdvertiser<T extends TargetableAd>(ads: T[], minGap = 2): T[] {
  if (ads.length <= 2) return ads;
  const remaining = [...ads];
  const spaced: T[] = [];

  while (remaining.length > 0) {
    const recentOwners = new Set(
      spaced
        .slice(-minGap)
        .map((a) => (a.user_email || a.email || "").toLowerCase().trim())
        .filter(Boolean)
    );

    let pickIdx = remaining.findIndex((candidate) => {
      const owner = (candidate.user_email || candidate.email || "").toLowerCase().trim();
      return !owner || !recentOwners.has(owner);
    });

    if (pickIdx === -1) {
      pickIdx = 0;
    }

    spaced.push(remaining.splice(pickIdx, 1)[0]);
  }

  return spaced;
}
