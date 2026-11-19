import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { calculateSharedAffiliateCut } from "../affiliateEngine";
import { getUserCurrency, convertNgnToUsd, convertUsdToNgn, formatCurrency } from "../utils/currency";
import { decodeStatementCursor, encodeStatementCursor } from "../payment/historyHelpers";
import { calculateAtwTier } from "../referralEngine";

describe("Full 4-Phase Audit Remediation Regression Suite (Web)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("shares a fixed 20% affiliate pool evenly across N active affiliates (company 30% untouched)", () => {
    // Base CPI = ₦100 -> 20% total pool = ₦20 shared across N affiliates
    expect(calculateSharedAffiliateCut(100, 1)).toBe(20);
    expect(calculateSharedAffiliateCut(100, 2)).toBe(10); // 2 affiliates -> 10% each
    expect(calculateSharedAffiliateCut(100, 3)).toBe(6.67); // 3 affiliates -> 6.67% each
    expect(calculateSharedAffiliateCut(100, 4)).toBe(5); // 4 affiliates -> 5% each
    expect(calculateSharedAffiliateCut(100, 5)).toBe(4); // 5 affiliates -> 4% each
    expect(calculateSharedAffiliateCut(100, 0)).toBe(0);
    expect(calculateSharedAffiliateCut(-50, 2)).toBe(0);

    // Verify 50% max earner + 20% affiliate pool + 30% company = 100%
    const cpi = 900; // Politics floor
    const maxEarner = cpi * 0.5;
    const fourAffiliatesTotal = calculateSharedAffiliateCut(cpi, 4) * 4;
    const companyShare = cpi - maxEarner - fourAffiliatesTotal;
    expect(fourAffiliatesTotal).toBe(180);
    expect(companyShare).toBe(270); // Exact 30% untouched
  });

  it("resolves NGN vs USD using exact country/region matching (never substring 'ng') and converts accurately", () => {
    expect(getUserCurrency("Nigeria")).toBe("NGN");
    expect(getUserCurrency("NG")).toBe("NGN");
    expect(getUserCurrency("Lagos, Nigeria")).toBe("NGN");
    expect(getUserCurrency("Abuja")).toBe("NGN");
    expect(getUserCurrency("PLACEHOLDER")).toBe("NGN");

    // Previously falsely matched NGN because of substring "ng"
    expect(getUserCurrency("United Kingdom")).toBe("USD");
    expect(getUserCurrency("England")).toBe("USD");
    expect(getUserCurrency("Singapore")).toBe("USD");
    expect(getUserCurrency("Hong Kong")).toBe("USD");
    expect(getUserCurrency("Angola")).toBe("USD");
    expect(getUserCurrency("Congo")).toBe("USD");
    expect(getUserCurrency("Hungary")).toBe("USD");
    expect(getUserCurrency("Niger")).toBe("USD");
    expect(getUserCurrency("United States")).toBe("USD");

    expect(convertNgnToUsd(15000)).toBe(10);
    expect(convertUsdToNgn(10)).toBe(15000);
    expect(formatCurrency(15000, "United States", { convertFromNgn: true })).toBe("$10.00");
    expect(formatCurrency(2.4, "United States")).toBe("$2.40");
  });

  it("fails closed on Redis SET NX when offline (returns null, never 'OK')", async () => {
    const prevRedisUrl = process.env.REDIS_URL;
    const prevUpstashUrl = process.env.UPSTASH_REDIS_URL;
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_URL;

    try {
      const { default: redisConn, isRedisReady } = await import("../redis");
      expect(isRedisReady()).toBe(false);
      const nxRes = await redisConn.set("lock:test:idempotency", "1", "EX", 60, "NX");
      expect(nxRes).toBeNull();
      const mgetRes = await redisConn.mget("a", "b");
      expect(mgetRes).toEqual([null, null]);
    } finally {
      if (prevRedisUrl !== undefined) process.env.REDIS_URL = prevRedisUrl;
      if (prevUpstashUrl !== undefined) process.env.UPSTASH_REDIS_URL = prevUpstashUrl;
    }
  });

  it("rejects PostgREST filter injection payloads in statement cursor decoding", () => {
    const valid = encodeStatementCursor({
      created_at: "2026-11-19T06:00:00.000Z",
      id: "pay_12345",
    });
    expect(valid).toBeTruthy();
    expect(decodeStatementCursor(valid)).toEqual({
      createdAt: "2026-11-19T06:00:00.000Z",
      id: "pay_12345",
    });

    const injectedTimestamp = Buffer.from(
      JSON.stringify({ c: "2026-11-19T06:00:00Z),id.neq.0", i: "1" }),
      "utf8"
    ).toString("base64url");
    expect(decodeStatementCursor(injectedTimestamp)).toBeNull();

    const injectedId = Buffer.from(
      JSON.stringify({ c: "2026-11-19T06:00:00Z", i: "1,user_email.eq.admin@paayh.com" }),
      "utf8"
    ).toString("base64url");
    expect(decodeStatementCursor(injectedId)).toBeNull();
  });

  it("caps ATW tier calculation strictly at ATW14 (₦420,000 holding cap)", () => {
    expect(calculateAtwTier(0)).toEqual({ tier: "ATW1", level: 1, holdingLimit: 30000 });
    expect(calculateAtwTier(500)).toEqual({ tier: "ATW1", level: 1, holdingLimit: 30000 });
    expect(calculateAtwTier(7000)).toEqual({ tier: "ATW14", level: 14, holdingLimit: 420000 });
    expect(calculateAtwTier(500000)).toEqual({ tier: "ATW14", level: 14, holdingLimit: 420000 });
    expect(calculateAtwTier(0, true).holdingLimit).toBe(Infinity);
  });

  it("evaluates temporary block, auto-expired temporary block, permanent block, and simple blocked message", async () => {
    let dbUserRow: any = null;
    let dbDeactRow: any = null;
    const updateCalls: any[] = [];

    vi.doMock("@/lib/redis", () => ({
      default: {
        get: vi.fn(async () => null),
        set: vi.fn(async () => null),
        del: vi.fn(async () => 0),
      },
      isRedisReady: () => false,
    }));

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn((payload: any) => {
            updateCalls.push({ table, payload });
            return {
              eq: vi.fn(async () => ({ error: null })),
              ilike: vi.fn(async () => ({ error: null })),
            };
          }),
          maybeSingle: vi.fn(async () => {
            if (table === "deactivated_users") return { data: dbDeactRow, error: null };
            return { data: dbUserRow, error: null };
          }),
        })),
      },
    }));

    const { getAccountAccessStatus, invalidateAuthStatusCache, formatAccountBlockedMessage } =
      await import("../authHelper");

    // 1. Temporary block (future expiry)
    const futureIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    dbUserRow = {
      id: "u1",
      ad_account_status: "temp_blocked",
      suspended_until: futureIso,
      ad_ban_reason: "Policy review",
    };
    dbDeactRow = null;
    await invalidateAuthStatusCache("temp@paayh.com");
    const tempRes = await getAccountAccessStatus("temp@paayh.com");
    expect(tempRes.state).toBe("temp_blocked");
    expect(tempRes.blocked).toBe(true);
    expect(tempRes.blockType).toBe("temporary");
    expect(tempRes.message).toContain("temporarily blocked");
    expect(tempRes.message).toContain("Policy review");

    // 2. Expired temporary block auto-restores active access
    const pastIso = new Date(Date.now() - 3600 * 1000).toISOString();
    dbUserRow = {
      id: "u2",
      ad_account_status: "temp_blocked",
      suspended_until: pastIso,
      ad_ban_reason: "Old hold",
    };
    await invalidateAuthStatusCache("expired@paayh.com");
    const expiredRes = await getAccountAccessStatus("expired@paayh.com");
    expect(expiredRes.state).toBe("active");
    expect(expiredRes.blocked).toBe(false);
    expect(updateCalls.some((c) => c.payload?.ad_account_status === "active")).toBe(true);

    // 3. Permanent block
    dbUserRow = {
      id: "u3",
      ad_account_status: "perm_banned",
      suspended_until: null,
      ad_ban_reason: "Repeated fraud",
    };
    dbDeactRow = { reason: "admin_perm_banned" };
    await invalidateAuthStatusCache("perm@paayh.com");
    const permRes = await getAccountAccessStatus("perm@paayh.com");
    expect(permRes.state).toBe("perm_banned");
    expect(permRes.blocked).toBe(true);
    expect(permRes.blockType).toBe("permanent");
    expect(permRes.message).toContain("permanently blocked");

    // 4. Simple clean user-facing copy
    expect(formatAccountBlockedMessage({ blockType: "permanent" })).toBe(
      "Your account has been permanently blocked from accessing Paayh."
    );
  });

  it("enforces <=180s and <=50MB on presigned direct video upload endpoint /api/campaigns/upload-video-url", async () => {
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "creator@paayh.com"),
    }));
    vi.doMock("@/lib/edgeRateLimit", () => ({
      checkRateLimit: vi.fn(async () => ({ allowed: true })),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        storage: {
          from: vi.fn(() => ({
            createSignedUploadUrl: vi.fn(async (path: string) => ({
              data: {
                signedUrl: `https://proj.supabase.co/storage/v1/upload/sign/ad-media/${path}?token=abc`,
                token: "abc",
              },
              error: null,
            })),
            getPublicUrl: vi.fn((path: string) => ({
              data: {
                publicUrl: `https://proj.supabase.co/storage/v1/object/public/ad-media/${path}`,
              },
            })),
          })),
        },
      },
    }));

    const { POST } = await import("../../app/api/campaigns/upload-video-url/route");

    // Reject video > 180 seconds
    const overDurationRes = await POST(
      new NextRequest("http://localhost:3000/api/campaigns/upload-video-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket: "ad-media",
          fileName: "promo.mp4",
          contentType: "video/mp4",
          durationSeconds: 185,
          fileSizeBytes: 12_000_000,
        }),
      })
    );
    expect(overDurationRes.status).toBe(400);

    // Accept valid 15MB, 60s video -> direct presigned URL (bypasses Vercel 4.5MB limit)
    const validRes = await POST(
      new NextRequest("http://localhost:3000/api/campaigns/upload-video-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket: "ad-media",
          fileName: "promo.mp4",
          contentType: "video/mp4",
          durationSeconds: 60,
          fileSizeBytes: 15_000_000,
        }),
      })
    );
    const validJson = await validRes.json();
    expect(validRes.status).toBe(200);
    expect(validJson.signedUrl).toContain("upload/sign/ad-media/");
    expect(validJson.publicUrl).toContain("/storage/v1/object/public/ad-media/");
  });
});
