const ENCRYPTION_PREFIX = "enc:v1:";
const ONE_WAY_HASH_PREFIX = "hash:v1:";
const WALLET_PIN_PREFIX = "pin:v1:";
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN_BYTES = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) return new Uint8Array(0);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function getMasterKeyBytes(): Promise<Uint8Array> {
  const rawSecret =
    Deno.env.get("PII_ENCRYPTION_KEY") ||
    Deno.env.get("EARN_TOKEN_SECRET") ||
    Deno.env.get("AUTH0_SECRET") ||
    "xea-default-auth0-secret-key-32ch";

  const data = encoder.encode(`xea-aes256gcm:${rawSecret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

/**
 * Encrypts a sensitive string using AES-256-GCM (100% compatible with Node.js `lib/security/piiCrypto.ts`).
 * Format: `enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`
 */
export async function encryptSensitiveFieldEdge(
  plaintext: string | null | undefined
): Promise<string | null> {
  if (plaintext === null || plaintext === undefined) return null;
  const trimmed = String(plaintext).trim();
  if (!trimmed) return "";
  if (
    trimmed.startsWith(ENCRYPTION_PREFIX) ||
    trimmed.startsWith("PLACEHOLDER")
  ) {
    return trimmed;
  }

  try {
    const keyBytes = await getMasterKeyBytes();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = encoder.encode(trimmed);
    const encryptedBuf = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      cryptoKey,
      encoded
    );
    const fullBytes = new Uint8Array(encryptedBuf);
    // WebCrypto AES-GCM appends the 16-byte authentication tag at the end
    const cipherBytes = fullBytes.slice(0, fullBytes.length - 16);
    const authTagBytes = fullBytes.slice(fullBytes.length - 16);

    return `${ENCRYPTION_PREFIX}${bytesToHex(iv)}:${bytesToHex(
      authTagBytes
    )}:${bytesToHex(cipherBytes)}`;
  } catch {
    return trimmed;
  }
}

/**
 * Decrypts an `enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>` string back to plaintext.
 * Backwards-compatible: returns unprefixed strings as-is.
 */
export async function decryptSensitiveFieldEdge(
  value: string | null | undefined
): Promise<string | null> {
  if (value === null || value === undefined) return null;
  const raw = String(value);
  if (!raw.startsWith(ENCRYPTION_PREFIX)) return raw;

  try {
    const parts = raw.slice(ENCRYPTION_PREFIX.length).split(":");
    if (parts.length !== 3) return null;
    const [ivHex, authTagHex, cipherHex] = parts;
    const iv = hexToBytes(ivHex);
    const authTag = hexToBytes(authTagHex);
    const cipherBytes = hexToBytes(cipherHex);

    const combined = new Uint8Array(cipherBytes.length + authTag.length);
    combined.set(cipherBytes, 0);
    combined.set(authTag, cipherBytes.length);

    const keyBytes = await getMasterKeyBytes();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    const decryptedBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      cryptoKey,
      combined
    );
    return decoder.decode(decryptedBuf);
  } catch {
    return null;
  }
}

/**
 * Decrypts PII fields (`phone`, `firstName`, `lastName`) on a user profile row
 * and computes `has_wallet_pin` before stripping sensitive hashes.
 */
export async function decryptProfilePIIEdge<T extends Record<string, any>>(
  user: T | null
): Promise<T | null> {
  if (!user) return null;
  const copy: Record<string, any> = { ...user };

  if (
    typeof copy.phone === "string" &&
    copy.phone.startsWith(ENCRYPTION_PREFIX)
  ) {
    copy.phone = (await decryptSensitiveFieldEdge(copy.phone)) || "";
  }
  if (
    typeof copy.firstName === "string" &&
    copy.firstName.startsWith(ENCRYPTION_PREFIX)
  ) {
    copy.firstName = (await decryptSensitiveFieldEdge(copy.firstName)) || "";
  }
  if (
    typeof copy.lastName === "string" &&
    copy.lastName.startsWith(ENCRYPTION_PREFIX)
  ) {
    copy.lastName = (await decryptSensitiveFieldEdge(copy.lastName)) || "";
  }

  const fallbackPassphrasePin =
    typeof copy.passphrase === "string" &&
    copy.passphrase.startsWith(WALLET_PIN_PREFIX)
      ? copy.passphrase
      : "";

  if ("wallet_pin_hash" in copy || fallbackPassphrasePin) {
    const effectiveHash = copy.wallet_pin_hash || fallbackPassphrasePin;
    copy.has_wallet_pin = Boolean(
      effectiveHash && String(effectiveHash).trim() !== ""
    );
  } else if (typeof copy.has_wallet_pin !== "boolean") {
    copy.has_wallet_pin = false;
  }

  delete copy.wallet_pin_hash;
  delete copy.passphrase;
  return copy as T;
}

async function computeCompositeSalt(
  cleanEmail: string,
  randomSalt: Uint8Array
): Promise<Uint8Array> {
  const masterKeyBytes = await getMasterKeyBytes();
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    masterKeyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const prefixBytes = encoder.encode(`wallet-pin-salt:${cleanEmail}:`);
  const message = new Uint8Array(prefixBytes.length + randomSalt.length);
  message.set(prefixBytes, 0);
  message.set(randomSalt, prefixBytes.length);

  const sig = await crypto.subtle.sign("HMAC", hmacKey, message);
  return new Uint8Array(sig);
}

/**
 * Hashes a 4-digit Wallet PIN using PBKDF2-HMAC-SHA256 (100,000 iterations),
 * 100% compatible with Node.js `hashWalletPinAsync`.
 */
export async function hashWalletPinEdge(
  pin: string,
  email: string
): Promise<string> {
  const cleanPin = String(pin).trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    throw new Error("Wallet PIN must be a 4-digit number (0-9).");
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const randomSalt = crypto.getRandomValues(new Uint8Array(16));
  const compositeSalt = await computeCompositeSalt(cleanEmail, randomSalt);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`pin:${cleanEmail}:${cleanPin}`),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: compositeSalt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    PBKDF2_KEYLEN_BYTES * 8
  );

  return `${WALLET_PIN_PREFIX}${bytesToHex(randomSalt)}:${bytesToHex(
    new Uint8Array(derivedBits)
  )}`;
}

/**
 * Verifies a 4-digit Wallet PIN in constant time against `pin:v1:...` or `hash:v1:...`.
 */
export async function verifyWalletPinEdge(
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
      const randomSalt = hexToBytes(saltHex);
      const expectedBytes = hexToBytes(expectedHex);
      if (
        randomSalt.length !== 16 ||
        expectedBytes.length !== PBKDF2_KEYLEN_BYTES
      ) {
        return false;
      }

      const compositeSalt = await computeCompositeSalt(cleanEmail, randomSalt);
      const baseKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(`pin:${cleanEmail}:${cleanPin}`),
        "PBKDF2",
        false,
        ["deriveBits"]
      );

      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: compositeSalt,
          iterations: PBKDF2_ITERATIONS,
          hash: "SHA-256",
        },
        baseKey,
        PBKDF2_KEYLEN_BYTES * 8
      );

      return timingSafeEqualBytes(new Uint8Array(derivedBits), expectedBytes);
    }

    if (rawStored.startsWith(ONE_WAY_HASH_PREFIX)) {
      const expectedHex = rawStored.slice(ONE_WAY_HASH_PREFIX.length);
      const expectedBytes = hexToBytes(expectedHex);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(`xea-wallet-pin-v1:${cleanEmail}:${cleanPin}`)
      );
      return timingSafeEqualBytes(new Uint8Array(digest), expectedBytes);
    }

    return false;
  } catch {
    return false;
  }
}
