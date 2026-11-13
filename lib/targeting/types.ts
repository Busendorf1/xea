export interface ViewerTargetingProfile {
  email?: string | null;
  country?: string | null;
  state?: string | null;
  location?: string | null;
  gender?: string | null;
  dob?: string | Date | null;
  age?: number | null;
  employment?: string | string[] | null;
  employment_status?: string | string[] | null;
  interest?: string | string[] | null;
  industry?: string | string[] | null;
  behavior?: string | string[] | null;
  lifestyle?: string | string[] | null;
  personality?: string | string[] | null;
}

export interface TargetableAd {
  id: string;
  user_email?: string | null;
  email?: string | null;
  is_paused?: boolean | null;
  completed_at?: string | null;
  is_admin_post?: boolean | null;
  targeting_all?: boolean | null;
  impressions?: number | null;
  impression_count?: number | null;
  view_count?: number | null;
  user_frequency_cap?: number | null;
  campaign_days?: number | null;
  created_at?: string | null;
  approved_at?: string | null;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  country?: string | string[] | null;
  state?: string | string[] | null;
  province?: string | string[] | null;
  gender?: string | string[] | null;
  age_range?: string | number[] | string[] | null;
  employment_status?: string | string[] | null;
  interest?: string | string[] | null;
  industry?: string | string[] | null;
  behavior?: string | string[] | null;
  lifestyle?: string | string[] | null;
  personality?: string | string[] | null;
  mutual_targets?: string[] | null;
  ad_type?: string | null;
  cost_per_impression?: number | string | null;
  impression?: number | string | null;
  bid_price?: number | string | null;
  is_bidded?: boolean | null;
  is_boosted?: boolean | null;
  boosted_amount?: number | string | null;
  boosted_at?: string | null;
  [key: string]: any;
}

export type BroadeningStage = 0 | 1 | 2;

export interface CampaignBroadeningPlan {
  isScheduledFuture: boolean;
  startMs: number;
  endMs: number;
  durationMs: number;
  elapsedMs: number;
  durationRatio: number;
  impressionRatio: number;
  remainingRatio: number;
  broadeningStage: BroadeningStage;
  baseUserCap: number;
  effectiveUserCap: number;
  dailyUserCap: number;
  minSpacingMs: number;
  urgencyMultiplier: number;
}

export interface TargetingMatchResult {
  matches: boolean;
  isStrictMatch: boolean;
  relevanceScore: number;
  matchedDimensions: string[];
  reason?: string;
}
