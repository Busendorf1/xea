import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isHighlightCurrentlyActive,
  sortHighlightsByBidAndRecency,
  formatHighlightInterests,
} from "../highlights/highlightLifecycle";

describe("Highlight Lifecycle, Expiry & Bidding Order", () => {
  const now = new Date("2026-11-12T12:00:00Z").getTime();

  it("filters out expired, paused, rejected, and future-scheduled highlights", () => {
    expect(
      isHighlightCurrentlyActive(
        {
          id: "h-active",
          created_at: "2026-11-12T00:00:00Z",
          expires_at: "2026-11-13T00:00:00Z",
          campaign_days: 1,
        },
        now,
      ),
    ).toBe(true);

    expect(
      isHighlightCurrentlyActive(
        {
          id: "h-expired-explicit",
          created_at: "2026-11-10T00:00:00Z",
          expires_at: "2026-11-12T11:59:59Z",
          campaign_days: 7,
        },
        now,
      ),
    ).toBe(false);

    expect(
      isHighlightCurrentlyActive(
        {
          id: "h-expired-days",
          created_at: "2026-11-10T11:00:00Z",
          campaign_days: 2,
        },
        now,
      ),
    ).toBe(false);

    expect(
      isHighlightCurrentlyActive(
        {
          id: "h-paused",
          created_at: "2026-11-12T10:00:00Z",
          is_paused: true,
        },
        now,
      ),
    ).toBe(false);

    expect(
      isHighlightCurrentlyActive(
        {
          id: "h-rejected",
          created_at: "2026-11-12T10:00:00Z",
          admin_statement: "REJECTED: policy violation",
        },
        now,
      ),
    ).toBe(false);

    expect(
      isHighlightCurrentlyActive(
        {
          id: "h-scheduled-future",
          created_at: "2026-11-12T10:00:00Z",
          scheduled_start_at: "2026-11-12T14:00:00Z",
        },
        now,
      ),
    ).toBe(false);
  });

  it("ranks bidded highlights strictly ahead of non-bidded highlights", () => {
    const items = [
      { id: "free-new", is_bidded: false, bid_price: 0, created_at: "2026-11-12T11:50:00Z" },
      { id: "bid-low", is_bidded: true, bid_price: 5, created_at: "2026-11-12T08:00:00Z" },
      { id: "bid-top", is_bidded: true, bid_price: 20, is_highest_bidder: true, created_at: "2026-11-12T07:00:00Z" },
      { id: "bid-implicit", is_bidded: false, bid_price: 12, created_at: "2026-11-12T09:00:00Z" },
      { id: "free-old", is_bidded: false, bid_price: 0, created_at: "2026-11-12T06:00:00Z" },
    ];

    const sorted = [...items].sort(sortHighlightsByBidAndRecency).map((i) => i.id);
    expect(sorted).toEqual(["bid-top", "bid-implicit", "bid-low", "free-new", "free-old"]);
  });

  it("formats array and JSON-stringified interests cleanly", () => {
    expect(formatHighlightInterests(["Tech", "Finance"])).toBe("Tech, Finance");
    expect(formatHighlightInterests('["Design", "AI"]')).toBe("Design, AI");
    expect(formatHighlightInterests("News")).toBe("News");
    expect(formatHighlightInterests([])).toBe("General");
    expect(formatHighlightInterests(null)).toBe("General");
  });
});

describe("Deactivated Account Re-Join vs Permanent Ban", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("blocks perm_banned emails via isEmailPermanentlyBanned and clearSelfDeactivationForRejoin", async () => {
    const delSpy = vi.fn().mockResolvedValue(1);
    const deleteChain = {
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ error: null }),
    };

    vi.doMock("../redis", () => ({
      default: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === "perm_banned:banned@example.com") return Promise.resolve("1");
          return Promise.resolve(null);
        }),
        set: vi.fn().mockResolvedValue("OK"),
        del: delSpy,
      },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("../auth0", () => ({ auth0: { getSession: vi.fn().mockResolvedValue(null) } }));
    vi.doMock("../logger", () => ({ captureApiException: vi.fn() }));
    vi.doMock("../utils/dbAdmin", () => ({
      default: {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { email: "banned@example.com", reason: "admin_perm_banned" },
            error: null,
          }),
          delete: vi.fn(() => deleteChain),
        })),
      },
    }));
    vi.doMock("../utils/cache", () => ({ invalidateCachedProfile: vi.fn().mockResolvedValue(undefined) }));

    const { isEmailPermanentlyBanned, clearSelfDeactivationForRejoin } = await import("../authHelper");

    expect(await isEmailPermanentlyBanned("banned@example.com")).toBe(true);
    const rejoinResult = await clearSelfDeactivationForRejoin("banned@example.com");
    expect(rejoinResult).toEqual({ allowed: false, permanentlyBanned: true });
    expect(delSpy).not.toHaveBeenCalled();
  });

  it("clears non-ban deactivation tombstones on fresh rejoin so deactivated users start setup fresh", async () => {
    const delSpy = vi.fn().mockResolvedValue(1);
    const deleteUsersChain = {
      ilike: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    const deleteDeactChain = {
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ error: null }),
    };

    vi.doMock("../redis", () => ({
      default: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === "deactivated:returning@example.com") return Promise.resolve("1");
          return Promise.resolve(null);
        }),
        set: vi.fn().mockResolvedValue("OK"),
        del: delSpy,
      },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("../auth0", () => ({ auth0: { getSession: vi.fn().mockResolvedValue(null) } }));
    vi.doMock("../logger", () => ({ captureApiException: vi.fn() }));
    vi.doMock("../utils/dbAdmin", () => ({
      default: {
        from: vi.fn((table: string) => {
          if (table === "deactivated_users") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { email: "returning@example.com", reason: "user_deactivated" },
                error: null,
              }),
              delete: vi.fn(() => deleteDeactChain),
            };
          }
          if (table === "users") {
            return {
              select: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { ad_account_status: "deactivated" },
                error: null,
              }),
              delete: vi.fn(() => deleteUsersChain),
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
    vi.doMock("../utils/cache", () => ({ invalidateCachedProfile: vi.fn().mockResolvedValue(undefined) }));

    const { isEmailPermanentlyBanned, clearSelfDeactivationForRejoin } = await import("../authHelper");

    expect(await isEmailPermanentlyBanned("returning@example.com")).toBe(false);
    const rejoinResult = await clearSelfDeactivationForRejoin("returning@example.com");
    expect(rejoinResult).toEqual({ allowed: true, permanentlyBanned: false });
    expect(delSpy).toHaveBeenCalledWith("deactivated:returning@example.com");
  });
});
