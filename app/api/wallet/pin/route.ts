import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import {
  hashWalletPinAsync,
  verifyWalletPinAsync,
  decryptSensitiveField,
} from "@/lib/security/piiCrypto";
import {
  getPinAttemptBucket,
  getPinResetAttemptBucket,
  getPinLockoutStatus,
  recordFailedPinAttempt,
  clearFailedPinAttempts,
  resolveStoredWalletPinHash,
} from "@/lib/security/walletPinHelper";

export const dynamic = "force-dynamic";

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
      .ilike("email", emailLower)
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
    .ilike("email", emailLower)
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
    const email = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const emailLower = email.toLowerCase().trim();

    const { user, error } = await fetchUserForPin(emailLower);
    if (error) {
      return NextResponse.json({ hasPin: false });
    }

    const storedPinHash = resolveStoredWalletPinHash(user);
    return NextResponse.json({ hasPin: Boolean(storedPinHash) });
  } catch {
    return NextResponse.json({ hasPin: false });
  }
}

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const emailLower = email.toLowerCase().trim();

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();

    // User-scoped lockout buckets (prevents X-Forwarded-For spoofing bypass & syncs with wallet transactions)
    const pinAttemptBucket = getPinAttemptBucket(emailLower);
    const resetAttemptBucket = getPinResetAttemptBucket(emailLower);

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
        { error: "Try again later" },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const storedPinHash = resolveStoredWalletPinHash(user) || "";
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
          { error: "Try again later" },
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
            } left before 45-min lockout).`,
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
            } left before 45-min lockout).`,
          },
          { status: 401 }
        );
      }

      const hashedPin = await hashWalletPinAsync(newPin, emailLower);
      const { error: updateErr } = await saveUserPinHash(user.id, hashedPin, usePassphraseFallback);

      if (updateErr) {
        console.error("[WalletPIN] Change update error:", updateErr);
        return NextResponse.json(
          { error: "Try again later" },
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

      if (savedPhoneLast10 && savedPhoneLast10.length >= 7) {
        if (!inputPhoneLast10 || inputPhoneLast10 !== savedPhoneLast10) {
          const failInfo = await recordFailedPinAttempt(resetAttemptBucket);
          if (failInfo.locked) {
            return NextResponse.json(
              {
                error: `Too many failed reset attempts. Try again in ${formatTryAgainMins(failInfo.minsLeft)}.`,
                retryAfter: failInfo.secondsLeft,
                retryAfterMinutes: failInfo.minsLeft,
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
        return NextResponse.json(
          { error: "Please register a valid phone number in your Profile Settings before resetting your Wallet PIN." },
          { status: 400 }
        );
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
          { error: "Try again later" },
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
      { error: "Try again later" },
      { status: 500 }
    );
  }
}
