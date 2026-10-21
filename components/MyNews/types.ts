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
  totalHours: number;
  elapsedHours: number;
  remainingHours: number;
  elapsedPercent: number;
  isExpired: boolean;
  remainingText: string;
}

export function getHighlightScheduleInfo(item: HighlightItem, timeNow: number): HighlightScheduleInfo {
  const isBidded = !!item.is_bidded || Number(item.bid_price || 0) > 1000;
  const scheduledDays = isBidded
    ? Math.max(1, Number(item.campaign_days || 1))
    : Math.max(1, Number(item.campaign_days || 1));
  const totalHours = isBidded ? scheduledDays * 24 : 24;

  if (!item.created_at) {
    return {
      scheduledDays,
      totalHours,
      elapsedHours: 0,
      remainingHours: totalHours,
      elapsedPercent: 0,
      isExpired: false,
      remainingText: `${scheduledDays}d window`,
    };
  }

  const createdMs = new Date(item.created_at).getTime();
  if (isNaN(createdMs)) {
    return {
      scheduledDays,
      totalHours,
      elapsedHours: 0,
      remainingHours: totalHours,
      elapsedPercent: 0,
      isExpired: false,
      remainingText: `${scheduledDays}d window`,
    };
  }

  const elapsedMs = Math.max(0, timeNow - createdMs);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const remainingHours = Math.max(0, totalHours - elapsedHours);
  const elapsedPercent = Math.min(100, Math.max(0, Math.round((elapsedHours / totalHours) * 100)));
  const isExpired = elapsedHours >= totalHours;

  let remainingText = "Window ended";
  if (!isExpired) {
    const wholeHours = Math.floor(remainingHours);
    const mins = Math.floor((remainingHours - wholeHours) * 60);
    if (wholeHours >= 24) {
      const days = Math.floor(wholeHours / 24);
      const remHrs = wholeHours % 24;
      remainingText = `${days}d ${remHrs}h left`;
    } else if (wholeHours > 0) {
      remainingText = `${wholeHours}h ${mins}m left`;
    } else {
      remainingText = `${Math.max(1, mins)}m left`;
    }
  }

  return {
    scheduledDays,
    totalHours,
    elapsedHours,
    remainingHours,
    elapsedPercent,
    isExpired,
    remainingText,
  };
}
