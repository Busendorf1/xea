import { errorResponse, jsonResponse } from "../_shared/cors.ts";
import { decryptSensitiveFieldEdge } from "../_shared/crypto.ts";

function resolveOptOutFromRow(row: Record<string, unknown>): string {
  const status = String(row.status || "active").toLowerCase().trim();
  const optOutCol = String(row.opt_out_status || "").toLowerCase().trim();
  const reqBy = String(row.opt_out_requested_by || "").toLowerCase().trim();
  if (
    row.is_opted_out === true ||
    status === "opted_out" ||
    optOutCol === "accepted" ||
    optOutCol === "forced"
  ) {
    return "opted_out";
  }
  if (
    status === "req_remove" ||
    optOutCol === "agent_requested" ||
    ((status === "opt_out_requested" || status === "requested") && reqBy === "agent")
  ) {
    return "agent_requested";
  }
  if (
    status === "req_unfollow" ||
    optOutCol === "requested" ||
    status === "opt_out_requested" ||
    status === "requested"
  ) {
    return "requested";
  }
  if (status === "rej_unfollow" || optOutCol === "rejected") {
    return "rejected";
  }
  return "active";
}

const SAFE_EMAIL_FOR_FILTER = /^[^\s@,'"%()]+@[^\s@,'"%()]+$/;

function encodeEdgeInviteCursor(createdAt: string, refereeEmail: string): string {
  return `${createdAt}::${refereeEmail.toLowerCase().trim()}`;
}

function decodeEdgeInviteCursor(cursor?: unknown): { createdAt: string; refereeEmail: string } | null {
  if (!cursor || typeof cursor !== "string") return null;
  const idx = cursor.indexOf("::");
  if (idx <= 0) return null;
  const createdAt = cursor.slice(0, idx).trim();
  const refereeEmail = cursor.slice(idx + 2).toLowerCase().trim();
  if (
    !createdAt ||
    !refereeEmail ||
    Number.isNaN(Date.parse(createdAt)) ||
    !SAFE_EMAIL_FOR_FILTER.test(refereeEmail)
  ) {
    return null;
  }
  return { createdAt, refereeEmail };
}

export async function buildAgentNetworkResponse(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  emailLower: string,
  options?: { cursor?: string | null; limit?: number },
): Promise<Record<string, unknown>> {
  const decodedCursor = decodeEdgeInviteCursor(options?.cursor);
  const pageLimit = Math.max(1, Math.min(100, Number(options?.limit) || 50));

  const { data: userData } = await supabase
    .from("users")
    .select("email, username, is_agent, agent_registered_at, referral_code, mutuals, mutual_count, agent_total_earned, agent_invites_count")
    .ilike("email", emailLower)
    .maybeSingle();

  if (!userData) {
    return { error: "User profile not found." };
  }

  const isAgent = Boolean(userData.is_agent);
  const referralCode = userData.referral_code || userData.username || "";

  // Strictly direct relationships ONLY with O(log N) keyset cursor pagination (zero 500-cap or exact count scan)
  let dlQuery = supabase
    .from("referrals")
    .select("id, referrer_email, referee_email, status, opt_out_status, is_opted_out, opt_out_requested_by, opt_out_requested_at, commission_rate, total_commission_earned, created_at")
    .ilike("referrer_email", emailLower)
    .neq("status", "opted_out");

  if (decodedCursor) {
    dlQuery = dlQuery.or(
      `created_at.lt.${decodedCursor.createdAt},and(created_at.eq.${decodedCursor.createdAt},referee_email.lt.${decodedCursor.refereeEmail})`,
    );
  }

  const [dlRes, upRes] = await Promise.all([
    dlQuery
      .order("created_at", { ascending: false })
      .order("referee_email", { ascending: false })
      .limit(pageLimit + 1),
    supabase
      .from("referrals")
      .select("id, referrer_email, referee_email, status, opt_out_status, is_opted_out, opt_out_requested_by, opt_out_requested_at, commission_rate, total_commission_earned, created_at")
      .ilike("referee_email", emailLower)
      .limit(5),
  ]);

  const allDownlineRows = (dlRes.data || []) as Record<string, unknown>[];
  const hasMoreInvites = allDownlineRows.length > pageLimit;
  const rawDownlineRows = hasMoreInvites ? allDownlineRows.slice(0, pageLimit) : allDownlineRows;
  const lastRow = rawDownlineRows.length > 0 ? rawDownlineRows[rawDownlineRows.length - 1] : null;
  const nextCursor =
    hasMoreInvites && lastRow?.created_at && lastRow?.referee_email
      ? encodeEdgeInviteCursor(String(lastRow.created_at), String(lastRow.referee_email))
      : null;

  const activeDownlineRows = rawDownlineRows.filter((r) => {
    const refEmail = String(r.referee_email || "").toLowerCase().trim();
    return Boolean(refEmail) && refEmail !== emailLower && resolveOptOutFromRow(r) !== "opted_out";
  });

  const upRow = (upRes.data || []).find(
    (r: Record<string, unknown>) =>
      resolveOptOutFromRow(r) !== "opted_out" &&
      String(r.referrer_email || "").toLowerCase().trim() !== emailLower,
  );
  const hasActiveUp = Boolean(upRow && upRow.referrer_email);
  const upOpt = hasActiveUp ? resolveOptOutFromRow(upRow) : "active";

  const rawMutuals: string[] = Array.isArray(userData.mutuals)
    ? Array.from(
        new Set(
          userData.mutuals
            .map((m: unknown) => String(m || "").toLowerCase().trim())
            .filter(Boolean),
        ),
      )
    : [];

  const emailsToLookup = new Set<string>();
  for (const r of activeDownlineRows) {
    emailsToLookup.add(String(r.referee_email || "").toLowerCase().trim());
  }
  if (hasActiveUp && upRow.referrer_email) {
    emailsToLookup.add(String(upRow.referrer_email).toLowerCase().trim());
  }
  for (const m of rawMutuals) {
    emailsToLookup.add(m);
  }

  const profileMap: Record<string, Record<string, unknown>> = {};
  const deactivatedSet = new Set<string>();
  let dbLookupSucceeded = false;

  if (emailsToLookup.size > 0) {
    const lookupArr = Array.from(emailsToLookup);
    const selectCols =
      'email, username, "firstName", "lastName", business_name, "profileImage", bio, location, country, monetized, monetization_clicks, created_at, gender, is_agent';
    const [{ data: profRows, error: profErr }, { data: deactRows }] = await Promise.all([
      supabase.from("users").select(selectCols).in("email", lookupArr),
      supabase.from("deactivated_users").select("email").in("email", lookupArr),
    ]);

    if (!profErr && Array.isArray(profRows)) {
      dbLookupSucceeded = true;
    }
    for (const d of deactRows || []) {
      const de = String((d as { email?: string }).email || "").toLowerCase().trim();
      if (de) deactivatedSet.add(de);
    }

    const allRows: Record<string, unknown>[] = Array.isArray(profRows) ? [...profRows] : [];
    const matchedEmails = new Set(
      allRows.map((r) => String(r.email || "").toLowerCase().trim()).filter(Boolean),
    );
    const missingEmails = lookupArr.filter((e) => !matchedEmails.has(e) && SAFE_EMAIL_FOR_FILTER.test(e));
    if (missingEmails.length > 0) {
      for (let i = 0; i < missingEmails.length; i += 40) {
        const batch = missingEmails.slice(i, i + 40);
        const { data: ilikeRows } = await supabase
          .from("users")
          .select(selectCols)
          .or(batch.map((e) => `email.ilike.${e}`).join(","));
        if (Array.isArray(ilikeRows)) {
          allRows.push(...ilikeRows);
        }
      }
    }

    for (const r of allRows) {
      const e = String(r.email || "").toLowerCase().trim();
      if (!e || deactivatedSet.has(e)) continue;
      const handle = String(r.username || e).split("@")[0].replace(/^@/, "").trim();
      const firstName =
        typeof r.firstName === "string" ? (await decryptSensitiveFieldEdge(r.firstName)) || "" : "";
      const lastName =
        typeof r.lastName === "string" ? (await decryptSensitiveFieldEdge(r.lastName)) || "" : "";
      const fullName =
        r.business_name && String(r.business_name).trim()
          ? String(r.business_name).trim()
          : `${firstName} ${lastName}`.trim() || handle;
      const isMonetized =
        r.monetized === true ||
        ["true", "yes", "1", "t"].includes(String(r.monetized || "").toLowerCase()) ||
        Number(r.monetization_clicks || 0) >= 300;

      profileMap[e] = {
        username: handle,
        displayName: fullName,
        profileImage: r.profileImage || null,
        isAgent: Boolean(r.is_agent),
        profile: {
          business_name: r.business_name || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          username: handle,
          profileImage: r.profileImage || undefined,
          bio: r.bio || undefined,
          location: r.location && r.location !== "PLACEHOLDER" ? r.location : undefined,
          country: r.country && r.country !== "PLACEHOLDER" ? r.country : undefined,
          monetized: isMonetized,
          created_at: r.created_at || undefined,
          gender: r.gender || undefined,
        },
      };
    }
  }

  let totalAgentEarned = 0;
  let pendingOptOutRequestsCount = 0;

  // Direct-only commission schedule: 1% for follower/regular referees, 2% for Agent referees, zero downlines
  const invites = activeDownlineRows
    .filter((row) => {
      const refEmail = String(row.referee_email || "").toLowerCase().trim();
      if (!refEmail || deactivatedSet.has(refEmail)) return false;
      if (dbLookupSucceeded && !profileMap[refEmail]) return false;
      return true;
    })
    .map((row: Record<string, unknown>) => {
      const refEmail = String(row.referee_email || "").toLowerCase().trim();
      const prof = profileMap[refEmail] || {
        username: refEmail.split("@")[0],
        displayName: refEmail.split("@")[0],
        profileImage: null,
        isAgent: false,
        profile: { username: refEmail.split("@")[0] },
      };
      const optOut = resolveOptOutFromRow(row);
      if (optOut === "requested") pendingOptOutRequestsCount += 1;
      const earned = Math.round((Number(row.total_commission_earned) || 0) * 100) / 100;
      totalAgentEarned = Math.round((totalAgentEarned + earned) * 100) / 100;
      const isRefAgent = Boolean(prof.isAgent) || Number(row.commission_rate || 0) >= 0.02;

      return {
        id: prof.username,
        refereeKey: refEmail,
        username: prof.username,
        displayName: prof.displayName,
        profileImage: prof.profileImage,
        profile: prof.profile,
        isAgent: isRefAgent,
        commissionRatePct: isRefAgent ? 2 : 1,
        earnedFromUser: earned,
        optOutStatus: optOut,
        optOutRequestedAt: row.opt_out_requested_at || null,
        joinedAt: row.created_at || new Date().toISOString(),
      };
    });

  let uplineAgent = null;
  if (hasActiveUp && upRow.referrer_email) {
    const upEmail = String(upRow.referrer_email).toLowerCase().trim();
    const isUpDeleted = deactivatedSet.has(upEmail) || (dbLookupSucceeded && !profileMap[upEmail]);
    if (!isUpDeleted) {
      const upProf = profileMap[upEmail] || {
        username: upEmail.split("@")[0],
        displayName: upEmail.split("@")[0],
        profileImage: null,
        isAgent: true,
        profile: { username: upEmail.split("@")[0] },
      };
      if (upOpt === "agent_requested") pendingOptOutRequestsCount += 1;
      uplineAgent = {
        username: upProf.username,
        displayName: upProf.displayName,
        profileImage: upProf.profileImage,
        profile: upProf.profile,
        isRefereeAgent: isAgent,
        deductionRatePct: isAgent ? 2 : 1,
        totalGainedFromMe:
          Math.round((Number(upRow.total_commission_earned) || 0) * 100) / 100,
        optOutStatus: upOpt,
        optOutRequestedAt: upRow.opt_out_requested_at || null,
        joinedAt: upRow.created_at || new Date().toISOString(),
      };
    }
  }

  const liveMutuals = rawMutuals.filter((mEmail) => {
    if (deactivatedSet.has(mEmail)) return false;
    if (dbLookupSucceeded && !profileMap[mEmail]) return false;
    return true;
  });

  const mutuals = liveMutuals.map((mEmail) => {
    const mProf = profileMap[mEmail] || {
      username: mEmail.split("@")[0],
      displayName: mEmail.split("@")[0],
      profileImage: null,
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

  const mutualsCount =
    liveMutuals.length < rawMutuals.length
      ? mutuals.length
      : Math.max(Number(userData.mutual_count || 0), mutuals.length);
  const preAggInvites = Number(userData.agent_invites_count || 0);
  const preAggEarned = Math.round(Number(userData.agent_total_earned || 0) * 100) / 100;
  const totalInvites =
    hasMoreInvites || Boolean(decodedCursor)
      ? Math.max(invites.length, preAggInvites)
      : invites.length;
  const resolvedTotalEarned =
    hasMoreInvites || Boolean(decodedCursor)
      ? Math.max(totalAgentEarned, preAggEarned)
      : totalAgentEarned;

  return {
    success: true,
    isAgent,
    agentRegisteredAt: userData.agent_registered_at || null,
    referralCode,
    totalAgentEarned: resolvedTotalEarned,
    invitesCount: totalInvites,
    uplineAgentsCount: uplineAgent ? 1 : 0,
    mutualsCount,
    pendingOptOutRequestsCount,
    invites,
    uplineAgent,
    mutuals,
    nextCursor,
    hasMoreInvites,
  };
}

export async function handleAgentNetwork(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const cursor = typeof body?.cursor === "string" ? body.cursor.trim() : null;
  const limit = Number(body?.limit) || 50;
  const payload = await buildAgentNetworkResponse(supabase, cleanEmail, { cursor, limit });
  if (payload.error) {
    return errorResponse(String(payload.error), 404);
  }
  return jsonResponse(payload);
}

export async function handleAgentRegister(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const enable = body?.enable !== false;
  await supabase
    .from("users")
    .update({
      is_agent: enable,
      ...(enable ? { agent_registered_at: new Date().toISOString() } : {}),
    })
    .ilike("email", cleanEmail);

  const network = await buildAgentNetworkResponse(supabase, cleanEmail);
  return jsonResponse({ ...network, success: true, isAgent: enable });
}

export async function handleAgentOptOut(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const optAction = String(body?.optOutAction || body?.optAction || body?.subAction || "request")
    .toLowerCase()
    .trim();
  const targetReferee = String(body?.refereeEmail || body?.refereeKey || "").toLowerCase().trim();
  const nowIso = new Date().toISOString();

  if (optAction === "request") {
    await supabase
      .from("referrals")
      .update({
        status: "req_unfollow",
        opt_out_status: "requested",
        opt_out_requested_by: "referee",
        opt_out_requested_at: nowIso,
      })
      .ilike("referee_email", cleanEmail);
  } else if (optAction === "cancel" || optAction === "cancel_request") {
    await supabase
      .from("referrals")
      .update({
        status: "qualified",
        opt_out_status: "none",
        opt_out_requested_by: null,
        opt_out_requested_at: null,
      })
      .ilike("referee_email", cleanEmail);
  } else if ((optAction === "approve" || optAction === "accept") && targetReferee) {
    await Promise.all([
      supabase
        .from("referrals")
        .update({ status: "opted_out", opt_out_status: "accepted", is_opted_out: true, opt_out_requested_at: nowIso })
        .ilike("referrer_email", cleanEmail)
        .ilike("referee_email", targetReferee),
      supabase.from("users").update({ referred_by: null }).ilike("email", targetReferee),
    ]);
  } else if (optAction === "reject" && targetReferee) {
    await supabase
      .from("referrals")
      .update({ status: "rej_unfollow", opt_out_status: "rejected" })
      .ilike("referrer_email", cleanEmail)
      .ilike("referee_email", targetReferee);
  } else if (optAction === "agent_request" && targetReferee) {
    await supabase
      .from("referrals")
      .update({
        status: "req_remove",
        opt_out_status: "agent_requested",
        opt_out_requested_by: "agent",
        opt_out_requested_at: nowIso,
      })
      .ilike("referrer_email", cleanEmail)
      .ilike("referee_email", targetReferee);
  } else if (optAction === "agent_cancel" && targetReferee) {
    await supabase
      .from("referrals")
      .update({
        status: "qualified",
        opt_out_status: "none",
        opt_out_requested_by: null,
        opt_out_requested_at: null,
      })
      .ilike("referrer_email", cleanEmail)
      .ilike("referee_email", targetReferee);
  } else if (optAction === "agent_approve" || optAction === "referee_accept") {
    await Promise.all([
      supabase
        .from("referrals")
        .update({ status: "opted_out", opt_out_status: "accepted", is_opted_out: true, opt_out_requested_at: nowIso })
        .ilike("referee_email", cleanEmail),
      supabase.from("users").update({ referred_by: null }).ilike("email", cleanEmail),
    ]);
  } else if (optAction === "referee_reject") {
    await supabase
      .from("referrals")
      .update({
        status: "qualified",
        opt_out_status: "none",
        opt_out_requested_by: null,
        opt_out_requested_at: null,
      })
      .ilike("referee_email", cleanEmail);
  } else if (optAction === "force") {
    await Promise.all([
      supabase
        .from("referrals")
        .update({ status: "opted_out", opt_out_status: "forced", is_opted_out: true, opt_out_requested_at: nowIso })
        .ilike("referee_email", cleanEmail),
      supabase
        .from("referrals")
        .update({ status: "opted_out", opt_out_status: "forced", is_opted_out: true, opt_out_requested_at: nowIso })
        .ilike("referrer_email", cleanEmail)
        .neq("status", "opted_out"),
      supabase.from("users").update({ is_agent: false, referred_by: null }).ilike("email", cleanEmail),
      supabase.from("users").update({ referred_by: null }).ilike("referred_by", cleanEmail),
    ]);
  }

  const network = await buildAgentNetworkResponse(supabase, cleanEmail);
  return jsonResponse({ ...network, success: true });
}
