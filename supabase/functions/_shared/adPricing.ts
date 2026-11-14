export type PlatformCurrency = "NGN" | "USD";

const NIGERIAN_REGIONS = [
  "nigeria", "ng", "nga", "ngn", "lagos", "abuja", "fct", "fct-abuja",
  "abia", "adamawa", "akwa ibom", "anambra", "bauchi", "bayelsa", "benue", "borno",
  "cross river", "delta", "ebonyi", "edo", "ekiti", "enugu", "gombe", "imo",
  "jigawa", "kaduna", "kano", "katsina", "kebbi", "kogi", "kwara", "nasarawa",
  "niger", "ogun", "ondo", "osun", "oyo", "plateau", "rivers", "sokoto",
  "taraba", "yobe", "zamfara", "port harcourt", "portharcourt", "ibadan", "calabar",
  "asaba", "warri", "benin city", "onitsha", "aba", "uyo", "nnewi", "enugu",
];

export const MIN_AD_ATTENTIONS = 100;
export const MAX_AD_DURATION_DAYS = 90;
export const PRODUCT_SALES_SUBSIDY_MULTIPLIER = 0.7;

export const NGN_AD_RATES: Record<string, number> = {
  politics: 900,
  business: 45,
  government: 750,
  individual: 25,
  religion: 900,
  product_sales: 55,
};

export const USD_AD_RATES: Record<string, number> = {
  politics: 2.40,
  business: 0.12,
  government: 2.00,
  individual: 0.07,
  religion: 2.40,
  product_sales: 0.15,
};

export function getUserCurrencyEdge(country?: string | null): PlatformCurrency {
  if (!country || !country.trim()) return "NGN";
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

export function isValidAdCategoryEdge(category: string): boolean {
  return Object.prototype.hasOwnProperty.call(NGN_AD_RATES, category.trim().toLowerCase());
}

export function getLocalizedAdFloorRateEdge(category: string, country?: string | null): number {
  const cat = category.trim().toLowerCase();
  if (getUserCurrencyEdge(country) === "USD") {
    return USD_AD_RATES[cat] ?? 0.07;
  }
  return NGN_AD_RATES[cat] ?? 25;
}

export function extractNormalizedHostnameEdge(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!hostname || !hostname.includes(".")) return null;
    return hostname;
  } catch {
    return null;
  }
}

export function buildCandidateSubscriberDomainsEdge(hostname: string): string[] {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  const candidates: string[] = [];
  for (let i = 0; i <= parts.length - 2; i++) {
    candidates.push(parts.slice(i).join("."));
  }
  return Array.from(new Set(candidates));
}

export async function isVerifiedSubscriberProductLinkEdge(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  productCtaLink: unknown,
): Promise<boolean> {
  if (typeof productCtaLink !== "string") return false;
  const hostname = extractNormalizedHostnameEdge(productCtaLink);
  if (!hostname) return false;
  const candidates = buildCandidateSubscriberDomainsEdge(hostname);
  if (candidates.length === 0) return false;

  try {
    const { data, error } = await supabase
      .from("premium_subscribers")
      .select("domain, status, payment_status")
      .in("domain", candidates)
      .eq("status", "active");
    if (error || !Array.isArray(data)) return false;

    return data.some((row: Record<string, unknown>) => {
      const domain = String(row?.domain || "").trim().toLowerCase();
      return (
        row?.status === "active" &&
        (row?.payment_status === "paid" || domain === "baggyt.com")
      );
    });
  } catch {
    return false;
  }
}

export async function resolveUserPricingCountryEdge(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  email: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("users")
      .select("country")
      .ilike("email", email.trim().toLowerCase())
      .maybeSingle();
    return data?.country ? String(data.country) : null;
  } catch {
    return null;
  }
}

export function applyProductSalesSubsidyEdge(baseFloor: number): number {
  return Number((baseFloor * PRODUCT_SALES_SUBSIDY_MULTIPLIER).toFixed(4));
}

export function computeServerTotalCostEdge(
  effectiveRate: number,
  impressions: number,
  currency: PlatformCurrency,
): number {
  const raw = effectiveRate * impressions;
  return currency === "USD" ? Number(raw.toFixed(2)) : Math.round(raw);
}

export interface EdgeAdPricingInput {
  adType: unknown;
  impressions: unknown;
  costPerImpression?: unknown;
  isBidded?: unknown;
  bidPrice?: unknown;
  clientTotalCost?: unknown;
  productCtaLink?: unknown;
  userCountry?: string | null;
  isAdmin?: boolean;
  fallbackCategoryWhenMissing?: string;
}

export type EdgeAdPricingResult =
  | {
      ok: true;
      adCategory: string;
      currency: PlatformCurrency;
      impressionsCount: number;
      expectedFloorRate: number;
      effectiveRate: number;
      computedTotalCost: number;
      subsidyQualified: boolean;
      isBidded: boolean;
      isAdminFreePost: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function parseOptNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export async function validateAndComputeAdPricingEdge(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: EdgeAdPricingInput,
): Promise<EdgeAdPricingResult> {
  const rawCategory =
    input.adType !== undefined && input.adType !== null && String(input.adType).trim() !== ""
      ? String(input.adType).trim().toLowerCase()
      : (input.fallbackCategoryWhenMissing || "").trim().toLowerCase();

  if (!rawCategory || !isValidAdCategoryEdge(rawCategory)) {
    return {
      ok: false,
      status: 400,
      error: `Invalid ad category "${String(input.adType || "")}".`,
    };
  }

  const currency = getUserCurrencyEdge(input.userCountry);
  const isBidded = Boolean(input.isBidded);
  const parsedBid = parseOptNum(input.bidPrice);
  const parsedCpi = parseOptNum(input.costPerImpression);
  const parsedClientTotal = parseOptNum(input.clientTotalCost);
  const parsedImpressions = Number(input.impressions);
  const requestedRate = isBidded && parsedBid !== null ? parsedBid : parsedCpi;

  const isAdminFreePost = Boolean(
    input.isAdmin &&
      ((requestedRate !== null && requestedRate === 0) || parsedClientTotal === 0),
  );

  if (isAdminFreePost) {
    const safeImp =
      Number.isFinite(parsedImpressions) && parsedImpressions > 0
        ? Math.floor(parsedImpressions)
        : MIN_AD_ATTENTIONS;
    return {
      ok: true,
      adCategory: rawCategory,
      currency,
      impressionsCount: safeImp,
      expectedFloorRate: 0,
      effectiveRate: 0,
      computedTotalCost: 0,
      subsidyQualified: false,
      isBidded: false,
      isAdminFreePost: true,
    };
  }

  if (
    !Number.isFinite(parsedImpressions) ||
    !Number.isInteger(parsedImpressions) ||
    parsedImpressions < MIN_AD_ATTENTIONS ||
    parsedImpressions > 5_000_000
  ) {
    return {
      ok: false,
      status: 400,
      error: `Minimum ${MIN_AD_ATTENTIONS} attentions required.`,
    };
  }

  if (Number.isNaN(parsedBid) || Number.isNaN(parsedCpi) || Number.isNaN(parsedClientTotal)) {
    return { ok: false, status: 400, error: "Invalid pricing numeric parameters." };
  }

  const baseFloor = getLocalizedAdFloorRateEdge(rawCategory, input.userCountry);
  const subsidyQualified =
    rawCategory === "product_sales"
      ? await isVerifiedSubscriberProductLinkEdge(supabase, input.productCtaLink)
      : false;
  const expectedFloorRate = subsidyQualified
    ? applyProductSalesSubsidyEdge(baseFloor)
    : baseFloor;

  const effectiveRate = requestedRate !== null ? requestedRate : expectedFloorRate;
  const eps = currency === "USD" ? 0.0005 : 0.001;

  if (!Number.isFinite(effectiveRate) || effectiveRate <= 0 || effectiveRate < expectedFloorRate - eps) {
    return {
      ok: false,
      status: 400,
      error: `Rate ${effectiveRate} is below the ${rawCategory} floor of ${expectedFloorRate} ${currency} per attention.`,
    };
  }

  if (parsedCpi !== null && parsedCpi < expectedFloorRate - eps) {
    return {
      ok: false,
      status: 400,
      error: `Cost per attention ${parsedCpi} is below the ${rawCategory} floor of ${expectedFloorRate} ${currency}.`,
    };
  }

  const computedTotalCost = computeServerTotalCostEdge(effectiveRate, parsedImpressions, currency);

  if (parsedClientTotal !== null) {
    const tol = currency === "USD" ? 0.51 : 1;
    if (Math.abs(parsedClientTotal - computedTotalCost) > tol) {
      return { ok: false, status: 400, error: "Total cost validation mismatch." };
    }
  }

  return {
    ok: true,
    adCategory: rawCategory,
    currency,
    impressionsCount: parsedImpressions,
    expectedFloorRate,
    effectiveRate,
    computedTotalCost,
    subsidyQualified,
    isBidded: isBidded || effectiveRate > expectedFloorRate + eps,
    isAdminFreePost: false,
  };
}
