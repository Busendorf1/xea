import { getVerifiedUserEmail } from "../_shared/auth.ts";
import { jsonResponse } from "../_shared/cors.ts";
import {
  type CampaignCandidate,
  evaluateAdTargeting,
  rankAndSpaceAds,
  type ViewerTargetingProfile,
} from "../_shared/targeting.ts";

function isHighlightLive(hl: Record<string, unknown>, nowMs: number): boolean {
  if (hl.is_paused) return false;
  const adminStmt = String(hl.admin_statement || "").toUpperCase();
  if (adminStmt.startsWith("REJECTED:") || adminStmt.startsWith("BLOCKED:")) return false;

  if (hl.scheduled_start_at) {
    const startMs = new Date(String(hl.scheduled_start_at)).getTime();
    if (!Number.isNaN(startMs) && startMs > nowMs) return false;
  }

  const explicitEnd = hl.expires_at || hl.scheduled_end_at;
  if (explicitEnd) {
    const endMs = new Date(String(explicitEnd)).getTime();
    if (!Number.isNaN(endMs)) return endMs > nowMs;
  }

  const baseStart = hl.scheduled_start_at || hl.created_at;
  const days = Math.max(1, Math.min(90, Number(hl.campaign_days || 1)));
  if (baseStart) {
    const startMs = new Date(String(baseStart)).getTime();
    if (!Number.isNaN(startMs)) {
      return startMs + days * 86400 * 1000 > nowMs;
    }
  }
  return true;
}

export async function handleGetFeed(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const verifiedEmail = await getVerifiedUserEmail(req);
  const viewerEmail =
    verifiedEmail && verifiedEmail !== "service_role"
      ? verifiedEmail
      : String(body?.email || req.headers.get("x-user-email") || "")
          .toLowerCase()
          .trim();

  const limit = Math.max(1, Math.min(50, Number(body?.limit || 25)));

  const [
    adsRes,
    deactivatedRes,
    viewerRes,
    impressionsRes,
    blockedAdsRes,
    blockedAdvRes,
  ] = await Promise.all([
    supabase
      .from("addsactive")
      .select("*")
      .or("is_paused.is.null,is_paused.eq.false")
      .is("completed_at", null)
      .order("bid_price", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("deactivated_users").select("email"),
    viewerEmail
      ? supabase
          .from("users")
          .select(
            "email, gender, dob, country, state, location, interest, industry, behavior, lifestyle, personality, employment, ad_account_status",
          )
          .ilike("email", viewerEmail)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    viewerEmail
      ? supabase
          .from("ad_impressions")
          .select("ad_id, view_count")
          .ilike("user_email", viewerEmail)
      : Promise.resolve({ data: [] }),
    viewerEmail
      ? supabase
          .from("blocked_ads")
          .select("ad_id")
          .ilike("reporter_email", viewerEmail)
      : Promise.resolve({ data: [] }),
    viewerEmail
      ? supabase
          .from("blocked_advertisers")
          .select("advertiser_email")
          .ilike("reporter_email", viewerEmail)
      : Promise.resolve({ data: [] }),
  ]);

  const deactivatedSet = new Set<string>(
    (deactivatedRes.data || []).map((r: { email: string }) =>
      String(r.email || "").toLowerCase().trim(),
    ),
  );

  if (viewerEmail && (deactivatedSet.has(viewerEmail) || viewerRes.data?.ad_account_status === "deactivated")) {
    return jsonResponse({ ads: [], error: "Account is deactivated." }, 403);
  }

  const blockedAdIds = new Set<string>(
    (blockedAdsRes.data || []).map((r: { ad_id: string }) => String(r.ad_id)),
  );
  const blockedAdvertisers = new Set<string>(
    (blockedAdvRes.data || []).map((r: { advertiser_email: string }) =>
      String(r.advertiser_email || "").toLowerCase().trim(),
    ),
  );

  const viewCounts = new Map<string, number>();
  for (const imp of impressionsRes.data || []) {
    viewCounts.set(String(imp.ad_id), Number(imp.view_count || 0));
  }

  const viewerProfile: ViewerTargetingProfile | null = viewerRes.data || null;
  const eligibleAds: Array<CampaignCandidate & { _relevanceScore?: number }> = [];

  for (const ad of adsRes.data || []) {
    const adId = String(ad.id || "");
    const advEmail = String(ad.user_email || "").toLowerCase().trim();
    const adminStmt = String(ad.admin_statement || "").toUpperCase();

    if (!adId) continue;
    if (adminStmt.startsWith("REJECTED:") || adminStmt.startsWith("BLOCKED:")) continue;
    if (advEmail && deactivatedSet.has(advEmail)) continue;
    if (blockedAdIds.has(adId)) continue;
    if (advEmail && blockedAdvertisers.has(advEmail)) continue;

    // Exclude exhausted ads
    const targetImps = Number(ad.impressions || 0);
    const curImps = Number(ad.impression_count || 0);
    if (targetImps > 0 && curImps >= targetImps) continue;

    // Enforce frequency cap per viewer
    if (viewerEmail) {
      const freqCap = Math.max(1, Number(ad.user_frequency_cap ?? ad.frequency_cap ?? 1));
      const seenCount = viewCounts.get(adId) || 0;
      if (seenCount >= freqCap) continue;
    }

    const targeting = evaluateAdTargeting(ad, viewerProfile);
    if (!targeting.eligible) continue;

    eligibleAds.push({ ...ad, _relevanceScore: targeting.relevanceScore });
  }

  const ranked = rankAndSpaceAds(eligibleAds)
    .slice(0, limit)
    .map(({ _relevanceScore, ...rest }) => rest);

  return jsonResponse({
    ads: ranked,
    count: ranked.length,
  });
}

export async function handleGetHighlights(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const verifiedEmail = await getVerifiedUserEmail(req);
  const viewerEmail =
    verifiedEmail && verifiedEmail !== "service_role"
      ? verifiedEmail
      : String(body?.email || req.headers.get("x-user-email") || "")
          .toLowerCase()
          .trim();

  const [hlRes, deactivatedRes, blockedAdvRes] = await Promise.all([
    supabase
      .from("newsactive")
      .select("*")
      .or("is_paused.is.null,is_paused.eq.false")
      .order("bid_price", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("deactivated_users").select("email"),
    viewerEmail
      ? supabase
          .from("blocked_advertisers")
          .select("advertiser_email")
          .ilike("reporter_email", viewerEmail)
      : Promise.resolve({ data: [] }),
  ]);

  const deactivatedSet = new Set<string>(
    (deactivatedRes.data || []).map((r: { email: string }) =>
      String(r.email || "").toLowerCase().trim(),
    ),
  );
  const blockedAdvertisers = new Set<string>(
    (blockedAdvRes.data || []).map((r: { advertiser_email: string }) =>
      String(r.advertiser_email || "").toLowerCase().trim(),
    ),
  );

  const nowMs = Date.now();
  const liveHighlights = (hlRes.data || [])
    .filter((hl: Record<string, unknown>) => {
      const owner = String(hl.user_email || "").toLowerCase().trim();
      if (owner && (deactivatedSet.has(owner) || blockedAdvertisers.has(owner))) {
        return false;
      }
      return isHighlightLive(hl, nowMs);
    })
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const aBid = Number(a.bid_price || 0);
      const bBid = Number(b.bid_price || 0);
      const aIsBidded = Boolean(a.is_bidded || aBid > 0);
      const bIsBidded = Boolean(b.is_bidded || bBid > 0);
      if (aIsBidded && !bIsBidded) return -1;
      if (!aIsBidded && bIsBidded) return 1;
      if (aIsBidded && bIsBidded && bBid !== aBid) return bBid - aBid;
      return (
        new Date(String(b.created_at || 0)).getTime() -
        new Date(String(a.created_at || 0)).getTime()
      );
    });

  return jsonResponse({
    highlights: liveHighlights,
    count: liveHighlights.length,
  });
}
