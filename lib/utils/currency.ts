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

const NIGERIAN_REGIONS = [
  "nigeria", "ng", "nga", "ngn", "lagos", "abuja", "fct", "fct-abuja",
  "abia", "adamawa", "akwa ibom", "anambra", "bauchi", "bayelsa", "benue", "borno",
  "cross river", "delta", "ebonyi", "edo", "ekiti", "enugu", "gombe", "imo",
  "jigawa", "kaduna", "kano", "katsina", "kebbi", "kogi", "kwara", "nasarawa",
  "niger", "ogun", "ondo", "osun", "oyo", "plateau", "rivers", "sokoto",
  "taraba", "yobe", "zamfara", "port harcourt", "portharcourt", "ibadan", "calabar",
  "asaba", "warri", "benin city", "onitsha", "aba", "uyo", "nnewi", "enugu"
];

/**
 * Resolves currency code from user country
 */
export function getUserCurrency(country?: string | null): PlatformCurrency {
  if (!country || !country.trim()) return "NGN"; // Default fallback
  const clean = country.trim().toLowerCase();
  if (
    clean === "null" ||
    clean === "undefined" ||
    clean === "placeholder" ||
    NIGERIAN_REGIONS.some((r) => clean === r || clean.includes(r))
  ) {
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
 * Formats a monetary amount according to the user's regional currency
 */
export function formatCurrency(amount: number | string | null | undefined, country?: string | null): string {
  const val = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  if (isNaN(val)) {
    const config = getCurrencyConfig(country);
    return `${config.symbol}0.00`;
  }

  const config = getCurrencyConfig(country);
  return `${config.symbol}${val.toLocaleString(config.locale, {
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

// Floor rates in NGN
export const NGN_AD_RATES: Record<string, number> = {
  politics: 1500,
  business: 45,
  government: 2000,
  individual: 25,
  religion: 1500,
  product_sales: 55,
};

// Floor rates in USD with 4x value baseline (NGN / 1500 * 4)
export const USD_AD_RATES: Record<string, number> = {
  politics: 4.00,
  business: 0.12,
  government: 5.33,
  individual: 0.07,
  religion: 4.00,
  product_sales: 0.15,
};

/**
 * Returns localized floor cost per impression for an ad category
 */
export function getLocalizedAdFloorRate(category: string, country?: string | null): number {
  const isUSD = getUserCurrency(country) === "USD";
  const cat = category.toLowerCase();
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
 * Returns localized monetization subscription fees
 */
export function getLocalizedMonetizationRate(type: "standard" | "instant", country?: string | null): number {
  const isUSD = getUserCurrency(country) === "USD";
  if (isUSD) {
    return type === "instant" ? 8.00 : 3.00;
  }
  return type === "instant" ? 3000.00 : 1000.00;
}

