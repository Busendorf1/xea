import { PayoutProvider } from "@/lib/payment/payoutProvider";

export interface DecodedStatementCursor {
  createdAt: string;
  id: string;
}

export function encodeStatementCursor(row: {
  created_at?: string | null;
  id?: string | number | null;
}): string | null {
  if (!row?.created_at || row.id === undefined || row.id === null) return null;
  const payload = JSON.stringify({ c: String(row.created_at), i: String(row.id) });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeStatementCursor(rawCursor: string | null): DecodedStatementCursor | null {
  if (!rawCursor || rawCursor.length > 256) return null;
  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8"));
    const c = typeof parsed?.c === "string" ? parsed.c.trim() : "";
    const i = typeof parsed?.i === "string" ? parsed.i.trim() : "";
    if (!c || Number.isNaN(Date.parse(c))) return null;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(i)) return null;
    return { createdAt: c, id: i };
  } catch {
    return null;
  }
}

/**
 * Normalizes a payment/withdrawal row so receipts always include accurate
 * fee, net_amount, provider, and fee_bearer fields matching the gateway schedule.
 */
export function normalizeReceiptTransaction<T extends Record<string, any>>(row: T) {
  const meta = row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {};
  const grossAmount = Number(row.amount || 0);

  if (row.type === "withdrawal") {
    const provider =
      meta.provider === "paystack" || meta.provider === "kora" ? meta.provider : undefined;
    const fee =
      typeof meta.fee === "number" && Number.isFinite(meta.fee)
        ? meta.fee
        : PayoutProvider.calculateTransferFee(grossAmount, provider);
    const netAmount =
      typeof meta.net_amount === "number" && Number.isFinite(meta.net_amount)
        ? meta.net_amount
        : Math.max(0, Number((grossAmount - fee).toFixed(2)));
    const resolvedProvider = provider || meta.provider || PayoutProvider.getActiveGateway();
    const feeBearer = meta.fee_bearer || "user";

    return {
      ...row,
      fee,
      net_amount: netAmount,
      provider: resolvedProvider,
      fee_bearer: feeBearer,
      metadata: {
        ...meta,
        provider: resolvedProvider,
        fee,
        net_amount: netAmount,
        fee_bearer: feeBearer,
      },
    };
  }

  const fee = typeof meta.fee === "number" && Number.isFinite(meta.fee) ? meta.fee : 0;
  const netAmount =
    typeof meta.net_amount === "number" && Number.isFinite(meta.net_amount)
      ? meta.net_amount
      : Math.max(0, Number((grossAmount - fee).toFixed(2)));

  return {
    ...row,
    fee,
    net_amount: netAmount,
    provider: meta.provider || null,
    fee_bearer: meta.fee_bearer || null,
    metadata: meta,
  };
}
