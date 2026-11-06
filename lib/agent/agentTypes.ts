import type { AdvertiserProfileData } from "@/components/ui/AdvertiserHoverCard";

export type OptOutStatusType =
  | "none"
  | "requested"
  | "rejected"
  | "agent_requested"
  | "agent_rejected"
  | "accepted"
  | "forced";

export interface DownlineInviteItem {
  id: string;
  refereeKey: string;
  email?: string;
  refereeEmail?: string;
  username: string;
  displayName: string;
  profileImage: string | null;
  profile: AdvertiserProfileData;
  isAgent: boolean;
  commissionRatePct: number;
  earnedFromUser: number;
  optOutStatus: OptOutStatusType;
  optOutRequestedAt: string | null;
  joinedAt: string;
}

export interface UplineAgentInfo {
  username: string;
  displayName: string;
  email?: string;
  referrerEmail?: string;
  profileImage: string | null;
  profile: AdvertiserProfileData;
  isRefereeAgent: boolean;
  deductionRatePct: number;
  totalGainedFromMe: number;
  optOutStatus: OptOutStatusType;
  optOutRequestedAt: string | null;
  joinedAt: string;
}

export interface MutualUserItem {
  id: string;
  username: string;
  displayName: string;
  profileImage: string | null;
  profile: AdvertiserProfileData;
}

export interface AgentNetworkPayload {
  isAgent: boolean;
  agentRegisteredAt: string | null;
  referralCode: string;
  totalAgentEarned: number;
  invitesCount: number;
  uplineAgentsCount: number;
  mutualsCount: number;
  pendingOptOutRequestsCount: number;
  invites: DownlineInviteItem[];
  uplineAgent: UplineAgentInfo | null;
  mutuals: MutualUserItem[];
}

export interface StoredReferralEdge {
  referrerEmail: string;
  refereeEmail: string;
  commissionRate: number;
  totalCommissionEarned: number;
  optOutStatus: OptOutStatusType;
  optOutRequestedAt: string | null;
  createdAt: string;
}

export interface FastUplineMeta {
  hasUpline: boolean;
  uplineEmail: string | null;
  rate: number;
  uplineOfUplineEmail: string | null;
  expiresAt: number;
}
