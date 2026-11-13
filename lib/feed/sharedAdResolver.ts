import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { Ad, AdvertiserProfile } from "@/types/ads";
import { isAdRowActiveAndAvailable } from "@/lib/ads/publicAdResolver";
import {
  AD_DETAIL_TTL_SECONDS,
  AD_SELECT_FIELDS,
  AD_SELECT_FIELDS_FALLBACK,
  l1AdDetailsCache,
  l1PublisherProfilesCache,
} from "./feedCaches";
import { formatPublisherProfile } from "./poolLoader";

export async function resolveSharedAdForFeed(params: {
  sharedAdId: string | null;
  offset: number;
  pageAds: Ad[];
  profilesMap: Record<string, AdvertiserProfile>;
}): Promise<{
  pageAds: Ad[];
  profilesMap: Record<string, AdvertiserProfile>;
  sharedAdUnavailable: boolean;
}> {
  const { sharedAdId, offset } = params;
  let pageAds = params.pageAds;
  let profilesMap = params.profilesMap;
  let sharedAdUnavailable = false;

  if (!sharedAdId) {
    return { pageAds, profilesMap, sharedAdUnavailable };
  }

  // In single-ad shared mode, pagination offsets beyond 0 never return extra feed ads
  if (offset !== 0) {
    return { pageAds: [], profilesMap: {}, sharedAdUnavailable: false };
  }

  try {
    const cleanSharedId = String(sharedAdId).trim();
    const isValidSharedId = /^[a-zA-Z0-9_-]{1,128}$/.test(cleanSharedId);
    if (!isValidSharedId) {
      return { pageAds: [], profilesMap: {}, sharedAdUnavailable: true };
    }

    const l1Shared = l1AdDetailsCache.get(cleanSharedId);
    let sharedAd: Ad | null = l1Shared && Date.now() < l1Shared.expiresAt ? l1Shared.ad : null;
    let isNegCached = false;

    if (!sharedAd && isRedisReady()) {
      const [cachedRaw, negRaw] = await Promise.all([
        redisConnection.get(`ad:detail:${cleanSharedId}`).catch(() => null),
        redisConnection.get(`ad:unavailable:${cleanSharedId}`).catch(() => null),
      ]);
      if (cachedRaw) sharedAd = JSON.parse(cachedRaw);
      else if (negRaw === "1") isNegCached = true;
    }

    const isSharedAdValid = (cand: Ad | null) =>
      Boolean(cand && isAdRowActiveAndAvailable(cand as Record<string, any>));

    if (sharedAd && !isSharedAdValid(sharedAd)) {
      sharedAd = null;
    }

    if (!sharedAd && !isNegCached) {
      const { data: initialSharedDb, error: sharedErr } = await supabaseReadOnly
        .from("addsactive")
        .select(AD_SELECT_FIELDS)
        .eq("id", cleanSharedId)
        .maybeSingle();

      let sharedDb: Record<string, any> | null = initialSharedDb as Record<string, any> | null;
      if (sharedErr) {
        const fbRes = await supabaseReadOnly
          .from("addsactive")
          .select(AD_SELECT_FIELDS_FALLBACK)
          .eq("id", cleanSharedId)
          .maybeSingle();
        sharedDb = fbRes.data as Record<string, any> | null;
      }

      if (sharedDb && isSharedAdValid(sharedDb as Ad)) {
        sharedAd = sharedDb as Ad;
        l1AdDetailsCache.set(sharedAd.id, {
          ad: sharedAd,
          expiresAt: Date.now() + AD_DETAIL_TTL_SECONDS * 1000,
        });
        if (isRedisReady()) {
          redisConnection
            .set(`ad:detail:${sharedAd.id}`, JSON.stringify(sharedAd), "EX", AD_DETAIL_TTL_SECONDS)
            .catch(() => {});
        }
      } else if (isRedisReady()) {
        redisConnection.set(`ad:unavailable:${cleanSharedId}`, "1", "EX", 60).catch(() => {});
      }
    }

    if (sharedAd) {
      // Strictly return ONLY the shared ad (never prepend onto general feed ads)
      pageAds = [sharedAd];

      const sharedPubEmail = sharedAd.user_email;
      const nextProfilesMap: Record<string, AdvertiserProfile> = {};
      if (sharedPubEmail) {
        const sharedPubLower = sharedPubEmail.toLowerCase().trim();
        if (profilesMap[sharedPubLower]) {
          nextProfilesMap[sharedPubLower] = profilesMap[sharedPubLower];
        } else {
          const cachedSharedPub = l1PublisherProfilesCache.get(sharedPubLower);
          if (cachedSharedPub && Date.now() < cachedSharedPub.expiresAt) {
            nextProfilesMap[sharedPubLower] = cachedSharedPub.profile;
          } else {
            const usersQuery: any = supabaseReadOnly
              .from("users")
              .select(
                'email, username, business_name, "firstName", "lastName", "profileImage", gender, bio, location, country, created_at, monetized, is_career, is_affiliate, affiliate_role'
              )
              .in("email", [sharedPubEmail, sharedPubLower]);
            const pubRes =
              typeof usersQuery?.limit === "function"
                ? await usersQuery.limit(1).maybeSingle()
                : await usersQuery;
            const sharedPubRow = Array.isArray(pubRes?.data) ? pubRes.data[0] : pubRes?.data;

            if (!pubRes?.error && sharedPubRow?.email) {
              const formatted = formatPublisherProfile(sharedPubRow);
              nextProfilesMap[sharedPubLower] = formatted;
              l1PublisherProfilesCache.set(sharedPubLower, {
                profile: formatted,
                expiresAt: Date.now() + 5 * 60 * 1000,
              });
            }
          }
        }
      }
      profilesMap = nextProfilesMap;
    } else {
      pageAds = [];
      profilesMap = {};
      sharedAdUnavailable = true;
    }
  } catch (sErr) {
    console.error("❌ Error resolving shared ad on server:", sErr);
    pageAds = [];
    profilesMap = {};
    sharedAdUnavailable = true;
  }

  return { pageAds, profilesMap, sharedAdUnavailable };
}
