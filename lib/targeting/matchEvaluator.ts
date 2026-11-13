import type { BroadeningStage, TargetableAd, TargetingMatchResult, ViewerTargetingProfile } from "./types";
import { computeCampaignBroadeningPlan } from "./broadeningPlan";
import {
  WILDCARD_VALUES,
  getViewerAge,
  isUnrestrictedTarget,
  matchesAgeRange,
  normalizeGender,
  normalizeLocationToken,
  normalizeStringArray,
} from "./tokensAndGeo";

export function evaluateAdTargeting(
  ad: TargetableAd,
  viewer: ViewerTargetingProfile,
  options: { allowRolloverPsychographics?: boolean; broadeningStage?: BroadeningStage } = {}
): TargetingMatchResult {
  const matchedDimensions: string[] = [];
  let relevanceScore = 0;

  if (ad.is_paused === true) {
    return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "paused" };
  }

  const isAdminPost = Boolean(ad.is_admin_post);
  if (!isAdminPost && ad.completed_at) {
    return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "completed" };
  }

  const maxImpressions = Number(ad.impressions || 0);
  const currentViews = Math.max(Number(ad.view_count || 0), Number(ad.impression_count || 0));
  if (!isAdminPost && maxImpressions > 0 && currentViews >= maxImpressions) {
    return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "impressions_exhausted" };
  }

  const plan = computeCampaignBroadeningPlan(ad);
  if (plan.isScheduledFuture) {
    return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "scheduled_future" };
  }

  const stage: BroadeningStage = options.broadeningStage ?? 0;

  const viewerEmail = (viewer.email || "").toLowerCase().trim();
  const adOwnerEmail = (ad.user_email || ad.email || "").toLowerCase().trim();
  if (!isAdminPost && viewerEmail && adOwnerEmail && viewerEmail === adOwnerEmail) {
    return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "own_ad" };
  }

  if (viewerEmail && Array.isArray(ad.mutual_targets) && ad.mutual_targets.length > 0) {
    const isMutualTarget = ad.mutual_targets.some((t) => String(t).toLowerCase().trim() === viewerEmail);
    if (isMutualTarget) {
      return {
        matches: true,
        isStrictMatch: true,
        relevanceScore: 150,
        matchedDimensions: ["mutual_network"],
      };
    }
  }

  const isTargetingAll = Boolean(ad.targeting_all);

  // Location targeting
  const rawProvinceStr = typeof ad.province === "string" ? ad.province.trim() : "";
  const hasMultiLocations = rawProvinceStr.includes(";") || rawProvinceStr.includes(",");

  const viewerCountryNorm = (viewer.country || "").trim().toLowerCase();
  const viewerStateNorm = viewer.state ? normalizeLocationToken(viewer.state) : "";
  const viewerCityNorm = viewer.location ? normalizeLocationToken(viewer.location) : "";

  if (!isTargetingAll && hasMultiLocations && rawProvinceStr) {
    const locationEntries = rawProvinceStr.split(";").map((s) => s.trim()).filter(Boolean);
    let matchedAnyMultiLoc = false;
    let matchedCountryInMultiLoc = false;

    for (const entry of locationEntries) {
      const parts = entry.split(",").map((p) => p.trim()).filter(Boolean);
      const entryTokens = parts.map(normalizeLocationToken).filter(Boolean);
      if (entryTokens.length === 0) continue;

      const lastPartLower = parts[parts.length - 1].toLowerCase();
      if (viewerCountryNorm && viewerCountryNorm !== "placeholder" && parts.length >= 2) {
        if (
          lastPartLower !== viewerCountryNorm &&
          normalizeLocationToken(lastPartLower) !== normalizeLocationToken(viewerCountryNorm)
        ) {
          continue;
        }
        matchedCountryInMultiLoc = true;
      }

      const stateOrCityMatch = entryTokens.some(
        (tok) =>
          (viewerCityNorm && (viewerCityNorm === tok || viewerCityNorm.includes(tok) || tok.includes(viewerCityNorm))) ||
          (viewerStateNorm && (viewerStateNorm === tok || viewerStateNorm.includes(tok) || tok.includes(viewerStateNorm)))
      );

      if (stateOrCityMatch) {
        matchedAnyMultiLoc = true;
        break;
      }
    }

    if (!matchedAnyMultiLoc && (viewerStateNorm || viewerCityNorm)) {
      if (stage >= 1 && (matchedCountryInMultiLoc || stage === 2)) {
        matchedDimensions.push("country_broadened");
        relevanceScore += matchedCountryInMultiLoc ? 22 : 10;
      } else {
        return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "state_mismatch" };
      }
    } else {
      matchedDimensions.push("country", "state");
      relevanceScore += 45;
    }
  } else {
    const adCountries = normalizeStringArray(ad.country);
    if (!isUnrestrictedTarget(adCountries)) {
      if (viewerCountryNorm && viewerCountryNorm !== "placeholder") {
        const countryMatched = adCountries.some((c) => c === viewerCountryNorm);
        if (!countryMatched) {
          if (stage === 2 && plan.impressionRatio < 0.5) {
            matchedDimensions.push("global_broadened");
            relevanceScore += 5;
          } else {
            return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "country_mismatch" };
          }
        } else {
          matchedDimensions.push("country");
          relevanceScore += 20;
        }
      }
    }

    const adStates = [...normalizeStringArray(ad.state), ...normalizeStringArray(ad.province)];
    if (!isTargetingAll && !isUnrestrictedTarget(adStates)) {
      const viewerStateTokens = [viewerStateNorm, viewerCityNorm].filter(Boolean);
      if (viewerStateTokens.length > 0) {
        const normalizedAdStates = adStates.map(normalizeLocationToken).filter(Boolean);
        const stateMatched =
          normalizedAdStates.length === 0 ||
          normalizedAdStates.some((adSt) =>
            viewerStateTokens.some((vSt) => vSt === adSt || vSt.includes(adSt) || adSt.includes(vSt))
          );
        if (!stateMatched) {
          if (stage >= 1) {
            matchedDimensions.push("state_broadened");
            relevanceScore += 10;
          } else {
            return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "state_mismatch" };
          }
        } else {
          matchedDimensions.push("state");
          relevanceScore += 25;
        }
      }
    }
  }

  // Gender targeting
  const adGenders = normalizeStringArray(ad.gender).map(normalizeGender).filter(Boolean);
  if (!isTargetingAll && !isUnrestrictedTarget(adGenders)) {
    const viewerGender = normalizeGender(viewer.gender);
    if (viewerGender && viewerGender !== "placeholder") {
      if (!adGenders.includes(viewerGender)) {
        if (stage === 2) {
          matchedDimensions.push("gender_broadened");
        } else {
          return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "gender_mismatch" };
        }
      } else {
        matchedDimensions.push("gender");
        relevanceScore += 15;
      }
    }
  }

  // Age range targeting
  const viewerAge = getViewerAge(viewer);
  if (!isTargetingAll && !matchesAgeRange(viewerAge, ad.age_range)) {
    if (stage >= 1) {
      matchedDimensions.push("age_broadened");
      relevanceScore += 5;
    } else {
      return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "age_mismatch" };
    }
  } else if (!isUnrestrictedTarget(normalizeStringArray(ad.age_range)) && viewerAge !== null) {
    matchedDimensions.push("age_range");
    relevanceScore += 15;
  }

  // Employment status targeting
  const adEmployment = normalizeStringArray(ad.employment_status);
  if (!isTargetingAll && !isUnrestrictedTarget(adEmployment)) {
    const viewerEmployment = [
      ...normalizeStringArray(viewer.employment),
      ...normalizeStringArray(viewer.employment_status),
    ];
    if (viewerEmployment.length > 0) {
      const empMatched = adEmployment.some((emp) => viewerEmployment.includes(emp));
      if (!empMatched) {
        if (stage >= 1) {
          matchedDimensions.push("employment_broadened");
          relevanceScore += 5;
        } else {
          return {
            matches: false,
            isStrictMatch: false,
            relevanceScore: 0,
            matchedDimensions,
            reason: "employment_mismatch",
          };
        }
      } else {
        matchedDimensions.push("employment_status");
        relevanceScore += 15;
      }
    }
  }

  // Psychographic targeting
  if (isAdminPost || isTargetingAll) {
    return {
      matches: true,
      isStrictMatch: true,
      relevanceScore: relevanceScore + 25,
      matchedDimensions: [...matchedDimensions, "broad_reach"],
    };
  }

  const adInterests = normalizeStringArray(ad.interest).filter((t) => !WILDCARD_VALUES.has(t));
  const adIndustries = normalizeStringArray(ad.industry).filter((t) => !WILDCARD_VALUES.has(t));
  const adBehaviors = normalizeStringArray(ad.behavior).filter((t) => !WILDCARD_VALUES.has(t));
  const adLifestyles = normalizeStringArray(ad.lifestyle).filter((t) => !WILDCARD_VALUES.has(t));
  const adPersonalities = normalizeStringArray(ad.personality).filter((t) => !WILDCARD_VALUES.has(t));

  const hasPsychographicTargets =
    adInterests.length > 0 ||
    adIndustries.length > 0 ||
    adBehaviors.length > 0 ||
    adLifestyles.length > 0 ||
    adPersonalities.length > 0;

  if (!hasPsychographicTargets) {
    return {
      matches: true,
      isStrictMatch: stage === 0,
      relevanceScore: relevanceScore + 20,
      matchedDimensions,
    };
  }

  const viewerInterests = new Set(normalizeStringArray(viewer.interest));
  const viewerIndustries = new Set(normalizeStringArray(viewer.industry));
  const viewerBehaviors = new Set(normalizeStringArray(viewer.behavior));
  const viewerLifestyles = new Set(normalizeStringArray(viewer.lifestyle));
  const viewerPersonalities = new Set(normalizeStringArray(viewer.personality));
  const viewerAllPersona = new Set([
    ...viewerInterests,
    ...viewerIndustries,
    ...viewerBehaviors,
    ...viewerLifestyles,
    ...viewerPersonalities,
  ]);

  let psychographicHits = 0;

  for (const tag of adInterests) {
    if (viewerInterests.has(tag)) {
      psychographicHits++;
      relevanceScore += 30;
      if (!matchedDimensions.includes("interest")) matchedDimensions.push("interest");
    } else if (viewerAllPersona.has(tag)) {
      psychographicHits++;
      relevanceScore += 15;
      if (!matchedDimensions.includes("interest_cross")) matchedDimensions.push("interest_cross");
    }
  }

  for (const tag of adIndustries) {
    if (viewerIndustries.has(tag)) {
      psychographicHits++;
      relevanceScore += 25;
      if (!matchedDimensions.includes("industry")) matchedDimensions.push("industry");
    } else if (viewerAllPersona.has(tag)) {
      psychographicHits++;
      relevanceScore += 15;
      if (!matchedDimensions.includes("industry_cross")) matchedDimensions.push("industry_cross");
    }
  }

  for (const tag of adBehaviors) {
    if (viewerBehaviors.has(tag) || viewerAllPersona.has(tag)) {
      psychographicHits++;
      relevanceScore += 20;
      if (!matchedDimensions.includes("behavior")) matchedDimensions.push("behavior");
    }
  }

  for (const tag of adLifestyles) {
    if (viewerLifestyles.has(tag) || viewerAllPersona.has(tag)) {
      psychographicHits++;
      relevanceScore += 20;
      if (!matchedDimensions.includes("lifestyle")) matchedDimensions.push("lifestyle");
    }
  }

  for (const tag of adPersonalities) {
    if (viewerPersonalities.has(tag) || viewerAllPersona.has(tag)) {
      psychographicHits++;
      relevanceScore += 20;
      if (!matchedDimensions.includes("personality")) matchedDimensions.push("personality");
    }
  }

  if (psychographicHits > 0) {
    return {
      matches: true,
      isStrictMatch: stage === 0,
      relevanceScore,
      matchedDimensions,
    };
  }

  if (viewerAllPersona.size === 0 || options.allowRolloverPsychographics || stage >= 1) {
    return {
      matches: true,
      isStrictMatch: false,
      relevanceScore: relevanceScore + (stage === 2 ? 12 : stage === 1 ? 8 : 0),
      matchedDimensions: stage >= 1 ? [...matchedDimensions, `broadened_stage_${stage}`] : matchedDimensions,
    };
  }

  return {
    matches: false,
    isStrictMatch: false,
    relevanceScore: 0,
    matchedDimensions,
    reason: "psychographic_mismatch",
  };
}
