import crypto from "crypto";
import { promisify } from "util";
import { env } from "../env";

const pbkdf2Async = promisify(crypto.pbkdf2);

const ENCRYPTION_PREFIX = "enc:v1:";
const ONE_WAY_HASH_PREFIX = "hash:v1:";
const WALLET_PIN_PREFIX = "pin:v1:";
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;

/**
 * Derives a deterministic 32-byte (256-bit) AES key from the platform's master secret.
 */
function getMasterEncryptionKey(): Buffer {
  const rawSecret =
    process.env.PII_ENCRYPTION_KEY ||
    process.env.EARN_TOKEN_SECRET ||
    process.env.AUTH0_SECRET ||
    env.AUTH0_SECRET;

  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.RENDER === "true";

  if (!rawSecret || rawSecret === "xea-default-auth0-secret-key-32ch") {
    if (isProduction) {
      throw new Error(
        "🚨 CRITICAL SECURITY ERROR: PII_ENCRYPTION_KEY, EARN_TOKEN_SECRET, or AUTH0_SECRET must be configured in production. Default fallback keys are strictly rejected."
      );
    }
    return crypto.createHash("sha256").update("xea-aes256gcm:xea-default-auth0-secret-key-32ch").digest();
  }

  return crypto.createHash("sha256").update(`xea-aes256gcm:${rawSecret}`).digest();
}

/**
 * Encrypts a sensitive string at the application layer using authenticated AES-256-GCM.
 * Returns a prefixed ciphertext string: `enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`.
 * Idempotent: if the value is already encrypted (`enc:v1:...`), returns it unchanged.
 */
export function encryptSensitiveField(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  const trimmed = String(plaintext).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith(ENCRYPTION_PREFIX) || trimmed.startsWith("PLACEHOLDER")) return trimmed;

  const key = getMasterEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended by NIST for AES-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts an `enc:v1:...` AES-256-GCM ciphertext back to plaintext.
 * Backwards-compatible: if the input does not have the `enc:v1:` prefix, returns it as-is.
 */
export function decryptSensitiveField(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value);
  if (!raw.startsWith(ENCRYPTION_PREFIX)) return raw;

  try {
    const parts = raw.slice(ENCRYPTION_PREFIX.length).split(":");
    if (parts.length !== 3) return null;

    const [ivHex, authTagHex, cipherHex] = parts;
    const key = getMasterEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(cipherHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Irreversible one-way HMAC-SHA256 hash for security passphrases and tokens.
 * Cannot be decrypted even with the master key.
 */
export function hashPassphraseOneWay(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(ONE_WAY_HASH_PREFIX) || trimmed.startsWith(ENCRYPTION_PREFIX)) {
    return trimmed;
  }
  const key = getMasterEncryptionKey();
  const digest = crypto.createHmac("sha256", key).update(`passphrase:${trimmed}`).digest("hex");
  return `${ONE_WAY_HASH_PREFIX}${digest}`;
}

/**
 * Hashes a 4-digit Wallet PIN using PBKDF2-HMAC-SHA256 (100,000 iterations)
 * combined with a random 16-byte salt and the platform master key + normalized email pepper.
 * Returns `pin:v1:<salt_hex>:<derived_key_hex>`.
 */
export function hashWalletPin(pin: string, email: string): string {
  const cleanPin = String(pin).trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    throw new Error("Wallet PIN must be exactly 4 digits.");
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const masterKey = getMasterEncryptionKey();
  const randomSalt = crypto.randomBytes(16);
  const compositeSalt = crypto
    .createHmac("sha256", masterKey)
    .update(`wallet-pin-salt:${cleanEmail}:`)
    .update(randomSalt)
    .digest();

  const derived = crypto.pbkdf2Sync(
    `pin:${cleanEmail}:${cleanPin}`,
    compositeSalt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    "sha256"
  );

  return `${WALLET_PIN_PREFIX}${randomSalt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Non-blocking asynchronous PBKDF2-HMAC-SHA256 hash offloaded to libuv's C++ thread pool
 * so the Node.js event loop is never blocked under high concurrency (100M+ user traffic).
 */
export async function hashWalletPinAsync(pin: string, email: string): Promise<string> {
  const cleanPin = String(pin).trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    throw new Error("Wallet PIN must be exactly 4 digits.");
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const masterKey = getMasterEncryptionKey();
  const randomSalt = crypto.randomBytes(16);
  const compositeSalt = crypto
    .createHmac("sha256", masterKey)
    .update(`wallet-pin-salt:${cleanEmail}:`)
    .update(randomSalt)
    .digest();

  const derived = await pbkdf2Async(
    `pin:${cleanEmail}:${cleanPin}`,
    compositeSalt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    "sha256"
  );

  return `${WALLET_PIN_PREFIX}${randomSalt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Verifies a 4-digit Wallet PIN against a stored `pin:v1:<salt_hex>:<derived_key_hex>`
 * (or fallback `hash:v1:<sha256_hex>` from the PostgreSQL trigger) in constant time.
 */
export function verifyWalletPin(
  pin: string | null | undefined,
  email: string | null | undefined,
  storedHash: string | null | undefined
): boolean {
  if (!pin || !email || !storedHash) return false;
  const cleanPin = String(pin).trim();
  if (!/^\d{4}$/.test(cleanPin)) return false;

  const cleanEmail = String(email).trim().toLowerCase();
  const rawStored = String(storedHash).trim();

  try {
    if (rawStored.startsWith(WALLET_PIN_PREFIX)) {
      const parts = rawStored.slice(WALLET_PIN_PREFIX.length).split(":");
      if (parts.length !== 2) return false;
      const [saltHex, expectedHex] = parts;
      const randomSalt = Buffer.from(saltHex, "hex");
      const expectedBuf = Buffer.from(expectedHex, "hex");
      if (randomSalt.length !== 16 || expectedBuf.length !== PBKDF2_KEYLEN) return false;

      const masterKey = getMasterEncryptionKey();
      const compositeSalt = crypto
        .createHmac("sha256", masterKey)
        .update(`wallet-pin-salt:${cleanEmail}:`)
        .update(randomSalt)
        .digest();

      const candidateBuf = crypto.pbkdf2Sync(
        `pin:${cleanEmail}:${cleanPin}`,
        compositeSalt,
        PBKDF2_ITERATIONS,
        PBKDF2_KEYLEN,
        "sha256"
      );

      return crypto.timingSafeEqual(candidateBuf, expectedBuf);
    }

    if (rawStored.startsWith(ONE_WAY_HASH_PREFIX)) {
      const expectedHex = rawStored.slice(ONE_WAY_HASH_PREFIX.length);
      const candidateHex = crypto
        .createHash("sha256")
        .update(`xea-wallet-pin-v1:${cleanEmail}:${cleanPin}`)
        .digest("hex");
      const a = Buffer.from(candidateHex, "hex");
      const b = Buffer.from(expectedHex, "hex");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Non-blocking asynchronous PIN verification offloaded to libuv's C++ worker pool
 * with constant-time comparison (`crypto.timingSafeEqual`).
 */
export async function verifyWalletPinAsync(
  pin: string | null | undefined,
  email: string | null | undefined,
  storedHash: string | null | undefined
): Promise<boolean> {
  if (!pin || !email || !storedHash) return false;
  const cleanPin = String(pin).trim();
  if (!/^\d{4}$/.test(cleanPin)) return false;

  const cleanEmail = String(email).trim().toLowerCase();
  const rawStored = String(storedHash).trim();

  try {
    if (rawStored.startsWith(WALLET_PIN_PREFIX)) {
      const parts = rawStored.slice(WALLET_PIN_PREFIX.length).split(":");
      if (parts.length !== 2) return false;
      const [saltHex, expectedHex] = parts;
      const randomSalt = Buffer.from(saltHex, "hex");
      const expectedBuf = Buffer.from(expectedHex, "hex");
      if (randomSalt.length !== 16 || expectedBuf.length !== PBKDF2_KEYLEN) return false;

      const masterKey = getMasterEncryptionKey();
      const compositeSalt = crypto
        .createHmac("sha256", masterKey)
        .update(`wallet-pin-salt:${cleanEmail}:`)
        .update(randomSalt)
        .digest();

      const candidateBuf = await pbkdf2Async(
        `pin:${cleanEmail}:${cleanPin}`,
        compositeSalt,
        PBKDF2_ITERATIONS,
        PBKDF2_KEYLEN,
        "sha256"
      );

      return crypto.timingSafeEqual(candidateBuf, expectedBuf);
    }

    if (rawStored.startsWith(ONE_WAY_HASH_PREFIX)) {
      const expectedHex = rawStored.slice(ONE_WAY_HASH_PREFIX.length);
      const candidateHex = crypto
        .createHash("sha256")
        .update(`xea-wallet-pin-v1:${cleanEmail}:${cleanPin}`)
        .digest("hex");
      const a = Buffer.from(candidateHex, "hex");
      const b = Buffer.from(expectedHex, "hex");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Generates an HMAC-SHA256 blind index for O(1) equality lookups without exposing plaintext PII.
 */
export function blindHashPII(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized.startsWith("placeholder")) return "";
  const key = getMasterEncryptionKey();
  return crypto.createHmac("sha256", key).update(normalized).digest("hex");
}

/**
 * Coarsens a verified 18+ date of birth to birth-year-only (`YYYY-01-01`)
 * so exact calendar birthdays (month/day) are never stored in the database,
 * while preserving age-bracket targeting compatibility.
 */
export function coarsenDobToBirthYear(dobStr: string | null | undefined): string | null {
  if (!dobStr) return null;
  const parsed = new Date(dobStr);
  if (isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  if (year < 1900 || year > new Date().getUTCFullYear()) return null;
  return `${year}-01-01`;
}

/**
 * Transparently decrypts encrypted PII fields on a user profile row before returning to the authenticated owner.
 */
export function decryptProfilePII<T extends Record<string, any>>(user: T | null): T | null {
  if (!user) return null;
  const copy: Record<string, any> = { ...user };
  if (typeof copy.phone === "string" && copy.phone.startsWith(ENCRYPTION_PREFIX)) {
    copy.phone = decryptSensitiveField(copy.phone) || "";
  }
  if (typeof copy.firstName === "string" && copy.firstName.startsWith(ENCRYPTION_PREFIX)) {
    copy.firstName = decryptSensitiveField(copy.firstName) || "";
  }
  if (typeof copy.lastName === "string" && copy.lastName.startsWith(ENCRYPTION_PREFIX)) {
    copy.lastName = decryptSensitiveField(copy.lastName) || "";
  }
  const fallbackPassphrasePin =
    typeof copy.passphrase === "string" && copy.passphrase.startsWith(WALLET_PIN_PREFIX)
      ? copy.passphrase
      : "";
  if ("wallet_pin_hash" in copy || fallbackPassphrasePin) {
    const effectiveHash = copy.wallet_pin_hash || fallbackPassphrasePin;
    copy.has_wallet_pin = Boolean(effectiveHash && String(effectiveHash).trim() !== "");
  } else if (typeof copy.has_wallet_pin !== "boolean") {
    copy.has_wallet_pin = false;
  }
  delete copy.wallet_pin_hash;
  delete copy.passphrase;
  return copy as T;
}

/**
 * Masks a private email address so raw email local-parts or domains are never exposed in public UI labels.
 * Example: "advertiser@example.com" -> "ad***@ex***.com"
 */
export function maskPrivateEmail(email: string | null | undefined): string {
  if (!email) return "";
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0) return "Sponsor";
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const visibleLocal = local.slice(0, Math.min(2, local.length));
  const dotIdx = domain.lastIndexOf(".");
  const domainName = dotIdx > 0 ? domain.slice(0, dotIdx) : domain;
  const domainExt = dotIdx > 0 ? domain.slice(dotIdx) : "";
  const visibleDomain = domainName.slice(0, Math.min(2, domainName.length));
  return `${visibleLocal}***@${visibleDomain}***${domainExt}`;
}
