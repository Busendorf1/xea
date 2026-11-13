import { redisConnection, isRedisReady } from "../redis";
import { supabaseReadOnly } from "../utils/dbAdmin";

export type PublicAdResolution =
  | { available: true; adId: string }
  | { available: false; reason: "invalid_id" | "not_found" | "expired" };

const L1_MAX_ENTRIES = 5000;
const L1_TTL_MS = 30 * 1000;
const L2_TTL_SECONDS = 60;

const l1PublicAdCache = new Map<string, { res: PublicAdResolution; expiresAt: number }>();
const inFlightChecks = new Map<string, Promise<PublicAdResolution>>();

export function isAdRowActiveAndAvailable(row: {
  completed_at?: string | null;
  is_paused?: boolean | null;
  impressions?: number | string | null;
  impression_count?: number | string | null;
  campaign_days?: number | string | null;
  created_at?: string | null;
} | null | undefined, nowMs = Date.now()): boolean {
  if (!row) return false;
  if (row.completed_at) return false;
  if (row.is_paused === true) return false;

  const targetImpressions = Number(row.impressions || 0);
  const currentImpressions = Number(row.impression_count || 0);
  if (targetImpressions > 0 && currentImpressions >= targetImpressions) {
    return false;
  }

  // Optional campaign duration expiration check if campaign_days > 0 and created_at is valid
  const campaignDays = Number(row.campaign_days || 0);
  if (campaignDays > 0 && row.created_at) {
    const createdMs = new Date(row.created_at).getTime();
    if (Number.isFinite(createdMs) && createdMs > 0) {
      const expiresAtMs = createdMs + campaignDays * 24 * 60 * 60 * 1000;
      if (nowMs >= expiresAtMs) {
        return false;
      }
    }
  }

  return true;
}

function setL1(adId: string, res: PublicAdResolution) {
  if (l1PublicAdCache.size >= L1_MAX_ENTRIES) {
    const oldestKey = l1PublicAdCache.keys().next().value;
    if (oldestKey) l1PublicAdCache.delete(oldestKey);
  }
  l1PublicAdCache.set(adId, { res, expiresAt: Date.now() + L1_TTL_MS });
}

/**
 * High-efficiency L1 + L2 Redis cached check for public/shared ad availability.
 * Uses single-flight coalescing so viral shared links at 500M+ traffic trigger at most 1 DB read per TTL.
 */
export async function resolvePublicAdAvailability(rawId: string): Promise<PublicAdResolution> {
  const adId = String(rawId || "").trim();
  if (!adId || !/^[a-zA-Z0-9_-]{1,128}$/.test(adId)) {
    return { available: false, reason: "invalid_id" };
  }

  const l1 = l1PublicAdCache.get(adId);
  if (l1 && Date.now() < l1.expiresAt) {
    return l1.res;
  }

  const existingFlight = inFlightChecks.get(adId);
  if (existingFlight) {
    return existingFlight;
  }

  const run = (async (): Promise<PublicAdResolution> => {
    try {
      const redisKey = `ad:public:status:${adId}`;
      if (isRedisReady()) {
        const cachedRaw = await redisConnection.get(redisKey).catch(() => null);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw) as PublicAdResolution;
          setL1(adId, parsed);
          return parsed;
        }
      }

      const { data, error } = await supabaseReadOnly
        .from("addsactive")
        .select("id, completed_at, is_paused, impressions, impression_count, campaign_days, created_at")
        .eq("id", adId)
        .maybeSingle();

      if (error) {
        console.error("[publicAdResolver] Lookup error:", error.message);
        return { available: false, reason: "not_found" };
      }

      const resolution: PublicAdResolution = !data
        ? { available: false, reason: "not_found" }
        : isAdRowActiveAndAvailable(data)
        ? { available: true, adId: String(data.id) }
        : { available: false, reason: "expired" };

      setL1(adId, resolution);
      if (isRedisReady()) {
        redisConnection.set(redisKey, JSON.stringify(resolution), "EX", L2_TTL_SECONDS).catch(() => {});
      }

      return resolution;
    } finally {
      inFlightChecks.delete(adId);
    }
  })();

  inFlightChecks.set(adId, run);
  return run;
}
