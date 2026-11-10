import { describe, it, expect, beforeEach } from "vitest";
import {
  verifyTransactionPin,
  getPinAttemptBucket,
  clearFailedPinAttempts,
  MAX_FAILED_PIN_ATTEMPTS,
} from "../security/walletPinHelper";
import { hashWalletPinAsync } from "../security/piiCrypto";
import { transferApiSchema, initiateWithdrawalApiSchema } from "../validationSchemas";
import { sanitizeRedirectUrl } from "../security/redirectHelper";

describe("Enterprise Security Hardening Suite", () => {
  const testEmail = "security_test@xea.internal";
  let validPinHash = "";

  beforeEach(async () => {
    await clearFailedPinAttempts(getPinAttemptBucket(testEmail));
    validPinHash = await hashWalletPinAsync("1234", testEmail);
  });

  describe("Wallet PIN Enforcement", () => {
    it("should allow transactions when user has not yet configured a PIN (grace period)", async () => {
      const result = await verifyTransactionPin({
        email: testEmail,
        pin: undefined,
        storedPinHash: null,
      });
      expect(result.valid).toBe(true);
    });

    it("should reject transactions when user has a PIN but none is supplied", async () => {
      const result = await verifyTransactionPin({
        email: testEmail,
        pin: undefined,
        storedPinHash: validPinHash,
      });
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.error).toContain("4-digit Wallet PIN is required");
    });

    it("should reject malformed non-4-digit PINs", async () => {
      const result = await verifyTransactionPin({
        email: testEmail,
        pin: "12",
        storedPinHash: validPinHash,
      });
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(400);
    });

    it("should accept correct 4-digit PIN and clear attempts", async () => {
      const result = await verifyTransactionPin({
        email: testEmail,
        pin: "1234",
        storedPinHash: validPinHash,
      });
      expect(result.valid).toBe(true);
    });

    it("should track failed attempts and enforce lockout after 5 consecutive failures", async () => {
      for (let i = 1; i < MAX_FAILED_PIN_ATTEMPTS; i++) {
        const attempt = await verifyTransactionPin({
          email: testEmail,
          pin: "9999",
          storedPinHash: validPinHash,
        });
        expect(attempt.valid).toBe(false);
        expect(attempt.statusCode).toBe(401);
        expect(attempt.attemptsRemaining).toBe(MAX_FAILED_PIN_ATTEMPTS - i);
      }

      // 5th attempt triggers lockout
      const lockoutAttempt = await verifyTransactionPin({
        email: testEmail,
        pin: "9999",
        storedPinHash: validPinHash,
      });
      expect(lockoutAttempt.valid).toBe(false);
      expect(lockoutAttempt.statusCode).toBe(429);
      expect(lockoutAttempt.error).toContain("locked");

      // Even correct PIN is rejected during active lockout
      const lockedOutCorrectPin = await verifyTransactionPin({
        email: testEmail,
        pin: "1234",
        storedPinHash: validPinHash,
      });
      expect(lockedOutCorrectPin.valid).toBe(false);
      expect(lockedOutCorrectPin.statusCode).toBe(429);
    });
  });

  describe("Transfer & Withdrawal Validation Schemas", () => {
    it("should parse transferApiSchema with optional PIN", () => {
      const valid = transferApiSchema.safeParse({
        recipientEmail: "test@example.com",
        amount: 500,
        pin: "1234",
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.pin).toBe("1234");
      }
    });

    it("should parse initiateWithdrawalApiSchema with optional PIN", () => {
      const valid = initiateWithdrawalApiSchema.safeParse({
        bankCode: "044",
        bankName: "Access Bank",
        accountNumber: "0123456789",
        amount: 25000,
        phone: "+2348012345678",
        pin: "5678",
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.pin).toBe("5678");
      }
    });
  });

  describe("Redirect URL & External Domain Rejection", () => {
    it("should accept valid deep links", () => {
      expect(sanitizeRedirectUrl("xea-auth://payment-callback")).toBe("xea-auth://payment-callback");
      expect(sanitizeRedirectUrl("xea://wallet/history")).toBe("xea://wallet/history");
    });

    it("should accept safe relative paths", () => {
      expect(sanitizeRedirectUrl("/wallet")).toBe("/wallet");
      expect(sanitizeRedirectUrl("/dashboard/settings")).toBe("/dashboard/settings");
    });

    it("should accept official project domains", () => {
      expect(sanitizeRedirectUrl("https://paayh.com/wallet")).toBe("https://paayh.com/wallet");
      expect(sanitizeRedirectUrl("https://www.paayh.com/wallet")).toBe("https://www.paayh.com/wallet");
    });

    it("should reject external / attacker domains and return safe default", () => {
      expect(sanitizeRedirectUrl("https://attacker.com/steal")).toBe("xea-auth://payment-callback");
      expect(sanitizeRedirectUrl("https://evil-paayh.com")).toBe("xea-auth://payment-callback");
      expect(sanitizeRedirectUrl("https://www.xea.com/done")).toBe("xea-auth://payment-callback");
      expect(sanitizeRedirectUrl("http://phishing.org/login")).toBe("xea-auth://payment-callback");
    });

    it("should reject protocol-relative URLs", () => {
      expect(sanitizeRedirectUrl("//attacker.com/steal")).toBe("xea-auth://payment-callback");
    });

    it("should reject javascript: and data: pseudo-protocols (DOM XSS defense)", () => {
      expect(sanitizeRedirectUrl("javascript:alert(document.cookie)")).toBe("xea-auth://payment-callback");
      expect(sanitizeRedirectUrl("data:text/html,<script>alert(1)</script>")).toBe("xea-auth://payment-callback");
    });
  });
});
