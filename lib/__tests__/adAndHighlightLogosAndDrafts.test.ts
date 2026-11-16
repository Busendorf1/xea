import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";

function mockFramerMotion() {
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
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
}

function installBrowserGlobals() {
  const localStorage = createMemoryStorage();
  const sessionStorage = createMemoryStorage();
  const winListeners = new Map<string, Set<(...args: any[]) => void>>();
  const docListeners = new Map<string, Set<(...args: any[]) => void>>();

  const mockWindow: any = {
    localStorage,
    sessionStorage,
    scrollTo: vi.fn(),
    location: { href: "http://localhost:3000/logged-in" },
    addEventListener: (type: string, fn: (...args: any[]) => void) => {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (...args: any[]) => void) => {
      winListeners.get(type)?.delete(fn);
    },
    dispatchEvent: (ev: any) => {
      winListeners.get(ev?.type)?.forEach((fn) => fn(ev));
      return true;
    },
  };

  const mockDocument: any = {
    cookie: "",
    visibilityState: "visible",
    addEventListener: (type: string, fn: (...args: any[]) => void) => {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (...args: any[]) => void) => {
      docListeners.get(type)?.delete(fn);
    },
    dispatchEvent: (ev: any) => {
      docListeners.get(ev?.type)?.forEach((fn) => fn(ev));
      return true;
    },
  };

  vi.stubGlobal("window", mockWindow);
  vi.stubGlobal("document", mockDocument);
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("sessionStorage", sessionStorage);

  return { localStorage, sessionStorage, mockWindow, mockDocument };
}

function mountHook<TProps, TResult>(
  hookFn: (props: TProps) => TResult,
  initialProps: TProps
) {
  const internals = (React as any)
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const slots: any[] = [];
  const pendingEffects: Array<() => void> = [];
  let props = initialProps;
  let result!: TResult;

  const makeDispatcher = () => {
    let idx = 0;
    return {
      useState: (init: any) => {
        const i = idx++;
        if (!(i in slots)) {
          slots[i] = typeof init === "function" ? init() : init;
        }
        return [
          slots[i],
          (upd: any) => {
            slots[i] = typeof upd === "function" ? upd(slots[i]) : upd;
          },
        ];
      },
      useReducer: (reducer: any, init: any, initArg: any) => {
        const i = idx++;
        if (!(i in slots)) {
          slots[i] = initArg !== undefined ? initArg(init) : init;
        }
        return [
          slots[i],
          (action: any) => {
            slots[i] = reducer(slots[i], action);
          },
        ];
      },
      useRef: (init: any) => {
        const i = idx++;
        if (!(i in slots)) slots[i] = { current: init };
        return slots[i];
      },
      useEffect: (fn: () => any, deps?: any[]) => {
        const i = idx++;
        const prev = slots[i];
        const changed =
          !prev ||
          !deps ||
          !prev.deps ||
          deps.length !== prev.deps.length ||
          deps.some((d: any, k: number) => !Object.is(d, prev.deps[k]));
        if (changed) {
          pendingEffects.push(() => {
            prev?.cleanup?.();
            const cleanup = fn();
            slots[i] = {
              deps,
              cleanup: typeof cleanup === "function" ? cleanup : undefined,
              isEffect: true,
            };
          });
        }
      },
      useLayoutEffect: () => {},
      useInsertionEffect: () => {},
      useMemo: (fn: () => any, deps?: any[]) => {
        const i = idx++;
        const prev = slots[i];
        const changed =
          !prev ||
          !deps ||
          !prev.deps ||
          deps.length !== prev.deps.length ||
          deps.some((d: any, k: number) => !Object.is(d, prev.deps[k]));
        if (changed) slots[i] = { val: fn(), deps };
        return slots[i].val;
      },
      useCallback: (fn: any, deps?: any[]) => {
        const i = idx++;
        const prev = slots[i];
        const changed =
          !prev ||
          !deps ||
          !prev.deps ||
          deps.length !== prev.deps.length ||
          deps.some((d: any, k: number) => !Object.is(d, prev.deps[k]));
        if (changed) slots[i] = { val: fn, deps };
        return slots[i].val;
      },
      useContext: (c: any) => c?._currentValue,
      useImperativeHandle: () => {},
      useDebugValue: () => {},
      useDeferredValue: (v: any) => v,
      useTransition: () => [false, (cb: () => void) => cb()],
      useId: () => ":r-test:",
      useSyncExternalStore: (_sub: any, getSnapshot: () => any) => getSnapshot(),
    };
  };

  const render = (nextProps: TProps = props) => {
    props = nextProps;
    const prevH = internals.H;
    internals.H = makeDispatcher();
    try {
      result = hookFn(props);
    } finally {
      internals.H = prevH;
    }
    while (pendingEffects.length > 0) {
      const fn = pendingEffects.shift()!;
      fn();
    }
    return result;
  };

  const act = async (fn?: () => void | Promise<void>) => {
    if (fn) await fn();
    render(props);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    render(props);
  };

  const unmount = () => {
    for (const slot of slots) {
      if (slot && slot.isEffect && typeof slot.cleanup === "function") {
        slot.cleanup();
      }
    }
  };

  render(initialProps);
  return {
    get current() {
      return result;
    },
    render,
    act,
    unmount,
  };
}

describe("Web Ad & Highlight Logos, Monetized Badges, Feed Hydration & Draft Persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("profileDisplay resolves custom sponsor/user logos, rejects provider defaults, and evaluates monetized/exempt badges accurately", async () => {
    const { resolveUserLogoUrl, isProfileMonetizedBadgeEligible } = await import(
      "../utils/profileDisplay"
    );

    expect(
      resolveUserLogoUrl(
        "https://paayh.com/cdn/storage/avatars/custom-sponsor.png",
        { profileImage: "https://paayh.com/cdn/storage/avatars/user-logo.png" },
        "https://lh3.googleusercontent.com/default-avatar"
      )
    ).toBe("https://paayh.com/cdn/storage/avatars/custom-sponsor.png");

    expect(
      resolveUserLogoUrl(
        "   ",
        { logo: "https://paayh.com/cdn/storage/avatars/company-logo.png" },
        "https://paayh.com/cdn/storage/avatars/session.png"
      )
    ).toBe("https://paayh.com/cdn/storage/avatars/company-logo.png");

    expect(
      resolveUserLogoUrl(
        "",
        { profileImage: "https://cdn.auth0.com/avatars/al.png" },
        "https://paayh.com/cdn/storage/avatars/fallback.png"
      )
    ).toBe("https://paayh.com/cdn/storage/avatars/fallback.png");

    expect(isProfileMonetizedBadgeEligible({ monetized: true })).toBe(true);
    expect(isProfileMonetizedBadgeEligible({ monetized: "true" })).toBe(true);
    expect(isProfileMonetizedBadgeEligible({ monetized: "yes" })).toBe(true);
    expect(
      isProfileMonetizedBadgeEligible({ monetized: false, isExemptFromBarriersAndInactivity: true })
    ).toBe(true);
    expect(
      isProfileMonetizedBadgeEligible({ monetized: false, monetization_clicks: 500 })
    ).toBe(true);
    expect(
      isProfileMonetizedBadgeEligible({
        monetized: true,
        has_cancelled_monetization: true,
      })
    ).toBe(false);
    expect(
      isProfileMonetizedBadgeEligible({ monetized: false, monetization_clicks: 120 })
    ).toBe(false);
  });

  it("Req #2: Ad & Highlight live previews render user logo (or session/custom fallback) and VerifiedBadge whenever monetized or exempt", async () => {
    mockFramerMotion();
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

    const { default: AdPreviewCard } = await import("../../components/Adreview/page");
    vi.doMock("next/dynamic", () => ({
      default: () => AdPreviewCard,
    }));
    const { default: Step5Launch } = await import("../../components/Ad/Step5Launch");
    const { NewsStepPreview } = await import("../../components/News/NewsSteps");

    const baseSelections = {
      industry: [],
      interest: [],
      lifestyle: [],
      behavior: [],
      personality: [],
      ageRange: [18, 65] as [number, number],
      targetingAll: true,
      impressions: 500,
      campaignDays: 7,
      scheduledStartAt: "",
      userFrequencyCap: 1,
      country: "Nigeria",
      state: "",
      province: "",
      targetLocations: [],
      gender: "all",
      employmentStatus: [],
      adMediaType: "text" as const,
      adContent: "Preview copy with logo and badge",
      adMediaFiles: [],
      existingMedia: "",
      adActionButtons: [],
      actionDetails: {
        phone: "",
        whatsapp: "",
        website: "",
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
    };

    // Monetized user with string "yes" and blank business_name/username still shows sponsor header, logo, and badge
    const monetizedYesHtml = renderToStaticMarkup(
      React.createElement(Step5Launch, {
        formSelections: baseSelections,
        adType: "business",
        isAdmin: false,
        paymentMethod: "card",
        setPaymentMethod: vi.fn(),
        userProfile: {
          mutual_count: 0,
          mutuals: [],
          balance: 5000,
          profileImage: null,
          logo: "https://paayh.com/cdn/storage/avatars/exempt-org.png",
          monetized: "yes",
          email: "founder@exempt.org",
        },
        sessionImage: null,
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
    expect(monetizedYesHtml).toContain("https://paayh.com/cdn/storage/avatars/exempt-org.png");
    expect(monetizedYesHtml).toContain('aria-label="Verified Account"');

    // Cancelled monetization hides VerifiedBadge while still rendering sessionImage fallback logo
    const unverifiedHtml = renderToStaticMarkup(
      React.createElement(Step5Launch, {
        formSelections: baseSelections,
        adType: "business",
        isAdmin: false,
        paymentMethod: "card",
        setPaymentMethod: vi.fn(),
        userProfile: {
          mutual_count: 0,
          mutuals: [],
          balance: 5000,
          profileImage: null,
          monetized: true,
          has_cancelled_monetization: true,
          business_name: "Plain Brand",
          email: "plain@brand.com",
        },
        sessionImage: "https://paayh.com/cdn/storage/avatars/session-fallback.png",
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
    expect(unverifiedHtml).toContain("https://paayh.com/cdn/storage/avatars/session-fallback.png");
    expect(unverifiedHtml).toContain("Plain Brand");
    expect(unverifiedHtml).not.toContain('aria-label="Verified Account"');

    // NewsStepPreview renders user logo via userImage fallback + VerifiedBadge for exempt accounts
    const exemptNewsHtml = renderToStaticMarkup(
      React.createElement(NewsStepPreview, {
        mediaPreview: null,
        setMediaPreview: vi.fn(),
        interest: "Tech",
        title: "Launch Note",
        content: "Now live.",
        country: "Nigeria",
        state: "Lagos",
        campaignDays: 5,
        isBiddingEnabled: false,
        bidPrice: 1500,
        isAdmin: false,
        userProfile: {
          profileImage: null,
          business_name: "Exempt Studio",
          monetized: false,
          isExemptFromBarriersAndInactivity: true,
          email: "studio@exempt.io",
        },
        userEmail: "studio@exempt.io",
        userName: "Exempt Studio",
        userImage: "https://paayh.com/cdn/storage/avatars/studio-session.png",
        isAiContent: false,
        setIsAiContent: vi.fn(),
        agreedToPolicy: true,
        setAgreedToPolicy: vi.fn(),
        isSubmitting: false,
        setStep: vi.fn(),
        handleInitiateSubmit: vi.fn(),
        capitalizeFirst: (s) => s,
      })
    );
    expect(exemptNewsHtml).toContain("https://paayh.com/cdn/storage/avatars/studio-session.png");
    expect(exemptNewsHtml).toContain('aria-label="Verified Account"');
  }, 15000);

  it("Req #3: GET /api/highlights & SSR getUserProfileForDashboard preserve user_email and hydrate publisher profiles", async () => {
    let cachedHighlightsStore: any = null;
    const setCachedHighlights = vi.fn(async (_k: string, val: any) => {
      cachedHighlightsStore = val;
    });
    const getCachedHighlights = vi.fn(async () => cachedHighlightsStore);

    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("viewer@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
      isEmailDeactivated: vi.fn().mockResolvedValue(false),
      isEmailPermanentlyBanned: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue("OK") },
      isRedisReady: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn().mockResolvedValue(null),
      getCachedHighlights,
      setCachedHighlights,
      registerL1HighlightsEvictionHandler: vi.fn(),
    }));
    vi.doMock("@/lib/utils/parsers", () => ({
      safeParseArray: vi.fn((v: unknown) => (Array.isArray(v) ? v : [])),
    }));
    vi.doMock("@/lib/highlights/highlightLifecycle", () => ({
      isHighlightCurrentlyActive: vi.fn().mockReturnValue(true),
      sortHighlightsByBidAndRecency: vi.fn((list: unknown[]) => list),
    }));

    const hlRows = [
      {
        id: "hl-100",
        user_email: "Publisher@Brand.io",
        title: "Creator Highlight",
        content: "Story body",
        image_url: "https://paayh.com/cdn/storage/news/hl-100.png",
        interest: "Tech",
        country: "Nigeria",
        state: "Lagos",
        is_active: true,
        is_paused: false,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
      },
    ];
    const userRows = [
      {
        email: "publisher@brand.io",
        username: "pubbrand",
        business_name: "Publisher Brand",
        firstName: "Pub",
        lastName: "Brand",
        profileImage: "https://paayh.com/cdn/storage/avatars/pub-logo.png",
        monetized: true,
        ad_account_status: "active",
      },
    ];

    const makeDb = () => ({
      from: vi.fn((table: string) => {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          ilike: vi.fn(() => chain),
          in: vi.fn(async () => ({ data: table === "users" ? userRows : hlRows, error: null })),
          or: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          lte: vi.fn(() => chain),
          neq: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(async () => ({ data: table === "newsactive" ? hlRows : [], error: null })),
          maybeSingle: vi.fn(async () => ({
            data: { email: "viewer@paayh.com", country: "Nigeria", interest: "Tech" },
            error: null,
          })),
        };
        return chain;
      }),
    });

    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: makeDb(),
      supabaseReadOnly: makeDb(),
    }));

    const { GET } = await import("../../app/api/highlights/route");

    // 1. Cache miss hydrates highlights + profiles keyed by lowercased email
    const missRes = await GET(new NextRequest("https://paayh.com/api/highlights?interests=Tech"));
    const missJson = await missRes.json();
    expect(missRes.status).toBe(200);
    expect(missJson.highlights).toHaveLength(1);
    expect(missJson.highlights[0].user_email).toBe("Publisher@Brand.io");
    expect(missJson.profiles["publisher@brand.io"]).toMatchObject({
      email: "publisher@brand.io",
      business_name: "Publisher Brand",
      profileImage: "https://paayh.com/cdn/storage/avatars/pub-logo.png",
      monetized: true,
    });
    expect(setCachedHighlights).toHaveBeenCalledTimes(1);

    // 2. Cache hit still returns hydrated profiles alongside cached highlights
    const hitRes = await GET(new NextRequest("https://paayh.com/api/highlights?interests=Tech"));
    const hitJson = await hitRes.json();
    expect(hitRes.status).toBe(200);
    expect(hitJson.highlights).toHaveLength(1);
    expect(hitJson.profiles["publisher@brand.io"]?.profileImage).toBe(
      "https://paayh.com/cdn/storage/avatars/pub-logo.png"
    );

    // 3. SSR getUserProfileForDashboard hydrates initialHighlightProfiles cleanly
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn().mockResolvedValue({
        email: "viewer@paayh.com",
        country: "Nigeria",
        state: "Lagos",
        interest: '["Tech"]',
        gender: "all",
        monetized: true,
        monetization_clicks: 10,
        last_active_at: new Date().toISOString(),
        has_updated_profile: true,
      }),
      setCachedProfile: vi.fn().mockResolvedValue(undefined),
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
      getCachedHighlights: vi.fn().mockResolvedValue(hlRows),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {
        mget: vi.fn().mockResolvedValue([null, null, null, null, null]),
        smembers: vi.fn().mockResolvedValue([]),
        smismember: vi.fn().mockResolvedValue([]),
      },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/adminHelper", () => import("../adminHelper"));
    vi.doMock("@/lib/utils/activityTracker", () => ({
      touchUserActivity: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/utils/avatar", () => import("../utils/avatar"));
    vi.doMock("@/lib/targetingEngine", () => ({
      evaluateAdTargeting: vi.fn().mockReturnValue({ matches: true }),
      signAdImpressionToken: vi.fn().mockReturnValue("tok"),
    }));
    vi.doMock("@/lib/security/piiCrypto", () => ({
      decryptProfilePII: vi.fn((u: any) => u),
      encryptSensitiveField: vi.fn((v: any) => v),
    }));

    const { getUserProfileForDashboard } = await import("../getUserProfileForDashboard");
    const ssrResult = await getUserProfileForDashboard({ user: { email: "viewer@paayh.com" } });
    expect(ssrResult.initialHighlights).toHaveLength(1);
    expect(ssrResult.initialHighlightProfiles?.["publisher@brand.io"]?.profileImage).toBe(
      "https://paayh.com/cdn/storage/avatars/pub-logo.png"
    );
  });

  it("Req #3: HighlightCard, Newsdisplay, and extractHighlightsPayload render publisher logo & badge instead of hardcoded HL", async () => {
    vi.doMock("@/lib/adminHelper", () => import("../adminHelper"));
    vi.doMock("@/lib/utils/avatar", () => import("../utils/avatar"));
    vi.doMock("@/components/ui/Avatar", () => import("../../components/ui/Avatar"));
    vi.doMock("@/components/ui/VerifiedBadge", () => import("../../components/ui/VerifiedBadge"));
    vi.doMock("@/lib/utils/cdnUrl", () => ({
      toVercelCdnUrl: (u: string) => u,
    }));
    vi.doMock("@/lib/utils/mediaCollageLayout", () => import("../utils/mediaCollageLayout"));
    vi.doMock("next/dynamic", () => ({
      default: () => () => null,
    }));
    vi.doMock("@/components/ui/RoleStarBadges", () => ({
      default: () => null,
    }));
    vi.doMock("@/lib/utils/nextImageSafety", () => ({
      isConfiguredNextImageSrc: () => true,
    }));
    vi.doMock("next/image", () => ({
      default: (props: Record<string, any>) => React.createElement("img", props),
    }));
    vi.doMock("@/lib/supabaseClient", () => ({
      default: {
        channel: () => {
          const ch: any = { on: () => ch, subscribe: () => ch };
          return ch;
        },
        removeChannel: vi.fn(),
      },
    }));
    vi.doMock("@/lib/highlights/highlightLifecycle", () => import("../highlights/highlightLifecycle"));

    const { default: HighlightCard } = await import("../../components/ui/HighlightCard");
    const { extractHighlightsPayload } = await import("../hooks/useFeedHighlights");
    const { default: NewsDisplay } = await import("../../components/Newsdisplay/page");

    // Payload parser handles both new { highlights, profiles } and legacy array format
    expect(extractHighlightsPayload([{ id: "legacy-1" }])).toEqual({
      items: [{ id: "legacy-1" }],
      profiles: {},
    });
    expect(
      extractHighlightsPayload({
        highlights: [{ id: "hl-1" }],
        profiles: { "A@B.COM": { profileImage: "https://paayh.com/logo.png" } as any },
      })
    ).toEqual({
      items: [{ id: "hl-1" }],
      profiles: { "a@b.com": { profileImage: "https://paayh.com/logo.png" } },
    });

    const hlAd: any = {
      id: "hl-card-1",
      user_email: "Publisher@Brand.io",
      ad_content: "Headline Text",
      ad_description: "Highlight body copy",
      ad_media: "https://paayh.com/cdn/storage/news/cover.png",
      ad_media_type: "image",
      ad_type: "news",
      interest: "Tech",
      created_at: new Date().toISOString(),
    };
    const hlProfile = {
      email: "publisher@brand.io",
      business_name: "Publisher Brand",
      username: "pubbrand",
      profileImage: "https://paayh.com/cdn/storage/avatars/feed-hl-logo.png",
      monetized: true,
    };

    const cardHtml = renderToStaticMarkup(
      React.createElement(HighlightCard, {
        ad: hlAd,
        formatTimestamp: () => "Just now",
        advertiserProfiles: { "publisher@brand.io": hlProfile },
      })
    );
    expect(cardHtml).toContain("https://paayh.com/cdn/storage/avatars/feed-hl-logo.png");
    expect(cardHtml).toContain("Publisher Brand");
    expect(cardHtml).toContain('aria-label="Verified Account"');
    expect(cardHtml).not.toContain(">HL<");

    // HighlightCard with no logo falls back to publisher initials, never hardcoded "HL"
    const noLogoCardHtml = renderToStaticMarkup(
      React.createElement(HighlightCard, {
        ad: hlAd,
        formatTimestamp: () => "Just now",
        advertiserProfiles: {
          "publisher@brand.io": {
            email: "publisher@brand.io",
            business_name: "Zenith News",
            monetized: false,
          },
        },
      })
    );
    expect(noLogoCardHtml).toContain("Zenith News");
    expect(noLogoCardHtml).toContain('aria-label="Zenith News"');
    expect(noLogoCardHtml).not.toContain(">HL<");

    // Newsdisplay sidebar renders initialHighlights with initialHighlightProfiles logo + badge
    const sidebarHtml = renderToStaticMarkup(
      React.createElement(NewsDisplay, {
        userInterest: ["Tech"],
        initialHighlights: [
          {
            id: "hl-side-1",
            user_email: "Publisher@Brand.io",
            title: "Breaking Update",
            content: "Details inside.",
            image_url: "https://paayh.com/cdn/storage/news/side.png",
            interest: "Tech",
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 86400_000).toISOString(),
          },
        ],
        initialHighlightProfiles: { "publisher@brand.io": hlProfile as any },
      })
    );
    expect(sidebarHtml).toContain("https://paayh.com/cdn/storage/avatars/feed-hl-logo.png");
    expect(sidebarHtml).toContain("Publisher Brand");
    expect(sidebarHtml).toContain('aria-label="Verified Account"');

    // Newsdisplay client effect preserves publisher profiles when persisting initialHighlights to sessionStorage
    const { sessionStorage } = installBrowserGlobals();
    const initialSideHighlights: any[] = [
      {
        id: "hl-side-1",
        user_email: "Publisher@Brand.io",
        title: "Breaking Update",
        content: "Details inside.",
        image_url: "https://paayh.com/cdn/storage/news/side.png",
        interest: "Tech",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
      },
    ];
    const newsDisplayMount = mountHook(
      () =>
        NewsDisplay({
          userInterest: ["Tech"],
          initialHighlights: initialSideHighlights,
          initialHighlightProfiles: { "publisher@brand.io": hlProfile as any },
        }),
      undefined
    );
    await newsDisplayMount.act();
    const cachedRaw = sessionStorage.getItem("paayh_highlights_cache");
    expect(cachedRaw).toBeTruthy();
    const parsedCache = JSON.parse(cachedRaw!);
    expect(parsedCache.items).toHaveLength(1);
    expect(parsedCache.profiles?.["publisher@brand.io"]).toMatchObject({
      email: "publisher@brand.io",
      profileImage: "https://paayh.com/cdn/storage/avatars/feed-hl-logo.png",
      business_name: "Publisher Brand",
    });
    newsDisplayMount.unmount();
  }, 15000);

  it("Req #4: composerDraftStorage isolates users, migrates legacy keys once, and persists binary File objects in memory fallback", async () => {
    const { localStorage } = installBrowserGlobals();
    const {
      AD_DRAFT_STORAGE_PREFIX,
      LEGACY_AD_DRAFT_KEY,
      clearDraftMediaFiles,
      getScopedDraftStorageKey,
      getScopedMediaId,
      loadDraftMediaFiles,
      readScopedJsonDraft,
      saveDraftMediaFiles,
      writeScopedJsonDraft,
      _resetDraftMediaMemoryCacheForTests,
    } = await import("../utils/composerDraftStorage");

    _resetDraftMediaMemoryCacheForTests();

    expect(getScopedDraftStorageKey(AD_DRAFT_STORAGE_PREFIX, "Alice@Example.com")).toBe(
      "paayh_draft_ad_v2:alice@example.com"
    );
    expect(getScopedDraftStorageKey(AD_DRAFT_STORAGE_PREFIX, "bob@example.com")).toBe(
      "paayh_draft_ad_v2:bob@example.com"
    );

    // Legacy draft migrates once to Alice and is deleted before Bob ever sees it
    localStorage.setItem(LEGACY_AD_DRAFT_KEY, JSON.stringify({ step: 2, formSelections: { adContent: "Legacy Alice" } }));
    const aliceMigrated = readScopedJsonDraft<any>(
      AD_DRAFT_STORAGE_PREFIX,
      LEGACY_AD_DRAFT_KEY,
      "Alice@Example.com"
    );
    expect(aliceMigrated.fromLegacy).toBe(true);
    expect(aliceMigrated.draft?.step).toBe(2);
    expect(localStorage.getItem(LEGACY_AD_DRAFT_KEY)).toBeNull();

    const bobRead = readScopedJsonDraft<any>(AD_DRAFT_STORAGE_PREFIX, LEGACY_AD_DRAFT_KEY, "bob@example.com");
    expect(bobRead.draft).toBeNull();

    // Media File persistence works synchronously via memory fallback even when IndexedDB is absent
    writeScopedJsonDraft(AD_DRAFT_STORAGE_PREFIX, "alice@example.com", { step: 3 });
    const file = new File(["image-bytes"], "hero.png", { type: "image/png" });
    const aliceMediaScope = getScopedMediaId("ad", "alice@example.com");
    await saveDraftMediaFiles(aliceMediaScope, [file]);

    const restoredAliceFiles = await loadDraftMediaFiles(aliceMediaScope);
    expect(restoredAliceFiles).toHaveLength(1);
    expect(restoredAliceFiles[0].name).toBe("hero.png");

    const restoredBobFiles = await loadDraftMediaFiles(getScopedMediaId("ad", "bob@example.com"));
    expect(restoredBobFiles).toHaveLength(0);

    await clearDraftMediaFiles(aliceMediaScope);
    expect(await loadDraftMediaFiles(aliceMediaScope)).toHaveLength(0);
  });

  it("Req #4: useAdFormDraftAndEdit flushes before debounce on unmount, restores step+fields+Files, isolates accounts, and clears via resetForm/clearDraft", async () => {
    const { localStorage, mockWindow } = installBrowserGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          isDeliveringActive: false,
          originalTotalCost: 1000,
          ad: {
            id: "ad-edit-999",
            ad_type: "politics",
            ad_content: "Editing Existing Campaign",
            impressions: 200,
            campaign_days: 5,
          },
        }),
      }))
    );
    vi.doMock("next/navigation", () => ({
      useSearchParams: () => new URLSearchParams(),
    }));

    const { _resetDraftMediaMemoryCacheForTests } = await import("../utils/composerDraftStorage");
    _resetDraftMediaMemoryCacheForTests();

    const { useAdFormDraftAndEdit } = await import("../../components/Ad/useAdFormDraftAndEdit");

    // 1. Alice enters step 3, adContent, bid settings, and selects a media File, then IMMEDIATELY unmounts (<350ms)
    const hook1 = mountHook((email: string) => useAdFormDraftAndEdit(email), "Alice@Brand.com");
    await hook1.act();
    const adFile = new File(["ad-pixel"], "campaign-banner.png", { type: "image/png" });
    await hook1.act(() => {
      hook1.current.setStep(3);
      hook1.current.setAdType("business");
      hook1.current.setIsBiddingEnabled(true);
      hook1.current.setBidPrice(420);
      hook1.current.setFormSelections((prev) => ({
        ...prev,
        adContent: "Resume right where Alice left off",
        adMediaType: "image",
        adMediaFiles: [adFile],
      }));
    });
    // Immediately unmount before any 350ms debounce timer fires
    hook1.unmount();

    expect(localStorage.getItem("paayh_draft_ad_v2:alice@brand.com")).toBeTruthy();

    // 2. Bob mounts and must NOT see Alice's draft
    const bobHook = mountHook((email: string) => useAdFormDraftAndEdit(email), "bob@other.com");
    await bobHook.act();
    expect(bobHook.current.step).toBe(0);
    expect(bobHook.current.formSelections.adContent).toBe("");
    expect(bobHook.current.formSelections.adMediaFiles).toHaveLength(0);
    bobHook.unmount();

    // 3. Alice returns: step, adType, bidPrice, adContent, and adMediaFiles all restore
    const hook2 = mountHook((email: string) => useAdFormDraftAndEdit(email), "alice@brand.com");
    await hook2.act();
    expect(hook2.current.step).toBe(3);
    expect(hook2.current.adType).toBe("business");
    expect(hook2.current.isBiddingEnabled).toBe(true);
    expect(hook2.current.bidPrice).toBe(420);
    expect(hook2.current.formSelections.adContent).toBe("Resume right where Alice left off");
    expect(hook2.current.formSelections.adMediaFiles).toHaveLength(1);
    expect(hook2.current.formSelections.adMediaFiles[0].name).toBe("campaign-banner.png");

    // 3b. Entering edit mode and calling exitEditMode() restores draft fields AND adMediaFiles without stale editingId cancellation
    await hook2.act(() => {
      mockWindow.dispatchEvent({ type: "paayh_edit_ad", detail: { adId: "ad-edit-999" } });
    });
    expect(hook2.current.editingId).toBe("ad-edit-999");
    expect(hook2.current.formSelections.adContent).toBe("Editing Existing Campaign");
    expect(hook2.current.formSelections.adMediaFiles).toHaveLength(0);

    await hook2.act(() => {
      hook2.current.exitEditMode();
    });
    expect(hook2.current.editingId).toBeNull();
    expect(hook2.current.step).toBe(3);
    expect(hook2.current.adType).toBe("business");
    expect(hook2.current.bidPrice).toBe(420);
    expect(hook2.current.formSelections.adContent).toBe("Resume right where Alice left off");
    expect(hook2.current.formSelections.adMediaFiles).toHaveLength(1);
    expect(hook2.current.formSelections.adMediaFiles[0].name).toBe("campaign-banner.png");

    // 4. Explicit resetForm clears ALL fields and deletes saved draft + media
    await hook2.act(() => {
      hook2.current.resetForm();
    });
    expect(hook2.current.step).toBe(0);
    expect(hook2.current.adType).toBe("politics");
    expect(hook2.current.isBiddingEnabled).toBe(false);
    expect(hook2.current.bidPrice).toBe(0);
    expect(hook2.current.formSelections.adContent).toBe("");
    expect(localStorage.getItem("paayh_draft_ad_v2:alice@brand.com")).toBeNull();

    // 5. Submit clearDraft(true) prevents unmount from resurrecting draft
    await hook2.act(() => {
      hook2.current.setStep(4);
      hook2.current.setFormSelections((prev) => ({ ...prev, adContent: "Submitted ad" }));
    });
    await hook2.act(() => {
      hook2.current.clearDraft(true);
    });
    hook2.unmount();
    expect(localStorage.getItem("paayh_draft_ad_v2:alice@brand.com")).toBeNull();
  }, 15000);

  it("Req #4: useNewsComposer flushes scheduledStartAt + mediaFile + preview before debounce, preserves bidPrice across interest highestBid fetch, and clears on discardDraft", async () => {
    const { localStorage } = installBrowserGlobals();
    const fetchMock = vi.fn(async (input: string) => {
      if (input.includes("/api/highlights?highestBid=true")) {
        return {
          ok: true,
          json: async () => ({ highestBid: 2500 }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((f: File) => `blob:mock/${f.name}`),
      revokeObjectURL: vi.fn(),
    });
    vi.doMock("@/lib/utils/db", () => ({
      default: { storage: { from: () => ({}) } },
    }));
    vi.doMock("@/components/ui/AppleAlert", () => ({
      showAppleAlert: vi.fn(),
    }));
    vi.doMock("@/lib/validationSchemas", () => ({
      newsSchema: { safeParse: () => ({ success: true }) },
    }));
    vi.doMock("@/lib/adminHelper", () => ({
      isAdminEmail: () => false,
    }));
    vi.doMock("@/lib/utils/currency", () => import("../utils/currency"));
    vi.doMock("@/lib/utils/mediaOptimizer", () => ({
      resizeImageToMax1080p: async (f: File) => f,
    }));
    vi.doMock("@/lib/campaignsClient", () => ({
      clearUserCampaignsCache: vi.fn(),
    }));

    const { _resetDraftMediaMemoryCacheForTests } = await import("../utils/composerDraftStorage");
    _resetDraftMediaMemoryCacheForTests();

    const { useNewsComposer } = await import("../../components/News/useNewsComposer");
    const aliceSession = { user: { email: "Alice@News.io", name: "Alice" } };

    // 1. User selects interest (auto-bumps initially), then sets custom bidPrice 1850, scheduledStartAt, and mediaFile, and unmounts immediately
    const hlHook1 = mountHook(() => useNewsComposer(aliceSession), undefined);
    await hlHook1.act();
    const coverFile = new File(["cover-bytes"], "cover.webp", { type: "image/webp" });
    await hlHook1.act(() => {
      hlHook1.current.setStep(3);
      hlHook1.current.setTitle("Breaking Story");
      hlHook1.current.setContent("Detailed story body with enough text.");
      hlHook1.current.setScheduledStartAt("2026-12-15");
      hlHook1.current.setIsBiddingEnabled(true);
      hlHook1.current.setInterest("Tech");
      hlHook1.current.setMediaFile(coverFile);
      hlHook1.current.setMediaPreview("data:image/webp;base64,AAAA");
    });
    await hlHook1.act(() => {
      hlHook1.current.setBidPrice(1850);
    });
    hlHook1.unmount();

    // 2. Remount: restored draft keeps bidPrice 1850 even though highestBid endpoint returns 2500
    const hlHook2 = mountHook(() => useNewsComposer(aliceSession), undefined);
    await hlHook2.act();
    expect(hlHook2.current.highestBid).toBe(2500);
    expect(hlHook2.current.step).toBe(3);
    expect(hlHook2.current.title).toBe("Breaking Story");
    expect(hlHook2.current.scheduledStartAt).toBe("2026-12-15");
    expect(hlHook2.current.isBiddingEnabled).toBe(true);
    expect(hlHook2.current.bidPrice).toBe(1850);
    expect(hlHook2.current.mediaFile?.name).toBe("cover.webp");
    expect(hlHook2.current.mediaPreview).toBe("blob:mock/cover.webp");

    // 3. Actively changing interest to Finance DOES auto-bump bidPrice above highestBid (2500 + 200)
    await hlHook2.act(() => {
      hlHook2.current.setInterest("Finance");
    });
    expect(hlHook2.current.bidPrice).toBe(2700);

    // 4. discardDraft wipes storage, media, and resets form state
    await hlHook2.act(() => {
      hlHook2.current.discardDraft();
    });
    expect(hlHook2.current.step).toBe(0);
    expect(hlHook2.current.title).toBe("");
    expect(hlHook2.current.scheduledStartAt).toBe("");
    expect(hlHook2.current.mediaFile).toBeNull();
    expect(localStorage.getItem("paayh_draft_news_v2:alice@news.io")).toBeNull();
    hlHook2.unmount();
  }, 15000);
});
