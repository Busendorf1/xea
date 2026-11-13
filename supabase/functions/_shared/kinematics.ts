export interface KinematicVector {
  type?: string;
  durationMs?: number;
  sampleCount?: number;
  xDelta?: number;
  yDelta?: number;
  velocityVariance?: number;
  jitterEntropy?: number;
  isTrusted?: boolean;
  maxVelocity?: number;
  minVelocity?: number;
  pressureVariance?: number;
}

export interface KinematicsEvaluationResult {
  isHuman: boolean;
  botScore: number;
  reasons: string[];
}

/**
 * Evaluates Proof-of-Humanity (PoH) kinematic vectors before consuming tokens or earn locks.
 * Bot score >= 65 indicates automated/bot interaction and is rejected.
 */
export function evaluateKinematics(
  rawVectors: unknown,
): KinematicsEvaluationResult {
  const reasons: string[] = [];
  let botScore = 0;

  if (!Array.isArray(rawVectors) || rawVectors.length === 0) {
    return {
      isHuman: false,
      botScore: 100,
      reasons: ["Missing kinematic interaction vectors"],
    };
  }

  const vectors = rawVectors as KinematicVector[];
  const untrustedCount = vectors.filter((v) => v?.isTrusted === false).length;
  if (untrustedCount > 0) {
    botScore += 45;
    reasons.push("Untrusted synthetic input events detected");
  }

  let hasMeaningfulGesture = false;
  let zeroJitterCount = 0;

  for (const v of vectors) {
    const kind = String(v?.type || "").toLowerCase();
    const duration = Number(v?.durationMs ?? 0);
    const samples = Number(v?.sampleCount ?? 0);
    const xDelta = Math.abs(Number(v?.xDelta ?? 0));
    const velVar = Number(v?.velocityVariance ?? -1);
    const jitter = Number(v?.jitterEntropy ?? -1);

    if (kind === "hold") {
      if (duration < 250 || samples < 3) {
        botScore += 30;
        reasons.push("Hold gesture too short or lacking sensor samples");
      } else {
        hasMeaningfulGesture = true;
      }
    } else if (kind === "swipe" || kind === "scroll") {
      if (duration < 80 || (samples < 2 && xDelta < 12)) {
        botScore += 25;
        reasons.push("Swipe gesture mechanically instantaneous");
      } else {
        hasMeaningfulGesture = true;
      }
    } else if (kind === "tap" || kind === "click") {
      if (duration > 0 && duration < 18) {
        botScore += 25;
        reasons.push("Zero-millisecond robotic tap timing");
      } else {
        hasMeaningfulGesture = true;
      }
    } else if (duration >= 100 || samples >= 2 || xDelta >= 8) {
      hasMeaningfulGesture = true;
    }

    if (velVar === 0 || jitter === 0) {
      zeroJitterCount += 1;
    }
  }

  if (!hasMeaningfulGesture) {
    botScore += 35;
    reasons.push("Insufficient human motion signal in vectors");
  }

  if (zeroJitterCount > 0 && vectors.length > 0 && zeroJitterCount === vectors.length) {
    botScore += 30;
    reasons.push("Zero micro-jitter / constant-velocity linear path");
  }

  if (vectors.length >= 2) {
    const durations = vectors.map((v) => Number(v?.durationMs ?? -1)).filter((d) => d >= 0);
    if (durations.length >= 3 && new Set(durations).size === 1) {
      botScore += 35;
      reasons.push("Identical repeated gesture durations");
    }
  }

  const boundedScore = Math.max(0, Math.min(100, botScore));
  return {
    isHuman: boundedScore < 65,
    botScore: boundedScore,
    reasons,
  };
}
