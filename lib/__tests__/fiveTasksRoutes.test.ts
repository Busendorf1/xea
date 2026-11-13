import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { isAdRowActiveAndAvailable } from "../ads/publicAdResolver";
import {
  computeCampaignBroadeningPlan,
  evaluateAdTargeting,
  rankAndFilterTargetedAds,
  signAdImpressionToken,
} from "../targetingEngine";

describe("Route Regression Guards: /api/profile & /api/feed", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("GET /api/profile never leaks DB error details on auto-provision fetch failure", async () => {
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("newuser@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn().mockResolvedValue(null),
      setCachedProfile: vi.fn().mockResolvedValue(undefined),
      registerL1FeedEvictionHandler: vi.fn(),
    }));
    vi.doMock("@/lib/utils/activityTracker", () => ({
      touchUserActivity: vi.fn(),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {},
      isRedisReady: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/security/piiCrypto", () => ({
      decryptProfilePII: vi.fn((u: Record<string, unknown>) => u),
      encryptSensitiveField: vi.fn((v: unknown) => v),
    }));

    const mockChain: {
      select: ReturnType<typeof vi.fn>;
      ilike: ReturnType<typeof vi.fn>;
      order: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
    } = {
      select: vi.fn(() => mockChain),
      ilike: vi.fn(() => mockChain),
      order: vi.fn(() => mockChain),
      limit: vi.fn(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    mockChain.limit
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "PGRST_SECRET_SCHEMA_DETAIL" } });

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn(() => mockChain),
        rpc: vi.fn().mockResolvedValue({ error: null }),
      },
    }));

    const { GET } = await import("../../app/api/profile/route");
    const req = new NextRequest("https://paayh.com/api/profile");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Try again later");
    expect(JSON.stringify(json)).not.toContain("PGRST_SECRET_SCHEMA_DETAIL");
  });

  it("GET /api/feed fast-rejects malformed sharedAdId, pins existing sharedAd to index 0, and hydrates missing shared publisher profile", async () => {
    const sharedPkLookupSpy = vi.fn();

    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("viewer@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/edgeRateLimit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    }));
    vi.doMock("@/lib/ads/publicAdResolver", () => ({
      isAdRowActiveAndAvailable,
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {},
      isRedisReady: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/cdnUrl", () => ({
      transformMediaUrlsToCdn: vi.fn((u: unknown) => u),
    }));
    vi.doMock("../services/cronOrchestrator", () => ({
      triggerSelfHealingJobsIfDue: vi.fn(),
    }));
    vi.doMock("@/lib/targetingEngine", () => ({
      computeCampaignBroadeningPlan,
      evaluateAdTargeting,
      rankAndFilterTargetedAds,
      signAdImpressionToken,
    }));

    const viewerProfile = {
      email: "viewer@paayh.com",
      country: "Nigeria",
      interest: "Tech",
    };

    const ad1 = {
      id: "ad_regular_1",
      user_email: "pub1@paayh.com",
      ad_content: "First regular ad",
      is_paused: false,
      completed_at: null,
      impressions: 100,
      impression_count: 10,
      cost_per_impression: 1,
      targeting_all: true,
    };

    const ad2 = {
      id: "ad_shared_2",
      user_email: "pub1@paayh.com",
      ad_content: "Shared ad already in feed at index 1",
      is_paused: false,
      completed_at: null,
      impressions: 100,
      impression_count: 10,
      cost_per_impression: 1,
      targeting_all: true,
    };

    const adExternal = {
      id: "ad_shared_ext",
      user_email: "extpub@paayh.com",
      ad_content: "Shared ad not in initial pool",
      is_paused: false,
      completed_at: null,
      impressions: 100,
      impression_count: 10,
      cost_per_impression: 1,
      targeting_all: true,
    };

    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn().mockResolvedValue(viewerProfile),
      registerL1FeedEvictionHandler: vi.fn(),
    }));

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      supabaseReadOnly: {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "no rpc" } }),
        from: vi.fn((table: string) => {
          if (table === "seen_ads" || table === "deactivated_users") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
          if (table === "addsactive") {
            const poolChain: {
              is: ReturnType<typeof vi.fn>;
              or: ReturnType<typeof vi.fn>;
              order: ReturnType<typeof vi.fn>;
              limit: ReturnType<typeof vi.fn>;
            } = {
              is: vi.fn(() => poolChain),
              or: vi.fn(() => poolChain),
              order: vi.fn(() => poolChain),
              limit: vi.fn().mockResolvedValue({ data: [ad1, ad2], error: null }),
            };
            return {
              select: vi.fn(() => ({
                ...poolChain,
                eq: vi.fn((col: string, val: unknown) => {
                  if (col === "id") {
                    sharedPkLookupSpy(val);
                    const found = val === "ad_shared_2" ? ad2 : val === "ad_shared_ext" ? adExternal : null;
                    return {
                      maybeSingle: vi.fn().mockResolvedValue({ data: found, error: null }),
                    };
                  }
                  return poolChain;
                }),
              })),
            };
          }
          if (table === "users") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn((_col: string, emails: string[]) => {
                if (emails.includes("extpub@paayh.com")) {
                  return {
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          email: "extpub@paayh.com",
                          username: "extbrand",
                          business_name: "External Brand Co",
                          monetized: true,
                        },
                        error: null,
                      }),
                    }),
                  };
                }
                return Promise.resolve({
                  data: [{ email: "pub1@paayh.com", username: "pub1", business_name: "Pub One", monetized: false }],
                  error: null,
                });
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }),
      },
    }));

    const { GET } = await import("../../app/api/feed/route");

    // 1. Invalid sharedAdId should immediately mark sharedAdUnavailable without DB PK lookup and return 0 ads
    const badRes = await GET(new NextRequest("https://paayh.com/api/feed?sharedAdId=bad%20id!!"));
    const badJson = await badRes.json();
    expect(badRes.status).toBe(200);
    expect(badJson.sharedAdMode).toBe(true);
    expect(badJson.sharedAdUnavailable).toBe(true);
    expect(badJson.ads).toHaveLength(0);
    expect(sharedPkLookupSpy).not.toHaveBeenCalled();

    // 2. Valid sharedAdId renders ONLY that single ad (zero other feed ads leaked)
    const goodRes = await GET(new NextRequest("https://paayh.com/api/feed?sharedAdId=ad_shared_2"));
    const goodJson = await goodRes.json();
    expect(goodRes.status).toBe(200);
    expect(goodJson.sharedAdMode).toBe(true);
    expect(goodJson.ads).toHaveLength(1);
    expect(goodJson.ads?.[0]?.id).toBe("ad_shared_2");

    // 3. Pagination (offset > 0) in sharedAdId mode returns empty array (no extra ads around it)
    const pagedRes = await GET(new NextRequest("https://paayh.com/api/feed?sharedAdId=ad_shared_2&offset=10"));
    const pagedJson = await pagedRes.json();
    expect(pagedRes.status).toBe(200);
    expect(pagedJson.sharedAdMode).toBe(true);
    expect(pagedJson.ads).toHaveLength(0);

    // 4. Valid sharedAdId outside pool renders ONLY that single ad and hydrates its publisher profile
    const extRes = await GET(new NextRequest("https://paayh.com/api/feed?sharedAdId=ad_shared_ext"));
    const extJson = await extRes.json();
    expect(extRes.status).toBe(200);
    expect(extJson.sharedAdMode).toBe(true);
    expect(extJson.ads).toHaveLength(1);
    expect(extJson.ads?.[0]?.id).toBe("ad_shared_ext");
    expect(extJson.profiles?.["extpub@paayh.com"]?.business_name).toBe("External Brand Co");
  });
});
