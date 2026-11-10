import redisConnection, { isRedisReady } from "../redis";
import { verifyWalletPinAsync } from "./piiCrypto";

export const MAX_FAILED_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_SECONDS = 45 * 60; // 45 minutes

interface PinFailRecord {
  count: number;
  expiresAt: number;
}

const memoryPinFailStore = new Map<string, PinFailRecord>();

export function getPinAttemptBucket(email: string): string {
  return `wallet_pin_fail:${email.toLowerCase().trim()}`;
}

export async function getPinLockoutStatus(bucketKey: string): Promise<{
  locked: boolean;
  secondsLeft: number;
  minsLeft: number;
}> {
  const now = Date.now();

  if (isRedisReady()) {
    try {
      const rawCount = await redisConnection.get(bucketKey);
      const count = Number(rawCount || 0);
      if (count >= MAX_FAILED_PIN_ATTEMPTS) {
        const ttl = await redisConnection.ttl(bucketKey);
        const secondsLeft = ttl > 0 ? ttl : PIN_LOCKOUT_SECONDS;
        return {
          locked: true,
          secondsLeft,
          minsLeft: Math.max(1, Math.ceil(secondsLeft / 60)),
        };
      }
      return { locked: false, secondsLeft: 0, minsLeft: 0 };
    } catch {
      // Fallback to in-memory store
    }
  }

  const rec = memoryPinFailStore.get(bucketKey);
  if (!rec) return { locked: false, secondsLeft: 0, minsLeft: 0 };
  if (rec.expiresAt <= now) {
    memoryPinFailStore.delete(bucketKey);
    return { locked: false, secondsLeft: 0, minsLeft: 0 };
  }
  if (rec.count >= MAX_FAILED_PIN_ATTEMPTS) {
    const secondsLeft = Math.max(1, Math.ceil((rec.expiresAt - now) / 1000));
    return {
      locked: true,
      secondsLeft,
      minsLeft: Math.max(1, Math.ceil(secondsLeft / 60)),
    };
  }
  return { locked: false, secondsLeft: 0, minsLeft: 0 };
}

export async function recordFailedPinAttempt(bucketKey: string): Promise<{
  locked: boolean;
  attemptsRemaining: number;
  secondsLeft: number;
  minsLeft: number;
}> {
  const now = Date.now();

  if (isRedisReady()) {
    try {
      const count = await redisConnection.incr(bucketKey);
      if (count === 1 || count >= MAX_FAILED_PIN_ATTEMPTS) {
        await redisConnection.expire(bucketKey, PIN_LOCKOUT_SECONDS);
      }
      if (count >= MAX_FAILED_PIN_ATTEMPTS) {
        const ttl = await redisConnection.ttl(bucketKey);
        const secondsLeft = ttl > 0 ? ttl : PIN_LOCKOUT_SECONDS;
        return {
          locked: true,
          attemptsRemaining: 0,
          secondsLeft,
          minsLeft: Math.max(1, Math.ceil(secondsLeft / 60)),
        };
      }
      return {
        locked: false,
        attemptsRemaining: Math.max(0, MAX_FAILED_PIN_ATTEMPTS - count),
        secondsLeft: PIN_LOCKOUT_SECONDS,
        minsLeft: 15,
      };
    } catch {
      // Fallback to in-memory store
    }
  }

  const existing = memoryPinFailStore.get(bucketKey);
  let count = 1;
  let expiresAt = now + PIN_LOCKOUT_SECONDS * 1000;

  if (existing && existing.expiresAt > now) {
    count = existing.count + 1;
    expiresAt =
      count >= MAX_FAILED_PIN_ATTEMPTS ? now + PIN_LOCKOUT_SECONDS * 1000 : existing.expiresAt;
  }

  memoryPinFailStore.set(bucketKey, { count, expiresAt });

  if (count >= MAX_FAILED_PIN_ATTEMPTS) {
    const secondsLeft = Math.max(1, Math.ceil((expiresAt - now) / 1000));
    return {
      locked: true,
      attemptsRemaining: 0,
      secondsLeft,
      minsLeft: Math.max(1, Math.ceil(secondsLeft / 60)),
    };
  }

  return {
    locked: false,
    attemptsRemaining: Math.max(0, MAX_FAILED_PIN_ATTEMPTS - count),
    secondsLeft: PIN_LOCKOUT_SECONDS,
    minsLeft: 15,
  };
}

export async function clearFailedPinAttempts(bucketKey: string): Promise<void> {
  memoryPinFailStore.delete(bucketKey);
  if (isRedisReady()) {
    try {
      await redisConnection.del(bucketKey);
    } catch {}
  }
}

export interface VerifyPinResult {
  valid: boolean;
  error?: string;
  statusCode?: number;
  attemptsRemaining?: number;
  retryAfter?: number;
}

/**
 * Validates a user's wallet PIN against their stored hash with brute-force lockout protection.
 * If user has no PIN configured yet, behavior depends on requireIfConfigured:
 * - If requireIfConfigured is true and storedPinHash is null/empty, valid is true (grace period for unconfigured accounts).
 */
export async function verifyTransactionPin({
  email,
  pin,
  storedPinHash,
}: {
  email: string;
  pin?: string | null;
  storedPinHash?: string | null;
}): Promise<VerifyPinResult> {
  const cleanEmail = email.toLowerCase().trim();

  // If user has no PIN hash set in the database, allow transaction
  if (!storedPinHash) {
    return { valid: true };
  }

  // If PIN hash is set, user MUST provide a valid 4-digit PIN
  if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin.trim())) {
    return {
      valid: false,
      error: "4-digit Wallet PIN is required to authorize this transaction.",
      statusCode: 400,
    };
  }

  const bucketKey = getPinAttemptBucket(cleanEmail);

  // Check lockout
  const lockout = await getPinLockoutStatus(bucketKey);
  if (lockout.locked) {
    return {
      valid: false,
      error: `Too many wrong PIN attempts. Wallet temporarily locked. Try again in ${lockout.minsLeft} minute${
        lockout.minsLeft === 1 ? "" : "s"
      }.`,
      statusCode: 429,
      retryAfter: lockout.secondsLeft,
    };
  }

  // Verify hash
  const isValid = await verifyWalletPinAsync(pin.trim(), cleanEmail, storedPinHash);
  if (!isValid) {
    const failInfo = await recordFailedPinAttempt(bucketKey);
    if (failInfo.locked) {
      return {
        valid: false,
        error: `Too many wrong PIN attempts. Wallet locked for 45 minutes.`,
        statusCode: 429,
        retryAfter: failInfo.secondsLeft,
      };
    }
    return {
      valid: false,
      error: `Incorrect 4-digit Wallet PIN (${failInfo.attemptsRemaining} attempt${
        failInfo.attemptsRemaining === 1 ? "" : "s"
      } remaining).`,
      statusCode: 401,
      attemptsRemaining: failInfo.attemptsRemaining,
    };
  }

  // Clear attempts on success
  await clearFailedPinAttempts(bucketKey);
  return { valid: true };
}
