/**
 * Shared helpers for Ad sharing links, inquiry prefilled messages (WhatsApp / Email / Share Sheet),
 * and backwards-compatible extraction of shared ad IDs from URL parameters.
 */

export const CANONICAL_WEB_ORIGIN = "https://paayh.com";
export const APP_CUSTOM_SCHEME = "xea";
export const AD_UNAVAILABLE_MESSAGE = "This ad is no longer available";
export const AD_UNAVAILABLE_DISMISS_MS = 5000;

export interface ShareableAdSummary {
  id?: string | null;
  ad_content?: string | null;
  product_name?: string | null;
  custom_sponsor_name?: string | null;
}

export function getPublicShareOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      return origin;
    }
  }
  return CANONICAL_WEB_ORIGIN;
}

/**
 * Generates clean Universal Link / Android App Link compatible URL for an ad.
 * Example: https://paayh.com/ad/<id>
 */
export function buildAdShareUrl(adId: string, origin?: string): string {
  const cleanId = String(adId || "").trim();
  const baseOrigin = (origin || getPublicShareOrigin()).replace(/\/+$/, "");
  if (!cleanId) return baseOrigin;
  return `${baseOrigin}/ad/${encodeURIComponent(cleanId)}`;
}

/**
 * Generates custom mobile app scheme deep link (e.g. xea://ad/<id>)
 */
export function buildAdAppSchemeUrl(adId: string): string {
  const cleanId = String(adId || "").trim();
  return cleanId ? `${APP_CUSTOM_SCHEME}://ad/${encodeURIComponent(cleanId)}` : `${APP_CUSTOM_SCHEME}://feed`;
}

/**
 * Builds rich, advertiser-aware inquiry message carrying the specific ad link & context.
 */
export function buildAdInquiryMessage(ad?: ShareableAdSummary | null, origin?: string): string {
  const shareUrl = ad?.id ? buildAdShareUrl(ad.id, origin) : getPublicShareOrigin();
  const rawSnippet =
    (ad?.product_name && ad.product_name.trim()) ||
    (ad?.ad_content && ad.ad_content.trim()) ||
    "";
  const cleanSnippet = rawSnippet.replace(/\s+/g, " ").trim();
  const truncated =
    cleanSnippet.length > 70 ? `${cleanSnippet.slice(0, 67).trim()}...` : cleanSnippet;

  if (truncated) {
    return `Hi, I'm interested in your ad on Paayh: "${truncated}"\nTell me more: ${shareUrl}`;
  }
  return `Hi, I'm interested in your ad on Paayh. Tell me more: ${shareUrl}`;
}

export function buildAdSharePayload(ad: ShareableAdSummary, origin?: string): {
  title: string;
  text: string;
  url: string;
} {
  const url = ad?.id ? buildAdShareUrl(ad.id, origin) : getPublicShareOrigin();
  const sponsor = ad?.custom_sponsor_name?.trim();
  const rawSnippet = (ad?.product_name || ad?.ad_content || "").replace(/\s+/g, " ").trim();
  const snippet = rawSnippet.length > 90 ? `${rawSnippet.slice(0, 87).trim()}...` : rawSnippet;

  const title = sponsor ? `${sponsor} on Paayh` : "Check out this ad on Paayh";
  const text = snippet
    ? `${snippet} — See this ad on Paayh`
    : "Check out this ad on Paayh";

  return { title, text, url };
}

export async function shareAdToDeviceOrClipboard(
  ad: ShareableAdSummary,
  showToast?: (message: string) => void,
  onFallbackShare?: (adId: string) => void
): Promise<void> {
  const payload = buildAdSharePayload(ad);

  if (typeof window !== "undefined" && typeof navigator !== "undefined") {
    const isMobileUa = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    if (isMobileUa && typeof navigator.share === "function") {
      try {
        await navigator.share(payload);
        return;
      } catch (err: any) {
        // User cancelled native share sheet — do not fall back to unexpected error
        if (err?.name === "AbortError") return;
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(payload.url);
        showToast?.("Link copied to clipboard");
        return;
      } catch {
        // Fall through
      }
    }
  }

  if (ad?.id && onFallbackShare) {
    onFallbackShare(ad.id);
  }
}

/**
 * Formats CTA hrefs cleanly so WhatsApp & Email carry the ad context + link.
 */
export function buildAdActionHref(
  type: string,
  value: string,
  ad?: ShareableAdSummary | null
): string {
  if (!value) return "#";

  if (type === "action_whatsapp") {
    const cleanPhone = value.replace(/[^0-9+]/g, "");
    const message = buildAdInquiryMessage(ad);
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  if (type === "action_email") {
    const rawEmail = value.trim();
    const subject = ad?.product_name?.trim()
      ? `I'm interested: ${ad.product_name.trim().slice(0, 60)}`
      : "I'm interested in your ad on Paayh";
    const body = buildAdInquiryMessage(ad);
    return `mailto:${rawEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  if (type === "action_phone") {
    return `tel:${value.replace(/[^0-9+]/g, "")}`;
  }

  if (type === "action_website") {
    const clean = value.trim();
    if (/^https?:\/\//i.test(clean)) return clean;
    return `https://${clean}`;
  }

  return value;
}

/**
 * Safely decodes legacy base64-encoded ad IDs or plain IDs from shared query params.
 */
export function decodeSharedAdParam(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // UUID or simple ID directly
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }

  // Legacy base64 encoded ID
  try {
    const decoded =
      typeof atob === "function"
        ? atob(trimmed)
        : Buffer.from(trimmed, "base64").toString("utf8");
    const cleanDecoded = decoded.trim();
    if (cleanDecoded && /^[a-zA-Z0-9_-]{3,128}$/.test(cleanDecoded)) {
      return cleanDecoded;
    }
  } catch {
    // Fall through if not base64
  }

  if (/^[a-zA-Z0-9_-]{3,128}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Extracts shared ad ID from URLSearchParams across canonical & legacy share formats.
 */
export function extractSharedAdIdFromSearchParams(params: URLSearchParams): string | null {
  const direct = params.get("sharedAdId") || params.get("adId") || params.get("ad");
  if (direct) {
    const decoded = decodeSharedAdParam(direct);
    if (decoded) return decoded;
  }

  const legacy = params.get("Earn Ads by Paayh") || params.get("blurb");
  if (legacy) {
    return decodeSharedAdParam(legacy);
  }

  return null;
}
