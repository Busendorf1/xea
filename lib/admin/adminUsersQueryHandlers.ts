import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { getSpecialRoleProfile } from "@/lib/adminHelper";

export async function handleGetUserDetails(searchParams: URLSearchParams) {
  const userId = searchParams.get("userId");
  const userEmail = searchParams.get("email");
  if (!userId && !userEmail) {
    return NextResponse.json({ error: "userId or email is required" }, { status: 400 });
  }

  const dbClient = supabaseReadOnly || supabaseAdmin;
  let userQuery = dbClient.from("users").select("*");
  if (userId) {
    userQuery = userQuery.eq("id", userId);
  } else {
    userQuery = userQuery.ilike("email", (userEmail || "").toLowerCase().trim());
  }
  const { data: userRows, error: userErr } = await userQuery.limit(1);
  if (userErr || !userRows || userRows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const user = userRows[0];
  const emailLower = (user.email || "").toLowerCase().trim();

  // Lazy-load agentSystem only when details are requested
  const { getAgentNetworkData, checkIsUserAgent } = await import("@/lib/agentSystem");

  const [statementRes, networkTree, agentStatus, adsRes, activeAdsRes, newsRes, activeNewsRes, referralsRes] = await Promise.all([
    dbClient.from("financial_statements").select("*").ilike("user_email", emailLower).order("created_at", { ascending: false }).limit(50),
    getAgentNetworkData(emailLower),
    checkIsUserAgent(emailLower),
    dbClient.from("adds").select("*").ilike("user_email", emailLower).order("created_at", { ascending: false }).limit(30),
    dbClient.from("addsactive").select("*").ilike("user_email", emailLower).order("created_at", { ascending: false }).limit(30),
    dbClient.from("news").select("*").ilike("user_email", emailLower).order("created_at", { ascending: false }).limit(30),
    dbClient.from("newsactive").select("*").ilike("user_email", emailLower).order("created_at", { ascending: false }).limit(30),
    dbClient.from("referrals").select("*").ilike("referrer_email", emailLower).order("created_at", { ascending: false }).limit(50),
  ]);

  const special = getSpecialRoleProfile(emailLower, user);

  return NextResponse.json({
    user: {
      ...user,
      is_agent: agentStatus.isAgent,
      is_agent_banned: agentStatus.isBanned,
      agent_banned_until: agentStatus.bannedUntil,
      agent_ban_reason: agentStatus.banReason,
      agent_registered_at: agentStatus.registeredAt,
      is_career: special.isCareer,
      is_affiliate: special.isAffiliate,
      affiliate_role: special.affiliateRole,
    },
    statement: statementRes.data || [],
    network: networkTree,
    referrals: referralsRes.data || [],
    campaigns: {
      ads: adsRes.data || [],
      activeAds: activeAdsRes.data || [],
      news: newsRes.data || [],
      activeNews: activeNewsRes.data || [],
    },
  });
}

export async function handleGetAgentsList(searchParams: URLSearchParams) {
  const search = searchParams.get("search")?.trim() || "";
  const cacheKey = `admin:agents:list:${search.toLowerCase()}`;

  if (!search && isRedisReady()) {
    try {
      const cached = await redisConnection.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached), {
          headers: {
            "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
            "X-Cache": "HIT",
          },
        });
      }
    } catch {}
  }

  // 1. Fetch users who have referral_code, are agents, or match search
  let usersQuery = supabaseAdmin
    .from("users")
    .select('id, username, email, "firstName", "lastName", "profileImage", balance, referral_code, suspended_until, created_at, is_agent, agent_registered_at, agent_banned_until, agent_ban_reason');

  const cleanSearch = search.replace(/[,()]/g, "").trim();
  if (cleanSearch) {
    usersQuery = usersQuery.or(`email.ilike.%${cleanSearch}%,username.ilike.%${cleanSearch}%,firstName.ilike.%${cleanSearch}%,lastName.ilike.%${cleanSearch}%,referral_code.ilike.%${cleanSearch}%`);
  } else {
    usersQuery = usersQuery.or("is_agent.eq.true,referral_code.not.is.null");
  }

  const { data: matchedUsers, error: usersErr } = await usersQuery
    .order("created_at", { ascending: false })
    .limit(200);

  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }

  const allCandidates = matchedUsers || [];
  const candidateEmails = allCandidates.map((u: any) => (u.email || "").toLowerCase().trim()).filter(Boolean);

  // 2. Fetch referral aggregations ONLY for matched candidates (avoids unbounded table scan)
  const followerCountMap = new Map<string, number>();
  const earningsMap = new Map<string, number>();

  if (candidateEmails.length > 0) {
    const { data: refRows } = await supabaseAdmin
      .from("referrals")
      .select("referrer_email, total_commission_earned, status")
      .in("referrer_email", candidateEmails);

    (refRows || []).forEach((row: any) => {
      const refEmail = (row.referrer_email || "").toLowerCase().trim();
      if (!refEmail) return;
      if (row.status !== "opted_out") {
        followerCountMap.set(refEmail, (followerCountMap.get(refEmail) || 0) + 1);
      }
      const earned = Number(row.total_commission_earned) || 0;
      earningsMap.set(refEmail, (earningsMap.get(refEmail) || 0) + earned);
    });
  }

  // 3. Map candidates directly without N+1 queries
  const agents = allCandidates.map((u: any) => {
    const emailLower = (u.email || "").toLowerCase().trim();
    const isBanned = Boolean(u.agent_banned_until && new Date(u.agent_banned_until).getTime() > Date.now());
    const isAgent = isBanned ? false : Boolean(u.is_agent);
    const special = getSpecialRoleProfile(emailLower, u);
    const followersCount = followerCountMap.get(emailLower) || 0;
    const totalEarned = earningsMap.get(emailLower) || 0;

    return {
      id: u.id,
      username: u.username,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      profileImage: u.profileImage,
      balance: u.balance || 0,
      referral_code: u.referral_code,
      created_at: u.created_at,
      is_agent: isAgent,
      is_agent_banned: isBanned,
      agent_banned_until: u.agent_banned_until || null,
      agent_ban_reason: u.agent_ban_reason || null,
      registered_at: u.agent_registered_at || null,
      is_career: special.isCareer,
      is_affiliate: special.isAffiliate,
      affiliate_role: special.affiliateRole,
      followers_count: followersCount,
      total_earned: totalEarned,
    };
  });

  const filteredAgents = search
    ? agents
    : agents.filter((a) => a.is_agent || a.is_agent_banned || a.followers_count > 0 || a.referral_code);

  if (isRedisReady()) {
    await redisConnection.set(cacheKey, JSON.stringify({ agents: filteredAgents }), "EX", 30).catch(() => {});
  }

  return NextResponse.json({ agents: filteredAgents });
}

export async function handleGetFollowersList(searchParams: URLSearchParams) {
  const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 100);
  const search = searchParams.get("search")?.trim() || "";
  const agentEmail = searchParams.get("agentEmail")?.trim().toLowerCase() || "";

  const cleanSearch = search.replace(/[,()]/g, "").trim();
  let query = supabaseAdmin
    .from("referrals")
    .select("id, referrer_email, referee_email, commission_rate, total_commission_earned, status, opt_out_status, created_at, interactions_count", { count: "planned" });

  if (agentEmail) {
    query = query.ilike("referrer_email", agentEmail);
  }
  if (cleanSearch) {
    query = query.or(`referee_email.ilike.%${cleanSearch}%,referrer_email.ilike.%${cleanSearch}%`);
  }

  const { data: rows, count, error } = await query
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const refRows = rows || [];
  const emailsToLookup = Array.from(
    new Set(
      [
        ...refRows.map((r: any) => (r.referee_email || "").toLowerCase().trim()),
        ...refRows.map((r: any) => (r.referrer_email || "").toLowerCase().trim()),
      ].filter(Boolean)
    )
  );

  const profileMap = new Map<string, any>();
  if (emailsToLookup.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("users")
      .select('id, username, email, "firstName", "lastName", "profileImage", referral_code')
      .in("email", emailsToLookup);

    (profiles || []).forEach((p: any) => {
      profileMap.set((p.email || "").toLowerCase().trim(), p);
    });
  }

  const followers = refRows.map((row: any) => {
    const refLower = (row.referee_email || "").toLowerCase().trim();
    const agentLower = (row.referrer_email || "").toLowerCase().trim();
    const refProfile = profileMap.get(refLower);
    const agentProfile = profileMap.get(agentLower);

    return {
      id: row.id,
      follower_email: row.referee_email,
      follower_username: refProfile?.username || refLower.split("@")[0],
      follower_name: refProfile ? `${refProfile.firstName || ""} ${refProfile.lastName || ""}`.trim() : "",
      follower_id: refProfile?.id || null,
      agent_email: row.referrer_email,
      agent_username: agentProfile?.username || agentLower.split("@")[0],
      agent_name: agentProfile ? `${agentProfile.firstName || ""} ${agentProfile.lastName || ""}`.trim() : "",
      agent_id: agentProfile?.id || null,
      agent_code: agentProfile?.referral_code || null,
      commission_rate: Number(row.commission_rate) || 0.02,
      total_commission_earned: Number(row.total_commission_earned) || 0,
      status: row.status || "active",
      opt_out_status: row.opt_out_status || "none",
      interactions_count: row.interactions_count || 0,
      created_at: row.created_at,
    };
  });

  return NextResponse.json({
    followers,
    count: count || 0,
    page,
    limit,
  });
}

export async function handleGetAffiliatesList(searchParams: URLSearchParams) {
  const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 100);
  const search = searchParams.get("search")?.trim().toLowerCase() || "";
  const cacheKey = `admin:affiliates:list:${page}:${limit}:${search}`;

  if (isRedisReady()) {
    try {
      const cached = await redisConnection.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached), {
          headers: {
            "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
            "X-Cache": "HIT",
          },
        });
      }
    } catch {}
  }

  const dbClient = supabaseReadOnly || supabaseAdmin;
  const cleanSearch = search.replace(/[,()]/g, "").trim();
  let affQuery = dbClient
    .from("users")
    .select('id, username, email, "firstName", "lastName", "profileImage", balance, is_career, is_affiliate, affiliate_role, affiliate_earned_total, referral_code, monetized, created_at, phone, country', { count: "planned" })
    .eq("is_affiliate", true);

  if (cleanSearch) {
    affQuery = affQuery.or(`email.ilike.%${cleanSearch}%,username.ilike.%${cleanSearch}%,firstName.ilike.%${cleanSearch}%,lastName.ilike.%${cleanSearch}%,affiliate_role.ilike.%${cleanSearch}%`);
  }

  const { data: affUsers, count: affCount, error: affErr } = await affQuery
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (affErr) {
    return NextResponse.json({ error: affErr.message }, { status: 500 });
  }

  const responsePayload = {
    affiliates: affUsers || [],
    count: affCount || 0,
    page,
    limit,
  };

  if (isRedisReady()) {
    await redisConnection.set(cacheKey, JSON.stringify(responsePayload), "EX", 30).catch(() => {});
  }

  return NextResponse.json(responsePayload);
}

export async function handleGetStats() {
  const cacheKey = "admin:overview_stats";

  // 1. Try Redis cache first (60-second TTL)
  try {
    const cachedStatsStr = await redisConnection.get(cacheKey);
    if (cachedStatsStr) {
      return NextResponse.json(JSON.parse(cachedStatsStr));
    }
  } catch (redisErr) {
    console.warn("⚠️ Redis read warning in admin stats:", redisErr);
  }

  // 2. Cache miss: Execute ultra-fast single-pass PostgreSQL aggregate RPC
  const { data: statsJson, error: rpcError } = await supabaseAdmin.rpc("get_admin_overview_stats");

  if (!rpcError && statsJson) {
    await redisConnection.set(cacheKey, JSON.stringify(statsJson), "EX", 60).catch(() => {});
    return NextResponse.json(statsJson);
  }

  // Fallback: fast count queries
  console.warn("⚠️ get_admin_overview_stats RPC fallback triggered in users route:", rpcError?.message);
  const { count: totalUsersCnt } = await supabaseAdmin.from("users").select("*", { count: "exact", head: true });
  const fallbackStats = {
    totalUsers: totalUsersCnt || 0,
    totalBalance: 0,
    totalWithdrawal: 0,
    totalMutuals: 0,
    monetizedUsers: 0,
    suspendedUsers: 0,
  };

  await redisConnection.set(cacheKey, JSON.stringify(fallbackStats), "EX", 60).catch(() => {});
  return NextResponse.json(fallbackStats);
}

export async function handleGetUsersList(searchParams: URLSearchParams) {
  const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10), 1), 100);
  const search = searchParams.get("search")?.trim() || "";
  const filter = searchParams.get("filter")?.trim() || "";
  const fresh = searchParams.get("fresh") === "true";

  const cacheKey = `admin:users:list:${page}:${limit}:${filter}:${search.toLowerCase()}`;

  // 1. Try Redis cache first (30-second TTL) for instant response (<2ms)
  if (!fresh) {
    try {
      const cached = await redisConnection.get(cacheKey);
      if (cached) {
        return NextResponse.json({ ...JSON.parse(cached), cached: true }, {
          headers: {
            "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
            "X-Cache": "HIT",
          },
        });
      }
    } catch (err) {
      console.warn("⚠️ Redis read error in /api/admin/users:", err);
    }
  }

  const dbClient = supabaseReadOnly || supabaseAdmin;
  const selectedColumns = 'id, username, email, "firstName", "lastName", "profileImage", business_name, phone, state, country, location, bio, industry, interest, lifestyle, behavior, personality, gender, balance, withdrawal, monetized, monetization_type, monetized_until, monetized_at, monetization_clicks, referral_code, referred_by, suspended_until, ad_account_status, ad_ban_until, ad_ban_reason, mutual_count, created_at, last_active_at, atw_tier, employment, is_career, is_affiliate, affiliate_role, affiliate_earned_total';
  const cleanSearch = search.replace(/[,()]/g, "").trim();
  let query = dbClient.from("users").select(selectedColumns, { count: "planned" });

  if (filter === "affiliates") {
    query = query.eq("is_affiliate", true);
  } else if (filter === "career") {
    query = query.eq("is_career", true);
  } else if (filter === "monetized") {
    query = query.or("monetized.eq.yes,monetized.eq.true");
  }

  if (cleanSearch) {
    query = query.or(`email.ilike.%${cleanSearch}%,username.ilike.%${cleanSearch}%,firstName.ilike.%${cleanSearch}%,lastName.ilike.%${cleanSearch}%,business_name.ilike.%${cleanSearch}%`);
  }

  const { data: users, count, error } = await query
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) {
    console.error("❌ Admin API get users error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resolvedUsers = users || [];

  // Server-Side Enrichment for the current page
  let enrichedUsers = resolvedUsers;
  if (resolvedUsers.length > 0) {
    const emails = resolvedUsers.map((u: any) => (u.email || "").toLowerCase()).filter(Boolean);

    const { checkIsUserAgent } = await import("@/lib/agentSystem");
    const [adsRes, activeAdsRes, newsRes, activeNewsRes, agentStatuses] = await Promise.all([
      dbClient.from("adds").select("user_email, impression_count, mutual_adds_count").in("user_email", emails),
      dbClient.from("addsactive").select("user_email, impression_count, mutual_adds_count").in("user_email", emails),
      dbClient.from("news").select("user_email").in("user_email", emails),
      dbClient.from("newsactive").select("user_email").in("user_email", emails),
      Promise.all(emails.map(async (em: string) => {
        const ag = await checkIsUserAgent(em);
        return {
          email: em,
          isAgent: ag.isAgent,
          isBanned: Boolean(ag.isBanned),
          bannedUntil: ag.bannedUntil || null,
          banReason: ag.banReason || null,
        };
      })),
    ]);
    const agentMap = new Map((agentStatuses || []).map((a: any) => [a.email, a]));

    const adsData = adsRes.data || [];
    const activeAdsData = activeAdsRes.data || [];
    const newsData = newsRes.data || [];
    const activeNewsData = activeNewsRes.data || [];

    enrichedUsers = resolvedUsers.map((user: any) => {
      const emailLower = (user.email || "").toLowerCase();
      const reviewAds = adsData.filter((ad: any) => (ad.user_email || "").toLowerCase() === emailLower);
      const activeAds = activeAdsData.filter((ad: any) => (ad.user_email || "").toLowerCase() === emailLower);

      const reviewHighlights = newsData.filter((h: any) => (h.user_email || "").toLowerCase() === emailLower).length;
      const activeHighlights = activeNewsData.filter((h: any) => (h.user_email || "").toLowerCase() === emailLower).length;

      const adImpressionsCount = [...reviewAds, ...activeAds].reduce((sum: number, ad: any) => sum + parseInt(ad.impression_count || 0), 0);
      const adMutualsCount = [...reviewAds, ...activeAds].reduce((sum: number, ad: any) => sum + parseInt(ad.mutual_adds_count || 0), 0);
      const totalClicksOnAds = adImpressionsCount + adMutualsCount;
      const special = getSpecialRoleProfile(emailLower, user);

      return {
        ...user,
        is_career: special.isCareer,
        is_affiliate: special.isAffiliate,
        affiliate_role: special.affiliateRole,
        is_agent: agentMap.get(emailLower)?.isAgent || false,
        is_agent_banned: agentMap.get(emailLower)?.isBanned || false,
        agent_banned_until: agentMap.get(emailLower)?.bannedUntil || user.agent_banned_until || null,
        agent_ban_reason: agentMap.get(emailLower)?.banReason || user.agent_ban_reason || null,
        totalClicksOnAds,
        reviewAdsCount: reviewAds.length,
        activeAdsCount: activeAds.length,
        reviewHighlightsCount: reviewHighlights,
        activeHighlightsCount: activeHighlights,
      };
    });
  }

  const responsePayload = { users: enrichedUsers, count: count || 0, page, limit };

  try {
    await redisConnection.set(cacheKey, JSON.stringify(responsePayload), "EX", 30);
  } catch (err) {
    console.warn("⚠️ Redis write error in /api/admin/users:", err);
  }

  return NextResponse.json(responsePayload);
}
