import { redisConnection, isRedisReady } from "../redis";
import { supabaseReadOnly } from "../utils/dbAdmin";
import type { Ad, AdvertiserProfile } from "../../types/ads";
import { transformMediaUrlsToCdn } from "../utils/cdnUrl";
import { isAdminEmail } from "../authHelper";

export type PublicAdResolution =
  | { available: true; adId: string }
  | { available: false; reason: "invalid_id" | "not_found" | "expired" };

export type PublicSharedAdDetailResolution =
  | { available: true; ad: Ad; profile: AdvertiserProfile | null }
  | { available: false; reason: "invalid_id" | "not_found" | "expired" };

const L1_MAX_ENTRIES = 5000;
const L1_TTL_MS = 30 * 1000;
const L2_TTL_SECONDS = 60;
const AD_DETAIL_TTL_SECONDS = 1800;

const PUBLIC_AD_SELECT_FIELDS =
  "id, user_email, ad_media, ad_media_type, ad_content, ad_type, product_name, product_price, product_cta_type, product_cta_link, action_phone, action_whatsapp, action_email, action_website, action_ios, action_android, action_watch_now, ad_action_buttons, cost_per_impression, bid_price, is_bidded, is_boosted, boosted_amount, boosted_at, display_mutual_button, mutual_targets, mutual_adds_count, interest, industry, behavior, lifestyle, personality, country, state, province, gender, employment_status, age_range, targeting_all, is_paused, is_admin_post, user_frequency_cap, campaign_days, impressions, impression_count, completed_at, created_at, approved_at, scheduled_start_at, scheduled_end_at, is_rollover, rollover_started_at, broadening_stage, rollover_balance, daily_impression_cap, daily_impression_count, last_reset_date, is_ai_content";

const PUBLIC_AD_SELECT_FIELDS_FALLBACK =
  "id, user_email, ad_media, ad_media_type, ad_content, ad_type, product_name, product_price, product_cta_type, product_cta_link, action_phone, action_whatsapp, action_email, action_website, action_ios, action_android, action_watch_now, ad_action_buttons, cost_per_impression, bid_price, is_bidded, display_mutual_button, mutual_targets, mutual_adds_count, interest, industry, behavior, lifestyle, personality, country, state, province, gender, employment_status, age_range, targeting_all, is_paused, is_admin_post, user_frequency_cap, campaign_days, impressions, impression_count, completed_at, created_at, approved_at, scheduled_start_at, scheduled_end_at";

const l1PublicAdCache = new Map<string, { res: PublicAdResolution; expiresAt: number }>();
const l1AdDetailsCache = new Map<string, { ad: Ad; expiresAt: number }>();
const l1PublisherProfilesCache = new Map<string, { profile: AdvertiserProfile; expiresAt: number }>();
const inFlightChecks = new Map<string, Promise<PublicAdResolution>>();

function formatPublicPublisherProfile(row: Record<string, any>): AdvertiserProfile {
  const emailLower = String(row.email || "").toLowerCase().trim();
  return {
    email: emailLower,
    username: row.username || undefined,
    firstName: row.firstName || undefined,
    lastName: row.lastName || undefined,
    business_name: row.business_name || undefined,
    profileImage: row.profileImage || undefined,
    gender: row.gender || undefined,
    bio: row.bio || undefined,
    location: row.location || undefined,
    country: row.country || undefined,
    created_at: row.created_at || undefined,
    monetized: Boolean(row.monetized),
    is_career: Boolean(row.is_career),
    is_affiliate: Boolean(row.is_affiliate),
    affiliate_role: row.affiliate_role || undefined,
  };
}

export function isAdRowActiveAndAvailable(row: {
  completed_at?: string | null;
  is_paused?: boolean | null;
  is_admin_post?: boolean | null;
  cost_per_impression?: number | string | null;
  impressions?: number | string | null;
  impression_count?: number | string | null;
  campaign_days?: number | string | null;
  created_at?: string | null;
  approved_at?: string | null;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
} | null | undefined, nowMs = Date.now()): boolean {
  if (!row) return false;
  if (row.completed_at) return false;
  if (row.is_paused === true) return false;

  const schedStartMs = row.scheduled_start_at ? new Date(row.scheduled_start_at).getTime() : NaN;
  if (Number.isFinite(schedStartMs) && schedStartMs > nowMs) {
    return false;
  }

  const targetImpressions = Number(row.impressions || 0);
  const currentImpressions = Number(row.impression_count || 0);
  if (targetImpressions > 0 && currentImpressions >= targetImpressions) {
    return false;
  }

  const hasExplicitZeroCpi =
    row.cost_per_impression !== undefined &&
    row.cost_per_impression !== null &&
    Number(row.cost_per_impression) <= 0;
  const isUnpaidPlatform = Boolean(
    (row.is_admin_post && Number(row.cost_per_impression || 0) <= 0) ||
      hasExplicitZeroCpi ||
      targetImpressions <= 0
  );
  // Paid campaigns with remaining impressions continue running in Rollover Mode past duration end
  const hasRemainingPaidImpressions = !isUnpaidPlatform && targetImpressions > 0 && currentImpressions < targetImpressions;

  const campaignDays = Number(row.campaign_days || 0);
  const baseLaunchMs = row.approved_at
    ? new Date(row.approved_at).getTime()
    : row.created_at
    ? new Date(row.created_at).getTime()
    : NaN;
  const startMs =
    Number.isFinite(schedStartMs) && schedStartMs > 0
      ? Number.isFinite(baseLaunchMs) && baseLaunchMs > 0
        ? Math.max(baseLaunchMs, schedStartMs)
        : schedStartMs
      : baseLaunchMs;

  const schedEndMs = row.scheduled_end_at ? new Date(row.scheduled_end_at).getTime() : NaN;
  let expiresAtMs = NaN;
  if (Number.isFinite(schedEndMs) && schedEndMs > 0 && (!Number.isFinite(startMs) || schedEndMs > startMs)) {
    expiresAtMs = schedEndMs;
  } else if (campaignDays > 0 && Number.isFinite(startMs) && startMs > 0) {
    expiresAtMs = startMs + campaignDays * 24 * 60 * 60 * 1000;
  }

  if (Number.isFinite(expiresAtMs) && nowMs >= expiresAtMs && !hasRemainingPaidImpressions) {
    return false;
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
        .select(
          "id, completed_at, is_paused, is_admin_post, cost_per_impression, impressions, impression_count, campaign_days, created_at, approved_at, scheduled_start_at, scheduled_end_at"
        )
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

const inFlightDetailChecks = new Map<string, Promise<PublicSharedAdDetailResolution>>();

/**
 * Resolves full public-safe Ad + Publisher profile for unauthenticated /ad/<id> single-ad views.
 */
export async function resolvePublicSharedAdDetail(
  rawId: string,
  origin?: string
): Promise<PublicSharedAdDetailResolution> {
  const adId = String(rawId || "").trim();
  if (!adId || !/^[a-zA-Z0-9_-]{1,128}$/.test(adId)) {
    return { available: false, reason: "invalid_id" };
  }

  const existingFlight = inFlightDetailChecks.get(adId);
  if (existingFlight) {
    return existingFlight;
  }

  const run = (async (): Promise<PublicSharedAdDetailResolution> => {
    try {
      const l1 = l1AdDetailsCache.get(adId);
      let sharedAd: Ad | null = l1 && Date.now() < l1.expiresAt ? l1.ad : null;
      let isNegCached = false;

      if (!sharedAd && isRedisReady()) {
        const [cachedRaw, negRaw] = await Promise.all([
          redisConnection.get(`ad:detail:${adId}`).catch(() => null),
          redisConnection.get(`ad:unavailable:${adId}`).catch(() => null),
        ]);
        if (cachedRaw) {
          try {
            sharedAd = JSON.parse(cachedRaw) as Ad;
          } catch {
            sharedAd = null;
          }
        } else if (negRaw === "1") {
          isNegCached = true;
        }
      }

      if (sharedAd && !isAdRowActiveAndAvailable(sharedAd as Record<string, any>)) {
        sharedAd = null;
      }

      if (!sharedAd && !isNegCached) {
        const { data: initialRow, error: initialErr } = await supabaseReadOnly
          .from("addsactive")
          .select(PUBLIC_AD_SELECT_FIELDS)
          .eq("id", adId)
          .maybeSingle();

        let row: Record<string, any> | null = initialRow as Record<string, any> | null;
        if (initialErr) {
          const fbRes = await supabaseReadOnly
            .from("addsactive")
            .select(PUBLIC_AD_SELECT_FIELDS_FALLBACK)
            .eq("id", adId)
            .maybeSingle();
          row = fbRes.data as Record<string, any> | null;
        }

        if (!row) {
          if (isRedisReady()) {
            redisConnection.set(`ad:unavailable:${adId}`, "1", "EX", L2_TTL_SECONDS).catch(() => {});
          }
          return { available: false, reason: "not_found" };
        }

        if (!isAdRowActiveAndAvailable(row as Record<string, any>)) {
          return { available: false, reason: "expired" };
        }

        sharedAd = row as Ad;
        l1AdDetailsCache.set(sharedAd.id, {
          ad: sharedAd,
          expiresAt: Date.now() + AD_DETAIL_TTL_SECONDS * 1000,
        });
        if (isRedisReady()) {
          redisConnection
            .set(`ad:detail:${sharedAd.id}`, JSON.stringify(sharedAd), "EX", AD_DETAIL_TTL_SECONDS)
            .catch(() => {});
        }
      }

      if (!sharedAd) {
        return { available: false, reason: "expired" };
      }

      let profile: AdvertiserProfile | null = null;
      const pubEmail = sharedAd.user_email;
      if (pubEmail) {
        const pubLower = pubEmail.toLowerCase().trim();
        const cachedPub = l1PublisherProfilesCache.get(pubLower);
        if (cachedPub && Date.now() < cachedPub.expiresAt) {
          profile = cachedPub.profile;
        } else {
          const usersQuery: any = supabaseReadOnly
            .from("users")
            .select(
              'email, username, business_name, "firstName", "lastName", "profileImage", gender, bio, location, country, created_at, monetized, is_career, is_affiliate, affiliate_role'
            )
            .in("email", [pubEmail, pubLower]);
          const pubRes =
            typeof usersQuery?.limit === "function"
              ? await usersQuery.limit(1).maybeSingle()
              : await usersQuery;
          const pubRow = Array.isArray(pubRes?.data) ? pubRes.data[0] : pubRes?.data;
          if (!pubRes?.error && pubRow?.email) {
            profile = formatPublicPublisherProfile(pubRow);
            l1PublisherProfilesCache.set(pubLower, {
              profile,
              expiresAt: Date.now() + 5 * 60 * 1000,
            });
          }
        }
      }

      const isPlatformPost = Boolean(
        sharedAd.is_admin_post ||
          isAdminEmail(sharedAd.user_email || (sharedAd as any).email) ||
          !sharedAd.cost_per_impression ||
          Number(sharedAd.cost_per_impression) <= 0 ||
          !sharedAd.impressions ||
          Number(sharedAd.impressions) <= 0
      );

      const safeAd: Ad = {
        ...sharedAd,
        ad_media: transformMediaUrlsToCdn(sharedAd.ad_media, origin),
        is_admin_post: isPlatformPost,
        cost_per_impression: isPlatformPost ? 0 : Number(sharedAd.cost_per_impression || 0),
        impressions: isPlatformPost ? 0 : Number(sharedAd.impressions || 0),
      };

      return { available: true, ad: safeAd, profile };
    } finally {
      inFlightDetailChecks.delete(adId);
    }
  })();

  inFlightDetailChecks.set(adId, run);
  return run;
}
