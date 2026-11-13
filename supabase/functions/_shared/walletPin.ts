import { hashWalletPinEdge, verifyWalletPinEdge } from "./crypto.ts";

export const PIN_MAX_FAILED_ATTEMPTS = 5;
export const PIN_LOCKOUT_MINUTES = 45;
export const PIN_LOCKOUT_SECONDS = PIN_LOCKOUT_MINUTES * 60; // 2700s

export interface PinLockStatus {
  locked: boolean;
  attempts: number;
  remainingAttempts: number;
  secondsLeft: number;
  minsLeft: number;
  hasPin?: boolean;
}

export interface PinVerifyResult {
  valid: boolean;
  statusCode: number;
  error?: string;
  attemptsLeft?: number;
  retryAfter?: number;
}

function formatLockMessage(secondsLeft: number): {
  error: string;
  minsLeft: number;
  secondsLeft: number;
} {
  const safeSecs = Math.max(1, Math.ceil(secondsLeft));
  const minsLeft = Math.max(1, Math.ceil(safeSecs / 60));
  return {
    error: `Too many wrong PIN attempts. Wallet temporarily locked. Try again in ${minsLeft} minute${
      minsLeft === 1 ? "" : "s"
    }.`,
    minsLeft,
    secondsLeft: safeSecs,
  };
}

/**
 * Checks DB/user-scoped PIN lockout state via canonical RPC `check_wallet_pin_lockout(p_user_email)`
 * with direct `users.wallet_pin_failed_attempts` / `users.wallet_pin_locked_until` fallback.
 * Never reads spoofable IP headers or stores rate-limit state in volatile memory.
 */
export async function getPinLockoutStatusDb(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  email: string,
): Promise<PinLockStatus> {
  const cleanEmail = email.toLowerCase().trim();

  try {
    const { data, error } = await supabaseAdmin.rpc("check_wallet_pin_lockout", {
      p_user_email: cleanEmail,
    });
    if (!error && data) {
      const locked = Boolean(data.is_locked ?? data.locked);
      const secondsLeft = Math.max(0, Number(data.remaining_seconds ?? data.seconds_left ?? 0));
      const attempts = Math.max(0, Number(data.failed_attempts ?? data.attempts ?? 0));
      return {
        locked,
        attempts,
        remainingAttempts: Math.max(0, PIN_MAX_FAILED_ATTEMPTS - attempts),
        secondsLeft,
        minsLeft: Math.max(1, Math.ceil(secondsLeft / 60)),
        hasPin: data.has_pin !== undefined ? Boolean(data.has_pin) : undefined,
      };
    }
  } catch {
    // Fallback to direct users column read if RPC not yet deployed
  }

  try {
    const { data: uRow, error: uErr } = await supabaseAdmin
      .from("users")
      .select("wallet_pin_hash, wallet_pin_failed_attempts, wallet_pin_locked_until")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (!uErr && uRow) {
      const lockedMs = uRow.wallet_pin_locked_until
        ? new Date(uRow.wallet_pin_locked_until).getTime()
        : 0;
      const nowMs = Date.now();
      if (lockedMs > nowMs) {
        const secondsLeft = Math.ceil((lockedMs - nowMs) / 1000);
        const attempts = Math.max(
          PIN_MAX_FAILED_ATTEMPTS,
          Number(uRow.wallet_pin_failed_attempts || PIN_MAX_FAILED_ATTEMPTS),
        );
        return {
          locked: true,
          attempts,
          remainingAttempts: 0,
          secondsLeft,
          minsLeft: Math.max(1, Math.ceil(secondsLeft / 60)),
          hasPin: Boolean(uRow.wallet_pin_hash),
        };
      }
      const attempts = lockedMs && lockedMs <= nowMs
        ? 0
        : Math.max(0, Number(uRow.wallet_pin_failed_attempts || 0));
      return {
        locked: false,
        attempts,
        remainingAttempts: Math.max(0, PIN_MAX_FAILED_ATTEMPTS - attempts),
        secondsLeft: 0,
        minsLeft: 0,
        hasPin: Boolean(uRow.wallet_pin_hash),
      };
    }
  } catch {
    // Schema before lockout columns
  }

  return {
    locked: false,
    attempts: 0,
    remainingAttempts: PIN_MAX_FAILED_ATTEMPTS,
    secondsLeft: 0,
    minsLeft: 0,
  };
}

/**
 * Atomically records a PIN verification attempt (success or failure) via canonical RPC
 * `record_wallet_pin_attempt(p_user_email, p_success, p_max_attempts, p_lock_minutes)`
 * with direct column fallback on `public.users`.
 */
export async function recordPinAttemptDb(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  email: string,
  success: boolean,
): Promise<PinLockStatus> {
  const cleanEmail = email.toLowerCase().trim();

  try {
    const { data, error } = await supabaseAdmin.rpc("record_wallet_pin_attempt", {
      p_user_email: cleanEmail,
      p_success: success,
      p_max_attempts: PIN_MAX_FAILED_ATTEMPTS,
      p_lock_minutes: PIN_LOCKOUT_MINUTES,
    });
    if (!error && data) {
      const attempts = Math.max(0, Number(data.failed_attempts ?? (success ? 0 : 1)));
      const locked = Boolean(data.is_locked ?? (!success && attempts >= PIN_MAX_FAILED_ATTEMPTS));
      const secondsLeft = Math.max(
        0,
        Number(data.remaining_seconds ?? (locked ? PIN_LOCKOUT_SECONDS : 0)),
      );
      return {
        locked,
        attempts,
        remainingAttempts: Math.max(0, PIN_MAX_FAILED_ATTEMPTS - attempts),
        secondsLeft,
        minsLeft: locked ? Math.max(1, Math.ceil(secondsLeft / 60)) : 0,
      };
    }
  } catch {
    // Direct fallback below
  }

  try {
    if (success) {
      await supabaseAdmin
        .from("users")
        .update({
          wallet_pin_failed_attempts: 0,
          wallet_pin_locked_until: null,
        })
        .ilike("email", cleanEmail);

      return {
        locked: false,
        attempts: 0,
        remainingAttempts: PIN_MAX_FAILED_ATTEMPTS,
        secondsLeft: 0,
        minsLeft: 0,
      };
    }

    const { data: uRow } = await supabaseAdmin
      .from("users")
      .select("wallet_pin_failed_attempts, wallet_pin_locked_until")
      .ilike("email", cleanEmail)
      .maybeSingle();

    const prevLockedMs = uRow?.wallet_pin_locked_until
      ? new Date(uRow.wallet_pin_locked_until).getTime()
      : 0;
    const prevCount = prevLockedMs && prevLockedMs <= Date.now()
      ? 0
      : Math.max(0, Number(uRow?.wallet_pin_failed_attempts || 0));
    const nextCount = prevCount + 1;
    const isNowLocked = nextCount >= PIN_MAX_FAILED_ATTEMPTS;
    const lockedUntil = isNowLocked
      ? new Date(Date.now() + PIN_LOCKOUT_SECONDS * 1000).toISOString()
      : null;

    await supabaseAdmin
      .from("users")
      .update({
        wallet_pin_failed_attempts: nextCount,
        wallet_pin_locked_until: lockedUntil,
      })
      .ilike("email", cleanEmail);

    return {
      locked: isNowLocked,
      attempts: nextCount,
      remainingAttempts: Math.max(0, PIN_MAX_FAILED_ATTEMPTS - nextCount),
      secondsLeft: isNowLocked ? PIN_LOCKOUT_SECONDS : 0,
      minsLeft: isNowLocked ? PIN_LOCKOUT_MINUTES : 0,
    };
  } catch {
    // Ignore if columns absent before migration
  }

  return {
    locked: false,
    attempts: success ? 0 : 1,
    remainingAttempts: success ? PIN_MAX_FAILED_ATTEMPTS : PIN_MAX_FAILED_ATTEMPTS - 1,
    secondsLeft: 0,
    minsLeft: 0,
  };
}

/**
 * Verifies the user's 4-digit wallet PIN against stored `wallet_pin_hash` with
 * fail-closed enforcement and DB/user-scoped 5-attempt -> 45-min lockout protection.
 */
export async function verifyTransactionPinEdge(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  email: string,
  pin: unknown,
): Promise<PinVerifyResult> {
  const cleanEmail = email.toLowerCase().trim();

  const lock = await getPinLockoutStatusDb(supabaseAdmin, cleanEmail);
  if (lock.locked) {
    const msg = formatLockMessage(lock.secondsLeft);
    return {
      valid: false,
      statusCode: 429,
      error: msg.error,
      retryAfter: msg.secondsLeft,
    };
  }

  const pinStr = String(pin ?? "").trim();
  if (!/^\d{4}$/.test(pinStr)) {
    return {
      valid: false,
      statusCode: 400,
      error: "Valid 4-digit Wallet PIN is required to authorize this transaction.",
    };
  }

  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("wallet_pin_hash, passphrase")
    .ilike("email", cleanEmail)
    .maybeSingle();

  if (userErr || !user) {
    return {
      valid: false,
      statusCode: 404,
      error: "User account not found.",
    };
  }

  const directPinHash =
    typeof user.wallet_pin_hash === "string" ? user.wallet_pin_hash.trim() : "";
  const fallbackPass =
    typeof user.passphrase === "string" ? user.passphrase.trim() : "";
  const storedPinHash = directPinHash ||
    (fallbackPass.startsWith("pin:v1:") || fallbackPass.startsWith("hash:v1:")
      ? fallbackPass
      : "");

  // Fail closed when Wallet PIN has not been set up yet
  if (!storedPinHash) {
    return {
      valid: false,
      statusCode: 403,
      error: "Please set up your 4-digit Wallet PIN in Wallet Settings before transacting.",
    };
  }

  const isMatch = await verifyWalletPinEdge(pinStr, cleanEmail, storedPinHash);
  if (!isMatch) {
    const afterFail = await recordPinAttemptDb(supabaseAdmin, cleanEmail, false);
    if (afterFail.locked) {
      const msg = formatLockMessage(afterFail.secondsLeft);
      return {
        valid: false,
        statusCode: 429,
        error: msg.error,
        retryAfter: msg.secondsLeft,
      };
    }
    return {
      valid: false,
      statusCode: 401,
      error: `Incorrect Wallet PIN (${afterFail.remainingAttempts} attempt${
        afterFail.remainingAttempts === 1 ? "" : "s"
      } left before 45-min lockout).`,
      attemptsLeft: afterFail.remainingAttempts,
    };
  }

  await recordPinAttemptDb(supabaseAdmin, cleanEmail, true);
  return { valid: true, statusCode: 200 };
}

export async function hashAndFormatPin(pin: string, email: string): Promise<string> {
  return await hashWalletPinEdge(pin, email.toLowerCase().trim());
}
