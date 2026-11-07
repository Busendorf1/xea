export interface AtwTierDef {
  code: string;
  minScore: number;
  maxScore: number;
  name: string;
  badgeColor: string;
}

export const ATW_TIERS: AtwTierDef[] = [
  { code: "ATW1", minScore: 100, maxScore: 1000, name: "Entry", badgeColor: "#9ca3af" },
  { code: "ATW2", minScore: 1000, maxScore: 5000, name: "Bronze", badgeColor: "#d97706" },
  { code: "ATW3", minScore: 5000, maxScore: Infinity, name: "Silver", badgeColor: "#94a3b8" },
];

export const STAR_RATING_INCREMENTS: Record<number, number> = {
  1: 0.01,
  2: 0.02,
  3: 0.03,
  4: 0.04,
  5: 0.05,
};

export const MAX_ATTENTION_SCORE = 1000000.0;

export function resolveAtwTier(score: number): AtwTierDef {
  const normalizedScore = Number(score) || 0.1;
  const matched = ATW_TIERS.slice().reverse().find((tier) => normalizedScore >= tier.minScore);
  return matched || ATW_TIERS[0];
}

export function getScoreIncrementForStars(stars: number): number {
  const validStars = Math.min(5, Math.max(1, Math.round(stars)));
  return STAR_RATING_INCREMENTS[validStars] || 0.01;
}

export interface ComputedAtwTierDetails {
  tierCode: string;
  level: number;
  isUnlimited: boolean;
  holdingCap: number;
  holdingCapFormatted: string;
  currentMilestoneTarget: number;
  clicksRemaining: number;
  clicksPercent: number;
  nextTierCode: string;
  nextAtwLevel: number;
  nextHoldingCap: number;
}

/**
 * Computes ATW tier progression from live seen/click count (300 clicks per step:
 * 300 -> ATW1, 600 -> ATW2, 900 -> ATW3, 1200 -> ATW4, etc.) and holding balance cap
 * (₦30,000 per ATW step, or Unlimited for Admin / Exempt accounts).
 */
export function computeAtwTierDetails(
  clicks: number,
  existingTier?: string | null,
  isAdminOrExempt?: boolean
): ComputedAtwTierDetails {
  const safeClicks = Math.max(0, Number(clicks) || 0);
  const currentMilestoneTarget =
    safeClicks < 300 ? 300 : (Math.floor(safeClicks / 300) + 1) * 300;
  const clicksRemaining = Math.max(0, currentMilestoneTarget - safeClicks);
  const stepBase = safeClicks < 300 ? 0 : Math.floor(safeClicks / 300) * 300;
  const clicksPercent = Math.min(
    100,
    Math.max(0, Math.round(((safeClicks - stepBase) / 300) * 100))
  );

  const levelFromClicks = safeClicks >= 300 ? Math.floor(safeClicks / 300) : 1;
  const parsedTierMatch = String(existingTier || "").match(/\d+/);
  const parsedTierLevel = parsedTierMatch ? parseInt(parsedTierMatch[0], 10) : 1;
  const level = Math.max(1, parsedTierLevel, levelFromClicks);
  const nextAtwLevel = safeClicks < 300 ? 1 : level + 1;
  const nextHoldingCap = nextAtwLevel * 30000;

  const isUnlimited = Boolean(
    isAdminOrExempt ||
      String(existingTier || "").toLowerCase() === "unlimited" ||
      String(existingTier || "").toLowerCase() === "atw unlimited"
  );

  const holdingCap = isUnlimited ? Infinity : level * 30000;
  const holdingCapFormatted = isUnlimited
    ? "Unlimited"
    : `₦${holdingCap.toLocaleString()}`;
  const tierCode = isUnlimited ? "Unlimited" : `ATW${level}`;
  const nextTierCode = isUnlimited ? "Unlimited" : `ATW${nextAtwLevel}`;

  return {
    tierCode,
    level,
    isUnlimited,
    holdingCap,
    holdingCapFormatted,
    currentMilestoneTarget,
    clicksRemaining,
    clicksPercent,
    nextTierCode,
    nextAtwLevel,
    nextHoldingCap,
  };
}

/**
 * Computes maximum wallet balance holding limit based on user's ATW tier level & clicks.
 * Every 300 clicks advances the tier by 1 step (+₦30,000 holding cap per step).
 * Admins / Exempt accounts have an Unlimited holding balance cap (Infinity).
 */
export function getAtwBalanceLimit(
  atwTier?: string | null,
  isAdmin?: boolean,
  clicks?: number
): number {
  if (
    isAdmin ||
    String(atwTier || "").toLowerCase() === "unlimited" ||
    String(atwTier || "").toLowerCase() === "atw unlimited"
  ) {
    return Infinity;
  }
  const safeClicks = Math.max(0, Number(clicks) || 0);
  const levelFromClicks = safeClicks >= 300 ? Math.floor(safeClicks / 300) : 1;
  const match = String(atwTier || "").match(/\d+/);
  const levelNum = match ? parseInt(match[0], 10) : 1;
  const safeLevel = Math.max(1, levelNum, levelFromClicks);
  return safeLevel * 30000;
}
