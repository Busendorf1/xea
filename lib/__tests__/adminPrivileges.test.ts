import { describe, it, expect, beforeEach, vi } from "vitest";
import { isAdminEmail } from "../authHelper";
import { getAtwBalanceLimit } from "../attentionTierEngine";
import { reserveSenderBalance } from "../security/rateLimiter";

vi.mock("../redis", () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    sismember: vi.fn(),
    scard: vi.fn(),
  },
}));

vi.mock("../utils/dbAdmin", () => ({
  default: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { balance: 1000000 }, error: null }),
        }),
      }),
    }),
  },
}));

describe("Admin Privilege Caps Bypass", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = "admin@xea.app,superadmin@paayh.com";
  });

  describe("isAdminEmail", () => {
    it("should return true for configured admin emails", () => {
      expect(isAdminEmail("admin@xea.app")).toBe(true);
      expect(isAdminEmail("SUPERADMIN@PAAYH.COM")).toBe(true);
    });

    it("should return false for regular user emails", () => {
      expect(isAdminEmail("regularuser@example.com")).toBe(false);
      expect(isAdminEmail(null)).toBe(false);
    });
  });

  describe("getAtwBalanceLimit for Admins", () => {
    it("should return Infinity balance limit when isAdmin is true", () => {
      const cap = getAtwBalanceLimit("ATW1", true);
      expect(cap).toBe(Infinity);
    });

    it("should enforce level caps for standard non-admin users", () => {
      const cap = getAtwBalanceLimit("ATW1", false);
      expect(cap).toBe(100000);
    });
  });

  describe("reserveSenderBalance for Admins", () => {
    it("should allow admins to transfer more than 20% of total balance", async () => {
      // Balance is 1,000,000. 50% transfer (500,000) exceeds 20% limit for regular users
      const result = await reserveSenderBalance("admin@xea.app", 500000);
      expect(result.success).toBe(true);
    });

    it("should block non-admin users from transferring more than 20% of balance", async () => {
      const result = await reserveSenderBalance("regularuser@example.com", 500000);
      expect(result.success).toBe(false);
      expect(result.error).toContain("cannot exceed 20%");
    });
  });
});
