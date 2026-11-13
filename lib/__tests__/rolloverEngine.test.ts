import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  computeCampaignBroadeningPlan,
  evaluateAdTargeting,
  rankAndFilterTargetedAds,
  TargetableAd,
  ViewerTargetingProfile,
} from "../targetingEngine";

function makeJsonReq(url: string, method = "POST", body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Ad Rollover Mode: Correctness, Cap Expansion & 500M+ Scale", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("computeCampaignBroadeningPlan & isAdRowActiveAndAvailable", () => {
    const now = Date.UTC(2026, 10, 14, 12, 0, 0);
    const dayMs = 86_400_000;

    async function loadIsAvailable() {
      vi.doMock("@/lib/targetingEngine", () => import("../targetingEngine"));
      vi.doMock("@/lib/redis", () => ({ default: { status: "end" }, isRedisReady: () => false }));
      vi.doMock("@/lib/utils/dbAdmin", () => ({ default: {}, supabaseReadOnly: {} }));
      vi.doMock("@/lib/utils/cache", () => ({
        registerL1FeedEvictionHandler: vi.fn(),
        evictAdFromL1FeedCaches: vi.fn(),
      }));
      const { isAdRowActiveAndAvailable } = await import("../ads/publicAdResolver");
      return isAdRowActiveAndAvailable;
    }

    it("keeps future scheduled campaigns locked out of feed and rollover", async () => {
      const isAdRowActiveAndAvailable = await loadIsAvailable();
      const futureAd: TargetableAd = {
        id: "ad-future",
        created_at: new Date(now - 5 * dayMs).toISOString(),
        scheduled_start_at: new Date(now + 2 * dayMs).toISOString(),
        campaign_days: 3,
        impressions: 1000,
        impression_count: 0,
        cost_per_impression: 25,
        user_frequency_cap: 1,
      };

      const plan = computeCampaignBroadeningPlan(futureAd, now);
      expect(plan.isScheduledFuture).toBe(true);
      expect(plan.isRollover).toBe(false);
      expect(plan.broadeningStage).toBe(0);
      expect(isAdRowActiveAndAvailable(futureAd, now)).toBe(false);
    });

    it("anchors campaign duration to Math.max(approved_at, scheduled_start_at) instead of premature created_at", () => {
      const ad: TargetableAd = {
        id: "ad-approved-later",
        created_at: new Date(now - 10 * dayMs).toISOString(),
        approved_at: new Date(now - 1 * dayMs).toISOString(),
        campaign_days: 5,
        impressions: 1000,
        impression_count: 100,
        cost_per_impression: 25,
      };

      const plan = computeCampaignBroadeningPlan(ad, now);
      expect(plan.isRollover).toBe(false);
      expect(plan.broadeningStage).toBe(0);
      expect(plan.durationRatio).toBeCloseTo(0.2, 2);
    });

    it("transitions under-delivered paid campaigns past scheduled_end_at into Stage 2 Rollover with cap expansion", async () => {
      const isAdRowActiveAndAvailable = await loadIsAvailable();
      const paidRolloverAd: TargetableAd = {
        id: "ad-rollover-paid",
        created_at: new Date(now - 5 * dayMs).toISOString(),
        approved_at: new Date(now - 5 * dayMs).toISOString(),
        scheduled_end_at: new Date(now - 1 * dayMs).toISOString(),
        campaign_days: 4,
        impressions: 1000,
        impression_count: 250,
        cost_per_impression: 30,
        user_frequency_cap: 1,
      };

      const plan = computeCampaignBroadeningPlan(paidRolloverAd, now);
      expect(plan.isPlatformPost).toBe(false);
      expect(plan.isRollover).toBe(true);
      expect(plan.broadeningStage).toBe(2);
      expect(plan.baseUserCap).toBe(1);
      expect(plan.effectiveUserCap).toBe(3);
      expect(plan.maxPossibleUserCap).toBe(3);
      expect(plan.urgencyMultiplier).toBeGreaterThanOrEqual(1.45);
      expect(isAdRowActiveAndAvailable(paidRolloverAd, now)).toBe(true);
    });

    it("never puts unpaid platform/admin posts into rollover and marks them expired at endMs", async () => {
      const isAdRowActiveAndAvailable = await loadIsAvailable();
      const platformExpired: TargetableAd = {
        id: "ad-platform-expired",
        is_admin_post: true,
        cost_per_impression: 0,
        impressions: 0,
        impression_count: 12,
        campaign_days: 2,
        created_at: new Date(now - 4 * dayMs).toISOString(),
      };

      const zeroCpiExpired: TargetableAd = {
        id: "ad-zero-cpi",
        is_admin_post: false,
        cost_per_impression: 0,
        impressions: 500,
        impression_count: 20,
        campaign_days: 2,
        created_at: new Date(now - 4 * dayMs).toISOString(),
      };

      for (const ad of [platformExpired, zeroCpiExpired]) {
        const plan = computeCampaignBroadeningPlan(ad, now);
        expect(plan.isPlatformPost).toBe(true);
        expect(plan.isRollover).toBe(false);
        expect(plan.broadeningStage).toBe(0);
        expect(plan.isExpiredPlatformPost).toBe(true);
        expect(isAdRowActiveAndAvailable(ad, now)).toBe(false);
      }
    });
  });

  describe("Zero Cap Lockout Across Feed Ranker & Redis Cache Sync", () => {
    const viewer: ViewerTargetingProfile = {
      email: "viewer@paayh.com",
      country: "Nigeria",
      state: "Lagos",
      gender: "Female",
      dob: "1995-01-01",
      interest: ["Technology"],
    };

    async function loadBuildOrderedCandidateFeed() {
      vi.doMock("@/lib/targetingEngine", () => import("../targetingEngine"));
      vi.doMock("@/lib/redis", () => ({ default: { status: "end" }, isRedisReady: () => false }));
      vi.doMock("@/lib/utils/dbAdmin", () => ({ default: {}, supabaseReadOnly: {} }));
      vi.doMock("@/lib/utils/cache", () => ({
        registerL1FeedEvictionHandler: vi.fn(),
        evictAdFromL1FeedCaches: vi.fn(),
      }));
      const { buildOrderedCandidateFeed } = await import("../feed/feedRankerAndInterleaver");
      return buildOrderedCandidateFeed;
    }

    it("unlocks Stage 2 rollover ads in buildOrderedCandidateFeed & rankAndFilterTargetedAds without permanent seen:ads lockout", async () => {
      const buildOrderedCandidateFeed = await loadBuildOrderedCandidateFeed();
      const now = Date.now();
      const rolloverAd: TargetableAd = {
        id: "ad-unlock-rollover",
        user_email: "brand@paayh.com",
        country: "Nigeria",
        state: "Rivers",
        gender: "Female",
        interest: ["Fashion"],
        created_at: new Date(now - 5 * 86_400_000).toISOString(),
        campaign_days: 2,
        impressions: 1000,
        impression_count: 200,
        cost_per_impression: 25,
        user_frequency_cap: 1,
        daily_impression_cap: 50,
        daily_impression_count: 10,
        rollover_balance: 20,
        last_reset_date: new Date(now).toISOString().slice(0, 10),
      };

      const seenAdIdsSet = new Set<string>(["ad-unlock-rollover"]);
      const userImpressionMap = new Map([
        [
          "ad-unlock-rollover",
          {
            view_count: 1,
            today_view_count: 0,
            last_viewed_at: new Date(now - 6 * 3600_000).toISOString(),
          },
        ],
      ]);

      const built = buildOrderedCandidateFeed({
        rawAds: [rolloverAd],
        viewerProfile: viewer,
        emailKey: "viewer@paayh.com",
        isViewerAdmin: false,
        seenAdIdsSet,
        blockedAdIdsSet: new Set(),
        blockedAdvertisersSet: new Set(),
        userImpressionMap,
        todayPacingMap: {},
        todayDate: new Date(now).toISOString().slice(0, 10),
        nowMs: now,
      });

      expect(built.orderedCandidateAds.map((a) => a.id)).toEqual(["ad-unlock-rollover"]);
      expect(built.orderedCandidateAds[0].is_rollover).toBe(true);
      expect(built.orderedCandidateAds[0].broadening_stage).toBe(2);
      expect(built.completedOrCappedAdIds).toEqual([]);

      // Also verify rankAndFilterTargetedAds directly unlocks when userViewCounts < effectiveUserCap
      const ranked = rankAndFilterTargetedAds([rolloverAd], viewer, {
        seenAdIds: seenAdIdsSet,
        userViewCounts: new Map([["ad-unlock-rollover", 1]]),
        allowNearestFallback: false,
      });
      expect(ranked.map((a) => a.id)).toEqual(["ad-unlock-rollover"]);
      expect(evaluateAdTargeting(rolloverAd, viewer, { allowRolloverPsychographics: true, broadeningStage: 2 }).matches).toBe(true);
    });

    it("respects Stage 0 cap without writing permanent seen:ads when maxPossibleUserCap is higher", async () => {
      const buildOrderedCandidateFeed = await loadBuildOrderedCandidateFeed();
      const now = Date.now();
      const activeStage0Ad: TargetableAd = {
        id: "ad-stage0",
        user_email: "brand@paayh.com",
        country: "Nigeria",
        state: "Lagos",
        gender: "Female",
        targeting_all: true,
        created_at: new Date(now - 1 * 3600_000).toISOString(),
        campaign_days: 5,
        impressions: 1000,
        impression_count: 50,
        cost_per_impression: 25,
        user_frequency_cap: 1,
      };

      const userImpressionMap = new Map([
        [
          "ad-stage0",
          {
            view_count: 1,
            today_view_count: 1,
            last_viewed_at: new Date(now - 60_000).toISOString(),
          },
        ],
      ]);

      const built = buildOrderedCandidateFeed({
        rawAds: [activeStage0Ad],
        viewerProfile: viewer,
        emailKey: "viewer@paayh.com",
        isViewerAdmin: false,
        seenAdIdsSet: new Set(),
        blockedAdIdsSet: new Set(),
        blockedAdvertisersSet: new Set(),
        userImpressionMap,
        todayPacingMap: {},
        todayDate: new Date(now).toISOString().slice(0, 10),
        nowMs: now,
      });

      expect(built.orderedCandidateAds).toEqual([]);
      expect(built.completedOrCappedAdIds).toEqual([]);
    });

    it("honors daily_impression_cap + rollover_balance for current day delivery", async () => {
      const buildOrderedCandidateFeed = await loadBuildOrderedCandidateFeed();
      const now = Date.now();
      const todayDate = new Date(now).toISOString().slice(0, 10);
      const dailyRolledAd: TargetableAd = {
        id: "ad-daily-rolled",
        user_email: "brand@paayh.com",
        targeting_all: true,
        created_at: new Date(now - 2 * 86_400_000).toISOString(),
        campaign_days: 5,
        impressions: 1000,
        impression_count: 100,
        cost_per_impression: 25,
        daily_impression_cap: 50,
        daily_impression_count: 65,
        rollover_balance: 30,
        last_reset_date: todayDate,
      };

      const builtWithinBalance = buildOrderedCandidateFeed({
        rawAds: [dailyRolledAd],
        viewerProfile: viewer,
        emailKey: "viewer@paayh.com",
        isViewerAdmin: false,
        seenAdIdsSet: new Set(),
        blockedAdIdsSet: new Set(),
        blockedAdvertisersSet: new Set(),
        userImpressionMap: new Map(),
        todayPacingMap: {},
        todayDate,
        nowMs: now,
      });
      expect(builtWithinBalance.orderedCandidateAds.map((a) => a.id)).toEqual(["ad-daily-rolled"]);

      const builtExhaustedDaily = buildOrderedCandidateFeed({
        rawAds: [{ ...dailyRolledAd, daily_impression_count: 80 }],
        viewerProfile: viewer,
        emailKey: "viewer@paayh.com",
        isViewerAdmin: false,
        seenAdIdsSet: new Set(),
        blockedAdIdsSet: new Set(),
        blockedAdvertisersSet: new Set(),
        userImpressionMap: new Map(),
        todayPacingMap: {},
        todayDate,
        nowMs: now,
      });
      expect(builtExhaustedDaily.orderedCandidateAds).toEqual([]);
    });

    it("does not write earned:ads or seen:ads in syncPostEarnCaches / syncPacingAndSeenSet until maxCap is reached", async () => {
      const saddSpy = vi.fn(async () => 1);
      vi.doMock("@/lib/redis", () => ({
        default: {
          status: "ready",
          set: vi.fn(async () => "OK"),
          get: vi.fn(async () => null),
          del: vi.fn(async () => 1),
          hincrby: vi.fn(async () => 1),
          hset: vi.fn(async () => 1),
          sadd: saddSpy,
          expire: vi.fn(async () => 1),
        },
        isRedisReady: () => true,
      }));
      vi.doMock("@/lib/utils/dbAdmin", () => ({ default: { from: vi.fn() } }));
      vi.doMock("@/lib/authHelper", () => ({ isAdminEmail: () => false }));
      vi.doMock("@/lib/utils/cache", () => ({
        getCachedProfile: vi.fn(async () => null),
        setCachedProfile: vi.fn(async () => {}),
        publishLiveBalanceUpdate: vi.fn(async () => {}),
      }));
      vi.doMock("@/lib/webhookDispatcher", () => ({
        dispatchEarningWebhook: vi.fn(async () => {}),
      }));
      vi.doMock("@/lib/attentionTierEngine", () => import("../attentionTierEngine"));

      const mod = await import("../earn/redisSync");

      await mod.syncPostEarnCaches({
        emailKey: "user@paayh.com",
        adId: "ad-1",
        liveClicks: 10,
        updatedBalance: null,
        atomicViews: 1,
        atomicCap: 1,
        maxCap: 3,
      });
      await mod.syncPacingAndSeenSet("user@paayh.com", "ad-1", 1, 1, 3);
      expect(saddSpy).not.toHaveBeenCalled();

      await mod.syncPostEarnCaches({
        emailKey: "user@paayh.com",
        adId: "ad-1",
        liveClicks: 11,
        updatedBalance: null,
        atomicViews: 3,
        atomicCap: 3,
        maxCap: 3,
      });
      await mod.syncPacingAndSeenSet("user@paayh.com", "ad-1", 3, 3, 3);
      expect(saddSpy).toHaveBeenCalledWith("earned:ads:user@paayh.com", "ad-1");
      expect(saddSpy).toHaveBeenCalledWith("seen:ads:user@paayh.com", "ad-1");
    });
  });

  describe("POST /api/seen & Claim Fallback Rollover Cap Handling", () => {
    it("POST /api/seen allows second view once campaign enters Stage 2 Rollover (<50% delivered)", async () => {
      const saddSpy = vi.fn(async () => 1);
      const mockRedis = {
        status: "ready",
        get: vi.fn(async (k: string) => {
          if (k === "ad:detail:ad-roll") {
            return JSON.stringify({
              id: "ad-roll",
              user_email: "adv@paayh.com",
              is_admin_post: false,
              cost_per_impression: 25,
              impressions: 1000,
              impression_count: 100,
              user_frequency_cap: 1,
              campaign_days: 3,
              created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
            });
          }
          if (k === "user:live_clicks:v2:viewer@paayh.com") return "12";
          return null;
        }),
        set: vi.fn(async () => "OK"),
        del: vi.fn(async () => 1),
        hget: vi.fn(async () => "1"),
        hset: vi.fn(async () => 1),
        sadd: saddSpy,
        expire: vi.fn(async () => 1),
        pipeline: vi.fn(() => {
          const pipe: any = {
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
        incrementCachedMonetizationClicks: vi.fn(async () => 13),
        incrementCachedAdView: vi.fn(async () => 2),
        invalidateCachedProfile: vi.fn(async () => {}),
        invalidateCachedUserCampaigns: vi.fn(async () => {}),
        getCachedProfile: vi.fn(async () => ({ email: "viewer@paayh.com" })),
        setCachedProfile: vi.fn(async () => {}),
        publishLiveBalanceUpdate: vi.fn(async () => {}),
        evictAdFromL1FeedCaches: vi.fn(),
      }));
      vi.doMock("@/lib/utils/dbAdmin", () => ({
        default: {
          rpc: vi.fn(async () => ({ data: [{ new_click_count: 13, is_now_monetized: false }], error: null })),
          from: vi.fn((table: string) => {
            const res =
              table === "users"
                ? { data: { id: "u1", monetization_clicks: 12, monetized: "false" }, error: null }
                : { data: { view_count: 1 }, error: null };
            const chain: any = {
              select: vi.fn(() => chain),
              update: vi.fn(() => chain),
              eq: vi.fn(() => chain),
              ilike: vi.fn(() => chain),
              maybeSingle: vi.fn(async () => res),
              then: (resolve: any) => Promise.resolve(res).then(resolve),
            };
            return chain;
          }),
        },
      }));

      const { POST } = await import("../../app/api/seen/route");
      const res = await POST(
        makeJsonReq("http://localhost:3000/api/seen", "POST", { adId: "ad-roll" })
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.frequencyCapped).toBeUndefined();
      expect(json.success).toBe(true);
      expect(saddSpy).not.toHaveBeenCalled();
    });
  });

  describe("500M+ Scale Keyset Rollover Processor (rolloverService.ts)", () => {
    it("skips cleanly when distributed Redis lease is already held by another worker", async () => {
      const rpcSpy = vi.fn();
      vi.doMock("../redis", () => ({
        default: {
          status: "ready",
          set: vi.fn(async () => null),
          get: vi.fn(async () => null),
        },
        isRedisReady: () => true,
      }));
      vi.doMock("../utils/dbAdmin", () => ({
        default: { rpc: rpcSpy, from: vi.fn() },
      }));
      vi.doMock("../utils/cache", () => ({
        evictAdFromL1FeedCaches: vi.fn(),
        invalidateCachedUserCampaigns: vi.fn(async () => {}),
      }));
      vi.doMock("../webhookDispatcher", () => ({
        dispatchNotificationWebhook: vi.fn(async () => {}),
      }));

      const { runRolloverSweep } = await import("../services/rolloverService");
      const res = await runRolloverSweep();
      expect(res.skipped).toBe(true);
      expect(res.reason).toBe("lease_held");
      expect(rpcSpy).not.toHaveBeenCalled();
    });

    it("iterates keyset batches, deduplicates advertiser notifications, evicts L1/L2 caches, and clears cursor", async () => {
      const redisStore = new Map<string, string>();
      const deletedKeys: string[] = [];
      const evictedAdIds: string[] = [];
      const notifInserts: any[] = [];
      const markNotifiedCalls: string[][] = [];

      const mockRedis = {
        status: "ready",
        set: vi.fn(async (key: string, val: string, ...args: any[]) => {
          const isNx = args.includes("NX");
          if (isNx && redisStore.has(key)) return null;
          redisStore.set(key, val);
          return "OK";
        }),
        get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
        del: vi.fn(async (...keys: string[]) => {
          deletedKeys.push(...keys);
          keys.forEach((k) => redisStore.delete(k));
          return keys.length;
        }),
        eval: vi.fn(async (_script: string, _num: number, key: string, token: string) => {
          if (redisStore.get(key) === token) {
            redisStore.delete(key);
            return 1;
          }
          return 0;
        }),
      };

      const rpcCalls: Array<{ fn: string; params: any }> = [];
      const mockRpc = vi.fn(async (fn: string, params: any) => {
        rpcCalls.push({ fn, params });
        if (fn === "process_ad_rollover_batch") {
          if (!params.p_last_id) {
            return {
              data: {
                processed_count: 200,
                transitioned_count: 1,
                stage1_updated: 3,
                daily_rolled_count: 5,
                newly_entered: [
                  {
                    id: "ad-cursor-100",
                    user_email: "adv@paayh.com",
                    product_name: "Solar Kit",
                    impressions: 1000,
                    impression_count: 250,
                    remaining_impressions: 750,
                  },
                ],
                next_cursor_id: "ad-cursor-200",
                has_more: true,
              },
              error: null,
            };
          }
          return {
            data: {
              processed_count: 42,
              transitioned_count: 1,
              stage1_updated: 0,
              daily_rolled_count: 0,
              newly_entered: [
                {
                  id: "ad-cursor-242",
                  user_email: "adv2@paayh.com",
                  ad_content: "Flash Deal Campaign",
                  impressions: 500,
                  impression_count: 100,
                  remaining_impressions: 400,
                },
              ],
              next_cursor_id: null,
              has_more: false,
            },
            error: null,
          };
        }
        if (fn === "mark_rollover_notified_batch") {
          markNotifiedCalls.push(params.p_ad_ids);
          return { data: params.p_ad_ids.length, error: null };
        }
        if (fn === "archive_expired_platform_ads") {
          return { data: 2, error: null };
        }
        return { data: null, error: null };
      });

      vi.doMock("../redis", () => ({ default: mockRedis, isRedisReady: () => true }));
      vi.doMock("../utils/cache", () => ({
        evictAdFromL1FeedCaches: vi.fn((id: string) => evictedAdIds.push(id)),
        invalidateCachedUserCampaigns: vi.fn(async () => {}),
      }));
      vi.doMock("../webhookDispatcher", () => ({
        dispatchNotificationWebhook: vi.fn(async () => {}),
      }));
      vi.doMock("../utils/dbAdmin", () => ({
        default: {
          rpc: mockRpc,
          from: vi.fn((table: string) => ({
            insert: vi.fn(async (rows: any[]) => {
              if (table === "notifications") notifInserts.push(...rows);
              return { error: null };
            }),
          })),
        },
      }));

      const { runRolloverSweep } = await import("../services/rolloverService");
      const result = await runRolloverSweep({ batchSize: 200, maxBatches: 5 });

      expect(result.success).toBe(true);
      expect(result.batchesRun).toBe(2);
      expect(result.processedCount).toBe(242);
      expect(result.transitionedCount).toBe(2);
      expect(result.stage1UpdatedCount).toBe(3);
      expect(result.dailyRolledCount).toBe(5);
      expect(result.notifiedCount).toBe(2);
      expect(result.archivedPlatformCount).toBe(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursorId).toBeNull();

      const batchCalls = rpcCalls.filter((c) => c.fn === "process_ad_rollover_batch");
      expect(batchCalls[0].params.p_last_id).toBeNull();
      expect(batchCalls[1].params.p_last_id).toBe("ad-cursor-200");

      expect(evictedAdIds).toEqual(["ad-cursor-100", "ad-cursor-242"]);
      expect(deletedKeys).toContain("campaigns:shared_pool:v1");
      expect(deletedKeys).toContain("ad:detail:ad-cursor-100");
      expect(deletedKeys).toContain("ad:public:status:ad-cursor-242");
      expect(notifInserts).toHaveLength(2);
      expect(notifInserts[0].title).toBe("Campaign Entered Rollover Mode");
      expect(markNotifiedCalls).toEqual([["ad-cursor-100"], ["ad-cursor-242"]]);
      expect(redisStore.has("lock:rollover:processor")).toBe(false);
    });

    it("loadSharedActiveAdsForCountry merges dedicated rollover pool so lower-bid rollover ads do not starve", async () => {
      let rolloverFilterSeen = false;
      vi.doMock("@/lib/redis", () => ({
        default: { status: "end" },
        isRedisReady: () => false,
      }));
      vi.doMock("@/lib/utils/cache", () => ({
        registerL1FeedEvictionHandler: vi.fn(),
        evictAdFromL1FeedCaches: vi.fn(),
      }));
      vi.doMock("@/lib/utils/dbAdmin", () => ({
        supabaseReadOnly: {
          from: vi.fn(() => {
            let isRolloverQuery = false;
            const chain: any = {
              select: vi.fn(() => chain),
              is: vi.fn(() => chain),
              or: vi.fn(() => chain),
              eq: vi.fn((col: string, val: any) => {
                if (col === "is_rollover" && val === true) {
                  isRolloverQuery = true;
                  rolloverFilterSeen = true;
                }
                return chain;
              }),
              order: vi.fn(() => chain),
              limit: vi.fn(async () => ({
                data: isRolloverQuery
                  ? [{ id: "rollover-low-bid", bid_price: 5, cost_per_impression: 20, is_rollover: true }]
                  : [{ id: "active-high-bid", bid_price: 200, cost_per_impression: 200 }],
                error: null,
              })),
            };
            return chain;
          }),
        },
      }));

      const { loadSharedActiveAdsForCountry } = await import("../feed/poolLoader");
      const pool = await loadSharedActiveAdsForCountry("Nigeria");
      expect(rolloverFilterSeen).toBe(true);
      expect(pool.map((a: any) => a.id)).toEqual(["active-high-bid", "rollover-low-bid"]);
    });
  });
});
