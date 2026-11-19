export const CANONICAL_WEB_ORIGIN = "https://paayh.com";

/**
 * Normalizes a referral code or accidental invite URL down to its single code.
 */
export function normalizeReferralCode(rawCode: string | null | undefined): string {
  const trimmed = String(rawCode || "").trim();
  if (!trimmed) return "";
  const refMatch = trimmed.match(/[?&]ref=([^&#\s]+)/i);
  if (refMatch?.[1]) {
    try {
      return decodeURIComponent(refMatch[1]).trim();
    } catch {
      return refMatch[1].trim();
    }
  }
  return trimmed;
}

/**
 * Builds one canonical invite URL pointing to `/join?ref=<CODE>`.
 */
export function buildInviteUrl(
  rawCode?: string | null,
  origin: string = CANONICAL_WEB_ORIGIN
): string {
  const cleanOrigin = (origin || CANONICAL_WEB_ORIGIN).replace(/\/+$/, "");
  const code = normalizeReferralCode(rawCode);
  return code ? `${cleanOrigin}/join?ref=${encodeURIComponent(code)}` : cleanOrigin;
}
