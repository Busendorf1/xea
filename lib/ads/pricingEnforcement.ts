import {
  applyProductSalesSubsidy,
  buildCandidateSubscriberDomains,
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

  const effectiveRate =
    requestedRate !== null ? requestedRate : expectedFloorRate;

  // Reject any below-floor CPI or bid price tampering (tiny epsilon for float representation)
  const rateEpsilon = currency === "USD" ? 0.0005 : 0.001;
  if (
    !Number.isFinite(effectiveRate) ||
    effectiveRate <= 0 ||
    effectiveRate < expectedFloorRate - rateEpsilon
  ) {
    return {
      ok: false,
      status: 400,
      error: `Rate ${effectiveRate} is below the ${rawCategory} floor of ${expectedFloorRate} ${currency} per attention.`,
    };
  }

  if (parsedCpi !== null && parsedCpi < expectedFloorRate - rateEpsilon) {
    return {
      ok: false,
      status: 400,
      error: `Cost per attention ${parsedCpi} is below the ${rawCategory} floor of ${expectedFloorRate} ${currency}.`,
    };
  }

  const computedTotalCost = computeServerTotalCost(
    effectiveRate,
    parsedImpressions,
    currency
  );

  if (parsedClientTotal !== null) {
    const tolerance = currency === "USD" ? 0.51 : 1;
    if (Math.abs(parsedClientTotal - computedTotalCost) > tolerance) {
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
    subsidyQualified,
    isBidded: isBidded || effectiveRate > expectedFloorRate + rateEpsilon,
    isAdminFreePost: false,
  };
}
