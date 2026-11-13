export interface ViewerTargetingProfile {
  email?: string;
  gender?: string | null;
  dob?: string | null;
  age?: number | null;
  country?: string | null;
  state?: string | null;
  location?: string | null;
  interest?: string[] | string | null;
  industry?: string[] | string | null;
  behavior?: string[] | string | null;
  lifestyle?: string[] | string | null;
  personality?: string[] | string | null;
  employment?: string | null;
}

export interface CampaignCandidate {
  id: string;
  user_email?: string;
  ad_type?: string;
  gender?: string | null;
  age?: string | null;
  age_range?: string | null;
  country?: string | null;
  state?: string | null;
  location?: string | null;
  province?: string | null;
  interest?: string[] | string | null;
  industry?: string[] | string | null;
  behavior?: string[] | string | null;
  lifestyle?: string[] | string | null;
  personality?: string[] | string | null;
  employment?: string | null;
  employment_status?: string | null;
  frequency_cap?: number | null;
  user_frequency_cap?: number | null;
  broadening_level?: number | null;
  created_at?: string | null;
  approved_at?: string | null;
  is_admin_post?: boolean | null;
  is_rollover?: boolean | null;
  broadening_stage?: number | null;
  bid_price?: number | null;
  is_bidded?: boolean | null;
  cost_per_impression?: number | null;
  impressions?: number | null;
  impression_count?: number | null;
  seen_count?: number | null;
  admin_statement?: string | null;
  status?: string | null;
  campaign_days?: number | null;
  expires_at?: string | null;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  [key: string]: unknown;
}

export function normalizeLocationToken(val: unknown): string {
  return String(val || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeGender(val: unknown): string {
  const g = String(val || "").toLowerCase().trim();
  if (!g || g === "all" || g === "any" || g === "both") return "all";
  if (g === "m" || g === "male" || g === "man") return "male";
  if (g === "f" || g === "female" || g === "woman") return "female";
  return g;
}

export function normalizeStringList(val: unknown): string[] {
  if (!val) return [];
  const raw = Array.isArray(val) ? val : String(val).split(",");
  return raw
    .map((item) => String(item || "").toLowerCase().trim())
    .filter((item) => item && item !== "all" && item !== "any" && item !== "none");
}

export function computeAgeFromDob(dob?: string | null, explicitAge?: number | null): number | null {
  if (typeof explicitAge === "number" && Number.isFinite(explicitAge) && explicitAge > 0) {
    return explicitAge;
  }
  if (!dob) return null;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - parsed.getUTCFullYear();
  const mDiff = now.getUTCMonth() - parsed.getUTCMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getUTCDate() < parsed.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 && age <= 120 ? age : null;
}

export function matchesAgeRange(targetAge: unknown, viewerAge: number | null): boolean {
  const raw = String(targetAge || "").trim().toLowerCase();
  if (!raw || raw === "all" || raw === "any") return true;
  if (viewerAge === null) return false;

  const plusMatch = raw.match(/^(\d{1,3})\s*\+$/);
  if (plusMatch) {
    return viewerAge >= Number(plusMatch[1]);
  }

  const rangeMatch = raw.match(/^(\d{1,3})\s*[-–to]+\s*(\d{1,3})$/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    return viewerAge >= min && viewerAge <= max;
  }

  const singleNum = Number(raw);
  if (Number.isFinite(singleNum) && singleNum > 0) {
    return viewerAge === singleNum;
  }

  return true;
}

/**
 * Computes progressive broadening level (0 = strict, 1 = 80%+ duration & <80% delivery,
 * 2 = Rollover Mode: duration ended with remaining paid impressions) aligned with web/SQL.
 */
export function computeCampaignBroadeningLevel(ad: CampaignCandidate): number {
  const explicit = Number(ad.broadening_level ?? ad.broadening_stage ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(3, Math.floor(explicit));
  }

  const isUnpaidPlatform = Boolean(
    ad.is_admin_post ||
      (ad.cost_per_impression !== undefined && Number(ad.cost_per_impression) <= 0) ||
      (ad.impressions !== undefined && Number(ad.impressions) <= 0)
  );
  if (isUnpaidPlatform) return 0;

  const schedStart = ad.scheduled_start_at ? new Date(ad.scheduled_start_at).getTime() : NaN;
  const approved = ad.approved_at ? new Date(ad.approved_at).getTime() : NaN;
  const created = ad.created_at ? new Date(ad.created_at).getTime() : NaN;
  const baseLaunch = !Number.isNaN(approved) && approved > 0 ? approved : created;
  if (!baseLaunch || Number.isNaN(baseLaunch)) return 0;

  const nowMs = Date.now();
  if (!Number.isNaN(schedStart) && schedStart > nowMs) return 0;
  const startMs = !Number.isNaN(schedStart) && schedStart > 0 ? Math.max(baseLaunch, schedStart) : baseLaunch;

  const days = Math.max(1, Math.min(365, Number(ad.campaign_days) || 1));
  const schedEnd = ad.scheduled_end_at ? new Date(ad.scheduled_end_at).getTime() : NaN;
  const endMs = !Number.isNaN(schedEnd) && schedEnd > startMs ? schedEnd : startMs + days * 86_400_000;

  const durationMs = Math.max(3_600_000, endMs - startMs);
  const durationRatio = Math.max(0, nowMs - startMs) / durationMs;

  const target = Math.max(1, Number(ad.impressions || 1000));
  const delivered = Math.max(0, Number(ad.impression_count ?? ad.seen_count ?? 0));
  const progress = delivered / target;

  if (durationRatio >= 1.0 && delivered < target) return 2;
  if (durationRatio >= 0.8 && progress < 0.8) return 1;
  return 0;
}

function overlaps(adVals: string[], viewerVals: string[]): boolean {
  if (adVals.length === 0) return true;
  if (viewerVals.length === 0) return false;
  const viewerSet = new Set(viewerVals);
  return adVals.some((v) => viewerSet.has(v));
}

export function evaluateAdTargeting(
  ad: CampaignCandidate,
  viewer: ViewerTargetingProfile | null,
): { eligible: boolean; relevanceScore: number } {
  if (!viewer) {
    // Unauthenticated/guest preview: only broadly targeted campaigns (no demographic/geo restrictions)
    const targetAgeVal = ad.age_range ?? ad.age;
    const hasGeoRestriction =
      (ad.country && normalizeLocationToken(ad.country) !== "all") ||
      (ad.state && normalizeLocationToken(ad.state) !== "all");
    const hasDemoRestriction =
      normalizeGender(ad.gender) !== "all" ||
      (targetAgeVal && String(targetAgeVal).toLowerCase() !== "all");
    return {
      eligible: !hasGeoRestriction && !hasDemoRestriction,
      relevanceScore: 1,
    };
  }

  const broadening = computeCampaignBroadeningLevel(ad);
  let relevanceScore = 0;

  // Country check (always enforced if specified)
  const targetCountry = normalizeLocationToken(ad.country);
  if (targetCountry && targetCountry !== "all" && targetCountry !== "any") {
    const viewerCountry = normalizeLocationToken(viewer.country);
    if (!viewerCountry || viewerCountry !== targetCountry) {
      return { eligible: false, relevanceScore: 0 };
    }
    relevanceScore += 10;
  }

  // State & city check (relaxed at broadening >= 2)
  if (broadening < 2) {
    const targetState = normalizeLocationToken(ad.state);
    if (targetState && targetState !== "all" && targetState !== "any") {
      const viewerState = normalizeLocationToken(viewer.state);
      if (!viewerState || viewerState !== targetState) {
        return { eligible: false, relevanceScore: 0 };
      }
      relevanceScore += 8;
    }

    const targetLoc = normalizeLocationToken(ad.province ?? ad.location);
    if (targetLoc && targetLoc !== "all" && targetLoc !== "any") {
      const viewerLoc = normalizeLocationToken(viewer.location);
      if (!viewerLoc || (!viewerLoc.includes(targetLoc) && !targetLoc.includes(viewerLoc))) {
        return { eligible: false, relevanceScore: 0 };
      }
      relevanceScore += 6;
    }
  }

  // Gender check
  const targetGender = normalizeGender(ad.gender);
  if (targetGender !== "all") {
    const viewerGender = normalizeGender(viewer.gender);
    if (!viewerGender || viewerGender !== targetGender) {
      return { eligible: false, relevanceScore: 0 };
    }
    relevanceScore += 6;
  }

  // Age check
  const viewerAge = computeAgeFromDob(viewer.dob, viewer.age);
  if (!matchesAgeRange(ad.age_range ?? ad.age, viewerAge)) {
    return { eligible: false, relevanceScore: 0 };
  }

  // Employment check (strict when broadening == 0)
  const targetEmp = normalizeLocationToken(ad.employment_status ?? ad.employment);
  if (broadening === 0 && targetEmp && targetEmp !== "all" && targetEmp !== "any") {
    const viewerEmp = normalizeLocationToken(viewer.employment);
    if (!viewerEmp || viewerEmp !== targetEmp) {
      return { eligible: false, relevanceScore: 0 };
    }
    relevanceScore += 4;
  }

  // Psychographic & interest categories (strict at broadening == 0, scored when broadening >= 1)
  const pairs: Array<[unknown, unknown, number]> = [
    [ad.interest, viewer.interest, 8],
    [ad.industry, viewer.industry, 6],
    [ad.behavior, viewer.behavior, 5],
    [ad.lifestyle, viewer.lifestyle, 4],
    [ad.personality, viewer.personality, 3],
  ];

  for (const [adRaw, viewerRaw, weight] of pairs) {
    const adArr = normalizeStringList(adRaw);
    if (adArr.length === 0) continue;
    const viewerArr = normalizeStringList(viewerRaw);
    const matched = overlaps(adArr, viewerArr);
    if (broadening === 0 && !matched) {
      return { eligible: false, relevanceScore: 0 };
    }
    if (matched) relevanceScore += weight;
  }

  return { eligible: true, relevanceScore };
}

/**
 * Ranks campaigns strictly by bid_price DESC (highest bidder wins top impression slots),
 * then relevanceScore DESC, then newest created_at DESC, while spacing consecutive
 * campaigns from the same advertiser where possible.
 */
export function rankAndSpaceAds<T extends CampaignCandidate>(ads: T[]): T[] {
  const sorted = [...ads].sort((a, b) => {
    const bidA = Number(a.bid_price ?? a.cost_per_impression ?? 0);
    const bidB = Number(b.bid_price ?? b.cost_per_impression ?? 0);
    if (bidB !== bidA) return bidB - bidA;

    const relA = Number((a as Record<string, unknown>)._relevanceScore ?? 0);
    const relB = Number((b as Record<string, unknown>)._relevanceScore ?? 0);
    if (relB !== relA) return relB - relA;

    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tB - tA;
  });

  // Space ads by same advertiser so consecutive feed cards aren't dominated by one advertiser
  const spaced: T[] = [];
  const queue = [...sorted];
  while (queue.length > 0) {
    const lastAdv = spaced.length > 0
      ? String(spaced[spaced.length - 1].user_email || "").toLowerCase().trim()
      : "";
    const idx = queue.findIndex(
      (item) => String(item.user_email || "").toLowerCase().trim() !== lastAdv,
    );
    if (idx >= 0) {
      spaced.push(queue.splice(idx, 1)[0]);
    } else {
      spaced.push(queue.shift()!);
    }
  }
  return spaced;
}
