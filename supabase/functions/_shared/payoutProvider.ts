export type GatewayName = "kora" | "paystack";

export interface BankItem {
  name: string;
  code: string;
}

export interface InitializePaymentParams {
  email: string;
  amount: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
  customerName?: string;
}

export interface InitializePaymentResult {
  success: boolean;
  provider: GatewayName;
  authorization_url?: string;
  checkout_url?: string;
  reference: string;
  access_code?: string;
  error?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  provider: GatewayName;
  status: string;
  amountPaid: number;
  currency: string;
  reference: string;
  customerEmail?: string;
  error?: string;
}

export interface PayoutResult {
  success: boolean;
  provider: GatewayName;
  status: string;
  reference: string;
  transferCode?: string;
  fee: number;
  error?: string;
}

function getKoraSecretKey(): string {
  return (
    Deno.env.get("KORAPAY_SECRET_KEY") ||
    Deno.env.get("KORA_SECRET_KEY") ||
    ""
  ).trim();
}

function getPaystackSecretKey(): string {
  return (Deno.env.get("PAYSTACK_SECRET_KEY") || "").trim();
}

export function getActiveGateway(): GatewayName {
  const configured = (
    Deno.env.get("PAYOUT_PROVIDER") ||
    Deno.env.get("PAYMENT_GATEWAY") ||
    "kora"
  )
    .toLowerCase()
    .trim();
  if (configured === "paystack" && getPaystackSecretKey()) {
    return "paystack";
  }
  if (getKoraSecretKey()) {
    return "kora";
  }
  if (getPaystackSecretKey()) {
    return "paystack";
  }
  return configured === "paystack" ? "paystack" : "kora";
}

/**
 * Unified transfer fee schedule matching lib/payment/payoutProvider.ts:
 * - Paystack: <= 5,000 -> 10.75; <= 50,000 -> 26.88; > 50,000 -> 53.75
 * - Kora: KORA_TRANSFER_FEE env if valid, else <= 5,000 -> 15; <= 50,000 -> 25; > 50,000 -> 35
 */
export function calculateTransferFee(
  amountNaira: number,
  provider: GatewayName = getActiveGateway(),
): number {
  const amt = Math.max(0, Number(amountNaira) || 0);
  if (provider === "paystack") {
    if (amt <= 5000) return 10.75;
    if (amt <= 50000) return 26.88;
    return 53.75;
  }
  const envFee = Number(Deno.env.get("KORA_TRANSFER_FEE") || "");
  if (Number.isFinite(envFee) && envFee >= 0 && Deno.env.get("KORA_TRANSFER_FEE")) {
    return Math.round(envFee * 100) / 100;
  }
  if (amt <= 5000) return 15;
  if (amt <= 50000) return 25;
  return 35;
}

/**
 * Computes gateway collection surcharge so platform collects full net amount.
 */
export function calculateGatewayCharge(amountNaira: number): {
  baseAmount: number;
  fee: number;
  totalCharge: number;
} {
  const baseAmount = Math.round(Math.max(0, Number(amountNaira) || 0) * 100) / 100;
  const provider = getActiveGateway();
  if (baseAmount <= 0) {
    return { baseAmount: 0, fee: 0, totalCharge: 0 };
  }
  if (provider === "paystack") {
    // 1.5% + NGN 100 (waived < 2500), capped at NGN 2000
    const flat = baseAmount < 2500 ? 0 : 100;
    const rawFee = Math.min(2000, Math.round((baseAmount * 0.015 + flat) * 100) / 100);
    return {
      baseAmount,
      fee: rawFee,
      totalCharge: Math.round((baseAmount + rawFee) * 100) / 100,
    };
  }
  // Kora: ~1.5% capped at 2000
  const rawFee = Math.min(2000, Math.round(baseAmount * 0.015 * 100) / 100);
  return {
    baseAmount,
    fee: rawFee,
    totalCharge: Math.round((baseAmount + rawFee) * 100) / 100,
  };
}

function bridgeEdgeCallbackUrl(callbackUrl?: string): string {
  const raw = String(callbackUrl || "").trim();
  if (!raw) return "https://paayh.com/logged-in";
  const lower = raw.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return raw;
  }
  const baseCallback = (Deno.env.get("APP_BASE_URL") || "https://paayh.com").replace(/\/+$/, "");
  const qIndex = raw.indexOf("?");
  const baseScheme = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const url = new URL(`${baseCallback}/api/payments/mobile-callback`);
  url.searchParams.set("redirect", baseScheme);
  if (qIndex !== -1) {
    const extra = new URLSearchParams(raw.slice(qIndex + 1));
    extra.forEach((v, k) => {
      if (k !== "redirect") url.searchParams.set(k, v);
    });
  }
  return url.toString();
}

function sanitizeKoraMetadata(
  email: string,
  metadata?: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {
    type: String(metadata?.type || "campaign").slice(0, 50),
    user_email: String(metadata?.user_email || email).slice(0, 50),
  };
  if (!metadata) return clean;
  for (const [key, val] of Object.entries(metadata)) {
    if (key === "type" || key === "user_email" || val === null || val === undefined) continue;
    if (typeof val === "number" && Number.isFinite(val)) {
      clean[key] = val;
    } else if (typeof val === "boolean") {
      clean[key] = val;
    } else if (typeof val === "string" && val.trim() !== "") {
      clean[key] = val.slice(0, 50);
    }
  }
  return clean;
}

export async function initializePayment(
  params: InitializePaymentParams,
): Promise<InitializePaymentResult> {
  const primary = getActiveGateway();
  const order: GatewayName[] = primary === "kora" ? ["kora", "paystack"] : ["paystack", "kora"];
  const normalizedAmount = Math.round(Number(params.amount) * 100) / 100;
  const resolvedCallback = bridgeEdgeCallbackUrl(params.callbackUrl);

  let lastError = "No payment gateway configured";

  for (const provider of order) {
    if (provider === "kora") {
      const secret = getKoraSecretKey();
      if (!secret) continue;
      try {
        const koraMeta = sanitizeKoraMetadata(params.email, params.metadata);
        const buildKoraBody = (redirectTarget: string) =>
          JSON.stringify({
            amount: normalizedAmount,
            redirect_url: redirectTarget,
            notification_url:
              Deno.env.get("KORA_WEBHOOK_URL") ||
              "https://paayh.com/api/payments/kora-webhook",
            currency: "NGN",
            reference: params.reference,
            narration: String(params.metadata?.type || "XEA Wallet/Campaign Payment").slice(0, 100),
            ...(params.channels && params.channels.length > 0
              ? { channels: params.channels, default_channel: params.channels[0] }
              : {}),
            customer: {
              email: params.email.toLowerCase().trim(),
              name: (params.customerName || params.email.split("@")[0] || "XEA User").slice(0, 60),
            },
            metadata: koraMeta,
          });

        const res = await fetch("https://api.korapay.com/merchant/api/v1/charges/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: buildKoraBody(resolvedCallback),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.status && data?.data?.checkout_url) {
          return {
            success: true,
            provider: "kora",
            authorization_url: data.data.checkout_url,
            checkout_url: data.data.checkout_url,
            reference: data.data.reference || params.reference,
          };
        }
        lastError = data?.message || "Kora initialization failed";
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : "Kora request failed";
      }
    }

    if (provider === "paystack") {
      const secret = getPaystackSecretKey();
      if (!secret) continue;
      try {
        const res = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: params.email,
            amount: Math.round(normalizedAmount * 100),
            reference: params.reference,
            callback_url: resolvedCallback,
            metadata: params.metadata || {},
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.status && data?.data?.authorization_url) {
          return {
            success: true,
            provider: "paystack",
            authorization_url: data.data.authorization_url,
            checkout_url: data.data.authorization_url,
            reference: data.data.reference || params.reference,
            access_code: data.data.access_code,
          };
        }
        lastError = data?.message || "Paystack initialization failed";
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : "Paystack request failed";
      }
    }
  }

  return {
    success: false,
    provider: primary,
    reference: params.reference,
    error: lastError,
  };
}

export async function verifyPaymentWithProvider(
  reference: string,
  preferredProvider?: GatewayName,
): Promise<VerifyPaymentResult> {
  const cleanRef = String(reference || "").trim();
  const isKoraRef = cleanRef.startsWith("kora_");
  const isPaystackRef = cleanRef.startsWith("ref_");
  const order: GatewayName[] = isKoraRef
    ? ["kora", "paystack"]
    : isPaystackRef
    ? ["paystack", "kora"]
    : preferredProvider
    ? [preferredProvider, preferredProvider === "kora" ? "paystack" : "kora"]
    : getActiveGateway() === "kora"
    ? ["kora", "paystack"]
    : ["paystack", "kora"];

  let lastError = "Verification failed";
  let lastStatus: string = "failed";

  for (const provider of order) {
    if (provider === "kora") {
      const secret = getKoraSecretKey();
      if (!secret) continue;
      try {
        const res = await fetch(
          `https://api.korapay.com/merchant/api/v1/charges/${encodeURIComponent(cleanRef)}`,
          {
            headers: {
              Authorization: `Bearer ${secret}`,
              "Content-Type": "application/json",
            },
          },
        );
        const data = await res.json().catch(() => ({}));
        const koraStatus = String(data?.data?.status || "").toLowerCase().trim();
        if (res.ok && data?.status && (koraStatus === "success" || koraStatus === "successful")) {
          return {
            success: true,
            provider: "kora",
            status: "success",
            amountPaid: Number(data.data.amount ?? data.data.amount_paid ?? 0),
            currency: String(data.data.currency || "NGN").toUpperCase(),
            reference: String(data.data.reference || cleanRef),
            customerEmail: data.data.customer?.email
              ? String(data.data.customer.email).toLowerCase().trim()
              : undefined,
          };
        }
        if (koraStatus === "pending" || koraStatus === "processing") {
          lastStatus = "pending";
        }
        lastError = data?.message || `Kora status: ${koraStatus || "unknown"}`;
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : "Kora verify failed";
      }
    }

    if (provider === "paystack") {
      const secret = getPaystackSecretKey();
      if (!secret) continue;
      try {
        const res = await fetch(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(cleanRef)}`,
          {
            headers: { Authorization: `Bearer ${secret}` },
          },
        );
        const data = await res.json().catch(() => ({}));
        const paystackStatus = String(data?.data?.status || "").toLowerCase().trim();
        if (res.ok && data?.status && paystackStatus === "success") {
          return {
            success: true,
            provider: "paystack",
            status: "success",
            amountPaid: Number(data.data.amount || 0) / 100,
            currency: String(data.data.currency || "NGN").toUpperCase(),
            reference: String(data.data.reference || cleanRef),
            customerEmail: data.data.customer?.email
              ? String(data.data.customer.email).toLowerCase().trim()
              : undefined,
          };
        }
        if (paystackStatus === "ongoing" || paystackStatus === "pending" || paystackStatus === "processing") {
          lastStatus = "pending";
        }
        lastError = data?.message || `Paystack status: ${paystackStatus || "unknown"}`;
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : "Paystack verify failed";
      }
    }
  }

  return {
    success: false,
    provider: order[0],
    status: lastStatus === "pending" ? "pending" : "failed",
    amountPaid: 0,
    currency: "NGN",
    reference: cleanRef,
    error: lastError,
  };
}

export async function listBanks(): Promise<{
  success: boolean;
  provider: GatewayName;
  banks: BankItem[];
  error?: string;
}> {
  const koraKey = getKoraSecretKey();
  const paystackKey = getPaystackSecretKey();
  const order: GatewayName[] = getActiveGateway() === "kora" ? ["kora", "paystack"] : ["paystack", "kora"];

  for (const provider of order) {
    if (provider === "kora" && koraKey) {
      try {
        const res = await fetch(
          "https://api.korapay.com/merchant/api/v1/misc/banks?countryCode=NG",
          {
            headers: {
              Authorization: `Bearer ${koraKey}`,
              "Content-Type": "application/json",
            },
          },
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.status && Array.isArray(data.data)) {
          return {
            success: true,
            provider: "kora",
            banks: data.data.map((b: Record<string, unknown>) => ({
              name: String(b.name || ""),
              code: String(b.code || ""),
            })),
          };
        }
      } catch {
        // Fallback to next gateway
      }
    }

    if (provider === "paystack" && paystackKey) {
      try {
        const res = await fetch("https://api.paystack.co/bank?country=nigeria", {
          headers: { Authorization: `Bearer ${paystackKey}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.status && Array.isArray(data.data)) {
          return {
            success: true,
            provider: "paystack",
            banks: data.data.map((b: Record<string, unknown>) => ({
              name: String(b.name || ""),
              code: String(b.code || ""),
            })),
          };
        }
      } catch {
        // Fallback to next gateway
      }
    }
  }

  return {
    success: false,
    provider: getActiveGateway(),
    banks: [],
    error: "Failed to load Nigerian bank list.",
  };
}

export async function resolveBankAccount(
  accountNumber: string,
  bankCode: string,
): Promise<{
  success: boolean;
  provider: GatewayName;
  account_name?: string;
  account_number?: string;
  error?: string;
}> {
  const koraKey = getKoraSecretKey();
  const paystackKey = getPaystackSecretKey();
  const order: GatewayName[] = getActiveGateway() === "kora" ? ["kora", "paystack"] : ["paystack", "kora"];

  let lastError = "Could not verify bank account details.";
  for (const provider of order) {
    if (provider === "kora" && koraKey) {
      try {
        const res = await fetch(
          "https://api.korapay.com/merchant/api/v1/misc/banks/resolve",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${koraKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ bank: bankCode, account: accountNumber }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.status && data?.data?.account_name) {
          return {
            success: true,
            provider: "kora",
            account_name: String(data.data.account_name),
            account_number: String(data.data.account_number || accountNumber),
          };
        }
        lastError = data?.message || lastError;
      } catch {
        // try fallback
      }
    }

    if (provider === "paystack" && paystackKey) {
      try {
        const res = await fetch(
          `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
          {
            headers: { Authorization: `Bearer ${paystackKey}` },
          },
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.status && data?.data?.account_name) {
          return {
            success: true,
            provider: "paystack",
            account_name: String(data.data.account_name),
            account_number: String(data.data.account_number || accountNumber),
          };
        }
        lastError = data?.message || lastError;
      } catch {
        // try fallback
      }
    }
  }

  return {
    success: false,
    provider: getActiveGateway(),
    error: lastError,
  };
}

export async function initiatePayout(params: {
  reference: string;
  amount: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  customerEmail: string;
  customerName: string;
  narration?: string;
}): Promise<PayoutResult> {
  const koraKey = getKoraSecretKey();
  const paystackKey = getPaystackSecretKey();
  const primary = getActiveGateway();
  const order: GatewayName[] = primary === "kora" ? ["kora", "paystack"] : ["paystack", "kora"];

  let lastError = "Transfer payout could not be processed.";

  for (const provider of order) {
    if (provider === "kora" && koraKey) {
      try {
        const res = await fetch(
          "https://api.korapay.com/merchant/api/v1/transactions/disburse",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${koraKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reference: params.reference,
              destination: {
                type: "bank_account",
                amount: params.amount,
                currency: "NGN",
                narration: params.narration || "XEA Wallet Withdrawal",
                bank_account: {
                  bank: params.bankCode,
                  account: params.accountNumber,
                },
                customer: {
                  name: params.customerName || params.accountName,
                  email: params.customerEmail,
                },
              },
            }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.status) {
          return {
            success: true,
            provider: "kora",
            status: String(data?.data?.status || "processing"),
            reference: String(data?.data?.reference || params.reference),
            fee: calculateTransferFee(params.amount, "kora"),
          };
        }
        lastError = data?.message || "Kora disbursement failed";
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : "Kora payout network error";
      }
    }

    if (provider === "paystack" && paystackKey) {
      try {
        const rcRes = await fetch("https://api.paystack.co/transferrecipient", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${paystackKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "nuban",
            name: params.accountName,
            account_number: params.accountNumber,
            bank_code: params.bankCode,
            currency: "NGN",
          }),
        });
        const rcData = await rcRes.json().catch(() => ({}));
        if (!rcRes.ok || !rcData?.status || !rcData?.data?.recipient_code) {
          lastError = rcData?.message || "Paystack recipient creation failed";
          continue;
        }

        const trRes = await fetch("https://api.paystack.co/transfer", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${paystackKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source: "balance",
            amount: Math.round(params.amount * 100),
            recipient: rcData.data.recipient_code,
            reason: params.narration || "XEA Wallet Withdrawal",
            reference: params.reference,
          }),
        });
        const trData = await trRes.json().catch(() => ({}));
        if (trRes.ok && trData?.status) {
          return {
            success: true,
            provider: "paystack",
            status: String(trData?.data?.status || "processing"),
            reference: String(trData?.data?.reference || params.reference),
            transferCode: trData?.data?.transfer_code,
            fee: calculateTransferFee(params.amount, "paystack"),
          };
        }
        lastError = trData?.message || "Paystack transfer failed";
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : "Paystack payout network error";
      }
    }
  }

  return {
    success: false,
    provider: primary,
    status: "failed",
    reference: params.reference,
    fee: calculateTransferFee(params.amount, primary),
    error: lastError,
  };
}
