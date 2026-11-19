import { describe, it, expect, vi, beforeEach } from "vitest";
import { encryptSensitiveField } from "../security/piiCrypto";

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn().mockResolvedValue(1),
  eval: vi.fn(),
  mget: vi.fn().mockResolvedValue([]),
  pipeline: vi.fn(() => ({
    del: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
};

let mockRedisReady = true;

vi.mock("../redis", () => ({
  default: mockRedis,
  redisConnection: mockRedis,
  isRedisReady: () => mockRedisReady,
  scanDeletePattern: vi.fn().mockResolvedValue(undefined),
}));

const mockCacheInvalidateProfile = vi.fn().mockResolvedValue(undefined);
const mockEvictL1Feed = vi.fn();
const mockInvalidateAllHighlights = vi.fn().mockResolvedValue(undefined);
const mockInvalidateUserCampaigns = vi.fn().mockResolvedValue(undefined);

vi.mock("../utils/cache", () => ({
  invalidateCachedProfile: mockCacheInvalidateProfile,
  evictAdFromL1FeedCaches: mockEvictL1Feed,
  invalidateAllHighlights: mockInvalidateAllHighlights,
  invalidateCachedUserCampaigns: mockInvalidateUserCampaigns,
}));

vi.mock("../agentSystem", () => ({
  getAgentNetworkData: vi.fn().mockResolvedValue({ invitesCount: 0, invites: [] }),
  checkIsUserAgent: vi.fn().mockResolvedValue({
    isAgent: false,
    isBanned: false,
    bannedUntil: null,
    banReason: null,
    registeredAt: null,
  }),
  registerUserAsAgent: vi.fn().mockResolvedValue(undefined),
  setAgentBan: vi.fn().mockResolvedValue(undefined),
  removeAllAgentFollowers: vi.fn().mockResolvedValue(undefined),
}));

const dbLog: Array<{ table: string; op: string; data?: any }> = [];
let mockDbHandlers: Record<string, (op: string, payload?: any) => any> = {};
const mockRpc = vi.fn();

function makeChain(table: string) {
  const chain: any = {
    _op: "select",
    _payload: undefined,
    select: vi.fn(() => chain),
    insert: vi.fn((data: any) => {
      chain._op = "insert";
      chain._payload = data;
      dbLog.push({ table, op: "insert", data });
      return chain;
    }),
    update: vi.fn((data: any) => {
      chain._op = "update";
      chain._payload = data;
      dbLog.push({ table, op: "update", data });
      return chain;
    }),
    upsert: vi.fn((data: any) => {
      chain._op = "upsert";
      chain._payload = data;
      dbLog.push({ table, op: "upsert", data });
      return chain;
    }),
    delete: vi.fn(() => {
      chain._op = "delete";
      dbLog.push({ table, op: "delete" });
      return chain;
    }),
    eq: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    in: vi.fn(() => chain),
    not: vi.fn(() => chain),
    or: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(resolveDb(table, chain._op, chain._payload))),
    maybeSingle: vi.fn(() => Promise.resolve(resolveDb(table, chain._op, chain._payload))),
    then: (resolve: any, reject?: any) =>
      Promise.resolve(resolveDb(table, chain._op, chain._payload)).then(resolve, reject),
  };
  return chain;
}

function resolveDb(table: string, op: string, payload?: any) {
  if (op === "select") {
    dbLog.push({ table, op: "select" });
  }
  const handler = mockDbHandlers[table];
  if (handler) return handler(op, payload);
  return { data: null, error: null };
}

const mockSupabase = {
  from: vi.fn((table: string) => makeChain(table)),
  rpc: (...args: any[]) => mockRpc(...args),
};

vi.mock("../utils/dbAdmin", () => ({
  default: mockSupabase,
  supabaseReadOnly: mockSupabase,
}));

describe("Admin Security, Queries & Cache Fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbLog.length = 0;
    mockDbHandlers = {};
    mockRedisReady = true;
  });

  it("checkAdminVelocityLimit uses atomic Redis Lua and enforces limits", async () => {
    const { checkAdminVelocityLimit } = await import("../security/adminGuard");
    mockRedis.eval.mockResolvedValueOnce([1, "OK", "20000", "1"]);
    const ok = await checkAdminVelocityLimit("admin@paayh.com", 20000);
    expect(ok.allowed).toBe(true);
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);

    mockRedis.eval.mockResolvedValueOnce([0, "DAILY_LIMIT", "190000", "2"]);
    const blocked = await checkAdminVelocityLimit("admin@paayh.com", 20000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("daily velocity limit");
  });

  it("checkAdminVelocityLimit falls back to PostgreSQL audit logs when Redis is offline (never fails open)", async () => {
    const { checkAdminVelocityLimit } = await import("../security/adminGuard");
    mockRedisReady = false;

    const recentIso = new Date().toISOString();
    mockDbHandlers["admin_audit_logs"] = () => ({
      data: [
        {
          action: "adjust_user_balance",
          created_at: recentIso,
          previous_state: { balance: 0 },
          new_state: { balance: 195000 },
        },
      ],
      error: null,
    });

    const res = await checkAdminVelocityLimit("admin@paayh.com", 10000);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("daily velocity limit");

    // If DB also fails, it MUST fail closed
    mockDbHandlers["admin_audit_logs"] = () => ({ data: null, error: { message: "DB timeout" } });
    const closed = await checkAdminVelocityLimit("admin@paayh.com", 1000);
    expect(closed.allowed).toBe(false);
  });

  it("handleGetUserDetails queries payments (not financial_statements), strips secret hashes, decrypts PII, and sets campaign counts", async () => {
    const { handleGetUserDetails } = await import("../admin/adminUsersQueryHandlers");

    const encFirst = encryptSensitiveField("Ada");
    const encLast = encryptSensitiveField("Lovelace");
    const encPhone = encryptSensitiveField("+2348012345678");

    mockDbHandlers["users"] = () => ({
      data: [
        {
          id: "u-1",
          email: "ada@example.com",
          username: "ada",
          firstName: encFirst,
          lastName: encLast,
          phone: encPhone,
          passphrase: "hash:v1:secret-passphrase",
          wallet_pin_hash: "pin:v1:salt:secret-pin",
          bvn_hash: "bvn-secret-hash",
          nin_hash: "nin-secret-hash",
        },
      ],
      error: null,
    });
    mockDbHandlers["payments"] = () => ({
      data: [{ id: "p-1", amount: 5000, type: "earn", status: "success" }],
      error: null,
    });
    mockDbHandlers["addsactive"] = () => ({
      data: [{ id: "ad-1", impression_count: 120, mutual_adds_count: 5 }],
      error: null,
    });
    mockDbHandlers["adds"] = () => ({ data: [{ id: "ad-2" }], error: null });
    mockDbHandlers["news"] = () => ({ data: [], error: null });
    mockDbHandlers["newsactive"] = () => ({ data: [{ id: "hl-1" }], error: null });
    mockDbHandlers["referrals"] = () => ({ data: [], error: null });

    const res = await handleGetUserDetails(new URLSearchParams({ userId: "u-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();

    // Must never query non-existent financial_statements table
    expect(dbLog.some((e) => e.table === "financial_statements")).toBe(false);
    expect(dbLog.some((e) => e.table === "payments")).toBe(true);

    // Must decrypt PII & strip all secret hashes
    expect(json.user.firstName).toBe("Ada");
    expect(json.user.lastName).toBe("Lovelace");
    expect(json.user.phone).toBe("+2348012345678");
    expect(json.user.passphrase).toBeUndefined();
    expect(json.user.wallet_pin_hash).toBeUndefined();
    expect(json.user.bvn_hash).toBeUndefined();
    expect(json.user.nin_hash).toBeUndefined();

    // Must attach campaign counts and statement rows
    expect(json.statement).toHaveLength(1);
    expect(json.user.activeAdsCount).toBe(1);
    expect(json.user.reviewAdsCount).toBe(1);
    expect(json.user.activeHighlightsCount).toBe(1);
    expect(json.user.totalClicksOnAds).toBe(125);
  });

  it("blocks banning, suspending, deactivating, or deleting admin accounts", async () => {
    const {
      handleSuspendUser,
      handleDeleteUser,
      handleAdAccountAction,
      handleDeactivateAccount,
    } = await import("../admin/adminUserSecurityActions");

    mockDbHandlers["users"] = () => ({
      data: { id: "admin-1", email: "admin@paayh.com", username: "admin" },
      error: null,
    });

    const s = await handleSuspendUser("nonsom019@gmail.com", "admin-1", { suspendedUntil: null });
    expect(s.status).toBe(403);

    const d = await handleDeleteUser("nonsom019@gmail.com", "admin-1");
    expect(d.status).toBe(403);

    const b = await handleAdAccountAction("nonsom019@gmail.com", "admin-1", {
      adStatus: "perm_banned",
      banReason: "test",
    });
    expect(b.status).toBe(403);

    const deact = await handleDeactivateAccount("nonsom019@gmail.com", "admin-1", {
      deactivated: true,
    });
    expect(deact.status).toBe(403);
  });

  it("handleAdAccountAction(active) clears perm_banned, deactivated, AND revoked_before in Redis", async () => {
    const { handleAdAccountAction } = await import("../admin/adminUserSecurityActions");

    mockDbHandlers["users"] = () => ({
      data: { id: "u-2", email: "user@example.com", ad_account_status: "perm_banned" },
      error: null,
    });

    const res = await handleAdAccountAction("admin@paayh.com", "u-2", { adStatus: "active" });
    expect(res.status).toBe(200);
    expect(mockRedis.del).toHaveBeenCalledWith("perm_banned:user@example.com");
    expect(mockRedis.del).toHaveBeenCalledWith("deactivated:user@example.com");
    expect(mockRedis.del).toHaveBeenCalledWith("revoked_before:user@example.com");
  });

  it("handleAdjustUserBalance queues dual approval with BOTH new_balance and newBalance and HTTP 202 for > ₦50,000", async () => {
    const { handleAdjustUserBalance } = await import("../admin/adminUserSecurityActions");

    mockRedis.eval.mockResolvedValueOnce([1, "OK", "60000", "1"]);
    mockDbHandlers["users"] = () => ({
      data: { id: "u-3", email: "big@example.com", balance: 10000 },
      error: null,
    });
    mockDbHandlers["pending_admin_requests"] = (op) => {
      if (op === "insert") return { data: { id: "req-123" }, error: null };
      return { data: null, error: null };
    };

    const res = await handleAdjustUserBalance("admin@paayh.com", "u-3", {
      delta: 60000,
      newBalance: 70000,
      reason: "Large refund",
    });

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.requiresDualApproval).toBe(true);

    const insertCall = dbLog.find((e) => e.table === "pending_admin_requests" && e.op === "insert");
    expect(insertCall).toBeDefined();
    const row = Array.isArray(insertCall?.data) ? insertCall?.data[0] : insertCall?.data;
    expect(row.payload.new_balance).toBe(70000);
    expect(row.payload.newBalance).toBe(70000);
    expect(row.payload.delta).toBe(60000);
  });

  it("handleResetClicks and handleToggleMonetization clear live Redis click/monetize caches", async () => {
    const { handleResetClicks, handleToggleMonetization } = await import("../admin/adminUserRoleActions");

    mockDbHandlers["users"] = () => ({
      data: { id: "u-4", email: "earner@example.com", monetization_clicks: 490, monetized: "no" },
      error: null,
    });

    const r1 = await handleResetClicks("admin@paayh.com", "u-4", { clicks: 0 });
    expect(r1.status).toBe(200);
    expect(mockRedis.del).toHaveBeenCalledWith("user:live_clicks:v2:earner@example.com");
    expect(mockRedis.del).toHaveBeenCalledWith("monetize:status:v2:earner@example.com");

    mockRedis.del.mockClear();
    const r2 = await handleToggleMonetization("admin@paayh.com", "u-4", {
      nextMonetizedVal: "yes",
      isCurrentlyMonetized: false,
    });
    expect(r2.status).toBe(200);
    expect(mockRedis.del).toHaveBeenCalledWith("monetize:status:v2:earner@example.com");
    const userUpdate = dbLog.find(
      (e) => e.table === "users" && e.op === "update" && e.data?.monetized === "yes"
    );
    expect(userUpdate?.data?.has_cancelled_monetization).toBe(false);
  });

  it("handleUpdateUserProfile encrypts PII fields and updates phone_hash", async () => {
    const { handleUpdateUserProfile } = await import("../admin/adminUserRoleActions");

    mockDbHandlers["users"] = () => ({
      data: { id: "u-5", email: "edit@example.com", firstName: "Old", phone: "0800" },
      error: null,
    });

    const res = await handleUpdateUserProfile("admin@paayh.com", "u-5", {
      firstName: "Grace",
      lastName: "Hopper",
      phone: "+2348099998888",
    });
    expect(res.status).toBe(200);

    const upd = dbLog.find((e) => e.table === "users" && e.op === "update");
    expect(String(upd?.data?.firstName)).toMatch(/^enc:v1:/);
    expect(String(upd?.data?.lastName)).toMatch(/^enc:v1:/);
    expect(String(upd?.data?.phone)).toMatch(/^enc:v1:/);
    expect(typeof upd?.data?.phone_hash).toBe("string");
    expect(upd?.data?.phone_hash.length).toBeGreaterThan(20);
  });

  it("ALLOWED_DIRECT_AD_FIELDS excludes non-existent columns and permits real addsactive columns", async () => {
    const { ALLOWED_DIRECT_AD_FIELDS, ALLOWED_AD_EDIT_FIELDS } = await import(
      "../admin/adminCampaignShared"
    );
    const directSet = new Set<string>(ALLOWED_DIRECT_AD_FIELDS);
    const editSet = new Set<string>(ALLOWED_AD_EDIT_FIELDS);

    for (const invalidCol of [
      "headline",
      "content",
      "cta_link",
      "cta_button_text",
      "media_url",
      "impressions_remaining",
    ]) {
      expect(directSet.has(invalidCol)).toBe(false);
      expect(editSet.has(invalidCol)).toBe(false);
    }

    for (const validCol of [
      "ad_content",
      "ad_media",
      "ad_media_url",
      "industry",
      "interest",
      "targeting_all",
      "employment_status",
    ]) {
      expect(directSet.has(validCol)).toBe(true);
      expect(editSet.has(validCol)).toBe(true);
    }
  });
});
