/**
 * Shared Frequency Cap bounds, non-linear slider scale (1..20,000x), and
 * audience daily-view pace helpers used across create-ad, boost, capacity estimation,
 * validation schemas, and API routes.
 */

export const MIN_FREQUENCY_CAP = 1;
export const SLIDER_MAX_FREQUENCY_CAP = 20_000;
export const MAX_FREQUENCY_CAP = 5_000_000;
export const FREQUENCY_CAP_SLIDER_MAX_POS = 1_000;
export const FREQUENCY_CAP_PRESETS: readonly number[] = [
  1,
  5,
  25,
  100,
  1_000,
  5_000,
  20_000,
];

const SLIDER_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [250, 25],
  [500, 250],
  [750, 2_500],
  [1_000, SLIDER_MAX_FREQUENCY_CAP],
];

export function clampFrequencyCap(value: unknown, fallback = 1): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < MIN_FREQUENCY_CAP) {
    return Math.max(MIN_FREQUENCY_CAP, Math.min(MAX_FREQUENCY_CAP, Math.floor(fallback) || 1));
  }
  return Math.min(MAX_FREQUENCY_CAP, n);
}

/**
 * Maps a slider position in [0, 1000] onto [1, 20_000] using a piecewise-linear
 * curve so low caps (1..25) stay easy to select while still reaching 20,000x.
 */
export function sliderPosToFreqCap(pos: number): number {
  const clamped = Math.max(0, Math.min(FREQUENCY_CAP_SLIDER_MAX_POS, Number(pos) || 0));
  for (let i = 0; i < SLIDER_ANCHORS.length - 1; i++) {
    const [p0, v0] = SLIDER_ANCHORS[i];
    const [p1, v1] = SLIDER_ANCHORS[i + 1];
    if (clamped <= p1) {
      const t = (clamped - p0) / (p1 - p0);
      return Math.max(MIN_FREQUENCY_CAP, Math.min(SLIDER_MAX_FREQUENCY_CAP, Math.round(v0 + t * (v1 - v0))));
    }
  }
  return SLIDER_MAX_FREQUENCY_CAP;
}

/**
 * Inverse mapping from a frequency cap value to [0, 1000] for the slider thumb.
 * Manual values above 20,000x pin cleanly at the top of the slider track (1000).
 */
export function freqCapToSliderPos(freqCap: number): number {
  const clamped = Math.max(
    MIN_FREQUENCY_CAP,
    Math.min(SLIDER_MAX_FREQUENCY_CAP, Math.round(Number(freqCap) || 1))
  );
  for (let i = 0; i < SLIDER_ANCHORS.length - 1; i++) {
    const [p0, v0] = SLIDER_ANCHORS[i];
    const [p1, v1] = SLIDER_ANCHORS[i + 1];
    if (clamped <= v1) {
      const t = (clamped - v0) / (v1 - v0);
      return Math.round(p0 + t * (p1 - p0));
    }
  }
  return FREQUENCY_CAP_SLIDER_MAX_POS;
}

export interface AudienceDailyViewSummary {
  targetAttentions: number;
  campaignDays: number;
  frequencyCap: number;
  effectiveCapPerUser: number;
  approxDailyAttentions: number;
  maxViewsPerViewerPerDay: number;
  minUniqueAudience: number;
  maxUniqueAudience: number;
}

/**
 * Computes approximate daily delivery & audience load for a given target attention count,
 * duration in days, and per-user frequency cap so advertisers can sanity-check pacing.
 */
export function computeAudienceDailyViewSummary(
  targetAttentionsInput: number,
  campaignDaysInput: number,
  frequencyCapInput: number
): AudienceDailyViewSummary {
  const targetAttentions = Math.max(0, Math.floor(Number(targetAttentionsInput) || 0));
  const campaignDays = Math.max(1, Math.min(90, Math.floor(Number(campaignDaysInput) || 1)));
  const frequencyCap = clampFrequencyCap(frequencyCapInput, 1);
  const effectiveCapPerUser =
    targetAttentions > 0 ? Math.min(frequencyCap, targetAttentions) : frequencyCap;
  const approxDailyAttentions =
    targetAttentions > 0 ? Math.ceil(targetAttentions / campaignDays) : 0;
  const maxViewsPerViewerPerDay = Math.max(1, Math.ceil(effectiveCapPerUser / campaignDays));
  const minUniqueAudience =
    targetAttentions > 0 ? Math.max(1, Math.ceil(targetAttentions / Math.max(1, effectiveCapPerUser))) : 0;

  return {
    targetAttentions,
    campaignDays,
    frequencyCap,
    effectiveCapPerUser,
    approxDailyAttentions,
    maxViewsPerViewerPerDay,
    minUniqueAudience,
    maxUniqueAudience: targetAttentions,
  };
}
