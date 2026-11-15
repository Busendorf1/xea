/**
 * Normalizes malformed query strings (for example when a payment gateway appends
 * `?reference=...` onto a callback URL that already contains `?view=myads`)
 * before constructing URLSearchParams.
 */
export function normalizeSearchString(search: string): string {
  const raw = String(search || "").trim();
  if (!raw) return "";
  const withoutLeadingQuestion = raw.replace(/^\?+/, "");
  if (!withoutLeadingQuestion) return "";
  return `?${withoutLeadingQuestion.replace(/\?/g, "&")}`;
}

export function parseNormalizedSearchParams(search: string): URLSearchParams {
  const normalized = normalizeSearchString(search);
  return new URLSearchParams(normalized.startsWith("?") ? normalized.slice(1) : normalized);
}
