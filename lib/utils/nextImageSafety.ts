const NEXT_IMAGE_ALLOWED_SUFFIXES = [
  ".paayh.com",
  ".supabase.co",
  ".supabase.in",
  ".googleusercontent.com",
  ".gravatar.com",
];

/**
 * Checks whether an image `src` is permitted by `images.remotePatterns` in
 * `next.config.ts` so components can fall back to `<img>` instead of crashing
 * Next.js `<Image>` on unconfigured hosts or `data:` URIs.
 */
export function isConfiguredNextImageSrc(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol === "http:") {
      return host === "localhost" || host === "127.0.0.1";
    }
    if (parsed.protocol !== "https:") return false;
    if (host === "paayh.com") return true;
    return NEXT_IMAGE_ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}
