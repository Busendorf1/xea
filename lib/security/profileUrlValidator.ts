const TRUSTED_IMAGE_HOST_SUFFIXES = [
  ".supabase.co",
  ".supabase.in",
  ".googleusercontent.com",
  ".gravatar.com",
  ".paayh.com",
];

const TRUSTED_IMAGE_EXACT_HOSTS = new Set<string>([
  "paayh.com",
  "gravatar.com",
  "www.gravatar.com",
  "res.cloudinary.com",
  "avatars.githubusercontent.com",
  "platform-lookaside.fbsbx.com",
]);

function addEnvTrustedHost() {
  for (const envVar of [process.env.NEXT_PUBLIC_CDN_URL, process.env.CDN_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (!envVar) continue;
    try {
      const parsed = new URL(envVar);
      if (parsed.hostname) TRUSTED_IMAGE_EXACT_HOSTS.add(parsed.hostname.toLowerCase());
    } catch {}
  }
}
addEnvTrustedHost();

function isPrivateOrDisallowedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("[::1]")
  ) {
    return true;
  }
  // Block raw IPv4 addresses (including 127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.169.254)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return true;
  }
  // Block raw IPv6 literals
  if (host.includes(":")) {
    return true;
  }
  return false;
}

/**
 * Validates profile avatar URLs against a strict HTTPS allowlist / internal media paths,
 * rejecting XSS schemes, embedded credentials, custom ports, and SSRF private hosts/IPs.
 */
export function validateProfileImageUrl(rawUrl: unknown): {
  valid: boolean;
  sanitized?: string;
  error?: string;
} {
  if (rawUrl === null || rawUrl === undefined) {
    return { valid: true, sanitized: undefined };
  }
  if (typeof rawUrl !== "string") {
    return { valid: false, error: "Invalid profile image URL format." };
  }
  const trimmed = rawUrl.trim();
  if (trimmed === "") {
    return { valid: true, sanitized: "" };
  }
  if (trimmed.length > 2048) {
    return { valid: false, error: "Profile image URL is too long." };
  }
  // Allow safe internal relative CDN/media paths (reject protocol-relative `//`)
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    if (/^\/(cdn\/storage|api\/media)\/[a-zA-Z0-9._/%-]+$/.test(trimmed)) {
      return { valid: true, sanitized: trimmed };
    }
    return { valid: false, error: "Invalid internal profile image path." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Invalid profile image URL." };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, error: "Profile image URL must use HTTPS." };
  }
  if (parsed.username || parsed.password) {
    return { valid: false, error: "Profile image URL must not contain embedded credentials." };
  }
  if (parsed.port && parsed.port !== "443") {
    return { valid: false, error: "Profile image URL must not specify a custom port." };
  }

  const host = parsed.hostname.toLowerCase();
  if (isPrivateOrDisallowedHostname(host)) {
    return { valid: false, error: "Profile image hostname is not allowed." };
  }

  const isTrustedHost =
    TRUSTED_IMAGE_EXACT_HOSTS.has(host) ||
    TRUSTED_IMAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);

  if (!isTrustedHost) {
    return {
      valid: false,
      error: "Profile image host is not on the approved HTTPS media allowlist.",
    };
  }

  return { valid: true, sanitized: parsed.toString() };
}
