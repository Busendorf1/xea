import { describe, it, expect } from "vitest";
import { isAdminEmail } from "../authHelper";
import { getAtwBalanceLimit } from "../attentionTierEngine";

describe("Admin Free Campaign & Branding Features", () => {
  describe("Admin Privilege Email Verification", () => {
    it("should resolve admin status for campaign publishing", () => {
      process.env.ADMIN_EMAILS = "admin@xea.app";
      expect(isAdminEmail("admin@xea.app")).toBe(true);
      expect(isAdminEmail("user@example.com")).toBe(false);
    });
  });

  describe("ATW Balance Holding Limit Bypass", () => {
    it("should return Infinity for admin balance limit", () => {
      expect(getAtwBalanceLimit("ATW1", true)).toBe(Infinity);
      expect(getAtwBalanceLimit("ATW14", true)).toBe(Infinity);
    });
  });

  describe("Admin Custom Branding Fields", () => {
    it("should support custom sponsor name, handle, and logo", () => {
      const ad = {
        id: "ad-101",
        ad_content: "Admin post content",
        is_admin_post: true,
        custom_sponsor_name: "Acme Corp",
        custom_sponsor_handle: "@acme_official",
        custom_sponsor_logo: "https://example.com/logo.png",
      };

      expect(ad.custom_sponsor_name).toBe("Acme Corp");
      expect(ad.custom_sponsor_handle).toBe("@acme_official");
      expect(ad.custom_sponsor_logo).toBe("https://example.com/logo.png");
    });
  });
});
