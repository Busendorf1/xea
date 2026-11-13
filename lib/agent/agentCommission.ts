import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { invalidateCachedProfile, publishLiveBalanceUpdate } from "@/lib/utils/cache";
import { FastUplineMeta, StoredReferralEdge } from "./agentTypes";
import {
  l1UplineMeta,
  setL1Upline,
  memoryReferralEdges,
  invalidateAgentCaches,
} from "./agentCache";
import { checkIsUserAgent } from "./agentCore";

export async function resolveLightweightUplineForEarner(earnerEmail: string): Promise<FastUplineMeta> {
  const now = Date.now();
  const l1 = l1UplineMeta.get(earnerEmail);
  if (l1 && l1.expiresAt > now) {
    return l1;
  }

  if (isRedisReady()) {
    try {
      const raw = await redisConnection.get(`agent:upline_fast:${earnerEmail}`);
      if (raw) {
        const parsed: FastUplineMeta = JSON.parse(raw);
        // Enforce strict direct-only commission (zero multi-level downlines)
        const normalized: FastUplineMeta = {
          ...parsed,
          rate: parsed.rate >= 0.02 ? 0.02 : 0.01,
          uplineOfUplineEmail: null,
          expiresAt: now + 60000,
        };
        setL1Upline(earnerEmail, normalized);
        return normalized;
      }
    } catch {}
  }

  let uplineEmail: string | null = null;

  try {
    const { data: refRow } = await supabaseAdmin
      .from("referrals")
      .select("referrer_email, status, opt_out_status")
      .ilike("referee_email", earnerEmail)
      .maybeSingle();

    if (
      refRow &&
      refRow.status !== "opted_out" &&
      refRow.opt_out_status !== "accepted" &&
      refRow.opt_out_status !== "forced" &&
      refRow.referrer_email
    ) {
      uplineEmail = String(refRow.referrer_email).toLowerCase().trim();
    }
  } catch {}

  const memEdge = memoryReferralEdges.get(earnerEmail);
  if (memEdge) {
    if (memEdge.optOutStatus === "accepted" || memEdge.optOutStatus === "forced") {
      uplineEmail = null;
    } else {
      uplineEmail = memEdge.referrerEmail;
    }
  }

  if (!uplineEmail) {
    const emptyMeta: FastUplineMeta = {
      hasUpline: false,
      uplineEmail: null,
      rate: 0.01,
      uplineOfUplineEmail: null,
      expiresAt: now + 300000,
    };
    setL1Upline(earnerEmail, emptyMeta);
    if (isRedisReady()) {
      await redisConnection.set(`agent:upline_fast:${earnerEmail}`, JSON.stringify(emptyMeta), "EX", 1800).catch(() => {});
    }
    return emptyMeta;
  }

  const [{ isAgent: earnerIsAgent }, earnerRowRes] = await Promise.all([
    checkIsUserAgent(earnerEmail),
    supabaseAdmin
      .from("users")
      .select("monetized, monetization_clicks")
      .ilike("email", earnerEmail)
      .maybeSingle(),
  ]);

  const earnerRow = earnerRowRes.data;
  const isEarnerMonetized =
    !earnerRow ||
    earnerRow.monetized === true ||
    earnerRow.monetized === "true" ||
    earnerRow.monetized === "yes" ||
    earnerRow.monetized === "1" ||
    Number(earnerRow.monetization_clicks || 0) >= 300;

  if (!isEarnerMonetized) {
    return {
      hasUpline: false,
      uplineEmail: null,
      rate: 0.01,
      uplineOfUplineEmail: null,
      expiresAt: now + 30000,
    };
  }

  // Strict direct-only commission: 1% regular follower, 2% verified Agent, zero downline tiers
  const rate = earnerIsAgent ? 0.02 : 0.01;

  const activeMeta: FastUplineMeta = {
    hasUpline: true,
    uplineEmail,
    rate,
    uplineOfUplineEmail: null,
    expiresAt: now + 120000,
  };
  setL1Upline(earnerEmail, activeMeta);
  if (isRedisReady()) {
    await redisConnection.set(`agent:upline_fast:${earnerEmail}`, JSON.stringify(activeMeta), "EX", 600).catch(() => {});
  }
  return activeMeta;
}

export async function creditAgentWalletAndEdge({
  agentEmail,
  refereeEmail,
  creditToWallet,
  grossCommissionFromReferee,
  rate,
}: {
  agentEmail: string;
  refereeEmail: string;
  creditToWallet: number;
  grossCommissionFromReferee: number;
  rate: number;
}) {
  const cleanAgent = agentEmail.toLowerCase().trim();
  const cleanReferee = refereeEmail.toLowerCase().trim();

  // Atomically credit Agent Wallet balance without JavaScript read-modify-write race condition
  let newBal = 0;
  const { data: atomicResult, error: atomicErr } = await supabaseAdmin.rpc("increment_user_balance_atomic", {
    p_email: cleanAgent,
    p_amount: creditToWallet,
    p_source: "agent_commission",
  });

  if (!atomicErr && atomicResult && (atomicResult as any).success) {
    newBal = Number((atomicResult as any).newBalance) || 0;
    invalidateCachedProfile(cleanAgent).catch(() => {});
    publishLiveBalanceUpdate(cleanAgent, { delta: creditToWallet, newBalance: newBal }).catch(() => {});
  } else {
    // Fallback if migration is pending in current environment
    const { data: agentUser } = await supabaseAdmin.from("users").select("balance").ilike("email", cleanAgent).maybeSingle();
    if (agentUser) {
      const prevBal = Number(agentUser.balance) || 0;
      newBal = Math.round((prevBal + creditToWallet) * 100) / 100;
      await supabaseAdmin.from("users").update({ balance: newBal }).ilike("email", cleanAgent);
      invalidateCachedProfile(cleanAgent).catch(() => {});
      publishLiveBalanceUpdate(cleanAgent, { delta: creditToWallet, newBalance: newBal }).catch(() => {});
    }
  }

  let updatedEdgeTotal = grossCommissionFromReferee;
  let edgeAtomicSucceeded = false;

  const { data: edgeAtomicRes, error: edgeAtomicErr } = await supabaseAdmin.rpc(
    "increment_referral_commission_atomic",
    {
      p_referrer_email: cleanAgent,
      p_referee_email: cleanReferee,
      p_amount: grossCommissionFromReferee,
      p_rate: rate,
    }
  );

  if (!edgeAtomicErr && edgeAtomicRes && (edgeAtomicRes as any).success) {
    edgeAtomicSucceeded = true;
    updatedEdgeTotal = Number((edgeAtomicRes as any).totalCommissionEarned) || grossCommissionFromReferee;
  } else {
    // Fallback only if increment_referral_commission_atomic RPC migration has not been applied yet
    const { data: refRow } = await supabaseAdmin
      .from("referrals")
      .select("id, total_commission_earned")
      .ilike("referee_email", cleanReferee)
      .ilike("referrer_email", cleanAgent)
      .maybeSingle();

    if (refRow) {
      updatedEdgeTotal =
        Math.round(((Number(refRow.total_commission_earned) || 0) + grossCommissionFromReferee) * 100) / 100;
      await supabaseAdmin
        .from("referrals")
        .update({
          total_commission_earned: updatedEdgeTotal,
          commission_rate: rate,
        })
        .eq("id", refRow.id);
    }
  }

  const memEdge = memoryReferralEdges.get(cleanReferee);
  if (memEdge && memEdge.referrerEmail === cleanAgent) {
    updatedEdgeTotal = edgeAtomicSucceeded
      ? updatedEdgeTotal
      : Math.max(
          updatedEdgeTotal,
          Math.round(((memEdge.totalCommissionEarned || 0) + grossCommissionFromReferee) * 100) / 100
        );
    memEdge.totalCommissionEarned = updatedEdgeTotal;
    memEdge.commissionRate = rate;
  }

  if (isRedisReady()) {
    try {
      const raw = await redisConnection.get(`agent:edge:${cleanReferee}`);
      const existing: StoredReferralEdge | null = raw ? JSON.parse(raw) : null;
      const nextTotal = edgeAtomicSucceeded
        ? Math.max(updatedEdgeTotal, existing?.totalCommissionEarned || 0)
        : existing
        ? Math.max(
            updatedEdgeTotal,
            Math.round(((existing.totalCommissionEarned || 0) + grossCommissionFromReferee) * 100) / 100
          )
        : updatedEdgeTotal;
      const nextEdge: StoredReferralEdge = {
        referrerEmail: cleanAgent,
        refereeEmail: cleanReferee,
        commissionRate: rate,
        totalCommissionEarned: nextTotal,
        optOutStatus: existing?.optOutStatus || "none",
        optOutRequestedAt: existing?.optOutRequestedAt || null,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      await redisConnection.set(`agent:edge:${cleanReferee}`, JSON.stringify(nextEdge), "EX", 86400 * 365);
    } catch {}
  }
}

export async function applyAgentCommissionOnEarning({
  earnerEmail,
  grossEarnedAmount,
  currentEarnerBalance,
  adId,
}: {
  earnerEmail: string;
  grossEarnedAmount: number;
  currentEarnerBalance: number;
  adId?: string;
}): Promise<{
  netEarnerAmount: number;
  deductedAmount: number;
  adjustedEarnerBalance: number;
  uplineAgentEmail: string | null;
}> {
  const cleanEarner = earnerEmail.toLowerCase().trim();
  if (!grossEarnedAmount || grossEarnedAmount <= 0) {
    return {
      netEarnerAmount: grossEarnedAmount,
      deductedAmount: 0,
      adjustedEarnerBalance: currentEarnerBalance,
      uplineAgentEmail: null,
    };
  }

  try {
    // 1. Call PostgreSQL atomic RPC to lock rows and deduct/credit atomically without race conditions
    const { data: commRes, error: rpcErr } = await supabaseAdmin.rpc("apply_agent_commission_atomic", {
      p_earner_email: cleanEarner,
      p_gross_amount: grossEarnedAmount,
      p_ad_id: adId || null,
    });

    if (rpcErr) {
      console.warn("⚠️ apply_agent_commission_atomic RPC error:", rpcErr);
    }

    if (commRes && typeof commRes === "object" && (commRes as any).applied) {
      const netEarnerAmount = Number((commRes as any).net_earner_amount ?? grossEarnedAmount);
      const deductedAmount = Number((commRes as any).deducted ?? 0);
      const adjustedEarnerBalance =
        (commRes as any).earner_new_balance !== undefined && (commRes as any).earner_new_balance !== null
          ? Number((commRes as any).earner_new_balance)
          : Math.max(0, Math.round((currentEarnerBalance - deductedAmount) * 100) / 100);
      const uplineEmail = ((commRes as any).agent1_email as string) || null;
      const agentCredit = Number((commRes as any).agent1_credit ?? deductedAmount);
      const agentNewBal =
        (commRes as any).agent1_new_balance !== undefined && (commRes as any).agent1_new_balance !== null
          ? Number((commRes as any).agent1_new_balance)
          : undefined;

      // Invalidate profile caches & notify real-time listeners
      invalidateCachedProfile(cleanEarner).catch(() => {});
      publishLiveBalanceUpdate(cleanEarner, { delta: -deductedAmount, newBalance: adjustedEarnerBalance }).catch(() => {});

      if (uplineEmail) {
        invalidateCachedProfile(uplineEmail).catch(() => {});
        if (agentNewBal !== undefined) {
          publishLiveBalanceUpdate(uplineEmail, { delta: agentCredit, newBalance: agentNewBal }).catch(() => {});
        }
      }

      await invalidateAgentCaches([cleanEarner, uplineEmail].filter(Boolean) as string[]);

      return {
        netEarnerAmount,
        deductedAmount,
        adjustedEarnerBalance,
        uplineAgentEmail: uplineEmail,
      };
    }

    // If RPC returned not applied (e.g. no upline, upline opted out, earner unmonetized)
    return {
      netEarnerAmount: grossEarnedAmount,
      deductedAmount: 0,
      adjustedEarnerBalance: currentEarnerBalance,
      uplineAgentEmail: null,
    };
  } catch (err) {
    console.warn("⚠️ Agent commission split warning:", err);
    return {
      netEarnerAmount: grossEarnedAmount,
      deductedAmount: 0,
      adjustedEarnerBalance: currentEarnerBalance,
      uplineAgentEmail: null,
    };
  }
}
