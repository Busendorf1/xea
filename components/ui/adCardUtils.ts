import { buildAdActionHref } from "@/lib/utils/adShare";

export const preloadCallbacks = new WeakMap<Element, (intersecting: boolean) => void>();
export const playCallbacks = new WeakMap<Element, (intersecting: boolean) => void>();
const preloadObserversByRoot = new Map<Element | null, IntersectionObserver>();
const playObserversByRoot = new Map<Element | null, IntersectionObserver>();

export function getSharedPreloadObserver(root: Element | null = null): IntersectionObserver | null {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return null;
  let obs = preloadObserversByRoot.get(root);
  if (!obs) {
    obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          preloadCallbacks.get(entry.target)?.(entry.isIntersecting);
        }
      },
      // 1400px pre-warm headroom (~2.5 cards ahead) ensures full video header and first-frame buffer are ready before viewport entry
      { root, rootMargin: "1400px 0px 1400px 0px", threshold: 0 }
    );
    preloadObserversByRoot.set(root, obs);
  }
  return obs;
}

export function getSharedPlayObserver(root: Element | null = null): IntersectionObserver | null {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return null;
  let obs = playObserversByRoot.get(root);
  if (!obs) {
    obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // X / TikTok standard: Only card with majority (>45%) visibility in the active scroll viewport autoplays
          const isPrimaryInView = entry.isIntersecting && entry.intersectionRatio >= 0.45;
          playCallbacks.get(entry.target)?.(isPrimaryInView);
        }
      },
      { root, rootMargin: "0px 0px 0px 0px", threshold: [0, 0.45, 0.8] }
    );
    playObserversByRoot.set(root, obs);
  }
  return obs;
}

export type BaseAd = {
  id: string;
  ad_content: string;
  impressions: number;
  cost_per_impression?: number | null;
  created_at?: string | null;
  user_email?: string;
  title?: string;
  is_highlight?: boolean;
  [key: string]: any;
};

export type VideoAd = BaseAd & {
  ad_type?: "video";
  hls_url?: string | null;
  ad_media: string;
};

export type CarouselAd = BaseAd & {
  ad_type?: "carousel";
  ad_media: string;
};

export type TextAd = BaseAd & {
  ad_type?: "text";
  ad_media: null;
};

export type AdUnion = VideoAd | CarouselAd | TextAd;

export interface Ad {
  id: string;
  ad_media: string | null;
  hls_url?: string | null;
  ad_content: string;
  action_phone?: string;
  action_whatsapp?: string;
  action_email?: string;
  action_website?: string;
  action_ios?: string;
  action_android?: string;
  action_watch_now?: string;
  ad_action_buttons?: string[];
  ad_action_button?: string;
  interest: string[] | string | null;
  industry: string[] | string | null;
  behavior: string[] | string | null;
  lifestyle: string[] | string | null;
  personality: string[] | string | null;
  country: string | null;
  state: string | null;
  gender: string | null;
  employment_status: string | null;
  age_range: string[] | string | null;
  province: string | null;
  impressions: number;
  impression_count?: number | null;
  seen_users?: string[];
  campaign_days?: number;
  daily_impression_cap?: number;
  daily_impression_count?: number;
  last_reset_date?: string;
  user_frequency_cap?: number;
  completed_at?: string | null;
  user_email?: string;
  display_mutual_button?: boolean | null;
  mutual_targets?: string[] | null;
  mutual_adds_count?: number | null;
  cost_per_impression?: number | null;
  created_at?: string | null;
  targeting_all?: boolean;
  is_admin_post?: boolean;
  custom_sponsor_name?: string;
  custom_sponsor_handle?: string;
  custom_sponsor_logo?: string;
  is_highlight?: boolean;
  title?: string;
  verification_token?: string;
  served_at?: number;
  ad_type?: string;
  product_name?: string | null;
  product_price?: number | null;
  product_cta_type?: string | null;
  product_cta_link?: string | null;
  clicks_product_cta?: number | null;
  is_ai_content?: boolean;
}

export const getHref = (type: string, value: string, ad?: Ad) => {
  return buildAdActionHref(type, value, ad);
};

export const formatTimestamp = (timestamp: string | null | undefined): string => {
  if (!timestamp) return "1sec";
  try {
    const created = new Date(timestamp);
    const createdMs = created.getTime();
    if (isNaN(createdMs)) return "1sec";
    const now = new Date();
    const diffSec = Math.max(1, Math.floor((now.getTime() - createdMs) / 1000));

    if (diffSec < 60) {
      return diffSec === 1 ? "1sec" : `${diffSec}secs`;
    }
    if (diffSec < 3600) {
      const mins = Math.floor(diffSec / 60);
      return mins === 1 ? "1min" : `${mins}mins`;
    }
    if (diffSec <= 86400) {
      const hrs = Math.floor(diffSec / 3600);
      return hrs === 1 ? "1hr" : `${hrs}hrs`;
    }
    return created.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(created.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    });
  } catch {
    return "1sec";
  }
};
