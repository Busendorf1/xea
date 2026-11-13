import supabaseAdmin from "@/lib/utils/dbAdmin";

/**
 * Resolves a payment record by primary `reference` or stored gateway reference
 * (e.g. Kora `kora_pay_*` saved in `gateway_reference` or `metadata`).
 */
export async function findPaymentByAnyReference(
  primaryRef: string,
  secondaryRef?: string | null
): Promise<{ data: any | null; error: any | null }> {
  const candidates = [primaryRef, secondaryRef]
    .map((r) => (typeof r === "string" ? r.trim() : ""))
    .filter((r, idx, arr) => Boolean(r) && arr.indexOf(r) === idx);

  for (const candidate of candidates) {
    const { data: directMatch, error: directErr } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("reference", candidate)
      .maybeSingle();

    if (directErr) {
      return { data: null, error: directErr };
    }
    if (directMatch) {
      return { data: directMatch, error: null };
    }

    // Optional column check (ignore column-missing errors across schema variants)
    try {
      const { data: gatewayColMatch, error: colErr } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("gateway_reference", candidate)
        .maybeSingle();
      if (!colErr && gatewayColMatch) {
        return { data: gatewayColMatch, error: null };
      }
    } catch {
      // Column may not exist in older schemas
    }

    const [{ data: koraMetaMatch }, { data: gwMetaMatch }] = await Promise.all([
      supabaseAdmin
        .from("payments")
        .select("*")
        .contains("metadata", { kora_reference: candidate })
        .maybeSingle(),
      supabaseAdmin
        .from("payments")
        .select("*")
        .contains("metadata", { gateway_reference: candidate })
        .maybeSingle(),
    ]);

    if (koraMetaMatch) return { data: koraMetaMatch, error: null };
    if (gwMetaMatch) return { data: gwMetaMatch, error: null };
  }

  return { data: null, error: null };
}

/**
 * Resolves a safe public base URL for payment gateway callbacks and webhooks.
 * Always falls back to https://paayh.com when NEXT_PUBLIC_BASE_URL is unset or non-HTTPS localhost.
 */
export function resolvePublicPaymentOrigin(preferredOrigin?: string | null): string {
  const candidates = [preferredOrigin, process.env.NEXT_PUBLIC_BASE_URL, "https://paayh.com"];
  for (const raw of candidates) {
    if (!raw || typeof raw !== "string") continue;
    const trimmed = raw.trim().replace(/\/+$/, "");
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      const isHttps = parsed.protocol === "https:";
      const isLocalHttp =
        process.env.NODE_ENV !== "production" &&
        parsed.protocol === "http:" &&
        !parsed.hostname.includes("localhost") &&
        !parsed.hostname.startsWith("127.");
      if (isHttps || isLocalHttp) {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // Ignore invalid URL
    }
  }
  return "https://paayh.com";
}

/**
 * Bridges non-HTTP mobile deep-link callback URLs (e.g. `xea-auth://payment-callback` or `exp://...`)
 * through `/api/payments/mobile-callback` so both Paystack and KoraPay return reliably to the mobile app.
 */
export function bridgeMobilePaymentCallbackUrl(
  callbackUrl: string,
  preferredOrigin?: string | null
): string {
  const trimmed = String(callbackUrl || "").trim();
  if (!trimmed) {
    return `${resolvePublicPaymentOrigin(preferredOrigin)}/logged-in`;
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return trimmed;
  }

  // Extract optional query params (e.g. boost_ref, type, tab) to preserve cleanly at top-level as well
  let baseSchemeUrl = trimmed;
  const extraParams = new URLSearchParams();
  const qIndex = trimmed.indexOf("?");
  if (qIndex !== -1) {
    baseSchemeUrl = trimmed.slice(0, qIndex);
    const existing = new URLSearchParams(trimmed.slice(qIndex + 1));
    existing.forEach((v, k) => {
      if (k !== "redirect") extraParams.set(k, v);
    });
  }

  const origin = resolvePublicPaymentOrigin(preferredOrigin);
  const bridgeUrl = new URL(`${origin}/api/payments/mobile-callback`);
  bridgeUrl.searchParams.set("redirect", baseSchemeUrl);
  extraParams.forEach((v, k) => bridgeUrl.searchParams.set(k, v));
  return bridgeUrl.toString();
}
