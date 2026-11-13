import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

describe("Withdrawals, Fee Tiers & Keyset History", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("PayoutProvider.calculateTransferFee applies Paystack and Kora 3-tier fee schedules consistently", async () => {
    vi.doUnmock("@/lib/payment/payoutProvider");
    vi.doMock("../payment/kora", () => ({
      KoraService: {},
    }));
    vi.doMock("../payment/paystack", () => ({
      PaystackService: {},
    }));
    vi.doMock("@/lib/payment/kora", () => ({
      KoraService: {},
    }));
    vi.doMock("@/lib/payment/paystack", () => ({
      PaystackService: {},
    }));

    const { PayoutProvider } = await import("../payment/payoutProvider");
    expect(PayoutProvider.calculateTransferFee(5000, "paystack")).toBe(10.75);
    expect(PayoutProvider.calculateTransferFee(25000, "paystack")).toBe(26.88);
    expect(PayoutProvider.calculateTransferFee(100000, "paystack")).toBe(53.75);

    expect(PayoutProvider.calculateTransferFee(5000, "kora")).toBe(15);
    expect(PayoutProvider.calculateTransferFee(25000, "kora")).toBe(25);
    expect(PayoutProvider.calculateTransferFee(100000, "kora")).toBe(35);
  });

  it("POST /api/withdrawals/initiate enforces PIN + phone, uses deduct_wallet_atomic, and refunds via refund_wallet_atomic on failure", async () => {
    const rpcSpy = vi
      .fn()
      .mockResolvedValueOnce({ data: { success: true, new_balance: 5000 }, error: null })
      .mockResolvedValueOnce({ data: { success: true, new_balance: 20000 }, error: null });

    const authEmailMock = vi
      .fn()
      .mockResolvedValueOnce("bob@paayh.com")
      .mockResolvedValueOnce("bob2@paayh.com");
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: authEmailMock,
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/adminHelper", () => ({
      isExemptFromBarriersAndInactivity: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        incr: vi.fn().mockResolvedValue(2),
      },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/logger", () => ({
      captureApiException: vi.fn(),
    }));
    const settleSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/services/payoutSettlementService", () => ({
      settleWithdrawalByReference: settleSpy,
    }));
    vi.doMock("@/lib/affiliateEngine", () => ({
      recordAffiliateEarnings: vi.fn().mockResolvedValue(undefined),
      flushPendingAffiliateYield: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/validationSchemas", () => ({
      initiateWithdrawalApiSchema: {
        safeParse: vi.fn((body: any) => ({ success: true, data: body })),
      },
    }));
    vi.doMock("@/lib/security/piiCrypto", () => ({
      decryptSensitiveField: vi.fn((v: string) => v),
    }));
    vi.doMock("@/lib/security/walletPinHelper", () => ({
      resolveStoredWalletPinHash: vi.fn().mockReturnValue("pin:v1:ok"),
      verifyTransactionPin: vi.fn().mockResolvedValue({ valid: true }),
    }));
    vi.doMock("@/lib/payment/payoutProvider", () => ({
      PayoutProvider: {
        getActiveGateway: vi.fn().mockReturnValue("paystack"),
        calculateTransferFee: vi.fn().mockReturnValue(26.88),
        resolveAccount: vi.fn().mockResolvedValue({
          account_number: "0123456789",
          account_name: "Bob User",
        }),
        initiatePayout: vi.fn().mockRejectedValue(new Error("Invalid account number")),
      },
    }));
    vi.doMock("@/lib/payment/kora", () => ({
      KoraService: { verifyAccount: vi.fn() },
    }));

    const genericChain: any = {
      select: vi.fn(() => genericChain),
      insert: vi.fn().mockResolvedValue({ data: { id: "wd-1" }, error: null }),
      update: vi.fn(() => genericChain),
      delete: vi.fn(() => genericChain),
      eq: vi.fn(() => genericChain),
      ilike: vi.fn(() => genericChain),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    const usersWdChain: any = {
      select: vi.fn(() => usersWdChain),
      update: vi.fn(() => usersWdChain),
      ilike: vi.fn(() => usersWdChain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          balance: 20000,
          withdrawal: 0,
          monetized: true,
          ad_account_status: "active",
          is_banned: false,
          wallet_pin_hash: "pin:v1:ok",
          phone: "+2348012345678",
        },
        error: null,
      }),
    };

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        rpc: rpcSpy,
        from: vi.fn((table: string) => (table === "users" ? usersWdChain : genericChain)),
      },
    }));

    const { POST } = await import("../../app/api/withdrawals/initiate/route");
    const req = new NextRequest("https://paayh.com/api/withdrawals/initiate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount: 15000,
        bankCode: "058",
        accountNumber: "0123456789",
        accountName: "Bob User",
        phone: "+2348012345678",
        pin: "1234",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(rpcSpy).toHaveBeenNthCalledWith(
      1,
      "deduct_wallet_atomic",
      expect.objectContaining({ p_user_email: "bob@paayh.com", p_amount: 15000 })
    );
    expect(settleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^trsf_/),
      "failed",
      "Invalid account number",
      expect.any(Object)
    );

    // Also verify ledger insert failure invokes refund_wallet_atomic directly via rollbackAtomicDebit
    genericChain.insert.mockResolvedValueOnce({ error: { message: "ledger write failed" } });
    const rollbackRes = await POST(
      new NextRequest("https://paayh.com/api/withdrawals/initiate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: 15000,
          bankCode: "058",
          accountNumber: "0123456789",
          accountName: "Bob User",
          phone: "+2348012345678",
          pin: "1234",
        }),
      })
    );
    expect(rollbackRes.status).toBe(500);
    expect(rpcSpy).toHaveBeenCalledWith(
      "refund_wallet_atomic",
      expect.objectContaining({ p_user_email: "bob2@paayh.com", p_amount: 15000 })
    );
  });

  it("POST /api/business/subscribe/pay enforces mandatory Wallet PIN before wallet deduction", async () => {
    const spendSpy = vi.fn().mockResolvedValue({ success: true, newBalance: 10000 });
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("brand@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: { set: vi.fn().mockResolvedValue("OK"), del: vi.fn().mockResolvedValue(1) },
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/payment/payoutProvider", () => ({
      PayoutProvider: {},
    }));
    vi.doMock("@/lib/services/payoutSettlementService", () => ({
      spendWalletBalanceAtomic: spendSpy,
      refundWalletDeductionAtomic: vi.fn().mockResolvedValue({ success: true }),
    }));
    vi.doMock("@/lib/security/walletPinHelper", async () => await import("../security/walletPinHelper"));

    const subChain: any = {
      select: vi.fn(() => subChain),
      eq: vi.fn(() => subChain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "sub-1",
          user_email: "brand@paayh.com",
          status: "approved",
          payment_status: "unpaid",
          amount: 150000,
          currency: "NGN",
          business_name: "Acme",
          domain: "acme.com",
        },
        error: null,
      }),
    };
    const payerChain: any = {
      select: vi.fn(() => payerChain),
      ilike: vi.fn(() => payerChain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          wallet_pin_hash: null,
          passphrase: null,
          is_banned: false,
          ad_account_status: "active",
        },
        error: null,
      }),
    };

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => (table === "premium_subscribers" ? subChain : payerChain)),
      },
    }));

    const { POST } = await import("../../app/api/business/subscribe/pay/route");
    const res = await POST(
      new NextRequest("https://paayh.com/api/business/subscribe/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscriber_id: "sub-1", payment_method: "wallet" }),
      })
    );
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.code).toBe("PIN_NOT_SET");
    expect(spendSpy).not.toHaveBeenCalled();
  });

  it("GET /api/payments/history supports keyset cursor pagination and fee normalization", async () => {
    const getSpy = vi.fn().mockImplementation((key: string) => {
      if (key.startsWith("statement:ver:")) return Promise.resolve("3");
      return Promise.resolve(null);
    });
    const setSpy = vi.fn().mockResolvedValue("OK");

    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("hist@paayh.com"),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: { get: getSpy, set: setSpy },
    }));
    vi.doMock("@/lib/payment/payoutProvider", () => ({
      PayoutProvider: {
        getActiveGateway: vi.fn().mockReturnValue("paystack"),
        calculateTransferFee: vi.fn().mockReturnValue(26.88),
      },
    }));
    vi.doMock("@/lib/payment/historyHelpers", async () => await import("../payment/historyHelpers"));

    const rows = [
      {
        id: "w-3",
        type: "withdrawal",
        amount: 15000,
        status: "paid",
        reference: "wd-3",
        created_at: "2026-11-10T12:00:00.000Z",
        metadata: { provider: "paystack" },
      },
      {
        id: "w-2",
        type: "withdrawal",
        amount: 10000,
        status: "paid",
        reference: "wd-2",
        created_at: "2026-11-09T12:00:00.000Z",
        metadata: { provider: "paystack" },
      },
    ];

    const chain: any = {
      select: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      not: vi.fn(() => chain),
      or: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      supabaseReadOnly: {
        from: vi.fn(() => chain),
      },
    }));

    const { GET } = await import("../../app/api/payments/history/route");
    const res = await GET(
      new NextRequest("https://paayh.com/api/payments/history?type=withdrawals&limit=1&paginated=true")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.hasMore).toBe(true);
    expect(typeof json.nextCursor).toBe("string");
    expect(json.items).toHaveLength(1);
    expect(json.items[0].fee).toBe(26.88);
    expect(json.items[0].net_amount).toBe(14973.12);
    expect(setSpy).toHaveBeenCalledWith(
      expect.stringContaining(":v3:"),
      expect.any(String),
      "EX",
      60
    );
  });
});

describe("Profile Update, SSRF/XSS & Agent/HelpCenter Hardening", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("validateProfileImageUrl blocks XSS/SSRF URLs and allows strict HTTPS avatar hosts", async () => {
    const { validateProfileImageUrl } = await import("../security/profileUrlValidator");

    expect(validateProfileImageUrl("https://lh3.googleusercontent.com/a/avatar123").valid).toBe(true);
    expect(validateProfileImageUrl("/cdn/storage/avatars/pic.png").valid).toBe(true);
    expect(validateProfileImageUrl("").valid).toBe(true);

    expect(validateProfileImageUrl("javascript:alert(1)").valid).toBe(false);
    expect(validateProfileImageUrl("http://lh3.googleusercontent.com/a/123").valid).toBe(false);
    expect(validateProfileImageUrl("https://169.254.169.254/latest/meta-data/").valid).toBe(false);
    expect(validateProfileImageUrl("https://localhost:3000/secret.png").valid).toBe(false);
    expect(validateProfileImageUrl("https://evil.attacker.com/xss.svg").valid).toBe(false);
  });

  it("POST /api/update queries phone_hash blind index and fails 500 if firstName PII update fails", async () => {
    const inCalls: Array<[string, unknown]> = [];
    const eqCalls: Array<[string, unknown]> = [];

    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("up@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/utils/profileCooldown", () => ({
      getProfileEditCooldownState: vi.fn().mockResolvedValue({ allowed: true }),
    }));
    vi.doMock("@/lib/security/profileUrlValidator", () => ({
      validateProfileImageUrl: vi.fn().mockReturnValue({ valid: true, sanitized: undefined }),
    }));
    vi.doMock("@/lib/security/piiCrypto", () => ({
      encryptSensitiveField: vi.fn((v: string) => `enc:${v}`),
      hashPassphraseOneWay: vi.fn((v: string) => `hash:${v}`),
      blindHashPII: vi.fn((v: string) => `blind:${v}`),
      coarsenDobToBirthYear: vi.fn((v: string) => v),
    }));

    const usersChain: any = {
      select: vi.fn(() => usersChain),
      ilike: vi.fn(() => usersChain),
      in: vi.fn((col: string, vals: unknown) => {
        inCalls.push([col, vals]);
        return usersChain;
      }),
      eq: vi.fn((col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return usersChain;
      }),
      not: vi.fn(() => usersChain),
      limit: vi.fn(() => usersChain),
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({ data: { username: "upuser", has_updated_profile: false }, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null }),
      update: vi.fn(() => ({
        ilike: vi.fn().mockResolvedValue({ error: { message: "PII update failed" } }),
      })),
    };

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        rpc: vi.fn().mockResolvedValue({ error: { message: "rpc unavailable" } }),
        from: vi.fn(() => usersChain),
      },
    }));

    const { POST } = await import("../../app/api/update/route");
    const res = await POST(
      new NextRequest("https://paayh.com/api/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: "Jane",
          phone: "+2348011112222",
        }),
      })
    );

    expect(res.status).toBe(500);
    expect(inCalls.some(([col]) => col === "phone_hash")).toBe(true);
  });

  it("agentCore blocks PostgREST .or() injection & guards Redis write on DB failure; agentNetwork preserves agent_registered_at", async () => {
    const dbFromSpy = vi.fn();
    const redisSetSpy = vi.fn().mockResolvedValue("OK");

    vi.doMock("@/lib/redis", () => ({
      default: {
        get: vi.fn().mockResolvedValue(null),
        set: redisSetSpy,
        del: vi.fn().mockResolvedValue(1),
      },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: dbFromSpy.mockImplementation((table: string) => {
          if (table === "users") {
            return {
              select: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              update: vi.fn(() => ({
                ilike: vi.fn().mockResolvedValue({ error: { message: "DB unavailable" } }),
              })),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      },
    }));

    const { resolveReferrerEmailByCode, registerUserAsAgent } = await import("../agent/agentCore");

    const injected = await resolveReferrerEmailByCode("PAAYH-ALICE,EMAIL.ILIKE.%ADMIN%");
    expect(injected).toBeNull();
    expect(dbFromSpy).not.toHaveBeenCalled();

    const reg = await registerUserAsAgent("alice@paayh.com");
    expect(reg.success).toBe(false);
    expect(redisSetSpy).not.toHaveBeenCalledWith(
      "agent:status:alice@paayh.com",
      expect.any(String),
      expect.anything(),
      expect.anything()
    );
  });

  it("agentCommission enforces direct-only 1%/2% rates and never loads 2nd-level upline", async () => {
    vi.doMock("@/lib/redis", () => ({
      default: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
      },
      isRedisReady: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
      publishLiveBalanceUpdate: vi.fn(),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => {
          if (table === "referrals") {
            return {
              select: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { referrer_email: "agent@paayh.com", status: "qualified", opt_out_status: "none" },
                error: null,
              }),
            };
          }
          if (table === "users") {
            return {
              select: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { is_agent: true, monetized: true, monetization_clicks: 350 },
                error: null,
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      },
    }));

    const { resolveLightweightUplineForEarner } = await import("../agent/agentCommission");
    const meta = await resolveLightweightUplineForEarner("earner@paayh.com");
    expect(meta.hasUpline).toBe(true);
    expect(meta.uplineEmail).toBe("agent@paayh.com");
    expect(meta.rate).toBe(0.02);
    expect(meta.uplineOfUplineEmail).toBeNull();
  });

  it("handleAgentOptOut force uses case-insensitive .ilike and chunked updates; bindUserToAgentByCode does not overwrite registeredAt", async () => {
    const ilikeSpy = vi.fn();
    const referralsChain: any = {
      select: vi.fn(() => referralsChain),
      ilike: vi.fn((...args: any[]) => {
        ilikeSpy("referrals", ...args);
        return referralsChain;
      }),
      neq: vi.fn(() => referralsChain),
      in: vi.fn(() => Promise.resolve({ error: null })),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn(() => referralsChain),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const usersChain: any = {
      select: vi.fn(() => usersChain),
      ilike: vi.fn((...args: any[]) => {
        ilikeSpy("users", ...args);
        return usersChain;
      }),
      in: vi.fn(() => Promise.resolve({ error: null })),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn(() => usersChain),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    vi.doMock("@/lib/redis", () => ({
      default: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        smembers: vi.fn().mockResolvedValue([]),
      },
      isRedisReady: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => (table === "referrals" ? referralsChain : usersChain)),
      },
    }));

    const { handleAgentOptOut } = await import("../agent/agentOptOut");
    const optRes = await handleAgentOptOut({ actorEmail: "MixedCase@Paayh.Com", action: "force" });
    expect(optRes.success).toBe(true);
    expect(ilikeSpy).toHaveBeenCalledWith("users", "referred_by", "mixedcase@paayh.com");
  });

  it("GET /api/referrals scrubs referee_email and POST /api/helpcenter requires authentication", async () => {
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("agent@paayh.com"),
    }));
    vi.doMock("@/lib/referralEngine", () => ({
      calculateAtwTier: vi.fn().mockReturnValue({ level: 1, cap: 30000 }),
    }));

    const usersChain: any = {
      select: vi.fn(() => usersChain),
      ilike: vi.fn(() => usersChain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          referral_code: "PA123456",
          referral_downloads_count: 1,
          monetization_clicks: 50,
          atw_tier: 1,
        },
        error: null,
      }),
    };

    const refChain: any = {
      select: vi.fn(() => refChain),
      ilike: vi.fn(() => refChain),
      eq: vi.fn(() => refChain),
      order: vi.fn(() => refChain),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: "ref-1",
            referee_email: "secret-follower@example.com",
            status: "qualified",
            interactions_count: 5,
            created_at: "2026-11-01T00:00:00Z",
            qualified_at: "2026-11-02T00:00:00Z",
            opt_out_status: "none",
            opt_out_requested_at: null,
            commission_rate: 0.01,
          },
        ],
        error: null,
      }),
    };

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: { from: vi.fn((t: string) => (t === "users" ? usersChain : refChain)) },
      supabaseReadOnly: { from: vi.fn((t: string) => (t === "users" ? usersChain : refChain)) },
    }));

    const { GET: getReferrals } = await import("../../app/api/referrals/route");
    const refRes = await getReferrals(new NextRequest("https://paayh.com/api/referrals"));
    const refJson = await refRes.json();
    expect(refRes.status).toBe(200);
    expect(JSON.stringify(refJson)).not.toContain("secret-follower@example.com");
    expect(refJson.referrals[0].referee_email).toBeUndefined();

    vi.resetModules();
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue(null),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/validationSchemas", () => ({
      helpSchema: {
        safeParse: vi.fn((b: any) => ({ success: true, data: b })),
      },
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: { from: vi.fn() },
    }));

    const { POST: postHelp } = await import("../../app/api/helpcenter/route");
    const helpRes = await postHelp(
      new NextRequest("https://paayh.com/api/helpcenter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "spoofed@paayh.com",
          category: "Billing",
          subject: "Unauthorized test",
          message: "Trying to trigger a 48h ticket cooldown on someone else's account.",
        }),
      })
    );
    expect(helpRes.status).toBe(401);
  });

  it("getAgentNetworkData syncs invitesCount with visible list, handles mixed-case user emails, and unifies Edge/Web opt-out statuses", async () => {
    vi.doMock("@/lib/redis", () => ({
      default: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        mget: vi.fn().mockResolvedValue([]),
        smembers: vi.fn().mockResolvedValue([]),
        srem: vi.fn().mockResolvedValue(0),
      },
      isRedisReady: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/security/piiCrypto", () => ({
      decryptProfilePII: (row: any) => row,
    }));

    const usersInSpy = vi.fn();
    const usersOrSpy = vi.fn();

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => {
          if (table === "referrals") {
            let mode = "list";
            const refChain: any = {
              select: vi.fn((_cols?: string, opts?: { count?: string }) => {
                mode = opts?.count === "exact" ? "list" : "single";
                return refChain;
              }),
              ilike: vi.fn(() => refChain),
              neq: vi.fn(() => refChain),
              order: vi.fn(() => refChain),
              limit: vi.fn().mockResolvedValue({
                count: 2,
                error: null,
                data: [
                  // Active user whose users.email in DB has mixed casing
                  {
                    referrer_email: "host@paayh.com",
                    referee_email: "mixeduser@example.com",
                    status: "qualified",
                    opt_out_status: "none",
                    is_opted_out: false,
                    commission_rate: 0.01,
                    total_commission_earned: 12.5,
                    created_at: "2026-11-10T00:00:00Z",
                  },
                  // Deleted account that must not appear in list OR inflate invitesCount
                  {
                    referrer_email: "host@paayh.com",
                    referee_email: "deleted@example.com",
                    status: "qualified",
                    opt_out_status: "none",
                    is_opted_out: false,
                    commission_rate: 0.01,
                    total_commission_earned: 0,
                    created_at: "2026-11-09T00:00:00Z",
                  },
                ],
              }),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
            return refChain;
          }

          if (table === "deactivated_users") {
            const deactChain: any = {
              select: vi.fn(() => deactChain),
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
            return deactChain;
          }

          // users table
          const usersChain: any = {
            select: vi.fn(() => usersChain),
            ilike: vi.fn(() => usersChain),
            in: vi.fn((_col: string, vals: string[]) => {
              usersInSpy(vals);
              // Simulate exact-case Postgres miss because stored email is mixed-case
              return Promise.resolve({ data: [], error: null });
            }),
            or: vi.fn((filter: string) => {
              usersOrSpy(filter);
              return Promise.resolve({
                data: [
                  {
                    email: "MixedUser@example.com",
                    username: "mixeduser",
                    firstName: "Mixed",
                    lastName: "User",
                    monetized: false,
                    monetization_clicks: 0,
                    is_agent: false,
                  },
                ],
                error: null,
              });
            }),
            update: vi.fn(() => usersChain),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { referral_code: "PAHOST01", is_agent: false, mutual_count: 0, mutuals: [] },
              error: null,
            }),
          };
          return usersChain;
        }),
      },
    }));

    const { resolveOptOutFromDbRow } = await import("../agent/agentCore");
    expect(resolveOptOutFromDbRow({ is_opted_out: true, status: "qualified" })).toBe("accepted");
    expect(resolveOptOutFromDbRow({ status: "opt_out_requested", opt_out_requested_by: "agent" })).toBe(
      "agent_requested"
    );
    expect(resolveOptOutFromDbRow({ status: "req_unfollow" })).toBe("requested");

    const { getAgentNetworkData } = await import("../agent/agentNetwork");
    const network = await getAgentNetworkData("host@paayh.com", true);

    expect(usersInSpy).toHaveBeenCalled();
    expect(usersOrSpy).toHaveBeenCalled();
    expect(network.invites).toHaveLength(1);
    expect(network.invitesCount).toBe(1);
    expect(network.invites[0].username).toBe("mixeduser");
    expect(network.invites[0].earnedFromUser).toBe(12.5);
  });
});
