import { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { AdvertiserProfile } from "@/types/ads";
import {
  AD_DETAIL_TTL_SECONDS,
  AD_SELECT_FIELDS,
  AD_SELECT_FIELDS_FALLBACK,
  AD_SELECT_FIELDS_MINIMAL,
  L1_SHARED_ADS_POOL_TTL_MS,
  inFlightCampaignPoolPromises,
  l1AdDetailsCache,
  l1SharedCampaignsPool,
} from "./feedCaches";

export {
  l1PublisherProfilesCache,
  formatPublisherProfile,
  isPublisherAccountBlocked,
  hydratePublisherProfiles,
} from "./publisherProfiles";

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

      let activeFieldList = AD_SELECT_FIELDS;
      const primaryRes = await buildQuery(AD_SELECT_FIELDS, false);
      let mainAds = primaryRes.data;

      if (primaryRes.error) {
        activeFieldList = AD_SELECT_FIELDS_FALLBACK;
        const fallbackRes = await buildQuery(AD_SELECT_FIELDS_FALLBACK, false);
        mainAds = fallbackRes.data;
        if (fallbackRes.error) {
          activeFieldList = AD_SELECT_FIELDS_MINIMAL;
          const minimalRes = await buildQuery(AD_SELECT_FIELDS_MINIMAL, false);
          mainAds = minimalRes.data;
        }
      }

      const rolloverRes = await buildQuery(activeFieldList, true).catch(() => ({
        data: null,
        error: null,
      }));

      // Merge dedicated rollover slice (uses partial index idx_addsactive_rollover_pool_bid)
      // so lower-bid rollover ads never starve behind 250 high-bid active campaigns
      const mergedById = new Map<string, any>();
      (mainAds || []).forEach((ad: any) => {
        if (ad?.id) mergedById.set(String(ad.id), ad);
      });
      if (!rolloverRes?.error && Array.isArray(rolloverRes?.data)) {
        rolloverRes.data.forEach((ad: any) => {
          if (ad?.id && !mergedById.has(String(ad.id))) {
            mergedById.set(String(ad.id), ad);
          }
        });
      }

      let rows = Array.from(mergedById.values()).filter((ad: any) => {
        if (!ad || ad.completed_at || ad.is_paused === true) return false;
        const targetImp = Number(ad.impressions || 0);
        const currentImp = Number(ad.impression_count || 0);
        if (!ad.is_admin_post && targetImp > 0 && currentImp >= targetImp) return false;
        return true;
      });

      if (rows.length > 0) {
        try {
          const ownerEmails = Array.from(
            new Set(
              rows
                .map((ad: any) => (ad.user_email || ad.email || "").toLowerCase().trim())
                .filter(Boolean)
            )
          );
          if (ownerEmails.length > 0 && isRedisReady() && typeof (redisConnection as any).smismember === "function") {
            const deactSet = new Set<string>();
            const flags: number[] = await (redisConnection as any)
              .smismember("deactivated:users", ...ownerEmails)
              .catch(() => []);
            if (Array.isArray(flags) && flags.length === ownerEmails.length) {
              ownerEmails.forEach((em, idx) => {
                if (flags[idx] === 1) deactSet.add(em);
              });
            }
            if (deactSet.size > 0) {
              rows = rows.filter((ad: any) => {
                const owner = (ad.user_email || ad.email || "").toLowerCase().trim();
                return !owner || !deactSet.has(owner);
              });
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
