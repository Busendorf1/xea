// lib/payment/payoutProvider.ts
/**
 * Unified Payout Provider Switcher
 * 
 * Supports dual payout gateways:
 * - Kora (Default / Primary): High-frequency disbursements, direct float deduction, dedicated bank transfer rails.
 * - Paystack (Alternative / Fallback): Available for instant switching if Kora experiences downtime or maintenance.
 * 
 * Switching between providers:
 * Set the environment variable in .env:
 *   PAYOUT_PROVIDER=kora     # (Default) Uses Kora for payouts
 *   PAYOUT_PROVIDER=paystack # Switches to Paystack for payouts
 */

import { KoraService, KoraBank, KoraResolveAccountResponse } from "./kora";
import { PaystackService, Bank as PaystackBank, ResolveAccountResponse as PaystackResolveAccountResponse } from "./paystack";

export type PayoutGateway = "kora" | "paystack";

export class PayoutProvider {
  /**
   * Returns current active payout gateway ("kora" by default, or "paystack")
   */
  static getActiveGateway(): PayoutGateway {
    const configured = (process.env.PAYOUT_PROVIDER || "").toLowerCase().trim();
    if (configured === "paystack") {
      return "paystack";
    }
    // Default to Kora for best payout flexibility
    return "kora";
  }

  /**
   * Fetch Nigerian bank list from active gateway, with fallback
   */
  static async listBanks(): Promise<{ name: string; code: string }[]> {
    const active = this.getActiveGateway();

    if (active === "kora") {
      try {
        const banks = await KoraService.listBanks();
        if (banks && banks.length > 0) {
          return banks.map((b) => ({ name: b.name, code: b.code }));
        }
      } catch (err) {
        console.warn("⚠️ Kora bank list failed, falling back to Paystack:", err);
      }
    }

    // Paystack fallback / direct mode
    return PaystackService.listBanks();
  }

  /**
   * Resolve a bank account number to get verified account name
   */
  static async resolveAccount(
    accountNumber: string,
    bankCode: string
  ): Promise<{ account_number: string; account_name: string }> {
    const cleanAccount = String(accountNumber || "").replace(/\D/g, "");
    if (cleanAccount.length !== 10) {
      throw new Error(
        cleanAccount.length < 10 ? "Account number is too short" : "Account number is too long"
      );
    }

    const active = this.getActiveGateway();
    const isProd = process.env.NODE_ENV === "production";
    const canTryKora = !isProd || KoraService.hasLiveKey();
    const canTryPaystack = !isProd || PaystackService.hasLiveKey();

    if (active === "kora") {
      if (canTryKora) {
        try {
          const res = await KoraService.resolveAccount(cleanAccount, bankCode);
          return {
            account_number: res.account_number,
            account_name: res.account_name,
          };
        } catch (err: any) {
          console.warn("⚠️ Kora resolveAccount failed, checking Paystack fallback:", err?.message || err);
          if (canTryPaystack) {
            return PaystackService.resolveAccount(cleanAccount, bankCode);
          }
          throw err;
        }
      }
      if (canTryPaystack) {
        return PaystackService.resolveAccount(cleanAccount, bankCode);
      }
      throw new Error("GATEWAY_RESOLVE_DEFERRED: No live payout gateway key configured for instant NUBAN lookup.");
    }

    // Direct Paystack mode with Kora fallback
    if (canTryPaystack) {
      try {
        return await PaystackService.resolveAccount(cleanAccount, bankCode);
      } catch (err: any) {
        if (canTryKora) {
          const res = await KoraService.resolveAccount(cleanAccount, bankCode);
          return {
            account_number: res.account_number,
            account_name: res.account_name,
          };
        }
        throw err;
      }
    }

    if (canTryKora) {
      const res = await KoraService.resolveAccount(cleanAccount, bankCode);
      return {
        account_number: res.account_number,
        account_name: res.account_name,
      };
    }

    throw new Error("GATEWAY_RESOLVE_DEFERRED: No live payout gateway key configured for instant NUBAN lookup.");
  }

  /**
   * Check available disbursement balance on active gateway
   */
  static async getAvailableBalance(): Promise<{ currency: string; amount: number }> {
    const active = this.getActiveGateway();

    if (active === "kora") {
      const nairaBalance = await KoraService.getNairaBalance();
      return { currency: "NGN", amount: nairaBalance };
    }

    // In Paystack mode, transfers are funded by Paystack available balance
    return { currency: "NGN", amount: 0 };
  }

  /**
   * Initiate a single instant payout to a user's bank account
   */
  static async initiatePayout(params: {
    reference: string;
    amount: number;
    bankCode: string;
    accountNumber: string;
    accountName?: string;
    customerEmail: string;
    narration?: string;
  }): Promise<{ status: string; reference: string }> {
    const active = this.getActiveGateway();

    if (active === "kora") {
      try {
        return await KoraService.initiateSinglePayout({
          reference: params.reference,
          amount: params.amount,
          bankCode: params.bankCode,
          accountNumber: params.accountNumber,
          accountName: params.accountName,
          customerEmail: params.customerEmail,
          narration: params.narration,
        });
      } catch (err: any) {
        console.error("❌ Kora payout initiation failed:", err);
        throw err;
      }
    }

    // Paystack mode
    try {
      const recipientCode = await PaystackService.createTransferRecipient(
        params.accountName || "Paayh User",
        params.accountNumber,
        params.bankCode
      );
      const res = await PaystackService.initiateTransfer(
        recipientCode,
        params.amount,
        params.narration || "Paayh Wallet Withdrawal",
        params.reference
      );
      return {
        status: res.status,
        reference: params.reference,
      };
    } catch (err: any) {
      console.error("❌ Paystack payout initiation failed:", err);
      throw err;
    }
  }

  /**
   * Initialize an inbound payment (Ads, Highlights, Brand Subscriptions)
   */
  static async initializePayment(params: {
    email: string;
    amountInNaira: number;
    callbackUrl: string;
    metadata?: Record<string, unknown>;
    channels?: string[];
    narration?: string;
  }): Promise<{ authorization_url: string; reference: string; access_code?: string }> {
    const active = this.getActiveGateway();

    if (active === "kora") {
      try {
        const res = await KoraService.initializeCharge(
          params.email,
          params.amountInNaira,
          params.callbackUrl,
          params.metadata,
          params.narration
        );
        return {
          authorization_url: res.checkout_url,
          reference: res.reference,
        };
      } catch (err: any) {
        console.warn("⚠️ Kora initializeCharge failed, falling back to Paystack:", err?.message || err);
      }
    }

    // Paystack mode
    return await PaystackService.initializeTransaction(
      params.email,
      params.amountInNaira,
      params.callbackUrl,
      params.metadata,
      params.channels
    );
  }

  /**
   * Verify an inbound payment transaction across active gateway with fallback
   */
  static async verifyPayment(reference: string): Promise<{
    success: boolean;
    status: string;
    amount: number; // in Naira
    reference: string;
    metadata?: Record<string, unknown>;
  }> {
    const isKoraRef = reference.startsWith("kora_");
    const active = this.getActiveGateway();

    if (isKoraRef || active === "kora") {
      try {
        const res = await KoraService.verifyCharge(reference);
        return {
          success: res.status === "success" || res.status === "successful",
          status: res.status,
          amount: res.amount,
          reference: res.reference,
          metadata: res.metadata,
        };
      } catch (koraErr: any) {
        console.warn("⚠️ Kora charge verification failed, checking Paystack fallback:", koraErr?.message || koraErr);
        if (!isKoraRef) {
          try {
            const paystackRes = await PaystackService.verifyTransaction(reference);
            return {
              success: paystackRes.status === "success",
              status: paystackRes.status,
              amount: paystackRes.amount / 100,
              reference: paystackRes.reference,
              metadata: paystackRes.metadata,
            };
          } catch {
            throw koraErr;
          }
        }
        throw koraErr;
      }
    }

    // Paystack primary mode with fallback to Kora
    try {
      const paystackRes = await PaystackService.verifyTransaction(reference);
      return {
        success: paystackRes.status === "success",
        status: paystackRes.status,
        amount: paystackRes.amount / 100,
        reference: paystackRes.reference,
        metadata: paystackRes.metadata,
      };
    } catch (paystackErr: any) {
      console.warn("⚠️ Paystack verification failed, attempting Kora fallback:", paystackErr?.message || paystackErr);
      const res = await KoraService.verifyCharge(reference);
      return {
        success: res.status === "success" || res.status === "successful",
        status: res.status,
        amount: res.amount,
        reference: res.reference,
        metadata: res.metadata,
      };
    }
  }

  /**
   * Dynamically calculates the exact interbank payout charge levied by the active gateway
   * so the transaction cost is passed transparently to the user instead of a fixed ₦35 fee.
   *
   * Rate Tiers (CBN / NIBSS interbank regulatory schedule + 7.5% VAT):
   * - Paystack:
   *   <= ₦5,000        -> ₦10 + 7.5% VAT = ₦10.75
   *   ₦5,001 - ₦50,000 -> ₦25 + 7.5% VAT = ₦26.88
   *   > ₦50,000        -> ₦50 + 7.5% VAT = ₦53.75
   * - Kora:
   *   <= ₦5,000        -> ₦15.00
   *   ₦5,001 - ₦50,000 -> ₦25.00
   *   > ₦50,000        -> ₦35.00 (or custom configured KORA_TRANSFER_FEE)
   */
  static calculateTransferFee(amount: number, provider?: PayoutGateway): number {
    const gateway = provider || this.getActiveGateway();
    const parsedAmount = Math.max(0, Number(amount) || 0);

    if (gateway === "paystack") {
      if (parsedAmount <= 5000) {
        return 10.75;
      } else if (parsedAmount <= 50000) {
        return 26.88;
      } else {
        return 53.75;
      }
    }

    const envKoraFee = parseFloat(process.env.KORA_TRANSFER_FEE || "");
    if (!isNaN(envKoraFee) && envKoraFee >= 0) {
      return envKoraFee;
    }

    if (parsedAmount <= 5000) {
      return 15;
    } else if (parsedAmount <= 50000) {
      return 25;
    } else {
      return 35;
    }
  }
}

