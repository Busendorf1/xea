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
  "nigeria", "ng", "nga", "ngn", "lagos", "abuja", "fct", "fct-abuja",
  "abia", "adamawa", "akwa ibom", "anambra", "bauchi", "bayelsa", "benue", "borno",
  "cross river", "delta", "ebonyi", "edo", "ekiti", "enugu", "gombe", "imo",
  "jigawa", "kaduna", "kano", "katsina", "kebbi", "kogi", "kwara", "nasarawa",
  "niger", "ogun", "ondo", "osun", "oyo", "plateau", "rivers", "sokoto",
  "taraba", "yobe", "zamfara", "port harcourt", "portharcourt", "ibadan", "calabar",
  "asaba", "warri", "benin city", "onitsha", "aba", "uyo", "nnewi", "enugu"
];

export const NGN_PER_USD = 1500; // Pegged platform reference rate: $1 USD = ₦1,500 NGN

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
