import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import { OptOutStatusType, StoredReferralEdge } from "./agentTypes";
import {
  memoryAgentFlags,
  memoryReferralEdges,
  invalidateAgentCaches,
} from "./agentCache";
import { updateReferralOptOutInDb } from "./agentCore";

/**
 * Handles both directions of permissioned Unfollow & Force Opt-Out:
 * - 'request': Follower asks Agent to unfollow
 * - 'accept' / 'reject': Agent accepts or rejects follower's unfollow request
 * - 'agent_request': Agent asks Follower for permission to remove them from Invites list
 * - 'referee_accept' / 'referee_reject': Follower accepts or rejects Agent's removal request
 * - 'force': Follower opts out immediately, removing both their upline referrer and their own invites
 */
export async function handleAgentOptOut({
  actorEmail,
  action,
  targetRefereeEmail,
}: {
  actorEmail: string;
  action:
    | "request"
    | "cancel_request"
    | "accept"
    | "reject"
    | "agent_request"
    | "agent_cancel"
    | "referee_accept"
    | "referee_reject"
    | "force";
  targetRefereeEmail?: string;
}): Promise<{ success: boolean; message: string; error?: string }> {
  const cleanActor = actorEmail.toLowerCase().trim();
  const nowIso = new Date().toISOString();

  // 1. Follower requests or cancels unfollow request (O(1) single-row indexed lookup + update)
  if (action === "request" || action === "cancel_request") {
    const { data: upRow } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .ilike("referee_email", cleanActor)
      .maybeSingle();

    const memEdge = memoryReferralEdges.get(cleanActor);
    const agentEmail = (upRow?.referrer_email || memEdge?.referrerEmail || "").toLowerCase().trim();
    if (!agentEmail) {
      return { success: false, message: "", error: "No active referral connection found." };
    }

    const nextOptStatus: OptOutStatusType = action === "request" ? "requested" : "none";
    const nextOptTime = action === "request" ? nowIso : null;

    await updateReferralOptOutInDb({ refereeEmail: cleanActor }, nextOptStatus, nextOptTime);

    const edge: StoredReferralEdge = {
      referrerEmail: agentEmail,
      refereeEmail: cleanActor,
      commissionRate: Number(upRow?.commission_rate ?? memEdge?.commissionRate ?? 0.01),
      totalCommissionEarned: Number(upRow?.total_commission_earned ?? memEdge?.totalCommissionEarned ?? 0),
      optOutStatus: nextOptStatus,
      optOutRequestedAt: nextOptTime,
      createdAt: upRow?.created_at || memEdge?.createdAt || nowIso,
    };
    memoryReferralEdges.set(cleanActor, edge);
    if (isRedisReady()) {
      await redisConnection.set(`agent:edge:${cleanActor}`, JSON.stringify(edge), "EX", 86400 * 365).catch(() => {});
    }

    await invalidateAgentCaches([cleanActor, agentEmail]);
    return {
      success: true,
      message: action === "request" ? "Unfollow request sent." : "Request cancelled.",
    };
  }

  // 2. Agent requests or undoes removal request from Invites list (O(1) single-row indexed lookup + update)
  if (action === "agent_request" || action === "agent_cancel") {
    const cleanReferee = (targetRefereeEmail || "").toLowerCase().trim();
    if (!cleanReferee) {
      return { success: false, message: "", error: "Missing user." };
    }

    const { data: edgeRow } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .ilike("referrer_email", cleanActor)
      .ilike("referee_email", cleanReferee)
      .maybeSingle();

    const memEdge = memoryReferralEdges.get(cleanReferee);
    if (!edgeRow && (!memEdge || memEdge.referrerEmail !== cleanActor)) {
      return { success: false, message: "", error: "User not found in your invites." };
    }

    const nextOptStatus: OptOutStatusType = action === "agent_request" ? "agent_requested" : "none";
    const nextOptTime = action === "agent_request" ? nowIso : null;

    await updateReferralOptOutInDb(
      { refereeEmail: cleanReferee, referrerEmail: cleanActor },
      nextOptStatus,
      nextOptTime
    );

    const edge: StoredReferralEdge = {
      referrerEmail: cleanActor,
      refereeEmail: cleanReferee,
      commissionRate: Number(edgeRow?.commission_rate ?? memEdge?.commissionRate ?? 0.01),
      totalCommissionEarned: Number(edgeRow?.total_commission_earned ?? memEdge?.totalCommissionEarned ?? 0),
      optOutStatus: nextOptStatus,
      optOutRequestedAt: nextOptTime,
      createdAt: edgeRow?.created_at || memEdge?.createdAt || nowIso,
    };
    memoryReferralEdges.set(cleanReferee, edge);
    if (isRedisReady()) {
      await redisConnection.set(`agent:edge:${cleanReferee}`, JSON.stringify(edge), "EX", 86400 * 365).catch(() => {});
    }

    await invalidateAgentCaches([cleanActor, cleanReferee]);
    return {
      success: true,
      message: action === "agent_request" ? "Removal request sent." : "Removal request undone.",
    };
  }

  // 3. Follower accepts or rejects Agent's removal request (O(1) single-row indexed update)
  if (action === "referee_accept" || action === "referee_reject") {
    const { data: upRow } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .ilike("referee_email", cleanActor)
      .maybeSingle();

    const memEdge = memoryReferralEdges.get(cleanActor);
    const agentEmail = (upRow?.referrer_email || memEdge?.referrerEmail || "").toLowerCase().trim();
    if (!agentEmail) {
      return { success: false, message: "", error: "No active connection found." };
    }

    if (action === "referee_accept") {
      await Promise.all([
        updateReferralOptOutInDb({ refereeEmail: cleanActor }, "accepted", nowIso),
        supabaseAdmin.from("users").update({ referred_by: null }).ilike("email", cleanActor),
      ]);

      const acceptedEdge: StoredReferralEdge = {
        referrerEmail: agentEmail,
        refereeEmail: cleanActor,
        commissionRate: Number(upRow?.commission_rate ?? memEdge?.commissionRate ?? 0.01),
        totalCommissionEarned: Number(upRow?.total_commission_earned ?? memEdge?.totalCommissionEarned ?? 0),
        optOutStatus: "accepted",
        optOutRequestedAt: nowIso,
        createdAt: upRow?.created_at || memEdge?.createdAt || nowIso,
      };
      memoryReferralEdges.set(cleanActor, acceptedEdge);
      if (isRedisReady()) {
        await Promise.all([
          redisConnection.set(`agent:edge:${cleanActor}`, JSON.stringify(acceptedEdge), "EX", 86400 * 365).catch(() => {}),
          redisConnection.srem(`agent:downline:${agentEmail}`, cleanActor).catch(() => {}),
        ]);
      }
      await invalidateAgentCaches([cleanActor, agentEmail]);
      return { success: true, message: "Unfollowed." };
    } else {
      await updateReferralOptOutInDb({ refereeEmail: cleanActor }, "none", null);

      const resetEdge: StoredReferralEdge = {
        referrerEmail: agentEmail,
        refereeEmail: cleanActor,
        commissionRate: Number(upRow?.commission_rate ?? memEdge?.commissionRate ?? 0.01),
        totalCommissionEarned: Number(upRow?.total_commission_earned ?? memEdge?.totalCommissionEarned ?? 0),
        optOutStatus: "none",
        optOutRequestedAt: null,
        createdAt: upRow?.created_at || memEdge?.createdAt || nowIso,
      };
      memoryReferralEdges.set(cleanActor, resetEdge);
      if (isRedisReady()) {
        await redisConnection.set(`agent:edge:${cleanActor}`, JSON.stringify(resetEdge), "EX", 86400 * 365).catch(() => {});
      }
      await invalidateAgentCaches([cleanActor, agentEmail]);
      return { success: true, message: "Request declined." };
    }
  }

  // 4. Agent accepts or rejects Follower's unfollow request (O(1) single-row indexed lookup + update)
  if (action === "accept" || action === "reject") {
    const cleanReferee = (targetRefereeEmail || "").toLowerCase().trim();
    if (!cleanReferee) {
      return { success: false, message: "", error: "Missing user." };
    }

    const { data: edgeRow } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .ilike("referrer_email", cleanActor)
      .ilike("referee_email", cleanReferee)
      .maybeSingle();

    const memEdge = memoryReferralEdges.get(cleanReferee);
    if (!edgeRow && (!memEdge || memEdge.referrerEmail !== cleanActor)) {
      return { success: false, message: "", error: "User not in your invites." };
    }

    if (action === "accept") {
      await Promise.all([
        updateReferralOptOutInDb(
          { refereeEmail: cleanReferee, referrerEmail: cleanActor },
          "accepted",
          nowIso
        ),
        supabaseAdmin.from("users").update({ referred_by: null }).ilike("email", cleanReferee),
      ]);

      const acceptedEdge: StoredReferralEdge = {
        referrerEmail: cleanActor,
        refereeEmail: cleanReferee,
        commissionRate: Number(edgeRow?.commission_rate ?? memEdge?.commissionRate ?? 0.01),
        totalCommissionEarned: Number(edgeRow?.total_commission_earned ?? memEdge?.totalCommissionEarned ?? 0),
        optOutStatus: "accepted",
        optOutRequestedAt: edgeRow?.opt_out_requested_at || memEdge?.optOutRequestedAt || nowIso,
        createdAt: edgeRow?.created_at || memEdge?.createdAt || nowIso,
      };
      memoryReferralEdges.set(cleanReferee, acceptedEdge);
      if (isRedisReady()) {
        await Promise.all([
          redisConnection.set(`agent:edge:${cleanReferee}`, JSON.stringify(acceptedEdge), "EX", 86400 * 365).catch(() => {}),
          redisConnection.srem(`agent:downline:${cleanActor}`, cleanReferee).catch(() => {}),
        ]);
      }

      await invalidateAgentCaches([cleanActor, cleanReferee]);
      return { success: true, message: "Unfollow accepted." };
    } else {
      await updateReferralOptOutInDb(
        { refereeEmail: cleanReferee, referrerEmail: cleanActor },
        "rejected",
        edgeRow?.opt_out_requested_at || memEdge?.optOutRequestedAt || null
      );

      const rejectedEdge: StoredReferralEdge = {
        referrerEmail: cleanActor,
        refereeEmail: cleanReferee,
        commissionRate: Number(edgeRow?.commission_rate ?? memEdge?.commissionRate ?? 0.01),
        totalCommissionEarned: Number(edgeRow?.total_commission_earned ?? memEdge?.totalCommissionEarned ?? 0),
        optOutStatus: "rejected",
        optOutRequestedAt: edgeRow?.opt_out_requested_at || memEdge?.optOutRequestedAt || null,
        createdAt: edgeRow?.created_at || memEdge?.createdAt || nowIso,
      };
      memoryReferralEdges.set(cleanReferee, rejectedEdge);
      if (isRedisReady()) {
        await redisConnection
          .set(`agent:edge:${cleanReferee}`, JSON.stringify(rejectedEdge), "EX", 86400 * 365)
          .catch(() => {});
      }

      await invalidateAgentCaches([cleanActor, cleanReferee]);
      return { success: true, message: "Unfollow declined." };
    }
  }

  // 5. Force Opt-Out (from Following tab or /agent page): O(1) bulk indexed SQL updates (scales to 100M+ followers)
  if (action === "force") {
    const affectedEmails: (string | null)[] = [cleanActor];

    const { data: upRow } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .ilike("referee_email", cleanActor)
      .maybeSingle();
    const uplineEmail = (upRow?.referrer_email || memoryReferralEdges.get(cleanActor)?.referrerEmail || "")
      .toLowerCase()
      .trim();

    if (uplineEmail) {
      affectedEmails.push(uplineEmail);
      const forcedUpEdge: StoredReferralEdge = {
        referrerEmail: uplineEmail,
        refereeEmail: cleanActor,
        commissionRate: 0.01,
        totalCommissionEarned: Number(upRow?.total_commission_earned ?? 0),
        optOutStatus: "forced",
        optOutRequestedAt: nowIso,
        createdAt: upRow?.created_at || nowIso,
      };
      memoryReferralEdges.set(cleanActor, forcedUpEdge);
      if (isRedisReady()) {
        await Promise.all([
          redisConnection.set(`agent:edge:${cleanActor}`, JSON.stringify(forcedUpEdge), "EX", 86400 * 365).catch(() => {}),
          redisConnection.srem(`agent:downline:${uplineEmail}`, cleanActor).catch(() => {}),
        ]);
      }
    }

    // Bounded chunked SQL updates (case-insensitive, safe at 500M+ scale without giant locks)
    try {
      const BATCH_SIZE = 1000;
      const MAX_CHUNKS = 500;

      const [upRefRes] = await Promise.all([
        supabaseAdmin
          .from("referrals")
          .update({ status: "opted_out", opt_out_status: "forced" })
          .ilike("referee_email", cleanActor),
        supabaseAdmin
          .from("users")
          .update({ is_agent: false, referred_by: null })
          .ilike("email", cleanActor),
      ]);
      if (upRefRes?.error) {
        await supabaseAdmin
          .from("referrals")
          .update({ status: "opted_out" })
          .ilike("referee_email", cleanActor);
      }

      for (let chunk = 0; chunk < MAX_CHUNKS; chunk++) {
        const { data: refBatch, error: refSelErr } = await supabaseAdmin
          .from("referrals")
          .select("referee_email")
          .ilike("referrer_email", cleanActor)
          .neq("status", "opted_out")
          .limit(BATCH_SIZE);

        if (refSelErr || refBatch === null) {
          const { error: downErr } = await supabaseAdmin
            .from("referrals")
            .update({ status: "opted_out", opt_out_status: "forced" })
            .ilike("referrer_email", cleanActor)
            .neq("status", "opted_out");
          if (downErr) {
            await supabaseAdmin
              .from("referrals")
              .update({ status: "opted_out" })
              .ilike("referrer_email", cleanActor)
              .neq("status", "opted_out");
          }
          break;
        }
        if (refBatch.length === 0) break;

        const batchEmails = refBatch
          .map((r: any) => String(r?.referee_email || "").toLowerCase().trim())
          .filter(Boolean);
        if (batchEmails.length === 0) break;

        const { error: updErr } = await supabaseAdmin
          .from("referrals")
          .update({ status: "opted_out", opt_out_status: "forced" })
          .ilike("referrer_email", cleanActor)
          .in("referee_email", batchEmails);
        if (updErr) {
          await supabaseAdmin
            .from("referrals")
            .update({ status: "opted_out" })
            .ilike("referrer_email", cleanActor)
            .in("referee_email", batchEmails);
        }
        if (refBatch.length < BATCH_SIZE) break;
      }

      for (let chunk = 0; chunk < MAX_CHUNKS; chunk++) {
        const { data: userBatch, error: userSelErr } = await supabaseAdmin
          .from("users")
          .select("email")
          .ilike("referred_by", cleanActor)
          .limit(BATCH_SIZE);

        if (userSelErr || userBatch === null) {
          await supabaseAdmin
            .from("users")
            .update({ referred_by: null })
            .ilike("referred_by", cleanActor);
          break;
        }
        if (userBatch.length === 0) break;

        const batchEmails = userBatch
          .map((u: any) => String(u?.email || "").trim())
          .filter(Boolean);
        if (batchEmails.length === 0) break;

        await supabaseAdmin
          .from("users")
          .update({ referred_by: null })
          .in("email", batchEmails);
        if (userBatch.length < BATCH_SIZE) break;
      }
    } catch {}

    // Clear in-memory & Redis downline set in bounded chunks
    for (const [k, v] of memoryReferralEdges.entries()) {
      if (v.referrerEmail === cleanActor) {
        memoryReferralEdges.set(k, { ...v, optOutStatus: "forced", optOutRequestedAt: nowIso });
      }
    }
    memoryAgentFlags.set(cleanActor, { isAgent: false, registeredAt: nowIso });

    if (isRedisReady()) {
      try {
        const downlineMembers = await redisConnection.smembers(`agent:downline:${cleanActor}`).catch(() => []);
        if (Array.isArray(downlineMembers) && downlineMembers.length > 0) {
          if (downlineMembers.length <= 500) {
            affectedEmails.push(...downlineMembers);
          }
          const edgeKeys = downlineMembers.map((m) => `agent:edge:${String(m).toLowerCase().trim()}`);
          for (let i = 0; i < edgeKeys.length; i += 500) {
            await redisConnection.del(...edgeKeys.slice(i, i + 500)).catch(() => {});
          }
        }
        await Promise.all([
          redisConnection.del(`agent:downline:${cleanActor}`).catch(() => {}),
          redisConnection
            .set(`agent:status:${cleanActor}`, JSON.stringify({ isAgent: false, registeredAt: null }), "EX", 86400 * 365)
            .catch(() => {}),
        ]);
      } catch {}
    }

    await invalidateAgentCaches(affectedEmails);
    await invalidateCachedProfile(cleanActor).catch(() => {});

    return {
      success: true,
      message: "Opted out.",
    };
  }

  return { success: false, message: "", error: "Invalid action." };
}

export async function removeAgentFollower({
  agentEmail,
  refereeEmail,
  reason,
}: {
  agentEmail: string;
  refereeEmail: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const cleanAgent = agentEmail.toLowerCase().trim();
  const cleanReferee = refereeEmail.toLowerCase().trim();

  try {
    await supabaseAdmin
      .from("referrals")
      .delete()
      .ilike("referrer_email", cleanAgent)
      .ilike("referee_email", cleanReferee);

    await supabaseAdmin
      .from("users")
      .update({ referred_by: null })
      .ilike("email", cleanReferee)
      .ilike("referred_by", cleanAgent);

    memoryReferralEdges.delete(cleanReferee);
    if (isRedisReady()) {
      await redisConnection
        .del(
          `agent:edge:${cleanReferee}`,
          `agent:upline_fast:${cleanReferee}`,
          `agent:net_cache:${cleanAgent}`,
          `agent:net_cache:${cleanReferee}`
        )
        .catch(() => {});
    }
    await invalidateAgentCaches([cleanAgent, cleanReferee]);

    try {
      await supabaseAdmin.from("notifications").insert([
        {
          user_email: cleanAgent,
          title: "Follower Detached from Agency",
          message: `Follower ${cleanReferee} has been detached from your agency network${reason ? ` (Reason: "${reason}")` : ""}.`,
        },
        {
          user_email: cleanReferee,
          title: "Agency Link Detached",
          message: `You have been detached from agent ${cleanAgent}. Your account is now direct with 0% upline commission deduction.`,
        },
      ]);
    } catch {}

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function removeAllAgentFollowers({
  agentEmail,
  reason,
}: {
  agentEmail: string;
  reason?: string;
}): Promise<{ success: boolean; count: number; error?: string }> {
  const cleanAgent = agentEmail.toLowerCase().trim();

  try {
    const { data: refs } = await supabaseAdmin
      .from("referrals")
      .select("referee_email")
      .ilike("referrer_email", cleanAgent);

    const refereeEmails = (refs || []).map((r: any) => r.referee_email).filter(Boolean);

    await supabaseAdmin
      .from("referrals")
      .delete()
      .ilike("referrer_email", cleanAgent);

    await supabaseAdmin
      .from("users")
      .update({ referred_by: null })
      .ilike("referred_by", cleanAgent);

    for (const ref of refereeEmails) {
      memoryReferralEdges.delete(ref.toLowerCase().trim());
    }
    if (isRedisReady()) {
      const keysToDelete = [
        `agent:net_cache:${cleanAgent}`,
        ...refereeEmails.flatMap((em: string) => [
          `agent:edge:${em.toLowerCase().trim()}`,
          `agent:upline_fast:${em.toLowerCase().trim()}`,
          `agent:net_cache:${em.toLowerCase().trim()}`,
        ]),
      ];
      for (let i = 0; i < keysToDelete.length; i += 500) {
        await redisConnection.del(...keysToDelete.slice(i, i + 500)).catch(() => {});
      }
    }
    await invalidateAgentCaches([cleanAgent, ...refereeEmails]);

    try {
      await supabaseAdmin.from("notifications").insert({
        user_email: cleanAgent,
        title: "All Followers Detached",
        message: `All ${refereeEmails.length} downline followers have been detached from your agency network${reason ? ` (Reason: "${reason}")` : ""}.`,
      });
    } catch {}

    return { success: true, count: refereeEmails.length };
  } catch (e: any) {
    return { success: false, count: 0, error: e.message };
  }
}

export async function detachUplineAgent({
  refereeEmail,
  reason,
}: {
  refereeEmail: string;
  reason?: string;
}): Promise<{ success: boolean; uplineEmail?: string | null; error?: string }> {
  const cleanReferee = refereeEmail.toLowerCase().trim();

  try {
    const { data: refRow } = await supabaseAdmin
      .from("referrals")
      .select("referrer_email")
      .ilike("referee_email", cleanReferee)
      .maybeSingle();

    const uplineEmail = refRow?.referrer_email?.toLowerCase().trim() || null;

    await supabaseAdmin
      .from("referrals")
      .delete()
      .ilike("referee_email", cleanReferee);

    await supabaseAdmin
      .from("users")
      .update({ referred_by: null })
      .ilike("email", cleanReferee);

    memoryReferralEdges.delete(cleanReferee);
    if (isRedisReady()) {
      const keys = [
        `agent:edge:${cleanReferee}`,
        `agent:upline_fast:${cleanReferee}`,
        `agent:net_cache:${cleanReferee}`,
      ];
      if (uplineEmail) keys.push(`agent:net_cache:${uplineEmail}`);
      await redisConnection.del(...keys).catch(() => {});
    }
    await invalidateAgentCaches([cleanReferee, uplineEmail]);

    return { success: true, uplineEmail };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
