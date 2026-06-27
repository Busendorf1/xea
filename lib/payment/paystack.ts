// lib/payment/paystack.ts

export interface PaystackInitializeResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackVerifyResponse {
  status: string;
  reference: string;
  amount: number; // in kobo
  metadata: any;
  gateway_response: string;
}

export interface Bank {
  name: string;
  code: string;
}

export interface ResolveAccountResponse {
  account_number: string;
  account_name: string;
}

export class PaystackService {
  private static getSecretKey(): string {
    return process.env.PAYSTACK_SECRET_KEY || "sk_test_mock_1234567890abcdef";
  }

  private static isMock(): boolean {
    const key = this.getSecretKey();
    return key.startsWith("sk_test_mock");
  }

  /**
   * Initialize a payment transaction on Paystack
   * @param email User email
   * @param amountInNaira Amount in Naira
   * @param callbackUrl Redirect URL after payment
   * @param metadata Custom metadata JSON
   * @param channels Optional array of payment channels (e.g. ['card', 'bank', 'ussd', 'qr', 'bank_transfer'])
   */
  static async initializeTransaction(
    email: string,
    amountInNaira: number,
    callbackUrl: string,
    metadata: any = {},
    channels?: string[]
  ): Promise<PaystackInitializeResponse> {
    const amountInKobo = Math.round(amountInNaira * 100);
    const reference = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (this.isMock()) {
      console.warn("⚠️ Using Mock Paystack implementation for initializeTransaction");
      // Simulated redirect back with reference
      const url = new URL(callbackUrl);
      url.searchParams.set("reference", reference);
      url.searchParams.set("trxref", reference);
      return {
        authorization_url: url.toString(),
        access_code: "mock_access_code",
        reference,
      };
    }

    const payload: any = {
      email,
      amount: amountInKobo,
      callback_url: callbackUrl,
      reference,
      metadata,
    };

    if (channels && channels.length > 0) {
      payload.channels = channels;
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Failed to initialize Paystack transaction");
    }

    return result.data;
  }

  /**
   * Verify a transaction on Paystack using reference
   * @param reference Transaction reference
   */
  static async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    if (this.isMock()) {
      console.warn(`⚠️ Using Mock Paystack implementation for verifyTransaction (${reference})`);
      // Simulating a successful transaction unless reference has 'fail'
      if (reference.includes("fail")) {
        return {
          status: "failed",
          reference,
          amount: 0,
          metadata: {},
          gateway_response: "Mock transaction failed",
        };
      }
      return {
        status: "success",
        reference,
        amount: 3000000, // 30,000 NGN in kobo
        metadata: {},
        gateway_response: "Approved",
      };
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
      },
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Failed to verify Paystack transaction");
    }

    return {
      status: result.data.status,
      reference: result.data.reference,
      amount: result.data.amount,
      metadata: result.data.metadata || {},
      gateway_response: result.data.gateway_response,
    };
  }

  /**
   * List all supported banks in Nigeria
   */
  static async listBanks(): Promise<Bank[]> {
    if (this.isMock()) {
      console.warn("⚠️ Using Mock Paystack implementation for listBanks");
      return [
        { name: "Access Bank", code: "044" },
        { name: "First Bank of Nigeria", code: "011" },
        { name: "GTBank", code: "058" },
        { name: "United Bank for Africa (UBA)", code: "033" },
        { name: "Zenith Bank", code: "057" },
        { name: "Opay", code: "999992" },
        { name: "Palmpay", code: "999991" },
        { name: "Moniepoint MFB", code: "50515" },
      ];
    }

    const response = await fetch("https://api.paystack.co/bank?currency=NGN", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
      },
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Failed to fetch bank list from Paystack");
    }

    return result.data.map((bank: any) => ({
      name: bank.name,
      code: bank.code,
    }));
  }

  /**
   * Resolve a bank account number to get verified account name
   * @param accountNumber 10 digit account number
   * @param bankCode Bank code (from listBanks)
   */
  static async resolveAccount(accountNumber: string, bankCode: string): Promise<ResolveAccountResponse> {
    if (this.isMock()) {
      console.warn("⚠️ Using Mock Paystack implementation for resolveAccount");
      if (accountNumber.length !== 10) {
        throw new Error(accountNumber.length < 10 ? "Account number is too short" : "Account number is too long");
      }
      return {
        account_number: accountNumber,
        account_name: "JOHN DOE (MOCK VERIFIED)",
      };
    }

    const response = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.getSecretKey()}`,
        },
      }
    );

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Could not resolve account details. Please check details.");
    }

    return {
      account_number: result.data.account_number,
      account_name: result.data.account_name,
    };
  }

  /**
   * Create a transfer recipient on Paystack
   * @param name Account owner's name
   * @param accountNumber Account number
   * @param bankCode Bank code
   */
  static async createTransferRecipient(
    name: string,
    accountNumber: string,
    bankCode: string
  ): Promise<string> {
    if (this.isMock()) {
      console.warn("⚠️ Using Mock Paystack implementation for createTransferRecipient");
      return "rcp_mock_recipient_code";
    }

    const response = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "nuban",
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN",
      }),
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Failed to create Paystack transfer recipient");
    }

    return result.data.recipient_code;
  }

  /**
   * Initiate a transfer/withdrawal to a bank account
   * @param recipientCode Recipient code from createTransferRecipient
   * @param amountInNaira Amount in Naira to withdraw
   * @param reason Description/reason
   * @param reference Custom reference
   */
  static async initiateTransfer(
    recipientCode: string,
    amountInNaira: number,
    reason: string = "Xea Wallet Withdrawal",
    reference?: string
  ): Promise<{ transfer_code: string; status: string }> {
    const amountInKobo = Math.round(amountInNaira * 100);
    const finalReference = reference || `trsf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (this.isMock()) {
      console.warn("⚠️ Using Mock Paystack implementation for initiateTransfer");
      return {
        transfer_code: "trsf_mock_code",
        status: "success", // Mock returns success immediately
      };
    }

    const response = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: amountInKobo,
        recipient: recipientCode,
        reason,
        reference: finalReference,
      }),
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Failed to initiate Paystack transfer");
    }

    return {
      transfer_code: result.data.transfer_code,
      status: result.data.status, // e.g. 'otp', 'success', 'pending'
    };
  }

  /**
   * Resolve a BVN to get verified holder details
   * @param bvn 11 digit Bank Verification Number
   */
  static async resolveBVN(bvn: string): Promise<{ first_name: string; last_name: string; phone: string; dob: string }> {
    if (this.isMock()) {
      console.warn("⚠️ Using Mock Paystack implementation for resolveBVN");
      if (bvn.length !== 11) {
        throw new Error("Invalid BVN. Must be exactly 11 digits.");
      }
      return {
        first_name: "JOHN",
        last_name: "DOE",
        phone: "08012345678",
        dob: "1990-01-01",
      };
    }

    const response = await fetch(`https://api.paystack.co/bank/resolve_bvn/${bvn}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
      },
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Failed to resolve BVN. Please confirm it is correct.");
    }

    return {
      first_name: result.data.first_name,
      last_name: result.data.last_name,
      phone: result.data.mobile || result.data.formatted_phone || "",
      dob: result.data.dob || "",
    };
  }

  /**
   * Verify if a bank account matches a BVN
   */
  static async matchBVN(accountNumber: string, bankCode: string, bvn: string): Promise<boolean> {
    if (this.isMock()) {
      console.warn("⚠️ Using Mock Paystack implementation for matchBVN");
      if (accountNumber.includes("fail")) {
        return false;
      }
      return true;
    }

    const response = await fetch(
      `https://api.paystack.co/bank/match_bvn?account_number=${accountNumber}&bank_code=${bankCode}&bvn=${bvn}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.getSecretKey()}`,
        },
      }
    );

    const result = await response.json();
    if (!response.ok || !result.status) {
      return false;
    }

    // Paystack returns validation match details
    return result.data.is_blacklisted === false;
  }

  /**
   * Initiate a bulk transfer to multiple bank accounts
   */
  static async initiateBulkTransfer(
    transfers: { amountInNaira: number; recipientCode: string; reference: string; reason?: string }[]
  ): Promise<{ transfer_code: string; status: string; reference: string }[]> {
    if (this.isMock()) {
      console.warn("⚠️ Using Mock Paystack implementation for initiateBulkTransfer");
      return transfers.map(t => ({
        transfer_code: `trsf_mock_bulk_${Math.random().toString(36).substr(2, 9)}`,
        status: "success",
        reference: t.reference,
      }));
    }

    const payload = {
      source: "balance",
      transfers: transfers.map(t => ({
        amount: Math.round(t.amountInNaira * 100),
        recipient: t.recipientCode,
        reference: t.reference,
        reason: t.reason || "Xea Payout",
      })),
    };

    const response = await fetch("https://api.paystack.co/transfer/bulk", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.getSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok || !result.status) {
      throw new Error(result.message || "Failed to initiate bulk transfer");
    }

    // Map list of transfers from response data
    return result.data.transfers.map((t: any) => ({
      transfer_code: t.transfer_code,
      status: t.status || "pending",
      reference: t.reference,
    }));
  }
}
