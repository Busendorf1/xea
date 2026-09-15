/**
 * Avatar utilities for detecting auto-generated provider avatars vs manually set logos.
 * Accounts that have not manually uploaded a photo or logo default to the silhouette placeholder.
 */

export function isDefaultProviderAvatar(url?: string | null): boolean {
  if (!url || typeof url !== "string") return true;
  const trimmed = url.trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();
  if (
    lower === "undefined" ||
    lower === "null" ||
    lower === "none" ||
    lower === "false" ||
    lower === "placeholder"
  ) {
    return true;
  }

  // Auth0 default avatar CDN or Gravatar fallback to Auth0
  if (
    lower.includes("cdn.auth0.com/avatars") ||
    lower.includes("auth0.com/avatars") ||
    (lower.includes("auth0.com") && lower.includes("avatar"))
  ) {
    return true;
  }

  // Gravatar (default avatars or auto-assigned Gravatar URLs on signup)
  if (
    lower.includes("gravatar.com/avatar") ||
    lower.includes("s.gravatar.com") ||
    lower.includes("secure.gravatar.com") ||
    lower.includes("www.gravatar.com")
  ) {
    return true;
  }

  // Common automated letter / placeholder avatar services
  if (
    lower.includes("ui-avatars.com") ||
    lower.includes("dicebear.com") ||
    lower.includes("avatar.vercel.sh") ||
    lower.includes("wp.com/avatar") ||
    lower.includes("default-user") ||
    lower.includes("default_avatar") ||
    lower.includes("default-avatar") ||
    lower.includes("avatar-placeholder") ||
    lower.includes("placeholder-avatar")
  ) {
    return true;
  }

  return false;
}

export function hasManualAvatar(url?: string | null): boolean {
  return !isDefaultProviderAvatar(url);
}
