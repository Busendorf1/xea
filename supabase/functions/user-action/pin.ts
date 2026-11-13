import { computePhoneHash, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { decryptSensitiveFieldEdge, verifyWalletPinEdge } from "../_shared/crypto.ts";
import {
  getPinLockoutStatusDb,
  hashAndFormatPin,
  PIN_LOCKOUT_MINUTES,
  recordPinAttemptDb,
} from "../_shared/walletPin.ts";

function extractStoredPinHash(userRow: Record<string, unknown> | null): string {
  if (!userRow) return "";
  const direct =
    typeof userRow.wallet_pin_hash === "string" ? userRow.wallet_pin_hash.trim() : "";
  if (direct) return direct;
  const fallbackPass =
    typeof userRow.passphrase === "string" ? userRow.passphrase.trim() : "";
  if (fallbackPass.startsWith("pin:v1:") || fallbackPass.startsWith("hash:v1:")) {
    return fallbackPass;
  }
  return "";
}

async function fetchUserForPin(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  emailLower: string,
) {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, phone, phone_hash, username, passphrase, wallet_pin_hash")
    .ilike("email", emailLower)
    .maybeSingle();
  return { user: data, error };
}

export async function handleWalletPinStatus(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
): Promise<Response> {
  const [{ user }, lock] = await Promise.all([
    fetchUserForPin(supabase, cleanEmail),
    getPinLockoutStatusDb(supabase, cleanEmail),
  ]);
  const storedPinHash = extractStoredPinHash(user);
  return jsonResponse({
    hasPin: Boolean(storedPinHash),
    isLocked: lock.locked,
    remainingSeconds: lock.secondsLeft,
    attemptsLeft: lock.remainingAttempts,
  });
}

export async function handleWalletPinAction(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  action: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const pinAction = String(
    body?.pinAction || body?.subAction || (action === "wallet_pin_action" ? body?.mode : action) || "",
  )
    .trim()
    .toLowerCase();

  // Check DB-backed user-scoped lockout BEFORE processing any PIN attempt
  const lock = await getPinLockoutStatusDb(supabase, cleanEmail);
  if (lock.locked && pinAction !== "setup") {
    return errorResponse(
      `Too many wrong PIN attempts. Wallet temporarily locked. Try again in ${lock.minsLeft} minute${
        lock.minsLeft === 1 ? "" : "s"
      }.`,
      429,
      { retryAfter: lock.secondsLeft },
    );
  }

  const { user, error: fetchErr } = await fetchUserForPin(supabase, cleanEmail);
  if (fetchErr || !user) {
    return errorResponse("User profile not found.", 404);
  }

  const existingPinHash = extractStoredPinHash(user);

  if (pinAction === "setup") {
    if (existingPinHash) {
      return errorResponse(
        "Wallet PIN is already configured. Use change or reset instead.",
        409,
      );
    }
    const newPin = String(body?.pin || body?.newPin || "").trim();
    if (!/^\d{4}$/.test(newPin)) {
      return errorResponse("Wallet PIN must be exactly 4 digits.", 400);
    }
    const hashed = await hashAndFormatPin(newPin, cleanEmail);
    const { error: updErr } = await supabase
      .from("users")
      .update({ wallet_pin_hash: hashed })
      .eq("id", user.id);

    if (updErr) {
      if (String(updErr.message || "").includes("wallet_pin_hash")) {
        await supabase.from("users").update({ passphrase: hashed }).eq("id", user.id);
      } else {
        return errorResponse("Failed to save Wallet PIN.", 500);
      }
    }
    await recordPinAttemptDb(supabase, cleanEmail, true);
    return jsonResponse({ success: true, hasPin: true, message: "Wallet PIN created." });
  }

  if (pinAction === "verify") {
    if (!existingPinHash) {
      return errorResponse("Please set up your 4-digit Wallet PIN first.", 403);
    }
    const pin = String(body?.pin || "").trim();
    if (!/^\d{4}$/.test(pin)) {
      return errorResponse("Valid 4-digit PIN is required.", 400);
    }
    const ok = await verifyWalletPinEdge(pin, cleanEmail, existingPinHash);
    if (!ok) {
      const nextLock = await recordPinAttemptDb(supabase, cleanEmail, false);
      if (nextLock.locked) {
        return errorResponse(
          `Too many wrong PIN attempts. Wallet temporarily locked for ${PIN_LOCKOUT_MINUTES} minutes.`,
          429,
          { retryAfter: nextLock.secondsLeft },
        );
      }
      return errorResponse(
        `Incorrect Wallet PIN (${nextLock.remainingAttempts} attempt${
          nextLock.remainingAttempts === 1 ? "" : "s"
        } left before 45-min lockout).`,
        401,
        { attemptsLeft: nextLock.remainingAttempts },
      );
    }
    await recordPinAttemptDb(supabase, cleanEmail, true);
    return jsonResponse({ success: true, valid: true });
  }

  if (pinAction === "change") {
    if (!existingPinHash) {
      return errorResponse("No existing Wallet PIN configured. Use setup first.", 400);
    }
    const currentPin = String(body?.currentPin || body?.oldPin || "").trim();
    const newPin = String(body?.newPin || "").trim();
    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
      return errorResponse("Both current and new 4-digit PINs are required.", 400);
    }
    const ok = await verifyWalletPinEdge(currentPin, cleanEmail, existingPinHash);
    if (!ok) {
      const nextLock = await recordPinAttemptDb(supabase, cleanEmail, false);
      if (nextLock.locked) {
        return errorResponse(
          `Too many wrong PIN attempts. Wallet locked for ${PIN_LOCKOUT_MINUTES} minutes.`,
          429,
          { retryAfter: nextLock.secondsLeft },
        );
      }
      return errorResponse(
        `Current Wallet PIN is incorrect (${nextLock.remainingAttempts} attempts left).`,
        401,
        { attemptsLeft: nextLock.remainingAttempts },
      );
    }

    const hashed = await hashAndFormatPin(newPin, cleanEmail);
    await supabase.from("users").update({ wallet_pin_hash: hashed }).eq("id", user.id);
    await recordPinAttemptDb(supabase, cleanEmail, true);
    return jsonResponse({ success: true, message: "Wallet PIN updated successfully." });
  }

  if (pinAction === "reset") {
    const newPin = String(body?.newPin || body?.pin || "").trim();
    const phoneInput = String(body?.phone || body?.registeredPhone || "").trim();
    if (!/^\d{4}$/.test(newPin)) {
      return errorResponse("New Wallet PIN must be exactly 4 digits.", 400);
    }

    // Verify registered phone number on file before allowing PIN reset
    const digits = phoneInput.replace(/\D/g, "");
    const decryptedStored = user.phone
      ? await decryptSensitiveFieldEdge(String(user.phone))
      : "";
    const storedLast10 = decryptedStored.replace(/\D/g, "").slice(-10);
    const inputLast10 = digits.slice(-10);
    const phoneHash = phoneInput ? await computePhoneHash(phoneInput) : "";

    const phoneVerified =
      Boolean(digits.length >= 10 && storedLast10 && storedLast10 === inputLast10) ||
      Boolean(user.phone_hash && phoneHash && user.phone_hash === phoneHash);

    if (!phoneVerified) {
      const nextLock = await recordPinAttemptDb(supabase, cleanEmail, false);
      if (nextLock.locked) {
        return errorResponse(
          `Too many failed PIN reset attempts. Locked for ${PIN_LOCKOUT_MINUTES} minutes.`,
          429,
          { retryAfter: nextLock.secondsLeft },
        );
      }
      return errorResponse(
        `Registered phone verification failed (${nextLock.remainingAttempts} attempts left).`,
        403,
        { attemptsLeft: nextLock.remainingAttempts },
      );
    }

    const hashed = await hashAndFormatPin(newPin, cleanEmail);
    await supabase.from("users").update({ wallet_pin_hash: hashed }).eq("id", user.id);
    await recordPinAttemptDb(supabase, cleanEmail, true);
    return jsonResponse({ success: true, hasPin: true, message: "Wallet PIN reset successfully." });
  }

  return errorResponse("Unsupported wallet PIN sub-action.", 400);
}
