import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function makeJsonReq(url: string, method = "POST", body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Core API Campaigns, Boost, Cron & Real-Time Buffers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("POST /api/monetize & /api/campaigns/rate-listeners & /api/campaigns/report security checks", async () => {
    vi.doMock("@/lib/redis", () => ({ default: { status: "end" }, isRedisReady: () => false }));
    vi.doMock("@/lib/edgeRateLimit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "attacker@paayh.com"),
      isAdminEmail: vi.fn(() => false),
    }));
    vi.doMock("@/lib/adminHelper", () => import("../adminHelper"));
    vi.doMock("@/lib/attentionTierEngine", () => import("../attentionTierEngine"));
    vi.doMock("@/lib/targetingEngine", () => import("../targetingEngine"));
    vi.doMock("@/lib/env", () => ({ env: { NODE_ENV: "test" } }));
    vi.doMock("@/lib/affiliateEngine", () => ({ flushPendingAffiliateYield: vi.fn(async () => 0) }));
    vi.doMock("@/lib/notifications/milestoneNotifications", () => ({
      snapshotUserLevelsByEmails: vi.fn(async () => new Map()),
      notifyUpgradedUsersFromLevelMap: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/queue", () => ({ adRatingQueue: { add: vi.fn(async () => {}) } }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn(async () => {}),
      evictAdFromL1FeedCaches: vi.fn(),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => {
      const mockDb = {
        rpc: vi.fn(),
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          insert: vi.fn(async () => ({ error: null })),
          upsert: vi.fn(async () => ({ error: null })),
          maybeSingle: vi.fn(async () => {
            if (table === "completed_ads") {
              return { data: { user_email: "realowner@paayh.com" }, error: null };
            }
            return { data: null, error: null };
          }),
        })),
      };
      return { default: mockDb, supabaseReadOnly: mockDb };
    });

    // 1. Monetize POST rejects arbitrary adId without verification token
    const monetizeRoute = await import("../../app/api/monetize/route");
    const monRes = await monetizeRoute.POST(
      makeJsonReq("http://localhost:3000/api/monetize", "POST", { adId: "arbitrary-ad" })
    );
    expect(monRes.status).toBe(403);

    // 2. Rate-listeners rejects non-owner with 403
    const rateRoute = await import("../../app/api/campaigns/rate-listeners/route");
    const rateRes = await rateRoute.POST(
      makeJsonReq("http://localhost:3000/api/campaigns/rate-listeners", "POST", {
        ad_id: "comp-1",
        star_rating: 5,
      })
    );
    expect(rateRes.status).toBe(403);

    // 3. Report route accepts block_ad alias cleanly
    const reportRoute = await import("../../app/api/campaigns/report/route");
    const repRes = await reportRoute.POST(
      makeJsonReq("http://localhost:3000/api/campaigns/report", "POST", {
        adId: "ad-1",
        reportType: "block_ad",
      })
    );
    expect(repRes.status).toBe(200);
    const repJson = await repRes.json();
    expect(repJson.reportType).toBe("ad");
  });

  it("Highlights submit IDOR blocked & Boost enforces PIN + calculates simultaneous addImpressions + higher bid accurately", async () => {
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "attacker@paayh.com"),
      isAdminEmail: vi.fn(() => false),
    }));
    vi.doMock("@/lib/services/cleanupService", () => ({
      cleanupExpiredApprovedCampaigns: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedUserCampaigns: vi.fn(async () => {}),
      invalidateCachedProfile: vi.fn(async () => {}),
      evictAdFromL1FeedCaches: vi.fn(),
      invalidateSharedHighlightsPool: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/webhookDispatcher", () => ({
      dispatchNotificationWebhook: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => {
            if (table === "newsactive") {
              return { data: { id: "hl-1", user_email: "victim@paayh.com", campaign_days: 3 }, error: null };
            }
            if (table === "addsactive") {
              return {
                data: {
                  id: "ad-boost-1",
                  user_email: "attacker@paayh.com",
                  cost_per_impression: 25,
                  impressions: 1000,
                  impression_count: 200,
                  is_paused: false,
                },
                error: null,
              };
            }
            if (table === "users") {
              return { data: { balance: 100000, ad_account_status: "active" }, error: null };
            }
            return { data: null, error: null };
          }),
        })),
      },
    }));

    // 1. Highlight editingId IDOR rejected 403
    const hlSubmit = await import("../../app/api/highlights/submit/route");
    const hlRes = await hlSubmit.POST(
      makeJsonReq("http://localhost:3000/api/highlights/submit", "POST", {
        editingId: "hl-1",
        highlightData: { title: "Hijacked", content: "x", imageUrl: "https://img/x.png" },
      })
    );
    expect(hlRes.status).toBe(403);

    // 2. Boost PIN fail-closed + simultaneous bid upgrade (25 -> 35 on 800 remaining = 8000) + 500 * 35 = 25500 totalCost
    vi.resetModules();
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "attacker@paayh.com"),
      isAdminEmail: vi.fn(() => false),
    }));
    vi.doMock("@/lib/redis", () => ({ default: { status: "end" }, isRedisReady: () => false }));
    vi.doMock("@/lib/payment/payoutProvider", () => ({ PayoutProvider: {} }));
    const spendSpy = vi.fn(async () => ({ success: false }));
    vi.doMock("@/lib/services/payoutSettlementService", () => ({
      spendWalletBalanceAtomic: spendSpy,
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn(async () => {}),
      invalidateCachedUserCampaigns: vi.fn(async () => {}),
      evictAdFromL1FeedCaches: vi.fn(),
      invalidateSharedHighlightsPool: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/webhookDispatcher", () => ({
      dispatchNotificationWebhook: vi.fn(async () => {}),
    }));
    let pinHash: string | null = null;
    vi.doMock("@/lib/security/walletPinHelper", () => ({
      resolveStoredWalletPinHash: (row: any) => row?.wallet_pin_hash || null,
      verifyTransactionPin: vi.fn(async ({ pin, storedPinHash }: any) => {
        if (!storedPinHash) {
          return { valid: false, statusCode: 403, code: "PIN_NOT_SET", error: "Wallet PIN is not set." };
        }
        if (pin !== "1234") {
          return { valid: false, statusCode: 401, error: "Invalid PIN" };
        }
        return { valid: true };
      }),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          limit: vi.fn(async () => ({ data: [], error: null })),
          maybeSingle: vi.fn(async () => {
            if (table === "addsactive") {
              return {
                data: {
                  id: "ad-boost-1",
                  user_email: "attacker@paayh.com",
                  cost_per_impression: 25,
                  impressions: 1000,
                  impression_count: 200,
                },
                error: null,
              };
            }
            if (table === "users") {
              return { data: { balance: 20000, wallet_pin_hash: pinHash }, error: null };
            }
            return { data: null, error: null };
          }),
        })),
      },
    }));

    const boostRoute = await import("../../app/api/campaigns/boost/route");

    const noPinRes = await boostRoute.POST(
      makeJsonReq("http://localhost:3000/api/campaigns/boost", "POST", {
        adId: "ad-boost-1",
        paymentMethod: "wallet",
        additionalImpressions: 500,
        newCostPerImpression: 35,
      })
    );
    const noPinJson = await noPinRes.json();
    expect(noPinRes.status).toBe(403);
    expect(noPinJson.code).toBe("PIN_NOT_SET");
    expect(spendSpy).not.toHaveBeenCalled();

    pinHash = "stored-hash";
    const boostRes = await boostRoute.POST(
      makeJsonReq("http://localhost:3000/api/campaigns/boost", "POST", {
        adId: "ad-boost-1",
        paymentMethod: "wallet",
        additionalImpressions: 500,
        newCostPerImpression: 35,
        pin: "1234",
      })
    );
    const boostJson = await boostRes.json();
    expect(boostRes.status).toBe(400);
    expect(spendSpy).toHaveBeenCalledWith(
      "attacker@paayh.com",
      25500,
      "boost_campaign",
      expect.any(String)
    );
    expect(String(boostJson.error)).toContain("25,500");
  });

  it("Cron database-cleanup respects actual highlight expiry & creates forfeited_balances + deactivates in 60-day fallback", async () => {
    const newsDeletedIds: string[] = [];
    const forfeitedInserts: any[] = [];
    const deactivatedUpdates: any[] = [];

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const seventyDaysAgo = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString();

    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.doMock("@/lib/adminHelper", () => import("../adminHelper"));
    vi.doMock("@/lib/utils/storageCleaner", () => ({ purgeStorageMedia: vi.fn(async () => {}) }));
    vi.doMock("@/lib/services/cleanupService", () => ({ cleanupExpiredApprovedCampaigns: vi.fn(async () => {}) }));
    vi.doMock("@/lib/affiliateEngine", () => ({ flushPendingAffiliateYield: vi.fn(async () => 0) }));
    vi.doMock("@/lib/redis", () => ({
      default: {
        zrangebyscore: vi.fn(async () => []),
      },
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        storage: { from: vi.fn(() => ({ remove: vi.fn(async () => ({})) })) },
        rpc: vi.fn(async () => ({ data: null, error: { message: "force fallback" } })),
        from: vi.fn((table: string) => {
          const chain: any = {
            select: vi.fn(() => chain),
            delete: vi.fn(() => chain),
            not: vi.fn(() => chain),
            lt: vi.fn(() => chain),
            neq: vi.fn(() => chain),
            or: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            in: vi.fn(async (col: string, vals: any[]) => {
              if (table === "newsactive" && col === "id") {
                newsDeletedIds.push(...vals);
              }
              return { data: [], error: null };
            }),
            update: vi.fn((payload: any) => {
              if (table === "users" && payload?.ad_account_status === "deactivated") {
                deactivatedUpdates.push(payload);
              }
              return chain;
            }),
            insert: vi.fn(async (payload: any) => {
              if (table === "forfeited_balances") {
                forfeitedInserts.push(payload);
              }
              return { error: null };
            }),
            upsert: vi.fn(async () => ({ error: null })),
            limit: vi.fn(async () => {
              if (table === "newsactive") {
                return {
                  data: [
                    { id: "hl-still-active", created_at: twoDaysAgo, campaign_days: 5 },
                    { id: "hl-expired", created_at: tenDaysAgo, campaign_days: 3 },
                  ],
                  error: null,
                };
              }
              if (table === "users") {
                return {
                  data: [
                    {
                      id: "u-dormant",
                      email: "dormant@paayh.com",
                      username: "dormant",
                      balance: 1200,
                      last_active_at: seventyDaysAgo,
                      ad_account_status: "active",
                    },
                  ],
                  error: null,
                };
              }
              return { data: [], error: null };
            }),
          };
          return chain;
        }),
      },
    }));

    const { GET } = await import("../../app/api/cron/database-cleanup/route");
    const req = new NextRequest("http://localhost:3000/api/cron/database-cleanup", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(newsDeletedIds).toEqual(["hl-expired"]);
    expect(forfeitedInserts.length).toBeGreaterThanOrEqual(1);
    expect(forfeitedInserts[0].amount).toBe(1200);
    expect(deactivatedUpdates.length).toBeGreaterThanOrEqual(1);
    vi.unstubAllEnvs();
  });

  it("GET /api/campaigns + getPendingClickDeltas overlay real-time Redis click buffers across all 9 CTA hashes", async () => {
    const hashData: Record<string, Record<string, string>> = {
      "buffer:ad_impressions": { "ad-live-1": "7" },
      "buffer:clicks_phone": { "ad-live-1": "3" },
      "buffer:clicks_whatsapp": { "ad-live-1": "2" },
      "buffer:clicks_website": { "ad-live-1": "4" },
      "buffer:clicks_email": { "ad-live-1": "1" },
      "buffer:clicks_product_cta": { "ad-live-1": "5" },
      "buffer:clicks_ios": { "ad-live-1": "2" },
      "buffer:clicks_android": { "ad-live-1": "6" },
      "buffer:clicks_watch_now": { "ad-live-1": "3" },
      "buffer:clicks_read_more": { "ad-live-1": "8" },
    };

    const mockRedis = {
      status: "ready",
      hmget: vi.fn(async (key: string, ...ids: string[]) =>
        ids.map((id) => hashData[key]?.[id] ?? null)
      ),
      pipeline: vi.fn(() => {
        const queued: Array<[string, string[]]> = [];
        const p: any = {
          hmget: vi.fn((key: string, ...ids: string[]) => {
            queued.push([key, ids]);
            return p;
          }),
          exec: vi.fn(async () =>
            queued.map(([key, ids]) => [null, ids.map((id) => hashData[key]?.[id] ?? null)])
          ),
        };
        return p;
      }),
    };

    vi.doMock("@/lib/redis", () => ({ default: mockRedis, isRedisReady: () => true }));
    vi.doMock("../redis", () => ({ default: mockRedis, isRedisReady: () => true }));
    vi.doMock("@/lib/edgeRateLimit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "adv@paayh.com"),
      isAdminEmail: vi.fn(() => false),
    }));
    vi.doMock("@/lib/services/cleanupService", () => ({
      cleanupExpiredApprovedCampaigns: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/services/cronOrchestrator", () => ({
      triggerSelfHealingJobsIfDue: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedUserCampaigns: vi.fn(async () => null),
      setCachedUserCampaigns: vi.fn(async () => {}),
      invalidateCachedUserCampaigns: vi.fn(async () => {}),
      evictAdFromL1FeedCaches: vi.fn(),
    }));
    vi.doMock("@/lib/impressionBuffer", () => import("../impressionBuffer"));
    vi.doMock("@/lib/ads/campaignAnalytics", () => import("../ads/campaignAnalytics"));
    vi.doMock("@/lib/utils/dbAdmin", () => {
      const makeReadChain = (table: string): any => {
        const chain: any = {
          select: vi.fn(() => chain),
          ilike: vi.fn(() => chain),
          is: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          in: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve: (val: any) => void) => {
            if (table === "addsactive") {
              return resolve({
                data: [
                  {
                    id: "ad-live-1",
                    user_email: "adv@paayh.com",
                    impression_count: 10,
                    clicks_phone: 1,
                    clicks_whatsapp: 0,
                    clicks_website: 2,
                    clicks_email: 0,
                    clicks_product_cta: 5,
                    clicks_ios: 1,
                    clicks_android: 0,
                    clicks_watch_now: 2,
                    clicks_read_more: 1,
                  },
                ],
                error: null,
              });
            }
            if (table === "blocked_advertisers") {
              return resolve({ count: 0, error: null });
            }
            return resolve({ data: [], error: null });
          },
        };
        return chain;
      };
      const mockDb = { from: vi.fn((table: string) => makeReadChain(table)) };
      return { default: mockDb, supabaseReadOnly: mockDb };
    });

    const { GET } = await import("../../app/api/campaigns/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/campaigns?refresh=true"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.adsActive).toHaveLength(1);
    const ad = json.adsActive[0];
    expect(ad.impression_count).toBe(17);
    expect(ad.clicks_phone).toBe(4);
    expect(ad.clicks_whatsapp).toBe(2);
    expect(ad.clicks_website).toBe(6);
    expect(ad.clicks_email).toBe(1);
    expect(ad.clicks_product_cta).toBe(10);
    expect(ad.clicks_ios).toBe(3);
    expect(ad.clicks_android).toBe(6);
    expect(ad.clicks_watch_now).toBe(5);
    expect(ad.clicks_read_more).toBe(9);
  });

  it("GET /api/campaigns computes analyticsSeries (14d UTC buckets + live overlay) and analyticsSummary + per-ad spend/CPC", async () => {
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const todayDate = new Date().toISOString().slice(0, 10);
    const yesterdayDate = yesterdayIso.slice(0, 10);

    const mockRedis = {
      status: "ready",
      hmget: vi.fn(async (key: string, ...ids: string[]) =>
        ids.map((id) =>
          key === "buffer:ad_impressions" && id === "ad-paid"
            ? "5"
            : key === "buffer:clicks_website" && id === "ad-paid"
              ? "2"
              : null
        )
      ),
    };

    vi.doMock("@/lib/redis", () => ({ default: mockRedis, isRedisReady: () => true }));
    vi.doMock("../redis", () => ({ default: mockRedis, isRedisReady: () => true }));
    vi.doMock("@/lib/edgeRateLimit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "adv@paayh.com"),
      isAdminEmail: vi.fn(() => false),
    }));
    vi.doMock("@/lib/services/cleanupService", () => ({
      cleanupExpiredApprovedCampaigns: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/services/cronOrchestrator", () => ({
      triggerSelfHealingJobsIfDue: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedUserCampaigns: vi.fn(async () => null),
      setCachedUserCampaigns: vi.fn(async () => {}),
      invalidateCachedUserCampaigns: vi.fn(async () => {}),
      evictAdFromL1FeedCaches: vi.fn(),
    }));
    vi.doMock("@/lib/impressionBuffer", () => import("../impressionBuffer"));
    vi.doMock("@/lib/ads/campaignAnalytics", () => import("../ads/campaignAnalytics"));
    vi.doMock("@/lib/utils/dbAdmin", () => {
      const makeChain = (table: string): any => {
        const chain: any = {
          select: vi.fn(() => chain),
          ilike: vi.fn(() => chain),
          is: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          in: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          then: (resolve: (val: any) => void) => {
            if (table === "ad_impressions") {
              return resolve({
                data: [
                  { ad_id: "ad-paid", view_count: 15, last_viewed_at: yesterdayIso },
                ],
                error: null,
              });
            }
            if (table === "addsactive") {
              return resolve({
                data: [
                  {
                    id: "ad-paid",
                    user_email: "adv@paayh.com",
                    total_cost: 4000,
                    impression_count: 20, // +5 Redis = 25
                    daily_impression_count: 5,
                    clicks_website: 3, // +2 Redis = 5
                  },
                  {
                    id: "ad-admin",
                    user_email: "adv@paayh.com",
                    is_admin_post: true,
                    total_cost: 9999,
                    impression_count: 15,
                    daily_impression_count: 0,
                  },
                ],
                error: null,
              });
            }
            if (table === "payments") {
              return resolve({
                data: [
                  {
                    amount: 1000,
                    created_at: yesterdayIso,
                    type: "boost_campaign",
                    metadata: { ad_id: "ad-paid" },
                  },
                ],
                error: null,
              });
            }
            if (table === "blocked_advertisers") {
              return resolve({ count: 0, error: null });
            }
            return resolve({ data: [], error: null });
          },
        };
        return chain;
      };
      const mockDb = { from: vi.fn((table: string) => makeChain(table)) };
      return { default: mockDb, supabaseReadOnly: mockDb };
    });

    const { GET } = await import("../../app/api/campaigns/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/campaigns?refresh=true"));
    const json = await res.json();

    expect(res.status).toBe(200);
    const paidAd = json.adsActive.find((a: any) => a.id === "ad-paid");
    const adminAd = json.adsActive.find((a: any) => a.id === "ad-admin");

    expect(paidAd.total_spend).toBe(5000);
    expect(paidAd.effective_cpc).toBe(1000); // 5000 / 5 clicks
    expect(adminAd.total_spend).toBe(0);
    expect(adminAd.effective_cpc).toBeNull();

    expect(json.analyticsSummary).toEqual({
      totalSpend: 5000,
      totalViews: 40, // 25 + 15
      totalClicks: 5,
      avgCtr: 12.5,
      effectiveCpc: 1000,
      effectiveCpv: 125,
    });
    expect(json.analyticsSeries).toHaveLength(14);
    const yesterdayBucket = json.analyticsSeries.find((p: any) => p.date === yesterdayDate);
    const todayBucket = json.analyticsSeries.find((p: any) => p.date === todayDate);
    expect(yesterdayBucket.views).toBe(15);
    expect(todayBucket.views).toBeGreaterThanOrEqual(5);
    expect(todayBucket.clicks).toBeGreaterThanOrEqual(2);

    // Per-ad 14-day series isolation
    expect(json.adAnalyticsMap?.["ad-paid"]).toHaveLength(14);
    expect(json.adAnalyticsMap?.["ad-admin"]).toHaveLength(14);
    const paidYesterday = json.adAnalyticsMap["ad-paid"].find((p: any) => p.date === yesterdayDate);
    const paidToday = json.adAnalyticsMap["ad-paid"].find((p: any) => p.date === todayDate);
    const adminToday = json.adAnalyticsMap["ad-admin"].find((p: any) => p.date === todayDate);
    expect(paidYesterday.views).toBe(15);
    expect(paidToday.views).toBeGreaterThanOrEqual(5);
    expect(paidToday.clicks).toBeGreaterThanOrEqual(2);
    expect(adminToday.views).toBe(15);
    expect(adminToday.clicks).toBe(0);
  });
});
