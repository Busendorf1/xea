export type {
  ViewerTargetingProfile,
  TargetableAd,
  BroadeningStage,
  CampaignBroadeningPlan,
  TargetingMatchResult,
} from "./targeting/types";

export { computeCampaignBroadeningPlan } from "./targeting/broadeningPlan";

export {
  WILDCARD_VALUES,
  getEarnTokenSecret,
  signAdImpressionToken,
  normalizeStringArray,
  isUnrestrictedTarget,
  normalizeLocationToken,
  normalizeGender,
  getViewerAge,
  matchesAgeRange,
} from "./targeting/tokensAndGeo";

export { evaluateAdTargeting } from "./targeting/matchEvaluator";
export { rankAndFilterTargetedAds, spaceFeedAdsByAdvertiser } from "./targeting/ranker";
