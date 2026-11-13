import crypto from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  computeAtwTierDetails,
  getAtwBalanceLimit,
} from "../attentionTierEngine";
import { rankAndFilterTargetedAds } from "../targetingEngine";

function makeJsonReq(url: string, method = "POST", body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Canonical ATW & Rating Score Engine", () => {
  it("matches SQL compute_atw_level progression (300/tier, capped at ATW14 ₦420k) and integrates rating boost", () => {
    const entry = computeAtwTierDetails(0, "ATW1", false, 0.1);
    expect(entry.tierCode).toBe("ATW1");
    expect(entry.holdingCap).toBe(30000);

    const step1 = computeAtwTierDetails(300, "ATW1", false, 0.1);
    expect(step1.tierCode).toBe("ATW1");
    expect(step1.holdingCap).toBe(30000);

    // 585 clicks + 0.15 score (+0.05 = +15 click-equivalents) => 600 effectiveClicks => ATW2
    const rated = computeAtwTierDetails(585, "ATW1", false, 0.15);
    expect(rated.ratingBonusClicks).toBe(15);
    expect(rated.effectiveClicks).toBe(600);
    expect(rated.tierCode).toBe("ATW2");
    expect(rated.holdingCap).toBe(60000);
    expect(getAtwBalanceLimit("ATW1", false, 585, 0.15)).toBe(60000);

    const max = computeAtwTierDetails(6000, "ATW10", false, 2.0);
    expect(max.tierCode).toBe("ATW14");
    expect(max.holdingCap).toBe(420000);
  });
});

describe("Targeting Engine Strict Fallback Control", () => {
  it("disables Pass 3 nearest-match fallback when allowNearestFallback is false", () => {
    const ads = [
      {
        id: "ad-usa",
        user_email: "adv@example.com",
        country: "United States",
        state: "California",
        impressions: 100,
        impression_count: 10,
        cost_per_impression: 50,
        bid_price: 80,
      },
    ];
    const viewer = {
      email: "viewer@example.com",
      country: "Nigeria",
      state: "Lagos",
      interest: "Tech",
    };

    const filtered = rankAndFilterTargetedAds(ads, viewer, {
      allowNearestFallback: false,
      minResults: 10,
    });
    expect(filtered).toHaveLength(0);
  });
});

describe("Core API Security & Architecture Hardening", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("POST /api/earn: PoH kinematics failure does NOT burn earn_token or attention_pace, so POH_RETRY succeeds on retry", async () => {
    const redisStore = new Map<string, string>();
    const setCalls: string[] = [];

    const mockRedis = {
      status: "ready",
      exists: vi.fn(async (k: string) => (redisStore.has(k) ? 1 : 0)),
      get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
      set: vi.fn(async (k: string, v: string, ...args: any[]) => {
        setCalls.push(k);
        if (args.includes("NX") && redisStore.has(k)) return null;
        redisStore.set(k, v);
        return "OK";
      }),
      del: vi.fn(async (k: string) => {
        redisStore.delete(k);
        return 1;
      }),
      incr: vi.fn(async (k: string) => {
        const next = Number(redisStore.get(k) || "0") + 1;
        redisStore.set(k, String(next));
        return next;
      }),
      expire: vi.fn(async () => 1),
      lrange: vi.fn(async () => []),
      lpush: vi.fn(async () => 1),
      ltrim: vi.fn(async () => "OK"),
      sadd: vi.fn(async () => 1),
      hincrby: vi.fn(async () => 1),
      hset: vi.fn(async () => 1),
      pipeline: vi.fn(() => {
        const p: any = {
          lpush: vi.fn(() => p),
          ltrim: vi.fn(() => p),
          expire: vi.fn(() => p),
          exec: vi.fn(async () => []),
        };
        return p;
      }),
    };

    let evalCounter = 0;
    vi.doMock("@/lib/redis", () => ({
      default: mockRedis,
      isRedisReady: () => true,
    }));
    vi.doMock("@/lib/edgeRateLimit", () => ({
      checkRateLimit: vi.fn(async () => ({ allowed: true })),
    }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "user@paayh.com"),
      isAdminEmail: vi.fn(() => false),
    }));
    vi.doMock("@/lib/auth0", () => ({
      auth0: { getSession: vi.fn(async () => ({ user: { sub: "auth0|1" } })) },
    }));
    vi.doMock("@/lib/adminHelper", () => import("../adminHelper"));
    vi.doMock("@/lib/attentionTierEngine", () => import("../attentionTierEngine"));
    vi.doMock("@/lib/targetingEngine", () => import("../targetingEngine"));
    vi.doMock("@/lib/env", () => ({ env: { NODE_ENV: "test", SUPABASE_SERVICE_ROLE_KEY: "test-secret" } }));
    vi.doMock("@/lib/affiliateEngine", () => ({ creditAffiliatePlatformShare: vi.fn(async () => {}) }));
    vi.doMock("@/lib/impressionBuffer", () => ({ bufferAdImpression: vi.fn(async () => {}) }));
    vi.doMock("@/lib/webhookDispatcher", () => ({ dispatchEarningWebhook: vi.fn(async () => {}) }));
    vi.doMock("@/lib/botDetection", () => ({ evaluateEarningVelocity: vi.fn(async () => ({ isFlagged: false, reasons: [] })) }));
    vi.doMock("@/lib/clickhouse", () => ({ streamImpressionsToClickHouse: vi.fn(async () => {}) }));
    vi.doMock("@/lib/agentSystem", () => ({ applyAgentCommissionOnEarning: vi.fn(async () => {}) }));
    vi.doMock("@/lib/notifications/milestoneNotifications", () => ({
      checkAndNotifyClickAndAtwMilestones: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      atomicCheckAndAcquireEarnLock: vi.fn(async () => ({ allowed: true })),
      releaseEarnLock: vi.fn(async () => {}),
      getCachedProfile: vi.fn(async () => ({ email: "user@paayh.com" })),
      setCachedProfile: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/security/kinematicsEvaluator", () => ({
      evaluateKinematics: vi.fn(() => {
        evalCounter++;
        return evalCounter === 1
          ? { isHuman: false, score: 85, reasons: ["Linear path"] }
          : { isHuman: true, score: 10, reasons: [] };
      }),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      atomicCheckAndAcquireEarnLock: vi.fn(async () => ({ allowed: true })),
      releaseEarnLock: vi.fn(async () => {}),
      incrementCachedMutualCount: vi.fn(async () => 0),
      incrementCachedMonetizationClicks: vi.fn(async () => 1),
      publishLiveBalanceUpdate: vi.fn(async () => {}),
      getCachedProfile: vi.fn(async () => ({ email: "user@paayh.com" })),
      setCachedProfile: vi.fn(async () => {}),
      invalidateCachedUserCampaigns: vi.fn(async () => {}),
      evictAdFromL1FeedCaches: vi.fn(),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        rpc: vi.fn(async (fn: string) => {
          if (fn === "claim_ad_earning_atomic") {
            return {
              data: {
                success: true,
                balance: 500,
                clicks: 301,
                amount: 12.5,
                views: 1,
                cap: 1,
                monetized: true,
                atw_tier: "ATW1",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }),
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      },
    }));

    const { getEarnTokenSecret } = await import("../targetingEngine");
    const secret = getEarnTokenSecret();
    const adId = "11111111-1111-1111-1111-111111111111";
    const servedAt = Date.now() - 20000;
    const token = crypto.createHmac("sha256", secret).update(`${adId}:user@paayh.com:${servedAt}`).digest("hex");

    const { POST } = await import("../../app/api/earn/route");

    // Attempt 1: PoH fails -> POH_RETRY 400; earn_token and attention_pace must NOT be burned
    const res1 = await POST(
      makeJsonReq("http://localhost:3000/api/earn", "POST", {
        adId,
        type: "earn",
        token,
        servedAt,
        telemetry: [{ x: 1, y: 1, t: 100 }],
      })
    );
    const json1 = await res1.json();
    expect(res1.status).toBe(400);
    expect(json1.code).toBe("POH_RETRY");
    expect(setCalls.some((k) => k.startsWith("used:earn_token:"))).toBe(false);
    expect(setCalls.some((k) => k.startsWith("lock:attention_pace:"))).toBe(false);

    // Attempt 2: Retry with SAME token & fresh human telemetry -> succeeds 200
    const res2 = await POST(
      makeJsonReq("http://localhost:3000/api/earn", "POST", {
        adId,
        type: "earn",
        token,
        servedAt,
        telemetry: [{ x: 12, y: 34, t: 200, p: 0.5 }],
      })
    );
    const json2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(json2.success).toBe(true);
    expect(setCalls.some((k) => k.startsWith("used:earn_token:"))).toBe(true);
    expect(setCalls.some((k) => k.startsWith("lock:attention_pace:"))).toBe(true);
    expect(mockRedis.del).toHaveBeenCalledWith("monetize:status:v2:user@paayh.com");
    expect(mockRedis.del).toHaveBeenCalledWith("statement:payments:user@paayh.com");
    expect(mockRedis.del).toHaveBeenCalledWith("statement:all:user@paayh.com");
  });

  it("POST /api/earn: ALREADY_EARNED from atomic RPC never falls through to DB fallback", async () => {
    const fromSpy = vi.fn();
    vi.doMock("@/lib/redis", () => ({ default: { status: "end" }, isRedisReady: () => false }));
    vi.doMock("@/lib/edgeRateLimit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "user@paayh.com"),
      isAdminEmail: vi.fn(() => false),
    }));
    vi.doMock("@/lib/auth0", () => ({ auth0: { getSession: vi.fn(async () => ({})) } }));
    vi.doMock("@/lib/adminHelper", () => import("../adminHelper"));
    vi.doMock("@/lib/attentionTierEngine", () => import("../attentionTierEngine"));
    vi.doMock("@/lib/targetingEngine", () => import("../targetingEngine"));
    vi.doMock("@/lib/env", () => ({ env: { NODE_ENV: "test", SUPABASE_SERVICE_ROLE_KEY: "test-secret" } }));
    vi.doMock("@/lib/affiliateEngine", () => ({ creditAffiliatePlatformShare: vi.fn(async () => {}) }));
    vi.doMock("@/lib/impressionBuffer", () => ({ bufferAdImpression: vi.fn(async () => {}) }));
    vi.doMock("@/lib/webhookDispatcher", () => ({ dispatchEarningWebhook: vi.fn(async () => {}) }));
    vi.doMock("@/lib/botDetection", () => ({ evaluateEarningVelocity: vi.fn(async () => ({ isFlagged: false, reasons: [] })) }));
    vi.doMock("@/lib/clickhouse", () => ({ streamImpressionsToClickHouse: vi.fn(async () => {}) }));
    vi.doMock("@/lib/agentSystem", () => ({ applyAgentCommissionOnEarning: vi.fn(async () => {}) }));
    vi.doMock("@/lib/notifications/milestoneNotifications", () => ({
      checkAndNotifyClickAndAtwMilestones: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      atomicCheckAndAcquireEarnLock: vi.fn(async () => ({ allowed: true })),
      releaseEarnLock: vi.fn(async () => {}),
      getCachedProfile: vi.fn(async () => ({ email: "user@paayh.com" })),
      setCachedProfile: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/security/kinematicsEvaluator", () => ({
      evaluateKinematics: vi.fn(() => ({ isHuman: true, score: 5, reasons: [] })),
    }));
    let atomicCode = "ALREADY_EARNED";
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        rpc: vi.fn(async () => ({
          data: { success: false, code: atomicCode, error: "Rejected" },
          error: null,
        })),
        from: fromSpy,
      },
    }));

    const { getEarnTokenSecret } = await import("../targetingEngine");
    const adId = "22222222-2222-2222-2222-222222222222";
    const servedAt = Date.now() - 20000;
    const token = crypto
      .createHmac("sha256", getEarnTokenSecret())
      .update(`${adId}:user@paayh.com:${servedAt}`)
      .digest("hex");

    const { POST } = await import("../../app/api/earn/route");
    const res = await POST(
      makeJsonReq("http://localhost:3000/api/earn", "POST", {
        adId,
        type: "earn",
        token,
        servedAt,
        telemetry: [{ x: 10, y: 20, t: 300 }],
      })
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("ALREADY_EARNED");
    expect(fromSpy).not.toHaveBeenCalled();

    atomicCode = "FREQUENCY_CAP_REACHED";
    const capRes = await POST(
      makeJsonReq("http://localhost:3000/api/earn", "POST", {
        adId: "33333333-3333-3333-3333-333333333333",
        type: "earn",
        token: crypto
          .createHmac("sha256", getEarnTokenSecret())
          .update(`33333333-3333-3333-3333-333333333333:user@paayh.com:${servedAt}`)
          .digest("hex"),
        servedAt,
        telemetry: [{ x: 10, y: 20, t: 300 }],
      })
    );
    const capJson = await capRes.json();
    expect(capRes.status).toBe(400);
    expect(capJson.code).toBe("FREQUENCY_CAP_REACHED");
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("GET /api/feed: enforces Terms location requirement, removes deactivated_users 5000 scan, and ranks by bid_price DESC", async () => {
    const queriedTables: string[] = [];
    const viewerProfile = { email: "viewer@paayh.com", country: "Nigeria", state: "Lagos", interest: "Tech" };

    const lowBidWithMedia = {
      id: "ad-low-media",
      user_email: "pub1@paayh.com",
      ad_media: "https://cdn.example.com/vid.mp4",
      cost_per_impression: 25,
      bid_price: 25,
      is_bidded: false,
      targeting_all: true,
      impressions: 100,
      impression_count: 0,
    };
    const highBidNoMedia = {
      id: "ad-high-text",
      user_email: "pub2@paayh.com",
      ad_media: null,
      cost_per_impression: 95,
      bid_price: 95,
      is_bidded: true,
      targeting_all: true,
      impressions: 100,
      impression_count: 0,
    };

    vi.doMock("@/lib/redis", () => ({ default: { status: "end" }, isRedisReady: () => false }));
    vi.doMock("@/lib/edgeRateLimit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "viewer@paayh.com"),
      isAdminEmail: vi.fn(() => false),
    }));
    vi.doMock("@/lib/adminHelper", () => import("../adminHelper"));
    vi.doMock("@/lib/attentionTierEngine", () => import("../attentionTierEngine"));
    vi.doMock("@/lib/targetingEngine", () => import("../targetingEngine"));
    vi.doMock("@/lib/env", () => ({ env: { NODE_ENV: "test", SUPABASE_SERVICE_ROLE_KEY: "test-secret" } }));
    vi.doMock("@/lib/affiliateEngine", () => ({ creditAffiliatePlatformShare: vi.fn(async () => {}) }));
    vi.doMock("@/lib/impressionBuffer", () => ({ bufferAdImpression: vi.fn(async () => {}) }));
    vi.doMock("@/lib/webhookDispatcher", () => ({ dispatchEarningWebhook: vi.fn(async () => {}) }));
    vi.doMock("@/lib/botDetection", () => ({ evaluateEarningVelocity: vi.fn(async () => ({ isFlagged: false, reasons: [] })) }));
    vi.doMock("@/lib/clickhouse", () => ({ streamImpressionsToClickHouse: vi.fn(async () => {}) }));
    vi.doMock("@/lib/agentSystem", () => ({ applyAgentCommissionOnEarning: vi.fn(async () => {}) }));
    vi.doMock("@/lib/notifications/milestoneNotifications", () => ({
      checkAndNotifyClickAndAtwMilestones: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn(async () => viewerProfile),
      registerL1FeedEvictionHandler: vi.fn(),
    }));
    vi.doMock("@/lib/targetingEngine", () => import("../targetingEngine"));
    vi.doMock("@/lib/ads/publicAdResolver", () => import("../ads/publicAdResolver"));
    vi.doMock("@/lib/utils/cdnUrl", () => ({
      transformMediaUrlsToCdn: vi.fn((u: unknown) => u),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      supabaseReadOnly: {
        rpc: vi.fn(async () => ({ data: null, error: { message: "no rpc" } })),
        from: vi.fn((table: string) => {
          queriedTables.push(table);
          if (table === "addsactive") {
            const chain: any = {
              is: vi.fn(() => chain),
              or: vi.fn(() => chain),
              order: vi.fn(() => chain),
              limit: vi.fn(async () => ({ data: [lowBidWithMedia, highBidNoMedia], error: null })),
            };
            return { select: vi.fn(() => chain) };
          }
          if (table === "ad_impressions") {
            const impChain: any = {
              eq: vi.fn(() => impChain),
              order: vi.fn(() => impChain),
              limit: vi.fn(async () => ({ data: [], error: null })),
            };
            return { select: vi.fn(() => impChain) };
          }
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn(async () => ({ data: [], error: null })),
          };
        }),
      },
    }));

    const { GET } = await import("../../app/api/feed/route");

    // 1. locationSkipped=true -> empty feed with locationRequired: true
    const skippedRes = await GET(new NextRequest("http://localhost:3000/api/feed?locationSkipped=true"));
    const skippedJson = await skippedRes.json();
    expect(skippedJson.ads).toEqual([]);
    expect(skippedJson.locationRequired).toBe(true);

    // 2. Normal feed -> no deactivated_users scan, bid_price 95 ranks before media-heavy bid_price 25
    const normalRes = await GET(new NextRequest("http://localhost:3000/api/feed?refresh=true"));
    const normalJson = await normalRes.json();
    expect(queriedTables).not.toContain("deactivated_users");
    expect(normalJson.ads.map((a: any) => a.id)).toEqual(["ad-high-text", "ad-low-media"]);
  });

  it("POST /api/seen: uses lock:seen_pace, v2 cache keys, and blocks increment when frequency cap reached", async () => {
    const redisSetKeys: string[] = [];
    const redisDelKeys: string[] = [];
    const rpcCalls: string[] = [];

    const mockRedis = {
      status: "ready",
      get: vi.fn(async (k: string) => (k === "user:live_clicks:v2:viewer@paayh.com" ? "55" : null)),
      set: vi.fn(async (k: string) => {
        redisSetKeys.push(k);
        return "OK";
      }),
      del: vi.fn(async (k: string) => {
        redisDelKeys.push(k);
        return 1;
      }),
      hget: vi.fn(async () => "1"), // already viewed once (cap=1)
      hset: vi.fn(async () => 1),
      sadd: vi.fn(async () => 1),
      expire: vi.fn(async () => 1),
    };

    vi.doMock("@/lib/redis", () => ({ default: mockRedis, isRedisReady: () => true }));
    vi.doMock("@/lib/edgeRateLimit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "viewer@paayh.com"),
      isAdminEmail: vi.fn(() => false),
    }));
    vi.doMock("@/lib/adminHelper", () => import("../adminHelper"));
    vi.doMock("@/lib/attentionTierEngine", () => import("../attentionTierEngine"));
    vi.doMock("@/lib/targetingEngine", () => import("../targetingEngine"));
    vi.doMock("@/lib/env", () => ({ env: { NODE_ENV: "test" } }));
    vi.doMock("@/lib/clickhouse", () => ({ streamImpressionsToClickHouse: vi.fn(async () => {}) }));
    vi.doMock("@/lib/notifications/milestoneNotifications", () => ({
      checkAndNotifyClickAndAtwMilestones: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/impressionBuffer", () => ({ recordCoalescedAdSeen: vi.fn(async () => {}) }));
    vi.doMock("@/lib/webhookDispatcher", () => ({ dispatchImpressionWebhook: vi.fn(async () => {}) }));
    vi.doMock("@/lib/utils/cache", () => ({
      incrementCachedMonetizationClicks: vi.fn(async () => 56),
      incrementCachedAdView: vi.fn(async () => 1),
      invalidateCachedProfile: vi.fn(async () => {}),
      getCachedProfile: vi.fn(async () => ({ email: "viewer@paayh.com" })),
      setCachedProfile: vi.fn(async () => {}),
      publishLiveBalanceUpdate: vi.fn(async () => {}),
      evictAdFromL1FeedCaches: vi.fn(),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        rpc: vi.fn(async (fn: string) => {
          rpcCalls.push(fn);
          return { data: null, error: null };
        }),
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () =>
            table === "addsactive"
              ? {
                  data: {
                    is_admin_post: false,
                    cost_per_impression: 25,
                    impressions: 100,
                    impression_count: 10,
                    user_frequency_cap: 1,
                    user_email: "adv@paayh.com",
                  },
                  error: null,
                }
              : { data: { view_count: 1 }, error: null }
          ),
        })),
      },
    }));

    const { POST } = await import("../../app/api/seen/route");
    const res = await POST(
      makeJsonReq("http://localhost:3000/api/seen", "POST", { adId: "ad-capped" })
    );
    const json = await res.json();

    expect(redisSetKeys).toContain("lock:seen_pace:viewer@paayh.com");
    expect(redisSetKeys).not.toContain("lock:attention_pace:viewer@paayh.com");
    expect(json.frequencyCapped).toBe(true);
    expect(rpcCalls).not.toContain("increment_user_click_progress");
  });
});
