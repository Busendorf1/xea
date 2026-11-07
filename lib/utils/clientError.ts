/**
 * Sanitizes raw backend, database, PostgREST, gateway, or network errors
 * into concise, client-friendly messages suitable for display to end users.
 */
const TECHNICAL_ERROR_PATTERNS: Array<{ pattern: RegExp; friendly: string }> = [
  {
    pattern:
      /fetch failed|network request failed|failed to fetch|networkerror|load failed|AbortError|timeout|timed out|ECONNREFUSED|ENOTFOUND/i,
    friendly: "Connection error. Please check your internet and try again.",
  },
  {
    pattern:
      /jwt|token|bearer|unauthorized|unauthenticated|auth0|oidc|session expired|invalid signature/i,
    friendly: "Your session has expired. Please sign in again.",
  },
  {
    pattern:
      /duplicate key|unique constraint|already exists|23505/i,
    friendly: "This record already exists. Please check your details.",
  },
  {
    pattern:
      /row-level security|rls|permission denied|42501|insufficient_privilege/i,
    friendly: "You do not have permission to perform this action.",
  },
  {
    pattern:
      /pgrst|postgres|supabase|column .* does not exist|relation .* does not exist|syntax error at or near|violates .* constraint|22P02|23503|23502|42P01|42703/i,
    friendly: "Unable to complete your request right now. Please try again.",
  },
  {
    pattern:
      /korapay|paystack|kora_secret_key|paystack_secret_key|webhook|502|503|504|bad gateway|service unavailable/i,
    friendly: "Payment service is temporarily busy. Please try again shortly.",
  },
  {
    pattern:
      /json parse|unexpected token|syntaxerror|cannot read propert|undefined is not an object|null is not an object|typeerror|referenceerror/i,
    friendly: "Something went wrong. Please try again.",
  },
];

export function toClientFriendlyError(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  const raw =
    typeof err === "string"
      ? err.trim()
      : err && typeof err === "object" && "message" in err && typeof (err as any).message === "string"
      ? (err as any).message.trim()
      : err && typeof err === "object" && "error" in err && typeof (err as any).error === "string"
      ? (err as any).error.trim()
      : "";

  if (!raw) return fallback;

  for (const { pattern, friendly } of TECHNICAL_ERROR_PATTERNS) {
    if (pattern.test(raw)) {
      return friendly;
    }
  }

  // Reject overly long stack traces or raw SQL/JSON dumps
  if (raw.length > 180 || raw.includes("{") || raw.includes("at ") || raw.includes("stack:")) {
    return fallback;
  }

  return raw;
}
