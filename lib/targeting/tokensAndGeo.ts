import crypto from "crypto";
import { env } from "../env";
import type { ViewerTargetingProfile } from "./types";

export const WILDCARD_VALUES = new Set([
  "all",
  "any",
  "global",
  "everyone",
  "both",
  "none",
  "n/a",
  "placeholder",
  "*",
]);

/**
 * Shared secret resolver for HMAC-SHA256 earn/impression tokens.
 */
export function getEarnTokenSecret(): string {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.RENDER === "true";

  const secret =
    process.env.EARN_TOKEN_SECRET || env.AUTH0_SECRET || process.env.AUTH0_SECRET;

  if (!secret || secret === "xea-default-auth0-secret-key-32ch") {
    if (isProduction) {
      console.error(
        "🚨 CRITICAL: Insecure default or missing earn token secret in production environment!"
      );
      return "";
    }
    return "xea-default-auth0-secret-key-32ch";
  }

  return secret;
}

/**
 * Signs an ad impression token for a specific viewer and timestamp.
 */
export function signAdImpressionToken(
  adId: string,
  viewerEmail: string,
  servedAt: number
): string {
  const secretKey = getEarnTokenSecret();
  const payload = `${adId}:${viewerEmail.toLowerCase().trim()}:${servedAt}`;
  return crypto.createHmac("sha256", secretKey).update(payload).digest("hex");
}

/**
 * Parses a potentially JSON-encoded, comma-separated, or array field into normalized lowercase tokens.
 */
export function normalizeStringArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .flatMap((item) => normalizeStringArray(item))
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
        }
      } catch {
        // Fallback to manual split
      }
    }
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((s) => s.replace(/^"+|"+$/g, "").trim().toLowerCase())
        .filter(Boolean);
    }
    return trimmed
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return [String(val).trim().toLowerCase()].filter(Boolean);
}

export function isUnrestrictedTarget(tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  return tokens.some((t) => WILDCARD_VALUES.has(t));
}

export function normalizeLocationToken(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (
    lower === "fct" ||
    lower === "abuja" ||
    lower.includes("abuja") ||
    lower.includes("federal capital territory") ||
    /\bfct\b/.test(lower)
  ) {
    return "fct";
  }
  return lower
    .replace(/\b(state|province|region|territory)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function normalizeGender(raw: string | null | undefined): string {
  if (!raw) return "";
  const clean = raw.trim().toLowerCase();
  if (clean === "m" || clean === "male" || clean === "man" || clean === "men") return "male";
  if (clean === "f" || clean === "female" || clean === "woman" || clean === "women") return "female";
  return clean;
}

export function getViewerAge(profile: ViewerTargetingProfile): number | null {
  if (typeof profile.age === "number" && !isNaN(profile.age) && profile.age > 0) {
    return profile.age;
  }
  if (!profile.dob) return null;
  const dobStr = String(profile.dob).trim();
  if (!dobStr || dobStr === "1970-01-01" || dobStr === "PLACEHOLDER") return null;
  const birthDate = new Date(dobStr);
  if (isNaN(birthDate.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }
  return age > 0 && age < 120 ? age : null;
}

export function matchesAgeRange(viewerAge: number | null, adAgeRangeRaw: unknown): boolean {
  if (!adAgeRangeRaw) return true;
  if (viewerAge === null) return true;

  if (Array.isArray(adAgeRangeRaw) && adAgeRangeRaw.length === 2) {
    const n0 = Number(adAgeRangeRaw[0]);
    const n1 = Number(adAgeRangeRaw[1]);
    if (
      !isNaN(n0) &&
      !isNaN(n1) &&
      !String(adAgeRangeRaw[0]).includes("-") &&
      !String(adAgeRangeRaw[1]).includes("-")
    ) {
      const minAge = Math.min(n0, n1);
      const maxAge = Math.max(n0, n1);
      return viewerAge >= minAge && viewerAge <= maxAge;
    }
  }

  const ranges = normalizeStringArray(adAgeRangeRaw);
  if (isUnrestrictedTarget(ranges)) return true;

  if (ranges.length === 2 && /^\d{1,3}$/.test(ranges[0]) && /^\d{1,3}$/.test(ranges[1])) {
    const n0 = parseInt(ranges[0], 10);
    const n1 = parseInt(ranges[1], 10);
    const minAge = Math.min(n0, n1);
    const maxAge = Math.max(n0, n1);
    return viewerAge >= minAge && viewerAge <= maxAge;
  }

  for (const range of ranges) {
    if (WILDCARD_VALUES.has(range)) return true;

    const plusMatch = range.match(/^(\d{1,3})\s*\+$/);
    if (plusMatch) {
      if (viewerAge >= parseInt(plusMatch[1], 10)) return true;
      continue;
    }

    const spanMatch = range.match(/^(\d{1,3})\s*[-–to]+\s*(\d{1,3})$/);
    if (spanMatch) {
      const minAge = parseInt(spanMatch[1], 10);
      const maxAge = parseInt(spanMatch[2], 10);
      if (viewerAge >= minAge && viewerAge <= maxAge) return true;
      continue;
    }

    const exactMatch = range.match(/^(\d{1,3})$/);
    if (exactMatch && viewerAge === parseInt(exactMatch[1], 10)) {
      return true;
    }
  }

  return false;
}
