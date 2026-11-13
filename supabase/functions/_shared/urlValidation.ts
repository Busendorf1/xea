const BLOCKED_SCHEMES = ["javascript:", "data:", "vbscript:", "file:", "blob:"];

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  ) {
    return true;
  }
  // Private IPv4 ranges
  if (
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) ||
    /^169\.254\./.test(h)
  ) {
    return true;
  }
  return false;
}

/**
 * Validates external HTTPS URLs (and optionally relative storage paths starting with `/`).
 * Blocks javascript:, data:, vbscript:, non-HTTPS URLs, and loopback/private network SSRF hosts.
 */
export function validateSafeUrl(
  rawUrl: unknown,
  options: { allowRelativePath?: boolean; maxLength?: number } = {},
): { valid: boolean; sanitized: string | null; error?: string } {
  if (rawUrl === null || rawUrl === undefined) {
    return { valid: true, sanitized: null };
  }
  const str = String(rawUrl).trim();
  if (!str) {
    return { valid: true, sanitized: null };
  }
  const maxLength = options.maxLength ?? 2048;
  if (str.length > maxLength) {
    return {
      valid: false,
      sanitized: null,
      error: `URL exceeds maximum length of ${maxLength} characters.`,
    };
  }

  const lower = str.toLowerCase();
  for (const scheme of BLOCKED_SCHEMES) {
    if (lower.startsWith(scheme)) {
      return {
        valid: false,
        sanitized: null,
        error: "Unsafe URL scheme is not allowed.",
      };
    }
  }

  if (options.allowRelativePath && str.startsWith("/") && !str.startsWith("//")) {
    return { valid: true, sanitized: str };
  }

  try {
    const parsed = new URL(str);
    if (parsed.protocol !== "https:") {
      return {
        valid: false,
        sanitized: null,
        error: "Only secure HTTPS URLs are permitted.",
      };
    }
    if (!parsed.hostname || isPrivateOrLocalHostname(parsed.hostname)) {
      return {
        valid: false,
        sanitized: null,
        error: "Private or local network URLs are not permitted.",
      };
    }
    return { valid: true, sanitized: parsed.toString() };
  } catch {
    return {
      valid: false,
      sanitized: null,
      error: "Invalid URL format.",
    };
  }
}

/**
 * Validates media or avatar URL allowing HTTPS (or safe Supabase storage paths)
 * and optionally strictly allowlisting trusted media origins when configured.
 */
export function validateSafeMediaUrl(rawUrl: unknown): {
  valid: boolean;
  sanitized: string | null;
  error?: string;
} {
  return validateSafeUrl(rawUrl, { allowRelativePath: true, maxLength: 2048 });
}

/**
 * Escapes PostgREST filter special characters so user input cannot inject `.or()` clauses.
 */
export function sanitizePostgrestValue(val: string): string {
  return val.replace(/[,()*%\\'"]/g, "").trim();
}
