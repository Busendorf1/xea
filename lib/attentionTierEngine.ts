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
  { code: "ATW3", minScore: 5000, maxScore: 10000, name: "Silver", badgeColor: "#94a3b8" },
  { code: "ATW4", minScore: 10000, maxScore: 20000, name: "Gold", badgeColor: "#eab308" },
  { code: "ATW5", minScore: 20000, maxScore: 30000, name: "Platinum", badgeColor: "#38bdf8" },
  { code: "ATW6", minScore: 30000, maxScore: 40000, name: "Diamond", badgeColor: "#a855f7" },
  { code: "ATW7", minScore: 40000, maxScore: 50000, name: "Master", badgeColor: "#ec4899" },
  { code: "ATW8", minScore: 50000, maxScore: 70000, name: "Grandmaster", badgeColor: "#f43f5e" },
  { code: "ATW9", minScore: 70000, maxScore: 90000, name: "Elite", badgeColor: "#ef4444" },
  { code: "ATW10", minScore: 90000, maxScore: 150000, name: "Champion", badgeColor: "#10b981" },
  { code: "ATW11", minScore: 150000, maxScore: 250000, name: "Legend", badgeColor: "#06b6d4" },
  { code: "ATW12", minScore: 250000, maxScore: 500000, name: "Mythic", badgeColor: "#6366f1" },
  { code: "ATW13", minScore: 500000, maxScore: 1000000, name: "Titan", badgeColor: "#8b5cf6" },
  { code: "ATW14", minScore: 1000000, maxScore: Infinity, name: "Sovereign", badgeColor: "#f59e0b" },
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
 * Each ATW level increases the account balance limit by ₦100,000.
 * Level 1 (ATW1) = ₦100,000, Level 2 (ATW2) = ₦200,000, ..., Level 14 (ATW14) = ₦1,400,000.
 */
export function getAtwBalanceLimit(atwTier?: string | null, isAdmin?: boolean): number {
  if (isAdmin) return Infinity;
  if (!atwTier) return 100000;
  const match = atwTier.match(/\d+/);
  const levelNum = match ? parseInt(match[0], 10) : 1;
  const safeLevel = Math.max(1, levelNum);
  return safeLevel * 100000;
}
