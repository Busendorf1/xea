import redisConnection, { isRedisReady } from "../redis";
import { verifyWalletPinAsync } from "./piiCrypto";

export const MAX_FAILED_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_SECONDS = 45 * 60; // 45 minutes
export const PIN_LOCKOUT_MINUTES = Math.ceil(PIN_LOCKOUT_SECONDS / 60); // 45 minutes

// Atomic Redis Lua script: increments failure count, sets/resets TTL on first attempt or lockout trigger,
// and returns [count, ttlSeconds] in a single round-trip with zero INCR/EXPIRE race condition.
const ATOMIC_PIN_FAIL_LUA = `
local current = redis.call("INCR", KEYS[1])
local maxAttempts = tonumber(ARGV[1])
local lockoutSecs = tonumber(ARGV[2])
if current == 1 or current >= maxAttempts then
  redis.call("EXPIRE", KEYS[1], lockoutSecs)
end
local ttl = redis.call("TTL", KEYS[1])
if ttl < 0 then
  redis.call("EXPIRE", KEYS[1], lockoutSecs)
  ttl = lockoutSecs
end
return { current, ttl }
`;

interface PinFailRecord {
  count: number;
  expiresAt: number;
}

const memoryPinFailStore = new Map<string, PinFailRecord>();

export function getPinAttemptBucket(email: string): string {
  return `wallet_pin_fail:${email.toLowerCase().trim()}`;
}

export function getPinResetAttemptBucket(email: string): string {
  return `wallet_pin_reset_fail:${email.toLowerCase().trim()}`;
}

/**
 * Resolves the stored Wallet PIN hash from either `wallet_pin_hash` or the zero-downtime
 * `passphrase` fallback (`pin:v1:...`), keeping the `pin:v1:` prefix intact for verification.
 */
export function resolveStoredWalletPinHash(
  userRow?: { wallet_pin_hash?: string | null; passphrase?: string | null } | null
): string | null {
  if (!userRow) return null;
  const direct = typeof userRow.wallet_pin_hash === "string" ? userRow.wallet_pin_hash.trim() : "";
  if (direct) return direct;
  const fallbackPass = typeof userRow.passphrase === "string" ? userRow.passphrase.trim() : "";
  if (fallbackPass.startsWith("pin:v1:")) return fallbackPass;
  return null;
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
      let count = 0;
      let ttl = -1;
      if (typeof (redisConnection as any).eval === "function") {
        const evalRes = await (redisConnection as any).eval(
          ATOMIC_PIN_FAIL_LUA,
          1,
          bucketKey,
          String(MAX_FAILED_PIN_ATTEMPTS),
          String(PIN_LOCKOUT_SECONDS)
        );
        if (Array.isArray(evalRes)) {
          count = Number(evalRes[0] || 0);
          ttl = Number(evalRes[1] ?? PIN_LOCKOUT_SECONDS);
        }
      }
      if (!count) {
        count = await redisConnection.incr(bucketKey);
        if (count === 1 || count >= MAX_FAILED_PIN_ATTEMPTS) {
          await redisConnection.expire(bucketKey, PIN_LOCKOUT_SECONDS);
        }
        ttl = count >= MAX_FAILED_PIN_ATTEMPTS ? await redisConnection.ttl(bucketKey) : PIN_LOCKOUT_SECONDS;
      }

      if (count >= MAX_FAILED_PIN_ATTEMPTS) {
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
        minsLeft: PIN_LOCKOUT_MINUTES,
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
    minsLeft: PIN_LOCKOUT_MINUTES,
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
  code?: string;
  attemptsRemaining?: number;
  retryAfter?: number;
}

/**
 * Validates a user's wallet PIN against their stored hash with brute-force lockout protection.
 * Fails closed whenever the user has not configured a Wallet PIN.
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

  // Fail closed: never allow wallet spend, transfer, or withdrawal without a configured Wallet PIN
  if (!storedPinHash || typeof storedPinHash !== "string" || storedPinHash.trim() === "") {
    return {
      valid: false,
      error: "Wallet PIN is not set. Please set up your 4-digit Wallet PIN before making transactions.",
      statusCode: 403,
      code: "PIN_NOT_SET",
    };
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
