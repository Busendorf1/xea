import { Ad } from "@/types/ads";
import {
  computeCampaignBroadeningPlan,
  rankAndFilterTargetedAds,
  ViewerTargetingProfile,
} from "@/lib/targetingEngine";
import { getEffectiveBidPrice } from "./poolLoader";

export interface UserImpressionInfo {
  view_count: number;
  today_view_count: number;
  last_viewed_at: string | null;
}

export interface BuildFeedCandidatesParams {
  rawAds: any[];
  viewerProfile: ViewerTargetingProfile;
  emailKey: string;
  isViewerAdmin: boolean;
  seenAdIdsSet: Set<string>;
  blockedAdIdsSet: Set<string>;
  blockedAdvertisersSet: Set<string>;
  userImpressionMap: Map<string, UserImpressionInfo>;
  todayPacingMap: Record<string, string>;
  todayDate: string;
  nowMs: number;
}

export function buildOrderedCandidateFeed(params: BuildFeedCandidatesParams): {
  orderedCandidateAds: Ad[];
  completedOrCappedAdIds: string[];
} {
  const {
    rawAds,
    viewerProfile,
    emailKey,
    isViewerAdmin,
    seenAdIdsSet,
    blockedAdIdsSet,
    blockedAdvertisersSet,
    userImpressionMap,
    todayPacingMap,
    todayDate,
    nowMs,
  } = params;

  // Enforce strict demographic/geo/psychographic targeting WITHOUT unconditional Pass 3 fallback bypass
  const ads = rankAndFilterTargetedAds(rawAds, { ...viewerProfile, email: emailKey }, {
    minResults: 15,
    seenAdIds: seenAdIdsSet,
    allowNearestFallback: false,
  });

  const freshAdsList: Ad[] = [];
  const retargetedAdsList: Ad[] = [];
  const seenCandidateIds = new Set<string>();
  const completedOrCappedAdIds: string[] = [];

  (ads || []).forEach((ad: any) => {
    if (!ad || !ad.id || seenCandidateIds.has(ad.id)) return;
    if (ad.completed_at || ad.is_paused === true) return;
    if (blockedAdIdsSet.has(ad.id)) return;
    if (ad.user_email && blockedAdvertisersSet.has(ad.user_email.toLowerCase())) return;

    const impressionsTarget = Number(ad.impressions || 0);
    const impressionCount = Number(ad.impression_count ?? ad.view_count ?? 0);
    if (impressionsTarget > 0 && impressionCount >= impressionsTarget) return;

    const plan = computeCampaignBroadeningPlan(ad, nowMs);
    if (plan.isScheduledFuture) return;

    const imp = userImpressionMap.get(ad.id);
    const totalViews = Math.max(
      imp?.view_count || 0,
      seenAdIdsSet.has(ad.id) ? plan.effectiveUserCap : 0
    );

    if (!isViewerAdmin && !ad.is_admin_post && totalViews >= plan.effectiveUserCap) {
      completedOrCappedAdIds.push(ad.id);
      return;
    }

    const isToday = imp?.last_viewed_at && imp.last_viewed_at.slice(0, 10) === todayDate;
    const viewsToday = Math.max(
      Number(todayPacingMap[ad.id] || 0),
      isToday ? imp?.today_view_count || 0 : 0
    );

    if (totalViews > 0) {
      if (viewsToday >= plan.dailyUserCap) return;
      if (imp?.last_viewed_at) {
        const lastViewedMs = new Date(imp.last_viewed_at).getTime();
        if (!isNaN(lastViewedMs) && nowMs - lastViewedMs < plan.minSpacingMs) return;
      }
    }

    const isRollover = plan.durationRatio >= 1.0 && impressionsTarget > 0 && impressionCount < impressionsTarget;
    ad.is_rollover = isRollover;
    ad.broadening_stage = plan.broadeningStage;

    const isPlatformFreeAd =
      (!ad.cost_per_impression || Number(ad.cost_per_impression) === 0) && impressionsTarget === 0;
    if (isPlatformFreeAd && plan.durationRatio > 1.0) return;

    seenCandidateIds.add(ad.id);
    if (totalViews > 0) {
      retargetedAdsList.push(ad);
    } else {
      freshAdsList.push(ad);
    }
  });

  // Sort both fresh & retargeted lists by bid_price DESC (no media bias)
  freshAdsList.sort((a, b) => getEffectiveBidPrice(b) - getEffectiveBidPrice(a));
  retargetedAdsList.sort((a, b) => getEffectiveBidPrice(b) - getEffectiveBidPrice(a));

  // Space retargeted ads with at least 3 fresh items between retargeted impressions
  const candidateAds: Ad[] = [];
  let fIdx = 0;
  let rIdx = 0;
  let itemsSinceLastRetarget = 3;

  while (fIdx < freshAdsList.length || rIdx < retargetedAdsList.length) {
    let freshAdded = 0;
    while (freshAdded < 3 && fIdx < freshAdsList.length) {
      candidateAds.push(freshAdsList[fIdx++]);
      itemsSinceLastRetarget++;
      freshAdded++;
    }
    if (rIdx < retargetedAdsList.length) {
      if (itemsSinceLastRetarget >= 3) {
        candidateAds.push(retargetedAdsList[rIdx++]);
        itemsSinceLastRetarget = 0;
      } else if (fIdx >= freshAdsList.length) {
        break;
      }
    }
  }

  // Tiered Priority Auction Interleaver ordered by bid_price DESC (never hasMedia)
  const biddedTier: Ad[] = [];
  const standardTier: Ad[] = [];

  candidateAds.forEach((ad: Ad) => {
    const isBiddedAd =
      (ad as any).is_bidded ||
      ((ad as any).bid_price && Number((ad as any).bid_price) > Number(ad.cost_per_impression || 0));
    if (isBiddedAd) {
      biddedTier.push(ad);
    } else {
      standardTier.push(ad);
    }
  });

  biddedTier.sort((a, b) => getEffectiveBidPrice(b) - getEffectiveBidPrice(a));
  standardTier.sort((a, b) => getEffectiveBidPrice(b) - getEffectiveBidPrice(a));

  const interleavedAds: Ad[] = [];
  let bIdx = 0;
  let sIdx = 0;

  while (bIdx < biddedTier.length || sIdx < standardTier.length) {
    for (let k = 0; k < 3 && bIdx < biddedTier.length; k++) {
      const candidate = biddedTier[bIdx++];
      if (
        interleavedAds.length > 0 &&
        interleavedAds[interleavedAds.length - 1].user_email === candidate.user_email &&
        bIdx < biddedTier.length
      ) {
        const nextCandidate = biddedTier[bIdx];
        biddedTier[bIdx] = candidate;
        interleavedAds.push(nextCandidate);
        bIdx++;
      } else {
        interleavedAds.push(candidate);
      }
    }
    if (sIdx < standardTier.length) {
      interleavedAds.push(standardTier[sIdx++]);
    }
  }

  return { orderedCandidateAds: interleavedAds, completedOrCappedAdIds };
}
