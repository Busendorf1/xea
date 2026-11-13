import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";

describe("500M+ Scale Agent Commission & Cursor Pagination", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("creditAgentWalletAndEdge uses increment_user_balance_atomic + increment_referral_commission_atomic without JS read-modify-write, and resolveLightweightUplineForEarner enforces 1%/2% 1-hop limit", async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const referralUpdates: Array<Record<string, unknown>> = [];
    const userUpdates: Array<Record<string, unknown>> = [];

    const makeUsersQuery = () => {
      let colFilter = "";
      const chain: any = {
        select: vi.fn((cols: string) => {
          colFilter = cols;
          return chain;
        }),
        ilike: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        update: vi.fn((payload: Record<string, unknown>) => {
          userUpdates.push(payload);
          return chain;
        }),
        maybeSingle: vi.fn(async () => {
          if (colFilter.includes("is_agent")) {
            return { data: { is_agent: false }, error: null };
          }
          if (colFilter.includes("monetized")) {
            return { data: { monetized: "true", monetization_clicks: 350 }, error: null };
          }
          return { data: { balance: 100 }, error: null };
        }),
        then: (resolve: (val: unknown) => unknown) => resolve({ error: null }),
      };
      return chain;
    };

    const makeReferralsQuery = () => {
      const chain: any = {
        select: vi.fn(() => chain),
        ilike: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({
          data: {
            id: "ref-1",
            referrer_email: "agent@paayh.com",
            status: "qualified",
            opt_out_status: "none",
          },
          error: null,
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          referralUpdates.push(payload);
          return chain;
        }),
        then: (resolve: (val: unknown) => unknown) => resolve({ error: null }),
      };
      return chain;
    };

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => {
          if (table === "referrals") return makeReferralsQuery();
          return makeUsersQuery();
        }),
        rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
          rpcCalls.push({ fn, args });
          if (fn === "increment_user_balance_atomic") {
            return { data: { success: true, newBalance: 100.5 }, error: null };
          }
          if (fn === "increment_referral_commission_atomic") {
            return { data: { success: true, totalCommissionEarned: 0.5 }, error: null };
          }
          if (fn === "apply_agent_commission_atomic") {
            return {
              data: {
                applied: true,
                net_earner_amount: 49.5,
                deducted: 0.5,
                earner_new_balance: 149.5,
                agent1_email: "agent@paayh.com",
                agent1_credit: 0.5,
                agent1_new_balance: 100.5,
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }),
      },
    }));

    vi.doMock("@/lib/redis", () => ({
      default: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
      },
      isRedisReady: vi.fn().mockReturnValue(false),
    }));

    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
      publishLiveBalanceUpdate: vi.fn().mockResolvedValue(undefined),
    }));

    const {
      resolveLightweightUplineForEarner,
      creditAgentWalletAndEdge,
      applyAgentCommissionOnEarning,
    } = await import("../agent/agentCommission");

    const upline = await resolveLightweightUplineForEarner("follower1@paayh.com");
    expect(upline.hasUpline).toBe(true);
    expect(upline.uplineEmail).toBe("agent@paayh.com");
    expect(upline.rate).toBe(0.01);
    expect(upline.uplineOfUplineEmail).toBeNull();

    await creditAgentWalletAndEdge({
      agentEmail: "agent@paayh.com",
      refereeEmail: "follower1@paayh.com",
      creditToWallet: 0.5,
      grossCommissionFromReferee: 0.5,
      rate: 0.01,
    });

    expect(rpcCalls.some((c) => c.fn === "increment_user_balance_atomic")).toBe(true);
    const refRpc = rpcCalls.find((c) => c.fn === "increment_referral_commission_atomic");
    expect(refRpc).toBeDefined();
    expect(refRpc?.args).toEqual({
      p_referee_email: "follower1@paayh.com",
      p_referrer_email: "agent@paayh.com",
      p_amount: 0.5,
      p_rate: 0.01,
    });
    // Ensure JS never does a non-atomic read-modify-write update on users.balance or total_commission_earned when RPCs succeed
    expect(userUpdates.some((u) => Object.prototype.hasOwnProperty.call(u, "balance"))).toBe(false);
    expect(
      referralUpdates.some((u) => Object.prototype.hasOwnProperty.call(u, "total_commission_earned"))
    ).toBe(false);

    const atomicResult = await applyAgentCommissionOnEarning({
      earnerEmail: "follower1@paayh.com",
      grossEarnedAmount: 50,
      currentEarnerBalance: 100,
    });
    expect(atomicResult.uplineAgentEmail).toBe("agent@paayh.com");
    expect(atomicResult.deductedAmount).toBe(0.5);
    expect(atomicResult.netEarnerAmount).toBe(49.5);
  });

  it("creditAgentWalletAndEdge falls back to referrals read-modify-write only if increment_referral_commission_atomic errors, and verified Agent earner uses 2% rate", async () => {
    const referralUpdates: Array<Record<string, unknown>> = [];

    const makeReferralsQuery = () => {
      const chain: any = {
        select: vi.fn(() => chain),
        ilike: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({
          data: {
            id: "ref-2",
            referrer_email: "agent@paayh.com",
            status: "active",
            opt_out_status: "none",
            total_commission_earned: 12.5,
          },
          error: null,
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          referralUpdates.push(payload);
          return chain;
        }),
        then: (resolve: (val: unknown) => unknown) => resolve({ error: null }),
      };
      return chain;
    };

    const makeUsersQuery = () => {
      let colFilter = "";
      const chain: any = {
        select: vi.fn((cols: string) => {
          colFilter = cols;
          return chain;
        }),
        ilike: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        update: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (colFilter.includes("is_agent")) return { data: { is_agent: true }, error: null };
          if (colFilter.includes("balance")) return { data: { balance: 200 }, error: null };
          return { data: { monetized: "true", monetization_clicks: 500 }, error: null };
        }),
        then: (resolve: (val: unknown) => unknown) => resolve({ error: null }),
      };
      return chain;
    };

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => (table === "referrals" ? makeReferralsQuery() : makeUsersQuery())),
        rpc: vi.fn(async (fn: string) => {
          if (fn === "increment_user_balance_atomic") {
            return { data: { success: true, newBalance: 202 }, error: null };
          }
          return { data: null, error: { message: "RPC missing in staging" } };
        }),
      },
    }));

    vi.doMock("@/lib/redis", () => ({
      default: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
      },
      isRedisReady: vi.fn().mockReturnValue(false),
    }));

    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
      publishLiveBalanceUpdate: vi.fn().mockResolvedValue(undefined),
    }));

    const { resolveLightweightUplineForEarner, creditAgentWalletAndEdge } = await import(
      "../agent/agentCommission"
    );

    const upline = await resolveLightweightUplineForEarner("agentearner@paayh.com");
    expect(upline.rate).toBe(0.02);

    await creditAgentWalletAndEdge({
      agentEmail: "agent@paayh.com",
      refereeEmail: "agentearner@paayh.com",
      creditToWallet: 2,
      grossCommissionFromReferee: 2,
      rate: upline.rate,
    });

    expect(referralUpdates).toHaveLength(1);
    expect(referralUpdates[0].total_commission_earned).toBe(14.5);
  });

  it("paginates referrals via keyset cursor using O(page_size) mget without smembers and preserves pre-aggregated counters", async () => {
    const smembersSpy = vi.fn();
    const mgetSpy = vi.fn().mockResolvedValue([null, null]);

    vi.doMock("@/lib/redis", () => ({
      default: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        srem: vi.fn().mockResolvedValue(1),
        smembers: smembersSpy,
        mget: mgetSpy,
      },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));

    vi.doMock("@/lib/security/piiCrypto", () => ({
      decryptProfilePII: vi.fn((u: Record<string, unknown>) => u),
      encryptSensitiveField: vi.fn((v: unknown) => v),
    }));

    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
      publishLiveBalanceUpdate: vi.fn().mockResolvedValue(undefined),
    }));

    const rowsPage = [
      {
        id: "r3",
        referee_email: "u3@paayh.com",
        status: "active",
        opt_out_status: "none",
        total_commission_earned: 40,
        created_at: "2026-11-10T10:03:00.000Z",
      },
      {
        id: "r2",
        referee_email: "u2@paayh.com",
        status: "active",
        opt_out_status: "none",
        total_commission_earned: 30,
        created_at: "2026-11-10T10:02:00.000Z",
      },
      {
        id: "r1",
        referee_email: "u1@paayh.com",
        status: "active",
        opt_out_status: "none",
        total_commission_earned: 20,
        created_at: "2026-11-10T10:01:00.000Z",
      },
    ];

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => {
          const isDeactivatedLookup = table === "deactivated_users";
          const chain: any = {
            select: vi.fn(() => chain),
            ilike: vi.fn(() => chain),
            neq: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            in: vi.fn(() => chain),
            or: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            maybeSingle: vi.fn(async () => {
              if (table === "users") {
                return {
                  data: {
                    email: "influencer@paayh.com",
                    username: "influencer",
                    is_agent: true,
                    agent_verified_at: "2026-01-01T00:00:00Z",
                    agent_total_earned: 250000,
                    agent_invites_count: 100000,
                    total_earned: 300000,
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }),
            then: (resolve: (val: unknown) => unknown) => {
              if (isDeactivatedLookup) return resolve({ data: [], error: null });
              if (table === "users") {
                return resolve({
                  data: [
                    { email: "u3@paayh.com", username: "u3", monetized: "true", is_agent: false },
                    { email: "u2@paayh.com", username: "u2", monetized: "true", is_agent: true },
                  ],
                  error: null,
                });
              }
              if (table === "referrals") {
                return resolve({ data: rowsPage, error: null });
              }
              return resolve({ data: [], error: null });
            },
          };
          return chain;
        }),
      },
    }));

    const { encodeInviteCursor, decodeInviteCursor, getAgentNetworkData } = await import(
      "../agent/agentNetwork"
    );

    const encoded = encodeInviteCursor("2026-11-10T10:02:00.000Z", "u2@paayh.com");
    expect(decodeInviteCursor(encoded)).toEqual({
      createdAt: "2026-11-10T10:02:00.000Z",
      refereeEmail: "u2@paayh.com",
    });
    expect(decodeInviteCursor("not-valid-cursor")).toBeNull();

    const network = await getAgentNetworkData("influencer@paayh.com", { limit: 2 });
    expect(network.invites).toHaveLength(2);
    expect(network.hasMoreInvites).toBe(true);
    expect(network.nextCursor).toBeTruthy();
    expect(decodeInviteCursor(network.nextCursor!)).toEqual({
      createdAt: "2026-11-10T10:02:00.000Z",
      refereeEmail: "u2@paayh.com",
    });

    // Preserves pre-aggregated 100k+ counters rather than truncating to visible page length 2
    expect(network.invitesCount).toBe(100000);
    expect(network.totalAgentEarned).toBe(250000);
    expect(smembersSpy).not.toHaveBeenCalled();
    expect(mgetSpy).toHaveBeenCalledWith(["agent:edge:u3@paayh.com", "agent:edge:u2@paayh.com"]);
    expect(mgetSpy).toHaveBeenCalledWith(["agent:status:u3@paayh.com", "agent:status:u2@paayh.com"]);
  });
});

describe("Edge Middleware Bundle Safety & Edge Rejoin Helper", () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = origFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("edgeRejoinHelper.ts and auth0.ts never import ioredis or node: builtins", () => {
    const edgeHelperImports = fs
      .readFileSync(path.join(process.cwd(), "lib", "edgeRejoinHelper.ts"), "utf8")
      .split(/\r?\n/)
      .filter((l) => /^\s*import\b/.test(l))
      .join("\n");
    const auth0Src = fs.readFileSync(path.join(process.cwd(), "lib", "auth0.ts"), "utf8");

    expect(edgeHelperImports).not.toMatch(/ioredis|["']node:|redis["']/);
    expect(auth0Src).not.toContain("authHelper");
    expect(auth0Src).toContain("./edgeRejoinHelper");
  });

  it("blocks perm_banned emails and clears self-deactivation + Upstash cache via REST", async () => {
    const delMock = vi.fn().mockResolvedValue({ error: null });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as unknown as typeof fetch;

    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token_123";

    let mode: "perm" | "self" = "perm";

    vi.doMock("../utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => {
          const chain: any = {
            select: vi.fn(() => chain),
            delete: vi.fn(() => ({
              ilike: delMock,
              eq: delMock,
            })),
            ilike: vi.fn(() => chain),
            maybeSingle: vi.fn(async () => {
              if (table === "deactivated_users") {
                return {
                  data: mode === "perm" ? { email: "u@paayh.com", reason: "admin_perm_banned" } : null,
                  error: null,
                };
              }
              return {
                data: mode === "self" ? { id: "u1", ad_account_status: "deactivated" } : null,
                error: null,
              };
            }),
          };
          return chain;
        }),
      },
    }));

    const { isEmailPermanentlyBannedEdge, clearSelfDeactivationForRejoinEdge } = await import(
      "../edgeRejoinHelper"
    );

    expect(await isEmailPermanentlyBannedEdge("u@paayh.com")).toBe(true);
    expect(await clearSelfDeactivationForRejoinEdge("u@paayh.com")).toEqual({
      allowed: false,
      permanentlyBanned: true,
    });

    mode = "self";
    const rejoinRes = await clearSelfDeactivationForRejoinEdge("rejoin@paayh.com");
    expect(rejoinRes).toEqual({ allowed: true, permanentlyBanned: false });
    expect(delMock).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://redis.example.upstash.io/del/deactivated%3Arejoin%40paayh.com/user_profile%3Arejoin%40paayh.com",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("Route Guards: /api/highlights & /api/feed 500 Prevention", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("GET /api/highlights serves highestBid and targeted empty/active highlights without throwing", async () => {
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("viewer@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue("OK") },
      isRedisReady: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn().mockResolvedValue(null),
      getCachedHighlights: vi.fn().mockResolvedValue(null),
      setCachedHighlights: vi.fn().mockResolvedValue(undefined),
      registerL1HighlightsEvictionHandler: vi.fn(),
    }));
    vi.doMock("@/lib/utils/parsers", () => ({
      safeParseArray: vi.fn((v: unknown) => (Array.isArray(v) ? v : [])),
    }));
    vi.doMock("@/lib/highlights/highlightLifecycle", () => ({
      isHighlightCurrentlyActive: vi.fn().mockReturnValue(true),
      sortHighlightsByBidAndRecency: vi.fn((list: unknown[]) => list),
    }));

    const makeHlDb = () => ({
      from: vi.fn(() => {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          ilike: vi.fn(() => chain),
          in: vi.fn(() => chain),
          or: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          lte: vi.fn(() => chain),
          neq: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(async () => ({ data: [{ bid_price: 2500 }], error: null })),
          maybeSingle: vi.fn(async () => ({
            data: { email: "viewer@paayh.com", country: "Nigeria", interest: "Tech" },
            error: null,
          })),
        };
        return chain;
      }),
    });

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: makeHlDb(),
      supabaseReadOnly: makeHlDb(),
    }));

    const { GET } = await import("../../app/api/highlights/route");

    const bidReq = new NextRequest("https://paayh.com/api/highlights?highestBid=true&interest=Tech");
    const bidRes = await GET(bidReq);
    const bidJson = await bidRes.json();
    expect(bidRes.status).toBe(200);
    expect(bidJson.highestBid).toBe(2500);

    const listReq = new NextRequest("https://paayh.com/api/highlights?interest=Tech&limit=10");
    const listRes = await GET(listReq);
    const listJson = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listJson)).toBe(true);
  });

  it("GET /api/feed handles DB failure safely with structured 500 rather than crashing", async () => {
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("viewer@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/edgeRateLimit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {},
      isRedisReady: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn().mockResolvedValue(null),
      setCachedProfile: vi.fn().mockResolvedValue(undefined),
      registerL1FeedEvictionHandler: vi.fn(),
    }));
    vi.doMock("@/lib/utils/cdnUrl", () => ({
      transformMediaUrlsToCdn: vi.fn((u: unknown) => u),
    }));
    vi.doMock("@/lib/ads/publicAdResolver", () => ({
      isAdRowActiveAndAvailable: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/targetingEngine", () => ({
      computeCampaignBroadeningPlan: vi.fn(),
      evaluateAdTargeting: vi.fn().mockReturnValue(true),
      rankAndFilterTargetedAds: vi.fn((ads: unknown[]) => ads),
      signAdImpressionToken: vi.fn().mockReturnValue("tok"),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn(() => {
          throw new Error("Simulated transient DB failure");
        }),
      },
      supabaseReadOnly: {
        from: vi.fn(() => {
          throw new Error("Simulated transient DB failure");
        }),
      },
    }));

    const { GET } = await import("../../app/api/feed/route");
    const req = new NextRequest("https://paayh.com/api/feed");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("GET /api/feed falls back to DB instead of throwing 500 when redisConnection.mget returns null", async () => {
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("viewer@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/edgeRateLimit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {
        pipeline: vi.fn(() => ({
          get: vi.fn(),
          set: vi.fn(),
          smembers: vi.fn(),
          hgetall: vi.fn(),
          exec: vi.fn().mockResolvedValue([
            [null, JSON.stringify(["ad-null-mget-1"])],
            [null, JSON.stringify({ "adv@paayh.com": { email: "adv@paayh.com", username: "adv" } })],
            [null, []],
            [null, []],
            [null, []],
            [null, {}],
            [null, {}],
            [null, {}],
            [null, {}],
          ]),
        })),
        mget: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        smismember: vi.fn().mockResolvedValue([]),
      },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn().mockResolvedValue({
        email: "viewer@paayh.com",
        country: "Nigeria",
        state: "Lagos",
        interest: ["Tech"],
        gender: "all",
      }),
      setCachedProfile: vi.fn().mockResolvedValue(undefined),
      registerL1FeedEvictionHandler: vi.fn(),
    }));
    vi.doMock("@/lib/utils/cdnUrl", () => ({
      transformMediaUrlsToCdn: vi.fn((u: unknown) => u),
    }));
    vi.doMock("@/lib/ads/publicAdResolver", () => ({
      isAdRowActiveAndAvailable: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/targetingEngine", () => ({
      computeCampaignBroadeningPlan: vi.fn(() => ({
        isScheduledFuture: false,
        broadeningStage: 0,
        effectiveUserCap: 5,
        dailyUserCap: 5,
        minSpacingMs: 0,
      })),
      evaluateAdTargeting: vi.fn().mockReturnValue({ matches: true }),
      rankAndFilterTargetedAds: vi.fn((ads: unknown[]) => ads),
      signAdImpressionToken: vi.fn().mockReturnValue("tok"),
    }));

    const sampleAd = {
      id: "ad-null-mget-1",
      ad_content: "Fallback DB Ad",
      ad_type: "business",
      ad_media_type: "text",
      user_email: "adv@paayh.com",
      country: "Nigeria",
      impressions: 1000,
      impression_count: 10,
      cost_per_impression: 25,
      created_at: new Date().toISOString(),
    };

    const makeDb = () => ({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "rpc unavailable" } }),
      from: vi.fn((table: string) => {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          neq: vi.fn(() => chain),
          is: vi.fn(() => chain),
          or: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          in: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(async () => ({
            data: table === "addsactive" ? [sampleAd] : [],
            error: null,
          })),
          then: (resolve: (val: unknown) => unknown) =>
            resolve({ data: table === "addsactive" ? [sampleAd] : [], error: null }),
        };
        return chain;
      }),
    });

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: makeDb(),
      supabaseReadOnly: makeDb(),
    }));

    const { GET } = await import("../../app/api/feed/route");
    const req = new NextRequest("https://paayh.com/api/feed?limit=5&offset=0");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.ads)).toBe(true);
    expect(json.ads[0]?.id).toBe("ad-null-mget-1");
  });
});
