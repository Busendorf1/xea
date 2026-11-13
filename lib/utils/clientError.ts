/**
 * Sanitizes raw backend, database, PostgREST, gateway, HTTP 5xx, or network errors
 * into concise, client-friendly, actionable messages suitable for end users.
 * Never leaks internal server errors, SQL codes, stack traces, or hostnames.
 */

const NETWORK_ERROR_PATTERN =
  /fetch failed|network request failed|failed to fetch|networkerror|load failed|err_internet_disconnected|err_network|network error|offline|econnrefused|enotfound|econnreset|etimedout|timeout|timed out|aborterror/i;

const INTERNAL_SERVER_PATTERN =
  /internal server error|server error\.?|database connection|pgrst|postgres|supabase|column .* does not exist|relation .* does not exist|syntax error at or near|violates .* constraint|22P02|23503|23502|42P01|42703|unhandled|exception|stack:|TypeError|ReferenceError|SyntaxError|cannot read propert|undefined is not an object|null is not an object|unexpected token|json parse|bad gateway|service unavailable|gateway timeout|502|503|504/i;

const AUTH_EXPIRED_PATTERN =
  /jwt|bearer|unauthorized|unauthenticated|auth0|oidc|session expired|invalid signature/i;

const DUPLICATE_PATTERN = /duplicate key|unique constraint|already exists|23505/i;
const PERMISSION_PATTERN = /row-level security|rls|permission denied|42501|insufficient_privilege/i;
const PAYMENT_BUSY_PATTERN = /korapay|paystack|kora_secret_key|paystack_secret_key|webhook/i;

export function isNavigatorOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function isNetworkOfflineError(err: unknown): boolean {
  if (isNavigatorOffline()) return true;
  if (err instanceof TypeError) return true;
  const raw = extractRawMessage(err);
  if (!raw) return false;
  return NETWORK_ERROR_PATTERN.test(raw);
}

function extractRawMessage(err: unknown): string {
  if (typeof err === "string") return err.trim();
  if (err && typeof err === "object") {
    if ("error" in err && typeof (err as any).error === "string") {
      return (err as any).error.trim();
    }
    if ("message" in err && typeof (err as any).message === "string") {
      return (err as any).message.trim();
    }
  }
  return "";
}

export function toClientFriendlyError(
  err: unknown,
  fallback = "Try again later"
): string {
  if (isNavigatorOffline()) {
    return "Connect to network";
  }

  const raw = extractRawMessage(err);

  if (err instanceof TypeError && (!raw || /fetch|network|load/i.test(raw))) {
    return "Connect to network";
  }

  if (!raw) return fallback;

  if (NETWORK_ERROR_PATTERN.test(raw)) {
    return "Connect to network";
  }

  if (AUTH_EXPIRED_PATTERN.test(raw)) {
    return "Session expired. Sign in again";
  }

  if (DUPLICATE_PATTERN.test(raw)) {
    return "Record already exists";
  }

  if (PERMISSION_PATTERN.test(raw)) {
    return "Action not permitted";
  }

  if (PAYMENT_BUSY_PATTERN.test(raw)) {
    return "Payment service busy. Try again later";
  }

  if (INTERNAL_SERVER_PATTERN.test(raw)) {
    return "Try again later";
  }

  // Reject overly long stack traces or raw SQL/JSON dumps
  if (raw.length > 180 || raw.includes("{") || raw.includes("at ") || raw.includes("stack:")) {
    return fallback;
  }

  return raw;
}

/**
 * Formats HTTP API responses cleanly:
 * - 5xx always resolves to a safe generic client message ("Try again later")
 * - 401/403 gives an actionable session/auth message unless server supplied a safe user prompt
 * - 4xx keeps concise, actionable messages (e.g. PIN attempts left, lockout duration, validation guidance)
 */
export function toClientFriendlyApiError(
  status: number,
  payload?: { error?: unknown; message?: unknown } | null,
  fallback = "Try again later"
): string {
  if (isNavigatorOffline()) {
    return "Connect to network";
  }

  if (status >= 500) {
    return "Try again later";
  }

  const candidate =
    (typeof payload?.message === "string" && payload.message.trim()) ||
    (typeof payload?.error === "string" && payload.error.trim()) ||
    "";

  if (!candidate) {
    if (status === 401) return "Session expired. Sign in again";
    if (status === 429) return "Too many attempts. Try again later";
    return fallback;
  }

  return toClientFriendlyError(candidate, fallback);
}
