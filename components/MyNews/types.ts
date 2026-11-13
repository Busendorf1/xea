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
  scheduled_end_at?: string | null;
  expires_at?: string | null;
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
  expiresAtLabel: string | null;
}

export function getHighlightScheduleInfo(item: HighlightItem, timeNow: number): HighlightScheduleInfo {
  const scheduledDays = Math.max(1, Math.min(90, Number(item.campaign_days || 1)));
  const fallbackTotalHours = scheduledDays * 24;

  const explicitEndStr = item.expires_at || item.scheduled_end_at;
  const explicitEndMs = explicitEndStr ? new Date(explicitEndStr).getTime() : NaN;

  if (!item.created_at) {
    return {
      scheduledDays,
      remainingDays: scheduledDays,
      totalHours: fallbackTotalHours,
      elapsedHours: 0,
      remainingHours: fallbackTotalHours,
      elapsedPercent: 0,
      isExpired: false,
      remainingText: `${scheduledDays} ${scheduledDays === 1 ? "day" : "days"} remaining`,
      expiresAtLabel: !isNaN(explicitEndMs)
        ? new Date(explicitEndMs).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        : null,
    };
  }

  const createdMs = new Date(item.created_at).getTime();
  const scheduledStartMs = item.scheduled_start_at ? new Date(item.scheduled_start_at).getTime() : NaN;
  const startMs = !isNaN(scheduledStartMs) && scheduledStartMs > 0 ? Math.max(createdMs, scheduledStartMs) : createdMs;

  if (isNaN(startMs)) {
    return {
      scheduledDays,
      remainingDays: scheduledDays,
      totalHours: fallbackTotalHours,
      elapsedHours: 0,
      remainingHours: fallbackTotalHours,
      elapsedPercent: 0,
      isExpired: false,
      remainingText: `${scheduledDays} ${scheduledDays === 1 ? "day" : "days"} remaining`,
      expiresAtLabel: null,
    };
  }

  const endMs =
    !isNaN(explicitEndMs) && explicitEndMs > startMs ? explicitEndMs : startMs + scheduledDays * 86_400_000;
  const totalHours = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60)));
  const derivedDays = Math.max(1, Math.min(90, Number(item.campaign_days) || Math.round(totalHours / 24)));

  const elapsedMs = Math.max(0, timeNow - startMs);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const remainingHours = Math.max(0, (endMs - timeNow) / (1000 * 60 * 60));
  const elapsedPercent = Math.min(100, Math.max(0, Math.round((elapsedHours / totalHours) * 100)));
  const isExpired = timeNow >= endMs;
  const remainingDays = isExpired ? 0 : Math.max(1, Math.ceil(remainingHours / 24));

  const expiresAtLabel = new Date(endMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  let remainingText = "Window ended";
  if (!isExpired) {
    remainingText = `${remainingDays} ${remainingDays === 1 ? "day" : "days"} remaining`;
  }

  return {
    scheduledDays: derivedDays,
    remainingDays,
    totalHours,
    elapsedHours,
    remainingHours,
    elapsedPercent,
    isExpired,
    remainingText,
    expiresAtLabel,
  };
}
