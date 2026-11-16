import { isExemptFromBarriersAndInactivity } from "../adminHelper";
import { isDefaultProviderAvatar } from "./avatar";

export interface ProfileDisplayLike {
  email?: string | null;
  username?: string | null;
  business_name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImage?: string | null;
  logo?: string | null;
  avatar_url?: string | null;
  gender?: string | null;
  monetized?: boolean | string | null;
  monetization_clicks?: number | string | null;
  has_cancelled_monetization?: boolean | null;
  is_career?: boolean | null;
  is_affiliate?: boolean | null;
  affiliate_role?: string | null;
  isExemptFromBarriersAndInactivity?: boolean | null;
}

/**
 * Resolves the advertiser or highlight publisher's effective logo URL.
 * Prefers an explicit custom sponsor logo when non-empty and valid,
 * then falls back to the user's profile image fields.
 */
export function resolveUserLogoUrl(
  customLogo?: string | null,
  profile?: ProfileDisplayLike | null,
  fallbackSessionImage?: string | null
): string | null {
  const candidates = [
    customLogo,
    profile?.profileImage,
    profile?.logo,
    profile?.avatar_url,
    fallbackSessionImage,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed && !isDefaultProviderAvatar(trimmed)) {
        return trimmed;
      }
    }
  }
  return null;
}

/**
 * Returns true when an account qualifies for the monetized VerifiedBadge:
 * monetized true/"true"/"yes", exempt special role/admin, or >= 500 live clicks
 * (unless monetization was explicitly cancelled).
 */
export function isProfileMonetizedBadgeEligible(profile?: ProfileDisplayLike | null): boolean {
  if (!profile) return false;
  if (profile.has_cancelled_monetization === true) return false;

  const rawMonetized = profile.monetized;
  const normalized =
    typeof rawMonetized === "string" ? rawMonetized.trim().toLowerCase() : rawMonetized;
  if (normalized === true || normalized === "true" || normalized === "yes") {
    return true;
  }

  if (profile.isExemptFromBarriersAndInactivity === true) {
    return true;
  }
  if (isExemptFromBarriersAndInactivity(profile.email, profile)) {
    return true;
  }

  const clicks = Number(profile.monetization_clicks ?? 0);
  if (!Number.isNaN(clicks) && clicks >= 500) {
    return true;
  }

  return false;
}

/**
 * Resolves a human-readable brand / publisher display name consistent with feed cards.
 */
export function resolvePublisherDisplayName(options: {
  customName?: string | null;
  profile?: ProfileDisplayLike | null;
  email?: string | null;
  fallbackName?: string | null;
}): string {
  const { customName, profile, email, fallbackName } = options;
  if (customName && customName.trim()) return customName.trim();
  if (profile?.business_name && profile.business_name.trim()) {
    return profile.business_name.trim();
  }
  const fullName = `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim();
  if (fullName) return fullName;
  if (profile?.username && profile.username.trim()) return profile.username.trim();
  if (fallbackName && fallbackName.trim()) return fallbackName.trim();

  const resolvedEmail = (profile?.email || email || "").trim();
  if (resolvedEmail) {
    const local = resolvedEmail.split("@")[0];
    if (local) return local;
  }
  return "Advertiser";
}

/**
 * Resolves the formatted @handle or email identifier for feed cards & previews.
 */
export function resolvePublisherHandle(
  customHandle?: string | null,
  profile?: ProfileDisplayLike | null,
  email?: string | null
): string {
  if (customHandle && customHandle.trim()) {
    return customHandle.trim();
  }
  if (profile?.username && profile.username.trim()) {
    return `@${profile.username.trim().replace(/^@+/, "")}`;
  }
  return (profile?.email || email || "").trim();
}
