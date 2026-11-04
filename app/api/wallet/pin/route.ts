import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { getClientIp } from "@/lib/edgeRateLimit";
import {
  hashWalletPinAsync,
  verifyWalletPinAsync,
  decryptSensitiveField,
} from "@/lib/security/piiCrypto";

export const dynamic = "force-dynamic";

const MAX_FAILED_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_SECONDS = 15 * 60; // 15 minutes (900 seconds)

interface PinFailRecord {
  count: number;
  expiresAt: number;
}

const memoryPinFailStore = new Map<string, PinFailRecord>();

async function getPinLockoutStatus(bucketKey: string): Promise<{
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
      // Fallback to in-memory store below
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

async function recordFailedPinAttempt(bucketKey: string): Promise<{
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
      // Fallback to in-memory store below
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

async function clearFailedPinAttempts(bucketKey: string): Promise<void> {
  memoryPinFailStore.delete(bucketKey);
  if (isRedisReady()) {
    try {
      await redisConnection.del(bucketKey);
    } catch {}
  }
}

function formatTryAgainMins(mins: number): string {
  const safeMins = Math.max(1, Math.ceil(mins));
  return `${safeMins} min${safeMins === 1 ? "" : "s"}`;
}

// Circuit-breaker timestamp if `wallet_pin_hash` column is not yet present in DB
let walletPinColumnMissingUntil = 0;

function normalizePhoneLast10(phone: string | null | undefined): string {
  if (!phone) return "";
  const decrypted = decryptSensitiveField(phone) || String(phone);
  if (decrypted.startsWith("PLACEHOLDER")) return "";
  return decrypted.replace(/\D/g, "").slice(-10);
}

function extractStoredPinHash(userRow: Record<string, any> | null): string {
  if (!userRow) return "";
  const direct = typeof userRow.wallet_pin_hash === "string" ? userRow.wallet_pin_hash.trim() : "";
  if (direct) return direct;
  const fallbackPass = typeof userRow.passphrase === "string" ? userRow.passphrase.trim() : "";
  if (fallbackPass.startsWith("pin:v1:")) return fallbackPass;
  return "";
}

async function fetchUserForPin(emailLower: string): Promise<{
  user: Record<string, any> | null;
  usePassphraseFallback: boolean;
  error: any;
}> {
  const skipDedicatedCol = Date.now() < walletPinColumnMissingUntil;

  if (!skipDedicatedCol) {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, email, phone, username, passphrase, wallet_pin_hash")
      .eq("email", emailLower)
      .maybeSingle();

    if (!error) {
      return { user: data, usePassphraseFallback: false, error: null };
    }

    if (error.code === "42703" || String(error.message || "").includes("wallet_pin_hash")) {
      walletPinColumnMissingUntil = Date.now() + 10 * 60 * 1000;
    } else {
      return { user: null, usePassphraseFallback: false, error };
    }
  }

  // Seamless zero-downtime fallback using `passphrase` column (`pin:v1:...`)
  const { data: fbData, error: fbErr } = await supabaseAdmin
    .from("users")
    .select("id, email, phone, username, passphrase")
    .eq("email", emailLower)
    .maybeSingle();

  return { user: fbData, usePassphraseFallback: true, error: fbErr };
}

async function saveUserPinHash(
  userId: string,
  hashedPin: string,
  usePassphraseFallback: boolean
): Promise<{ error: any }> {
  if (!usePassphraseFallback) {
    const { error } = await supabaseAdmin
      .from("users")
      .update({ wallet_pin_hash: hashedPin })
      .eq("id", userId);

    if (!error) return { error: null };

    if (error.code === "42703" || String(error.message || "").includes("wallet_pin_hash")) {
      walletPinColumnMissingUntil = Date.now() + 10 * 60 * 1000;
    } else {
      return { error };
    }
  }

  const { error: fbErr } = await supabaseAdmin
    .from("users")
    .update({ passphrase: hashedPin })
    .eq("id", userId);

  return { error: fbErr };
}

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const emailLower = email.toLowerCase().trim();

    const { user, error } = await fetchUserForPin(emailLower);
    if (error) {
      return NextResponse.json({ hasPin: false });
    }

    const storedPinHash = extractStoredPinHash(user);
    return NextResponse.json({ hasPin: Boolean(storedPinHash) });
  } catch {
    return NextResponse.json({ hasPin: false });
  }
}

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const emailLower = email.toLowerCase().trim();
    const clientIp = getClientIp(req);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();

    const pinAttemptBucket = `wallet_pin_fail:${emailLower}:${clientIp}`;
    const resetAttemptBucket = `wallet_pin_reset_fail:${emailLower}:${clientIp}`;

    // Check active lockout for PIN verification / change
    if (action === "verify" || action === "change") {
      const lockStatus = await getPinLockoutStatus(pinAttemptBucket);
      if (lockStatus.locked) {
        return NextResponse.json(
          {
            error: `Too many wrong PIN attempts. Try again in ${formatTryAgainMins(lockStatus.minsLeft)}.`,
            retryAfter: lockStatus.secondsLeft,
            retryAfterMinutes: lockStatus.minsLeft,
          },
          { status: 429 }
        );
      }
    }

    // Check active lockout for Forgot PIN reset
    if (action === "reset") {
      const resetLockStatus = await getPinLockoutStatus(resetAttemptBucket);
      if (resetLockStatus.locked) {
        return NextResponse.json(
          {
            error: `Too many failed reset attempts. Try again in ${formatTryAgainMins(resetLockStatus.minsLeft)}.`,
            retryAfter: resetLockStatus.secondsLeft,
            retryAfterMinutes: resetLockStatus.minsLeft,
          },
          { status: 429 }
        );
      }
    }

    const { user, usePassphraseFallback, error: fetchErr } = await fetchUserForPin(emailLower);

    if (fetchErr) {
      console.error("[WalletPIN] Profile lookup error:", fetchErr);
      return NextResponse.json(
        { error: "Unable to process Wallet PIN request right now. Please try again." },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const storedPinHash = extractStoredPinHash(user);
    const hasExistingPin = Boolean(storedPinHash);

    // -------------------------------------------------------------------------
    // 1. INITIAL PIN SETUP (First time user clicks the Eye icon)
    // -------------------------------------------------------------------------
    if (action === "setup") {
      if (hasExistingPin) {
        return NextResponse.json(
          { error: "A Wallet PIN is already set for this account. Please enter your PIN or use 'Forgot PIN?'." },
          { status: 400 }
        );
      }

      const pin = String(body?.pin || "").trim();
      const confirmPin = String(body?.confirmPin ?? pin).trim();

      if (!/^\d{4}$/.test(pin)) {
        return NextResponse.json({ error: "Wallet PIN must be a 4-digit number (0-9)." }, { status: 400 });
      }
      if (pin !== confirmPin) {
        return NextResponse.json({ error: "PIN and confirmation PIN do not match." }, { status: 400 });
      }

      const hashedPin = await hashWalletPinAsync(pin, emailLower);
      const { error: updateErr } = await saveUserPinHash(user.id, hashedPin, usePassphraseFallback);

      if (updateErr) {
        console.error("[WalletPIN] Setup update error:", updateErr);
        return NextResponse.json(
          { error: "Could not save your Wallet PIN right now. Please try again." },
          { status: 500 }
        );
      }

      await clearFailedPinAttempts(pinAttemptBucket);
      await invalidateCachedProfile(emailLower);
      return NextResponse.json({
        success: true,
        hasPin: true,
        verified: true,
        message: "Wallet PIN created and wallet unlocked.",
      });
    }

    // -------------------------------------------------------------------------
    // 2. VERIFY PIN (Unlock balance, Send Money, Withdraw)
    // -------------------------------------------------------------------------
    if (action === "verify") {
      if (!hasExistingPin) {
        return NextResponse.json(
          { error: "PIN_NOT_SET", hasPin: false, message: "Please set your initial 4-digit Wallet PIN first." },
          { status: 400 }
        );
      }

      const pin = String(body?.pin || "").trim();
      if (!/^\d{4}$/.test(pin)) {
        return NextResponse.json({ error: "Please enter a valid 4-digit PIN." }, { status: 400 });
      }

      const isValid = await verifyWalletPinAsync(pin, emailLower, storedPinHash);
      if (!isValid) {
        const failInfo = await recordFailedPinAttempt(pinAttemptBucket);
        if (failInfo.locked) {
          return NextResponse.json(
            {
              error: `Too many wrong PIN attempts. Try again in ${formatTryAgainMins(failInfo.minsLeft)}.`,
              retryAfter: failInfo.secondsLeft,
              retryAfterMinutes: failInfo.minsLeft,
            },
            { status: 429 }
          );
        }
        return NextResponse.json(
          {
            error: `Incorrect 4-digit Wallet PIN (${failInfo.attemptsRemaining} attempt${
              failInfo.attemptsRemaining === 1 ? "" : "s"
            } left before 15-min lockout).`,
            attemptsRemaining: failInfo.attemptsRemaining,
          },
          { status: 401 }
        );
      }

      await clearFailedPinAttempts(pinAttemptBucket);
      return NextResponse.json({
        success: true,
        hasPin: true,
        verified: true,
      });
    }

    // -------------------------------------------------------------------------
    // 3. CHANGE PIN (Using current 4-digit PIN)
    // -------------------------------------------------------------------------
    if (action === "change") {
      if (!hasExistingPin) {
        return NextResponse.json({ error: "No existing PIN found. Please set a new PIN." }, { status: 400 });
      }

      const currentPin = String(body?.currentPin || "").trim();
      const newPin = String(body?.newPin || "").trim();
      const confirmPin = String(body?.confirmPin ?? newPin).trim();

      if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
        return NextResponse.json({ error: "Both current and new PINs must be 4 digits." }, { status: 400 });
      }
      if (newPin !== confirmPin) {
        return NextResponse.json({ error: "New PIN and confirmation PIN do not match." }, { status: 400 });
      }

      const isCurrentValid = await verifyWalletPinAsync(currentPin, emailLower, storedPinHash);
      if (!isCurrentValid) {
        const failInfo = await recordFailedPinAttempt(pinAttemptBucket);
        if (failInfo.locked) {
          return NextResponse.json(
            {
              error: `Too many wrong PIN attempts. Try again in ${formatTryAgainMins(failInfo.minsLeft)}.`,
              retryAfter: failInfo.secondsLeft,
              retryAfterMinutes: failInfo.minsLeft,
            },
            { status: 429 }
          );
        }
        return NextResponse.json(
          {
            error: `Current Wallet PIN is incorrect (${failInfo.attemptsRemaining} attempt${
              failInfo.attemptsRemaining === 1 ? "" : "s"
            } left before 15-min lockout).`,
          },
          { status: 401 }
        );
      }

      const hashedPin = await hashWalletPinAsync(newPin, emailLower);
      const { error: updateErr } = await saveUserPinHash(user.id, hashedPin, usePassphraseFallback);

      if (updateErr) {
        console.error("[WalletPIN] Change update error:", updateErr);
        return NextResponse.json(
          { error: "Could not update your Wallet PIN right now. Please try again." },
          { status: 500 }
        );
      }

      await clearFailedPinAttempts(pinAttemptBucket);
      await invalidateCachedProfile(emailLower);
      return NextResponse.json({
        success: true,
        hasPin: true,
        verified: true,
        message: "Wallet PIN changed successfully.",
      });
    }

    // -------------------------------------------------------------------------
    // 4. RESET FORGOTTEN PIN (Verify Registered Phone Number + Account Email)
    // -------------------------------------------------------------------------
    if (action === "reset") {
      const confirmEmail = String(body?.confirmEmail || "")
        .toLowerCase()
        .trim();
      const phoneInput = String(body?.phone || "").trim();
      const newPin = String(body?.newPin || "").trim();
      const confirmPin = String(body?.confirmPin ?? newPin).trim();

      if (!confirmEmail || confirmEmail !== emailLower) {
        const failInfo = await recordFailedPinAttempt(resetAttemptBucket);
        if (failInfo.locked) {
          return NextResponse.json(
            {
              error: `Too many failed reset attempts. Try again in ${formatTryAgainMins(failInfo.minsLeft)}.`,
            },
            { status: 429 }
          );
        }
        return NextResponse.json(
          { error: "Email verification failed. Please enter your exact registered account email address." },
          { status: 400 }
        );
      }

      const savedPhoneLast10 = normalizePhoneLast10(user.phone);
      const inputPhoneLast10 = phoneInput.replace(/\D/g, "").slice(-10);

      if (savedPhoneLast10) {
        if (!inputPhoneLast10 || inputPhoneLast10 !== savedPhoneLast10) {
          const failInfo = await recordFailedPinAttempt(resetAttemptBucket);
          if (failInfo.locked) {
            return NextResponse.json(
              {
                error: `Too many failed reset attempts. Try again in ${formatTryAgainMins(failInfo.minsLeft)}.`,
              },
              { status: 429 }
            );
          }
          return NextResponse.json(
            {
              error:
                "Phone verification failed. The phone number entered does not match your registered profile phone number.",
            },
            { status: 400 }
          );
        }
      } else {
        if (!phoneInput) {
          return NextResponse.json(
            { error: "Please enter your phone number to verify your identity." },
            { status: 400 }
          );
        }
      }

      if (!/^\d{4}$/.test(newPin)) {
        return NextResponse.json({ error: "New Wallet PIN must be a 4-digit number (0-9)." }, { status: 400 });
      }
      if (newPin !== confirmPin) {
        return NextResponse.json({ error: "New PIN and confirmation PIN do not match." }, { status: 400 });
      }

      const hashedPin = await hashWalletPinAsync(newPin, emailLower);
      const { error: updateErr } = await saveUserPinHash(user.id, hashedPin, usePassphraseFallback);

      if (updateErr) {
        console.error("[WalletPIN] Reset update error:", updateErr);
        return NextResponse.json(
          { error: "Could not reset your Wallet PIN right now. Please try again." },
          { status: 500 }
        );
      }

      await clearFailedPinAttempts(pinAttemptBucket);
      await clearFailedPinAttempts(resetAttemptBucket);

      // Create an in-app security notification for the user
      try {
        await supabaseAdmin.from("notifications").insert({
          user_email: emailLower,
          title: "Security Alert: Wallet PIN Reset",
          message:
            "Your 4-digit Wallet PIN was recently reset after verifying your registered email and phone number.",
          read: false,
          is_global: false,
        });
      } catch {
        // Non-blocking notification insert
      }

      await invalidateCachedProfile(emailLower);
      return NextResponse.json({
        success: true,
        hasPin: true,
        verified: true,
        message: "Wallet PIN reset successfully.",
      });
    }

    return NextResponse.json({ error: "Invalid PIN action." }, { status: 400 });
  } catch (err: any) {
    console.error("[WalletPIN] Unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
