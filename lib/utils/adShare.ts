/**
 * Shared helpers for Ad sharing links, inquiry prefilled messages (WhatsApp / Email / Share Sheet),
 * and backwards-compatible extraction of shared ad IDs from URL parameters.
 */

export const CANONICAL_WEB_ORIGIN = "https://paayh.com";
export const APP_CUSTOM_SCHEME = "xea-auth";
export const AD_UNAVAILABLE_MESSAGE = "This ad is no longer available";
export const AD_UNAVAILABLE_DISMISS_MS = 5000;

export interface ShareableAdSummary {
  id?: string | null;
  ad_content?: string | null;
  product_name?: string | null;
  custom_sponsor_name?: string | null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLURB_TOKEN_REGEX = /^(?:[a-z0-9-]+-)?b_([A-Za-z0-9_-]{24})$/;
const BLURB_MASK_KEY = [0x50, 0x61, 0x61, 0x79, 0x68, 0x41, 0x64, 0x42, 0x6c, 0x75, 0x72, 0x62, 0x32, 0x30, 0x32, 0x36];
const B64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function uuidToBytes(uuid: string): number[] | null {
  if (!UUID_REGEX.test(uuid)) return null;
  const hex = uuid.replace(/-/g, "").toLowerCase();
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) {
    const val = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (!Number.isFinite(val)) return null;
    bytes.push(val);
  }
  return bytes;
}

function bytesToUuid(bytes: number[]): string {
  const hex = bytes.map((b) => (b & 0xff).toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function computeBlurbTag16(bytes: number[]): [number, number] {
  let h = 0x9e37;
  for (let i = 0; i < bytes.length; i++) {
    h = ((h * 33) ^ bytes[i] ^ ((i + 1) * 17)) & 0xffff;
  }
  return [h & 0xff, (h >>> 8) & 0xff];
}

function encodeBytes18ToBase64Url(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64URL_ALPHABET[b0 >> 2];
    out += B64URL_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += B64URL_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    out += B64URL_ALPHABET[b2 & 0x3f];
  }
  return out;
}

function decodeBase64UrlToBytes18(token: string): number[] | null {
  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) return null;
  const bytes: number[] = [];
  for (let i = 0; i < 24; i += 4) {
    const c0 = B64URL_ALPHABET.indexOf(token[i]);
    const c1 = B64URL_ALPHABET.indexOf(token[i + 1]);
    const c2 = B64URL_ALPHABET.indexOf(token[i + 2]);
    const c3 = B64URL_ALPHABET.indexOf(token[i + 3]);
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) return null;
    bytes.push((c0 << 2) | (c1 >> 4));
    bytes.push(((c1 & 0x0f) << 4) | (c2 >> 2));
    bytes.push(((c2 & 0x03) << 6) | c3);
  }
  return bytes;
}

function buildBlurbSlug(ad?: ShareableAdSummary | null): string {
  const raw = (ad?.product_name || ad?.custom_sponsor_name || ad?.ad_content || "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const clipped = raw.slice(0, 28).replace(/-+$/g, "");
  return clipped || "featured-offer";
}

/**
 * Masks an ad UUID into a URL-safe, stateless, deterministic blurb slug + token
 * (e.g. "nike-air-max-b_kQ9x..."). Non-UUID legacy/test IDs pass through untouched.
 */
export function encodeAdBlurbToken(adOrId: string | ShareableAdSummary | null | undefined): string {
  const isObj = Boolean(adOrId && typeof adOrId === "object");
  const rawId = String(isObj ? (adOrId as ShareableAdSummary).id || "" : adOrId || "").trim();
  if (!rawId) return "";
  const canonicalId = decodeSharedAdParam(rawId) || rawId;
  const rawBytes = uuidToBytes(canonicalId);
  if (!rawBytes) return canonicalId;

  const [tag0, tag1] = computeBlurbTag16(rawBytes);
  const masked: number[] = [tag0, tag1];
  for (let i = 0; i < 16; i++) {
    const keyByte = BLURB_MASK_KEY[i] ^ (i % 2 === 0 ? tag0 : tag1) ^ ((i * 29 + 7) & 0xff);
    masked.push(rawBytes[i] ^ keyByte);
  }
  const slug = buildBlurbSlug(isObj ? (adOrId as ShareableAdSummary) : null);
  return `${slug}-b_${encodeBytes18ToBase64Url(masked)}`;
}

export function decodeAdBlurbToken(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const match = raw.trim().match(BLURB_TOKEN_REGEX);
  if (!match?.[1]) return null;
  const bytes18 = decodeBase64UrlToBytes18(match[1]);
  if (!bytes18 || bytes18.length !== 18) return null;

  const [tag0, tag1] = bytes18;
  const raw16: number[] = [];
  for (let i = 0; i < 16; i++) {
    const keyByte = BLURB_MASK_KEY[i] ^ (i % 2 === 0 ? tag0 : tag1) ^ ((i * 29 + 7) & 0xff);
    raw16.push(bytes18[i + 2] ^ keyByte);
  }
  const [exp0, exp1] = computeBlurbTag16(raw16);
  if (exp0 !== tag0 || exp1 !== tag1) return null;
  return bytesToUuid(raw16);
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
 * Generates clean Universal Link / Android App Link compatible URL for an ad,
 * masking UUIDs behind a readable blurb token (e.g. https://paayh.com/ad/featured-offer-b_...).
 */
export function buildAdShareUrl(adOrId: string | ShareableAdSummary, origin?: string): string {
  const token = encodeAdBlurbToken(adOrId);
  const baseOrigin = (origin || getPublicShareOrigin()).replace(/\/+$/, "");
  if (!token) return baseOrigin;
  return `${baseOrigin}/ad/${encodeURIComponent(token)}`;
}

/**
 * Generates custom mobile app scheme deep link (e.g. xea-auth://ad/<blurb-or-id>)
 */
export function buildAdAppSchemeUrl(adOrId: string | ShareableAdSummary): string {
  const token = encodeAdBlurbToken(adOrId);
  return token ? `${APP_CUSTOM_SCHEME}://ad/${encodeURIComponent(token)}` : `${APP_CUSTOM_SCHEME}://feed`;
}

/**
 * Builds rich, advertiser-aware inquiry message carrying the specific ad link & context.
 */
export function buildAdInquiryMessage(ad?: ShareableAdSummary | null, origin?: string): string {
  const shareUrl = ad?.id ? buildAdShareUrl(ad, origin) : getPublicShareOrigin();
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
  const url = ad?.id ? buildAdShareUrl(ad, origin) : getPublicShareOrigin();
  const sponsor = ad?.custom_sponsor_name?.trim();
  const rawSnippet = (ad?.product_name || ad?.ad_content || "").replace(/\s+/g, " ").trim();
  const snippet = rawSnippet.length > 90 ? `${rawSnippet.slice(0, 87).trim()}...` : rawSnippet;

  const title = sponsor ? `${sponsor} on Paayh` : "Check out this ad on Paayh";
  const text = snippet
    ? `${snippet} — See this ad on Paayh`
    : "Check out this ad on Paayh";

  return { title, text, url };
}

function copyTextFallback(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
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

    const copiedSync = copyTextFallback(payload.url);
    if (navigator.clipboard?.writeText) {
      if (copiedSync) {
        // Fire-and-forget modern clipboard write after immediate synchronous copy so toast is instant
        void navigator.clipboard.writeText(payload.url).catch(() => {});
        showToast?.("Link copied to clipboard");
        return;
      }
      try {
        await navigator.clipboard.writeText(payload.url);
        showToast?.("Link copied to clipboard");
        return;
      } catch {
        // Fall through
      }
    } else if (copiedSync) {
      showToast?.("Link copied to clipboard");
      return;
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
  let trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes("%")) {
    try {
      trimmed = decodeURIComponent(trimmed).trim();
    } catch {}
  }

  // Blurb-masked UUID token (e.g. featured-offer-b_<24-char-base64url>)
  const unmaskedUuid = decodeAdBlurbToken(trimmed);
  if (unmaskedUuid) {
    return unmaskedUuid;
  }

  // UUID directly (normalized to lowercase so client/server comparisons always match)
  if (UUID_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Legacy base64 encoded ID — require canonical base64 round-trip so short raw IDs (e.g. "a9") are never corrupted
  if (/^[A-Za-z0-9+/]{4,}={0,2}$/.test(trimmed)) {
    try {
      const decoded =
        typeof atob === "function"
          ? atob(trimmed)
          : Buffer.from(trimmed, "base64").toString("utf8");
      const cleanDecoded = decoded.trim();
      const reencoded =
        typeof btoa === "function"
          ? btoa(cleanDecoded)
          : Buffer.from(cleanDecoded, "utf8").toString("base64");
      if (
        cleanDecoded &&
        reencoded.replace(/=+$/, "") === trimmed.replace(/=+$/, "") &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(cleanDecoded)
      ) {
        return UUID_REGEX.test(cleanDecoded) ? cleanDecoded.toLowerCase() : cleanDecoded;
      }
    } catch {
      // Fall through if not valid base64
    }
  }

  if (/^[a-zA-Z0-9_-]{1,128}$/.test(trimmed)) {
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
