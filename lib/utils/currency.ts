/**
 * Universal Currency & Localization Helper for Xea / Paayh Global Operations.
 * Enforces dual-currency business rules:
 * - Nigeria -> NGN (₦)
 * - Outside Nigeria (Global) -> USD ($)
 */

export type PlatformCurrency = "NGN" | "USD";

export interface CurrencyConfig {
  code: PlatformCurrency;
  symbol: string;
  locale: string;
}

export const NIGERIAN_REGIONS = [
  "nigeria", "federal republic of nigeria", "ng", "nga", "ngn",
  "lagos", "lagos state", "abuja", "fct", "fct-abuja", "fct abuja", "federal capital territory",
  "abia", "abia state", "adamawa", "adamawa state", "akwa ibom", "akwa ibom state",
  "anambra", "anambra state", "bauchi", "bauchi state", "bayelsa", "bayelsa state",
  "benue", "benue state", "borno", "borno state", "cross river", "cross river state",
  "delta", "delta state", "ebonyi", "ebonyi state", "edo", "edo state",
  "ekiti", "ekiti state", "enugu", "enugu state", "gombe", "gombe state",
  "imo", "imo state", "jigawa", "jigawa state", "kaduna", "kaduna state",
  "kano", "kano state", "katsina", "katsina state", "kebbi", "kebbi state",
  "kogi", "kogi state", "kwara", "kwara state", "nasarawa", "nasarawa state",
  "niger state", "ogun", "ogun state", "ondo", "ondo state", "osun", "osun state",
  "oyo", "oyo state", "plateau", "plateau state", "rivers", "rivers state",
  "sokoto", "sokoto state", "taraba", "taraba state", "yobe", "yobe state",
  "zamfara", "zamfara state", "port harcourt", "portharcourt", "ibadan", "calabar",
  "asaba", "warri", "benin city", "onitsha", "aba", "uyo", "nnewi",
  "abeokuta", "akure", "ilorin", "jos", "maiduguri", "zaria", "owerri", "awka",
  "makurdi", "yola", "minna", "lokoja", "osogbo", "ado-ekiti", "ado ekiti",
  "abakaliki", "lafia", "jalingo", "damaturu", "gusau", "birnin kebbi", "dutse", "yenagoa"
];

const NIGERIAN_REGION_SET = new Set(NIGERIAN_REGIONS);
const DEFAULT_NGN_SENTINELS = new Set(["null", "undefined", "placeholder"]);

export const NGN_PER_USD = 1500; // Pegged platform reference rate: $1 USD = ₦1,500 NGN

/**
 * Resolves currency code from user country using exact token & segment matching
 * (never substring matching, so UK/England/Singapore/Hong Kong/Angola/Congo/Hungary/Niger stay USD).
 */
export function getUserCurrency(country?: string | null): PlatformCurrency {
  if (!country || !country.trim()) return "NGN"; // Default fallback
  const clean = country.trim().toLowerCase().replace(/\s+/g, " ");
  if (DEFAULT_NGN_SENTINELS.has(clean) || NIGERIAN_REGION_SET.has(clean) || /\bnigeria\b/.test(clean)) {
    return "NGN";
  }
  const segments = clean
    .split(/[,;/|]+|\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.some((seg) => NIGERIAN_REGION_SET.has(seg))) {
    return "NGN";
  }
  return "USD";
}

/**
 * Returns currency symbol and locale config
 */
export function getCurrencyConfig(country?: string | null): CurrencyConfig {
  const code = getUserCurrency(country);
  if (code === "NGN") {
    return {
      code: "NGN",
      symbol: "₦",
      locale: "en-NG",
    };
  }
  return {
    code: "USD",
    symbol: "$",
    locale: "en-US",
  };
}

/**
 * Converts standard NGN amount to USD at the platform reference rate ($1 = ₦1,500)
 */
export function convertNgnToUsd(amountNgn: number): number {
  return Math.round((amountNgn / NGN_PER_USD) * 100) / 100;
}

/**
 * Converts USD amount to NGN at the platform reference rate ($1 = ₦1,500)
 */
export function convertUsdToNgn(amountUsd: number): number {
  return Math.round(amountUsd * NGN_PER_USD * 100) / 100;
}

/**
 * Formats a monetary amount according to the user's regional currency.
 * If user is outside Nigeria, converts base NGN amounts to USD ($).
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  country?: string | null,
  options?: { convertFromNgn?: boolean; showBoth?: boolean }
): string {
  const val = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  const isUSD = getUserCurrency(country) === "USD";

  if (isNaN(val)) {
    return isUSD ? "$0.00" : "₦0.00";
  }

  if (isUSD) {
    // Only NGN-denominated ledger values (wallet balances, earnings, withdrawals) are converted.
    // Amounts already priced in USD (e.g. localized advertiser floor rates) are shown as-is.
    const isAlreadyUsd = !options?.convertFromNgn;
    const usdVal = isAlreadyUsd ? val : val / NGN_PER_USD;
    const formattedUsd = `$${usdVal.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    if (options?.showBoth) {
      const ngnVal = isAlreadyUsd ? val * NGN_PER_USD : val;
      return `${formattedUsd} (~₦${ngnVal.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })})`;
    }
    return formattedUsd;
  }

  return `₦${val.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Converts standard currency unit to minor unit (Kobo for NGN, Cents for USD)
 * Prevents floating-point rounding errors.
 */
export function toMinorUnit(amount: number): number {
  return Math.round(amount * 100);
}

export const MIN_AD_ATTENTIONS = 100;
export const MAX_AD_DURATION_DAYS = 90;
export const PRODUCT_SALES_SUBSIDY_MULTIPLIER = 0.7;

// Floor rates in NGN
export const NGN_AD_RATES: Record<string, number> = {
  politics: 900,
  business: 45,
  government: 750,
  individual: 25,
  religion: 900,
  product_sales: 55,
};

// Floor rates in USD with 4x value baseline (NGN / 1500 * 4)
export const USD_AD_RATES: Record<string, number> = {
  politics: 2.40,
  business: 0.12,
  government: 2.00,
  individual: 0.07,
  religion: 2.40,
  product_sales: 0.15,
};

export const AD_FLOOR_CATEGORIES = Object.keys(NGN_AD_RATES) as readonly string[];

export function isValidAdCategory(category: string): boolean {
  return Object.prototype.hasOwnProperty.call(NGN_AD_RATES, category.trim().toLowerCase());
}

/**
 * Extracts a lowercase hostname (stripping leading `www.`) from an HTTP(S) URL.
 * Returns null for malformed, relative, or non-HTTP(S) URLs to prevent spoofing.
 */
export function extractNormalizedHostname(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!hostname || !hostname.includes(".")) return null;
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Builds exact and parent domain candidates for `premium_subscribers.domain` matching
 * (e.g. `shop.baggyt.com` -> `["shop.baggyt.com", "baggyt.com"]`).
 */
export function buildCandidateSubscriberDomains(hostname: string): string[] {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  const candidates: string[] = [];
  for (let i = 0; i <= parts.length - 2; i++) {
    candidates.push(parts.slice(i).join("."));
  }
  return Array.from(new Set(candidates));
}

export function applyProductSalesSubsidy(baseFloorRate: number): number {
  return Number((baseFloorRate * PRODUCT_SALES_SUBSIDY_MULTIPLIER).toFixed(4));
}

/**
 * Returns localized floor cost per attention for an ad category
 */
export function getLocalizedAdFloorRate(category: string, country?: string | null): number {
  const isUSD = getUserCurrency(country) === "USD";
  const cat = category.trim().toLowerCase();
  if (isUSD) {
    return USD_AD_RATES[cat] ?? 0.07;
  }
  return NGN_AD_RATES[cat] ?? 25;
}

/**
 * Returns localized highlight creation floor price
 */
export function getLocalizedHighlightFloorRate(country?: string | null): number {
  const isUSD = getUserCurrency(country) === "USD";
  return isUSD ? 3.00 : 1000.00;
}

/**
 * Returns canonical NGN highlight floor rate ($3 -> ₦4,500 NGN for global advertisers; ₦1,000 NGN for Nigeria)
 */
export function getCanonicalHighlightFloorRateNgn(country?: string | null): number {
  const isUSD = getUserCurrency(country) === "USD";
  return isUSD ? convertUsdToNgn(3.00) : 1000.00;
}

/**
 * Returns localized monetization subscription fees
 */
export function getLocalizedMonetizationRate(type: "standard" | "instant", country?: string | null): number {
  const isUSD = getUserCurrency(country) === "USD";
  if (isUSD) {
    return type === "instant" ? 8.00 : 3.00;
  }
  return type === "instant" ? 3000.00 : 1000.00;
}
