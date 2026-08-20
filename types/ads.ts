export interface Ad {
  id: string;
  user_email: string;
  ad_content: string;
  ad_media: string | null;
  hls_url?: string | null;
  ad_type?: string;

  // CTAs & Product details
  product_name?: string | null;
  product_price?: number | null;
  product_cta_type?: string | null;
  product_cta_link?: string | null;
  action_phone?: string | null;
  action_whatsapp?: string | null;
  action_email?: string | null;
  action_website?: string | null;
  action_ios?: string | null;
  action_android?: string | null;
  action_watch_now?: string | null;
  ad_action_buttons?: string[];

  // Mutuals & Bidding
  display_mutual_button?: boolean | null;
  mutual_targets?: string[] | null;
  mutual_adds_count?: number | null;
  cost_per_impression?: number | null;

  // Frequency & Pacing
  user_frequency_cap?: number;
  daily_impression_cap?: number;
  daily_impression_count?: number;
  campaign_days?: number;
  impressions?: number;
  completed_at?: string | null;

  // Targeting fields
  interest?: string[] | string | null;
  industry?: string[] | string | null;
  behavior?: string[] | string | null;
  lifestyle?: string[] | string | null;
  personality?: string[] | string | null;
  country?: string | null;
  state?: string | null;
  gender?: string | null;
  employment_status?: string | null;
  age_range?: string[] | string | null;
  province?: string | null;
  targeting_all?: boolean;

  // Verification & Timestamps
  verification_token?: string;
  served_at?: number;
  created_at?: string | null;
  is_highlight?: boolean;
  title?: string;
}

export interface AdvertiserProfile {
  email?: string;
  business_name?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  profileImage?: string;
  bio?: string;
  location?: string;
  country?: string;
  created_at?: string;
  monetized?: boolean;
}

export interface ViewerProfile {
  balance: number;
  mutual_count: number;
  mutuals: string[];
  monetized: boolean;
  suspended_until?: string | null;
}

export type InteractionType = "seen" | "earn" | "mutual" | "action-click";

export interface FeedInteractionJob {
  adId: string;
  email: string;
  type: InteractionType;
  clickType?: string;
  servedAt?: number;
}

export interface FeedApiResponse {
  ads: Ad[];
  profiles: Record<string, AdvertiserProfile>;
  error?: string;
}
