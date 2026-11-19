import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function makeJsonReq(url: string, method = "POST", body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Monetization (500 Clicks/Seen) & ATW Milestone Notifications", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("POST /api/seen awaits monetization unlock notification at 500 clicks, works even when liveVal hits 500 ahead of rpcCount, and evicts L1 notification cache", async () => {
    const insertedNotifs: Array<Record<string, unknown>> = [];
    const redisStore = new Map<string, string>();
    const webhookSpy = vi.fn(async () => {});

    const mockRedis = {
      status: "ready",
      get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
      set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
        if (args.includes("NX") && redisStore.has(k)) return null;
        redisStore.set(k, v);
        return "OK";
      }),
      del: vi.fn(async (k: string) => {
        redisStore.delete(k);
        return 1;
      }),
      hget: vi.fn(async () => "0"),
      hset: vi.fn(async () => 1),
      sadd: vi.fn(async () => 1),
      expire: vi.fn(async () => 1),
      pipeline: vi.fn(() => {
        const pipe: Record<string, unknown> = {
          hincrby: vi.fn(() => pipe),
          expire: vi.fn(() => pipe),
          hset: vi.fn(() => pipe),
          sadd: vi.fn(() => pipe),
          del: vi.fn(() => pipe),
          exec: vi.fn(async () => []),
        };
        return pipe;
      }),
    };

    // Prime L1 notification cache with stale empty list BEFORE 500th seen click
    const notifCache = await import("../notifications/notificationCache");
    notifCache.setL1UserNotif("creator@paayh.com", []);
    expect(notifCache.getL1UserNotif("creator@paayh.com")).toEqual([]);

    vi.doMock("@/lib/redis", () => ({ default: mockRedis, isRedisReady: () => true }));
    vi.doMock("@/lib/edgeRateLimit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "Creator@Paayh.com"),
      isAdminEmail: vi.fn(() => false),
    }));
    vi.doMock("@/lib/env", () => ({ env: { NODE_ENV: "test" } }));
    vi.doMock("@/lib/clickhouse", () => ({ streamImpressionsToClickHouse: vi.fn(async () => {}) }));
    vi.doMock("@/lib/impressionBuffer", () => ({ recordCoalescedAdSeen: vi.fn(async () => 11) }));
    vi.doMock("@/lib/webhookDispatcher", () => ({
      dispatchImpressionWebhook: vi.fn(async () => {}),
      dispatchNotificationWebhook: webhookSpy,
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      incrementCachedMonetizationClicks: vi.fn(async () => 500),
      invalidateCachedProfile: vi.fn(async () => {}),
      invalidateCachedUserCampaigns: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        rpc: vi.fn(async (fn: string) => {
          if (fn === "increment_user_click_progress") {
            // Simulate Redis liveVal hitting 500 while RPC returns 499 + is_now_monetized=false
            return { data: [{ new_click_count: 499, is_now_monetized: false }], error: null };
          }
          return { data: null, error: null };
        }),
        from: vi.fn((table: string) => {
          const chain: Record<string, unknown> = {
            select: vi.fn(() => chain),
            update: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            ilike: vi.fn(() => chain),
            gte: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            maybeSingle: vi.fn(async () => {
              if (table === "addsactive") {
                return {
                  data: {
                    is_admin_post: false,
                    cost_per_impression: 25,
                    impressions: 1000,
                    impression_count: 10,
                    user_frequency_cap: 1,
                    user_email: "adv@paayh.com",
                  },
                  error: null,
                };
              }
              if (table === "users") {
                return {
                  data: {
                    id: "u-500",
                    monetization_clicks: 499,
                    monetized: "false",
                    has_cancelled_monetization: false,
                    atw_tier: "ATW1",
                    attention_worth_score: 0.1,
                    is_affiliate: false,
                    is_career: false,
                  },
                  error: null,
                };
              }
              if (table === "notifications") {
                return { data: null, error: null };
              }
              return { data: null, error: null };
            }),
            insert: vi.fn((rows: Array<Record<string, unknown>>) => {
              if (table === "notifications") {
                insertedNotifs.push(...rows);
              }
              return {
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: `notif-${insertedNotifs.length}`,
                      ...rows[0],
                      created_at: new Date().toISOString(),
                    },
                    error: null,
                  })),
                })),
              };
            }),
            then: (resolve: (val: unknown) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(resolve),
          };
          return chain;
        }),
      },
    }));

    const { POST } = await import("../../app/api/seen/route");
    const res = await POST(
      makeJsonReq("http://localhost:3000/api/seen", "POST", { adId: "ad-500" })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.clicksCount).toBe(500);
    expect(json.isMonetized).toBe(true);
    expect(json.milestoneNotified).toBe(true);
    expect(json.monetizationUnlocked).toBe(true);

    // Must already be inserted BEFORE POST /api/seen returned (awaited, not fire-and-forget!)
    expect(insertedNotifs).toHaveLength(1);
    expect(insertedNotifs[0].user_email).toBe("creator@paayh.com");
    expect(String(insertedNotifs[0].title)).toContain("Monetization Unlocked");
    expect(String(insertedNotifs[0].message)).toContain("500 clicks");

    // Must have invalidated stale L1 notification cache so next GET /api/notifications sees it immediately
    expect(notifCache.getL1UserNotif("creator@paayh.com")).toBeNull();
    expect(webhookSpy).toHaveBeenCalledTimes(1);
  });

  it("POST /api/seen awaits ATW2 upgrade notification when crossing 999 -> 1000 clicks", async () => {
    const insertedNotifs: Array<Record<string, unknown>> = [];
    const redisStore = new Map<string, string>();

    const mockRedis = {
      status: "ready",
      get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
      set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
        if (args.includes("NX") && redisStore.has(k)) return null;
        redisStore.set(k, v);
        return "OK";
      }),
      del: vi.fn(async (k: string) => {
        redisStore.delete(k);
        return 1;
      }),
      hget: vi.fn(async () => "0"),
      hset: vi.fn(async () => 1),
      sadd: vi.fn(async () => 1),
      expire: vi.fn(async () => 1),
      pipeline: vi.fn(() => {
        const pipe: Record<string, unknown> = {
          hincrby: vi.fn(() => pipe),
          expire: vi.fn(() => pipe),
          hset: vi.fn(() => pipe),
          sadd: vi.fn(() => pipe),
          del: vi.fn(() => pipe),
          exec: vi.fn(async () => []),
        };
        return pipe;
      }),
    };

    vi.doMock("@/lib/redis", () => ({ default: mockRedis, isRedisReady: () => true }));
    vi.doMock("@/lib/edgeRateLimit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "tierup@paayh.com"),
      isAdminEmail: vi.fn(() => false),
    }));
    vi.doMock("@/lib/env", () => ({ env: { NODE_ENV: "test" } }));
    vi.doMock("@/lib/clickhouse", () => ({ streamImpressionsToClickHouse: vi.fn(async () => {}) }));
    vi.doMock("@/lib/impressionBuffer", () => ({ recordCoalescedAdSeen: vi.fn(async () => 22) }));
    vi.doMock("@/lib/webhookDispatcher", () => ({
      dispatchImpressionWebhook: vi.fn(async () => {}),
      dispatchNotificationWebhook: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      incrementCachedMonetizationClicks: vi.fn(async () => 1000),
      invalidateCachedProfile: vi.fn(async () => {}),
      invalidateCachedUserCampaigns: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        rpc: vi.fn(async (fn: string) => {
          if (fn === "increment_user_click_progress") {
            return { data: [{ new_click_count: 1000, is_now_monetized: true }], error: null };
          }
          return { data: null, error: null };
        }),
        from: vi.fn((table: string) => {
          const chain: Record<string, unknown> = {
            select: vi.fn(() => chain),
            update: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            ilike: vi.fn(() => chain),
            gte: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            maybeSingle: vi.fn(async () => {
              if (table === "addsactive") {
                return {
                  data: {
                    is_admin_post: false,
                    cost_per_impression: 25,
                    impressions: 1000,
                    impression_count: 10,
                    user_frequency_cap: 1,
                    user_email: "adv@paayh.com",
                  },
                  error: null,
                };
              }
              if (table === "users") {
                return {
                  data: {
                    id: "u-1000",
                    monetization_clicks: 999,
                    monetized: "true",
                    has_cancelled_monetization: false,
                    atw_tier: "ATW1",
                    attention_worth_score: 0.1,
                    is_affiliate: false,
                    is_career: false,
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }),
            insert: vi.fn((rows: Array<Record<string, unknown>>) => {
              if (table === "notifications") insertedNotifs.push(...rows);
              return {
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: "notif-atw2", ...rows[0], created_at: new Date().toISOString() },
                    error: null,
                  })),
                })),
              };
            }),
            then: (resolve: (val: unknown) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(resolve),
          };
          return chain;
        }),
      },
    }));

    const { POST } = await import("../../app/api/seen/route");
    const res = await POST(
      makeJsonReq("http://localhost:3000/api/seen", "POST", { adId: "ad-1000" })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.clicksCount).toBe(1000);
    expect(json.atwTier).toBe("ATW2");
    expect(json.atwUpgraded).toBe(true);
    expect(json.milestoneNotified).toBe(true);
    expect(insertedNotifs).toHaveLength(1);
    expect(insertedNotifs[0].title).toBe("ATW Level Upgraded to ATW2");
    expect(String(insertedNotifs[0].message)).toContain("₦60,000");
  });

  it("releases Redis lock on DB insert error so failed attempts do NOT permanently suppress milestone notifications", async () => {
    const redisStore = new Map<string, string>();
    let insertAttempt = 0;
    const insertedNotifs: Array<Record<string, unknown>> = [];

    const mockRedis = {
      status: "ready",
      get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
      set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
        if (args.includes("NX") && redisStore.has(k)) return null;
        redisStore.set(k, v);
        return "OK";
      }),
      del: vi.fn(async (k: string) => {
        redisStore.delete(k);
        return 1;
      }),
    };

    vi.doMock("@/lib/redis", () => ({ default: mockRedis, isRedisReady: () => true }));
    vi.doMock("@/lib/webhookDispatcher", () => ({
      dispatchNotificationWebhook: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          insert: vi.fn((rows: Array<Record<string, unknown>>) => {
            insertAttempt++;
            if (insertAttempt === 1) {
              return {
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: null,
                    error: { message: "transient DB timeout" },
                  })),
                })),
              };
            }
            insertedNotifs.push(...rows);
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: "notif-retry-ok", ...rows[0], created_at: new Date().toISOString() },
                  error: null,
                })),
              })),
            };
          }),
        })),
      },
    }));

    const { checkAndNotifyClickAndAtwMilestones } = await import(
      "../notifications/milestoneNotifications"
    );

    // Attempt 1 fails due to transient DB timeout
    const firstRes = await checkAndNotifyClickAndAtwMilestones({
      email: "retry@paayh.com",
      prevClicks: 499,
      prevMonetized: false,
      nextClicks: 500,
      nextMonetized: true,
    });
    expect(firstRes.monetizationNotified).toBe(false);
    expect(insertedNotifs).toHaveLength(0);

    // Attempt 2 succeeds because the lock was released and long-TTL dedup was never written!
    const secondRes = await checkAndNotifyClickAndAtwMilestones({
      email: "retry@paayh.com",
      prevClicks: 499,
      prevMonetized: false,
      nextClicks: 500,
      nextMonetized: true,
    });
    expect(secondRes.monetizationNotified).toBe(true);
    expect(insertedNotifs).toHaveLength(1);

    // Attempt 3 is deduplicated cleanly
    const thirdRes = await checkAndNotifyClickAndAtwMilestones({
      email: "retry@paayh.com",
      prevClicks: 499,
      prevMonetized: false,
      nextClicks: 500,
      nextMonetized: true,
    });
    expect(thirdRes.monetizationNotified).toBe(false);
    expect(insertedNotifs).toHaveLength(1);
  });

  it("handles SQL-already-inserted recent notification without duplicating row while still invalidating cache and firing webhook", async () => {
    const redisStore = new Map<string, string>();
    const insertSpy = vi.fn();
    const webhookSpy = vi.fn(async () => {});

    const notifCache = await import("../notifications/notificationCache");
    notifCache.setL1UserNotif("sqluser@paayh.com", []);

    const mockRedis = {
      status: "ready",
      get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
      set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
        if (args.includes("NX") && redisStore.has(k)) return null;
        redisStore.set(k, v);
        return "OK";
      }),
      del: vi.fn(async (k: string) => {
        redisStore.delete(k);
        return 1;
      }),
    };

    vi.doMock("@/lib/redis", () => ({ default: mockRedis, isRedisReady: () => true }));
    vi.doMock("@/lib/webhookDispatcher", () => ({
      dispatchNotificationWebhook: webhookSpy,
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({
            data: { id: "sql-notif-1", created_at: new Date().toISOString() },
            error: null,
          })),
          insert: insertSpy,
        })),
      },
    }));

    const { checkAndNotifyClickAndAtwMilestones } = await import(
      "../notifications/milestoneNotifications"
    );

    const res = await checkAndNotifyClickAndAtwMilestones({
      email: "sqluser@paayh.com",
      prevClicks: 499,
      prevMonetized: false,
      nextClicks: 500,
      nextMonetized: true,
      sqlMonetizationNotified: true,
    });

    expect(res.monetizationNotified).toBe(true);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(webhookSpy).toHaveBeenCalledTimes(1);
    expect(notifCache.getL1UserNotif("sqluser@paayh.com")).toBeNull();
  });

  it("GET /api/monetize promotes user crossing 500 via liveClicks and sends monetization unlock notification", async () => {
    const insertedNotifs: Array<Record<string, unknown>> = [];
    const redisStore = new Map<string, string>();
    redisStore.set("user:live_clicks:v2:syncuser@paayh.com", "500");

    const mockRedis = {
      status: "ready",
      mget: vi.fn(async () => [null, "500"]),
      get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
      set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
        if (args.includes("NX") && redisStore.has(k)) return null;
        redisStore.set(k, v);
        return "OK";
      }),
      del: vi.fn(async (k: string) => {
        redisStore.delete(k);
        return 1;
      }),
    };

    vi.doMock("@/lib/redis", () => ({ default: mockRedis, isRedisReady: () => true }));
    vi.doMock("@/lib/edgeRateLimit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "syncuser@paayh.com"),
      isAdminEmail: vi.fn(() => false),
    }));
    vi.doMock("@/lib/env", () => ({ env: { NODE_ENV: "test" } }));
    vi.doMock("@/lib/affiliateEngine", () => ({ flushPendingAffiliateYield: vi.fn(async () => 0) }));
    vi.doMock("@/lib/webhookDispatcher", () => ({
      dispatchNotificationWebhook: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => {
      const dbMock = {
        rpc: vi.fn(async () => ({ data: null, error: null })),
        from: vi.fn((table: string) => {
          const chain: Record<string, unknown> = {
            select: vi.fn(() => chain),
            update: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            ilike: vi.fn(() => chain),
            gte: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            maybeSingle: vi.fn(async () => {
              if (table === "users") {
                return {
                  data: {
                    id: "u-sync",
                    balance: 0,
                    monetized: "false",
                    monetized_at: null,
                    monetization_clicks: 499,
                    referral_code: "REF1",
                    atw_tier: "ATW1",
                    attention_worth_score: 0.1,
                    last_active_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    is_affiliate: false,
                    is_career: false,
                    has_cancelled_monetization: false,
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }),
            insert: vi.fn((rows: Array<Record<string, unknown>>) => {
              if (table === "notifications") insertedNotifs.push(...rows);
              return {
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: "notif-mon-get", ...rows[0], created_at: new Date().toISOString() },
                    error: null,
                  })),
                })),
              };
            }),
            then: (resolve: (val: unknown) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(resolve),
          };
          return chain;
        }),
      };
      return { default: dbMock, supabaseReadOnly: dbMock };
    });

    const { GET } = await import("../../app/api/monetize/route");
    const res = await GET(makeJsonReq("http://localhost:3000/api/monetize", "GET"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.isMonetized).toBe(true);
    expect(json.clicksCount).toBe(500);
    expect(insertedNotifs).toHaveLength(1);
    expect(String(insertedNotifs[0].title)).toContain("Monetization Unlocked");
  });
});
