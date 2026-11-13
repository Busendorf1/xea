import { env } from "../env";

export const connectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  tls: env.REDIS_TLS === "true" ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: null,
};

export interface FeedJobData {
  adId: string;
  email: string;
  type: "earn" | "mutual" | "seen" | "action-click";
  clickType?: string;
  amount?: number;
  deviceId?: string;
  cpi?: number;
}

export interface CampaignJobPayload {
  user_email: string;
  is_admin_post?: boolean;
  [key: string]: unknown;
}

export interface CampaignJobData {
  type: "ad" | "highlight";
  payload: CampaignJobPayload;
}

export interface HlsJobData {
  sourceUrl: string;
  mediaId: string;
  bucketName?: string;
  tableName?: string;
  recordId?: string;
}

export interface PaymentJobData {
  type: "p2p_transfer" | "transfer-settlement";
  senderEmail: string;
  recipientEmail: string;
  amount: number;
  amountKobo?: number;
  reference: string;
  timestamp?: string;
  settledImmediately?: boolean;
}

export interface AdRatingJobData {
  adId: string;
  advertiserEmail: string;
  starRating: number;
}
