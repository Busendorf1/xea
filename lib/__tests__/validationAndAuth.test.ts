import { describe, it, expect } from "vitest";
import {
  profileSetupStep1Schema,
  helpSchema,
  adCreativeProductSchema,
  newsSchema,
  sendMoneySchema,
  withdrawalSchema,
  boostSchema,
  cancelMonetizationSchema,
  deactivationSchema,
  adminNotificationSchema,
  adminDirectAdSchema,
  adminDirectHighlightSchema,
  adminTicketReplySchema,
} from "../validationSchemas";

describe("Zod Validation Schemas", () => {
  describe("profileSetupStep1Schema", () => {
    it("should accept valid adult user profiles", () => {
      const validData = {
        dob: "1995-05-15",
        phone: "+1234567890",
        gender: "male",
        employment: "employed",
        country: "US",
        state: "CA",
        location: "Los Angeles",
      };

      const result = profileSetupStep1Schema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject users under 18 years old", () => {
      const today = new Date();
      const underAgeDob = `${today.getFullYear() - 15}-01-01`;

      const underAgeData = {
        dob: underAgeDob,
        phone: "+1234567890",
        gender: "female",
        employment: "student",
        country: "US",
        state: "NY",
        location: "New York",
      };

      const result = profileSetupStep1Schema.safeParse(underAgeData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("18 years old");
      }
    });

    it("should reject invalid phone numbers", () => {
      const invalidPhoneData = {
        dob: "1990-01-01",
        phone: "invalid-phone-abc",
        gender: "male",
        employment: "employed",
        country: "US",
        state: "CA",
        location: "SF",
      };

      const result = profileSetupStep1Schema.safeParse(invalidPhoneData);
      expect(result.success).toBe(false);
    });
  });

  describe("helpSchema", () => {
    it("should validate valid support tickets", () => {
      const validTicket = {
        name: "Jane Doe",
        email: "jane@example.com",
        category: "Billing",
        subject: "Payment Inquiry regarding wallet top-up",
        message: "Hello team, I need assistance verifying my recent deposit to my account.",
      };

      const result = helpSchema.safeParse(validTicket);
      expect(result.success).toBe(true);
    });
  });

  describe("adCreativeProductSchema", () => {
    it("should validate valid product ad submission", () => {
      const validAd = {
        adContent: "Check out our premium modern headphones!",
        productName: "Wireless ANC Headphones",
        productPrice: "25000",
        productCtaLink: "https://example.com/buy",
      };

      const result = adCreativeProductSchema.safeParse(validAd);
      expect(result.success).toBe(true);
    });
  });

  describe("newsSchema", () => {
    it("should validate valid news submission", () => {
      const validNews = {
        title: "Exclusive Tech Launch Event",
        content: "We are thrilled to unveil our new generation product line today.",
        interest: "Technology",
        country: "Nigeria",
        campaignDays: 3,
        bidPrice: 1500,
      };

      const result = newsSchema.safeParse(validNews);
      expect(result.success).toBe(true);
    });

    it("should reject news titles shorter than 3 characters", () => {
      const shortTitleNews = {
        title: "Hi",
        content: "Valid content here with enough characters.",
        interest: "Tech",
        country: "Nigeria",
        campaignDays: 1,
      };

      const result = newsSchema.safeParse(shortTitleNews);
      expect(result.success).toBe(false);
    });
  });

  describe("sendMoneySchema", () => {
    it("should validate valid P2P money transfers", () => {
      const validTransfer = {
        recipientEmail: "friend@example.com",
        amount: 2500,
      };

      const result = sendMoneySchema.safeParse(validTransfer);
      expect(result.success).toBe(true);
    });

    it("should reject invalid recipient email format", () => {
      const invalidEmailTransfer = {
        recipientEmail: "not-an-email",
        amount: 1000,
      };

      const result = sendMoneySchema.safeParse(invalidEmailTransfer);
      expect(result.success).toBe(false);
    });
  });

  describe("withdrawalSchema", () => {
    it("should validate valid bank withdrawal requests", () => {
      const validWithdrawal = {
        amount: 15000,
        bankCode: "057",
        accountNumber: "0123456789",
        accountName: "John Doe",
      };

      const result = withdrawalSchema.safeParse(validWithdrawal);
      expect(result.success).toBe(true);
    });

    it("should reject account numbers not equal to 10 digits", () => {
      const invalidAccountWithdrawal = {
        amount: 15000,
        bankCode: "057",
        accountNumber: "12345",
        accountName: "John Doe",
      };

      const result = withdrawalSchema.safeParse(invalidAccountWithdrawal);
      expect(result.success).toBe(false);
    });
  });

  describe("boostSchema", () => {
    it("should validate campaign boost parameters", () => {
      const validBoost = {
        adId: "ad-uuid-1234",
        bidAmount: 500,
        paymentMethod: "wallet",
      };

      const result = boostSchema.safeParse(validBoost);
      expect(result.success).toBe(true);
    });
  });

  describe("cancelMonetizationSchema", () => {
    it("should validate email format for cancellation", () => {
      const validCancel = { email: "user@domain.com" };
      expect(cancelMonetizationSchema.safeParse(validCancel).success).toBe(true);

      const invalidCancel = { email: "invalid-email" };
      expect(cancelMonetizationSchema.safeParse(invalidCancel).success).toBe(false);
    });
  });

  describe("deactivationSchema", () => {
    it("should validate account deactivation email", () => {
      const validDeactivation = { confirmEmail: "user@domain.com", reason: "Moving to a new platform" };
      expect(deactivationSchema.safeParse(validDeactivation).success).toBe(true);
    });
  });

  describe("adminNotificationSchema", () => {
    it("should validate broadcast notifications to all users", () => {
      const validBroadcast = {
        title: "System Update Scheduled",
        message: "We will be undergoing brief system maintenance tonight.",
        target: "all",
      };
      expect(adminNotificationSchema.safeParse(validBroadcast).success).toBe(true);
    });

    it("should reject user-targeted notification without a valid target email", () => {
      const invalidUserNotif = {
        title: "Important Notice",
        message: "Your account credentials have been updated.",
        target: "user",
        targetEmail: "",
      };
      expect(adminNotificationSchema.safeParse(invalidUserNotif).success).toBe(false);
    });
  });

  describe("adminDirectAdSchema", () => {
    it("should validate direct admin ad posting data", () => {
      const validAd = {
        headline: "Official Platform Event",
        content: "Join our global developer conference this Friday.",
        ctaLink: "https://xea.app/event",
        impressions: 5000,
        campaignDays: 5,
        userEmail: "admin@xea.app",
      };
      expect(adminDirectAdSchema.safeParse(validAd).success).toBe(true);
    });
  });

  describe("adminDirectHighlightSchema", () => {
    it("should validate direct admin highlight posting data", () => {
      const validHighlight = {
        title: "Platform Growth Milestone",
        content: "XEA reaches 100,000 active monthly subscribers across Africa.",
        interest: "Technology",
        country: "Nigeria",
        campaignDays: 7,
        userEmail: "news@xea.app",
      };
      expect(adminDirectHighlightSchema.safeParse(validHighlight).success).toBe(true);
    });
  });

  describe("adminTicketReplySchema", () => {
    it("should validate support ticket responses", () => {
      const validReply = {
        ticketId: "ticket-101",
        replyText: "Thank you for contacting support. Your issue has been resolved.",
      };
      expect(adminTicketReplySchema.safeParse(validReply).success).toBe(true);
    });
  });
});
