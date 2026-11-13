/**
 * Sanitizes redirect URLs to prevent Open Redirects, DOM-based XSS, and Protocol Injection.
 * Strictly permits:
 * 1. Safe deep links: xea-auth://, xea://
 * 2. Safe relative paths: /... (on current origin)
 * 3. Official approved production domains (HTTPS only)
 * Rejects:
 * - External/phishing domains (https://attacker.com, https://evil-paayh.com)
 * - Protocol-relative URLs (//attacker.com)
 * - Pseudo-protocols (javascript:, data:, vbscript:)
 */
export function sanitizeRedirectUrl(rawUrl: string | null): string {
  const DEFAULT_REDIRECT = "xea-auth://payment-callback";
  if (!rawUrl) return DEFAULT_REDIRECT;
  const trimmed = rawUrl.trim();

  // 1. Safe deep links: xea-auth:// or xea:// (and exp:// in non-production Expo Go dev)
  if (/^xea(-auth)?:\/\/[a-zA-Z0-9_.\-\/?=&%]+$/.test(trimmed)) {
    return trimmed;
  }
  if (
    process.env.NODE_ENV !== "production" &&
    /^exp:\/\/[a-zA-Z0-9_.:\/\-?=&%]+$/.test(trimmed)
  ) {
    return trimmed;
  }

  // 2. Safe relative paths on current origin (e.g. /dashboard, /wallet)
  // Must start with single slash, not protocol-relative (//) and no backslashes
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) {
    return trimmed;
  }

  // 3. Strict allowlist for official absolute URLs (strictly paayh.com, rejects ALL third-party/attacker domains)
  try {
    const parsed = new URL(trimmed);
    const isProd = process.env.NODE_ENV === "production";
    const allowedHostnames = new Set(
      isProd
        ? ["paayh.com", "www.paayh.com"]
        : ["paayh.com", "www.paayh.com", "localhost"]
    );

    const isSecureHttp = parsed.protocol === "https:";
    const isDevHttp = !isProd && parsed.protocol === "http:" && parsed.hostname === "localhost";

    if ((isSecureHttp || isDevHttp) && allowedHostnames.has(parsed.hostname.toLowerCase())) {
      return trimmed;
    }
  } catch {
    // Malformed URLs fall back safely
  }

  // Reject all other schemes and external domains
  return DEFAULT_REDIRECT;
}
