import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

describe("Wallet & PIN Security", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("verifyTransactionPin fails closed when storedPinHash is unset, resolves passphrase prefix, and locks out for 45 mins", async () => {
    const evalSpy = vi.fn().mockResolvedValue([5, 2700]);
    vi.doMock("../redis", () => ({
      default: {
        get: vi.fn().mockResolvedValue(null),
        eval: evalSpy,
        incr: vi.fn().mockResolvedValue(5),
        expire: vi.fn().mockResolvedValue(1),
        ttl: vi.fn().mockResolvedValue(2700),
      },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("../security/piiCrypto", async () => await import("../security/piiCrypto"));

    const {
      verifyTransactionPin,
      resolveStoredWalletPinHash,
      recordFailedPinAttempt,
      getPinAttemptBucket,
    } = await import("../security/walletPinHelper");

    const unset = await verifyTransactionPin({
      email: "user@example.com",
      pin: "1234",
      storedPinHash: null,
    });
    expect(unset.valid).toBe(false);
    expect(unset.statusCode).toBe(403);
    expect(unset.code).toBe("PIN_NOT_SET");

    expect(resolveStoredWalletPinHash({ passphrase: "pin:v1:abcd" })).toBe("pin:v1:abcd");
    expect(resolveStoredWalletPinHash({ passphrase: "legacy_plain_passphrase" })).toBeNull();
    expect(resolveStoredWalletPinHash({ wallet_pin_hash: "pin:v1:wxyz", passphrase: "pin:v1:abcd" })).toBe(
      "pin:v1:wxyz"
    );

    const bucket = getPinAttemptBucket("User@Example.com");
    expect(bucket).toBe("wallet_pin_fail:user@example.com");

    const lockout = await recordFailedPinAttempt(bucket);
    expect(evalSpy).toHaveBeenCalledTimes(1);
    expect(lockout.locked).toBe(true);
    expect(lockout.minsLeft).toBe(45);
  });
});

describe("Auth, Profile & Permanent Deactivation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("getAuthenticatedEmail fails closed on deactivated accounts and never reactivates", async () => {
    const delSpy = vi.fn().mockResolvedValue(1);
    const updateSpy = vi.fn();

    vi.doMock("../redis", () => ({
      default: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key.startsWith("deactivated:")) return Promise.resolve("1");
          if (key.startsWith("auth:bearer:")) return Promise.resolve("dead@example.com");
          return Promise.resolve(null);
        }),
        set: vi.fn().mockResolvedValue("OK"),
        del: delSpy,
      },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("../auth0", () => ({
      auth0: { getSession: vi.fn().mockResolvedValue(null) },
    }));
    vi.doMock("../logger", () => ({
      captureApiException: vi.fn(),
    }));
    vi.doMock("../utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => {
          if (table === "deactivated_emails") {
            return {
              select: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: { email: "dead@example.com" }, error: null }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            update: updateSpy,
          };
        }),
      },
    }));

    const { getAuthenticatedEmail } = await import("../authHelper");
    const req = new NextRequest("https://paayh.com/api/profile", {
      headers: { Authorization: "Bearer stale.jwt.token" },
    });

    const email = await getAuthenticatedEmail(req);
    expect(email).toBeNull();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(delSpy).toHaveBeenCalled();
  });

  it("GET /api/profile reads :v2: live clicks, respects has_cancelled_monetization, and blocks deactivated users with 403", async () => {
    const getSpy = vi.fn().mockImplementation((key: string) => {
      if (key === "user:live_clicks:v2:alice@paayh.com") return Promise.resolve("420");
      return Promise.resolve(null);
    });

    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("alice@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
      isEmailDeactivated: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn().mockResolvedValue(null),
      setCachedProfile: vi.fn().mockResolvedValue(undefined),
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
      registerL1FeedEvictionHandler: vi.fn(),
    }));
    vi.doMock("@/lib/utils/activityTracker", () => ({
      touchUserActivity: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/adminHelper", () => ({
      isExemptFromBarriersAndInactivity: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: { get: getSpy, set: vi.fn().mockResolvedValue("OK") },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/security/piiCrypto", () => ({
      decryptProfilePII: vi.fn((u: Record<string, unknown>) => u),
      encryptSensitiveField: vi.fn((v: unknown) => v),
    }));

    const userRow: Record<string, any> = {
      email: "alice@paayh.com",
      username: "alice",
      monetized: false,
      monetization_clicks: 10,
      has_cancelled_monetization: false,
      ad_account_status: "active",
      balance: 500,
    };

    const userChain: any = {
      select: vi.fn(() => userChain),
      ilike: vi.fn(() => userChain),
      order: vi.fn(() => userChain),
      limit: vi.fn().mockResolvedValue({ data: [userRow], error: null }),
    };

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => {
          if (table === "users") return userChain;
          return {
            select: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
        rpc: vi.fn().mockResolvedValue({ data: { is_dormant: false }, error: null }),
      },
    }));

    const { GET } = await import("../../app/api/profile/route");
    const res = await GET(new NextRequest("https://paayh.com/api/profile"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(getSpy).toHaveBeenCalledWith("user:live_clicks:v2:alice@paayh.com");
    expect(json.monetized).toBe("true");
    expect(json.monetization_clicks).toBe(420);

    // Verify has_cancelled_monetization keeps monetized=false even with 420 live clicks
    userRow.has_cancelled_monetization = true;
    const cancelledRes = await GET(new NextRequest("https://paayh.com/api/profile"));
    const cancelledJson = await cancelledRes.json();
    expect(cancelledRes.status).toBe(200);
    expect(cancelledJson.monetized).toBe(false);

    // Verify deactivated ad_account_status fails closed with 403
    userRow.ad_account_status = "deactivated";
    const deactRes = await GET(new NextRequest("https://paayh.com/api/profile"));
    expect(deactRes.status).toBe(403);
  });

  it("POST /api/profile/deactivate strips raw email PII from admin notifications and reconciliation logs", async () => {
    const adminNotifPayloads: any[] = [];
    const reconciliationLogs: any[] = [];
    const delSpy = vi.fn().mockResolvedValue(1);

    vi.doMock("@/lib/edgeRateLimit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("victim@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
      invalidateAllHighlights: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/agent/agentCache", () => ({
      purgeDeletedUserFromAgentCaches: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/security/auth0Management", () => ({
      deleteAuth0IdentitiesByEmail: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {
        del: delSpy,
        incr: vi.fn().mockResolvedValue(2),
        set: vi.fn().mockResolvedValue("OK"),
      },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        rpc: vi.fn().mockResolvedValue({
          data: {
            success: true,
            ledger_pseudonym: "user_a1b2c3d4",
            referrer_email: null,
            referee_emails: [],
            mutual_holder_emails: [],
          },
          error: null,
        }),
        from: vi.fn((table: string) => {
          if (table === "users") {
            return {
              select: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  username: "victim_handle",
                  balance: 1500,
                  is_agent: false,
                  referred_by: null,
                  last_active_at: new Date().toISOString(),
                },
                error: null,
              }),
            };
          }
          if (table === "notifications") {
            return {
              insert: vi.fn((payload: any) => {
                adminNotifPayloads.push(payload);
                return Promise.resolve({ error: null });
              }),
            };
          }
          if (table === "system_reconciliation_logs") {
            return {
              insert: vi.fn((payload: any) => {
                reconciliationLogs.push(payload);
                return Promise.resolve({ error: null });
              }),
            };
          }
          return {
            delete: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
          };
        }),
      },
    }));

    const { POST } = await import("../../app/api/profile/deactivate/route");
    const req = new NextRequest("https://paayh.com/api/profile/deactivate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmText: "DEACTIVATE", forfeitConfirmed: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Clear-Site-Data")).toContain("cookies");
    expect(JSON.stringify(adminNotifPayloads)).not.toContain("victim@paayh.com");
    expect(JSON.stringify(reconciliationLogs)).not.toContain("victim@paayh.com");
    expect(delSpy).toHaveBeenCalled();
  });

  it("GET /auth/logout and middleware bypass post_logout_redirect_uri=%2F, resolve absolute returnTo, and clear all session cookies", async () => {
    const prevBaseUrl = process.env.APP_BASE_URL;
    const prevAuth0BaseUrl = process.env.AUTH0_BASE_URL;
    const prevClientId = process.env.AUTH0_CLIENT_ID;
    const prevDomain = process.env.AUTH0_DOMAIN;

    try {
      process.env.APP_BASE_URL = "/";
      process.env.AUTH0_BASE_URL = "not-a-url";
      process.env.AUTH0_CLIENT_ID = "real-client-id";
      process.env.AUTH0_DOMAIN = "auth.paayh.com";

      const auth0MiddlewareSpy = vi.fn().mockRejectedValue(new Error("should not call auth0.middleware"));
      vi.doMock("@/lib/auth0", () => ({
        auth0: { middleware: auth0MiddlewareSpy },
      }));
      vi.doMock("../../lib/auth0", () => ({
        auth0: { middleware: auth0MiddlewareSpy },
      }));

      const { middleware } = await import("../../middleware");
      const mwReq = new NextRequest("https://paayh.com/auth/logout?returnTo=/", {
        headers: { cookie: "appSession=abc; __Host-appSession=xyz; xea_session=123" },
      });
      const mwRes = await middleware(mwReq);
      expect(auth0MiddlewareSpy).not.toHaveBeenCalled();
      expect(mwRes.headers.get("x-middleware-next")).toBe("1");
      expect(mwRes.cookies.get("appSession")?.value).toBe("");
      expect(mwRes.cookies.get("__Host-appSession")?.value).toBe("");
      expect(mwRes.cookies.get("xea_session")?.value).toBe("");
      expect(mwRes.cookies.get("paayh_statement_cache")?.value).toBe("");

      const { GET } = await import("../../app/auth/logout/route");
      const resRoot = await GET(
        new NextRequest("https://paayh.com/auth/logout?returnTo=/", {
          headers: { cookie: "appSession=abc; __session=def" },
        })
      );
      expect(resRoot.status).toBe(307);
      const locationRoot = resRoot.headers.get("location") || "";
      expect(locationRoot).toContain("https://auth.paayh.com/v2/logout?");
      expect(locationRoot).not.toContain("returnTo=%2F");
      const parsedRoot = new URL(locationRoot);
      expect(parsedRoot.searchParams.get("returnTo")).toBe("https://paayh.com");

      // Open redirect attempt must fall back to safe absolute baseUrl
      const resEvil = await GET(
        new NextRequest("https://paayh.com/auth/logout?returnTo=https://evil.com/phish")
      );
      const parsedEvil = new URL(resEvil.headers.get("location") || "");
      expect(parsedEvil.searchParams.get("returnTo")).toBe("https://paayh.com");

      for (const name of [
        "appSession",
        "appSession.0",
        "__session",
        "__session__0",
        "__Host-appSession",
        "xea_session",
        "paayh_statement_cache",
        "auth0.is.authenticated",
      ]) {
        expect(resRoot.cookies.get(name)?.value).toBe("");
      }
    } finally {
      if (prevBaseUrl === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = prevBaseUrl;
      if (prevAuth0BaseUrl === undefined) delete process.env.AUTH0_BASE_URL;
      else process.env.AUTH0_BASE_URL = prevAuth0BaseUrl;
      if (prevClientId === undefined) delete process.env.AUTH0_CLIENT_ID;
      else process.env.AUTH0_CLIENT_ID = prevClientId;
      if (prevDomain === undefined) delete process.env.AUTH0_DOMAIN;
      else process.env.AUTH0_DOMAIN = prevDomain;
    }
  });
});

describe("Payments, Verify & Wallet-Pay Security", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("POST /api/payments/wallet-pay validates publish_ad BEFORE deducting wallet and blocks editingId IDOR", async () => {
    const spendSpy = vi.fn().mockResolvedValue({ success: true, newBalance: 5000 });
    const refundSpy = vi.fn().mockResolvedValue({ success: true });

    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("buyer@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: { incr: vi.fn().mockResolvedValue(2), set: vi.fn().mockResolvedValue("OK"), del: vi.fn() },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/security/walletPinHelper", () => ({
      resolveStoredWalletPinHash: vi.fn().mockReturnValue("pin:v1:valid"),
      verifyTransactionPin: vi.fn().mockResolvedValue({ valid: true }),
    }));
    vi.doMock("@/lib/services/payoutSettlementService", () => ({
      spendWalletBalanceAtomic: spendSpy,
      refundWalletDeductionAtomic: refundSpy,
    }));

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => {
          if (table === "users") {
            return {
              select: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  email: "buyer@paayh.com",
                  username: "buyer",
                  balance: 10000,
                  wallet_pin_hash: "pin:v1:valid",
                  is_banned: false,
                  ad_account_status: "active",
                },
                error: null,
              }),
            };
          }
          if (table === "adds") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          if (table === "news") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "ad-foreign", user_email: "other-owner@paayh.com" },
                error: null,
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      },
    }));

    const { POST } = await import("../../app/api/payments/wallet-pay/route");

    // Case 1: missing publish_ad must fail 404 BEFORE any wallet debit
    const missingAdRes = await POST(
      new NextRequest("https://paayh.com/api/payments/wallet-pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "publish_ad",
          amount: 1000,
          pin: "1234",
          metadata: { adId: "non-existent" },
        }),
      })
    );
    expect(missingAdRes.status).toBe(404);
    expect(spendSpy).not.toHaveBeenCalled();

    // Case 2: foreign editingId on highlight must fail 403 IDOR BEFORE wallet debit
    const idorRes = await POST(
      new NextRequest("https://paayh.com/api/payments/wallet-pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "highlight",
          pin: "1234",
          amount: 1000,
          metadata: {
            title: "Foreign Highlight",
            content: "Attempted takeover",
            campaign_days: 1,
            editingId: "ad-foreign",
          },
        }),
      })
    );
    expect(idorRes.status).toBe(403);
    expect(spendSpy).not.toHaveBeenCalled();
  });

  it("GET /api/payments/verify rejects gateway amount_mismatch and processSuccessfulPayment enforces single-claim idempotency", async () => {
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("payer@paayh.com"),
    }));
    vi.doMock("@/lib/payment/kora", () => ({
      KoraService: { verifyCharge: vi.fn() },
    }));
    vi.doMock("@/lib/logger", () => ({
      captureApiException: vi.fn(),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
    }));
    const settleSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/services/payoutSettlementService", () => ({
      settleWithdrawalByReference: settleSpy,
    }));
    vi.doMock("@/lib/payment/payoutProvider", () => ({
      PayoutProvider: {
        verifyPayment: vi.fn().mockResolvedValue({
          success: true,
          status: "success",
          amount: 100, // underpaid vs expected 5000
          reference: "ref-123",
        }),
      },
    }));
    vi.doMock("@/lib/payment/processPayment", () => ({
      processSuccessfulPayment: vi.fn(),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: { incr: vi.fn().mockResolvedValue(2) },
      isRedisReady: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "pay-1",
              reference: "ref-123",
              user_email: "payer@paayh.com",
              type: "wallet_fund",
              amount: 5000,
              status: "pending",
              metadata: {},
            },
            error: null,
          }),
        })),
      },
    }));

    const { GET } = await import("../../app/api/payments/verify/route");
    const res = await GET(new NextRequest("https://paayh.com/api/payments/verify?reference=ref-123"));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.status).toBe("amount_mismatch");

    // Test real processSuccessfulPayment single-claim idempotency
    vi.resetModules();
    vi.doUnmock("@/lib/payment/processPayment");
    vi.doMock("@/lib/redis", () => ({
      default: { incr: vi.fn().mockResolvedValue(2), del: vi.fn().mockResolvedValue(1) },
      isRedisReady: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
    }));
    const paymentsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            id: "pay-2",
            reference: "ref-claim",
            user_email: "payer@paayh.com",
            type: "wallet_fund",
            amount: 2000,
            status: "pending",
            metadata: {},
          },
          error: null,
        })
        // Atomic claim update returns null because another worker claimed it concurrently
        .mockResolvedValueOnce({ data: null, error: null }),
    };

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn(() => paymentsChain),
      },
    }));

    const { processSuccessfulPayment } = await import("../payment/processPayment");
    const claimRes = await processSuccessfulPayment("ref-claim", {}, 2000);
    expect(claimRes.alreadyProcessed).toBe(true);
  });
});
