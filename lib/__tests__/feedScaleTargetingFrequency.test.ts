import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted Mocks
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  getAuthenticatedEmail: vi.fn(),
  isAdminEmail: vi.fn(),
  isRedisReady: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisMget: vi.fn(),
  redisSmembers: vi.fn(),
  redisSmismember: vi.fn(),
  redisHgetall: vi.fn(),
  redisPipeline: vi.fn(),
  supabaseFrom: vi.fn(),
  supabaseRpc: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/authHelper", () => ({
  getAuthenticatedEmail: mocks.getAuthenticatedEmail,
  isAdminEmail: mocks.isAdminEmail,
}));

vi.mock("@/lib/edgeRateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/redis", () => ({
  __esModule: true,
  default: {
    get: mocks.redisGet,
    set: mocks.redisSet,
    mget: mocks.redisMget,
    smembers: mocks.redisSmembers,
    smismember: mocks.redisSmismember,
    hgetall: mocks.redisHgetall,
    pipeline: mocks.redisPipeline,
  },
  redisConnection: {
    get: mocks.redisGet,
    set: mocks.redisSet,
    mget: mocks.redisMget,
    smembers: mocks.redisSmembers,
    smismember: mocks.redisSmismember,
    hgetall: mocks.redisHgetall,
    pipeline: mocks.redisPipeline,
  },
  isRedisReady: mocks.isRedisReady,
}));

vi.mock("@/lib/utils/dbAdmin", () => ({
  __esModule: true,
  default: {
    from: mocks.supabaseFrom,
    rpc: mocks.supabaseRpc,
  },
  supabaseAdmin: {
    from: mocks.supabaseFrom,
    rpc: mocks.supabaseRpc,
  },
  supabaseReadOnly: {
    from: mocks.supabaseFrom,
    rpc: mocks.supabaseRpc,
  },
}));

vi.mock("@/lib/targetingEngine", () => import("../targetingEngine"));

vi.mock("@/lib/utils/cache", () => ({
  getCachedProfile: vi.fn().mockResolvedValue(null),
  setCachedProfile: vi.fn().mockResolvedValue(undefined),
  registerL1FeedEvictionHandler: vi.fn(),
  evictAdFromL1FeedCaches: vi.fn(),
}));

vi.mock("@/lib/utils/cdnUrl", () => ({
  transformMediaUrlsToCdn: vi.fn((u: unknown) => u),
}));

vi.mock("@/lib/ads/publicAdResolver", () => import("../ads/publicAdResolver"));
vi.mock("@/lib/feed/feedCaches", () => import("../feed/feedCaches"));
vi.mock("@/lib/feed/poolLoader", () => import("../feed/poolLoader"));
vi.mock("@/lib/feed/feedRankerAndInterleaver", () => import("../feed/feedRankerAndInterleaver"));
vi.mock("@/lib/feed/sharedAdResolver", () => import("../feed/sharedAdResolver"));

vi.mock("@/lib/services/rolloverService", () => ({
  triggerBackgroundRolloverSync: vi.fn().mockResolvedValue(undefined),
}));

import { buildOrderedCandidateFeed } from "../feed/feedRankerAndInterleaver";
import { loadSharedActiveAdsForCountry } from "../feed/poolLoader";
import {
  l1SharedCampaignsPool,
  l1UserFeedCache,
  l1AdDetailsCache,
  l1PublisherProfilesCache,
  AD_SELECT_FIELDS,
  AD_SELECT_FIELDS_FALLBACK,
  AD_SELECT_FIELDS_MINIMAL,
} from "../feed/feedCaches";
import { GET as getFeed } from "../../app/api/feed/route";

describe("Feed Scale, Schema Resilience, Targeting & Frequency Cap (500M+)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    l1SharedCampaignsPool.clear();
    l1UserFeedCache.clear();
    l1AdDetailsCache.clear();
    l1PublisherProfilesCache.clear();

    mocks.isAdminEmail.mockReturnValue(false);
    mocks.isRedisReady.mockReturnValue(false);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 24, reset: 60 });
    mocks.redisPipeline.mockReturnValue({
      get: vi.fn().mockReturnThis(),
      smembers: vi.fn().mockReturnThis(),
      hgetall: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      sadd: vi.fn().mockReturnThis(),
      hset: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    });
  });

  describe("feedCaches & poolLoader schema resilience + Redis-down deactivation filter", () => {
    it("strips optional schema columns from AD_SELECT_FIELDS_FALLBACK and AD_SELECT_FIELDS_MINIMAL", () => {
      expect(AD_SELECT_FIELDS).toContain("scheduled_start_at");
      expect(AD_SELECT_FIELDS).toContain("is_boosted");
      expect(AD_SELECT_FIELDS_FALLBACK).not.toContain("scheduled_start_at");
      expect(AD_SELECT_FIELDS_FALLBACK).not.toContain("scheduled_end_at");
      expect(AD_SELECT_FIELDS_FALLBACK).not.toContain("is_boosted");
      expect(AD_SELECT_FIELDS_MINIMAL).not.toContain("broadening_stage");
      expect(AD_SELECT_FIELDS_MINIMAL).not.toContain("is_rollover");
    });

    it("falls back to AD_SELECT_FIELDS_MINIMAL and filters deactivated/exhausted ads without deactivated_users table scans", async () => {
      const selectHistory: string[] = [];
      const queriedTables: string[] = [];
      mocks.isRedisReady.mockReturnValue(true);
      mocks.redisGet.mockResolvedValue(null);
      mocks.redisSmismember.mockImplementation(async (_key: string, ...emails: string[]) =>
        emails.map((e) => (e === "deact@brand.com" ? 1 : 0))
      );

      mocks.supabaseFrom.mockImplementation((table: string) => {
        queriedTables.push(table);
        if (table === "addsactive") {
          return {
            select: (fields: string) => {
              selectHistory.push(fields);
              const rows =
                fields === AD_SELECT_FIELDS_MINIMAL
                  ? [
                      {
                        id: "ad-active",
                        user_email: "active@brand.com",
                        country: "Nigeria, Ghana",
                        impressions: 1000,
                        impression_count: 10,
                        cost_per_impression: 100,
                        is_paused: false,
                        completed_at: null,
                      },
                      {
                        id: "ad-deact",
                        user_email: "deact@brand.com",
                        country: "Nigeria",
                        impressions: 1000,
                        impression_count: 10,
                        cost_per_impression: 200,
                        is_paused: false,
                        completed_at: null,
                      },
                      {
                        id: "ad-exhausted",
                        user_email: "active@brand.com",
                        country: "Nigeria",
                        impressions: 50,
                        impression_count: 50,
                        cost_per_impression: 300,
                        is_paused: false,
                        completed_at: null,
                      },
                    ]
                  : null;
              const err =
                fields === AD_SELECT_FIELDS_MINIMAL
                  ? null
                  : { code: "42703", message: "column does not exist" };

              const chain: any = {
                is: () => chain,
                or: () => chain,
                eq: () => chain,
                order: () => chain,
                limit: async () => ({ data: rows, error: err }),
              };
              return chain;
            },
          };
        }
        return {};
      });

      const pool = await loadSharedActiveAdsForCountry("Nigeria");
      expect(selectHistory).toContain(AD_SELECT_FIELDS);
      expect(selectHistory).toContain(AD_SELECT_FIELDS_FALLBACK);
      expect(selectHistory).toContain(AD_SELECT_FIELDS_MINIMAL);
      expect(queriedTables).not.toContain("deactivated_users");
      expect(mocks.redisSmismember).toHaveBeenCalled();
      expect(pool.map((a) => a.id)).toEqual(["ad-active"]);
    });
  });

  describe("feedRankerAndInterleaver retargeting drain & frequency cap correctness", () => {
    it("does NOT drop remaining retargeted ads when freshAdsList is empty or smaller than 3", () => {
      const nowMs = Date.now();
      const rawAds = Array.from({ length: 5 }, (_, idx) => ({
        id: `retarget-${idx + 1}`,
        user_email: `adv-${idx + 1}@example.com`,
        country: "Nigeria",
        targeting_all: true,
        impressions: 5000,
        impression_count: 100,
        cost_per_impression: 100 + idx,
        bid_price: 100 + idx,
        is_bidded: true,
        user_frequency_cap: 5,
        campaign_days: 1,
        created_at: new Date(nowMs - 86_400_000 * 0.2).toISOString(),
        is_paused: false,
        completed_at: null,
      }));

      const impMap = new Map<string, any>();
      for (const ad of rawAds) {
        impMap.set(ad.id, {
          view_count: 1,
          today_view_count: 1,
          last_viewed_at: new Date(nowMs - 4 * 3_600_000).toISOString(),
        });
      }

      const { orderedCandidateAds } = buildOrderedCandidateFeed({
        rawAds,
        viewerProfile: { email: "viewer@example.com", country: "Nigeria" },
        emailKey: "viewer@example.com",
        isViewerAdmin: false,
        seenAdIdsSet: new Set(),
        blockedAdIdsSet: new Set(),
        blockedAdvertisersSet: new Set(),
        userImpressionMap: impMap,
        todayPacingMap: {},
        todayDate: new Date(nowMs).toISOString().slice(0, 10),
        nowMs,
      });

      // Previously broke after pushing only 1 retargeted ad!
      expect(orderedCandidateAds.length).toBe(5);
    });

    it("enforces minSpacingMs cooldown, dailyUserCap, effectiveUserCap, and UTC rollover_balance", () => {
      const nowMs = Date.now();
      const todayDate = new Date(nowMs).toISOString().slice(0, 10);

      const rawAds = [
        {
          id: "ad-cooldown-hit",
          user_email: "a1@ex.com",
          targeting_all: true,
          impressions: 1000,
          impression_count: 10,
          cost_per_impression: 100,
          user_frequency_cap: 3, // minSpacingMs = 43200000 / 3 = 14400000 (4h) on 1-day campaign
          campaign_days: 1,
          created_at: new Date(nowMs - 86_400_000 * 0.3).toISOString(),
        },
        {
          id: "ad-cooldown-ok",
          user_email: "a2@ex.com",
          targeting_all: true,
          impressions: 1000,
          impression_count: 10,
          cost_per_impression: 100,
          user_frequency_cap: 3,
          campaign_days: 1,
          created_at: new Date(nowMs - 86_400_000 * 0.3).toISOString(),
        },
        {
          id: "ad-daily-rollover-ok",
          user_email: "a3@ex.com",
          targeting_all: true,
          impressions: 1000,
          impression_count: 50,
          cost_per_impression: 100,
          daily_impression_cap: 20,
          rollover_balance: 15, // effective daily cap = 35
          daily_impression_count: 25,
          last_reset_date: todayDate,
          user_frequency_cap: 2,
          campaign_days: 5,
          created_at: new Date(nowMs - 86_400_000).toISOString(),
        },
        {
          id: "ad-daily-capped",
          user_email: "a4@ex.com",
          targeting_all: true,
          impressions: 1000,
          impression_count: 50,
          cost_per_impression: 100,
          daily_impression_cap: 20,
          rollover_balance: 0,
          daily_impression_count: 20,
          last_reset_date: todayDate,
          user_frequency_cap: 2,
          campaign_days: 5,
          created_at: new Date(nowMs - 86_400_000).toISOString(),
        },
      ];

      const impMap = new Map<string, any>([
        [
          "ad-cooldown-hit",
          {
            view_count: 1,
            today_view_count: 1,
            last_viewed_at: new Date(nowMs - 60 * 60 * 1000).toISOString(), // 1h < 4h
          },
        ],
        [
          "ad-cooldown-ok",
          {
            view_count: 1,
            today_view_count: 1,
            last_viewed_at: new Date(nowMs - 5 * 60 * 60 * 1000).toISOString(), // 5h > 4h
          },
        ],
      ]);

      const { orderedCandidateAds } = buildOrderedCandidateFeed({
        rawAds,
        viewerProfile: { email: "v@ex.com", country: "Nigeria" },
        emailKey: "v@ex.com",
        isViewerAdmin: false,
        seenAdIdsSet: new Set(),
        blockedAdIdsSet: new Set(),
        blockedAdvertisersSet: new Set(),
        userImpressionMap: impMap,
        todayPacingMap: {},
        todayDate,
        nowMs,
      });

      const returnedIds = orderedCandidateAds.map((a) => a.id);
      expect(returnedIds).not.toContain("ad-cooldown-hit");
      expect(returnedIds).not.toContain("ad-daily-capped");
      expect(returnedIds).toContain("ad-cooldown-ok");
      expect(returnedIds).toContain("ad-daily-rollover-ok");
    });
  });

  describe("GET /api/feed cache-hit geo+demo parity, user-scoped rate limit & truncated impressions check", () => {
    it("preserves Stage 0 geo+demo fallback ads on Redis cache hit when strict matches < 15", async () => {
      mocks.getAuthenticatedEmail.mockResolvedValue("viewer@example.com");
      mocks.isRedisReady.mockReturnValue(true);

      const adRelaxed = {
        id: "ad-geo-demo-fallback",
        user_email: "brand@example.com",
        country: "Nigeria",
        state: "Lagos",
        gender: "female",
        age_range: [18, 65],
        interest: ["Cooking"], // viewer is Tech, so strict fails, geo+demo passes
        impressions: 1000,
        impression_count: 10,
        cost_per_impression: 150,
        campaign_days: 5,
        created_at: new Date().toISOString(),
        is_paused: false,
        completed_at: null,
      };

      mocks.redisPipeline.mockReturnValue({
        get: vi.fn().mockReturnThis(),
        smembers: vi.fn().mockReturnThis(),
        hgetall: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        del: vi.fn().mockReturnThis(),
        sadd: vi.fn().mockReturnThis(),
        hset: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, JSON.stringify([adRelaxed.id])], // adIdsCacheKey
          [null, JSON.stringify({})],             // profilesCacheKey
          [null, []],                             // seenAdsSetKey
          [null, []],                             // blockedAdsSetKey
          [null, []],                             // blockedAdvertisersSetKey
          [null, {}],                             // pacingHashKey
          [null, {}],                             // todayFreq
          [null, {}],                             // lifetimeFreq
          [null, null],                           // viewerProfileCacheKey
          [null, {}],                             // lastViewedHashKey
        ]),
      });
      mocks.redisMget.mockResolvedValue([JSON.stringify(adRelaxed)]);
      mocks.redisSmembers.mockResolvedValue([]);
      mocks.redisHgetall.mockResolvedValue({});

      mocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === "users") {
          return {
            select: () => ({
              ilike: () => ({
                maybeSingle: async () => ({
                  data: {
                    email: "viewer@example.com",
                    country: "Nigeria",
                    state: "Lagos",
                    gender: "female",
                    dob: "1996-01-01",
                    interest: ["Tech"],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        const emptyChain: any = {
          eq: () => emptyChain,
          ilike: () => emptyChain,
          order: () => emptyChain,
          limit: async () => ({ data: [], error: null }),
          in: async () => ({ data: [], error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        };
        return { select: () => emptyChain };
      });

      const req = new NextRequest("http://localhost:3000/api/feed?limit=10&offset=0");
      const res = await getFeed(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ads.map((a: any) => a.id)).toContain("ad-geo-demo-fallback");
    });

    it("enforces lifetime frequency cap beyond 1000 ad_impressions rows when Redis is down via .in() check", async () => {
      mocks.getAuthenticatedEmail.mockResolvedValue("heavyviewer@example.com");
      mocks.isRedisReady.mockReturnValue(false);

      // Simulate RPC broken so it uses addsactive pool loader
      mocks.supabaseRpc.mockResolvedValue({
        data: null,
        error: { code: "42703", message: "missing" },
      });

      // Simulate 1000 recent impressions NOT containing ad-old-capped
      const recent1000 = Array.from({ length: 1000 }, (_, i) => ({
        ad_id: `recent-${i}`,
        view_count: 1,
        today_view_count: 0,
        last_viewed_at: new Date().toISOString(),
      }));

      mocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === "users") {
          return {
            select: () => ({
              ilike: () => ({
                maybeSingle: async () => ({
                  data: {
                    email: "heavyviewer@example.com",
                    country: "Nigeria",
                    state: "Lagos",
                    gender: "female",
                    dob: "1996-01-01",
                    interest: ["Tech"],
                  },
                  error: null,
                }),
              }),
              in: async () => ({ data: [], error: null }),
            }),
          };
        }
        if (table === "ad_impressions") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: recent1000, error: null }),
                }),
                in: async () => ({
                  data: [
                    {
                      ad_id: "ad-old-capped",
                      view_count: 1, // equals base user_frequency_cap: 1!
                      today_view_count: 0,
                      last_viewed_at: "2026-01-01T00:00:00.000Z",
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "addsactive") {
          const adRows = [
            {
              id: "ad-old-capped",
              user_email: "b1@example.com",
              country: "Nigeria",
              targeting_all: true,
              impressions: 1000,
              impression_count: 10,
              cost_per_impression: 100,
              user_frequency_cap: 1,
              campaign_days: 30,
              created_at: new Date().toISOString(),
              is_paused: false,
              completed_at: null,
            },
            {
              id: "ad-fresh-ok",
              user_email: "b2@example.com",
              country: "Nigeria",
              targeting_all: true,
              impressions: 1000,
              impression_count: 10,
              cost_per_impression: 100,
              user_frequency_cap: 1,
              campaign_days: 30,
              created_at: new Date().toISOString(),
              is_paused: false,
              completed_at: null,
            },
          ];
          const chain: any = {
            is: () => chain,
            or: () => chain,
            eq: () => chain,
            order: () => chain,
            limit: async () => ({ data: adRows, error: null }),
          };
          return { select: () => chain };
        }
        const emptyChain: any = {
          eq: () => emptyChain,
          ilike: () => emptyChain,
          in: async () => ({ data: [], error: null }),
          limit: async () => ({ data: [], error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        };
        return { select: () => emptyChain };
      });

      const req = new NextRequest("http://localhost:3000/api/feed?refresh=true");
      const res = await getFeed(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      const ids = body.ads.map((a: any) => a.id);
      expect(ids).not.toContain("ad-old-capped");
      expect(ids).toContain("ad-fresh-ok");
      // Rate limiter should never use blockDurationSeconds (no 6h IP lockout)
      for (const call of mocks.checkRateLimit.mock.calls) {
        expect(call[1].blockDurationSeconds).toBeUndefined();
      }
    });
  });
});
