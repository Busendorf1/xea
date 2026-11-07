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
  approved_at?: string | null;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
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
  is_bidded?: boolean | null;
  is_boosted?: boolean | null;
  boosted_amount?: number | string | null;
  boosted_at?: string | null;
  [key: string]: any;
}

export type BroadeningStage = 0 | 1 | 2;

export interface CampaignBroadeningPlan {
  isScheduledFuture: boolean;
  startMs: number;
  endMs: number;
  durationMs: number;
  elapsedMs: number;
  durationRatio: number;
  impressionRatio: number;
  remainingRatio: number;
  broadeningStage: BroadeningStage;
  baseUserCap: number;
  effectiveUserCap: number;
  dailyUserCap: number;
  minSpacingMs: number;
  urgencyMultiplier: number;
}

/**
 * Gold-Plated Enterprise Campaign Pacing, Frequency Spacing & Target Broadening Engine.
 *
 * - Supports explicit `[scheduled_start_at, scheduled_end_at]` date-time windows as well as `campaign_days`.
 * - Enforces `scheduled_start_at`: if in the future, `isScheduledFuture = true` (do not serve yet).
 * - Spreads a user's frequency cap evenly across the exact `[startMs, endMs]` window with `dailyUserCap` and `minSpacingMs`.
 * - Stage 0 (< 80% window elapsed or on-pace delivery >= 80%):
 *     Strict targeting (`broadeningStage = 0`) and strict `baseUserCap`.
 * - Stage 1 (80%–99% of `[startMs, endMs]` window elapsed & remaining impressions > 20%, i.e. stalling near 80%):
 *     Broadens targeting (`broadeningStage = 1`: relaxes psychographics, employment, and state/city within country)
 *     and if significantly behind pace (`impressionRatio < 0.65`), expands `effectiveUserCap = baseUserCap + 1`
 *     with a strict minimum spacing of at least 2 hours so active users never see back-to-back repeats.
 * - Stage 2 (>= 100% of `[startMs, endMs]` window elapsed / past end date & impressions still remaining):
 *     Broadens targeting further (`broadeningStage = 2`: regional/country/global nearest-affinity rollover)
 *     and if most necessary (`impressionRatio < 0.85`), expands `effectiveUserCap` by +1 (or +2 if < 50% delivered)
 *     with >= 90 minutes minimum spacing so stalled ads complete smoothly without starving or locking.
 */
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

  const startMs =
    !isNaN(scheduledMs) && scheduledMs > 0
      ? Math.max(baseLaunchMs, scheduledMs)
      : baseLaunchMs;

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
  const baseUserCap = isUnpaidAdmin
    ? 10
    : Math.max(1, Math.min(100, Number(ad.user_frequency_cap) || 1));

  let broadeningStage: BroadeningStage = 0;
  let capExpansion = 0;

  // Stage 2: Duration has passed (>= 100%) and impressions still remain
  if (!isScheduledFuture && durationRatio >= 1.0 && remainingRatio > 0) {
    broadeningStage = 2;
    if (!isUnpaidAdmin) {
      if (impressionRatio < 0.5) {
        capExpansion = 2;
      } else if (impressionRatio < 0.85) {
        capExpansion = 1;
      }
    }
  }
  // Stage 1: Duration is 80%+ near and still much remaining (> 20% remaining, i.e. impressionRatio < 0.80)
  else if (!isScheduledFuture && durationRatio >= 0.8 && impressionRatio < 0.8) {
    broadeningStage = 1;
    if (!isUnpaidAdmin && impressionRatio < 0.65) {
      capExpansion = 1;
    }
  }

  const effectiveUserCap = baseUserCap + capExpansion;

  // Remaining days in campaign (at least 1 day window for daily pacing calculation)
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

  // Well-spaced minimum interval between repeat views of the same ad by the same user:
  // If effectiveUserCap == 1, spacing is the entire campaign duration (infinite).
  // For multi-cap or broadened caps, spread evenly across the duration, clamped between 90m and 12h.
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

  // Urgency multiplier for auction ranking so behind-schedule or boosted campaigns accelerate smoothly
  const deliveryLag = Math.max(0, Math.min(1.5, durationRatio) - impressionRatio);
  const boostFactor = ad.is_boosted || Number(ad.boosted_amount || 0) > 0 ? 1.25 : 1.0;
  const stageUrgency =
    broadeningStage === 2 ? 1.45 : broadeningStage === 1 ? 1.22 : 1.0 + deliveryLag * 0.35;
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
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.RENDER === "true";

  const secret =
    process.env.EARN_TOKEN_SECRET ||
    env.AUTH0_SECRET ||
    process.env.AUTH0_SECRET;

  if (!secret || secret === "xea-default-auth0-secret-key-32ch") {
    if (isProduction) {
      console.error("🚨 CRITICAL: Insecure default or missing earn token secret in production environment!");
      return "";
    }
    return "xea-default-auth0-secret-key-32ch";
  }

  return secret;
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
  options: { allowRolloverPsychographics?: boolean; broadeningStage?: BroadeningStage } = {}
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

  // 1.5 Check scheduled start time
  const plan = computeCampaignBroadeningPlan(ad);
  if (plan.isScheduledFuture) {
    return { matches: false, isStrictMatch: false, relevanceScore: 0, matchedDimensions, reason: "scheduled_future" };
  }

  const stage: BroadeningStage = options.broadeningStage ?? 0;

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
    let matchedCountryInMultiLoc = false;
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
        matchedCountryInMultiLoc = true;
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
      // At Stage 1 (80%+ duration) or Stage 2 (100%+ duration), broaden state/city within the target country
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
    // Standard Country + State + single Province/City check
    const adCountries = normalizeStringArray(ad.country);
    if (!isUnrestrictedTarget(adCountries)) {
      if (viewerCountryNorm && viewerCountryNorm !== "placeholder") {
        const countryMatched = adCountries.some((c) => c === viewerCountryNorm);
        if (!countryMatched) {
          // At Stage 2 (100%+ duration passed & severely under-delivered < 50%), allow global rollover with lower score
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
          // Stage 1 (80% duration near) & Stage 2 (100% duration passed) broaden state/province within the target country
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

  // 5. Gender Targeting (Hard Constraint in Stage 0 & 1; softened in Stage 2 if overdue)
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

  // 6. Age Range Targeting (Hard Constraint in Stage 0; expanded +/- 10 yrs in Stage 1; broadened in Stage 2)
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

  // 7. Employment Status Targeting (Hard Constraint in Stage 0; broadened in Stage 1 & 2)
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
      isStrictMatch: stage === 0,
      relevanceScore,
      matchedDimensions,
    };
  }

  // If viewer has no psychographics configured at all, or if caller explicitly allows rollover, or if ad is in Stage 1 (80%) or Stage 2 (100%+) broadening
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

/**
 * Computes a soft nearest-match affinity score for an active ad when strict/relaxed passes
 * have not yet filled the viewer's feed, ensuring zero active ads are ever stranded in the DB.
 */
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

  const adStates = [
    ...normalizeStringArray(ad.state),
    ...normalizeStringArray(ad.province),
  ];
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
 * Ranks and filters a list of candidate ads for a specific viewer.
 * - Pass 1 (Strict): 100% of Geographic + Demographic + Psychographic criteria, sorted by Relevance + Bid Priority.
 * - Pass 2 (Geo + Demo Rollover): Satisfies Country, State, Gender, Age, and Employment targeting.
 * - Pass 3 (Progressive Nearest-Match Fallback): Ranks remaining active eligible ads by closest Location,
 *   Demographic, and Psychographic affinity so zero active campaigns are ever left stranded in the DB.
 */
export function rankAndFilterTargetedAds<T extends TargetableAd>(
  ads: T[],
  viewer: ViewerTargetingProfile,
  options: { minResults?: number; seenAdIds?: Set<string>; allowNearestFallback?: boolean } = {}
): T[] {
  const minResults = options.minResults ?? 10;
  const seenAdIds = options.seenAdIds;
  const nowMs = Date.now();

  const strictMatches: Array<{ ad: T; totalScore: number; createdAtMs: number }> = [];
  const geoDemoMatches: Array<{ ad: T; totalScore: number; createdAtMs: number }> = [];
  const nearestFallbackMatches: Array<{ ad: T; totalScore: number; createdAtMs: number }> = [];

  for (const ad of ads) {
    if (!ad || !ad.id) continue;
    if (seenAdIds && seenAdIds.has(String(ad.id))) continue;

    const plan = computeCampaignBroadeningPlan(ad, nowMs);
    if (plan.isScheduledFuture) continue;

    // Evaluate strict match first (stage 0) so native matches always get top relevance score
    const strictEval = evaluateAdTargeting(ad, viewer, {
      allowRolloverPsychographics: false,
      broadeningStage: 0,
    });
    const cpi = Number(ad.bid_price || ad.cost_per_impression || ad.impression || 25);
    const bidBonus = Math.min(250, Math.max(0, cpi)) * plan.urgencyMultiplier;
    const createdAtMs = ad.created_at ? new Date(ad.created_at).getTime() || 0 : 0;

    if (strictEval.matches && strictEval.isStrictMatch) {
      strictMatches.push({
        ad,
        totalScore: strictEval.relevanceScore * 2 * plan.urgencyMultiplier + bidBonus,
        createdAtMs,
      });
      continue;
    }

    // Hard lifecycle / self-ad / scheduled exclusions are NEVER relaxed in any pass
    if (
      strictEval.reason === "paused" ||
      strictEval.reason === "completed" ||
      strictEval.reason === "impressions_exhausted" ||
      strictEval.reason === "own_ad" ||
      strictEval.reason === "scheduled_future"
    ) {
      continue;
    }

    // If the campaign is in Stage 1 (80%+ duration near & stalling) or Stage 2 (100%+ duration passed & stalling),
    // evaluate with its broadened stage immediately so stalling ads don't get starved when viewer has strict matches!
    if (plan.broadeningStage >= 1) {
      const broadenedEval = evaluateAdTargeting(ad, viewer, {
        allowRolloverPsychographics: true,
        broadeningStage: plan.broadeningStage,
      });
      if (broadenedEval.matches) {
        const nearestScore = scoreNearestAvailableMatch(ad, viewer);
        const combinedRelevance = Math.max(broadenedEval.relevanceScore, nearestScore);
        // Promote broadened stalling ads into the primary pool with urgency-weighted score
        strictMatches.push({
          ad,
          totalScore: combinedRelevance * 1.35 * plan.urgencyMultiplier + bidBonus * 0.85,
          createdAtMs,
        });
        continue;
      }
    }

    // Pass 2: Check if it passes all hard Geographic + Demographic rules (Country, State, Gender, Age, Employment)
    const relaxedEval = evaluateAdTargeting(ad, viewer, {
      allowRolloverPsychographics: true,
      broadeningStage: 0,
    });
    if (relaxedEval.matches) {
      geoDemoMatches.push({
        ad,
        totalScore: relaxedEval.relevanceScore * plan.urgencyMultiplier + bidBonus * 0.5,
        createdAtMs,
      });
      continue;
    }

    // Pass 3: Progressive Nearest-Match Fallback (for Stage 2 overdue campaigns or when viewer has 0 strict/geoDemo matches)
    const isStrandedRollover = plan.broadeningStage === 2 || plan.durationRatio >= 1.0;

    if (options.allowNearestFallback || isStrandedRollover) {
      const nearestScore = scoreNearestAvailableMatch(ad, viewer);
      nearestFallbackMatches.push({
        ad,
        totalScore: (nearestScore + bidBonus * 0.35) * plan.urgencyMultiplier,
        createdAtMs,
      });
    } else {
      // Keep in reserve if combined strict + geoDemo is completely empty (0 matches)
      const nearestScore = scoreNearestAvailableMatch(ad, viewer);
      nearestFallbackMatches.push({
        ad,
        totalScore: nearestScore + bidBonus * 0.25,
        createdAtMs,
      });
    }
  }

  strictMatches.sort((a, b) => b.totalScore - a.totalScore || b.createdAtMs - a.createdAtMs);

  if (strictMatches.length >= minResults) {
    return spaceFeedAdsByAdvertiser(strictMatches.map((item) => item.ad));
  }

  geoDemoMatches.sort((a, b) => b.totalScore - a.totalScore || b.createdAtMs - a.createdAtMs);
  const combined = [
    ...strictMatches.map((item) => item.ad),
    ...geoDemoMatches.slice(0, minResults - strictMatches.length).map((item) => item.ad),
  ];

  // Activate Pass 3 Nearest-Match Fallback when:
  // (a) caller explicitly enables allowNearestFallback, OR
  // (b) strict + geoDemo yielded 0 ads so neither the feed nor active ads are left stranded
  if (
    (options.allowNearestFallback || combined.length === 0) &&
    combined.length < minResults &&
    nearestFallbackMatches.length > 0
  ) {
    nearestFallbackMatches.sort((a, b) => b.totalScore - a.totalScore || b.createdAtMs - a.createdAtMs);
    combined.push(
      ...nearestFallbackMatches.slice(0, minResults - combined.length).map((item) => item.ad)
    );
  }

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

