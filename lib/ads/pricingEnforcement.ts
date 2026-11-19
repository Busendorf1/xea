import {
  applyProductSalesSubsidy,
  buildCandidateSubscriberDomains,
  convertUsdToNgn,
  extractNormalizedHostname,
  getLocalizedAdFloorRate,
  getUserCurrency,
  isValidAdCategory,
  MIN_AD_ATTENTIONS,
} from "../utils/currency";

export interface AdPricingValidationInput {
  adType: unknown;
  impressions: unknown;
  costPerImpression?: unknown;
  isBidded?: unknown;
  bidPrice?: unknown;
  clientTotalCost?: unknown;
  productCtaLink?: unknown;
  userCountry?: string | null;
  isAdmin?: boolean;
  /**
   * When true, `costPerImpression` / `bidPrice` are already stored canonically in NGN
   * (e.g. re-validating an `adds` row during `publish_ad`), while `clientTotalCost` may
   * arrive either in canonical NGN or localized USD.
   */
  storedInCanonicalNgn?: boolean;
  /**
   * Boost routes may encounter legacy `addsactive` rows without `ad_type`.
   * When provided, fallback category is used ONLY if `adType` is empty/null.
   */
  fallbackCategoryWhenMissing?: string;
}

export type AdPricingValidationResult =
  | {
      ok: true;
      adCategory: string;
      currency: "NGN" | "USD";
      impressionsCount: number;
      baseFloorRate: number;
      expectedFloorRate: number;
      effectiveRate: number;
      computedTotalCost: number;
      /** Authoritative canonical NGN rate for DB storage, payout gateways, and earner rewards */
      canonicalRateNgn: number;
      /** Authoritative canonical NGN total for DB storage, wallet deductions, and payment gateways */
      canonicalTotalCostNgn: number;
      subsidyQualified: boolean;
      isBidded: boolean;
      isAdminFreePost: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

/**
 * Verifies whether `productCtaLink` belongs to an active, paid Business Subscriber
 * domain in `premium_subscribers`. Strict hostname parsing prevents query/path/suffix spoofing.
 */
export async function isVerifiedSubscriberProductLink(
  supabaseAdmin: any,
  productCtaLink: unknown
): Promise<boolean> {
  if (typeof productCtaLink !== "string") return false;
  const hostname = extractNormalizedHostname(productCtaLink);
  if (!hostname) return false;

  const candidates = buildCandidateSubscriberDomains(hostname);
  if (candidates.length === 0) return false;

  try {
    const query = supabaseAdmin
      .from("premium_subscribers")
      .select("domain, status, payment_status")
      .in("domain", candidates)
      .eq("status", "active");

    const { data, error } = await query;
    if (error || !Array.isArray(data)) {
      return false;
    }

    return data.some((row: any) => {
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

function parseOptionalFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

/**
 * Computes round server-side total cost matching currency precision:
 * whole NGN for Naira, 2 decimal places for USD.
 */
export function computeServerTotalCost(
  effectiveRate: number,
  impressionsCount: number,
  currency: "NGN" | "USD"
): number {
  const raw = effectiveRate * impressionsCount;
  return currency === "USD"
    ? Number(raw.toFixed(2))
    : Math.round(raw);
}

/**
 * Authoritative server-side enforcement for ad category floors, 100 minimum attentions,
 * 30% verified Business Subscriber subsidy (product_sales only), and total_cost integrity.
 */
export async function validateAndComputeAdPricing(
  supabaseAdmin: any,
  input: AdPricingValidationInput
): Promise<AdPricingValidationResult> {
  const rawCategory =
    input.adType !== undefined && input.adType !== null && String(input.adType).trim() !== ""
      ? String(input.adType).trim().toLowerCase()
      : (input.fallbackCategoryWhenMissing || "").trim().toLowerCase();

  if (!rawCategory || !isValidAdCategory(rawCategory)) {
    return {
      ok: false,
      status: 400,
      error: `Invalid ad category "${String(input.adType || "")}".`,
    };
  }

  const currency = getUserCurrency(input.userCountry);
  const isBidded = Boolean(input.isBidded);
  const parsedBid = parseOptionalFiniteNumber(input.bidPrice);
  const parsedCpi = parseOptionalFiniteNumber(input.costPerImpression);
  const parsedClientTotal = parseOptionalFiniteNumber(input.clientTotalCost);
  const parsedImpressions = Number(input.impressions);

  const requestedRate =
    isBidded && parsedBid !== null ? parsedBid : parsedCpi;

  const isAdminFreePost = Boolean(
    input.isAdmin &&
      ((requestedRate !== null && requestedRate === 0) ||
        parsedClientTotal === 0)
  );

  if (isAdminFreePost) {
    const safeImpressions =
      Number.isFinite(parsedImpressions) && parsedImpressions > 0
        ? Math.floor(parsedImpressions)
        : MIN_AD_ATTENTIONS;
    return {
      ok: true,
      adCategory: rawCategory,
      currency,
      impressionsCount: safeImpressions,
      baseFloorRate: 0,
      expectedFloorRate: 0,
      effectiveRate: 0,
      computedTotalCost: 0,
      canonicalRateNgn: 0,
      canonicalTotalCostNgn: 0,
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
    return {
      ok: false,
      status: 400,
      error: "Invalid pricing numeric parameters.",
    };
  }

  const baseFloorRate = getLocalizedAdFloorRate(rawCategory, input.userCountry);
  const subsidyQualified =
    rawCategory === "product_sales"
      ? await isVerifiedSubscriberProductLink(supabaseAdmin, input.productCtaLink)
      : false;
  const expectedFloorRate = subsidyQualified
    ? applyProductSalesSubsidy(baseFloorRate)
    : baseFloorRate;

  const expectedFloorRateNgn =
    currency === "USD" ? convertUsdToNgn(expectedFloorRate) : expectedFloorRate;

  // When re-validating a persisted `adds` row stored canonically in NGN, compare against NGN floor
  const compareInNgn = Boolean(input.storedInCanonicalNgn) || currency === "NGN";
  const comparisonFloor = compareInNgn ? expectedFloorRateNgn : expectedFloorRate;
  const comparisonCurrency = compareInNgn ? "NGN" : currency;

  const effectiveRate =
    requestedRate !== null ? requestedRate : comparisonFloor;

  // Reject any below-floor CPI or bid price tampering (tiny epsilon for float representation)
  const rateEpsilon = comparisonCurrency === "USD" ? 0.0005 : 0.001;
  if (
    !Number.isFinite(effectiveRate) ||
    effectiveRate <= 0 ||
    effectiveRate < comparisonFloor - rateEpsilon
  ) {
    return {
      ok: false,
      status: 400,
      error: `Rate ${effectiveRate} is below the ${rawCategory} floor of ${comparisonFloor} ${comparisonCurrency} per attention.`,
    };
  }

  if (parsedCpi !== null && parsedCpi < comparisonFloor - rateEpsilon) {
    return {
      ok: false,
      status: 400,
      error: `Cost per attention ${parsedCpi} is below the ${rawCategory} floor of ${comparisonFloor} ${comparisonCurrency}.`,
    };
  }

  const computedTotalCost = computeServerTotalCost(
    effectiveRate,
    parsedImpressions,
    comparisonCurrency
  );

  const canonicalRateNgn =
    compareInNgn ? Number(effectiveRate.toFixed(2)) : convertUsdToNgn(effectiveRate);
  const canonicalTotalCostNgn =
    compareInNgn
      ? Math.round(canonicalRateNgn * parsedImpressions)
      : Math.round(convertUsdToNgn(computedTotalCost));

  if (parsedClientTotal !== null) {
    const tolLocal = comparisonCurrency === "USD" ? 0.51 : 1;
    const matchesDirect = Math.abs(parsedClientTotal - computedTotalCost) <= tolLocal;
    const matchesNgnFromUsd =
      currency === "USD" &&
      Math.abs(convertUsdToNgn(parsedClientTotal) - canonicalTotalCostNgn) <= Math.max(760, parsedImpressions * 0.75);
    const matchesCanonicalNgn = Math.abs(parsedClientTotal - canonicalTotalCostNgn) <= 1;

    if (!matchesDirect && !matchesNgnFromUsd && !matchesCanonicalNgn) {
      return {
        ok: false,
        status: 400,
        error: "Total cost validation mismatch.",
      };
    }
  }

  return {
    ok: true,
    adCategory: rawCategory,
    currency,
    impressionsCount: parsedImpressions,
    baseFloorRate,
    expectedFloorRate,
    effectiveRate,
    computedTotalCost,
    canonicalRateNgn,
    canonicalTotalCostNgn,
    subsidyQualified,
    isBidded: isBidded || effectiveRate > comparisonFloor + rateEpsilon,
    isAdminFreePost: false,
  };
}
