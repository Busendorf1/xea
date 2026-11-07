export type HighlightItem = {
  id: string;
  image_url: string;
  title: string;
  interest: string;
  content: string;
  country?: string | null;
  state?: string | null;
  province?: string | null;
  created_at: string | null;
  is_paused?: boolean | null;
  admin_statement?: string | null;
  is_bidded?: boolean | null;
  bid_price?: number | null;
  campaign_days?: number | null;
  scheduled_start_at?: string | null;
  is_ai_content?: boolean | null;
  is_admin_post?: boolean | null;
  impression_count?: number | null;
  user_email?: string | null;
  email?: string | null;
};

export interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

export interface HighlightScheduleInfo {
  scheduledDays: number;
  remainingDays: number;
  totalHours: number;
  elapsedHours: number;
  remainingHours: number;
  elapsedPercent: number;
  isExpired: boolean;
  remainingText: string;
}

export function getHighlightScheduleInfo(item: HighlightItem, timeNow: number): HighlightScheduleInfo {
  const scheduledDays = Math.max(1, Number(item.campaign_days || 1));
  const totalHours = scheduledDays * 24;

  if (!item.created_at) {
    return {
      scheduledDays,
      remainingDays: scheduledDays,
      totalHours,
      elapsedHours: 0,
      remainingHours: totalHours,
      elapsedPercent: 0,
      isExpired: false,
      remainingText: `${scheduledDays} ${scheduledDays === 1 ? "day" : "days"} remaining`,
    };
  }

  const createdMs = new Date(item.created_at).getTime();
  const scheduledStartMs = item.scheduled_start_at ? new Date(item.scheduled_start_at).getTime() : NaN;
  const startMs = !isNaN(scheduledStartMs) && scheduledStartMs > 0 ? Math.max(createdMs, scheduledStartMs) : createdMs;
  if (isNaN(startMs)) {
    return {
      scheduledDays,
      remainingDays: scheduledDays,
      totalHours,
      elapsedHours: 0,
      remainingHours: totalHours,
      elapsedPercent: 0,
      isExpired: false,
      remainingText: `${scheduledDays} ${scheduledDays === 1 ? "day" : "days"} remaining`,
    };
  }

  const elapsedMs = Math.max(0, timeNow - startMs);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const remainingHours = Math.max(0, totalHours - elapsedHours);
  const elapsedPercent = Math.min(100, Math.max(0, Math.round((elapsedHours / totalHours) * 100)));
  const isExpired = elapsedHours >= totalHours;
  const remainingDays = isExpired ? 0 : Math.max(1, Math.ceil(remainingHours / 24));

  let remainingText = "Window ended";
  if (!isExpired) {
    remainingText = `${remainingDays} ${remainingDays === 1 ? "day" : "days"} remaining`;
  }

  return {
    scheduledDays,
    remainingDays,
    totalHours,
    elapsedHours,
    remainingHours,
    elapsedPercent,
    isExpired,
    remainingText,
  };
}
