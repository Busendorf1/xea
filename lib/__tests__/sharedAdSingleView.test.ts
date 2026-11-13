import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  APP_CUSTOM_SCHEME,
  buildAdAppSchemeUrl,
  buildAdShareUrl,
  extractSharedAdIdFromSearchParams,
} from "../utils/adShare";

describe("Shared Ad Single-Ad Rendering (Web)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("extracts ad ids from modern & legacy query params and builds xea-auth deep links", () => {
    expect(APP_CUSTOM_SCHEME).toBe("xea-auth");
    expect(buildAdAppSchemeUrl("ad_abc_123")).toBe("xea-auth://ad/ad_abc_123");
    expect(buildAdShareUrl("ad_abc_123")).toBe("https://paayh.com/ad/ad_abc_123");

    expect(extractSharedAdIdFromSearchParams(new URLSearchParams("ad=ad_111"))).toBe("ad_111");
    expect(extractSharedAdIdFromSearchParams(new URLSearchParams("sharedAdId=ad_222"))).toBe("ad_222");
    expect(extractSharedAdIdFromSearchParams(new URLSearchParams("adId=ad_333"))).toBe("ad_333");

    const b64 = Buffer.from("ad_legacy_444", "utf8").toString("base64");
    expect(extractSharedAdIdFromSearchParams(new URLSearchParams({ blurb: b64 }))).toBe("ad_legacy_444");
    expect(extractSharedAdIdFromSearchParams(new URLSearchParams({ "Earn Ads by Paayh": b64 }))).toBe(
      "ad_legacy_444"
    );
  });

  it("resolveSharedAdForFeed returns ONLY the single shared ad and drops unrelated feed ads", async () => {
    const sharedAd = {
      id: "ad_only_1",
      user_email: "pub@paayh.com",
      ad_content: "Target shared ad",
      completed_at: null,
      is_paused: false,
      cost_per_impression: 0.05,
      impressions: 100,
    };
    const otherAd = {
      id: "ad_other_2",
      user_email: "other@paayh.com",
      ad_content: "Unrelated feed ad",
      completed_at: null,
      is_paused: false,
    };

    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn().mockResolvedValue(null),
      registerL1FeedEvictionHandler: vi.fn(),
    }));
    vi.doMock("@/lib/targetingEngine", () => ({}));
    vi.doMock("@/lib/ads/publicAdResolver", async () => await import("../ads/publicAdResolver"));
    vi.doMock("@/lib/redis", () => ({
      default: { get: vi.fn(), set: vi.fn() },
      isRedisReady: vi.fn().mockReturnValue(false),
      redisConnection: { get: vi.fn(), set: vi.fn() },
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      supabaseReadOnly: {
        from: vi.fn((table: string) => {
          if (table === "addsactive") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn((_col: string, id: unknown) => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: id === "ad_only_1" ? sharedAd : null,
                  error: null,
                }),
              })),
            };
          }
          if (table === "users") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    email: "pub@paayh.com",
                    username: "targetpub",
                    business_name: "Target Pub Co",
                    monetized: true,
                  },
                ],
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
        }),
      },
    }));
    vi.doMock("../feed/poolLoader", () => ({
      formatPublisherProfile: (row: any) => ({
        email: String(row.email || "").toLowerCase(),
        username: row.username,
        business_name: row.business_name,
        monetized: Boolean(row.monetized),
      }),
    }));
    vi.doMock("../feed/feedCaches", () => ({
      AD_DETAIL_TTL_SECONDS: 1800,
      AD_SELECT_FIELDS: "id, user_email, ad_content",
      AD_SELECT_FIELDS_FALLBACK: "id, user_email, ad_content",
      l1AdDetailsCache: new Map(),
      l1PublisherProfilesCache: new Map(),
    }));

    const { resolveSharedAdForFeed } = await import("../feed/sharedAdResolver");

    // 1. Offset 0 returns strictly ONLY sharedAd and its publisher profile
    const res0 = await resolveSharedAdForFeed({
      sharedAdId: "ad_only_1",
      offset: 0,
      pageAds: [otherAd as any, sharedAd as any],
      profilesMap: { "other@paayh.com": { email: "other@paayh.com" } as any },
    });
    expect(res0.sharedAdUnavailable).toBe(false);
    expect(res0.pageAds).toHaveLength(1);
    expect(res0.pageAds[0].id).toBe("ad_only_1");
    expect(Object.keys(res0.profilesMap)).toEqual(["pub@paayh.com"]);

    // 2. Offset > 0 returns empty pageAds so pagination never injects surrounding ads
    const resPaged = await resolveSharedAdForFeed({
      sharedAdId: "ad_only_1",
      offset: 10,
      pageAds: [otherAd as any],
      profilesMap: {},
    });
    expect(resPaged.pageAds).toHaveLength(0);

    // 3. Missing / unavailable ad clears pageAds and flags sharedAdUnavailable
    const resMissing = await resolveSharedAdForFeed({
      sharedAdId: "ad_missing_999",
      offset: 0,
      pageAds: [otherAd as any],
      profilesMap: {},
    });
    expect(resMissing.sharedAdUnavailable).toBe(true);
    expect(resMissing.pageAds).toHaveLength(0);
  });

  it("resolvePublicSharedAdDetail returns public-safe Ad + publisher for active ad and unavailable for paused/missing", async () => {
    const activeRow = {
      id: "ad_pub_active",
      user_email: "brand@paayh.com",
      ad_content: "Public shared campaign",
      ad_media: "https://bucket.supabase.co/storage/v1/object/public/ads/pic.jpg",
      completed_at: null,
      is_paused: false,
      cost_per_impression: 0.04,
      impressions: 500,
      impression_count: 10,
    };
    const pausedRow = {
      ...activeRow,
      id: "ad_pub_paused",
      is_paused: true,
    };

    vi.doMock("../redis", () => ({
      isRedisReady: vi.fn().mockReturnValue(false),
      redisConnection: { get: vi.fn(), set: vi.fn() },
    }));
    vi.doMock("../utils/dbAdmin", () => ({
      supabaseReadOnly: {
        from: vi.fn((table: string) => {
          if (table === "addsactive") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn((_col: string, id: unknown) => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: id === "ad_pub_active" ? activeRow : id === "ad_pub_paused" ? pausedRow : null,
                  error: null,
                }),
              })),
            };
          }
          if (table === "users") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [{ email: "brand@paayh.com", business_name: "Brand LLC", monetized: true }],
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
        }),
      },
    }));

    const { resolvePublicSharedAdDetail } = await import("../ads/publicAdResolver");

    const ok = await resolvePublicSharedAdDetail("ad_pub_active");
    expect(ok.available).toBe(true);
    if (ok.available) {
      expect(ok.ad.id).toBe("ad_pub_active");
      expect(ok.profile?.business_name).toBe("Brand LLC");
    }

    const paused = await resolvePublicSharedAdDetail("ad_pub_paused");
    expect(paused).toEqual({ available: false, reason: "expired" });

    const missing = await resolvePublicSharedAdDetail("ad_missing_nope");
    expect(missing).toEqual({ available: false, reason: "not_found" });

    const invalid = await resolvePublicSharedAdDetail("bad id!!");
    expect(invalid).toEqual({ available: false, reason: "invalid_id" });
  });

  it("Web entry routes and Feed component enforce single-ad isolation without full-feed takeover", () => {
    const rootDir = path.resolve(__dirname, "../..");
    const homeSrc = fs.readFileSync(path.join(rootDir, "app/page.tsx"), "utf8");
    const loggedInSrc = fs.readFileSync(path.join(rootDir, "app/logged-in/page.tsx"), "utf8");
    const adRouteSrc = fs.readFileSync(path.join(rootDir, "app/ad/[id]/page.tsx"), "utf8");
    const publicViewSrc = fs.readFileSync(path.join(rootDir, "app/ad/[id]/PublicSharedAdView.tsx"), "utf8");
    const feedSrc = fs.readFileSync(path.join(rootDir, "components/Feed/page.tsx"), "utf8");

    // Unauthenticated /?ad=<id> or /?sharedAdId=<id> redirects to /ad/<id> rather than ModalLandingPage
    expect(homeSrc).toMatch(/redirect\(`\/ad\/\$\{encodeURIComponent\(sharedAdId\)\}`\)/);
    // Unauthenticated /ad/[id] renders PublicSharedAdView directly (no loop back to /)
    expect(adRouteSrc).toMatch(/resolvePublicSharedAdDetail/);
    expect(adRouteSrc).toMatch(/<PublicSharedAdView/);
    // Auth0 login preserves shared ad target
    expect(publicViewSrc).toMatch(/\/auth\/login\?returnTo=/);
    expect(publicViewSrc).toMatch(/This ad is no longer available/);

    // Authenticated /logged-in preserves sharedAdId, forces feed tab, omits initialAds & initialHighlights
    expect(loggedInSrc).toMatch(/isSharedAdMode\s*\?\s*undefined\s*:\s*profileResult\.initialAds/);
    expect(loggedInSrc).toMatch(/isSharedAdMode\s*\?\s*\[\]\s*:\s*profileResult\.initialHighlights/);

    // Feed isolates displayFeed to activeSharedAdId (even if locationSkipped) without highlights or pagination
    expect(feedSrc).toMatch(/if\s*\(activeSharedAdId\)\s*\{[\s\S]*?\.slice\(0,\s*1\)[\s\S]*?if\s*\(locationSkipped\)/);
    expect(feedSrc).toMatch(/!isSharedAdMode && locationSkipped && <FeedLocationSkippedState/);
    expect(feedSrc).toMatch(/if\s*\(loading \|\| loadingMore \|\| !hasMore \|\| isSharedAdMode\)\s*return/);
    expect(feedSrc).toMatch(/<FeedSharedAdUnavailableState/);
  });
});
