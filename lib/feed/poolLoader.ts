import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { AdvertiserProfile } from "@/types/ads";
import {
  AD_DETAIL_TTL_SECONDS,
  AD_SELECT_FIELDS,
  AD_SELECT_FIELDS_FALLBACK,
  L1_SHARED_ADS_POOL_TTL_MS,
  inFlightCampaignPoolPromises,
  l1AdDetailsCache,
  l1PublisherProfilesCache,
  l1SharedCampaignsPool,
} from "./feedCaches";

export function getEffectiveBidPrice(ad: any): number {
  const bid = Number(ad?.bid_price || 0);
  const cpi = Number(ad?.cost_per_impression || ad?.impression || 0);
  return bid > 0 ? bid : cpi;
}

/**
 * Single-flight loader for active unpaused campaigns by country slice,
 * ordered strictly by `bid_price DESC` without full-table `deactivated_users` scans.
 */
export async function loadSharedActiveAdsForCountry(viewerCountryRaw: string): Promise<any[]> {
  const cleanCountry = (viewerCountryRaw || "").trim();
  const poolKey =
    cleanCountry && cleanCountry.toUpperCase() !== "PLACEHOLDER"
      ? cleanCountry.toLowerCase()
      : "__global__";

  const cachedPool = l1SharedCampaignsPool.get(poolKey);
  if (cachedPool && Date.now() < cachedPool.expiresAt) {
    return cachedPool.ads;
  }

  const existingPromise = inFlightCampaignPoolPromises.get(poolKey);
  if (existingPromise) {
    return existingPromise;
  }

  const fetchPromise = (async () => {
    try {
      const buildQuery = async (fields: string, rolloverOnly = false) => {
        let q: any = supabaseReadOnly
          .from("addsactive")
          .select(fields)
          .is("completed_at", null)
          .or("is_paused.is.null,is_paused.eq.false");

        if (rolloverOnly) {
          if (typeof q?.eq !== "function") {
            return { data: [], error: null };
          }
          q = q.eq("is_rollover", true);
        }

        if (poolKey !== "__global__") {
          const safeCountry = cleanCountry.replace(/[,()]/g, "");
          q = q.or(
            `targeting_all.eq.true,is_admin_post.eq.true,country.is.null,country.eq.,country.ilike.%${safeCountry}%,country.ilike.%all%`
          );
        }

        return q
          .order("bid_price", { ascending: false })
          .order("cost_per_impression", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(rolloverOnly ? 60 : 250);
      };

      const [primaryRes, rolloverRes] = await Promise.all([
        buildQuery(AD_SELECT_FIELDS, false),
        buildQuery(AD_SELECT_FIELDS, true).catch(() => ({ data: null, error: null })),
      ]);

      let fallbackAds = primaryRes.data;
      if (primaryRes.error) {
        const fallbackRes = await buildQuery(AD_SELECT_FIELDS_FALLBACK, false);
        fallbackAds = fallbackRes.data;
      }

      // Merge dedicated rollover slice (uses partial index idx_addsactive_rollover_pool_bid)
      // so lower-bid rollover ads never starve behind 250 high-bid active campaigns
      const mergedById = new Map<string, any>();
      (fallbackAds || []).forEach((ad: any) => {
        if (ad?.id) mergedById.set(String(ad.id), ad);
      });
      if (!rolloverRes?.error && Array.isArray(rolloverRes?.data)) {
        rolloverRes.data.forEach((ad: any) => {
          if (ad?.id && !mergedById.has(String(ad.id))) {
            mergedById.set(String(ad.id), ad);
          }
        });
      }

      let rows = Array.from(mergedById.values());
      if (rows.length > 0 && isRedisReady()) {
        try {
          const ownerEmails = Array.from(
            new Set(
              rows
                .map((ad: any) => (ad.user_email || ad.email || "").toLowerCase().trim())
                .filter(Boolean)
            )
          );
          if (ownerEmails.length > 0 && typeof (redisConnection as any).smismember === "function") {
            const flags: number[] = await (redisConnection as any)
              .smismember("deactivated:users", ...ownerEmails)
              .catch(() => []);
            if (Array.isArray(flags) && flags.length === ownerEmails.length) {
              const deactSet = new Set<string>();
              ownerEmails.forEach((em, idx) => {
                if (flags[idx] === 1) deactSet.add(em);
              });
              if (deactSet.size > 0) {
                rows = rows.filter((ad: any) => {
                  const owner = (ad.user_email || ad.email || "").toLowerCase().trim();
                  return !owner || !deactSet.has(owner);
                });
              }
            }
          }
        } catch {}
      }

      // Ensure authoritative bid_price DESC sorting in memory
      rows = [...rows].sort((a, b) => getEffectiveBidPrice(b) - getEffectiveBidPrice(a));

      l1SharedCampaignsPool.set(poolKey, {
        ads: rows,
        expiresAt: Date.now() + L1_SHARED_ADS_POOL_TTL_MS,
      });

      const detailExp = Date.now() + AD_DETAIL_TTL_SECONDS * 1000;
      rows.forEach((ad: any) => {
        if (ad?.id) {
          l1AdDetailsCache.set(ad.id, { ad, expiresAt: detailExp });
        }
      });

      return rows;
    } finally {
      inFlightCampaignPoolPromises.delete(poolKey);
    }
  })();

  inFlightCampaignPoolPromises.set(poolKey, fetchPromise);
  return fetchPromise;
}

export function formatPublisherProfile(p: any): AdvertiserProfile {
  const rawFirst = typeof p.firstName === "string" && !p.firstName.startsWith("enc:v1:") ? p.firstName : "";
  const rawLast = typeof p.lastName === "string" && !p.lastName.startsWith("enc:v1:") ? p.lastName : "";
  return {
    email: p.email,
    username: p.username || (p.email ? p.email.split("@")[0] : "Advertiser"),
    business_name: p.business_name || "",
    firstName: rawFirst,
    lastName: rawLast,
    profileImage: p.profileImage || "",
    gender: p.gender || "",
    bio: p.bio || "",
    location: p.location || "",
    country: p.country || "",
    created_at: p.created_at || "",
    monetized: p.monetized === true || p.monetized === "true" || p.monetized === "yes",
    is_career: Boolean(p.is_career),
    is_affiliate: Boolean(p.is_affiliate),
    affiliate_role: p.affiliate_role || null,
  };
}

export async function hydratePublisherProfiles(
  publisherEmails: string[],
  profilesMap: Record<string, AdvertiserProfile>
): Promise<void> {
  const emailLookupSet = new Set<string>();
  for (const pubEmail of publisherEmails) {
    const lower = pubEmail.toLowerCase().trim();
    const cachedPub = l1PublisherProfilesCache.get(lower);
    if (cachedPub && Date.now() < cachedPub.expiresAt) {
      profilesMap[lower] = cachedPub.profile;
    } else {
      emailLookupSet.add(pubEmail);
      emailLookupSet.add(lower);
    }
  }

  const missingPublisherEmails = Array.from(emailLookupSet);
  if (missingPublisherEmails.length === 0) return;

  const { data: profiles, error: profilesError } = await supabaseReadOnly
    .from("users")
    .select(
      'email, username, business_name, "firstName", "lastName", "profileImage", gender, bio, location, country, created_at, monetized, is_career, is_affiliate, affiliate_role'
    )
    .in("email", missingPublisherEmails);

  if (!profilesError && profiles) {
    const pubExp = Date.now() + 5 * 60 * 1000;
    profiles.forEach((p: any) => {
      if (p.email) {
        const lower = p.email.toLowerCase();
        const formatted = formatPublisherProfile(p);
        profilesMap[lower] = formatted;
        l1PublisherProfilesCache.set(lower, { profile: formatted, expiresAt: pubExp });
      }
    });
  }
}
