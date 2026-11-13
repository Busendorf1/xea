import crypto from "crypto";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import { OptOutStatusType, StoredReferralEdge } from "./agentTypes";
import {
  memoryAgentFlags,
  memoryCodeToEmail,
  memoryReferralEdges,
  invalidateAgentCaches,
} from "./agentCache";

export function generateDeterministicCode(email: string): string {
  const clean = email.toLowerCase().trim();
  const hash = crypto.createHash("sha256").update(`paayh_agent_code:${clean}`).digest("hex").toUpperCase();
  return `PA${hash.slice(0, 6)}`;
}

export async function ensureUserReferralCode(email: string): Promise<string> {
  const cleanEmail = email.toLowerCase().trim();
  const fallbackCode = generateDeterministicCode(cleanEmail);

  try {
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("referral_code")
      .ilike("email", cleanEmail)
      .maybeSingle();

    let finalCode = userRow?.referral_code ? String(userRow.referral_code).toUpperCase().trim() : "";

    if (!finalCode) {
      finalCode = fallbackCode;
      await supabaseAdmin
        .from("users")
        .update({ referral_code: finalCode })
        .ilike("email", cleanEmail);
    }

    memoryCodeToEmail.set(finalCode, cleanEmail);
    if (isRedisReady()) {
      await redisConnection.set(`agent:code:${finalCode}`, cleanEmail, "EX", 86400 * 90).catch(() => {});
    }

    return finalCode;
  } catch {
    memoryCodeToEmail.set(fallbackCode, cleanEmail);
    if (isRedisReady()) {
      await redisConnection.set(`agent:code:${fallbackCode}`, cleanEmail, "EX", 86400 * 90).catch(() => {});
    }
    return fallbackCode;
  }
}

export async function checkIsUserAgent(email: string): Promise<{
  isAgent: boolean;
  registeredAt: string | null;
  isBanned: boolean;
  bannedUntil: string | null;
  banReason: string | null;
}> {
  const cleanEmail = email.toLowerCase().trim();

  // 1. Check Redis for active agent ban
  if (isRedisReady()) {
    try {
      const banRaw = await redisConnection.get(`agent:ban:${cleanEmail}`);
      if (banRaw) {
        const banData = JSON.parse(banRaw);
        if (banData && banData.banned) {
          const banUntilMs = banData.bannedUntil ? new Date(banData.bannedUntil).getTime() : 0;
          if (banUntilMs > Date.now()) {
            return {
              isAgent: false,
              registeredAt: null,
              isBanned: true,
              bannedUntil: banData.bannedUntil,
              banReason: banData.reason || null,
            };
          }
        }
      }
    } catch {}
  }

  // 2. Check Redis for agent status
  if (isRedisReady()) {
    try {
      const raw = await redisConnection.get(`agent:status:${cleanEmail}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.isAgent === "boolean") {
          return {
            isAgent: parsed.isBanned ? false : parsed.isAgent,
            registeredAt: parsed.registeredAt || null,
            isBanned: Boolean(parsed.isBanned),
            bannedUntil: parsed.bannedUntil || null,
            banReason: parsed.banReason || null,
          };
        }
      }
    } catch {}
  }

  const mem = memoryAgentFlags.get(cleanEmail);
  if (mem) {
    const isBanned = Boolean(mem.isBanned && mem.bannedUntil && new Date(mem.bannedUntil).getTime() > Date.now());
    return {
      isAgent: isBanned ? false : mem.isAgent,
      registeredAt: mem.registeredAt,
      isBanned,
      bannedUntil: mem.bannedUntil || null,
      banReason: mem.banReason || null,
    };
  }

  try {
    let row: any = null;
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("is_agent, agent_registered_at, agent_banned_until, agent_ban_reason")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (!error && data) {
      row = data;
    } else {
      const fallback = await supabaseAdmin
        .from("users")
        .select("is_agent, agent_registered_at")
        .ilike("email", cleanEmail)
        .maybeSingle();
      if (!fallback.error && fallback.data) {
        row = fallback.data;
      }
    }

    if (row) {
      const isBanned = Boolean(row.agent_banned_until && new Date(row.agent_banned_until).getTime() > Date.now());
      const isAgent = isBanned ? false : Boolean(row.is_agent);
      const res = {
        isAgent,
        registeredAt: row.agent_registered_at || null,
        isBanned,
        bannedUntil: isBanned ? row.agent_banned_until : null,
        banReason: isBanned ? row.agent_ban_reason : null,
      };
      if (isRedisReady()) {
        await redisConnection.set(`agent:status:${cleanEmail}`, JSON.stringify(res), "EX", 3600).catch(() => {});
      }
      return res;
    }
  } catch {}

  return { isAgent: false, registeredAt: null, isBanned: false, bannedUntil: null, banReason: null };
}

export async function resolveReferrerEmailByCode(rawCode: string): Promise<string | null> {
  const code = rawCode.trim();
  if (!code || !/^[a-zA-Z0-9_.@-]{1,64}$/.test(code)) return null;
  const upperCode = code.toUpperCase();

  if (isRedisReady()) {
    try {
      const cachedEmail = await redisConnection.get(`agent:code:${upperCode}`);
      if (cachedEmail) return cachedEmail.toLowerCase().trim();
    } catch {}
  }

  if (memoryCodeToEmail.has(upperCode)) {
    return memoryCodeToEmail.get(upperCode)!;
  }

  try {
    const { data: byCode } = await supabaseAdmin
      .from("users")
      .select("email")
      .ilike("referral_code", upperCode)
      .maybeSingle();

    if (byCode?.email) {
      const resolved = byCode.email.toLowerCase().trim();
      if (isRedisReady()) {
        await redisConnection.set(`agent:code:${upperCode}`, resolved, "EX", 86400 * 30).catch(() => {});
      }
      return resolved;
    }
  } catch {}

  try {
    const cleanUser = code.toLowerCase().trim().replace(/^@/, "");
    // Strictly allow only safe handle characters so PostgREST filter injection or wildcards are impossible
    if (!/^[a-z0-9_.-]{1,64}$/.test(cleanUser)) {
      return null;
    }
    const escapedUser = cleanUser.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

    const { data: exactUser } = await supabaseAdmin
      .from("users")
      .select("email")
      .ilike("username", escapedUser)
      .limit(1)
      .maybeSingle();

    if (exactUser?.email) {
      const resolved = exactUser.email.toLowerCase().trim();
      if (isRedisReady()) {
        await redisConnection.set(`agent:code:${upperCode}`, resolved, "EX", 86400 * 30).catch(() => {});
      }
      return resolved;
    }

    const { data: domainHandleUser } = await supabaseAdmin
      .from("users")
      .select("email")
      .ilike("username", `${escapedUser}@%`)
      .limit(1)
      .maybeSingle();

    if (domainHandleUser?.email) {
      const resolved = domainHandleUser.email.toLowerCase().trim();
      if (isRedisReady()) {
        await redisConnection.set(`agent:code:${upperCode}`, resolved, "EX", 86400 * 30).catch(() => {});
      }
      return resolved;
    }
  } catch {}

  return null;
}

const l1AgencyToggleHistory = new Map<string, number[]>();

export async function checkAgencyStatusChangeRateLimit(email: string): Promise<{
  allowed: boolean;
  cooldownMessage?: string;
}> {
  const cleanEmail = email.toLowerCase().trim();
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const key = `agent:status_toggle_history:${cleanEmail}`;

  if (isRedisReady()) {
    try {
      await redisConnection.zremrangebyscore(key, 0, now - sevenDaysMs);
      const recentToggles = await redisConnection.zrangebyscore(key, now - sevenDaysMs, "+inf");
      if (recentToggles && recentToggles.length >= 2) {
        const oldestRecent = parseInt(recentToggles[0], 10);
        const msRemaining = Math.max(0, oldestRecent + sevenDaysMs - now);
        const hoursRemaining = Math.ceil(msRemaining / (60 * 60 * 1000));
        const daysRemaining = Math.floor(hoursRemaining / 24);
        const remHours = hoursRemaining % 24;
        const timeStr =
          daysRemaining > 0
            ? `${daysRemaining} day${daysRemaining > 1 ? "s" : ""} and ${remHours} hour${remHours !== 1 ? "s" : ""}`
            : `${hoursRemaining} hour${hoursRemaining !== 1 ? "s" : ""}`;
        return {
          allowed: false,
          cooldownMessage: `Rate limit reached: You can only opt out or become an agent at most twice a week (2 times per 7 days). Please wait ${timeStr} before changing your agency status again.`,
        };
      }
    } catch {}
  } else {
    const memList = (l1AgencyToggleHistory.get(cleanEmail) || []).filter((t) => t > now - sevenDaysMs);
    l1AgencyToggleHistory.set(cleanEmail, memList);
    if (memList.length >= 2) {
      const oldestRecent = memList[0];
      const msRemaining = Math.max(0, oldestRecent + sevenDaysMs - now);
      const hoursRemaining = Math.ceil(msRemaining / (60 * 60 * 1000));
      return {
        allowed: false,
        cooldownMessage: `Rate limit reached: You can only opt out or become an agent at most twice a week (2 times per 7 days). Please wait ${hoursRemaining} hours before changing your agency status again.`,
      };
    }
  }
  return { allowed: true };
}

export async function recordAgencyStatusChange(email: string): Promise<void> {
  const cleanEmail = email.toLowerCase().trim();
  const now = Date.now();
  const key = `agent:status_toggle_history:${cleanEmail}`;
  if (isRedisReady()) {
    try {
      await redisConnection.zadd(key, now, String(now));
      await redisConnection.expire(key, 7 * 24 * 60 * 60 + 3600);
    } catch {}
  }
  const memList = (l1AgencyToggleHistory.get(cleanEmail) || []).filter((t) => t > now - 7 * 24 * 60 * 60 * 1000);
  memList.push(now);
  l1AgencyToggleHistory.set(cleanEmail, memList);
}

export async function registerUserAsAgent(email: string): Promise<{
  success: boolean;
  referralCode: string;
  registeredAt: string;
  error?: string;
}> {
  const cleanEmail = email.toLowerCase().trim();
  const banStatus = await checkIsUserAgent(cleanEmail);
  if (banStatus.isBanned) {
    return {
      success: false,
      referralCode: "",
      registeredAt: "",
      error: `Agency privileges are currently suspended${banStatus.bannedUntil ? ` until ${new Date(banStatus.bannedUntil).toLocaleDateString()}` : ""}${banStatus.banReason ? ` (Reason: ${banStatus.banReason})` : ""}.`,
    };
  }
  const effectiveRegisteredAt =
    banStatus.isAgent && banStatus.registeredAt ? banStatus.registeredAt : new Date().toISOString();
  const referralCode = await ensureUserReferralCode(cleanEmail);

  try {
    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update({
        is_agent: true,
        agent_registered_at: effectiveRegisteredAt,
        referral_code: referralCode,
      })
      .ilike("email", cleanEmail);

    if (updateErr) {
      console.error("❌ Failed to persist agent registration in database:", updateErr.message);
      return {
        success: false,
        referralCode: "",
        registeredAt: "",
        error: "Failed to save agent status. Please try again later.",
      };
    }
  } catch (dbEx: any) {
    console.error("❌ Database exception during agent registration:", dbEx?.message || dbEx);
    return {
      success: false,
      referralCode: "",
      registeredAt: "",
      error: "Failed to save agent status. Please try again later.",
    };
  }

  memoryAgentFlags.set(cleanEmail, { isAgent: true, registeredAt: effectiveRegisteredAt });
  if (isRedisReady()) {
    await redisConnection
      .set(
        `agent:status:${cleanEmail}`,
        JSON.stringify({ isAgent: true, registeredAt: effectiveRegisteredAt }),
        "EX",
        86400 * 365
      )
      .catch(() => {});
  }

  let uplineEmail: string | null = null;
  try {
    const { data: refRow } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .ilike("referee_email", cleanEmail)
      .maybeSingle();

    const optOut = refRow ? resolveOptOutFromDbRow(refRow) : "none";
    if (
      refRow &&
      refRow.status !== "opted_out" &&
      optOut !== "accepted" &&
      optOut !== "forced"
    ) {
      uplineEmail = refRow.referrer_email?.toLowerCase().trim() || null;
      await supabaseAdmin.from("referrals").update({ commission_rate: 0.02 }).eq("id", refRow.id);
    }
  } catch {}

  const memEdge = memoryReferralEdges.get(cleanEmail);
  if (memEdge && memEdge.optOutStatus !== "accepted" && memEdge.optOutStatus !== "forced") {
    memEdge.commissionRate = 0.02;
    uplineEmail = uplineEmail || memEdge.referrerEmail;
  }

  if (isRedisReady()) {
    try {
      const rawEdge = await redisConnection.get(`agent:edge:${cleanEmail}`);
      if (rawEdge) {
        const edge: StoredReferralEdge = JSON.parse(rawEdge);
        if (edge.optOutStatus !== "accepted" && edge.optOutStatus !== "forced") {
          edge.commissionRate = 0.02;
          uplineEmail = uplineEmail || edge.referrerEmail;
          await redisConnection.set(`agent:edge:${cleanEmail}`, JSON.stringify(edge), "EX", 86400 * 365);
        }
      }
    } catch {}
  }

  if (uplineEmail && uplineEmail !== cleanEmail) {
    try {
      const { data: refereeUser } = await supabaseAdmin
        .from("users")
        .select("username, firstName, lastName, business_name")
        .ilike("email", cleanEmail)
        .maybeSingle();

      const refereeDisplayName = refereeUser?.username
        ? `@${refereeUser.username.replace(/^@/, "")}`
        : refereeUser?.business_name ||
          `${refereeUser?.firstName || ""} ${refereeUser?.lastName || ""}`.trim() ||
          cleanEmail;

      await supabaseAdmin.from("notifications").insert({
        user_email: uplineEmail,
        title: "Network Member Became an Agent (2% Commission Activated)",
        message: `${refereeDisplayName} in your network has registered as an Agent. Your commission on their personal ad earnings has increased from 1% to 2%. Whenever they view ads and earn, you will now receive 2% of their earnings (up from 1%).`,
      });
    } catch (notifErr) {
      console.warn("⚠️ Error creating agent upgrade notification:", notifErr);
    }
  }

  await invalidateAgentCaches([cleanEmail, uplineEmail]);
  await invalidateCachedProfile(cleanEmail).catch(() => {});

  return {
    success: true,
    referralCode,
    registeredAt: effectiveRegisteredAt,
  };
}

export function resolveOptOutFromDbRow(row: any): OptOutStatusType {
  const rawOpt = String(row?.opt_out_status || "").toLowerCase().trim();
  const rawStatus = String(row?.status || "").toLowerCase().trim();
  const reqBy = String(row?.opt_out_requested_by || "").toLowerCase().trim();
  if (row?.is_opted_out === true || rawStatus === "opted_out" || rawOpt === "accepted") return "accepted";
  if (rawOpt === "forced") return "forced";
  if (rawStatus === "req_remove" || rawOpt === "agent_requested" || (rawStatus === "opt_out_requested" && reqBy === "agent")) {
    return "agent_requested";
  }
  if (
    rawStatus === "req_unfollow" ||
    rawOpt === "requested" ||
    rawStatus === "opt_out_requested" ||
    rawStatus === "requested"
  ) {
    return "requested";
  }
  if (rawStatus === "rej_unfollow" || rawOpt === "rejected") return "rejected";
  return "none";
}

export function mapOptOutToDbStatus(optOut: OptOutStatusType): string {
  switch (optOut) {
    case "requested":
      return "req_unfollow";
    case "agent_requested":
      return "req_remove";
    case "rejected":
      return "rej_unfollow";
    case "accepted":
    case "forced":
      return "opted_out";
    default:
      return "qualified";
  }
}

export async function updateReferralOptOutInDb(
  filter: { refereeEmail: string; referrerEmail?: string },
  optOutStatus: OptOutStatusType,
  optOutRequestedAt: string | null
) {
  const dbStatus = mapOptOutToDbStatus(optOutStatus);
  const isOptedOut = optOutStatus === "accepted" || optOutStatus === "forced";
  const cleanReferee = filter.refereeEmail.toLowerCase().trim();
  const cleanReferrer = filter.referrerEmail ? filter.referrerEmail.toLowerCase().trim() : undefined;

  try {
    let q1 = supabaseAdmin
      .from("referrals")
      .update({
        status: dbStatus,
        opt_out_status: optOutStatus,
        opt_out_requested_at: optOutRequestedAt,
        is_opted_out: isOptedOut,
      })
      .ilike("referee_email", cleanReferee);
    if (cleanReferrer) {
      q1 = q1.ilike("referrer_email", cleanReferrer);
    }
    const { error } = await q1;
    if (error) {
      let q2 = supabaseAdmin
        .from("referrals")
        .update({ status: dbStatus })
        .ilike("referee_email", cleanReferee);
      if (cleanReferrer) {
        q2 = q2.ilike("referrer_email", cleanReferrer);
      }
      await q2;
    }
  } catch {}
}

export async function setAgentBan({
  email,
  banType,
  bannedUntil,
  reason,
}: {
  email: string;
  banType: "temp" | "perm" | "unban";
  bannedUntil?: string | null;
  reason?: string;
}): Promise<void> {
  const cleanEmail = email.toLowerCase().trim();

  if (banType === "unban") {
    memoryAgentFlags.set(cleanEmail, {
      isAgent: false,
      registeredAt: null,
      isBanned: false,
      bannedUntil: null,
      banReason: null,
    });
    if (isRedisReady()) {
      await redisConnection.del(`agent:ban:${cleanEmail}`).catch(() => {});
      await redisConnection
        .set(
          `agent:status:${cleanEmail}`,
          JSON.stringify({ isAgent: false, registeredAt: null, isBanned: false }),
          "EX",
          86400 * 365
        )
        .catch(() => {});
      await redisConnection.del(`agent:network:${cleanEmail}`).catch(() => {});
    }
    try {
      await supabaseAdmin
        .from("users")
        .update({
          agent_banned_until: null,
          agent_ban_reason: null,
          agent_banned_at: null,
        })
        .ilike("email", cleanEmail);

      await supabaseAdmin.from("notifications").insert({
        user_email: cleanEmail,
        title: "Agency Privileges Restored",
        message: "Your platform agency privileges have been reinstated. You are eligible to earn referral commissions again.",
      });
    } catch {}
    await invalidateAgentCaches([cleanEmail]);
    return;
  }

  const banPayload = {
    banned: true,
    bannedUntil: bannedUntil || (banType === "perm" ? "2099-12-31T23:59:59.000Z" : null),
    reason: reason || "Administrative sanction for agency policy violation or complaint",
    banType,
    bannedAt: new Date().toISOString(),
  };

  memoryAgentFlags.set(cleanEmail, {
    isAgent: false,
    registeredAt: null,
    isBanned: true,
    bannedUntil: banPayload.bannedUntil,
    banReason: banPayload.reason,
  });

  if (isRedisReady()) {
    await redisConnection
      .set(`agent:ban:${cleanEmail}`, JSON.stringify(banPayload), "EX", 86400 * 365)
      .catch(() => {});
    await redisConnection
      .set(
        `agent:status:${cleanEmail}`,
        JSON.stringify({
          isAgent: false,
          registeredAt: null,
          isBanned: true,
          bannedUntil: banPayload.bannedUntil,
          banReason: banPayload.reason,
        }),
        "EX",
        86400 * 365
      )
      .catch(() => {});
    await redisConnection.del(`agent:network:${cleanEmail}`).catch(() => {});
  }

  try {
    await supabaseAdmin
      .from("users")
      .update({
        is_agent: false,
        agent_registered_at: null,
        agent_banned_until: banPayload.bannedUntil,
        agent_ban_reason: banPayload.reason,
        agent_banned_at: banPayload.bannedAt,
      })
      .ilike("email", cleanEmail);

    await supabaseAdmin.from("notifications").insert({
      user_email: cleanEmail,
      title: "Agency Privileges Restricted",
      message: `Your platform agency privileges have been ${banType === "perm" ? "permanently restricted" : "temporarily suspended"}. Reason: "${banPayload.reason}".`,
    });
  } catch {}

  await invalidateAgentCaches([cleanEmail]);
}
