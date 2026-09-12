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

/**
 * Computes maximum wallet balance holding limit based on user's ATW tier level.
 * NB: ATW is exclusively for wallet balance holding caps; users should always maintain low balances.
 * Level 1 (ATW1) = ₦30,000 (~$20 USD)
 * Level 2 (ATW2) = ₦60,000 (~$40 USD)
 * Level 3 (ATW3) = ₦90,000 (~$60 USD) [Maximum Cap].
 */
export function getAtwBalanceLimit(atwTier?: string | null, isAdmin?: boolean): number {
  if (isAdmin) return Infinity;
  if (!atwTier) return 30000;
  const match = atwTier.match(/\d+/);
  const levelNum = match ? parseInt(match[0], 10) : 1;
  const safeLevel = Math.min(3, Math.max(1, levelNum));
  return safeLevel * 30000;
}
