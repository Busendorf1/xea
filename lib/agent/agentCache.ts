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

/**
 * Removes a deleted account from every agent-network cache layer (L1 memory, Redis edge/downline
 * sets, network payload caches) for the user, their referrer, their referees and anyone who had
 * them as a mutual. Costs O(k) Redis ops in the number of affected neighbours; there is no scan.
 */
export async function purgeDeletedUserFromAgentCaches(params: {
  email: string;
  referrerEmail?: string | null;
  refereeEmails?: string[];
  mutualHolderEmails?: string[];
}) {
  const email = params.email.toLowerCase().trim();
  const referrer = (params.referrerEmail || "").toLowerCase().trim() || null;
  const referees = (params.refereeEmails || []).map((e) => e.toLowerCase().trim()).filter(Boolean);
  const holders = (params.mutualHolderEmails || []).map((e) => e.toLowerCase().trim()).filter(Boolean);

  // L1 memory (this worker)
  memoryReferralEdges.delete(email);
  for (const ref of referees) {
    const edge = memoryReferralEdges.get(ref);
    if (edge && edge.referrerEmail === email) memoryReferralEdges.delete(ref);
  }
  memoryAgentFlags.delete(email);
  for (const [code, mapped] of memoryCodeToEmail.entries()) {
    if (mapped === email) memoryCodeToEmail.delete(code);
  }

  await invalidateAgentCaches([email, referrer, ...referees, ...holders]);

  if (!isRedisReady()) return;
  try {
    const pipeline = redisConnection.pipeline();
    pipeline.del(`agent:edge:${email}`, `agent:downline:${email}`, `agent:status:${email}`);
    if (referrer) pipeline.srem(`agent:downline:${referrer}`, email);
    for (const ref of referees) pipeline.del(`agent:edge:${ref}`);
    await pipeline.exec();
  } catch {}
}
