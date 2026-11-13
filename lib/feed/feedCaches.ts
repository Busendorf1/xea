import { Ad, AdvertiserProfile } from "@/types/ads";
import { registerL1FeedEvictionHandler } from "@/lib/utils/cache";
import { ViewerTargetingProfile } from "@/lib/targetingEngine";

export const USER_FEED_IDS_TTL_SECONDS = 600;
export const AD_DETAIL_TTL_SECONDS = 1800;
export const L1_USER_FEED_TTL_MS = 120 * 1000;
export const L1_SHARED_ADS_POOL_TTL_MS = 25 * 1000;
export const MAX_L1_USER_FEEDS = 3000;
export const RETARGET_MIN_COOLDOWN_MS = 2 * 60 * 60 * 1000;

export const AD_SELECT_FIELDS =
  "id, user_email, ad_media, ad_media_type, ad_content, ad_type, product_name, product_price, product_cta_type, product_cta_link, action_phone, action_whatsapp, action_email, action_website, action_ios, action_android, action_watch_now, ad_action_buttons, cost_per_impression, bid_price, is_bidded, display_mutual_button, mutual_targets, mutual_adds_count, interest, industry, behavior, lifestyle, personality, country, state, province, gender, employment_status, age_range, targeting_all, is_paused, is_admin_post, user_frequency_cap, campaign_days, impressions, impression_count, completed_at, created_at, is_ai_content";

export const AD_SELECT_FIELDS_FALLBACK =
  "id, user_email, ad_media, ad_media_type, ad_content, ad_type, product_name, product_price, product_cta_type, product_cta_link, action_phone, action_whatsapp, action_email, action_website, action_ios, action_android, action_watch_now, ad_action_buttons, cost_per_impression, display_mutual_button, mutual_targets, mutual_adds_count, interest, industry, behavior, lifestyle, personality, country, state, province, gender, employment_status, age_range, targeting_all, is_paused, is_admin_post, user_frequency_cap, campaign_days, impressions, impression_count, completed_at, created_at, is_ai_content, bid_price, is_bidded";

export interface L1UserFeedEntry {
  adIds: string[];
  profilesMap: Record<string, AdvertiserProfile>;
  expiresAt: number;
}

export const l1SharedCampaignsPool = new Map<string, { ads: any[]; expiresAt: number }>();
export const inFlightCampaignPoolPromises = new Map<string, Promise<any[]>>();
export const l1AdDetailsCache = new Map<string, { ad: Ad; expiresAt: number }>();
export const l1PublisherProfilesCache = new Map<string, { profile: AdvertiserProfile; expiresAt: number }>();
export const l1UserFeedCache = new Map<string, L1UserFeedEntry>();

export function evictAdFromL1FeedCachesInternal(adId?: string) {
  if (adId) {
    l1AdDetailsCache.delete(adId);
    for (const [poolKey, entry] of l1SharedCampaignsPool.entries()) {
      const filtered = entry.ads.filter((a: any) => String(a?.id) !== String(adId));
      if (filtered.length !== entry.ads.length) {
        l1SharedCampaignsPool.set(poolKey, { ads: filtered, expiresAt: entry.expiresAt });
      }
    }
    for (const [userKey, feedEntry] of l1UserFeedCache.entries()) {
      if (feedEntry.adIds.includes(adId)) {
        l1UserFeedCache.set(userKey, {
          ...feedEntry,
          adIds: feedEntry.adIds.filter((id) => id !== adId),
        });
      }
    }
  } else {
    l1SharedCampaignsPool.clear();
    l1UserFeedCache.clear();
  }
}

registerL1FeedEvictionHandler(evictAdFromL1FeedCachesInternal);

export function setL1UserFeed(
  emailKey: string,
  adIds: string[],
  profilesMap: Record<string, AdvertiserProfile>
) {
  if (l1UserFeedCache.size >= MAX_L1_USER_FEEDS && !l1UserFeedCache.has(emailKey)) {
    const firstKey = l1UserFeedCache.keys().next().value;
    if (firstKey) l1UserFeedCache.delete(firstKey);
  }
  l1UserFeedCache.set(emailKey, {
    adIds,
    profilesMap,
    expiresAt: Date.now() + L1_USER_FEED_TTL_MS,
  });
}

function isValidGeoValue(val: unknown): boolean {
  const clean = String(val || "").trim().toLowerCase();
  return Boolean(clean && clean !== "placeholder" && clean !== "n/a" && clean !== "none");
}

/**
 * Enforces Terms §1.4: viewer must have valid geo enabled (or not skipped location)
 * before receiving monetized/targeted general feed ads.
 */
export function hasViewerLocationEnabled(
  viewerProfile: ViewerTargetingProfile | null,
  locationSkipped: boolean,
  isExemptViewer: boolean
): boolean {
  if (isExemptViewer) return true;
  if (locationSkipped) return false;
  if (!viewerProfile) return false;
  return (
    isValidGeoValue(viewerProfile.country) ||
    isValidGeoValue(viewerProfile.state) ||
    isValidGeoValue(viewerProfile.location)
  );
}
