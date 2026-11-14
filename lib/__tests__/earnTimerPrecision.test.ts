import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function makeJsonReq(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Per-card 16s mandatory + optional 16s bonus timer tightening", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("POST /api/feed/view-start is stateless with zero Redis RAM, clamps debounceMs <= 2500ms, and mints valid HMAC viewToken", async () => {
    const redisSetSpy = vi.fn(async () => "OK");
    const redisGetSpy = vi.fn(async () => null);
    const getSessionSpy = vi.fn(async () => ({ user: { sub: "auth0|123" } }));

    vi.doMock("@/lib/redis", () => ({
      isRedisReady: () => true,
      default: {
        set: redisSetSpy,
        get: redisGetSpy,
      },
    }));
    vi.doMock("@/lib/edgeRateLimit", () => ({
      checkRateLimit: vi.fn(async () => ({ allowed: true })),
    }));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn(async () => "earner@paayh.com"),
    }));
    vi.doMock("@/lib/auth0", () => ({
      auth0: { getSession: getSessionSpy },
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NODE_ENV: "test", AUTH0_SECRET: "test-secret" },
    }));

    const { signAdImpressionToken, verifyHmacSignature, getEarnTokenSecret } = await import("../targetingEngine");
    const adId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const servedAt = Date.now() - 10000;
    const token = signAdImpressionToken(adId, "earner@paayh.com", servedAt);

    const { POST } = await import("../../app/api/feed/view-start/route");

    // Bad token is rejected
    const badRes = await POST(
      makeJsonReq("http://localhost:3000/api/feed/view-start", {
        adId,
        token: "0".repeat(64),
        servedAt,
      })
    );
    expect(badRes.status).toBe(403);
    getSessionSpy.mockClear();

    // Valid batch token mints stateless viewToken with zero Redis calls and no redundant Auth0 cookie decryption
    const okRes = await POST(
      makeJsonReq("http://localhost:3000/api/feed/view-start", { adId, token, servedAt })
    );
    expect(okRes.status).toBe(200);
    const okJson = await okRes.json();
    expect(okJson.success).toBe(true);
    expect(typeof okJson.viewStartedAt).toBe("number");
    expect(okJson.viewToken).toMatch(/^[0-9a-f]{64}$/);
    expect(redisSetSpy).not.toHaveBeenCalled();
    expect(redisGetSpy).not.toHaveBeenCalled();
    expect(getSessionSpy).not.toHaveBeenCalled();

    // Debounce compensation is strictly server-capped to 2500ms and never precedes servedAt
    const beforeCall = Date.now();
    const debouncedRes = await POST(
      makeJsonReq("http://localhost:3000/api/feed/view-start", {
        adId,
        token,
        servedAt,
        debounceMs: 60000, // spoofed 60s -> must clamp to 2500ms
      })
    );
    expect(debouncedRes.status).toBe(200);
    const debouncedJson = await debouncedRes.json();
    expect(debouncedJson.viewStartedAt).toBeGreaterThanOrEqual(beforeCall - 2600);
    expect(debouncedJson.viewStartedAt).toBeLessThanOrEqual(Date.now() - 2400);
    expect(debouncedJson.viewStartedAt).toBeGreaterThanOrEqual(servedAt);
    expect(
      verifyHmacSignature(
        [`view:${adId}:earner@paayh.com:${debouncedJson.viewStartedAt}:${servedAt}`],
        debouncedJson.viewToken,
        [getEarnTokenSecret()]
      )
    ).toBe(true);
    expect(redisSetSpy).not.toHaveBeenCalled();
    expect(redisGetSpy).not.toHaveBeenCalled();
  });

  it("validateEarnSecurityAndPoh rejects missing/forged/too-short viewToken even when batch servedAt is old", async () => {
    const store = new Map<string, string>();
    vi.doMock("@/lib/redis", () => ({
      isRedisReady: () => true,
      default: {
        get: vi.fn(async (k: string) => store.get(k) ?? null),
        set: vi.fn(async (k: string, v: string, ...args: string[]) => {
          if (args.includes("NX") && store.has(k)) return null;
          store.set(k, v);
          return "OK";
        }),
        exists: vi.fn(async (k: string) => (store.has(k) ? 1 : 0)),
        del: vi.fn(async (k: string) => {
          store.delete(k);
          return 1;
        }),
        incr: vi.fn(async () => 1),
        expire: vi.fn(async () => 1),
      },
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NODE_ENV: "test", AUTH0_SECRET: "test-secret" },
    }));
    vi.doMock("@/lib/security/kinematicsEvaluator", () => ({
      evaluateKinematics: vi.fn(() => ({ isHuman: true, score: 0, reasons: [] })),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn(async () => null),
      setCachedProfile: vi.fn(async () => {}),
    }));

    const { signAdImpressionToken, signAdViewStartToken } = await import("../targetingEngine");
    const { validateEarnSecurityAndPoh } = await import("../earn/pohValidator");

    const email = "earner@paayh.com";
    const adId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const servedAt = Date.now() - 60000; // Old batch timestamp (60s ago)
    const token = signAdImpressionToken(adId, email, servedAt);
    const telemetry = [{ x: 12, y: 20, t: 150, p: 0.5 }];

    // 1. Missing viewToken / viewStartedAt -> 403 VIEW_START_REQUIRED
    const missing = await validateEarnSecurityAndPoh({
      adId,
      type: "earn",
      emailKey: email,
      rawEmail: email,
      userId: "auth0|1",
      token,
      servedAt,
      telemetry,
      bonusSecondsInput: 16,
    });
    expect(missing.errorResponse?.status).toBe(403);

    // 2. Forged viewToken -> 403
    const forged = await validateEarnSecurityAndPoh({
      adId,
      type: "earn",
      emailKey: email,
      rawEmail: email,
      userId: "auth0|1",
      token,
      servedAt,
      viewStartedAt: Date.now() - 20000,
      viewToken: "f".repeat(64),
      telemetry,
      bonusSecondsInput: 0,
    });
    expect(forged.errorResponse?.status).toBe(403);

    // 3. Real viewStartedAt only 5s ago -> 400 (cannot ride 60s batch servedAt!)
    const tooShortTs = Date.now() - 5000;
    const tooShort = await validateEarnSecurityAndPoh({
      adId,
      type: "earn",
      emailKey: email,
      rawEmail: email,
      userId: "auth0|1",
      token,
      servedAt,
      viewStartedAt: tooShortTs,
      viewToken: signAdViewStartToken(adId, email, tooShortTs, servedAt),
      telemetry,
      bonusSecondsInput: 16,
    });
    expect(tooShort.errorResponse?.status).toBe(400);
  });

  it("enforces mandatory 16s base payout (30% immediately when optional 2nd 16s is skipped) and anchors bonus percentage to lastEarnAt", async () => {
    const store = new Map<string, string>();
    const setSpy = vi.fn(async (k: string, v: string, ...args: string[]) => {
      if (args.includes("NX") && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    });
    vi.doMock("@/lib/redis", () => ({
      isRedisReady: () => true,
      default: {
        get: vi.fn(async (k: string) => store.get(k) ?? null),
        set: setSpy,
        exists: vi.fn(async (k: string) => (store.has(k) ? 1 : 0)),
        del: vi.fn(async (k: string) => {
          store.delete(k);
          return 1;
        }),
        incr: vi.fn(async () => 1),
        expire: vi.fn(async () => 1),
      },
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NODE_ENV: "test", AUTH0_SECRET: "test-secret" },
    }));
    vi.doMock("@/lib/security/kinematicsEvaluator", () => ({
      evaluateKinematics: vi.fn(() => ({ isHuman: true, score: 0, reasons: [] })),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn(async () => null),
      setCachedProfile: vi.fn(async () => {}),
    }));

    const { signAdImpressionToken, signAdViewStartToken } = await import("../targetingEngine");
    const { validateEarnSecurityAndPoh } = await import("../earn/pohValidator");

    const email = "earner@paayh.com";
    const servedAt = Date.now() - 45000;

    // A. Claiming right after 16s mandatory (bonusSeconds=0) yields 30% immediately
    const adA = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const startA = Date.now() - 16500;
    const resA = await validateEarnSecurityAndPoh({
      adId: adA,
      type: "earn",
      emailKey: email,
      rawEmail: email,
      userId: "auth0|1",
      token: signAdImpressionToken(adA, email, servedAt),
      servedAt,
      viewStartedAt: startA,
      viewToken: signAdViewStartToken(adA, email, startA, servedAt),
      telemetry: [{ x: 1, y: 2, t: 100, p: 0.5 }],
      bonusSecondsInput: 0,
    });
    expect(resA.errorResponse).toBeUndefined();
    expect(resA.bonusSeconds).toBe(0);
    expect(resA.attentionSharePercent).toBeCloseTo(0.3, 5);

    // Clear pace & burn keys to test sequential lastEarnAt clamping on Ad B
    store.clear();
    store.set(`user:last_earn_at:${email}`, String(Date.now() - 16500));

    // B. Ad B was pre-started 40s ago, but user finished Ad A only 16.5s ago.
    // Spoofing bonusSeconds=16 must be clamped down to serverMaxBonusSeconds=0 -> 30%!
    const adB = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const prefetchedStartB = Date.now() - 40000;
    const resB = await validateEarnSecurityAndPoh({
      adId: adB,
      type: "earn",
      emailKey: email,
      rawEmail: email,
      userId: "auth0|1",
      token: signAdImpressionToken(adB, email, servedAt),
      servedAt,
      viewStartedAt: prefetchedStartB,
      viewToken: signAdViewStartToken(adB, email, prefetchedStartB, servedAt),
      telemetry: [{ x: 3, y: 4, t: 200, p: 0.5 }],
      bonusSecondsInput: 16,
    });
    expect(resB.errorResponse).toBeUndefined();
    expect(resB.bonusSeconds).toBe(0);
    expect(resB.attentionSharePercent).toBeCloseTo(0.3, 5);

    // C. Genuinely watching 32.5s after BOTH viewStartedAt and lastEarnAt awards full 50% (16s bonus)
    store.clear();
    store.set(`user:last_earn_at:${email}`, String(Date.now() - 35000));
    const adC = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const startC = Date.now() - 32500;
    const resC = await validateEarnSecurityAndPoh({
      adId: adC,
      type: "earn",
      emailKey: email,
      rawEmail: email,
      userId: "auth0|1",
      token: signAdImpressionToken(adC, email, servedAt),
      servedAt,
      viewStartedAt: startC,
      viewToken: signAdViewStartToken(adC, email, startC, servedAt),
      telemetry: [{ x: 5, y: 6, t: 300, p: 0.5 }],
      bonusSecondsInput: 16,
    });
    expect(resC.errorResponse).toBeUndefined();
    expect(resC.bonusSeconds).toBe(16);
    expect(resC.attentionSharePercent).toBeCloseTo(0.5, 5);

    // Assert telemetry replay key uses 35-minute TTL (2100s), never 24h (86400s)
    expect(setSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^used:telemetry:earner@paayh\.com:/),
      "1",
      "EX",
      2100,
      "NX"
    );
  });

  it("enforces 2.5s scroll debounce on web/mobile cards, stateless Edge view_start, and 500M-scale sharded agent commission migration", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");

    const webHandler = fs
      .readFileSync(path.join(process.cwd(), "components", "ui", "AdInteractionHandler.tsx"), "utf8")
      .replace(/\r\n/g, "\n");
    expect(webHandler).toContain("const VIEW_START_DEBOUNCE_MS = 2500");
    expect(webHandler).toContain("setTimeout(() => {\n      void ensureViewStarted(VIEW_START_DEBOUNCE_MS);");
    expect(webHandler).toContain("[ad.id, isPlatformPost, isOwner, inView, tabVisible, ensureViewStarted]");

    const mobileCardPath = "C:\\Users\\USER\\Desktop\\xea-mobile\\components\\feed\\FeedAdCard.tsx";
    if (fs.existsSync(mobileCardPath)) {
      const mobileCard = fs.readFileSync(mobileCardPath, "utf8");
      expect(mobileCard).toContain("const VIEW_START_DEBOUNCE_MS = 2500");
      expect(mobileCard).toContain("void ensureViewStarted(VIEW_START_DEBOUNCE_MS)");
      expect(mobileCard).toContain("[ad.id, isOwner, isPlatformAd, isActive, appActive]");
    }

    const migrationSql = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "20261114170000_500m_scale_sharded_agent_commissions_and_indexes.sql"
      ),
      "utf8"
    );
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.agent_commission_shards");
    expect(migrationSql).toContain("pg_try_advisory_xact_lock(hashtext('agent_yield_' || v_agent_email))");
    expect(migrationSql).toContain("abs(hashtext(v_earner_email)) % 64");
    expect(migrationSql).toContain("CREATE INDEX IF NOT EXISTS idx_users_lower_email_raw");
    expect(migrationSql).toContain("CREATE INDEX IF NOT EXISTS idx_addsactive_country_trgm");
    expect(migrationSql).toContain("WHERE id = v_earner_id");
    expect(migrationSql).toContain("WHERE id = v_agent_id");
    expect(migrationSql).toContain("column_name = 'completed_at'");
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.flush_agent_commission_shards_atomic(TEXT, INT) TO service_role;");
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.apply_agent_commission_atomic(TEXT, NUMERIC, UUID) TO service_role;");

    const affiliateFlagMigration = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "20261114180000_fix_claim_ad_earning_affiliate_credited.sql"
      ),
      "utf8"
    );
    expect(affiliateFlagMigration).toContain("'affiliate_credited', v_affiliate_credited");

    const profileRoute = fs.readFileSync(
      path.join(process.cwd(), "app", "api", "profile", "route.ts"),
      "utf8"
    );
    expect(profileRoute).toContain("is_agent, agent_invites_count, agent_total_earned");
    expect(profileRoute).toContain("user.is_agent || Number(user.agent_invites_count || 0) > 0");

    const mobileEdgePath = "C:\\Users\\USER\\Desktop\\xea-mobile\\supabase\\functions\\earn-payout\\index.ts";
    if (fs.existsSync(mobileEdgePath)) {
      const mobileEdge = fs.readFileSync(mobileEdgePath, "utf8");
      expect(mobileEdge).toContain("rpcResult.net_credited ?? rpcResult.credited ?? rpcResult.amount ?? rpcResult.result");
      expect(mobileEdge).toContain("!rpcResult.affiliate_credited && netCredited > 0");
      expect(mobileEdge).toContain("balance: finalBalance");
    }

    if (fs.existsSync(mobileCardPath)) {
      const mobileCard = fs.readFileSync(mobileCardPath, "utf8");
      expect(mobileCard).toContain("else if (result?.success)");
    }
  });

  it("validateEarnSecurityAndPoh skips resolveLegacyUserId on fast-path emailKey tokens and falls back lazily for legacy sub tokens", async () => {
    vi.resetModules();
    const store = new Map<string, string>();
    vi.doMock("@/lib/env", () => ({
      env: { NODE_ENV: "test", AUTH0_SECRET: "test-secret" },
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {
        get: vi.fn(async (k: string) => store.get(k) ?? null),
        set: vi.fn(async (k: string, v: string) => {
          store.set(k, v);
          return "OK";
        }),
      },
      isRedisReady: () => true,
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn(async () => ({})),
      setCachedProfile: vi.fn(async () => {}),
    }));
    vi.doMock("@/lib/security/kinematicsEvaluator", () => ({
      evaluateKinematics: vi.fn(() => ({ isHuman: true, score: 5, reasons: [] })),
    }));

    const { validateEarnSecurityAndPoh } = await import("../earn/pohValidator");
    const { signAdImpressionToken, signAdViewStartToken } = await import("../targetingEngine");

    const email = "fastpath@paayh.com";
    const servedAt = Date.now() - 40000;
    const viewStartedAt = Date.now() - 20000;

    // 1. Fast-path emailKey tokens must NOT invoke resolveLegacyUserId
    const ad1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
    const resolveSpy1 = vi.fn(async () => "auth0|legacy-1");
    const res1 = await validateEarnSecurityAndPoh({
      adId: ad1,
      type: "earn",
      emailKey: email,
      rawEmail: email,
      resolveLegacyUserId: resolveSpy1,
      token: signAdImpressionToken(ad1, email, servedAt),
      servedAt,
      viewStartedAt,
      viewToken: signAdViewStartToken(ad1, email, viewStartedAt, servedAt),
      telemetry: [{ x: 1, y: 2, t: 100, p: 0.5 }],
      bonusSecondsInput: 0,
    });
    expect(res1.errorResponse).toBeUndefined();
    expect(resolveSpy1).not.toHaveBeenCalled();

    // 2. Legacy auth0|sub tokens still succeed via lazy resolveLegacyUserId fallback
    store.clear();
    const ad2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2";
    const resolveSpy2 = vi.fn(async () => "auth0|legacy-2");
    const res2 = await validateEarnSecurityAndPoh({
      adId: ad2,
      type: "earn",
      emailKey: email,
      rawEmail: email,
      resolveLegacyUserId: resolveSpy2,
      token: signAdImpressionToken(ad2, "auth0|legacy-2", servedAt),
      servedAt,
      viewStartedAt,
      viewToken: signAdViewStartToken(ad2, "auth0|legacy-2", viewStartedAt, servedAt),
      telemetry: [{ x: 2, y: 3, t: 150, p: 0.5 }],
      bonusSecondsInput: 0,
    });
    expect(res2.errorResponse).toBeUndefined();
    expect(resolveSpy2).toHaveBeenCalledTimes(1);
  });
});
