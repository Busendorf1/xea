import { checkAccountBlockedEdge, getVerifiedUserEmail } from "../_shared/auth.ts";
import { jsonResponse } from "../_shared/cors.ts";

async function signEarnTokenEdge(
  adId: string,
  viewerEmail: string,
  servedAt: number
): Promise<string | null> {
  const secret =
    Deno.env.get("EARN_TOKEN_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";
  if (!secret || !viewerEmail || !adId) return null;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      enc.encode(`${adId}:${viewerEmail.toLowerCase().trim()}:${servedAt}`)
    );
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
import {
  type CampaignCandidate,
  computeCampaignBroadeningPlanEdge,
  evaluateAdTargeting,
  interleaveBiddedAndStandardAds,
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
  const offset = Math.max(0, Number(body?.offset || 0));

  // Fetch viewer profile + viewer safety lists first (no full-table deactivated_users scan!)
  const [viewerRes, viewerDeactRes, blockedAdsRes, blockedAdvRes] = await Promise.all([
    viewerEmail
      ? supabase
          .from("users")
          .select(
            "email, gender, dob, country, state, location, interest, industry, behavior, lifestyle, personality, employment, employment_status, ad_account_status",
          )
          .ilike("email", viewerEmail)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    viewerEmail
      ? supabase
          .from("deactivated_users")
          .select("email")
          .eq("email", viewerEmail)
          .maybeSingle()
      : Promise.resolve({ data: null }),
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

  if (
    viewerEmail &&
    (viewerDeactRes.data || viewerRes.data?.ad_account_status === "deactivated")
  ) {
    return jsonResponse({ ads: [], error: "Account is deactivated." }, 403);
  }

  if (viewerEmail) {
    const blockInfo = await checkAccountBlockedEdge(supabase, viewerEmail);
    if (blockInfo.blocked) {
      return jsonResponse(
        {
          code: "ACCOUNT_BLOCKED",
          blocked: true,
          blockType: blockInfo.blockType || "permanent",
          blockedUntil: blockInfo.blockedUntil ?? null,
          reason: blockInfo.reason ?? null,
          ads: [],
          error:
            blockInfo.message ||
            "Your account is currently blocked from accessing Paayh.",
        },
        403
      );
    }
  }

  const viewerProfile: ViewerTargetingProfile | null = viewerRes.data || null;
  const viewerCountry = String(viewerProfile?.country || "").trim();
  const hasViewerCountry =
    viewerCountry.length > 0 && viewerCountry.toUpperCase() !== "PLACEHOLDER";

  const buildPoolQuery = (sliceMode: "main" | "standard" | "rollover") => {
    let q = supabase
      .from("addsactive")
      .select("*")
      .is("completed_at", null)
      .or("is_paused.is.null,is_paused.eq.false");

    if (sliceMode === "rollover") {
      q = q.eq("is_rollover", true);
    } else if (sliceMode === "standard") {
      q = q.or("is_bidded.is.null,is_bidded.eq.false");
    }

    if (hasViewerCountry) {
      const safeCountry = viewerCountry.replace(/[,()]/g, "");
      q = q.or(
        `targeting_all.eq.true,is_admin_post.eq.true,country.is.null,country.eq.,country.ilike.%${safeCountry}%,country.ilike.%all%`,
      );
    }

    const sliceLimit = sliceMode === "rollover" ? 60 : sliceMode === "standard" ? 65 : 250;
    return q
      .order("bid_price", { ascending: false, nullsFirst: false })
      .order("cost_per_impression", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(sliceLimit);
  };

  const [mainAdsRes, standardAdsRes, rolloverAdsRes] = await Promise.all([
    buildPoolQuery("main"),
    Promise.resolve(buildPoolQuery("standard")).catch(() => ({ data: [], error: null })),
    Promise.resolve(buildPoolQuery("rollover")).catch(() => ({ data: [], error: null })),
  ]);

  const mergedById = new Map<string, CampaignCandidate>();
  for (const ad of mainAdsRes.data || []) {
    if (ad?.id) mergedById.set(String(ad.id), ad as CampaignCandidate);
  }
  if (!standardAdsRes.error) {
    for (const ad of standardAdsRes.data || []) {
      if (ad?.id && !mergedById.has(String(ad.id))) {
        mergedById.set(String(ad.id), ad as CampaignCandidate);
      }
    }
  }
  if (!rolloverAdsRes.error) {
    for (const ad of rolloverAdsRes.data || []) {
      if (ad?.id && !mergedById.has(String(ad.id))) {
        mergedById.set(String(ad.id), ad as CampaignCandidate);
      }
    }
  }

  const poolAds = Array.from(mergedById.values());
  if (poolAds.length === 0) {
    return jsonResponse({ ads: [], count: 0 });
  }

  const candidateAdIds = poolAds.map((a) => String(a.id));
  const candidateOwners = Array.from(
    new Set(
      poolAds
        .map((a) => String(a.user_email || a.email || "").toLowerCase().trim())
        .filter(Boolean),
    ),
  );

  // Bounded O(K) lookups for deactivated owners and candidate impressions (500M+ safe)
  const [deactOwnersRes, impressionsRes] = await Promise.all([
    candidateOwners.length > 0
      ? supabase
          .from("deactivated_users")
          .select("email")
          .in("email", candidateOwners.slice(0, 200))
      : Promise.resolve({ data: [] }),
    viewerEmail && candidateAdIds.length > 0
      ? supabase
          .from("ad_impressions")
          .select("ad_id, view_count, today_view_count, last_viewed_at")
          .eq("user_email", viewerEmail)
          .in("ad_id", candidateAdIds.slice(0, 350))
      : Promise.resolve({ data: [] }),
  ]);

  const deactivatedSet = new Set<string>(
    (deactOwnersRes.data || []).map((r: { email: string }) =>
      String(r.email || "").toLowerCase().trim(),
    ),
  );
  const blockedAdIds = new Set<string>(
    (blockedAdsRes.data || []).map((r: { ad_id: string }) => String(r.ad_id)),
  );
  const blockedAdvertisers = new Set<string>(
    (blockedAdvRes.data || []).map((r: { advertiser_email: string }) =>
      String(r.advertiser_email || "").toLowerCase().trim(),
    ),
  );

  const impressionMap = new Map<
    string,
    { viewCount: number; todayViewCount: number; lastViewedMs: number | null }
  >();
  const nowMs = Date.now();
  const todayDate = new Date(nowMs).toISOString().slice(0, 10);

  for (const imp of impressionsRes.data || []) {
    const lastMs = imp.last_viewed_at ? new Date(String(imp.last_viewed_at)).getTime() : NaN;
    const isToday =
      Boolean(imp.last_viewed_at) && String(imp.last_viewed_at).slice(0, 10) === todayDate;
    impressionMap.set(String(imp.ad_id), {
      viewCount: Number(imp.view_count || 0),
      todayViewCount: isToday ? Number(imp.today_view_count || 0) : 0,
      lastViewedMs: Number.isFinite(lastMs) ? lastMs : null,
    });
  }

  const strictFresh: Array<CampaignCandidate & { _relevanceScore?: number }> = [];
  const strictRetargeted: Array<CampaignCandidate & { _relevanceScore?: number }> = [];
  const relaxedGeoDemoFresh: Array<CampaignCandidate & { _relevanceScore?: number }> = [];
  const relaxedGeoDemoRetargeted: Array<CampaignCandidate & { _relevanceScore?: number }> = [];

  for (const ad of poolAds) {
    const adId = String(ad.id || "");
    const advEmail = String(ad.user_email || ad.email || "").toLowerCase().trim();
    const adminStmt = String(ad.admin_statement || "").toUpperCase();

    if (!adId || ad.is_paused === true || ad.completed_at) continue;
    if (adminStmt.startsWith("REJECTED:") || adminStmt.startsWith("BLOCKED:")) continue;
    if (!ad.is_admin_post && viewerEmail && advEmail === viewerEmail) continue;
    if (advEmail && deactivatedSet.has(advEmail)) continue;
    if (blockedAdIds.has(adId)) continue;
    if (advEmail && blockedAdvertisers.has(advEmail)) continue;

    // Total campaign impression limit
    const targetImps = Number(ad.impressions || 0);
    const curImps = Number(ad.impression_count || 0);
    if (!ad.is_admin_post && targetImps > 0 && curImps >= targetImps) continue;

    // Daily impression cap + UTC day reset + Rollover balance
    const dailyCap = Number(ad.daily_impression_cap || 0);
    if (dailyCap > 0 && String(ad.last_reset_date || "") === todayDate) {
      const effectiveDailyCap = dailyCap + Math.max(0, Number(ad.rollover_balance || 0));
      if (Number(ad.daily_impression_count || 0) >= effectiveDailyCap) continue;
    }

    const plan = computeCampaignBroadeningPlanEdge(ad, nowMs);
    if (plan.isScheduledFuture || plan.isExpiredPlatformPost) continue;

    const impInfo = impressionMap.get(adId);
    const seenCount = impInfo?.viewCount || 0;
    const todayViews = impInfo?.todayViewCount || 0;

    if (viewerEmail && !ad.is_admin_post) {
      if (seenCount >= plan.effectiveUserCap) continue;
      if (seenCount > 0) {
        if (todayViews >= plan.dailyUserCap) continue;
        if (impInfo?.lastViewedMs !== null && impInfo?.lastViewedMs !== undefined) {
          if (nowMs - impInfo.lastViewedMs < plan.minSpacingMs) continue;
        }
      }
    }

    const strictCheck = evaluateAdTargeting(ad, viewerProfile, {
      allowRolloverPsychographics: plan.broadeningStage >= 1,
      broadeningStage: plan.broadeningStage,
    });
    const urgencyBoost = (plan.urgencyMultiplier - 1) * 20;

    if (strictCheck.eligible) {
      const enriched = {
        ...ad,
        _relevanceScore: strictCheck.relevanceScore + urgencyBoost,
      };
      if (seenCount > 0) strictRetargeted.push(enriched);
      else strictFresh.push(enriched);
      continue;
    }

    // Geo + Demo fallback when strict psychographic inventory is scarce
    const relaxedCheck = evaluateAdTargeting(ad, viewerProfile, {
      allowRolloverPsychographics: true,
      broadeningStage: plan.broadeningStage,
    });
    if (relaxedCheck.eligible) {
      const enriched = {
        ...ad,
        _relevanceScore: relaxedCheck.relevanceScore + urgencyBoost,
      };
      if (seenCount > 0) relaxedGeoDemoRetargeted.push(enriched);
      else relaxedGeoDemoFresh.push(enriched);
    }
  }

  const freshPool =
    strictFresh.length < 15
      ? [...strictFresh, ...relaxedGeoDemoFresh]
      : strictFresh;
  const retargetPool =
    strictFresh.length + strictRetargeted.length < 15
      ? [...strictRetargeted, ...relaxedGeoDemoRetargeted]
      : strictRetargeted;

  const spacedFresh = interleaveBiddedAndStandardAds(rankAndSpaceAds(freshPool));
  const spacedRetargeted = interleaveBiddedAndStandardAds(rankAndSpaceAds(retargetPool));

  // Interleave 3 fresh : 1 retargeted, and drain remaining retargets once fresh exhausts
  const combined: Array<CampaignCandidate & { _relevanceScore?: number }> = [];
  let fIdx = 0;
  let rIdx = 0;
  let itemsSinceRetarget = 3;
  while (fIdx < spacedFresh.length || rIdx < spacedRetargeted.length) {
    let added = 0;
    while (added < 3 && fIdx < spacedFresh.length) {
      combined.push(spacedFresh[fIdx++]);
      itemsSinceRetarget++;
      added++;
    }
    if (rIdx < spacedRetargeted.length) {
      if (itemsSinceRetarget >= 3 || fIdx >= spacedFresh.length) {
        combined.push(spacedRetargeted[rIdx++]);
        itemsSinceRetarget = 0;
      }
    }
  }

  const servedAt = Date.now();
  const sliced = combined
    .slice(offset, offset + limit)
    .map(({ _relevanceScore, ...rest }) => rest);

  const ranked = viewerEmail
    ? await Promise.all(
        sliced.map(async (ad) => {
          const earnToken = await signEarnTokenEdge(String(ad.id || ""), viewerEmail, servedAt);
          return earnToken ? { ...ad, earnToken, servedAt } : { ...ad, servedAt };
        })
      )
    : sliced;

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

  const [hlRes, blockedAdvRes] = await Promise.all([
    supabase
      .from("newsactive")
      .select("*")
      .or("is_paused.is.null,is_paused.eq.false")
      .order("bid_price", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100),
    viewerEmail
      ? supabase
          .from("blocked_advertisers")
          .select("advertiser_email")
          .ilike("reporter_email", viewerEmail)
      : Promise.resolve({ data: [] }),
  ]);

  const rawHighlights = hlRes.data || [];
  const ownerEmails = Array.from(
    new Set(
      rawHighlights
        .map((h: Record<string, unknown>) => String(h.user_email || "").toLowerCase().trim())
        .filter(Boolean),
    ),
  );
  const deactOwnersRes =
    ownerEmails.length > 0
      ? await supabase
          .from("deactivated_users")
          .select("email")
          .in("email", ownerEmails.slice(0, 100))
      : { data: [] };

  const deactivatedSet = new Set<string>(
    (deactOwnersRes.data || []).map((r: { email: string }) =>
      String(r.email || "").toLowerCase().trim(),
    ),
  );
  const blockedAdvertisers = new Set<string>(
    (blockedAdvRes.data || []).map((r: { advertiser_email: string }) =>
      String(r.advertiser_email || "").toLowerCase().trim(),
    ),
  );

  const nowMs = Date.now();
  const liveHighlights = rawHighlights
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
