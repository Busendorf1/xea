export type {
  FeedJobData,
  CampaignJobPayload,
  CampaignJobData,
  HlsJobData,
  PaymentJobData,
  AdRatingJobData,
} from "./workers/config";

import { feedWorker, flushBatch } from "./workers/feedWorker";
import { campaignsWorker, hlsWorker } from "./workers/campaignHlsWorkers";
import { adRatingWorker, paymentWorker } from "./workers/paymentRatingWorkers";
import { pingClickHouseHeartbeat, shutdownWorkers } from "./workers/lifecycle";

export {
  flushBatch,
  feedWorker,
  campaignsWorker,
  hlsWorker,
  paymentWorker,
  adRatingWorker,
  pingClickHouseHeartbeat,
  shutdownWorkers,
};

const workers = {
  feedWorker,
  campaignsWorker,
  hlsWorker,
  paymentWorker,
  adRatingWorker,
  pingClickHouseHeartbeat,
  shutdownWorkers,
};

export default workers;
