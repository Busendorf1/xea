import crypto from "crypto";
import redisConnection, { isRedisReady } from "../redis";

export interface AdCapacityInput {
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

export type AdCapacityStatus = "optimal" | "broadened_needed" | "capped" | "unavailable";

export interface AdCapacityAssessment {
  telemetryAvailable: boolean;
  allowed: boolean;
  status: AdCapacityStatus;
  requestedImpressions: number;
  maxOrderableImpressions: number;
  strictTierImpressions: number;
  broadeningApplied: boolean;
  message: string;
}

export const CAPACITY_LADDER: readonly number[] = [
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
  "both",
  "everyone",
  "all countries",
  "all gender",
  "all genders",
  "all states",
  "all locations",
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

export function isConcreteTargetingValue(val: unknown): boolean {
  if (Array.isArray(val)) {
    return val.some((entry) => isConcreteTargetingValue(entry));
  }
  const raw = String(val ?? "").trim();
  if (!raw) return false;
  return raw
    .split(/[;,]/)
    .map((part) => normalizeToken(part))
    .some((tok) => tok.length > 0 && !WILDCARDS.has(tok));
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
        if (Array.isArray(parsed)) {
          return normalizeTokenList(parsed);
        }
      } catch {
        // Fallback to delimiter split
      }
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

function getReserveFactor(): number {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXTAUTH_SECRET ||
    "paayh-capacity-reserve";
  const digest = crypto.createHash("sha256").update(secret).digest();
  // Map first byte to [0.80, 0.90] so tier edges cannot be inverted into exact user counts
  const unit = digest[0] / 255;
  return 0.8 + unit * 0.1;
}

export function quantizeDeliverableCapacity(
  rawImpressions: number,
  reserveFactor: number = getReserveFactor()
): number {
  if (!Number.isFinite(rawImpressions) || rawImpressions <= 0) return 0;
  const buffered = Math.floor(rawImpressions * reserveFactor);
  let selected = 0;
  for (const step of CAPACITY_LADDER) {
    if (step <= buffered) {
      selected = step;
    } else {
      break;
    }
  }
  return selected;
}

function parseAgeSpan(ageRange: AdCapacityInput["ageRange"]): number {
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

async function runHeadCountQuery(
  supabaseAdmin: any,
  applyFilters: (query: any) => any
): Promise<{ available: boolean; count: number }> {
  try {
    const usersTable = supabaseAdmin?.from?.("users");
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

interface CachedAudienceCounts {
  globalCount: number;
  countryCount: number;
  strictCount: number;
}

const L1_CACHE_TTL_MS = 60_000;
const L1_MAX_ENTRIES = 2_000;
const L2_REDIS_TTL_SECONDS = 120;
const audienceCountsCacheByClient = new WeakMap<
  object,
  Map<string, { expiresAt: number; value: CachedAudienceCounts }>
>();
const audienceCountsCacheByUrl = new Map<
  string,
  Map<string, { expiresAt: number; value: CachedAudienceCounts }>
>();

function getClientUrlKey(client: unknown): string | null {
  if (!client || typeof client !== "object") return null;
  const rawUrl = (client as { supabaseUrl?: unknown }).supabaseUrl;
  if (typeof rawUrl === "string" && rawUrl.trim().length > 0) {
    return rawUrl.trim().toLowerCase();
  }
  return null;
}

function getL1ClientMap(
  client: unknown,
  createIfMissing: boolean
): Map<string, { expiresAt: number; value: CachedAudienceCounts }> | null {
  if (!client || typeof client !== "object") return null;
  const urlKey = getClientUrlKey(client);
  if (urlKey) {
    let map = audienceCountsCacheByUrl.get(urlKey);
    if (!map && createIfMissing) {
      map = new Map();
      audienceCountsCacheByUrl.set(urlKey, map);
    }
    return map || null;
  }
  let map = audienceCountsCacheByClient.get(client);
  if (!map && createIfMissing) {
    map = new Map();
    audienceCountsCacheByClient.set(client, map);
  }
  return map || null;
}

function getL1CachedCounts(client: unknown, cacheKey: string): CachedAudienceCounts | null {
  const map = getL1ClientMap(client, false);
  if (!map) return null;
  const entry = map.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(cacheKey);
    return null;
  }
  return entry.value;
}

function setL1CachedCounts(client: unknown, cacheKey: string, value: CachedAudienceCounts): void {
  const map = getL1ClientMap(client, true);
  if (!map) return;
  if (map.size >= L1_MAX_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(cacheKey, {
    expiresAt: Date.now() + L1_CACHE_TTL_MS,
    value,
  });
}

/**
 * Estimates broadening-aware deliverable capacity without ever returning
 * or enabling exact inference of platform or segment user counts.
 */
export async function assessAdDeliveryCapacity(
  supabaseAdmin: any,
  input: AdCapacityInput
): Promise<AdCapacityAssessment> {
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
  const filterCacheHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        isTargetingAll,
        primaryCountry,
        primaryState,
        primaryGender,
        interests: isTargetingAll ? [] : sortTokens(interests),
        industries: isTargetingAll ? [] : sortTokens(industries),
        lifestyles: isTargetingAll ? [] : sortTokens(lifestyles),
        behaviors: isTargetingAll ? [] : sortTokens(behaviors),
        personalities: isTargetingAll ? [] : sortTokens(personalities),
      })
    )
    .digest("hex");

  let counts: CachedAudienceCounts | null = getL1CachedCounts(supabaseAdmin, filterCacheHash);

  // L2 Redis cache (shared across warm serverless instances, no PII in key)
  const redisCacheKey = `ad_cap_v2:${filterCacheHash}`;
  const canUseRedis =
    typeof supabaseAdmin?.rpc === "function" &&
    typeof isRedisReady === "function" &&
    isRedisReady() &&
    typeof redisConnection?.get === "function" &&
    typeof redisConnection?.set === "function";

  if (!counts && canUseRedis) {
    try {
      const rawCached = await redisConnection.get(redisCacheKey);
      if (typeof rawCached === "string" && rawCached.length > 0) {
        const parsed = JSON.parse(rawCached);
        if (
          parsed &&
          typeof parsed.globalCount === "number" &&
          typeof parsed.countryCount === "number" &&
          typeof parsed.strictCount === "number"
        ) {
          counts = {
            globalCount: Math.max(0, Math.floor(parsed.globalCount)),
            countryCount: Math.max(0, Math.floor(parsed.countryCount)),
            strictCount: Math.max(0, Math.floor(parsed.strictCount)),
          };
          setL1CachedCounts(supabaseAdmin, filterCacheHash, counts);
        }
      }
    } catch {
      // Fail open to RPC/DB if Redis read fails
    }
  }

  // O(1) Precomputed Rollup RPC fast-path (avoids O(N) table scans & DB locks at 500M+ users)
  if (!counts && typeof supabaseAdmin?.rpc === "function") {
    try {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("get_ad_capacity_counts", {
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
        setL1CachedCounts(supabaseAdmin, filterCacheHash, counts);
        if (canUseRedis) {
          try {
            await redisConnection.set(redisCacheKey, JSON.stringify(counts), "EX", L2_REDIS_TTL_SECONDS);
          } catch {
            // Non-fatal
          }
        }
      }
    } catch {
      // Fall back to direct head count query if RPC is not yet deployed
    }
  }

  // Fallback path (when RPC is not yet deployed or using a test mock client without .rpc)
  if (!counts) {
    const globalRes = await runHeadCountQuery(supabaseAdmin, (q) => q);
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
      const countryRes = await runHeadCountQuery(supabaseAdmin, (q) =>
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
        const strictRes = await runHeadCountQuery(supabaseAdmin, (q) => {
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
    setL1CachedCounts(supabaseAdmin, filterCacheHash, counts);
    if (canUseRedis) {
      try {
        await redisConnection.set(redisCacheKey, JSON.stringify(counts), "EX", L2_REDIS_TTL_SECONDS);
      } catch {
        // Non-fatal
      }
    }
  }

  const ownerAdjustment = input.advertiserEmail ? 1 : 0;
  const globalUsers = Math.max(0, counts.globalCount - ownerAdjustment);
  const countryUsers = Math.max(0, counts.countryCount - ownerAdjustment);
  let strictUsers = Math.max(0, counts.strictCount - ownerAdjustment);

  if (!isTargetingAll) {
    // Apply conservative demographic selectivity for encrypted DOB / multi-location / employment filters
    const ageSpan = parseAgeSpan(input.ageRange);
    const ageFactor = ageSpan <= 10 ? 0.3 : ageSpan <= 22 ? 0.5 : ageSpan <= 40 ? 0.72 : 1.0;
    const empFactor = employmentFilters.length > 0 ? 0.5 : 1.0;
    const multiLocFactor = hasMultiLocations && states.length === 0 ? 0.35 : 1.0;
    strictUsers = Math.floor(strictUsers * ageFactor * empFactor * multiLocFactor);
  }

  // Compute stage deliverable volumes honoring pacing and Rollover cap expansion (+1 Stage 1, +2 Stage 2).
  // Use a light 0.95 delivery headroom here so safety-buffering via reserveFactor ([0.80..0.90])
  // does not double-penalize orders like 20,000 users × 5 freq cap = 100,000 attentions.
  const strictCapPerUser = Math.min(baseCap, days * 6);
  const stage1CapPerUser = Math.min(Math.min(102, baseCap + 1), Math.max(days, 3) * 6);
  const stage2CapPerUser = Math.min(Math.min(102, baseCap + 2), Math.max(days, 7) * 6);

  const strictRaw = Math.floor(strictUsers * strictCapPerUser * 0.95);
  const stage1Raw = Math.floor(countryUsers * stage1CapPerUser * 0.95);
  const stage2Raw = Math.floor(globalUsers * stage2CapPerUser * 0.95);

  const broadenedRaw = Math.max(strictRaw, stage1Raw, stage2Raw);

  const reserveFactor = getReserveFactor();
  const strictTier = quantizeDeliverableCapacity(strictRaw, reserveFactor);
  const maxOrderable = quantizeDeliverableCapacity(broadenedRaw, reserveFactor);

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
