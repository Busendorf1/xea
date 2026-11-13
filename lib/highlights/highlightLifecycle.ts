/**
 * Shared Highlight expiry, bid-ranking, and display formatting helpers
 * used across `/api/highlights`, server SSR preloading, and Web/Mobile highlight feeds.
 */

export interface HighlightLike {
  id?: string;
  title?: string | null;
  content?: string | null;
  image_url?: string | null;
  interest?: string | string[] | null;
  created_at?: string | null;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  expires_at?: string | null;
  campaign_days?: number | null;
  is_paused?: boolean | null;
  is_bidded?: boolean | null;
  is_boosted?: boolean | null;
  is_highest_bidder?: boolean | null;
  bid_price?: number | string | null;
  admin_statement?: string | null;
  user_render_count?: number | null;
  [key: string]: unknown;
}

export function isHighlightCurrentlyActive(hl: HighlightLike | null | undefined, nowMs: number = Date.now()): boolean {
  if (!hl || hl.is_paused) return false;

  const stmt = typeof hl.admin_statement === "string" ? hl.admin_statement.trim().toUpperCase() : "";
  if (stmt.startsWith("REJECTED:") || stmt.startsWith("BLOCKED:")) return false;

  const createdMs = hl.created_at ? new Date(hl.created_at).getTime() : NaN;
  const scheduledMs = hl.scheduled_start_at ? new Date(hl.scheduled_start_at).getTime() : NaN;
  if (!Number.isNaN(scheduledMs) && scheduledMs > nowMs) {
    return false;
  }

  const startMs =
    !Number.isNaN(scheduledMs) && scheduledMs > 0
      ? !Number.isNaN(createdMs)
        ? Math.max(createdMs, scheduledMs)
        : scheduledMs
      : createdMs;

  const explicitEndRaw = hl.expires_at || hl.scheduled_end_at;
  const explicitEndMs = explicitEndRaw ? new Date(explicitEndRaw).getTime() : NaN;

  if (!Number.isNaN(explicitEndMs)) {
    if (Number.isNaN(startMs) || explicitEndMs > startMs) {
      return nowMs <= explicitEndMs;
    }
  }

  if (!Number.isNaN(startMs)) {
    const days = Math.max(1, Math.min(90, Number(hl.campaign_days || 1)));
    const endMs = startMs + days * 24 * 60 * 60 * 1000;
    return nowMs <= endMs;
  }

  return true;
}

export function sortHighlightsByBidAndRecency(a: HighlightLike, b: HighlightLike): number {
  const aBid = Number(a?.bid_price || 0);
  const bBid = Number(b?.bid_price || 0);
  const aIsBidded = Boolean(a?.is_bidded || aBid > 0);
  const bIsBidded = Boolean(b?.is_bidded || bBid > 0);

  if (aIsBidded && !bIsBidded) return -1;
  if (!aIsBidded && bIsBidded) return 1;

  if (aIsBidded && bIsBidded) {
    if (a?.is_highest_bidder && !b?.is_highest_bidder) return -1;
    if (!a?.is_highest_bidder && b?.is_highest_bidder) return 1;
    if (bBid !== aBid) return bBid - aBid;
  }

  const aCreated = a?.created_at ? new Date(a.created_at).getTime() : 0;
  const bCreated = b?.created_at ? new Date(b.created_at).getTime() : 0;
  return (Number.isNaN(bCreated) ? 0 : bCreated) - (Number.isNaN(aCreated) ? 0 : aCreated);
}

export function formatHighlightInterests(rawInterest: unknown): string {
  if (!rawInterest) return "General";
  if (Array.isArray(rawInterest)) {
    const cleaned = rawInterest.map((v) => String(v || "").trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned.join(", ") : "General";
  }
  const str = String(rawInterest).trim();
  if (!str) return "General";
  if (str.startsWith("[") && str.endsWith("]")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.map((v) => String(v || "").trim()).filter(Boolean);
        return cleaned.length > 0 ? cleaned.join(", ") : "General";
      }
    } catch {}
  }
  return str;
}
