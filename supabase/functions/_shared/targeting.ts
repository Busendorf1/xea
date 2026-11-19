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
  employment_status?: string | null;
}

export interface CampaignCandidate {
  id: string;
  user_email?: string;
  email?: string;
  ad_type?: string;
  gender?: string | null;
  age?: string | number[] | null;
  age_range?: string | number[] | null;
  country?: string | string[] | null;
  state?: string | string[] | null;
  location?: string | null;
  province?: string | string[] | null;
  interest?: string[] | string | null;
  industry?: string[] | string | null;
  behavior?: string[] | string | null;
  lifestyle?: string[] | string | null;
  personality?: string[] | string | null;
  employment?: string | string[] | null;
  employment_status?: string | string[] | null;
  targeting_all?: boolean | null;
  frequency_cap?: number | null;
  user_frequency_cap?: number | null;
  broadening_level?: number | null;
  created_at?: string | null;
  approved_at?: string | null;
  is_admin_post?: boolean | null;
  is_rollover?: boolean | null;
  is_boosted?: boolean | null;
  rollover_balance?: number | null;
  daily_impression_cap?: number | null;
  daily_impression_count?: number | null;
  last_reset_date?: string | null;
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
  completed_at?: string | null;
  is_paused?: boolean | null;
  [key: string]: unknown;
}

export interface CampaignBroadeningPlanEdge {
  broadeningStage: number;
  isRolloverMode: boolean;
  isScheduledFuture: boolean;
  isExpiredPlatformPost: boolean;
  isUnpaidPlatform: boolean;
  baseUserCap: number;
  effectiveUserCap: number;
  dailyUserCap: number;
  minSpacingMs: number;
  urgencyMultiplier: number;
}

const WILDCARDS = new Set([
  "all",
  "any",
  "both",
  "global",
  "everyone",
  "worldwide",
  "none",
  "placeholder",
  "*",
]);

export function normalizeLocationToken(val: unknown): string {
  return String(val || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeStateToken(val: string): string {
  const lower = val.toLowerCase().trim();
  if (
    lower === "fct" ||
    lower === "abuja" ||
    lower.includes("abuja") ||
    lower.includes("federal capital") ||
    /\bfct\b/.test(lower)
  ) {
    return "fct";
  }
  return lower
    .replace(/\b(state|province|region|territory)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function normalizeGender(val: unknown): string {
  const g = String(val || "").toLowerCase().trim();
  if (!g || WILDCARDS.has(g)) return "all";
  if (g === "m" || g === "male" || g === "man") return "male";
  if (g === "f" || g === "female" || g === "woman") return "female";
  return g;
}

export function normalizeStringList(val: unknown): string[] {
  if (!val) return [];
  let items: unknown[] = [];
  if (Array.isArray(val)) {
    items = val;
  } else if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        items = Array.isArray(parsed) ? parsed : [trimmed];
      } catch {
        items = trimmed.split(",");
      }
    } else {
      items = trimmed.split(",");
    }
  } else {
    items = [String(val)];
  }
  return Array.from(
    new Set(
      items
        .map((item) => String(item || "").toLowerCase().trim())
        .filter((item) => item && !WILDCARDS.has(item)),
    ),
  );
}

export function computeAgeFromDob(dob?: string | null, explicitAge?: number | null): number | null {
  if (typeof explicitAge === "number" && Number.isFinite(explicitAge) && explicitAge > 0) {
    return explicitAge;
  }
  if (!dob) return null;
  const dobStr = String(dob).trim();
  if (!dobStr || dobStr === "1970-01-01" || dobStr === "PLACEHOLDER") return null;
  const parsed = new Date(dobStr);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - parsed.getUTCFullYear();
  const mDiff = now.getUTCMonth() - parsed.getUTCMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getUTCDate() < parsed.getUTCDate())) {
    age -= 1;
  }
  return age > 0 && age <= 120 ? age : null;
}

function isAgeTargetRestricted(targetAge: unknown): boolean {
  if (targetAge === null || targetAge === undefined) return false;
  if (Array.isArray(targetAge)) {
    if (targetAge.length >= 2) {
      const a = Number(targetAge[0]);
      const b = Number(targetAge[1]);
      if (Number.isFinite(a) && Number.isFinite(b) && (a > 0 || b > 0)) return true;
    }
    return targetAge.length > 0 && targetAge.some((v) => !WILDCARDS.has(String(v || "").toLowerCase().trim()));
  }
  const raw = String(targetAge || "").trim().toLowerCase();
  return Boolean(raw && !WILDCARDS.has(raw));
}

export function matchesAgeRange(targetAge: unknown, viewerAge: number | null): boolean {
  if (targetAge === null || targetAge === undefined) return true;
  if (viewerAge === null) return true;
  if (Array.isArray(targetAge)) {
    if (targetAge.length >= 2) {
      const a = Number(targetAge[0]);
      const b = Number(targetAge[1]);
      if (Number.isFinite(a) && Number.isFinite(b) && (a > 0 || b > 0)) {
        const min = Math.min(a, b);
        const max = Math.max(a, b);
        return viewerAge >= min && viewerAge <= max;
      }
    }
    if (targetAge.length === 0) return true;
  }

  const raw = String(targetAge || "").trim().toLowerCase();
  if (!raw || WILDCARDS.has(raw)) return true;

  const plusMatch = raw.match(/^(\d{1,3})\s*\+$/);
  if (plusMatch) {
    return viewerAge >= Number(plusMatch[1]);
  }

  const rangeMatch = raw.match(/^(\d{1,3})\s*[-–to,]+\s*(\d{1,3})$/);
  if (rangeMatch) {
    const min = Math.min(Number(rangeMatch[1]), Number(rangeMatch[2]));
    const max = Math.max(Number(rangeMatch[1]), Number(rangeMatch[2]));
    return viewerAge >= min && viewerAge <= max;
  }

  const singleNum = Number(raw);
  if (Number.isFinite(singleNum) && singleNum > 0) {
    return viewerAge === singleNum;
  }

  return true;
}

export function computeCampaignBroadeningPlanEdge(
  ad: CampaignCandidate,
  nowMs = Date.now(),
): CampaignBroadeningPlanEdge {
  const target = Math.max(0, Number(ad.impressions || 0));
  const delivered = Math.max(0, Number(ad.impression_count ?? ad.seen_count ?? 0));
  const cpi = Number(ad.cost_per_impression || 0);
  const isUnpaidAdmin = Boolean(ad.is_admin_post) && cpi <= 0;
  const baseUserCap = isUnpaidAdmin
    ? 10
    : Math.max(1, Math.min(5_000_000, Number(ad.user_frequency_cap ?? ad.frequency_cap ?? 1)));

  const isUnpaidPlatform = Boolean(
    isUnpaidAdmin ||
      (ad.cost_per_impression !== undefined && ad.cost_per_impression !== null && cpi <= 0) ||
      target <= 0,
  );

  const schedStart = ad.scheduled_start_at ? new Date(ad.scheduled_start_at).getTime() : NaN;
  const approved = ad.approved_at ? new Date(ad.approved_at).getTime() : NaN;
  const created = ad.created_at ? new Date(ad.created_at).getTime() : NaN;
  const baseLaunch = !Number.isNaN(approved) && approved > 0 ? approved : created;
  const isScheduledFuture = Boolean(!Number.isNaN(schedStart) && schedStart > nowMs);
  const startMs =
    !Number.isNaN(schedStart) && schedStart > 0 && !Number.isNaN(baseLaunch) && baseLaunch > 0
      ? Math.max(baseLaunch, schedStart)
      : !Number.isNaN(baseLaunch) && baseLaunch > 0
      ? baseLaunch
      : nowMs;

  const days = Math.max(1, Math.min(90, Number(ad.campaign_days) || 1));
  const schedEnd = ad.scheduled_end_at ? new Date(ad.scheduled_end_at).getTime() : NaN;
  const endMs =
    !Number.isNaN(schedEnd) && schedEnd > startMs
      ? schedEnd
      : startMs + days * 86_400_000;

  const durationMs = Math.max(3_600_000, endMs - startMs);
  const elapsedMs = isScheduledFuture ? 0 : Math.max(0, nowMs - startMs);
  const durationRatio = durationMs > 0 ? elapsedMs / durationMs : 0;
  const impressionRatio = isUnpaidPlatform || target <= 0 ? 1 : Math.min(1, delivered / target);
  const remainingRatio = isUnpaidPlatform ? 0 : Math.max(0, 1 - impressionRatio);

  const isExpiredPlatformPost = Boolean(isUnpaidPlatform && !isScheduledFuture && durationRatio >= 1.0);

  let broadeningStage = Math.max(0, Number(ad.broadening_stage ?? ad.broadening_level ?? 0));
  let capExpansion = 0;

  if (!isUnpaidPlatform && !isScheduledFuture && !ad.is_paused && !ad.completed_at && remainingRatio > 0) {
    if (durationRatio >= 1.0 || Boolean(ad.is_rollover) || broadeningStage >= 2) {
      broadeningStage = 2;
      if (impressionRatio < 0.5) capExpansion = 2;
      else if (impressionRatio < 0.85) capExpansion = 1;
    } else if ((durationRatio >= 0.8 && impressionRatio < 0.8) || broadeningStage === 1) {
      broadeningStage = 1;
      if (impressionRatio < 0.65) capExpansion = 1;
    }
  } else if (isUnpaidPlatform) {
    broadeningStage = 0;
    capExpansion = 0;
  }

  const isRolloverMode = Boolean(!isUnpaidPlatform && !isScheduledFuture && broadeningStage >= 2 && remainingRatio > 0);
  const effectiveUserCap = baseUserCap + capExpansion;
  const remainingDays = Math.max(1, Math.ceil((durationMs - Math.min(elapsedMs, durationMs * 0.95)) / 86_400_000));
  const baseDailyCap = Math.max(1, Math.ceil(baseUserCap / days));
  const dailyUserCap =
    broadeningStage >= 2
      ? Math.max(baseDailyCap + 1, Math.ceil(effectiveUserCap / Math.max(1, remainingDays)))
      : broadeningStage === 1
      ? Math.max(baseDailyCap, Math.ceil(effectiveUserCap / Math.max(1, remainingDays)))
      : baseDailyCap;

  let minSpacingMs: number;
  if (effectiveUserCap <= 1) {
    minSpacingMs = durationMs * 2;
  } else if (baseDailyCap > 12) {
    minSpacingMs = 0;
  } else if (broadeningStage >= 2) {
    minSpacingMs = Math.max(90 * 60_000, Math.min(4 * 3_600_000, Math.floor(durationMs / (effectiveUserCap * 2))));
  } else if (broadeningStage === 1) {
    minSpacingMs = Math.max(2 * 3_600_000, Math.min(6 * 3_600_000, Math.floor(durationMs / (effectiveUserCap * 2))));
  } else {
    minSpacingMs = Math.max(
      2 * 3_600_000,
      Math.min(12 * 3_600_000, Math.floor(durationMs / Math.max(2, effectiveUserCap * 2))),
    );
  }

  const deliveryLag = Math.max(0, Math.min(1.5, durationRatio) - impressionRatio);
  const boostFactor = ad.is_boosted || Number(ad.boosted_amount || 0) > 0 ? 1.25 : 1.0;
  const stageUrgency =
    broadeningStage >= 2 ? 1.45 : broadeningStage === 1 ? 1.22 : 1.0 + deliveryLag * 0.35;
  const urgencyMultiplier = Number((boostFactor * stageUrgency).toFixed(3));

  return {
    broadeningStage,
    isRolloverMode,
    isScheduledFuture,
    isExpiredPlatformPost,
    isUnpaidPlatform,
    baseUserCap,
    effectiveUserCap,
    dailyUserCap,
    minSpacingMs,
    urgencyMultiplier,
  };
}

export function computeCampaignBroadeningLevel(ad: CampaignCandidate): number {
  return computeCampaignBroadeningPlanEdge(ad).broadeningStage;
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
  options?: { allowRolloverPsychographics?: boolean; broadeningStage?: number },
): { eligible: boolean; relevanceScore: number } {
  if (!viewer) {
    const targetCountries = normalizeStringList(ad.country);
    const targetStates = [...normalizeStringList(ad.state), ...normalizeStringList(ad.province)];
    const targetGenders = normalizeStringList(ad.gender).map(normalizeGender).filter((g) => g !== "all");
    const targetAgeVal = ad.age_range ?? ad.age;
    const hasGeoRestriction = targetCountries.length > 0 || targetStates.length > 0;
    const hasDemoRestriction =
      targetGenders.length > 0 ||
      isAgeTargetRestricted(targetAgeVal);
    return {
      eligible: Boolean(ad.targeting_all || ad.is_admin_post || (!hasGeoRestriction && !hasDemoRestriction)),
      relevanceScore: 1,
    };
  }

  if (ad.targeting_all === true || ad.is_admin_post === true) {
    return { eligible: true, relevanceScore: 20 };
  }

  const plan = computeCampaignBroadeningPlanEdge(ad);
  const broadening = Math.max(plan.broadeningStage, Number(options?.broadeningStage ?? 0));
  const allowRelaxedPsych = Boolean(options?.allowRolloverPsychographics || broadening >= 1);
  let relevanceScore = 0;

  // 1. Country check (multi-country supported; always enforced if populated)
  const targetCountries = normalizeStringList(ad.country);
  if (targetCountries.length > 0) {
    const viewerCountry = normalizeLocationToken(viewer.country);
    if (!viewerCountry || !targetCountries.includes(viewerCountry)) {
      return { eligible: false, relevanceScore: 0 };
    }
    relevanceScore += 10;
  }

  // 2. State / Province check (relaxed at Stage >= 2 Rollover Mode)
  const targetStates = [
    ...normalizeStringList(ad.state),
    ...normalizeStringList(ad.province),
    ...normalizeStringList(ad.location),
  ]
    .map(normalizeStateToken)
    .filter(Boolean);

  if (broadening < 2 && targetStates.length > 0) {
    const viewerStateTokens = [
      viewer.state ? normalizeStateToken(String(viewer.state)) : "",
      viewer.location ? normalizeStateToken(String(viewer.location)) : "",
    ].filter(Boolean);
    if (viewerStateTokens.length > 0) {
      const stateMatched = targetStates.some((ts) =>
        viewerStateTokens.some((vs) => vs === ts || vs.includes(ts) || ts.includes(vs)),
      );
      if (!stateMatched) {
        return { eligible: false, relevanceScore: 0 };
      }
      relevanceScore += 8;
    }
  }

  // 3. Gender check (relaxed at Stage >= 2)
  const targetGenders = normalizeStringList(ad.gender)
    .map(normalizeGender)
    .filter((g) => g !== "all");
  if (broadening < 2 && targetGenders.length > 0) {
    const viewerGender = normalizeGender(viewer.gender);
    if (viewerGender !== "all" && !targetGenders.includes(viewerGender)) {
      return { eligible: false, relevanceScore: 0 };
    }
    relevanceScore += 6;
  }

  // 4. Age check (relaxed at Stage >= 2)
  if (broadening < 2) {
    const viewerAge = computeAgeFromDob(viewer.dob, viewer.age);
    if (!matchesAgeRange(ad.age_range ?? ad.age, viewerAge)) {
      return { eligible: false, relevanceScore: 0 };
    }
  }

  // 5. Employment check (relaxed at Stage >= 2)
  const targetEmps = normalizeStringList(ad.employment_status ?? ad.employment);
  if (broadening < 2 && targetEmps.length > 0) {
    const viewerEmp = normalizeLocationToken(viewer.employment_status ?? viewer.employment);
    if (viewerEmp && !targetEmps.includes(viewerEmp)) {
      return { eligible: false, relevanceScore: 0 };
    }
    relevanceScore += 4;
  }

  // 6. Psychographics: OR across any populated dimension (consistent with Web matchEvaluator.ts)
  const pairs: Array<[unknown, unknown, number]> = [
    [ad.interest, viewer.interest, 8],
    [ad.industry, viewer.industry, 6],
    [ad.behavior, viewer.behavior, 5],
    [ad.lifestyle, viewer.lifestyle, 4],
    [ad.personality, viewer.personality, 3],
  ];

  let populatedDimensions = 0;
  let matchedDimensions = 0;
  for (const [adRaw, viewerRaw, weight] of pairs) {
    const adArr = normalizeStringList(adRaw);
    if (adArr.length === 0) continue;
    populatedDimensions += 1;
    const viewerArr = normalizeStringList(viewerRaw);
    if (overlaps(adArr, viewerArr)) {
      matchedDimensions += 1;
      relevanceScore += weight;
    }
  }

  if (populatedDimensions > 0 && matchedDimensions === 0 && !allowRelaxedPsych) {
    return { eligible: false, relevanceScore: 0 };
  }

  if (matchedDimensions > 0) {
    relevanceScore += 12;
  }

  return { eligible: true, relevanceScore };
}

/**
 * Ranks campaigns strictly by freshness + auction bid_price DESC + relevance + urgency,
 * spacing consecutive campaigns from the same advertiser where possible.
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

/**
 * Interleaves bidded ads and standard floor-priced ads at a 3:1 (75% / 25%) ratio
 * while avoiding consecutive ads from the same advertiser where possible.
 */
export function interleaveBiddedAndStandardAds<T extends CampaignCandidate>(ads: T[]): T[] {
  const biddedTier: T[] = [];
  const standardTier: T[] = [];

  for (const ad of ads) {
    const bidVal = Number(ad.bid_price ?? 0);
    const cpiVal = Number(ad.cost_per_impression ?? 0);
    const isBiddedAd = Boolean(ad.is_bidded) || (bidVal > 0 && bidVal > cpiVal);
    if (isBiddedAd) {
      biddedTier.push(ad);
    } else {
      standardTier.push(ad);
    }
  }

  const interleaved: T[] = [];
  let bIdx = 0;
  let sIdx = 0;

  while (bIdx < biddedTier.length || sIdx < standardTier.length) {
    for (let k = 0; k < 3 && bIdx < biddedTier.length; k++) {
      const candidate = biddedTier[bIdx++];
      const prevEmail =
        interleaved.length > 0
          ? String(interleaved[interleaved.length - 1].user_email || "").toLowerCase().trim()
          : "";
      const candEmail = String(candidate.user_email || "").toLowerCase().trim();
      if (prevEmail && candEmail && prevEmail === candEmail && bIdx < biddedTier.length) {
        const nextCandidate = biddedTier[bIdx];
        biddedTier[bIdx] = candidate;
        interleaved.push(nextCandidate);
        bIdx++;
      } else {
        interleaved.push(candidate);
      }
    }
    if (sIdx < standardTier.length) {
      interleaved.push(standardTier[sIdx++]);
    }
  }

  return interleaved;
}
