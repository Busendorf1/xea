/**
 * Shared 15-day profile edit cooldown calculation.
 * Pure & deterministic so SSR, client timers, API routes, and tests match identically.
 */

export const PROFILE_EDIT_COOLDOWN_DAYS = 15;
export const PROFILE_EDIT_COOLDOWN_MS = PROFILE_EDIT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;

export interface ProfileEditCooldownInput {
  hasUpdatedProfile?: boolean | null;
  lastUpdated?: string | number | Date | null;
  isAdmin?: boolean;
  nowMs?: number;
}

export interface ProfileEditCooldownState {
  isLocked: boolean;
  isEditable: boolean;
  msRemaining: number;
  /** Whole ceiling days remaining (e.g. 14d 2h -> 15, 0d 5h -> 1, 0 -> 0) */
  daysRemaining: number;
  /** Exact floored day component for countdown display (e.g. 14 in "14d 23h") */
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  nextAvailableMs: number | null;
  nextAvailableIso: string | null;
  /** Compact label for Edit button pill, e.g. "14d 23h" or "5h 12m" or "45s" */
  buttonCountdownLabel: string | null;
  /** Descriptive label, e.g. "15 days left (14d 23h remaining)" */
  detailedLabel: string | null;
}

export function getProfileEditCooldownState(
  input: ProfileEditCooldownInput
): ProfileEditCooldownState {
  const unlocked: ProfileEditCooldownState = {
    isLocked: false,
    isEditable: true,
    msRemaining: 0,
    daysRemaining: 0,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    nextAvailableMs: null,
    nextAvailableIso: null,
    buttonCountdownLabel: null,
    detailedLabel: null,
  };

  if (input.isAdmin || !input.hasUpdatedProfile || !input.lastUpdated) {
    return unlocked;
  }

  const lastUpdatedMs =
    input.lastUpdated instanceof Date
      ? input.lastUpdated.getTime()
      : typeof input.lastUpdated === "number"
      ? input.lastUpdated
      : new Date(input.lastUpdated).getTime();

  if (!Number.isFinite(lastUpdatedMs) || lastUpdatedMs <= 0) {
    return unlocked;
  }

  const nowMs = typeof input.nowMs === "number" && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const nextAvailableMs = lastUpdatedMs + PROFILE_EDIT_COOLDOWN_MS;
  const diff = nextAvailableMs - nowMs;

  if (diff <= 0) {
    return unlocked;
  }

  const totalSeconds = Math.ceil(diff / 1000);
  const days = Math.floor(diff / DAY_MS);
  const hours = Math.floor((diff % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((diff % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((diff % MINUTE_MS) / 1000);
  const daysRemaining = Math.ceil(diff / DAY_MS);

  let buttonCountdownLabel: string;
  if (days >= 1) {
    buttonCountdownLabel = `${days}d ${hours}h`;
  } else if (hours >= 1) {
    buttonCountdownLabel = `${hours}h ${minutes}m`;
  } else if (minutes >= 1) {
    buttonCountdownLabel = `${minutes}m ${seconds}s`;
  } else {
    buttonCountdownLabel = `${Math.max(1, totalSeconds)}s`;
  }

  const dayWord = daysRemaining === 1 ? "day" : "days";
  const detailedLabel =
    days >= 1
      ? `${daysRemaining} ${dayWord} left (${days}d ${hours}h remaining)`
      : hours >= 1
      ? `Under 1 day left (${hours}h ${minutes}m remaining)`
      : `Less than 1 hour left (${minutes}m ${seconds}s remaining)`;

  return {
    isLocked: true,
    isEditable: false,
    msRemaining: diff,
    daysRemaining,
    days,
    hours,
    minutes,
    seconds,
    nextAvailableMs,
    nextAvailableIso: new Date(nextAvailableMs).toISOString(),
    buttonCountdownLabel,
    detailedLabel,
  };
}
