import redisConnection, { isRedisReady } from "@/lib/redis";
import {
  AgentNetworkPayload,
  FastUplineMeta,
  StoredReferralEdge,
} from "./agentTypes";

export const MAX_L1_ENTRIES = 5000;
export const l1UplineMeta = new Map<string, FastUplineMeta>();
export const l1NetworkCache = new Map<string, { data: AgentNetworkPayload; expiresAt: number }>();
export const memoryAgentFlags = new Map<
  string,
  {
    isAgent: boolean;
    registeredAt: string | null;
    isBanned?: boolean;
    bannedUntil?: string | null;
    banReason?: string | null;
  }
>();
export const memoryCodeToEmail = new Map<string, string>();
export const memoryReferralEdges = new Map<string, StoredReferralEdge>();

export function setL1Upline(email: string, meta: FastUplineMeta) {
  if (l1UplineMeta.size >= MAX_L1_ENTRIES) {
    const firstKey = l1UplineMeta.keys().next().value;
    if (firstKey) l1UplineMeta.delete(firstKey);
  }
  l1UplineMeta.set(email, meta);
}

export async function invalidateAgentCaches(emails: (string | null | undefined)[]) {
  const cleanList = Array.from(
    new Set(emails.filter(Boolean).map((e) => String(e).toLowerCase().trim()))
  );
  for (const e of cleanList) {
    l1UplineMeta.delete(e);
    l1NetworkCache.delete(e);
  }
  if (isRedisReady() && cleanList.length > 0) {
    const keys: string[] = [];
    for (const e of cleanList) {
      keys.push(`agent:upline_fast:${e}`, `agent:net_cache:${e}`);
    }
    await redisConnection.del(...keys).catch(() => {});
  }
}
