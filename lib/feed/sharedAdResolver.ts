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

  if (!sharedAdId || offset !== 0) {
    return { pageAds, profilesMap, sharedAdUnavailable };
  }

  try {
    const cleanSharedId = String(sharedAdId).trim();
    const isValidSharedId = /^[a-zA-Z0-9_-]{1,128}$/.test(cleanSharedId);
    if (!isValidSharedId) {
      return { pageAds, profilesMap, sharedAdUnavailable: true };
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

      let sharedDb = initialSharedDb;
      if (sharedErr) {
        const fbRes = await supabaseReadOnly
          .from("addsactive")
          .select(AD_SELECT_FIELDS_FALLBACK)
          .eq("id", cleanSharedId)
          .maybeSingle();
        sharedDb = fbRes.data;
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
      pageAds = [sharedAd, ...pageAds.filter((a) => String(a.id) !== String(sharedAd!.id))];

      const sharedPubEmail = sharedAd.user_email;
      if (sharedPubEmail) {
        const sharedPubLower = sharedPubEmail.toLowerCase().trim();
        if (!profilesMap[sharedPubLower]) {
          profilesMap = { ...profilesMap };
          const cachedSharedPub = l1PublisherProfilesCache.get(sharedPubLower);
          if (cachedSharedPub && Date.now() < cachedSharedPub.expiresAt) {
            profilesMap[sharedPubLower] = cachedSharedPub.profile;
          } else {
            const { data: sharedPubRow, error: sharedPubErr } = await supabaseReadOnly
              .from("users")
              .select(
                'email, username, business_name, "firstName", "lastName", "profileImage", gender, bio, location, country, created_at, monetized, is_career, is_affiliate, affiliate_role'
              )
              .in("email", [sharedPubEmail, sharedPubLower])
              .limit(1)
              .maybeSingle();

            if (!sharedPubErr && sharedPubRow?.email) {
              const formatted = formatPublisherProfile(sharedPubRow);
              profilesMap[sharedPubLower] = formatted;
              l1PublisherProfilesCache.set(sharedPubLower, {
                profile: formatted,
                expiresAt: Date.now() + 5 * 60 * 1000,
              });
            }
          }
        }
      }
    } else {
      sharedAdUnavailable = true;
    }
  } catch (sErr) {
    console.error("❌ Error resolving shared ad on server:", sErr);
  }

  return { pageAds, profilesMap, sharedAdUnavailable };
}
