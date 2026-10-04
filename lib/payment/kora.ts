// lib/payment/kora.ts
import redisConnection from "@/lib/redis";

export interface KoraBank {
  name: string;
  code: string;
  slug?: string;
  country?: string;
}

export interface KoraResolveAccountResponse {
  account_number: string;
  account_name: string;
  bank_name?: string;
  bank_code?: string;
}

export interface KoraBalanceItem {
  currency: string;
  available_balance: number;
  pending_balance: number;
}

export interface KoraSinglePayoutParams {
  reference: string;
  amount: number; // in Naira (not kobo)
  bankCode: string;
  accountNumber: string;
  accountName?: string;
  customerEmail: string;
  narration?: string;
}

export interface KoraBulkPayoutItem {
  reference: string;
  amount: number; // in Naira
  bankCode: string;
  accountNumber: string;
  accountName?: string;
  customerEmail: string;
  narration?: string;
}

export interface KoraBulkPayoutParams {
  batchReference: string;
  merchantBearsCost?: boolean;
  description?: string;
  payouts: KoraBulkPayoutItem[];
}

export class KoraService {
  private static getBaseUrl(): string {
    return process.env.KORA_BASE_URL || "https://api.korapay.com/merchant/api/v1";
  }

  private static getSecretKey(): string {
    return process.env.KORA_SECRET_KEY || "sk_test_mock_kora_1234567890";
  }

  private static isMock(): boolean {
    const key = this.getSecretKey();
    return key.startsWith("sk_test_mock");
  }

  /**
   * Fetch the list of supported Nigerian banks from Kora
   */
  static async listBanks(): Promise<KoraBank[]> {
    const fallbackBanks: KoraBank[] = [
      { name: "Access Bank", code: "044" },
      { name: "Citibank Nigeria", code: "023" },
      { name: "Ecobank Nigeria", code: "050" },
      { name: "Fidelity Bank", code: "070" },
      { name: "First Bank of Nigeria", code: "011" },
      { name: "First City Monument Bank (FCMB)", code: "214" },
      { name: "Guaranty Trust Bank (GTBank)", code: "058" },
      { name: "Heritage Bank", code: "030" },
      { name: "Jaiz Bank", code: "301" },
      { name: "Keystone Bank", code: "082" },
      { name: "Kuda Bank", code: "50211" },
      { name: "Moniepoint MFB", code: "50515" },
      { name: "Opay (Paycom)", code: "999992" },
      { name: "Palmpay", code: "999991" },
      { name: "Polaris Bank", code: "076" },
      { name: "Providus Bank", code: "101" },
      { name: "Stanbic IBTC Bank", code: "221" },
      { name: "Standard Chartered Bank", code: "068" },
      { name: "Sterling Bank", code: "232" },
      { name: "Taj Bank", code: "302" },
      { name: "Titan Trust Bank", code: "102" },
      { name: "Union Bank of Nigeria", code: "032" },
      { name: "United Bank for Africa (UBA)", code: "033" },
      { name: "Unity Bank", code: "215" },
      { name: "VFD Microfinance Bank", code: "566" },
      { name: "Wema Bank", code: "035" },
      { name: "Zenith Bank", code: "057" },
    ];

    if (this.isMock()) {
      return fallbackBanks;
    }

    const banksCacheKey = "payouts:banks:ng";
    try {
      const cached = await redisConnection.get(banksCacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    try {
      const response = await fetch(`${this.getBaseUrl()}/misc/banks?countryCode=NG`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.getSecretKey()}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      if (response.ok && result.status && Array.isArray(result.data)) {
        const banks = result.data.map((b: any) => ({
          name: b.name,
          code: b.code,
          slug: b.slug,
          country: b.country,
        }));
        try {
          await redisConnection.set(banksCacheKey, JSON.stringify(banks), "EX", 86400); // 24 hours
        } catch {}
        return banks;
      }
    } catch (err) {
      console.warn("⚠️ Kora: Using fallback bank list due to fetch error:", err);
    }

    return fallbackBanks;
  }

  /**
   * Resolve a Nigerian NUBAN bank account number to get verified account name
   */
  static async resolveAccount(accountNumber: string, bankCode: string): Promise<KoraResolveAccountResponse> {
    if (this.isMock()) {
      console.warn("⚠️ Using Mock Kora implementation for resolveAccount");
      if (accountNumber.length !== 10) {
        throw new Error(accountNumber.length < 10 ? "Account number is too short" : "Account number is too long");
      }
      return {
        account_number: accountNumber,
        account_name: "JOHN DOE (KORA VERIFIED)",
        bank_code: bankCode,
      };
    }

    // Check Redis cache to prevent duplicate external calls during withdrawal modal & submit
    const resolveCacheKey = `bank:resolve:${bankCode}:${accountNumber}`;
    try {
      const cached = await redisConnection.get(resolveCacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    const response = await fetch(`${this.getBaseUrl()}/misc/banks/resolve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bank: bankCode,
        account: accountNumber,
        currency: "NGN",
      }),
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Could not resolve bank account details on Kora. Please check the details.");
    }

    const resolved = {
      account_number: result.data.account_number || accountNumber,
      account_name: result.data.account_name,
      bank_name: result.data.bank_name,
      bank_code: result.data.bank_code || bankCode,
    };

    // Cache resolved account for 24 hours
    try {
      await redisConnection.set(resolveCacheKey, JSON.stringify(resolved), "EX", 86400);
    } catch {}

    return resolved;
  }

  /**
   * Check your current positive merchant balance on Kora
   */
  static async getBalances(): Promise<KoraBalanceItem[]> {
    if (this.isMock()) {
      return [
        { currency: "NGN", available_balance: 5000000, pending_balance: 0 },
      ];
    }

    const response = await fetch(`${this.getBaseUrl()}/balances`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Failed to fetch balances from Kora");
    }

    const data = result.data;
    if (Array.isArray(data)) {
      return data;
    } else if (typeof data === "object" && data !== null) {
      // Sometimes Kora returns object with currencies as keys
      return Object.entries(data).map(([currency, val]: [string, any]) => ({
        currency,
        available_balance: typeof val === "object" ? val.available_balance || 0 : Number(val) || 0,
        pending_balance: typeof val === "object" ? val.pending_balance || 0 : 0,
      }));
    }

    return [];
  }

  static readonly FLOAT_CACHE_KEY = "payouts:float_balance:kora";

  /**
   * Helper to invalidate float balance cache (e.g. after payouts or on manual refresh)
   */
  static async invalidateBalanceCache(): Promise<void> {
    try {
      await redisConnection.del(this.FLOAT_CACHE_KEY);
    } catch {}
  }

  /**
   * Helper to get NGN available balance specifically (Cached in Redis for 30s)
   */
  static async getNairaBalance(bypassCache = false): Promise<number> {
    try {
      if (!bypassCache) {
        const cached = await redisConnection.get(this.FLOAT_CACHE_KEY);
        if (cached !== null && !isNaN(parseFloat(cached))) {
          return parseFloat(cached);
        }
      }

      const balances = await this.getBalances();
      const ngn = balances.find((b) => b.currency?.toUpperCase() === "NGN");
      const balance = ngn ? ngn.available_balance : 0;

      // Cache for 30 seconds to prevent hammering external Kora API
      await redisConnection.set(this.FLOAT_CACHE_KEY, balance.toString(), "EX", 30);
      return balance;
    } catch (err) {
      console.warn("⚠️ Error checking Kora Naira balance:", err);
      return 0;
    }
  }

  /**
   * Initiate a single instant payout to a user's bank account
   */
  static async initiateSinglePayout(params: KoraSinglePayoutParams): Promise<{ status: string; reference: string }> {
    if (this.isMock()) {
      console.warn(`⚠️ Using Mock Kora implementation for single payout (ref=${params.reference})`);
      return {
        status: "pending",
        reference: params.reference,
      };
    }

    const payload = {
      reference: params.reference,
      destination: {
        type: "bank_account",
        amount: params.amount,
        currency: "NGN",
        narration: params.narration || "Paayh Earnings Withdrawal",
        bank_account: {
          bank: params.bankCode,
          account: params.accountNumber,
        },
        customer: {
          name: params.accountName || "Paayh User",
          email: params.customerEmail,
        },
      },
    };

    const response = await fetch(`${this.getBaseUrl()}/transactions/disburse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Failed to initiate payout on Kora");
    }

    return {
      status: result.data?.status || "pending",
      reference: result.data?.reference || params.reference,
    };
  }

  /**
   * Initiate a bulk payout to multiple bank accounts (batch size 2 to 50)
   */
  static async initiateBulkPayout(params: KoraBulkPayoutParams): Promise<{
    status: string;
    reference: string;
    totalAmount: number;
  }> {
    if (this.isMock()) {
      console.warn(`⚠️ Using Mock Kora implementation for bulk payout (batchRef=${params.batchReference})`);
      return {
        status: "pending",
        reference: params.batchReference,
        totalAmount: params.payouts.reduce((sum, p) => sum + p.amount, 0),
      };
    }

    if (!params.payouts || params.payouts.length === 0) {
      throw new Error("No payouts provided for bulk disbursement");
    }

    const payload = {
      reference: params.batchReference,
      merchant_bears_cost: params.merchantBearsCost ?? false, // User bears payout fee
      currency: "NGN",
      description: params.description || "Paayh Batch Withdrawal Payouts",
      payouts: params.payouts.map((p) => ({
        reference: p.reference,
        amount: p.amount,
        type: "bank_account",
        narration: p.narration || "Paayh Withdrawal",
        bank_account: {
          bank_code: p.bankCode,
          account_number: p.accountNumber,
        },
        customer: {
          name: p.accountName || "Paayh User",
          email: p.customerEmail,
        },
      })),
    };

    const response = await fetch(`${this.getBaseUrl()}/transactions/disburse/bulk`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Failed to initiate bulk payout on Kora");
    }

    return {
      status: result.data?.status || "pending",
      reference: result.data?.reference || params.batchReference,
      totalAmount: result.data?.total_chargeable_amount || 0,
    };
  }

  /**
   * Verify an individual payout transaction status
   */
  static async verifyPayout(reference: string): Promise<any> {
    if (this.isMock()) {
      return {
        status: "success",
        reference,
        amount: 10000,
        currency: "NGN",
      };
    }

    const response = await fetch(`${this.getBaseUrl()}/transactions/${reference}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Failed to verify transaction on Kora");
    }

    return result.data;
  }

  /**
   * Verify an inbound checkout charge on Kora (for Ads & Highlights)
   */
  static async verifyCharge(reference: string): Promise<{
    status: string;
    reference: string;
    amount: number;
    currency: string;
    metadata?: Record<string, unknown>;
  }> {
    if (this.isMock()) {
      return {
        status: "success",
        reference,
        amount: 1000,
        currency: "NGN",
      };
    }

    const response = await fetch(`${this.getBaseUrl()}/charges/${reference}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Failed to verify charge on Kora");
    }

    const data = result.data || {};
    return {
      status: data.status,
      reference: data.reference || reference,
      amount: parseFloat(data.amount || data.amount_paid || 0),
      currency: data.currency || "NGN",
      metadata: data.metadata,
    };
  }

  /**
   * Initialize an inbound checkout charge on Kora (for Ads & Highlights)
   */
  static async initializeCharge(
    email: string,
    amountInNaira: number,
    redirectUrl: string,
    metadata: Record<string, unknown> = {},
    narration: string = "Paayh Campaign Payment"
  ): Promise<{ checkout_url: string; reference: string }> {
    const reference = `kora_pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    if (this.isMock()) {
      console.log(`⚠️ Kora MOCK mode: Initializing mock checkout charge ref=${reference}`);
      const url = new URL(redirectUrl);
      url.searchParams.set("reference", reference);
      url.searchParams.set("status", "success");
      return {
        checkout_url: url.toString(),
        reference,
      };
    }

    // Kora's metadata schema strictly requires primitive types (string, number, boolean),
    // rejects null/nested objects, and limits string length to <= 50 characters.
    // The complete campaign metadata is already preserved in Supabase payments table.
    const cleanMetadata: Record<string, string | number | boolean> = {
      type: String(metadata?.type || "campaign").slice(0, 50),
      user_email: String(metadata?.user_email || email).slice(0, 50),
    };

    if (typeof metadata?.campaign_days === "number") {
      cleanMetadata.campaign_days = metadata.campaign_days;
    }
    if (typeof metadata?.subscriber_id === "string") {
      cleanMetadata.subscriber_id = metadata.subscriber_id.slice(0, 50);
    }

    const customerName = (metadata?.name as string) || email.split("@")[0] || "Paayh Customer";

    const payload = {
      amount: amountInNaira,
      currency: "NGN",
      reference,
      narration: (narration || "Paayh Payment").slice(0, 100),
      redirect_url: redirectUrl,
      notification_url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://paayh.com"}/api/payments/kora-webhook`,
      customer: {
        name: customerName.slice(0, 60),
        email: email.toLowerCase().trim(),
      },
      metadata: cleanMetadata,
    };

    const response = await fetch(`${this.getBaseUrl()}/charges/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      const detailedErr = result.data ? JSON.stringify(result.data) : (result.message || "Failed to initialize payment checkout on Kora");
      throw new Error(detailedErr);
    }

    return {
      checkout_url: result.data?.checkout_url,
      reference: result.data?.reference || reference,
    };
  }
}
