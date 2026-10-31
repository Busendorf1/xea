export type Ad = {
  id: string;
  ad_media?: string | null;
  ad_media_url?: string | null;
  ad_media_type?: string | null;
  ad_content: string;
  action_phone?: string;
  action_whatsapp?: string;
  action_email?: string;
  action_website?: string;
  action_ios?: string;
  action_android?: string;
  action_watch_now?: string;
  ad_action_buttons?: string[];
  created_at: string | null;
  impression_count: number | null;
  impressions: number;
  campaign_days: number;
  completed_at: string | null;
  user_frequency_cap?: number;
  country?: string | null;
  state?: string | null;
  province?: string | null;
  gender?: string | null;
  age_range?: number[] | string[] | string | null;
  employment_status?: string[] | string | null;
  targeting_all?: boolean | null;
  admin_statement?: string | null;
  is_bidded?: boolean | null;
  display_mutual_button?: boolean | null;
  mutual_targets?: string[] | null;
  mutual_adds_count?: number | null;
  clicks_phone?: number | null;
  clicks_whatsapp?: number | null;
  clicks_website?: number | null;
  clicks_email?: number | null;
  clicks_product_cta?: number | null;
  clicks_ios?: number | null;
  clicks_android?: number | null;
  clicks_watch_now?: number | null;
  clicks_read_more?: number | null;
  daily_impression_count?: number | null;
  last_reset_date?: string | null;
  is_paused?: boolean;
  cost_per_impression?: number;
  total_cost?: number;
  status?: string | null;
  payment_status?: string | null;
  approved_at?: string | null;
  daily_budget?: number;
  is_admin_post?: boolean | null;
  industry?: string[] | string | null;
  interest?: string[] | string | null;
  lifestyle?: string[] | string | null;
  behavior?: string[] | string | null;
  personality?: string[] | string | null;
  ad_type?: string;
  user_email?: string | null;
  email?: string | null;
  is_ai_content?: boolean | null;
};

export interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

export function parseTargetingList(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed || trimmed === "[]" || trimmed === "null" || trimmed === "undefined") return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((s) => String(s).trim()).filter(Boolean);
        }
      } catch {}
    }
    return trimmed
      .split(/[,;]/)
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return [];
}

export function formatAgeRange(val: any): string {
  if (!val) return "18 - 65 yrs";
  if (Array.isArray(val) && val.length >= 2) {
    return `${val[0]} - ${val[1]} yrs`;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          return `${parsed[0]} - ${parsed[1]} yrs`;
        }
      } catch {}
    }
    return trimmed;
  }
  return "18 - 65 yrs";
}
