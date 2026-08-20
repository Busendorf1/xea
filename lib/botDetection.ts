/**
 * High-Scale Device-Agnostic Anti-Bot Mathematical Velocity & Entropy Engine.
 * 
 * Works seamlessly across all devices (Mobile, Laptops, Desktops, Trackpads, Mice)
 * by analyzing statistical dwell-time entropy and session endurance over a 20-ad sliding window.
 * 
 * Scalability: O(1) evaluation over fixed-size ring buffers, zero heavy table scans.
 */

export interface BotDetectionResult {
  isBotSuspect: boolean;
  reason?: string;
  cooldownType?: "pacing_15m" | "review_hours";
  cooldownDurationMinutes?: number;
  entropyStdDev?: number;
  averageIntervalSeconds?: number;
}

export interface UserEarningHistory {
  lastEarnTimestamps: number[]; // Epoch timestamps in milliseconds (ring buffer of last 20)
  consecutivePacingViolations: number;
  lastActiveAt?: string | Date;
}

/**
 * Calculates standard deviation (entropy variance) of inter-arrival dwell times.
 * Humans naturally produce high variance (sigma > 3.0s).
 * Bots and scripts exhibit tight, near-zero mechanical variance (sigma < 0.6s).
 */
export function calculateIntervalEntropy(timestamps: number[]): {
  meanIntervalSeconds: number;
  stdDevSeconds: number;
  intervals: number[];
} {
  if (!timestamps || timestamps.length < 2) {
    return { meanIntervalSeconds: 0, stdDevSeconds: 999, intervals: [] };
  }

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const deltaSec = (timestamps[i] - timestamps[i - 1]) / 1000;
    // Cap at 300s to avoid idle outliers skewing the rolling window
    intervals.push(Math.min(Math.max(deltaSec, 0), 300));
  }

  const count = intervals.length;
  const mean = intervals.reduce((acc, val) => acc + val, 0) / count;
  const variance = intervals.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  return {
    meanIntervalSeconds: mean,
    stdDevSeconds: stdDev,
    intervals,
  };
}

/**
 * Evaluates an incoming earning claim against the 20-ad sliding window.
 */
export function evaluateEarningVelocity(
  currentTimestampMs: number,
  history: UserEarningHistory
): BotDetectionResult {
  const timestamps = [...(history.lastEarnTimestamps || [])];
  
  // Enforce ring buffer of maximum 20 items
  if (timestamps.length >= 20) {
    timestamps.shift();
  }
  timestamps.push(currentTimestampMs);

  // 1. Minimum Inter-Ad Safety Guard
  if (timestamps.length >= 2) {
    const lastDeltaSec = (currentTimestampMs - timestamps[timestamps.length - 2]) / 1000;
    if (lastDeltaSec < 15.5) {
      return {
        isBotSuspect: true,
        reason: "Sub-minimum dwell time detected between ad claims.",
        cooldownType: "pacing_15m",
        cooldownDurationMinutes: 15,
      };
    }
  }

  // 2. Sliding Window Entropy Analysis (Evaluated at 20 consecutive items)
  if (timestamps.length >= 20) {
    const { meanIntervalSeconds, stdDevSeconds } = calculateIntervalEntropy(timestamps);

    // If 20 consecutive ads were completed with robotic consistency (mean near 16s and stdDev < 0.6s)
    const isUltraFastPaced = meanIntervalSeconds <= 20.0;
    const isSyntheticVariance = stdDevSeconds < 0.65;

    if (isUltraFastPaced && isSyntheticVariance) {
      const isRepeatedOffender = (history.consecutivePacingViolations || 0) >= 1;
      
      if (isRepeatedOffender) {
        return {
          isBotSuspect: true,
          reason: "Repeated mechanical velocity loops detected across sessions.",
          cooldownType: "review_hours",
          cooldownDurationMinutes: 48 * 60, // 48 hours (escalates to 72h if inactive)
          entropyStdDev: stdDevSeconds,
          averageIntervalSeconds: meanIntervalSeconds,
        };
      }

      return {
        isBotSuspect: true,
        reason: "Continuous minimum-interval pacing loop detected across 20 ads.",
        cooldownType: "pacing_15m",
        cooldownDurationMinutes: 15,
        entropyStdDev: stdDevSeconds,
        averageIntervalSeconds: meanIntervalSeconds,
      };
    }
  }

  return {
    isBotSuspect: false,
  };
}
