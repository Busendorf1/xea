import crypto from "crypto";
import { env } from "../env";

const ENCRYPTION_PREFIX = "enc:v1:";

/**
 * Derives a deterministic 32-byte (256-bit) AES key from the platform's master secret.
 */
function getMasterEncryptionKey(): Buffer {
  const rawSecret =
    process.env.PII_ENCRYPTION_KEY ||
    process.env.EARN_TOKEN_SECRET ||
    env.AUTH0_SECRET ||
    process.env.AUTH0_SECRET ||
    "xea-default-auth0-secret-key-32ch";

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
  if (trimmed.startsWith(ENCRYPTION_PREFIX)) return trimmed;

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
 * Generates an HMAC-SHA256 blind index for O(1) equality lookups without exposing plaintext PII.
 */
export function blindHashPII(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return "";
  const key = getMasterEncryptionKey();
  return crypto.createHmac("sha256", key).update(normalized).digest("hex");
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
