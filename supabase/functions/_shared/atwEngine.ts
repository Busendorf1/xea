import { AFFILIATE_EMAILS } from "./cors.ts";

export const MAX_ATW_LEVEL = 14;
export const MAX_ATW_HOLDING_CAP = 420000;
export const HOLDING_CAP_PER_TIER = 30000;
export const CLICKS_PER_ATW_STEP = 300;
export const DEFAULT_ATTENTION_WORTH_SCORE = 0.1;
export const MAX_ATTENTION_WORTH_SCORE = 1000000;
export const EARNER_AD_SHARE_RATE = 0.6;

export const STAR_RATING_INCREMENTS: Record<number, number> = {
  1: 0.01,
  2: 0.02,
  3: 0.03,
  4: 0.04,
  5: 0.05,
};

export interface AtwTierDetails {
  tier: string;
  tierLevel: number;
  holdingCap: number;
  maxHoldingCap: number;
  score: number;
  clicks: number;
  ratingBonusClicks: number;
  effectiveClicks: number;
  isUnlimited: boolean;
  progressPercent: number;
  nextTierClicks: number | null;
}

export function getScoreIncrementForStars(starRating: number): number {
  const stars = Math.round(Number(starRating));
  return STAR_RATING_INCREMENTS[stars] ?? 0;
}

function parseAtwTierNumber(tierStr: unknown): number {
  const str = String(tierStr || "ATW1").trim();
  const match = str.match(/\d+/);
  if (!match) return 1;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(MAX_ATW_LEVEL, parsed) : 1;
}

/**
 * Canonical ATW progression formula matching SQL `compute_atw_level`:
 * - rating_bonus_clicks = FLOOR(GREATEST(0, COALESCE(score, 0.1) - 0.1) * 300)
 * - effective_clicks = GREATEST(0, clicks) + rating_bonus_clicks
 * - computed_level = effective_clicks >= 300 ? FLOOR(effective_clicks / 300) : 1
 * - level = LEAST(14, GREATEST(1, parsed_current_tier_num, computed_level))
 * - atw_tier = 'ATW' || level, holding_cap = level * 30000
 */
export function computeAtwTierDetails(params: {
  email?: string;
  clicks?: number | null;
  attentionWorthScore?: number | null;
  currentTier?: string | null;
  isAffiliate?: boolean | null;
  isCareer?: boolean | null;
}): AtwTierDetails {
  const cleanEmail = (params.email || "").toLowerCase().trim();
  const isUnlimited = Boolean(
    params.isAffiliate ||
      params.isCareer ||
      (cleanEmail && AFFILIATE_EMAILS.has(cleanEmail)),
  );

  const safeClicks = Math.max(0, Math.floor(Number(params.clicks || 0)));
  const rawScore = Math.max(
    DEFAULT_ATTENTION_WORTH_SCORE,
    Math.min(
      MAX_ATTENTION_WORTH_SCORE,
      Number(params.attentionWorthScore ?? DEFAULT_ATTENTION_WORTH_SCORE),
    ),
  );

  if (isUnlimited) {
    return {
      tier: "Unlimited",
      tierLevel: MAX_ATW_LEVEL,
      holdingCap: Number.MAX_SAFE_INTEGER,
      maxHoldingCap: Number.MAX_SAFE_INTEGER,
      score: Math.round(rawScore * 10000) / 10000,
      clicks: safeClicks,
      ratingBonusClicks: 0,
      effectiveClicks: safeClicks,
      isUnlimited: true,
      progressPercent: 100,
      nextTierClicks: null,
    };
  }

  const ratingBonusClicks = Math.floor(
    Math.max(0, rawScore - DEFAULT_ATTENTION_WORTH_SCORE) * CLICKS_PER_ATW_STEP,
  );
  const effectiveClicks = safeClicks + ratingBonusClicks;
  const computedLevel =
    effectiveClicks >= CLICKS_PER_ATW_STEP
      ? Math.floor(effectiveClicks / CLICKS_PER_ATW_STEP)
      : 1;
  const currentLevel = parseAtwTierNumber(params.currentTier);
  const tierLevel = Math.min(MAX_ATW_LEVEL, Math.max(1, currentLevel, computedLevel));
  const holdingCap = Math.min(MAX_ATW_HOLDING_CAP, tierLevel * HOLDING_CAP_PER_TIER);

  const nextLevelThreshold =
    tierLevel < MAX_ATW_LEVEL ? (tierLevel === 1 ? 600 : (tierLevel + 1) * CLICKS_PER_ATW_STEP) : null;
  const currentTierFloor = tierLevel <= 1 ? 0 : tierLevel * CLICKS_PER_ATW_STEP;
  const span = nextLevelThreshold !== null ? Math.max(1, nextLevelThreshold - currentTierFloor) : 1;
  const progressPercent =
    nextLevelThreshold === null
      ? 100
      : Math.max(0, Math.min(100, Math.round(((effectiveClicks - currentTierFloor) / span) * 100)));

  return {
    tier: `ATW${tierLevel}`,
    tierLevel,
    holdingCap,
    maxHoldingCap: MAX_ATW_HOLDING_CAP,
    score: Math.round(rawScore * 10000) / 10000,
    clicks: safeClicks,
    ratingBonusClicks,
    effectiveClicks,
    isUnlimited: false,
    progressPercent,
    nextTierClicks: nextLevelThreshold,
  };
}

export function getAtwBalanceLimit(params: {
  email?: string;
  clicks?: number | null;
  attentionWorthScore?: number | null;
  currentTier?: string | null;
  isAffiliate?: boolean | null;
  isCareer?: boolean | null;
}): number {
  return computeAtwTierDetails(params).holdingCap;
}
