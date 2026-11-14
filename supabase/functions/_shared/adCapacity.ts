// Shared Edge Helper: Opaque Broadening-Aware Ad Delivery Capacity Estimator
// Never exposes raw user counts or unquantized segment sizes.

export interface EdgeAdCapacityInput {
  requestedImpressions: number;
  userFrequencyCap?: number | string | null;
  campaignDays?: number | string | null;
  targetingAll?: boolean | null;
  country?: string | string[] | null;
  state?: string | string[] | null;
  province?: string | string[] | null;
  gender?: string | string[] | null;
  ageRange?: number[] | string[] | string | null;
  employmentStatus?: string | string[] | null;
  industry?: string[] | string | null;
  interest?: string[] | string | null;
  lifestyle?: string[] | string | null;
  behavior?: string[] | string | null;
  personality?: string[] | string | null;
  advertiserEmail?: string | null;
}

export interface EdgeAdCapacityAssessment {
  telemetryAvailable: boolean;
  allowed: boolean;
  status: "optimal" | "broadened_needed" | "capped" | "unavailable";
  requestedImpressions: number;
  maxOrderableImpressions: number;
  strictTierImpressions: number;
  broadeningApplied: boolean;
  message: string;
}

const CAPACITY_LADDER: readonly number[] = [
  0,
  100,
  110,
  125,
  150,
  175,
  200,
  225,
  250,
  300,
  350,
  400,
  450,
  500,
  510,
  525,
  550,
  575,
  600,
  650,
  700,
  750,
  800,
  850,
  900,
  950,
  1_000,
  1_250,
  1_500,
  1_750,
  2_000,
  2_500,
  3_000,
  3_500,
  4_000,
  5_000,
  6_000,
  7_500,
  10_000,
  12_500,
  15_000,
  20_000,
  25_000,
  35_000,
  50_000,
  75_000,
  100_000,
  150_000,
  200_000,
  250_000,
  350_000,
  500_000,
  750_000,
  1_000_000,
  1_500_000,
  2_000_000,
  2_500_000,
  3_500_000,
  5_000_000,
];

const WILDCARDS = new Set([
  "",
  "all",
  "all countries",
  "all genders",
  "all industries",
  "all interests",
  "any",
  "worldwide",
  "global",
  "placeholder",
  "none",
]);

const MAX_TOKEN_LEN = 80;
const MAX_TOKENS_PER_DIM = 10;

function normalizeToken(val: unknown): string {
  return String(val ?? "").trim().toLowerCase().slice(0, MAX_TOKEN_LEN);
}

function escapeLikePattern(val: string): string {
  return val.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function normalizeTokenList(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val
      .slice(0, 50)
      .map(normalizeToken)
      .filter((t) => t.length > 0 && !WILDCARDS.has(t))
      .slice(0, MAX_TOKENS_PER_DIM);
  }
  if (typeof val === "string") {
    const trimmed = val.trim().slice(0, 1000);
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return normalizeTokenList(parsed);
      } catch {}
    }
    return trimmed
      .split(",")
      .slice(0, 50)
      .map(normalizeToken)
      .filter((t) => t.length > 0 && !WILDCARDS.has(t))
      .slice(0, MAX_TOKENS_PER_DIM);
  }
  return [];
}

async function getEdgeReserveFactor(): Promise<number> {
  try {
    const key =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      "paayh-capacity-reserve";
    const buf = new TextEncoder().encode(key);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
    return 0.8 + (hash[0] / 255) * 0.1;
  } catch {
    return 0.85;
  }
}

function quantizeDeliverableCapacity(raw: number, reserveFactor: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const buffered = Math.floor(raw * reserveFactor);
  let selected = 0;
  for (const step of CAPACITY_LADDER) {
    if (step <= buffered) selected = step;
    else break;
  }
  return selected;
}

function parseAgeSpan(ageRange: EdgeAdCapacityInput["ageRange"]): number {
  if (Array.isArray(ageRange) && ageRange.length >= 2) {
    const min = Number(ageRange[0]);
    const max = Number(ageRange[1]);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
      return Math.max(1, max - min);
    }
  }
  if (typeof ageRange === "string" && ageRange.trim()) {
    const nums = ageRange.match(/\d+/g)?.map(Number) || [];
    if (nums.length >= 2 && nums[1] >= nums[0]) {
      return Math.max(1, nums[1] - nums[0]);
    }
  }
  return 82;
}

async function runHeadCountQueryEdge(
  supabase: any,
  applyFilters: (q: any) => any
): Promise<{ available: boolean; count: number }> {
  try {
    const usersTable = supabase?.from?.("users");
    if (!usersTable || typeof usersTable.select !== "function") {
      return { available: false, count: 0 };
    }
    let q = usersTable.select("id", { count: "exact", head: true });
    if (!q || typeof q.or !== "function") {
      return { available: false, count: 0 };
    }
    const cutoffIso = new Date(Date.now() - 45 * 86_400_000).toISOString();
    q = q
      .or("ad_account_status.is.null,ad_account_status.neq.deactivated")
      .or(`last_active_at.gte.${cutoffIso},and(last_active_at.is.null,created_at.gte.${cutoffIso})`);
    q = applyFilters(q);
    const res = await q;
    if (!res || res.error || typeof res.count !== "number" || !Number.isFinite(res.count)) {
      return { available: false, count: 0 };
    }
    return { available: true, count: Math.max(0, Math.floor(res.count)) };
  } catch {
    return { available: false, count: 0 };
  }
}

interface CachedEdgeCounts {
  globalCount: number;
  countryCount: number;
  strictCount: number;
}

const EDGE_L1_TTL_MS = 60_000;
const EDGE_L1_MAX_ENTRIES = 2_000;
const edgeCountsCacheByClient = new WeakMap<
  object,
  Map<string, { expiresAt: number; value: CachedEdgeCounts }>
>();
const edgeCountsCacheByUrl = new Map<
  string,
  Map<string, { expiresAt: number; value: CachedEdgeCounts }>
>();

function getEdgeClientUrlKey(client: unknown): string | null {
  if (!client || typeof client !== "object") return null;
  const rawUrl = (client as { supabaseUrl?: unknown }).supabaseUrl;
  if (typeof rawUrl === "string" && rawUrl.trim().length > 0) {
    return rawUrl.trim().toLowerCase();
  }
  return null;
}

function getEdgeL1Map(
  client: unknown,
  createIfMissing: boolean
): Map<string, { expiresAt: number; value: CachedEdgeCounts }> | null {
  if (!client || typeof client !== "object") return null;
  const urlKey = getEdgeClientUrlKey(client);
  if (urlKey) {
    let map = edgeCountsCacheByUrl.get(urlKey);
    if (!map && createIfMissing) {
      map = new Map();
      edgeCountsCacheByUrl.set(urlKey, map);
    }
    return map || null;
  }
  let map = edgeCountsCacheByClient.get(client);
  if (!map && createIfMissing) {
    map = new Map();
    edgeCountsCacheByClient.set(client, map);
  }
  return map || null;
}

function getEdgeL1Counts(client: unknown, key: string): CachedEdgeCounts | null {
  const map = getEdgeL1Map(client, false);
  if (!map) return null;
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setEdgeL1Counts(client: unknown, key: string, value: CachedEdgeCounts): void {
  const map = getEdgeL1Map(client, true);
  if (!map) return;
  if (map.size >= EDGE_L1_MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, { expiresAt: Date.now() + EDGE_L1_TTL_MS, value });
}

export async function assessAdDeliveryCapacityEdge(
  supabase: any,
  input: EdgeAdCapacityInput
): Promise<EdgeAdCapacityAssessment> {
  const requested = Math.max(0, Math.floor(Number(input.requestedImpressions) || 0));
  const baseCap = Math.max(1, Math.min(100, Math.floor(Number(input.userFrequencyCap) || 1)));
  const days = Math.max(1, Math.min(90, Math.floor(Number(input.campaignDays) || 1)));
  const isTargetingAll = Boolean(input.targetingAll);

  const countries = normalizeTokenList(input.country);
  const states = [
    ...normalizeTokenList(input.state),
    ...(typeof input.province === "string" && !input.province.includes(";") && !input.province.includes(",")
      ? normalizeTokenList(input.province)
      : []),
  ];
  const hasMultiLocations =
    typeof input.province === "string" &&
    (input.province.includes(";") || input.province.includes(","));
  const genders = normalizeTokenList(input.gender);

  const industries = normalizeTokenList(input.industry);
  const interests = normalizeTokenList(input.interest);
  const lifestyles = normalizeTokenList(input.lifestyle);
  const behaviors = normalizeTokenList(input.behavior);
  const personalities = normalizeTokenList(input.personality);
  const employmentFilters = normalizeTokenList(input.employmentStatus);

  let primaryCountry: string | null = null;
  if (!isTargetingAll && countries.length === 1) {
    primaryCountry = countries[0];
  } else if (!isTargetingAll && hasMultiLocations && typeof input.province === "string") {
    const countryTokens = Array.from(
      new Set(
        input.province
          .slice(0, 1000)
          .split(";")
          .slice(0, 50)
          .map((e) => e.split(",").pop()?.trim().toLowerCase().slice(0, MAX_TOKEN_LEN) || "")
          .filter((c) => c && !WILDCARDS.has(c))
      )
    );
    if (countryTokens.length === 1) {
      primaryCountry = countryTokens[0];
    }
  }

  const primaryState = !isTargetingAll && states.length === 1 ? states[0] : null;
  const primaryGender = !isTargetingAll && genders.length === 1 ? genders[0] : null;
  const hasNarrowFilters =
    !isTargetingAll &&
    (countries.length > 0 ||
      states.length > 0 ||
      genders.length > 0 ||
      hasMultiLocations ||
      interests.length > 0 ||
      industries.length > 0 ||
      lifestyles.length > 0 ||
      behaviors.length > 0 ||
      personalities.length > 0 ||
      employmentFilters.length > 0 ||
      parseAgeSpan(input.ageRange) <= 40);

  const sortTokens = (arr: string[]) => [...arr].sort();
  const filterKey = JSON.stringify({
    isTargetingAll,
    primaryCountry,
    primaryState,
    primaryGender,
    interests: isTargetingAll ? [] : sortTokens(interests),
    industries: isTargetingAll ? [] : sortTokens(industries),
    lifestyles: isTargetingAll ? [] : sortTokens(lifestyles),
    behaviors: isTargetingAll ? [] : sortTokens(behaviors),
    personalities: isTargetingAll ? [] : sortTokens(personalities),
  });

  let counts: CachedEdgeCounts | null = getEdgeL1Counts(supabase, filterKey);

  // O(1) Precomputed Rollup RPC fast-path
  if (!counts && typeof supabase?.rpc === "function") {
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("get_ad_capacity_counts", {
        p_country: primaryCountry,
        p_state: primaryState,
        p_gender: primaryGender,
        p_interest: !isTargetingAll && interests.length > 0 ? interests : null,
        p_industry: !isTargetingAll && industries.length > 0 ? industries : null,
        p_lifestyle: !isTargetingAll && lifestyles.length > 0 ? lifestyles : null,
        p_behavior: !isTargetingAll && behaviors.length > 0 ? behaviors : null,
        p_personality: !isTargetingAll && personalities.length > 0 ? personalities : null,
      });

      if (
        !rpcErr &&
        rpcData &&
        rpcData.available === true &&
        typeof rpcData.global_users === "number" &&
        Number.isFinite(rpcData.global_users)
      ) {
        const globalCount = Math.max(0, Math.floor(rpcData.global_users));
        const countryCount = Math.max(
          0,
          Math.floor(typeof rpcData.country_users === "number" ? rpcData.country_users : globalCount)
        );
        const strictCount = Math.max(
          0,
          Math.floor(typeof rpcData.strict_users === "number" ? rpcData.strict_users : countryCount)
        );
        counts = { globalCount, countryCount, strictCount };
        setEdgeL1Counts(supabase, filterKey, counts);
      }
    } catch {
      // Fallback below
    }
  }

  if (!counts) {
    const globalRes = await runHeadCountQueryEdge(supabase, (q) => q);
    if (!globalRes.available) {
      return {
        telemetryAvailable: false,
        allowed: true,
        status: "unavailable",
        requestedImpressions: requested,
        maxOrderableImpressions: 5_000_000,
        strictTierImpressions: 5_000_000,
        broadeningApplied: false,
        message: "Capacity check unavailable.",
      };
    }

    const globalCount = globalRes.count;
    let countryCount = globalCount;

    if (primaryCountry) {
      const safeCountry = escapeLikePattern(primaryCountry);
      const countryRes = await runHeadCountQueryEdge(supabase, (q) =>
        typeof q.ilike === "function" ? q.ilike("country", safeCountry) : q
      );
      if (countryRes.available) {
        countryCount = countryRes.count;
      }
    }

    let strictCount = countryCount;
    if (!isTargetingAll) {
      const hasStrictSqlFilters =
        countries.length === 1 ||
        states.length === 1 ||
        genders.length === 1 ||
        interests.length > 0 ||
        industries.length > 0 ||
        lifestyles.length > 0 ||
        behaviors.length > 0 ||
        personalities.length > 0;

      if (hasStrictSqlFilters) {
        const strictRes = await runHeadCountQueryEdge(supabase, (q) => {
          let next = q;
          if (countries.length === 1 && typeof next.ilike === "function") {
            next = next.ilike("country", escapeLikePattern(countries[0]));
          }
          if (states.length === 1 && typeof next.ilike === "function") {
            next = next.ilike("state", `%${escapeLikePattern(states[0])}%`);
          }
          if (genders.length === 1 && typeof next.ilike === "function") {
            next = next.ilike("gender", escapeLikePattern(genders[0]));
          }
          if (typeof next.overlaps === "function") {
            if (interests.length > 0) next = next.overlaps("interest", interests);
            if (industries.length > 0) next = next.overlaps("industry", industries);
            if (lifestyles.length > 0) next = next.overlaps("lifestyle", lifestyles);
            if (behaviors.length > 0) next = next.overlaps("behavior", behaviors);
            if (personalities.length > 0) next = next.overlaps("personality", personalities);
          }
          return next;
        });
        if (strictRes.available) {
          strictCount = strictRes.count;
        }
      }
    }

    counts = { globalCount, countryCount, strictCount };
    setEdgeL1Counts(supabase, filterKey, counts);
  }

  const ownerAdjustment = input.advertiserEmail ? 1 : 0;
  const globalUsers = Math.max(0, counts.globalCount - ownerAdjustment);
  const countryUsers = Math.max(0, counts.countryCount - ownerAdjustment);
  let strictUsers = Math.max(0, counts.strictCount - ownerAdjustment);

  if (!isTargetingAll) {
    const ageSpan = parseAgeSpan(input.ageRange);
    const ageFactor = ageSpan <= 10 ? 0.3 : ageSpan <= 22 ? 0.5 : ageSpan <= 40 ? 0.72 : 1.0;
    const empFactor = employmentFilters.length > 0 ? 0.5 : 1.0;
    const multiLocFactor = hasMultiLocations && states.length === 0 ? 0.35 : 1.0;
    strictUsers = Math.floor(strictUsers * ageFactor * empFactor * multiLocFactor);
  }

  const strictCapPerUser = Math.min(baseCap, days * 6);
  const stage1CapPerUser = Math.min(Math.min(102, baseCap + 1), Math.max(days, 3) * 6);
  const stage2CapPerUser = Math.min(Math.min(102, baseCap + 2), Math.max(days, 7) * 6);

  const strictRaw = Math.floor(strictUsers * strictCapPerUser * 0.95);
  const stage1Raw = Math.floor(countryUsers * stage1CapPerUser * 0.95);
  const stage2Raw = Math.floor(globalUsers * stage2CapPerUser * 0.95);

  const reserveFactor = await getEdgeReserveFactor();
  const strictTier = quantizeDeliverableCapacity(strictRaw, reserveFactor);
  const maxOrderable = quantizeDeliverableCapacity(
    Math.max(strictRaw, stage1Raw, stage2Raw),
    reserveFactor
  );

  if (requested <= 0) {
    return {
      telemetryAvailable: true,
      allowed: maxOrderable >= 100,
      status: maxOrderable >= 100 ? "optimal" : "capped",
      requestedImpressions: requested,
      maxOrderableImpressions: maxOrderable,
      strictTierImpressions: strictTier,
      broadeningApplied: strictTier < maxOrderable,
      message:
        maxOrderable >= 100
          ? `Up to ${maxOrderable.toLocaleString()} active attentions available.`
          : "Under 100 active attentions available. Adjust filters, days, or frequency.",
    };
  }

  if (requested > maxOrderable) {
    return {
      telemetryAvailable: true,
      allowed: false,
      status: "capped",
      requestedImpressions: requested,
      maxOrderableImpressions: maxOrderable,
      strictTierImpressions: strictTier,
      broadeningApplied: false,
      message:
        maxOrderable < 100
          ? hasNarrowFilters
            ? "Under 100 active attentions for these filters. Broaden targeting, days, or frequency."
            : "Under 100 active attentions available. Increase days or frequency."
          : `Max ${maxOrderable.toLocaleString()} active attentions available. Increase days or frequency.`,
    };
  }

  if (requested > strictTier && maxOrderable >= requested) {
    return {
      telemetryAvailable: true,
      allowed: true,
      status: "broadened_needed",
      requestedImpressions: requested,
      maxOrderableImpressions: maxOrderable,
      strictTierImpressions: strictTier,
      broadeningApplied: true,
      message: hasNarrowFilters
        ? `~${strictTier.toLocaleString()} active attentions here; Rollover covers up to ${maxOrderable.toLocaleString()}.`
        : `~${strictTier.toLocaleString()} active attentions at current pace; Rollover covers up to ${maxOrderable.toLocaleString()}.`,
    };
  }

  return {
    telemetryAvailable: true,
    allowed: true,
    status: "optimal",
    requestedImpressions: requested,
    maxOrderableImpressions: maxOrderable,
    strictTierImpressions: strictTier,
    broadeningApplied: false,
    message: `${requested.toLocaleString()} active attentions`,
  };
}
