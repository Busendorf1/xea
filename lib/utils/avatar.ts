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

export function getInitials(text?: string | null): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text.trim().replace(/^[@#]/, "").trim();
  if (!cleaned) return "";

  // If it's an email address, extract the username before '@'
  if (cleaned.includes("@")) {
    cleaned = cleaned.split("@")[0].trim();
  }
  if (!cleaned) return "";

  const words = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0][0] || "";
    const second = words[1][0] || "";
    return `${first}${second}`.toUpperCase();
  }
  if (cleaned.length <= 2) {
    return cleaned.toUpperCase();
  }
  return cleaned[0].toUpperCase();
}

export const AVATAR_GRADIENTS: [string, string][] = [
  ["#1d9bf0", "#0284c7"], // Paayh Blue
  ["#6366f1", "#4338ca"], // Indigo
  ["#8b5cf6", "#6d28d9"], // Purple
  ["#ec4899", "#be185d"], // Pink
  ["#f43f5e", "#b91c1c"], // Rose
  ["#f97316", "#c2410c"], // Orange
  ["#f59e0b", "#b45309"], // Amber
  ["#10b981", "#047857"], // Emerald
  ["#06b6d4", "#0f766e"], // Cyan
  ["#3b82f6", "#1d4ed8"], // Blue
];

export function getAvatarColors(text: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

