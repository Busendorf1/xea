import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requireCjs = createRequire(import.meta.url);
const ts = requireCjs("typescript") as typeof import("typescript");

function loadDenoModuleInNode(relPathFromRoot: string) {
  const fullPath = path.resolve(process.cwd(), relPathFromRoot);
  const source = fs.readFileSync(fullPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  const fn = new Function("exports", "require", "module", transpiled.outputText);
  fn(mod.exports, requireCjs, mod);
  return mod.exports;
}

describe("Five User Fixes Regression Suite", () => {
  const originalEnv = { ...process.env };
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    if (originalDeno === undefined) {
      delete (globalThis as { Deno?: unknown }).Deno;
    } else {
      (globalThis as { Deno?: unknown }).Deno = originalDeno;
    }
  });

  it("Fix 1: News/Highlight step 2 headline uses 'Title' placeholder", async () => {
    vi.doMock("framer-motion", () => ({
      motion: new Proxy(
        {},
        {
          get: (_target, tag) =>
            function MockMotion({
              children,
              ...props
            }: Record<string, unknown> & { children?: React.ReactNode }) {
              const cleanProps = { ...props };
              delete cleanProps.initial;
              delete cleanProps.animate;
              delete cleanProps.exit;
              delete cleanProps.transition;
              delete cleanProps.whileTap;
              delete cleanProps.whileHover;
              return React.createElement(String(tag), cleanProps, children);
            },
        }
      ),
      AnimatePresence: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    }));

    const { NewsStepTitle } = await import("../../components/News/NewsBasicSteps");
    const html = renderToStaticMarkup(
      React.createElement(NewsStepTitle, {
        title: "",
        setTitle: vi.fn(),
        onBack: vi.fn(),
        onNext: vi.fn(),
      })
    );

    expect(html).toContain('placeholder="Title"');
    expect(html).not.toContain("Grand Opening Sale");
  });

  it(
    "Fix 2: Highlight Step 5 (NewsStepPreview) and Ad Step 5 (Step5Launch + AdPreviewCard) render the user's actual logo and profile",
    async () => {
    vi.doMock("framer-motion", () => ({
      motion: new Proxy(
        {},
        {
          get: (_target, tag) =>
            function MockMotion({
              children,
              ...props
            }: Record<string, unknown> & { children?: React.ReactNode }) {
              const cleanProps = { ...props };
              delete cleanProps.initial;
              delete cleanProps.animate;
              delete cleanProps.exit;
              delete cleanProps.transition;
              delete cleanProps.whileTap;
              delete cleanProps.whileHover;
              return React.createElement(String(tag), cleanProps, children);
            },
        }
      ),
      AnimatePresence: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    }));
    vi.doMock("@/components/ui/TermsAgreementCheckbox/TermsAgreementCheckbox", () => ({
      default: () => React.createElement("div", { "data-testid": "terms" }),
    }));
    vi.doMock("@/components/ui/PaymentConfirmationModal", () => ({
      default: () => null,
    }));
    vi.doMock("../../components/LocationSelector", () => ({
      default: () => null,
    }));
    vi.doMock("@/components/ui/CustomSelect", () => ({
      default: () => null,
    }));
    vi.doMock("@/components/ui/RollingCounter", () => ({
      default: () => null,
    }));
    vi.doMock("@/lib/categoryTargetingMap", () => ({
      ALL_INTERESTS: ["Tech"],
    }));
    vi.doMock("@/lib/utils/avatar", () => import("../utils/avatar"));
    vi.doMock("@/components/ui/Avatar", () => import("../../components/ui/Avatar"));
    vi.doMock("@/components/ui/VerifiedBadge", () => import("../../components/ui/VerifiedBadge"));

    const { NewsStepPreview } = await import("../../components/News/NewsSteps");
    const newsPreviewHtml = renderToStaticMarkup(
      React.createElement(NewsStepPreview, {
        mediaPreview: null,
        setMediaPreview: vi.fn(),
        interest: "Tech",
        title: "Ship Day",
        content: "Live today.",
        country: "Nigeria",
        state: "Lagos",
        campaignDays: 7,
        isBiddingEnabled: false,
        bidPrice: 0,
        isAdmin: false,
        userProfile: {
          profileImage: "https://paayh.com/cdn/storage/avatars/zenith-logo.png",
          business_name: "Zenith Labs",
          username: "zenithlabs",
          monetized: true,
          email: "team@zenith.io",
        },
        isAiContent: false,
        setIsAiContent: vi.fn(),
        agreedToPolicy: true,
        setAgreedToPolicy: vi.fn(),
        isSubmitting: false,
        setStep: vi.fn(),
        handleInitiateSubmit: vi.fn(),
        capitalizeFirst: (txt: string) => txt,
      })
    );

    expect(newsPreviewHtml).toContain("https://paayh.com/cdn/storage/avatars/zenith-logo.png");
    expect(newsPreviewHtml).toContain("Zenith Labs");
    expect(newsPreviewHtml).toContain("@zenithlabs");

    const { default: AdPreviewCard } = await import("../../components/Adreview/page");
    vi.doMock("next/dynamic", () => ({
      default: () => AdPreviewCard,
    }));
    const { default: Step5Launch } = await import("../../components/Ad/Step5Launch");

    const adLaunchHtml = renderToStaticMarkup(
      React.createElement(Step5Launch, {
        formSelections: {
          industry: [],
          interest: [],
          lifestyle: [],
          behavior: [],
          personality: [],
          ageRange: [18, 65],
          targetingAll: true,
          impressions: 500,
          campaignDays: 7,
          scheduledStartAt: "",
          userFrequencyCap: 0,
          country: "Nigeria",
          state: "",
          province: "",
          targetLocations: [],
          gender: "all",
          employmentStatus: [],
          adMediaType: "image",
          adContent: "Check out our launch!",
          adMediaFiles: [],
          existingMedia: "https://paayh.com/cdn/storage/ads/banner.png",
          adActionButtons: ["website"],
          actionDetails: {
            phone: "",
            whatsapp: "",
            website: "https://paayh.com",
            email: "",
            ios: "",
            android: "",
            watch_now: "",
          },
          displayMutualButton: false,
          productName: "",
          productPrice: "",
          productCtaType: "Buy",
          productCtaLink: "",
          customSponsorName: "",
          customSponsorHandle: "",
          customSponsorLogo: "",
        },
        adType: "business",
        isAdmin: false,
        paymentMethod: "card",
        setPaymentMethod: vi.fn(),
        userProfile: {
          mutual_count: 2,
          mutuals: [],
          balance: 10000,
          profileImage: "https://paayh.com/cdn/storage/avatars/brand-logo.png",
          business_name: "Paayh Merchants",
          username: "merchants",
          monetized: true,
          email: "brand@paayh.com",
        },
        formatCurrency: (v) => `₦${v}`,
        isAiContent: false,
        setIsAiContent: vi.fn(),
        agreedToPolicy: true,
        setAgreedToPolicy: vi.fn(),
        isSubmitting: false,
        handleInitiateSubmit: vi.fn(),
        showPaymentConfirmModal: false,
        setShowPaymentConfirmModal: vi.fn(),
        submitAd: vi.fn(),
        calculateTotalCost: () => 5000,
      })
    );

    expect(adLaunchHtml).toContain("https://paayh.com/cdn/storage/avatars/brand-logo.png");
    expect(adLaunchHtml).toContain("Paayh Merchants");
    expect(adLaunchHtml).toContain("@merchants");
    expect(adLaunchHtml).toContain("Sponsored");
    },
    15000
  );

  it(
    "Fix 3 & Fix 5: next.config disables poweredByHeader, allows paayh.com images, allows Kora in CSP, and nextImageSafety guards unconfigured hosts; middleware strips fingerprint headers",
    async () => {
    vi.doMock("@sentry/nextjs", () => ({
      withSentryConfig: (cfg: unknown) => cfg,
    }));

    const nextConfigMod = await import("../../next.config");
    const nextConfig = nextConfigMod.default;

    expect(nextConfig.poweredByHeader).toBe(false);
    const hostPatterns = (nextConfig.images?.remotePatterns || []).map((p: { hostname: string }) => p.hostname);
    expect(hostPatterns).toContain("paayh.com");
    expect(hostPatterns).toContain("*.paayh.com");

    const allHeaders = await nextConfig.headers();
    const rootRule = allHeaders.find((r: { source: string }) => r.source === "/:path*");
    const cspHeader = rootRule?.headers?.find((h: { key: string }) => h.key === "Content-Security-Policy")?.value || "";
    expect(cspHeader).toContain("https://checkout.korapay.com");
    expect(cspHeader).toContain("https://test-checkout.korapay.com");

    const { isConfiguredNextImageSrc } = await import("../utils/nextImageSafety");
    expect(isConfiguredNextImageSrc("https://paayh.com/cdn/storage/news/1794217634038_IMG_7282.png")).toBe(true);
    expect(isConfiguredNextImageSrc("https://cdn.paayh.com/news/photo.png")).toBe(true);
    expect(isConfiguredNextImageSrc("/cdn/storage/news/local.png")).toBe(true);
    expect(isConfiguredNextImageSrc("https://evil-or-unconfigured.example.org/img.png")).toBe(false);
    expect(isConfiguredNextImageSrc("data:image/png;base64,iVBOR")).toBe(false);

    vi.doMock("@/lib/auth0", () => ({
      auth0: {
        middleware: vi.fn().mockImplementation(async () => {
          const res = NextResponse.next();
          res.headers.set("x-powered-by", "Next.js 15.5.25");
          res.headers.set("server", "Vercel/Next.js");
          res.headers.set("x-nextjs-cache", "MISS");
          res.headers.set("x-nextjs-prerender", "1");
          return res;
        }),
      },
    }));

    const { middleware } = await import("../../middleware");
    const req = new NextRequest("https://paayh.com/logged-in");
    const res = await middleware(req);

    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(res.headers.get("server")).toBeNull();
    expect(res.headers.get("x-nextjs-cache")).toBeNull();
    expect(res.headers.get("x-nextjs-prerender")).toBeNull();
    },
    15000
  );

  it("Fix 4: Kora test-mode broken session (data: null) cleanly fails over to Paystack on Web & Edge, and callback search parser handles double '?'", async () => {
    const { parseNormalizedSearchParams } = await import("../utils/searchParams");
    const malformedParams = parseNormalizedSearchParams(
      "?view=myads?reference=kora_pay_12345&tab=highlights"
    );
    expect(malformedParams.get("view")).toBe("myads");
    expect(malformedParams.get("reference")).toBe("kora_pay_12345");
    expect(malformedParams.get("tab")).toBe("highlights");

    process.env.PAYMENT_PROVIDER = "kora";
    process.env.KORA_SECRET_KEY = "sk_test_broken_sandbox_123";
    process.env.PAYSTACK_SECRET_KEY = "sk_test_paystack_backup_456";
    vi.doMock("@/lib/redis", () => ({ default: {} }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({ default: {} }));

    const fetchMock = vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target.includes("charges/initialize")) {
        return {
          ok: true,
          json: async () => ({
            status: true,
            data: {
              checkout_url: "https://test-checkout.korapay.com/KPY-PI-broken999/pay",
              reference: "kora_pay_broken999",
            },
          }),
        };
      }
      if (target.includes("/session/KPY-PI-broken999")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: null,
          }),
        };
      }
      if (target.includes("api.paystack.co/transaction/initialize")) {
        return {
          ok: true,
          json: async () => ({
            status: true,
            data: {
              authorization_url: "https://checkout.paystack.com/workingfallback777",
              reference: "ref_fallback_777",
              access_code: "acc_777",
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch URL: ${target}`);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { PayoutProvider } = await import("../payment/payoutProvider");
    const webInit = await PayoutProvider.initializePayment({
      email: "user@paayh.com",
      amountInNaira: 2500,
      callbackUrl: "https://paayh.com/logged-in?view=myads",
      metadata: { type: "ad", ad_id: "ad_1" },
    });

    expect(webInit.authorization_url).toBe("https://checkout.paystack.com/workingfallback777");
    expect(webInit.reference).toBe("ref_fallback_777");

    const koraCall = fetchMock.mock.calls.find(([u]) => String(u).includes("charges/initialize"));
    const koraInitReq = (koraCall as unknown[])?.[1] as { body?: string } | undefined;
    const koraBody = JSON.parse(String(koraInitReq?.body || "{}"));
    expect(koraBody.merchant_bears_cost).toBe(true);

    // Edge _shared/payoutProvider.ts should follow exact same failover when Deno env is configured
    (globalThis as { Deno?: { env: { get: (k: string) => string | undefined } } }).Deno = {
      env: { get: (key: string) => process.env[key] },
    };
    const {
      initializePayment: edgeInitializePayment,
      verifyKoraCheckoutSessionUsable,
    } = loadDenoModuleInNode("supabase/functions/_shared/payoutProvider.ts") as {
      initializePayment: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
      verifyKoraCheckoutSessionUsable: (checkoutUrl: string) => Promise<boolean>;
    };

    const edgeInit = await edgeInitializePayment({
      email: "user@paayh.com",
      amount: 2500,
      reference: "BOOST-edge-1",
      callbackUrl: "xea-auth://payment-callback?boost_ref=BOOST-edge-1",
      metadata: { type: "boost_ad", ad_id: "ad_1" },
    });

    expect(edgeInit.success).toBe(true);
    expect(edgeInit.provider).toBe("paystack");
    expect(edgeInit.authorization_url).toBe("https://checkout.paystack.com/workingfallback777");

    // Verify fail-open when /session returns healthy data or rejects
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { reference: "kora_ok_1" } }),
      }) as unknown as typeof fetch
    );
    expect(await verifyKoraCheckoutSessionUsable("https://checkout.korapay.com/KPY-PI-healthy1/pay")).toBe(true);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("timeout")) as unknown as typeof fetch);
    expect(await verifyKoraCheckoutSessionUsable("https://checkout.korapay.com/KPY-PI-timeout/pay")).toBe(true);
  });

  it("Invite links resolve to one canonical /join?ref= URL with one referral code", async () => {
    const { buildInviteUrl, normalizeReferralCode } = await import("../utils/inviteLink");
    expect(normalizeReferralCode(" PA998877 ")).toBe("PA998877");
    expect(normalizeReferralCode("https://paayh.com/join?ref=PA998877")).toBe("PA998877");
    expect(buildInviteUrl("PA998877")).toBe("https://paayh.com/join?ref=PA998877");
    expect(buildInviteUrl("https://paayh.com/join?ref=PA998877", "https://paayh.com/")).toBe(
      "https://paayh.com/join?ref=PA998877"
    );
    expect(buildInviteUrl("")).toBe("https://paayh.com");

    const becomeAgentSource = fs.readFileSync(
      path.resolve(process.cwd(), "components/AgentSystem/BecomeAgentPage.tsx"),
      "utf8"
    );
    const inviteLinkSource = fs.readFileSync(
      path.resolve(process.cwd(), "components/InviteLink/page.tsx"),
      "utf8"
    );
    expect(becomeAgentSource).not.toContain("/signup?ref=");
    expect(becomeAgentSource).toContain("buildInviteUrl");
    expect(inviteLinkSource).not.toContain("https://xea.app");
    expect(inviteLinkSource).toContain("buildInviteUrl");
  });

  it("PostgREST .or() filter hardening strips wildcards/metacharacters from feed pool country filters", () => {
    const webPoolLoader = fs.readFileSync(
      path.resolve(process.cwd(), "lib/feed/poolLoader.ts"),
      "utf8"
    );
    const edgeFeed = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/functions/campaigns-action/feed.ts"),
      "utf8"
    );
    expect(webPoolLoader).toContain('replace(/[,()*%\\\\\'"]/g, "")');
    expect(edgeFeed).toContain('replace(/[,()*%\\\\\'"]/g, "")');
  });
});
