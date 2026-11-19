import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  NGN_AD_RATES,
  USD_AD_RATES,
  NGN_PER_USD,
  MIN_AD_ATTENTIONS,
  getLocalizedAdFloorRate,
  getLocalizedHighlightFloorRate,
  extractNormalizedHostname,
  applyProductSalesSubsidy,
} from "../utils/currency";
import { adAudienceSchema } from "../validationSchemas";

function makeJsonReq(url: string, method = "POST", body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

interface MockDbOptions {
  userCountry?: string | null;
  subscribers?: Array<{ domain: string; status: string; payment_status?: string }>;
  draftRow?: Record<string, any> | null;
  activeAdRow?: Record<string, any> | null;
  rpcRates?: Array<Record<string, any>> | null;
  onInsertAd?: (payload: any) => void;
}

function createSupabaseMock(opts: MockDbOptions = {}) {
  const subscribers = opts.subscribers ?? [];
  const makeBuilder = (table: string) => {
    let inValues: string[] | null = null;
    let statusFilter: string | null = null;
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: any) => {
        if (col === "status") statusFilter = String(val);
        return builder;
      }),
      ilike: vi.fn(() => builder),
      is: vi.fn(() => builder),
      like: vi.fn(() => builder),
      limit: vi.fn(async () => {
        if (table === "addsactive") {
          return { data: opts.activeAdRow ? [opts.activeAdRow] : [], error: null };
        }
        return { data: [], error: null };
      }),
      in: vi.fn((_col: string, vals: any[]) => {
        inValues = Array.isArray(vals) ? vals.map((v) => String(v).toLowerCase()) : [];
        return builder;
      }),
      insert: vi.fn((rows: any) => {
        if (table === "adds" && opts.onInsertAd) {
          opts.onInsertAd(Array.isArray(rows) ? rows[0] : rows);
        }
        return {
          select: vi.fn(async () => ({ data: Array.isArray(rows) ? rows : [rows], error: null })),
          then: (resolve: any) => resolve({ data: rows, error: null }),
        };
      }),
      upsert: vi.fn((rows: any) => {
        if (table === "adds" && opts.onInsertAd) {
          opts.onInsertAd(Array.isArray(rows) ? rows[0] : rows);
        }
        return {
          select: vi.fn(async () => ({ data: Array.isArray(rows) ? rows : [rows], error: null })),
        };
      }),
      update: vi.fn(() => builder),
      delete: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => {
        if (table === "users") {
          return {
            data: {
              ad_account_status: "active",
              country: opts.userCountry ?? "Nigeria",
              wallet_pin_hash: "hashed",
            },
            error: null,
          };
        }
        if (table === "adds") {
          return { data: opts.draftRow ?? null, error: null };
        }
        if (table === "addsactive") {
          return { data: opts.activeAdRow ?? null, error: null };
        }
        return { data: null, error: null };
      }),
      then: (resolve: any) => {
        if (table === "premium_subscribers") {
          const matched = subscribers.filter((s) => {
            const domOk = !inValues || inValues.includes(s.domain.toLowerCase());
            const statusOk = !statusFilter || s.status === statusFilter;
            return domOk && statusOk;
          });
          return resolve({ data: matched, error: null });
        }
        return resolve({ data: [], error: null });
      },
    };
    return builder;
  };

  const mockDb = {
    from: vi.fn((table: string) => makeBuilder(table)),
    rpc: vi.fn(async (fnName: string) => {
      if (fnName === "get_industry_attention_prices") {
        return { data: opts.rpcRates ?? [], error: null };
      }
      return { data: null, error: null };
    }),
  };
  return mockDb;
}

describe("Ad Pricing Floors, Billing Security & 100 Min Attentions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("exposes updated NGN & USD floors, NGN_PER_USD=1500, Highlight=1000, MIN_AD_ATTENTIONS=100", () => {
    expect(NGN_PER_USD).toBe(1500);
    expect(MIN_AD_ATTENTIONS).toBe(100);
    expect(NGN_AD_RATES).toEqual({
      politics: 900,
      business: 45,
      government: 750,
      individual: 25,
      religion: 900,
      product_sales: 55,
    });
    expect(USD_AD_RATES).toEqual({
      politics: 2.4,
      business: 0.12,
      government: 2.0,
      individual: 0.07,
      religion: 2.4,
      product_sales: 0.15,
    });
    expect(getLocalizedAdFloorRate("politics", "Nigeria")).toBe(900);
    expect(getLocalizedAdFloorRate("government", "United States")).toBe(2.0);
    expect(getLocalizedAdFloorRate("religion", "Canada")).toBe(2.4);
    expect(getLocalizedHighlightFloorRate("Nigeria")).toBe(1000);
    expect(applyProductSalesSubsidy(55)).toBe(38.5);
    expect(applyProductSalesSubsidy(0.15)).toBe(0.105);

    expect(extractNormalizedHostname("https://www.Baggyt.com/product/123?a=1")).toBe("baggyt.com");
    expect(extractNormalizedHostname("https://evil.com/?ref=baggyt.com")).toBe("evil.com");
    expect(extractNormalizedHostname("javascript:alert(1)")).toBeNull();
  });

  it("enforces 100 minimum attentions and 90 max campaign days in adAudienceSchema", () => {
    const valid = adAudienceSchema.safeParse({
      impressions: 100,
      campaignDays: 90,
      userFrequencyCap: 1,
    });
    expect(valid.success).toBe(true);

    const tooLow = adAudienceSchema.safeParse({
      impressions: 99,
      campaignDays: 1,
      userFrequencyCap: 1,
    });
    expect(tooLow.success).toBe(false);
    if (!tooLow.success) {
      expect(tooLow.error.issues[0].message).toContain("100");
    }

    const tooLong = adAudienceSchema.safeParse({
      impressions: 100,
      campaignDays: 91,
      userFrequencyCap: 1,
    });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) {
      expect(tooLong.error.issues[0].message).toContain("90");
    }
  });

  describe("POST /api/campaigns/submit floor & security enforcement", () => {
    function mockSubmitDeps(dbOpts: MockDbOptions) {
      const mockDb = createSupabaseMock(dbOpts);
      vi.doMock("@/lib/utils/dbAdmin", () => ({ default: mockDb, supabaseReadOnly: mockDb }));
      vi.doMock("@/lib/authHelper", () => ({
        getAuthenticatedEmail: vi.fn(async () => "advertiser@example.com"),
        isAdminEmail: vi.fn(() => false),
      }));
      vi.doMock("@/lib/services/cleanupService", () => ({
        cleanupExpiredApprovedCampaigns: vi.fn(async () => {}),
      }));
      vi.doMock("@/lib/utils/cache", () => ({
        invalidateCachedUserCampaigns: vi.fn(async () => {}),
      }));
      vi.doMock("@/lib/webhookDispatcher", () => ({
        dispatchNotificationWebhook: vi.fn(async () => {}),
      }));
      return mockDb;
    }

    it("rejects below-floor rates (politics at 30 or 899, government at 749, religion at 899)", async () => {
      mockSubmitDeps({ userCountry: "Nigeria" });
      const { POST } = await import("../../app/api/campaigns/submit/route");

      for (const [adType, badRate] of [
        ["politics", 30],
        ["politics", 899],
        ["government", 749],
        ["religion", 899],
      ] as const) {
        const res = await POST(
          makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
            adData: {
              adType,
              impressions: 500,
              costPerImpression: badRate,
              totalCost: badRate * 500,
              adContent: "Test ad",
            },
          })
        );
        expect(res.status).toBe(400);
      }
    });

    it("rejects < 100 attentions (99, 50) and > 90 days, accepts 100 attentions at NGN floor", async () => {
      let insertedRow: any = null;
      mockSubmitDeps({
        userCountry: "Nigeria",
        onInsertAd: (row) => {
          insertedRow = row;
        },
      });
      const { POST } = await import("../../app/api/campaigns/submit/route");

      const lowRes = await POST(
        makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
          adData: {
            adType: "politics",
            impressions: 99,
            costPerImpression: 900,
            totalCost: 900 * 99,
            adContent: "Test",
          },
        })
      );
      expect(lowRes.status).toBe(400);

      const overDaysRes = await POST(
        makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
          adData: {
            adType: "politics",
            impressions: 100,
            campaignDays: 91,
            costPerImpression: 900,
            totalCost: 900 * 100,
            adContent: "Test over days",
          },
        })
      );
      expect(overDaysRes.status).toBe(400);

      const okRes = await POST(
        makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
          adData: {
            adType: "politics",
            impressions: 100,
            campaignDays: 90,
            costPerImpression: 900,
            totalCost: 90000,
            adContent: "Valid politics ad",
          },
        })
      );
      expect(okRes.status).toBe(200);
      expect(insertedRow?.impressions).toBe(100);
      expect(insertedRow?.campaign_days).toBe(90);
      expect(insertedRow?.cost_per_impression).toBe(900);
      expect(insertedRow?.total_cost).toBe(90000);
    });

    it("allows 30% Business Subscriber subsidy ONLY on product_sales with verified active paid domain", async () => {
      let insertedRow: any = null;
      mockSubmitDeps({
        userCountry: "Nigeria",
        subscribers: [
          { domain: "baggyt.com", status: "active", payment_status: "paid" },
          { domain: "unpaid-shop.com", status: "pending", payment_status: "pending" },
        ],
        onInsertAd: (row) => {
          insertedRow = row;
        },
      });
      const { POST } = await import("../../app/api/campaigns/submit/route");

      // 1. Verified subdomain on product_sales -> 38.50 NGN accepted
      const validSubRes = await POST(
        makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
          adData: {
            adType: "product_sales",
            impressions: 500,
            costPerImpression: 38.5,
            totalCost: 19250,
            productCtaType: "Buy Now",
            productCtaLink: "https://shop.baggyt.com/sneakers",
            adContent: "Buy sneakers",
          },
        })
      );
      expect(validSubRes.status).toBe(200);
      expect(insertedRow?.cost_per_impression).toBe(38.5);
      expect(insertedRow?.total_cost).toBe(19250);

      // 2. Spoofed query string / domain suffix / unpaid domain -> rejected 400
      for (const badLink of [
        "https://evil.com/?ref=baggyt.com",
        "https://baggyt.com.evil.com/item",
        "https://unpaid-shop.com/item",
      ]) {
        const spoofRes = await POST(
          makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
            adData: {
              adType: "product_sales",
              impressions: 500,
              costPerImpression: 38.5,
              totalCost: 19250,
              productCtaType: "Buy Now",
              productCtaLink: badLink,
              adContent: "Spoof attempt",
            },
          })
        );
        expect(spoofRes.status).toBe(400);
      }

      // 3. Verified subscriber link on non-product_sales category (e.g. business) cannot claim 30% discount
      const wrongCategoryRes = await POST(
        makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
          adData: {
            adType: "business",
            impressions: 500,
            costPerImpression: 31.5,
            totalCost: 15750,
            productCtaType: "Visit Website",
            productCtaLink: "https://baggyt.com",
            adContent: "Business discount abuse",
          },
        })
      );
      expect(wrongCategoryRes.status).toBe(400);
    });

    it("enforces localized USD floors and blocks Nigerian user spoofing adData.country='United States'", async () => {
      // Nigerian account trying to pay $2.40 (NGN 2.40) by setting target country = United States
      mockSubmitDeps({ userCountry: "Nigeria" });
      let mod = await import("../../app/api/campaigns/submit/route");
      const crossCurrencySpoof = await mod.POST(
        makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
          adData: {
            adType: "politics",
            country: "United States",
            impressions: 500,
            costPerImpression: 2.4,
            totalCost: 1200,
            adContent: "Cross-currency attack",
          },
        })
      );
      expect(crossCurrencySpoof.status).toBe(400);

      // Legitimate US advertiser pays USD floor ($2.40 politics, $0.105 subsidized product_sales)
      vi.resetModules();
      mockSubmitDeps({
        userCountry: "United States",
        subscribers: [{ domain: "baggyt.com", status: "active", payment_status: "paid" }],
      });
      mod = await import("../../app/api/campaigns/submit/route");

      const validUsdPolitics = await mod.POST(
        makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
          adData: {
            adType: "politics",
            impressions: 500,
            costPerImpression: 2.4,
            totalCost: 1200,
            adContent: "US politics",
          },
        })
      );
      expect(validUsdPolitics.status).toBe(200);

      const belowUsdPolitics = await mod.POST(
        makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
          adData: {
            adType: "politics",
            impressions: 500,
            costPerImpression: 2.39,
            totalCost: 1195,
            adContent: "Below USD floor",
          },
        })
      );
      expect(belowUsdPolitics.status).toBe(400);

      const validUsdSubsidy = await mod.POST(
        makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
          adData: {
            adType: "product_sales",
            impressions: 500,
            costPerImpression: 0.105,
            totalCost: 52.5,
            productCtaType: "Buy Now",
            productCtaLink: "https://baggyt.com/us",
            adContent: "US subsidized product",
          },
        })
      );
      expect(validUsdSubsidy.status).toBe(200);
    });
  });

  describe("POST /api/payments/initialize & /wallet-pay & /boost & /market-rates", () => {
    it("initialize rejects below-floor ad rates, <500 attentions, and tampered publish_ad drafts", async () => {
      const mockDb = createSupabaseMock({
        userCountry: "Nigeria",
        draftRow: {
          id: "draft-stale-1",
          ad_type: "politics",
          impressions: 500,
          cost_per_impression: 30,
          total_cost: 15000,
          is_admin_post: false,
          admin_statement: `APPROVED:${new Date().toISOString()}`,
          user_email: "advertiser@example.com",
        },
      });
      vi.doMock("@/lib/utils/dbAdmin", () => ({ default: mockDb, supabaseReadOnly: mockDb }));
      vi.doMock("@/lib/authHelper", () => ({
        getAuthenticatedEmail: vi.fn(async () => "advertiser@example.com"),
        isAdminEmail: vi.fn(() => false),
      }));
      vi.doMock("@/lib/redis", () => ({
        default: { get: vi.fn(async () => null), set: vi.fn(async () => "OK") },
        isRedisReady: vi.fn(() => false),
      }));
      vi.doMock("@/lib/payment/payoutProvider", () => ({
        PayoutProvider: {
          getActiveGateway: vi.fn(async () => "kora"),
          initializePayment: vi.fn(async () => ({
            status: true,
            authorization_url: "https://pay.test/checkout",
            reference: "ref-123",
          })),
        },
      }));

      const { POST } = await import("../../app/api/payments/initialize/route");

      // Tampered politics rate=10, impressions=500 -> 400
      const lowRateRes = await POST(
        makeJsonReq("http://localhost/api/payments/initialize", "POST", {
          type: "ad",
          amount: 5000,
          metadata: {
            adData: {
              adType: "politics",
              impressions: 500,
              costPerImpression: 10,
            },
          },
        })
      );
      expect(lowRateRes.status).toBe(400);

      // Tampered impressions=99 -> 400
      const lowImpRes = await POST(
        makeJsonReq("http://localhost/api/payments/initialize", "POST", {
          type: "ad",
          amount: 89100,
          metadata: {
            adData: {
              adType: "politics",
              impressions: 99,
              costPerImpression: 900,
            },
          },
        })
      );
      expect(lowImpRes.status).toBe(400);

      // Stale/tampered publish_ad draft at 30 NGN politics -> 400
      const stalePublishRes = await POST(
        makeJsonReq("http://localhost/api/payments/initialize", "POST", {
          type: "publish_ad",
          amount: 15000,
          metadata: { adId: "draft-stale-1" },
        })
      );
      expect(stalePublishRes.status).toBe(400);

      // Valid politics 500 * 900 = 450000 -> 200
      const validRes = await POST(
        makeJsonReq("http://localhost/api/payments/initialize", "POST", {
          type: "ad",
          amount: 450000,
          metadata: {
            adData: {
              adType: "politics",
              impressions: 500,
              costPerImpression: 900,
            },
          },
        })
      );
      expect(validRes.status).toBe(200);
    });

    it("wallet-pay rejects below-floor ad and <500 attentions", async () => {
      const mockDb = createSupabaseMock({ userCountry: "Nigeria" });
      vi.doMock("@/lib/utils/dbAdmin", () => ({ default: mockDb, supabaseReadOnly: mockDb }));
      vi.doMock("@/lib/authHelper", () => ({
        getAuthenticatedEmail: vi.fn(async () => "advertiser@example.com"),
        isAdminEmail: vi.fn(() => false),
      }));
      vi.doMock("@/lib/redis", () => ({
        default: { get: vi.fn(async () => null), set: vi.fn(async () => "OK") },
        isRedisReady: vi.fn(() => false),
      }));
      vi.doMock("@/lib/utils/cache", () => ({ invalidateCachedProfile: vi.fn(async () => {}) }));
      vi.doMock("@/lib/services/payoutSettlementService", () => ({
        spendWalletBalanceAtomic: vi.fn(),
        refundWalletDeductionAtomic: vi.fn(),
      }));
      vi.doMock("@/lib/security/walletPinHelper", () => ({
        verifyTransactionPin: vi.fn(async () => ({ valid: true })),
        resolveStoredWalletPinHash: vi.fn(() => "hashed"),
      }));

      const { POST } = await import("../../app/api/payments/wallet-pay/route");

      const res = await POST(
        makeJsonReq("http://localhost/api/payments/wallet-pay", "POST", {
          type: "ad",
          amount: 15000,
          pin: "1234",
          metadata: {
            adData: {
              adType: "politics",
              impressions: 500,
              costPerImpression: 30,
            },
          },
        })
      );
      expect(res.status).toBe(400);
    });

    it("boost rejects rates below category floor", async () => {
      const mockDb = createSupabaseMock({
        userCountry: "Nigeria",
        activeAdRow: {
          id: "active-pol-1",
          user_email: "advertiser@example.com",
          ad_type: "politics",
          impressions: 500,
          impression_count: 100,
          cost_per_impression: 900,
          is_paused: false,
        },
      });
      vi.doMock("@/lib/utils/dbAdmin", () => ({ default: mockDb, supabaseReadOnly: mockDb }));
      vi.doMock("@/lib/authHelper", () => ({
        getAuthenticatedEmail: vi.fn(async () => "advertiser@example.com"),
        isAdminEmail: vi.fn(() => false),
      }));
      vi.doMock("@/lib/redis", () => ({ default: { status: "end" }, isRedisReady: () => false }));
      vi.doMock("@/lib/payment/payoutProvider", () => ({ PayoutProvider: {} }));
      vi.doMock("@/lib/services/payoutSettlementService", () => ({ spendWalletBalanceAtomic: vi.fn() }));
      vi.doMock("@/lib/utils/cache", () => ({
        invalidateCachedProfile: vi.fn(async () => {}),
        invalidateCachedUserCampaigns: vi.fn(async () => {}),
        evictAdFromL1FeedCaches: vi.fn(),
        invalidateSharedHighlightsPool: vi.fn(),
      }));
      vi.doMock("@/lib/security/walletPinHelper", () => ({
        verifyTransactionPin: vi.fn(async () => ({ valid: true })),
        resolveStoredWalletPinHash: vi.fn(() => "hashed"),
      }));

      const { POST } = await import("../../app/api/campaigns/boost/route");

      const res = await POST(
        makeJsonReq("http://localhost/api/campaigns/boost", "POST", {
          adId: "active-pol-1",
          additionalImpressions: 500,
          newCostPerImpression: 500,
          paymentMethod: "wallet",
          pin: "1234",
          walletPin: "1234",
        })
      );
      expect(res.status).toBe(400);
    });

    it("market-rates overrides stale DB RPC 1500/2000 values with authoritative floors (900/750/900)", async () => {
      const mockDb = createSupabaseMock({
        rpcRates: [
          { industry_name: "politics", floor_price: 1500, highest_bid: 1500, total_active_bids: 0 },
          { industry_name: "government", floor_price: 2000, highest_bid: 2000, total_active_bids: 0 },
          { industry_name: "religion", floor_price: 1500, highest_bid: 1500, total_active_bids: 0 },
        ],
      });
      vi.doMock("@/lib/utils/dbAdmin", () => ({ default: mockDb, supabaseReadOnly: mockDb }));
      vi.doMock("@/lib/redis", () => ({
        default: { get: vi.fn(async () => null), set: vi.fn(async () => "OK") },
        isRedisReady: vi.fn(() => false),
      }));

      const { GET } = await import("../../app/api/bidding/market-rates/route");
      const res = await GET(makeJsonReq("http://localhost/api/bidding/market-rates", "GET"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.marketRates.politics.floorPrice).toBe(900);
      expect(body.marketRates.politics.highestBid).toBe(900);
      expect(body.marketRates.government.floorPrice).toBe(750);
      expect(body.marketRates.religion.floorPrice).toBe(900);
      expect(body.marketRates.business.floorPrice).toBe(45);
      expect(body.marketRates.individual.floorPrice).toBe(25);
      expect(body.marketRates.product_sales.floorPrice).toBe(55);
    });

    it("persists is_bidded & bid_price on /api/campaigns/submit and syncs bidded_ads on wallet-pay publish_ad", async () => {
      const insertedQueueRows: any[] = [];
      const mockSubmitDb = createSupabaseMock({
        userCountry: "Nigeria",
        onInsertAd: (row) => insertedQueueRows.push(row),
      });
      vi.doMock("@/lib/utils/dbAdmin", () => ({ default: mockSubmitDb, supabaseReadOnly: mockSubmitDb }));
      vi.doMock("@/lib/authHelper", () => ({
        getAuthenticatedEmail: vi.fn(async () => "advertiser@example.com"),
        isAdminEmail: vi.fn(() => false),
      }));
      vi.doMock("@/lib/services/cleanupService", () => ({
        cleanupExpiredApprovedCampaigns: vi.fn(async () => {}),
      }));
      vi.doMock("@/lib/utils/cache", () => ({
        invalidateCachedUserCampaigns: vi.fn(async () => {}),
      }));
      vi.doMock("@/lib/webhookDispatcher", () => ({
        dispatchNotificationWebhook: vi.fn(async () => {}),
      }));

      const { POST: submitPost } = await import("../../app/api/campaigns/submit/route");

      // 1. Bidded ad above floor -> saves is_bidded: true, bid_price: 120
      const biddedRes = await submitPost(
        makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
          adData: {
            adType: "business",
            impressions: 500,
            costPerImpression: 120,
            totalCost: 60000,
            isBidded: true,
            bidPrice: 120,
            adContent: "Priority bidded business campaign",
          },
        })
      );
      expect(biddedRes.status).toBe(200);
      expect(insertedQueueRows[0]?.is_bidded).toBe(true);
      expect(insertedQueueRows[0]?.bid_price).toBe(120);

      // 2. Floor ad -> saves is_bidded: false, bid_price: null
      const floorRes = await submitPost(
        makeJsonReq("http://localhost/api/campaigns/submit", "POST", {
          adData: {
            adType: "business",
            impressions: 500,
            costPerImpression: 45,
            totalCost: 22500,
            isBidded: false,
            adContent: "Standard floor business campaign",
          },
        })
      );
      expect(floorRes.status).toBe(200);
      expect(insertedQueueRows[1]?.is_bidded).toBe(false);
      expect(insertedQueueRows[1]?.bid_price).toBeNull();

      // 3. Wallet-pay publish_ad syncs bidded_ads & Redis ZSET when bidded, skips bidded_ads when floor
      vi.resetModules();
      const biddedAdsInserts: any[] = [];
      const redisZaddCalls: any[] = [];
      const redisDelCalls: string[] = [];

      const publishMockFor = (draftRow: Record<string, any>) => ({
        from: vi.fn((table: string) => {
          const chain: any = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            ilike: vi.fn(() => chain),
            update: vi.fn(() => chain),
            delete: vi.fn(() => chain),
            upsert: vi.fn((rows: any) => ({
              select: vi.fn(async () => ({ data: Array.isArray(rows) ? rows : [rows], error: null })),
            })),
            insert: vi.fn((rows: any) => {
              if (table === "bidded_ads") {
                biddedAdsInserts.push(Array.isArray(rows) ? rows[0] : rows);
              }
              return {
                select: vi.fn(async () => ({ data: Array.isArray(rows) ? rows : [rows], error: null })),
                then: (resolve: any) => resolve({ data: rows, error: null }),
              };
            }),
            maybeSingle: vi.fn(async () => {
              if (table === "users") {
                return {
                  data: {
                    email: "advertiser@example.com",
                    country: "Nigeria",
                    wallet_pin_hash: "hashed",
                  },
                  error: null,
                };
              }
              if (table === "adds") {
                return { data: draftRow, error: null };
              }
              return { data: null, error: null };
            }),
            then: (resolve: any) => resolve({ data: [], error: null }),
          };
          return chain;
        }),
        rpc: vi.fn(async () => ({ data: null, error: null })),
      });

      const sharedMocks = () => {
        vi.doMock("@/lib/authHelper", () => ({
          getAuthenticatedEmail: vi.fn(async () => "advertiser@example.com"),
          isAdminEmail: vi.fn(() => false),
        }));
        vi.doMock("@/lib/redis", () => ({
          default: {
            get: vi.fn(async () => null),
            set: vi.fn(async () => "OK"),
            incr: vi.fn(async () => 1),
            del: vi.fn(async (...keys: string[]) => {
              redisDelCalls.push(...keys);
              return 1;
            }),
            zadd: vi.fn(async (...args: any[]) => {
              redisZaddCalls.push(args);
              return 1;
            }),
          },
          isRedisReady: vi.fn(() => false),
        }));
        vi.doMock("@/lib/utils/cache", () => ({
          invalidateCachedProfile: vi.fn(async () => {}),
          invalidateCachedUserCampaigns: vi.fn(async () => {}),
          evictAdFromL1FeedCaches: vi.fn(),
        }));
        vi.doMock("@/lib/services/payoutSettlementService", () => ({
          spendWalletBalanceAtomic: vi.fn(async () => ({ success: true, newBalance: 100000 })),
          refundWalletDeductionAtomic: vi.fn(async () => ({ success: true })),
        }));
        vi.doMock("@/lib/security/walletPinHelper", () => ({
          verifyTransactionPin: vi.fn(async () => ({ valid: true })),
          resolveStoredWalletPinHash: vi.fn(() => "hashed"),
        }));
        vi.doMock("@/lib/webhookDispatcher", () => ({
          dispatchFeedDropWebhook: vi.fn(async () => {}),
          dispatchNotificationWebhook: vi.fn(async () => {}),
        }));
      };

      const biddedPublishDb = publishMockFor({
        id: "pub-bid-1",
        user_email: "advertiser@example.com",
        ad_type: "business",
        industry: ["business"],
        impressions: 500,
        campaign_days: 5,
        user_frequency_cap: 1,
        targeting_all: true,
        cost_per_impression: 120,
        bid_price: 120,
        is_bidded: true,
        total_cost: 60000,
        admin_statement: `APPROVED:${new Date().toISOString()}`,
      });
      vi.doMock("@/lib/utils/dbAdmin", () => ({ default: biddedPublishDb, supabaseReadOnly: biddedPublishDb }));
      sharedMocks();

      let mod = await import("../../app/api/payments/wallet-pay/route");
      const pubBidRes = await mod.POST(
        makeJsonReq("http://localhost/api/payments/wallet-pay", "POST", {
          type: "publish_ad",
          amount: 60000,
          pin: "1234",
          metadata: { adId: "pub-bid-1" },
        })
      );
      expect(pubBidRes.status).toBe(200);
      expect(biddedAdsInserts).toHaveLength(1);
      expect(biddedAdsInserts[0]).toMatchObject({
        ad_id: "pub-bid-1",
        industry: "business",
        bid_price: 120,
        is_active: true,
      });
      expect(redisZaddCalls).toContainEqual(["bids:zset:business", 120, "pub-bid-1"]);
      expect(redisDelCalls).toContain("attention:market_rates");

      // Floor-priced publish_ad should succeed cleanly WITHOUT adding to bidded_ads
      vi.resetModules();
      biddedAdsInserts.length = 0;
      const floorPublishDb = publishMockFor({
        id: "pub-floor-1",
        user_email: "advertiser@example.com",
        ad_type: "business",
        industry: ["business"],
        impressions: 500,
        campaign_days: 5,
        user_frequency_cap: 1,
        targeting_all: true,
        cost_per_impression: 45,
        bid_price: null,
        is_bidded: false,
        total_cost: 22500,
        admin_statement: `APPROVED:${new Date().toISOString()}`,
      });
      vi.doMock("@/lib/utils/dbAdmin", () => ({ default: floorPublishDb, supabaseReadOnly: floorPublishDb }));
      sharedMocks();

      mod = await import("../../app/api/payments/wallet-pay/route");
      const pubFloorRes = await mod.POST(
        makeJsonReq("http://localhost/api/payments/wallet-pay", "POST", {
          type: "publish_ad",
          amount: 22500,
          pin: "1234",
          metadata: { adId: "pub-floor-1" },
        })
      );
      expect(pubFloorRes.status).toBe(200);
      expect(biddedAdsInserts).toHaveLength(0);
    });
  });
});
