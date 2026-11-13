import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import { NextRequest } from "next/server";

describe("KoraPay, Paystack Mobile Callback Bridge & Boost Payment Verification", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("bridges custom mobile schemes via /api/payments/mobile-callback and preserves params", async () => {
    vi.doUnmock("@/lib/payment/paymentLookup");
    vi.doUnmock("@/lib/security/redirectHelper");
    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: {} }));

    const { bridgeMobilePaymentCallbackUrl, resolvePublicPaymentOrigin } = await import(
      "../payment/paymentLookup"
    );
    const { sanitizeRedirectUrl } = await import("../security/redirectHelper");

    // Localhost HTTP should fall back to https://paayh.com for gateway webhooks/callbacks
    expect(resolvePublicPaymentOrigin("http://localhost:3000")).toBe("https://paayh.com");
    expect(resolvePublicPaymentOrigin("https://paayh.com/")).toBe("https://paayh.com");

    // Web HTTPS callbacks stay untouched
    expect(bridgeMobilePaymentCallbackUrl("https://paayh.com/logged-in?view=myads")).toBe(
      "https://paayh.com/logged-in?view=myads"
    );

    // Mobile custom schemes are bridged cleanly while lifting query params
    const bridged = bridgeMobilePaymentCallbackUrl(
      "xea-auth://payment-callback?boost_ref=BOOST-123&type=boost_highlight&tab=highlights",
      "https://paayh.com"
    );
    const parsed = new URL(bridged);
    expect(parsed.origin + parsed.pathname).toBe("https://paayh.com/api/payments/mobile-callback");
    expect(parsed.searchParams.get("redirect")).toBe("xea-auth://payment-callback");
    expect(parsed.searchParams.get("boost_ref")).toBe("BOOST-123");
    expect(parsed.searchParams.get("type")).toBe("boost_highlight");
    expect(parsed.searchParams.get("tab")).toBe("highlights");

    // Redirect sanitizer keeps xea-auth:// safe while rejecting external phishing domains
    expect(sanitizeRedirectUrl("xea-auth://payment-callback")).toBe("xea-auth://payment-callback");
    expect(sanitizeRedirectUrl("https://evil.example.com/phish")).toBe("xea-auth://payment-callback");
  });

  it("GET /api/payments/mobile-callback forwards gateway reference & trxref back into xea-auth://", async () => {
    vi.doMock("@/lib/security/redirectHelper", async () => {
      const actual = await vi.importActual<any>("../security/redirectHelper");
      return actual;
    });

    const { GET } = await import("../../app/api/payments/mobile-callback/route");
    const req = new NextRequest(
      "https://paayh.com/api/payments/mobile-callback?redirect=xea-auth%3A%2F%2Fpayment-callback&boost_ref=BOOST-99&type=boost_highlight&trxref=ref_abc&reference=ref_abc"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain(
      "xea-auth://payment-callback?boost_ref=BOOST-99&amp;type=boost_highlight&amp;trxref=ref_abc&amp;reference=ref_abc"
    );
    expect(html).toContain("Open Paayh App");
  });

  it("KoraService.initializeCharge bridges custom scheme upfront, sanitizes metadata <= 50 chars, and enforces HTTPS notification_url", async () => {
    process.env.KORA_SECRET_KEY = "sk_live_test_123456";
    process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";

    vi.doMock("@/lib/redis", () => ({ default: {} }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: {} }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: {
          checkout_url: "https://checkout.korapay.com/pay/abc123",
          reference: "kora_pay_created_1",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { KoraService } = await import("../payment/kora");
    const longId = "a".repeat(80);
    const res = await KoraService.initializeCharge(
      "User@Example.com",
      1500.5,
      "xea-auth://payment-callback?boost_ref=BOOST-1",
      {
        type: "boost_highlight",
        user_email: "User@Example.com",
        ad_id: longId,
        boost_reference: "BOOST-1",
      },
      "Paayh Boost"
    );

    expect(res.checkout_url).toBe("https://checkout.korapay.com/pay/abc123");
    expect(res.reference).toBe("kora_pay_created_1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body.amount).toBe(1500.5);
    expect(body.currency).toBe("NGN");
    expect(body.notification_url).toBe("https://paayh.com/api/payments/kora-webhook");
    expect(body.redirect_url).toContain("https://paayh.com/api/payments/mobile-callback");
    expect(body.redirect_url).toContain("boost_ref=BOOST-1");
    expect(body.customer.email).toBe("user@example.com");
    expect(body.metadata.ad_id.length).toBe(50);
    expect(body.metadata.boost_reference).toBe("BOOST-1");
  });

  it("PaystackService.initializeTransaction bridges custom mobile schemes via mobile-callback", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_live_paystack_123456";

    vi.doMock("@/lib/redis", () => ({ default: {} }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: {} }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/xyz789",
          access_code: "acc_1",
          reference: "ref_ps_1",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { PaystackService } = await import("../payment/paystack");
    const res = await PaystackService.initializeTransaction(
      "advertiser@paayh.com",
      5000,
      "xea-auth://payment-callback?boost_ref=BOOST-77"
    );

    expect(res.authorization_url).toBe("https://checkout.paystack.com/xyz789");
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body.callback_url).toContain("https://paayh.com/api/payments/mobile-callback");
    expect(body.callback_url).toContain("boost_ref=BOOST-77");
  });

  it("POST /api/campaigns/boost preserves boost_highlight metadata & Kora gateway reference", async () => {
    const insertedRows: any[] = [];
    const updatedPayloads: any[] = [];

    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("owner@paayh.com"),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {
        set: vi.fn(),
        del: vi.fn().mockResolvedValue(1),
      },
      isRedisReady: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
      invalidateCachedUserCampaigns: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/services/payoutSettlementService", () => ({
      spendWalletBalanceAtomic: vi.fn(),
    }));
    vi.doMock("@/lib/security/walletPinHelper", () => ({
      verifyTransactionPin: vi.fn(),
      resolveStoredWalletPinHash: vi.fn(),
    }));
    vi.doMock("@/lib/payment/payoutProvider", () => ({
      PayoutProvider: {
        initializePayment: vi.fn().mockResolvedValue({
          authorization_url: "https://checkout.korapay.com/pay/hl1",
          reference: "kora_pay_hl_999",
        }),
      },
    }));

    const hlRecord = {
      id: "hl_12345678",
      user_email: "owner@paayh.com",
      campaign_days: 3,
      is_bidded: true,
      bid_price: 1000,
      is_paused: false,
      admin_statement: null,
    };

    const supabaseMock = {
      from: vi.fn((table: string) => {
        if (table === "newsactive") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: hlRecord, error: null }),
              }),
            }),
          };
        }
        if (table === "addsactive" || table === "adds" || table === "completed_ads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === "ad_reports") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "payments") {
          return {
            insert: vi.fn((row: any) => {
              insertedRows.push(row);
              return Promise.resolve({ error: null });
            }),
            update: vi.fn((payload: any) => {
              updatedPayloads.push(payload);
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        return {};
      }),
    };

    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: supabaseMock }));
    vi.doMock("@/lib/payment/paymentLookup", async () => {
      return await vi.importActual<any>("../payment/paymentLookup");
    });

    const { POST } = await import("../../app/api/campaigns/boost/route");
    const req = new NextRequest("https://paayh.com/api/campaigns/boost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-email": "owner@paayh.com",
      },
      body: JSON.stringify({
        adId: "hl_12345678",
        campaignType: "highlight",
        additionalDays: 2,
        newBidPrice: 1200,
        paymentMethod: "card",
        callbackUrl: "xea-auth://payment-callback",
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.reference).toBe("kora_pay_hl_999");
    expect(json.boostReference).toMatch(/^BOOST-/);
    expect(insertedRows[0].type).toBe("boost_highlight");
    // Ensure metadata update kept boost_highlight and did NOT overwrite with boost_campaign!
    expect(updatedPayloads[0].metadata.type).toBe("boost_highlight");
    expect(updatedPayloads[0].metadata.is_highlight).toBe(true);
    expect(updatedPayloads[0].metadata.kora_reference).toBe("kora_pay_hl_999");
  });

  it("GET /api/payments/verify resolves payments stored by kora_reference and fulfills canonical BOOST ref", async () => {
    const processSpy = vi.fn().mockResolvedValue({ alreadyProcessed: false });
    const verifyGatewaySpy = vi.fn().mockResolvedValue({
      success: true,
      status: "success",
      amount: 5000,
      reference: "kora_pay_hl_999",
      metadata: {},
    });

    const boostPaymentRow = {
      id: "pay_1",
      user_email: "owner@paayh.com",
      reference: "BOOST-canonical-1",
      amount: 5000,
      status: "pending",
      type: "boost_highlight",
      metadata: {
        type: "boost_highlight",
        ad_id: "hl_123",
        kora_reference: "kora_pay_hl_999",
        gateway_reference: "kora_pay_hl_999",
      },
    };

    const supabaseMock = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn((col: string, val: string) => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: col === "reference" && val === "BOOST-canonical-1" ? boostPaymentRow : null,
              error: null,
            }),
          })),
          contains: vi.fn((_col: string, obj: any) => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: obj?.kora_reference === "kora_pay_hl_999" ? boostPaymentRow : null,
              error: null,
            }),
          })),
        }),
      })),
    };

    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("owner@paayh.com"),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: supabaseMock }));
    vi.doMock("@/lib/payment/payoutProvider", () => ({
      PayoutProvider: { verifyPayment: verifyGatewaySpy },
    }));
    vi.doMock("@/lib/payment/kora", () => ({ KoraService: {} }));
    vi.doMock("@/lib/payment/processPayment", () => ({
      processSuccessfulPayment: processSpy,
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {
        incr: vi.fn().mockResolvedValue(1),
        del: vi.fn().mockResolvedValue(1),
      },
    }));
    vi.doMock("@/lib/logger", () => ({ captureApiException: vi.fn() }));
    vi.doMock("@/lib/services/payoutSettlementService", () => ({
      settleWithdrawalByReference: vi.fn(),
    }));
    vi.doMock("@/lib/payment/paymentLookup", async () => {
      return await vi.importActual<any>("../payment/paymentLookup");
    });

    const { GET } = await import("../../app/api/payments/verify/route");
    const req = new NextRequest("https://paayh.com/api/payments/verify?reference=kora_pay_hl_999");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(verifyGatewaySpy).toHaveBeenCalledWith("kora_pay_hl_999");
    expect(processSpy).toHaveBeenCalledWith(
      "BOOST-canonical-1",
      expect.objectContaining({ type: "boost_highlight", ad_id: "hl_123" }),
      5000
    );
  });

  it("POST /api/payments/kora-webhook validates KORAPAY_SECRET_KEY and fulfills charge.success via kora_reference lookup", async () => {
    process.env.KORAPAY_SECRET_KEY = "sk_live_korapay_webhook_secret";
    delete process.env.KORA_SECRET_KEY;

    const processSpy = vi.fn().mockResolvedValue({ alreadyProcessed: false });
    const boostPaymentRow = {
      id: "pay_2",
      user_email: "owner@paayh.com",
      reference: "BOOST-canonical-2",
      amount: 3000,
      status: "pending",
      type: "boost_campaign",
      metadata: {
        type: "boost_campaign",
        ad_id: "ad_55",
        kora_reference: "kora_pay_wh_2",
      },
    };

    const supabaseMock = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          contains: vi.fn((_col: string, obj: any) => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: obj?.kora_reference === "kora_pay_wh_2" ? boostPaymentRow : null,
              error: null,
            }),
          })),
        }),
      })),
    };

    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: supabaseMock }));
    vi.doMock("@/lib/utils/cache", () => ({
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
      },
    }));
    vi.doMock("@/lib/payment/processPayment", () => ({
      processSuccessfulPayment: processSpy,
    }));
    vi.doMock("@/lib/logger", () => ({ captureApiException: vi.fn() }));
    vi.doMock("@/lib/services/payoutSettlementService", () => ({
      settleWithdrawalByReference: vi.fn(),
    }));
    vi.doMock("@/lib/payment/paymentLookup", async () => {
      return await vi.importActual<any>("../payment/paymentLookup");
    });

    const eventPayload = {
      event: "charge.success",
      data: {
        reference: "kora_pay_wh_2",
        status: "success",
        amount: 3000,
        metadata: { user_email: "owner@paayh.com" },
      },
    };
    const sig = createHmac("sha256", "sk_live_korapay_webhook_secret")
      .update(JSON.stringify(eventPayload.data))
      .digest("hex");

    const { POST } = await import("../../app/api/payments/kora-webhook/route");
    const req = new NextRequest("https://paayh.com/api/payments/kora-webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-korapay-signature": sig,
      },
      body: JSON.stringify(eventPayload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(processSpy).toHaveBeenCalledWith(
      "BOOST-canonical-2",
      expect.objectContaining({ type: "boost_campaign", ad_id: "ad_55" }),
      3000
    );
  });
});
