import crypto from "crypto";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { decryptProfilePII } from "@/lib/security/piiCrypto";
import type { AdvertiserProfileData } from "@/components/ui/AdvertiserHoverCard";
import {
  AgentNetworkPayload,
  AgentNetworkQueryOptions,
  DownlineInviteItem,
  MutualUserItem,
  StoredReferralEdge,
  UplineAgentInfo,
} from "./agentTypes";
import {
  memoryAgentFlags,
  memoryReferralEdges,
  l1NetworkCache,
  invalidateAgentCaches,
} from "./agentCache";
import {
  resolveReferrerEmailByCode,
  checkIsUserAgent,
  ensureUserReferralCode,
  resolveOptOutFromDbRow,
} from "./agentCore";

const SAFE_EMAIL_FOR_OR_FILTER = /^[^\s@,'"%()]+@[^\s@,'"%()]+$/;

export async function bindUserToAgentByCode({
  refereeEmail,
  referralCode,
  ipAddress,
}: {
  refereeEmail: string;
  referralCode: string;
  ipAddress?: string;
}): Promise<{ success: boolean; referrerEmail?: string; error?: string }> {
  const cleanReferee = refereeEmail.toLowerCase().trim();
  const cleanCode = referralCode.trim();
  if (!cleanReferee || !cleanCode) {
    return { success: false, error: "Missing parameters." };
  }

  const referrerEmail = await resolveReferrerEmailByCode(cleanCode);
  if (!referrerEmail) {
    return { success: false, error: "Invalid referral code." };
  }

  if (referrerEmail === cleanReferee) {
    return { success: false, error: "You cannot refer your own account." };
  }

  // Block banned/revoked referrers while allowing active regular users & agents to invite followers
  const referrerStatus = await checkIsUserAgent(referrerEmail);
  if (referrerStatus.isBanned) {
    return { success: false, error: "This referral link is currently unavailable." };
  }

  try {
    const { data: existingRef } = await supabaseAdmin
      .from("referrals")
      .select("id, referrer_email, status, opt_out_status, is_opted_out")
      .ilike("referee_email", cleanReferee)
      .maybeSingle();

    if (
      existingRef &&
      existingRef.is_opted_out !== true &&
      existingRef.status !== "opted_out" &&
      existingRef.opt_out_status !== "accepted" &&
      existingRef.opt_out_status !== "forced"
    ) {
      return {
        success: true,
        referrerEmail: String(existingRef.referrer_email || "").toLowerCase().trim(),
      };
    }
  } catch {}

  const { isAgent: isRefereeAlreadyAgent } = await checkIsUserAgent(cleanReferee);
  const initialRate = isRefereeAlreadyAgent ? 0.02 : 0.01;
  const nowIso = new Date().toISOString();
  const deviceHash = `web_${crypto.createHash("sha256").update(cleanReferee).digest("hex").slice(0, 20)}`;

  try {
    const { error: upsertErr } = await supabaseAdmin.from("referrals").upsert(
      {
        referrer_email: referrerEmail,
        referee_email: cleanReferee,
        device_hash: deviceHash,
        ip_address: ipAddress || null,
        status: "qualified",
        interactions_count: 5,
        commission_rate: initialRate,
        total_commission_earned: 0.0,
        is_opted_out: false,
        opt_out_status: "none",
        opt_out_requested_at: null,
        created_at: nowIso,
        qualified_at: nowIso,
      },
      { onConflict: "referee_email" }
    );

    if (upsertErr) {
      await supabaseAdmin.from("referrals").upsert(
        {
          referrer_email: referrerEmail,
          referee_email: cleanReferee,
          device_hash: deviceHash,
          ip_address: ipAddress || null,
          status: "qualified",
          interactions_count: 5,
        },
        { onConflict: "referee_email" }
      );
    }
  } catch {}

  try {
    await supabaseAdmin.from("users").update({ referred_by: referrerEmail }).ilike("email", cleanReferee);
  } catch {}

  const edge: StoredReferralEdge = {
    referrerEmail,
    refereeEmail: cleanReferee,
    commissionRate: initialRate,
    totalCommissionEarned: 0,
    optOutStatus: "none",
    optOutRequestedAt: null,
    createdAt: nowIso,
  };
  memoryReferralEdges.set(cleanReferee, edge);

  if (isRedisReady()) {
    await Promise.all([
      redisConnection.set(`agent:edge:${cleanReferee}`, JSON.stringify(edge), "EX", 86400 * 365).catch(() => {}),
      redisConnection.sadd(`agent:downline:${referrerEmail}`, cleanReferee).catch(() => {}),
    ]);
  }

  // Notify upline agent of new follower joined
  try {
    const { data: refUser } = await supabaseAdmin
      .from("users")
      .select("username, firstName, lastName")
      .ilike("email", cleanReferee)
      .maybeSingle();
    const displayName = refUser?.username
      ? `@${refUser.username.replace(/^@/, "")}`
      : `${refUser?.firstName || ""} ${refUser?.lastName || ""}`.trim() || cleanReferee;

    await supabaseAdmin.from("notifications").insert({
      user_email: referrerEmail,
      title: "New Follower Joined Your Network",
      message: `${displayName} has joined using your referral code. You will earn ${Math.round(initialRate * 100)}% commission on their qualified ad earnings.`,
    });
  } catch (notifErr) {
    console.warn("⚠️ Failed to send new follower notification:", notifErr);
  }

  await invalidateAgentCaches([cleanReferee, referrerEmail]);

  return { success: true, referrerEmail };
}

/**
 * Batch fetches user display profiles and AdvertiserHoverCard metadata without exposing raw email
 */
export async function fetchUserDisplayMap(emails: string[]): Promise<
  Record<
    string,
    {
      username: string;
      displayName: string;
      profileImage: string | null;
      profile: AdvertiserProfileData;
      isAgent: boolean;
      missing?: boolean;
    }
  >
> {
  const result: Record<
    string,
    {
      username: string;
      displayName: string;
      profileImage: string | null;
      profile: AdvertiserProfileData;
      isAgent: boolean;
      /** True only when the DB lookup succeeded and no account exists (deleted user). */
      missing?: boolean;
    }
  > = {};
  let dbLookupSucceeded = false;

  const uniqueEmails = Array.from(new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean)));
  if (uniqueEmails.length === 0) return result;

  const redisAgentFlagMap = new Map<string, boolean>();
  if (isRedisReady()) {
    try {
      const rawStatuses = await redisConnection.mget(uniqueEmails.map((e) => `agent:status:${e}`));
      uniqueEmails.forEach((e, idx) => {
        const raw = rawStatuses[idx];
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (typeof parsed?.isAgent === "boolean") {
              redisAgentFlagMap.set(e, parsed.isAgent);
            }
          } catch {}
        }
      });
    } catch {}
  }

  try {
    const selectCols =
      'email, username, "firstName", "lastName", business_name, "profileImage", bio, location, country, monetized, monetization_clicks, created_at, gender, is_agent, is_career, is_affiliate, affiliate_role';
    const { data: rows, error } = await supabaseAdmin.from("users").select(selectCols).in("email", uniqueEmails);

    if (!error && Array.isArray(rows)) dbLookupSucceeded = true;
    const baseRows =
      !error && Array.isArray(rows)
        ? [...rows]
        : (
            await supabaseAdmin
              .from("users")
              .select(selectCols)
              .in("email", uniqueEmails)
          ).data || [];

    const matchedLower = new Set(
      (baseRows as any[]).map((row) => String(row?.email || "").toLowerCase().trim()).filter(Boolean)
    );
    const missingEmails = uniqueEmails.filter(
      (e) => !matchedLower.has(e) && SAFE_EMAIL_FOR_OR_FILTER.test(e)
    );
    const finalRows: any[] = [...(baseRows as any[])];

    // Case-insensitive fallback if any users.email in Postgres is stored with mixed casing
    if (missingEmails.length > 0) {
      for (let i = 0; i < missingEmails.length; i += 40) {
        const batch = missingEmails.slice(i, i + 40);
        const orFilter = batch.map((e) => `email.ilike.${e}`).join(",");
        try {
          const { data: ilikeRows } = await supabaseAdmin.from("users").select(selectCols).or(orFilter);
          if (Array.isArray(ilikeRows)) {
            finalRows.push(...ilikeRows);
          }
        } catch {}
      }
    }

    // Check bounded deactivated_users set so deactivated accounts never surface in follower lists
    const deactivatedSet = new Set<string>();
    try {
      const { data: deactRows } = await supabaseAdmin
        .from("deactivated_users")
        .select("email")
        .in("email", uniqueEmails);
      if (Array.isArray(deactRows)) {
        for (const d of deactRows) {
          const de = String(d?.email || "").toLowerCase().trim();
          if (de) deactivatedSet.add(de);
        }
      }
    } catch {}

    for (const rawRow of finalRows as any[]) {
      const r = decryptProfilePII(rawRow) || rawRow;
      const e = String(r.email || "").toLowerCase().trim();
      if (!e || deactivatedSet.has(e)) continue;
      const cleanHandle = String(r.username || e)
        .split("@")[0]
        .replace(/^@/, "")
        .trim();
      const fullName =
        r.business_name && String(r.business_name).trim()
          ? String(r.business_name).trim()
          : `${r.firstName || ""} ${r.lastName || ""}`.trim() || cleanHandle;
      const isAgentFlag =
        typeof r.is_agent === "boolean" && r.is_agent
          ? true
          : redisAgentFlagMap.has(e)
          ? Boolean(redisAgentFlagMap.get(e))
          : Boolean(memoryAgentFlags.get(e)?.isAgent);
      const isMonetized =
        r.monetized === true ||
        r.monetized === "true" ||
        r.monetized === "yes" ||
        r.monetized === "1" ||
        Number(r.monetization_clicks || 0) >= 300;

      result[e] = {
        username: cleanHandle,
        displayName: fullName,
        profileImage: r.profileImage || null,
        isAgent: isAgentFlag,
        profile: {
          business_name: r.business_name || undefined,
          firstName: r.firstName || undefined,
          lastName: r.lastName || undefined,
          username: cleanHandle,
          profileImage: r.profileImage || undefined,
          bio: r.bio || undefined,
          location: r.location && r.location !== "PLACEHOLDER" ? r.location : undefined,
          country: r.country && r.country !== "PLACEHOLDER" ? r.country : undefined,
          monetized: isMonetized,
          created_at: r.created_at || undefined,
          gender: r.gender || null,
          is_career: Boolean(r.is_career),
          is_affiliate: Boolean(r.is_affiliate),
          affiliate_role: r.affiliate_role || null,
        },
      };
    }
  } catch {}

  for (const e of uniqueEmails) {
    if (!result[e]) {
      const fallbackName = e.split("@")[0];
      result[e] = {
        username: fallbackName,
        displayName: fallbackName,
        profileImage: null,
        missing: dbLookupSucceeded,
        isAgent: Boolean(memoryAgentFlags.get(e)?.isAgent),
        profile: {
          username: fallbackName,
          firstName: fallbackName,
        },
      };
    }
  }

  return result;
}

export function encodeInviteCursor(createdAt: string, refereeEmail: string): string {
  return `${createdAt}::${refereeEmail.toLowerCase().trim()}`;
}

export function decodeInviteCursor(
  cursor?: string | null
): { createdAt: string; refereeEmail: string } | null {
  if (!cursor || typeof cursor !== "string") return null;
  const idx = cursor.indexOf("::");
  if (idx <= 0) return null;
  const createdAt = cursor.slice(0, idx).trim();
  const refereeEmail = cursor.slice(idx + 2).toLowerCase().trim();
  if (
    !createdAt ||
    !refereeEmail ||
    Number.isNaN(Date.parse(createdAt)) ||
    !SAFE_EMAIL_FOR_OR_FILTER.test(refereeEmail)
  ) {
    return null;
  }
  return { createdAt, refereeEmail };
}

export async function getAgentNetworkData(
  email: string,
  bypassCacheOrOptions: boolean | AgentNetworkQueryOptions = false
): Promise<AgentNetworkPayload> {
  const cleanEmail = email.toLowerCase().trim();
  const now = Date.now();
  const opts: AgentNetworkQueryOptions =
    typeof bypassCacheOrOptions === "boolean"
      ? { bypassCache: bypassCacheOrOptions }
      : bypassCacheOrOptions || {};
  const bypassCache = Boolean(opts.bypassCache);
  const decodedCursor = decodeInviteCursor(opts.cursor);
  const pageLimit = Math.max(1, Math.min(100, Number(opts.limit) || 50));

  if (!bypassCache && !decodedCursor) {
    const l1 = l1NetworkCache.get(cleanEmail);
    if (l1 && l1.expiresAt > now) {
      return l1.data;
    }
    if (isRedisReady()) {
      try {
        const cachedRaw = await redisConnection.get(`agent:net_cache:${cleanEmail}`);
        if (cachedRaw) {
          const parsed: AgentNetworkPayload = JSON.parse(cachedRaw);
          l1NetworkCache.set(cleanEmail, { data: parsed, expiresAt: now + 15000 });
          return parsed;
        }
      } catch {}
    }
  }

  const [referralCode, agentStatus] = await Promise.all([
    ensureUserReferralCode(cleanEmail),
    checkIsUserAgent(cleanEmail),
  ]);

  const downlineMap = new Map<string, StoredReferralEdge>();
  let uplineEdge: StoredReferralEdge | null = null;

  let downlineQuery = supabaseAdmin
    .from("referrals")
    .select("*")
    .ilike("referrer_email", cleanEmail)
    .neq("status", "opted_out");

  if (decodedCursor) {
    downlineQuery = downlineQuery.or(
      `created_at.lt.${decodedCursor.createdAt},and(created_at.eq.${decodedCursor.createdAt},referee_email.lt.${decodedCursor.refereeEmail})`
    );
  }

  const [dlRes, upRes, userMutualRes] = await Promise.all([
    downlineQuery
      .order("created_at", { ascending: false })
      .order("referee_email", { ascending: false })
      .limit(pageLimit + 1),
    supabaseAdmin.from("referrals").select("*").ilike("referee_email", cleanEmail).maybeSingle(),
    supabaseAdmin
      .from("users")
      .select("mutual_count, mutuals, agent_invites_count, agent_total_earned")
      .ilike("email", cleanEmail)
      .maybeSingle(),
  ]);

  const rawMutualEmails: string[] = Array.isArray(userMutualRes.data?.mutuals)
    ? Array.from(
        new Set(
          (userMutualRes.data.mutuals as string[])
            .map((m) => String(m || "").toLowerCase().trim())
            .filter(Boolean)
        )
      )
    : [];

  const allFetchedRows = !dlRes.error && Array.isArray(dlRes.data) ? dlRes.data : [];
  const hasMoreInvites = allFetchedRows.length > pageLimit;
  const pageRows = hasMoreInvites ? allFetchedRows.slice(0, pageLimit) : allFetchedRows;
  const lastRawRow = pageRows.length > 0 ? pageRows[pageRows.length - 1] : null;
  const nextCursor =
    hasMoreInvites && lastRawRow?.created_at && lastRawRow?.referee_email
      ? encodeInviteCursor(String(lastRawRow.created_at), String(lastRawRow.referee_email))
      : null;

  for (const row of pageRows) {
    const refEmail = String(row.referee_email || "").toLowerCase().trim();
    if (!refEmail || refEmail === cleanEmail) continue;
    const status = String(row.status || "active").toLowerCase().trim();
    const optOut = resolveOptOutFromDbRow(row);
    if (row.is_opted_out === true || status === "opted_out" || optOut === "accepted" || optOut === "forced") {
      continue;
    }

    downlineMap.set(refEmail, {
      referrerEmail: cleanEmail,
      refereeEmail: refEmail,
      commissionRate: Number(row.commission_rate) || 0.01,
      totalCommissionEarned: Number(row.total_commission_earned) || 0,
      optOutStatus: optOut,
      optOutRequestedAt: row.opt_out_requested_at || null,
      createdAt: row.created_at || new Date().toISOString(),
    });
  }

  if (upRes.data) {
    const upRow = upRes.data;
    const upRefEmail = String(upRow.referrer_email || "").toLowerCase().trim();
    const status = String(upRow.status || "active").toLowerCase().trim();
    const optOut = resolveOptOutFromDbRow(upRow);
    if (
      upRefEmail &&
      upRefEmail !== cleanEmail &&
      upRow.is_opted_out !== true &&
      status !== "opted_out" &&
      optOut !== "accepted" &&
      optOut !== "forced"
    ) {
      uplineEdge = {
        referrerEmail: upRefEmail,
        refereeEmail: cleanEmail,
        commissionRate: Number(upRow.commission_rate) || (agentStatus.isAgent ? 0.02 : 0.01),
        totalCommissionEarned: Number(upRow.total_commission_earned) || 0,
        optOutStatus: optOut,
        optOutRequestedAt: upRow.opt_out_requested_at || null,
        createdAt: upRow.created_at || new Date().toISOString(),
      };
    }
  }

  // Merge in-memory edges on page 1 so local / serverless workers immediately reflect recent state changes
  if (!decodedCursor) {
    for (const [refKey, memEdge] of memoryReferralEdges.entries()) {
      if (memEdge.referrerEmail === cleanEmail) {
        if (memEdge.optOutStatus === "accepted" || memEdge.optOutStatus === "forced") {
          downlineMap.delete(refKey);
        } else {
          const existing = downlineMap.get(refKey);
          if (existing) {
            downlineMap.set(refKey, {
              ...existing,
              optOutStatus: memEdge.optOutStatus,
              optOutRequestedAt: memEdge.optOutRequestedAt,
              totalCommissionEarned: Math.max(
                existing.totalCommissionEarned || 0,
                memEdge.totalCommissionEarned || 0
              ),
            });
          } else {
            downlineMap.set(refKey, memEdge);
          }
        }
      }
    }
  }

  const memUp = memoryReferralEdges.get(cleanEmail);
  if (memUp) {
    if (memUp.optOutStatus === "accepted" || memUp.optOutStatus === "forced") {
      uplineEdge = null;
    } else if (uplineEdge) {
      uplineEdge = {
        ...uplineEdge,
        optOutStatus: memUp.optOutStatus,
        optOutRequestedAt: memUp.optOutRequestedAt,
        totalCommissionEarned: Math.max(
          uplineEdge.totalCommissionEarned || 0,
          memUp.totalCommissionEarned || 0
        ),
      };
    } else {
      uplineEdge = memUp;
    }
  }

  // Bounded O(page_size) Redis edge lookup (no unbounded smembers/mget on 100k+ invite graphs)
  if (isRedisReady()) {
    try {
      const pageEmails = Array.from(downlineMap.keys());
      const [rawEdges, rawUp] = await Promise.all([
        pageEmails.length > 0
          ? redisConnection.mget(pageEmails.map((m) => `agent:edge:${m}`)).catch(() => [])
          : Promise.resolve([]),
        redisConnection.get(`agent:edge:${cleanEmail}`).catch(() => null),
      ]);

      for (const raw of rawEdges || []) {
        if (!raw) continue;
        const parsed: StoredReferralEdge = JSON.parse(raw);
        if (parsed.referrerEmail === cleanEmail && downlineMap.has(parsed.refereeEmail)) {
          if (parsed.optOutStatus === "accepted" || parsed.optOutStatus === "forced") {
            downlineMap.delete(parsed.refereeEmail);
          } else {
            const existing = downlineMap.get(parsed.refereeEmail);
            downlineMap.set(parsed.refereeEmail, {
              ...parsed,
              totalCommissionEarned: Math.max(
                existing?.totalCommissionEarned || 0,
                parsed.totalCommissionEarned || 0
              ),
            });
          }
        }
      }

      if (rawUp) {
        const parsedUp: StoredReferralEdge = JSON.parse(rawUp);
        if (parsedUp.optOutStatus === "accepted" || parsedUp.optOutStatus === "forced") {
          uplineEdge = null;
        } else {
          uplineEdge = {
            ...parsedUp,
            totalCommissionEarned: Math.max(
              uplineEdge?.totalCommissionEarned || 0,
              parsedUp.totalCommissionEarned || 0
            ),
          };
        }
      }
    } catch {}
  }

  const emailsToLookup = Array.from(downlineMap.keys());
  if (uplineEdge?.referrerEmail) {
    emailsToLookup.push(uplineEdge.referrerEmail);
  }
  for (const mEmail of rawMutualEmails) {
    emailsToLookup.push(mEmail);
  }
  const profileMap = await fetchUserDisplayMap(emailsToLookup);

  const invites: DownlineInviteItem[] = [];
  let totalAgentEarned = 0;
  let pendingOptOutRequestsCount = 0;

  const staleDownlineEmails: string[] = [];

  for (const [refEmail, edge] of downlineMap.entries()) {
    // Deleted or deactivated accounts must never appear as followers, even if a stale cache edge survives
    if (profileMap[refEmail]?.missing) {
      staleDownlineEmails.push(refEmail);
      continue;
    }
    const prof = profileMap[refEmail] || {
      username: refEmail.split("@")[0],
      displayName: refEmail.split("@")[0],
      profileImage: null,
      isAgent: false,
      profile: { username: refEmail.split("@")[0] },
    };
    const isRefAgent = prof.isAgent || edge.commissionRate >= 0.02;
    const ratePct = isRefAgent ? 2 : 1;
    const earned = Math.round((edge.totalCommissionEarned || 0) * 100) / 100;
    totalAgentEarned = Math.round((totalAgentEarned + earned) * 100) / 100;

    if (edge.optOutStatus === "requested") {
      pendingOptOutRequestsCount += 1;
    }

    invites.push({
      id: prof.username,
      refereeKey: refEmail,
      email: refEmail,
      refereeEmail: refEmail,
      username: prof.username,
      displayName: prof.displayName,
      profileImage: prof.profileImage,
      profile: prof.profile,
      isAgent: isRefAgent,
      commissionRatePct: ratePct,
      earnedFromUser: earned,
      optOutStatus: edge.optOutStatus,
      optOutRequestedAt: edge.optOutRequestedAt,
      joinedAt: edge.createdAt,
    });
  }

  // Self-heal stale downline Redis set entries so deleted/deactivated accounts stop resurfacing
  if (isRedisReady() && staleDownlineEmails.length > 0) {
    redisConnection.srem(`agent:downline:${cleanEmail}`, ...staleDownlineEmails).catch(() => {});
  }

  let uplineAgent: UplineAgentInfo | null = null;
  if (uplineEdge && uplineEdge.referrerEmail && !profileMap[uplineEdge.referrerEmail]?.missing) {
    const upProf = profileMap[uplineEdge.referrerEmail] || {
      username: uplineEdge.referrerEmail.split("@")[0],
      displayName: uplineEdge.referrerEmail.split("@")[0],
      profileImage: null,
      isAgent: true,
      profile: { username: uplineEdge.referrerEmail.split("@")[0] },
    };
    const deductionPct = agentStatus.isAgent ? 2 : 1;
    if (uplineEdge.optOutStatus === "agent_requested") {
      pendingOptOutRequestsCount += 1;
    }
    uplineAgent = {
      username: upProf.username,
      displayName: upProf.displayName,
      email: uplineEdge.referrerEmail,
      referrerEmail: uplineEdge.referrerEmail,
      profileImage: upProf.profileImage,
      profile: upProf.profile,
      isRefereeAgent: agentStatus.isAgent,
      deductionRatePct: deductionPct,
      totalGainedFromMe: Math.round((uplineEdge.totalCommissionEarned || 0) * 100) / 100,
      optOutStatus: uplineEdge.optOutStatus,
      optOutRequestedAt: uplineEdge.optOutRequestedAt,
      joinedAt: uplineEdge.createdAt,
    };
  }

  const liveMutualEmails = rawMutualEmails.filter((mEmail) => !profileMap[mEmail]?.missing);
  const mutuals: MutualUserItem[] = liveMutualEmails.map((mEmail) => {
    const mProf = profileMap[mEmail] || {
      username: mEmail.split("@")[0],
      displayName: mEmail.split("@")[0],
      profileImage: null,
      isAgent: false,
      profile: { username: mEmail.split("@")[0] },
    };
    return {
      id: mProf.username,
      username: mProf.username,
      displayName: mProf.displayName,
      profileImage: mProf.profileImage,
      profile: mProf.profile,
    };
  });

  // If any mutual was a deleted account, trust the filtered live list over the stored counter
  const mutualsCount =
    liveMutualEmails.length < rawMutualEmails.length
      ? mutuals.length
      : Math.max(Number(userMutualRes.data?.mutual_count || 0), mutuals.length);

  // Use pre-aggregated counters for O(1) scale when paginated; on single-page lists match live visible invites
  const preAggregatedInvites = Number(userMutualRes.data?.agent_invites_count || 0);
  const preAggregatedEarned = Math.round(Number(userMutualRes.data?.agent_total_earned || 0) * 100) / 100;
  const totalActiveCount =
    hasMoreInvites || Boolean(decodedCursor)
      ? Math.max(invites.length, preAggregatedInvites)
      : invites.length;
  const resolvedTotalEarned =
    hasMoreInvites || Boolean(decodedCursor)
      ? Math.max(totalAgentEarned, preAggregatedEarned)
      : totalAgentEarned;

  const payload: AgentNetworkPayload = {
    isAgent: agentStatus.isAgent,
    agentRegisteredAt: agentStatus.registeredAt,
    referralCode,
    totalAgentEarned: resolvedTotalEarned,
    invitesCount: totalActiveCount,
    uplineAgentsCount: uplineAgent ? 1 : 0,
    mutualsCount,
    pendingOptOutRequestsCount,
    invites,
    uplineAgent,
    mutuals,
    nextCursor,
    hasMoreInvites,
  };

  if (!decodedCursor) {
    l1NetworkCache.set(cleanEmail, { data: payload, expiresAt: now + 15000 });
    if (isRedisReady()) {
      await redisConnection.set(`agent:net_cache:${cleanEmail}`, JSON.stringify(payload), "EX", 60).catch(() => {});
    }
  }

  return payload;
}
