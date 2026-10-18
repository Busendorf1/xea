import crypto from "crypto";
import { env } from "./env";

export interface ViewerTargetingProfile {
  email?: string | null;
  country?: string | null;
  state?: string | null;
  location?: string | null;
  gender?: string | null;
  dob?: string | Date | null;
  age?: number | null;
  employment?: string | string[] | null;
  employment_status?: string | string[] | null;
  interest?: string | string[] | null;
  industry?: string | string[] | null;
  behavior?: string | string[] | null;
  lifestyle?: string | string[] | null;
  personality?: string | string[] | null;
}

export interface TargetableAd {
  id: string;
  user_email?: string | null;
  email?: string | null;
  is_paused?: boolean | null;
  completed_at?: string | null;
  is_admin_post?: boolean | null;
  targeting_all?: boolean | null;
  impressions?: number | null;
  impression_count?: number | null;
  view_count?: number | null;
  user_frequency_cap?: number | null;
  campaign_days?: number | null;
  created_at?: string | null;
  country?: string | string[] | null;
  state?: string | string[] | null;
  province?: string | string[] | null;
  gender?: string | string[] | null;
  age_range?: string | number[] | string[] | null;
  employment_status?: string | string[] | null;
  interest?: string | string[] | null;
  industry?: string | string[] | null;
  behavior?: string | string[] | null;
  lifestyle?: string | string[] | null;
  personality?: string | string[] | null;
  mutual_targets?: string[] | null;
  ad_type?: string | null;
  cost_per_impression?: number | string | null;
  impression?: number | string | null;
  bid_price?: number | string | null;
  [key: string]: any;
}

export interface TargetingMatchResult {
  matches: boolean;
  isStrictMatch: boolean;
  relevanceScore: number;
  matchedDimensions: string[];
  reason?: string;
}

/**
 * Shared secret resolver for HMAC-SHA256 earn/impression tokens.
 * Ensures SSR (getUserProfileForDashboard), /api/feed, and /api/earn always use the exact same key.
 */
export function getEarnTokenSecret(): string {
  return (
    process.env.EARN_TOKEN_SECRET ||
    env.AUTH0_SECRET ||
    process.env.AUTH0_SECRET ||
    (process.env.NODE_ENV === "production" ? "" : "xea-default-auth0-secret-key-32ch")
  );
}

/**
 * Signs an ad impression token for a specific viewer and timestamp.
 */
export function signAdImpressionToken(adId: string, viewerEmail: string, servedAt: number): string {
  const secretKey = getEarnTokenSecret();
  const payload = `${adId}:${viewerEmail.toLowerCase().trim()}:${servedAt}`;
  return crypto.createHmac("sha256", secretKey).update(payload).digest("hex");
}

/**
 * Parses a potentially JSON-encoded, comma-separated, or array field into normalized lowercase tokens.
 */
export function normalizeStringArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .flatMap((item) => normalizeStringArray(item))
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
        }
      } catch {
        // Fallback to manual split
      }
    }
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      // PostgreSQL array literal e.g. {Tech,"Real Estate"}
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((s) => s.replace(/^"+|"+$/g, "").trim().toLowerCase())
        .filter(Boolean);
    }
    return trimmed
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return [String(val).trim().toLowerCase()].filter(Boolean);
}

const WILDCARD_VALUES = new Set(["all", "any", "global", "everyone", "both", "none", "n/a", "placeholder", "*"]);

/**
 * Returns true if a targeting field represents "All / No restriction".
 */
export function isUnrestrictedTarget(tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  return tokens.some((t) => WILDCARD_VALUES.has(t));
}

/**
 * Normalizes state/province names so "Lagos State" and "Lagos" or "FCT - Abuja" and "Abuja" match cleanly.
 */
export function normalizeLocationToken(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (
    lower === "fct" ||
    lower === "abuja" ||
    lower.includes("abuja") ||
    lower.includes("federal capital territory") ||
    /\bfct\b/.test(lower)
  ) {
    return "fct";
  }
  return lower
    .replace(/\b(state|province|region|territory)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Normalizes gender strings so "M" / "Male" and "F" / "Female" match reliably.
 */
export function normalizeGender(raw: string | null | undefined): string {
  if (!raw) return "";
  const clean = raw.trim().toLowerCase();
  if (clean === "m" || clean === "male" || clean === "man" || clean === "men") return "male";
  if (clean === "f" || clean === "female" || clean === "woman" || clean === "women") return "female";
  return clean;
}

/**
 * Computes viewer age in years from DOB or numeric age.
 */
export function getViewerAge(profile: ViewerTargetingProfile): number | null {
  if (typeof profile.age === "number" && !isNaN(profile.age) && profile.age > 0) {
    return profile.age;
  }
  if (!profile.dob) return null;
  const dobStr = String(profile.dob).trim();
  if (!dobStr || dobStr === "1970-01-01" || dobStr === "PLACEHOLDER") return null;
  const birthDate = new Date(dobStr);
  if (isNaN(birthDate.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }
  return age > 0 && age < 120 ? age : null;
}

/**
 * Checks if a viewer's age falls inside any of the ad's target age ranges.
 * Supports both:
 * - Numeric [minAge, maxAge] tuples from Step2Budget (e.g. [18, 65], "{22,40}", "[22, 40]")
 * - String brackets (e.g. "18-24", "25-34", "55+", "18+")
 */
export function matchesAgeRange(viewerAge: number | null, adAgeRangeRaw: unknown): boolean {
  if (!adAgeRangeRaw) return true;
  if (viewerAge === null) return true; // Do not falsely exclude if viewer hasn't provided a valid DOB

  // Check if adAgeRangeRaw is a 2-number [minAge, maxAge] tuple
  if (Array.isArray(adAgeRangeRaw) && adAgeRangeRaw.length === 2) {
    const n0 = Number(adAgeRangeRaw[0]);
    const n1 = Number(adAgeRangeRaw[1]);
    if (!isNaN(n0) && !isNaN(n1) && !String(adAgeRangeRaw[0]).includes("-") && !String(adAgeRangeRaw[1]).includes("-")) {
      const minAge = Math.min(n0, n1);
      const maxAge = Math.max(n0, n1);
      return viewerAge >= minAge && viewerAge <= maxAge;
    }
  }

  const ranges = normalizeStringArray(adAgeRangeRaw);
  if (isUnrestrictedTarget(ranges)) return true;

  // Handle serialized 2-element numeric tuple e.g. "{18,65}" or "[18, 65]" or "18, 65"
  if (
    ranges.length === 2 &&
    /^\d{1,3}$/.test(ranges[0]) &&
    /^\d{1,3}$/.test(ranges[1])
  ) {
    const n0 = parseInt(ranges[0], 10);
    const n1 = parseInt(ranges[1], 10);
    const minAge = Math.min(n0, n1);
    const maxAge = Math.max(n0, n1);
    return viewerAge >= minAge && viewerAge <= maxAge;
  }

  for (const range of ranges) {
    if (WILDCARD_VALUES.has(range)) return true;

    const plusMatch = range.match(/^(\d{1,3})\s*\+$/);
    if (plusMatch) {
      const minAge = parseInt(plusMatch[1], 10);
      if (viewerAge >= minAge) return true;
      continue;
    }

    const spanMatch = range.match(/^(\d{1,3})\s*[-–to]+\s*(\d{1,3})$/);
    if (spanMatch) {
      const minAge = parseInt(spanMatch[1], 10);
      const maxAge = parseInt(spanMatch[2], 10);
      if (viewerAge >= minAge && viewerAge <= maxAge) return true;
      continue;
    }

    const exactMatch = range.match(/^(\d{1,3})$/);
    if (exactMatch) {
      if (viewerAge === parseInt(exactMatch[1], 10)) return true;
    }
  }

  return false;
}

/**
 * Evaluates whether an ad matches a specific viewer's targeting profile and computes a relevance score.
 */
export function evaluateAdTargeting(
  ad: TargetableAd,
  viewer: ViewerTargetingProfile,
  options: { allowRolloverPsychographics?: boolean } = {}
): TargetingMatchResult {
  const matchedDimensions: string[] = [];
  let relevanceScore = 0;

  // 1. Check active lifecycle state
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

  // 2. Self-ad exclusion (advertisers should not be served their own paid ads in the earning feed)
  const viewerEmail = (viewer.email || "").toLowerCase().trim();
  const adOwnerEmail = (ad.user_email || ad.email || "").toLowerCase().trim();
  if (!isAdminPost && viewerEmail && adOwnerEmail && viewerEmail === adOwnerEmail) {
    return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "own_ad" };
  }

  // 2.5 Mutual Attention Network Priority: If viewer is explicitly in ad.mutual_targets, match immediately with top priority
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

  // 3. Location Targeting via LocationSelector (Country, State, and Multi-Location / Province)
  const rawProvinceStr = typeof ad.province === "string" ? ad.province.trim() : "";
  const hasMultiLocations = rawProvinceStr.includes(";") || rawProvinceStr.includes(",");

  const viewerCountryNorm = (viewer.country || "").trim().toLowerCase();
  const viewerStateNorm = viewer.state ? normalizeLocationToken(viewer.state) : "";
  const viewerCityNorm = viewer.location ? normalizeLocationToken(viewer.location) : "";

  if (!isTargetingAll && hasMultiLocations && rawProvinceStr) {
    // LocationSelector multiLocations format: "City, State, Country; City2, State2, Country2"
    const locationEntries = rawProvinceStr
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    let matchedAnyMultiLoc = false;
    for (const entry of locationEntries) {
      const parts = entry.split(",").map((p) => p.trim()).filter(Boolean);
      const entryTokens = parts.map(normalizeLocationToken).filter(Boolean);
      if (entryTokens.length === 0) continue;

      // Check country if present in the entry
      const lastPartLower = parts[parts.length - 1].toLowerCase();
      if (viewerCountryNorm && viewerCountryNorm !== "placeholder" && parts.length >= 2) {
        if (lastPartLower !== viewerCountryNorm && normalizeLocationToken(lastPartLower) !== normalizeLocationToken(viewerCountryNorm)) {
          continue;
        }
      }

      // Match if viewer's city or state matches the location entry
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
      return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "state_mismatch" };
    }
    matchedDimensions.push("country", "state");
    relevanceScore += 45;
  } else {
    // Standard Country + State + single Province/City check
    const adCountries = normalizeStringArray(ad.country);
    if (!isUnrestrictedTarget(adCountries)) {
      if (viewerCountryNorm && viewerCountryNorm !== "placeholder") {
        const countryMatched = adCountries.some((c) => c === viewerCountryNorm);
        if (!countryMatched) {
          return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "country_mismatch" };
        }
        matchedDimensions.push("country");
        relevanceScore += 20;
      }
    }

    const adStates = [
      ...normalizeStringArray(ad.state),
      ...normalizeStringArray(ad.province),
    ];
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
          return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "state_mismatch" };
        }
        matchedDimensions.push("state");
        relevanceScore += 25;
      }
    }
  }

  // 5. Gender Targeting (Hard Constraint when specified on the ad)
  const adGenders = normalizeStringArray(ad.gender).map(normalizeGender).filter(Boolean);
  if (!isTargetingAll && !isUnrestrictedTarget(adGenders)) {
    const viewerGender = normalizeGender(viewer.gender);
    if (viewerGender && viewerGender !== "placeholder") {
      if (!adGenders.includes(viewerGender)) {
        return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "gender_mismatch" };
      }
      matchedDimensions.push("gender");
      relevanceScore += 15;
    }
  }

  // 6. Age Range Targeting (Hard Constraint when specified on the ad)
  const viewerAge = getViewerAge(viewer);
  if (!isTargetingAll && !matchesAgeRange(viewerAge, ad.age_range)) {
    return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "age_mismatch" };
  }
  if (!isUnrestrictedTarget(normalizeStringArray(ad.age_range)) && viewerAge !== null) {
    matchedDimensions.push("age_range");
    relevanceScore += 15;
  }

  // 7. Employment Status Targeting (Hard Constraint when specified on the ad; checks both viewer.employment and viewer.employment_status)
  const adEmployment = normalizeStringArray(ad.employment_status);
  if (!isTargetingAll && !isUnrestrictedTarget(adEmployment)) {
    const viewerEmployment = [
      ...normalizeStringArray(viewer.employment),
      ...normalizeStringArray(viewer.employment_status),
    ];
    if (viewerEmployment.length > 0) {
      const empMatched = adEmployment.some((emp) => viewerEmployment.includes(emp));
      if (!empMatched) {
        return {
          matches: false,
          isStrictMatch: false,
          relevanceScore: 0,
          matchedDimensions,
          reason: "employment_mismatch",
        };
      }
      matchedDimensions.push("employment_status");
      relevanceScore += 15;
    }
  }

  // 8. Psychographic Targeting (Interest, Industry, Behavior, Lifestyle, Personality)
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
      isStrictMatch: true,
      relevanceScore: relevanceScore + 20,
      matchedDimensions,
    };
  }

  const viewerInterests = new Set(normalizeStringArray(viewer.interest));
  const viewerIndustries = new Set(normalizeStringArray(viewer.industry));
  const viewerBehaviors = new Set(normalizeStringArray(viewer.behavior));
  const viewerLifestyles = new Set(normalizeStringArray(viewer.lifestyle));
  const viewerPersonalities = new Set(normalizeStringArray(viewer.personality));

  // Combined viewer persona pool for cross-category affinity (e.g. an ad's industry "Technology" matching user's interest "Technology")
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
      isStrictMatch: true,
      relevanceScore,
      matchedDimensions,
    };
  }

  // If viewer has no psychographics configured at all, or if caller explicitly allows rollover after strict matches
  if (viewerAllPersona.size === 0 || options.allowRolloverPsychographics) {
    return {
      matches: true,
      isStrictMatch: false,
      relevanceScore,
      matchedDimensions,
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

/**
 * Ranks and filters a list of candidate ads for a specific viewer.
 * Strictly prioritizes ads that match 100% of demographic, geographic, and psychographic criteria,
 * sorted by combined Relevance Score + Bid Priority (eCPM).
 * If strict matches are fewer than `minResults`, fills remaining slots only with ads that still
 * strictly satisfy Country, State, Gender, Age, and Employment targeting.
 */
export function rankAndFilterTargetedAds<T extends TargetableAd>(
  ads: T[],
  viewer: ViewerTargetingProfile,
  options: { minResults?: number; seenAdIds?: Set<string> } = {}
): T[] {
  const minResults = options.minResults ?? 10;
  const seenAdIds = options.seenAdIds;

  const strictMatches: Array<{ ad: T; totalScore: number; createdAtMs: number }> = [];
  const geoDemoMatches: Array<{ ad: T; totalScore: number; createdAtMs: number }> = [];

  for (const ad of ads) {
    if (!ad || !ad.id) continue;
    if (seenAdIds && seenAdIds.has(String(ad.id))) continue;

    const strictEval = evaluateAdTargeting(ad, viewer, { allowRolloverPsychographics: false });
    const cpi = Number(ad.bid_price || ad.cost_per_impression || ad.impression || 25);
    const bidBonus = Math.min(200, Math.max(0, cpi));
    const createdAtMs = ad.created_at ? new Date(ad.created_at).getTime() || 0 : 0;

    if (strictEval.matches && strictEval.isStrictMatch) {
      strictMatches.push({
        ad,
        totalScore: strictEval.relevanceScore * 2 + bidBonus,
        createdAtMs,
      });
      continue;
    }

    // Check if it passes all hard Geographic + Demographic rules (Country, State, Gender, Age, Employment)
    const relaxedEval = evaluateAdTargeting(ad, viewer, { allowRolloverPsychographics: true });
    if (relaxedEval.matches) {
      geoDemoMatches.push({
        ad,
        totalScore: relaxedEval.relevanceScore + bidBonus * 0.5,
        createdAtMs,
      });
    }
  }

  strictMatches.sort((a, b) => b.totalScore - a.totalScore || b.createdAtMs - a.createdAtMs);

  if (strictMatches.length >= minResults || geoDemoMatches.length === 0) {
    return spaceFeedAdsByAdvertiser(strictMatches.map((item) => item.ad));
  }

  geoDemoMatches.sort((a, b) => b.totalScore - a.totalScore || b.createdAtMs - a.createdAtMs);
  const combined = [
    ...strictMatches.map((item) => item.ad),
    ...geoDemoMatches.slice(0, minResults - strictMatches.length).map((item) => item.ad),
  ];
  return spaceFeedAdsByAdvertiser(combined);
}

/**
 * Ensures ads from the same advertiser (or retargeted campaigns) are well-spaced
 * across the feed rather than appearing back-to-back.
 */
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

