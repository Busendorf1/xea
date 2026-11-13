import { errorResponse, isAdminEmail, jsonResponse } from "../_shared/cors.ts";
import {
  activatePaidResource,
  deductWalletAtomic,
  refundWalletAtomic,
  validatePayableResource,
} from "../_shared/paymentActivation.ts";
import {
  initializePayment,
  verifyPaymentWithProvider,
} from "../_shared/payoutProvider.ts";
import { validateSafeUrl } from "../_shared/urlValidation.ts";
import { verifyTransactionPinEdge } from "../_shared/walletPin.ts";

function isSafeCallbackUrl(url: unknown): string {
  const raw = String(url || "").trim();
  if (!raw) return "xea-auth://payment-callback";
  if (raw.startsWith("xea-auth://") || raw.startsWith("xea://") || raw.startsWith("exp://")) {
    return raw;
  }
  const checked = validateSafeUrl(raw, { allowRelativePath: false });
  return checked.valid && checked.sanitized
    ? checked.sanitized
    : "xea-auth://payment-callback";
}

export async function handleTransfer(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const recipientRaw = String(
    body?.recipientEmail || body?.recipient || body?.to || "",
  )
    .toLowerCase()
    .trim();
  const amount = Math.round(Number(body?.amount || 0) * 100) / 100;
  const pin = body?.pin ?? body?.walletPin ?? body?.transactionPin;

  if (!recipientRaw) {
    return errorResponse("Recipient email or username is required.", 400);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return errorResponse("Transfer amount must be greater than zero.", 400);
  }
  if (recipientRaw === cleanEmail) {
    return errorResponse("You cannot transfer funds to yourself.", 400);
  }

  // Enforce mandatory Wallet PIN + DB brute-force lockout
  const pinCheck = await verifyTransactionPinEdge(supabase, cleanEmail, pin);
  if (!pinCheck.valid) {
    return errorResponse(pinCheck.error || "Invalid Wallet PIN.", pinCheck.statusCode, {
      attemptsLeft: pinCheck.attemptsLeft,
      retryAfter: pinCheck.retryAfter,
    });
  }

  // Verify sender & recipient are active (not deactivated/banned/suspended)
  const { data: tombstone } = await supabase
    .from("deactivated_users")
    .select("email")
    .eq("email", cleanEmail)
    .maybeSingle();
  if (tombstone) {
    return errorResponse("This account has been deactivated.", 403);
  }

  const { data: sender } = await supabase
    .from("users")
    .select("email, username, balance, ad_account_status, suspended_until")
    .ilike("email", cleanEmail)
    .maybeSingle();
  if (!sender) {
    return errorResponse("Sender account not found.", 404);
  }
  if (
    sender.ad_account_status === "banned" ||
    sender.ad_account_status === "deactivated" ||
    (sender.suspended_until && new Date(sender.suspended_until).getTime() > Date.now())
  ) {
    return errorResponse("Your account is currently restricted from transfers.", 403);
  }

  // Resolve recipient email (supports email or @username)
  let recipientEmail = recipientRaw;
  if (!recipientRaw.includes("@") || recipientRaw.startsWith("@")) {
    const uname = recipientRaw.replace(/^@/, "");
    const { data: recByUname } = await supabase
      .from("users")
      .select("email")
      .ilike("username", uname)
      .maybeSingle();
    if (!recByUname?.email) {
      return errorResponse("Recipient user not found.", 404);
    }
    recipientEmail = String(recByUname.email).toLowerCase().trim();
  }

  if (recipientEmail === cleanEmail) {
    return errorResponse("You cannot transfer funds to yourself.", 400);
  }

  const { data: recTomb } = await supabase
    .from("deactivated_users")
    .select("email")
    .eq("email", recipientEmail)
    .maybeSingle();
  if (recTomb) {
    return errorResponse("Recipient account is deactivated and cannot receive funds.", 400);
  }

  const transferRef = `tr_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  const { data: rpcRes, error: rpcErr } = await supabase.rpc(
    "transfer_wallet_atomic",
    {
      p_sender_email: cleanEmail,
      p_recipient_identifier: recipientEmail,
      p_amount: amount,
      p_reference: transferRef,
    },
  );

  if (rpcErr || !rpcRes?.success) {
    return errorResponse(
      rpcRes?.error || rpcErr?.message || "Transfer failed. Please check balance.",
      400,
    );
  }

  return jsonResponse({
    success: true,
    reference: rpcRes.reference || transferRef,
    amount,
    recipient: recipientEmail,
    newBalance: Number(rpcRes.sender_new_balance ?? rpcRes.new_balance ?? 0),
    message: `Successfully transferred ₦${amount.toLocaleString()} to ${recipientEmail}.`,
  });
}

export async function handleWalletPay(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const payType = String(body?.type || body?.metadata?.type || "publish_ad").trim();
  const metadata = (body?.metadata as Record<string, unknown>) || {};
  const requestedAmount = Number(body?.amount || 0);
  const pin = body?.pin ?? body?.walletPin ?? body?.transactionPin;

  // Enforce mandatory Wallet PIN
  const pinCheck = await verifyTransactionPinEdge(supabase, cleanEmail, pin);
  if (!pinCheck.valid) {
    return errorResponse(pinCheck.error || "Invalid Wallet PIN.", pinCheck.statusCode, {
      attemptsLeft: pinCheck.attemptsLeft,
      retryAfter: pinCheck.retryAfter,
    });
  }

  // Reject deactivated / restricted callers
  const { data: tomb } = await supabase
    .from("deactivated_users")
    .select("email")
    .eq("email", cleanEmail)
    .maybeSingle();
  if (tomb) {
    return errorResponse("Account is deactivated.", 403);
  }

  // Validate resource existence, ownership, approval, 72h expiry, editingId, & server-computed cost BEFORE deduction
  // (No isZeroCostPublish bypass permitted)
  const validation = await validatePayableResource(supabase, {
    payType,
    userEmail: cleanEmail,
    metadata,
    requestedAmount,
  });

  if (!validation.valid) {
    return errorResponse(
      validation.error || "Invalid campaign or payment resource.",
      validation.statusCode,
    );
  }

  const isAdmin = isAdminEmail(cleanEmail);
  const serverCost = validation.serverCost;
  if (!isAdmin && (!Number.isFinite(serverCost) || serverCost <= 0)) {
    return errorResponse("Calculated payment amount must be greater than zero.", 400);
  }
  if (!Number.isFinite(serverCost) || serverCost < 0) {
    return errorResponse("Calculated payment amount is invalid.", 400);
  }

  const payRef = `wpay_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const effectiveCost = isAdmin && serverCost === 0 ? 0 : serverCost;
  let newBalance: number | undefined = undefined;

  if (effectiveCost > 0) {
    // Atomically deduct from wallet via RPC
    const deduction = await deductWalletAtomic(
      supabase,
      cleanEmail,
      effectiveCost,
      payType,
      payRef,
    );

    if (!deduction.success) {
      return errorResponse(
        deduction.error || "Insufficient wallet balance.",
        400,
      );
    }
    newBalance = deduction.newBalance;
  }

  // Activate paid resource; atomically refund wallet if activation fails
  const activation = await activatePaidResource(
    supabase,
    payType,
    cleanEmail,
    effectiveCost,
    { ...metadata, is_admin_post: isAdmin || Boolean(metadata.is_admin_post), reference: payRef },
  );

  if (!activation.success) {
    if (effectiveCost > 0) {
      await refundWalletAtomic(
        supabase,
        cleanEmail,
        effectiveCost,
        `${payType}_activation_rollback`,
        `refund_${payRef}`,
      );
    }
    return errorResponse(
      activation.error ||
        (effectiveCost > 0
          ? "Activation failed; wallet balance has been refunded."
          : "Activation failed."),
      400,
    );
  }

  // Record completed payment row for financial audit/statement
  await supabase.from("payments").insert([
    {
      user_email: cleanEmail,
      reference: payRef,
      amount: effectiveCost,
      status: "success",
      type: payType,
      description: effectiveCost === 0 && isAdmin
        ? `Admin free publish (${payType})`
        : `Wallet payment (${payType})`,
      metadata: {
        ...metadata,
        type: payType,
        user_email: cleanEmail,
        activated_id: activation.activatedId || null,
        is_admin_post: isAdmin || undefined,
        via: effectiveCost === 0 && isAdmin ? "admin_free" : "wallet",
      },
    },
  ]);

  return jsonResponse({
    success: true,
    reference: payRef,
    amount: effectiveCost,
    newBalance,
    activatedId: activation.activatedId,
    message: activation.message || "Payment successful.",
  });
}

export async function handleInitialize(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const metadata = (body?.metadata as Record<string, unknown>) || {};
  const payType = String(body?.type || metadata?.type || "wallet_fund").trim();
  const requestedAmount = Number(body?.amount || 0);
  const callbackUrl = isSafeCallbackUrl(body?.callbackUrl);

  const validation = await validatePayableResource(supabase, {
    payType,
    userEmail: cleanEmail,
    metadata,
    requestedAmount,
  });

  if (!validation.valid) {
    return errorResponse(
      validation.error || "Invalid payable resource.",
      validation.statusCode,
    );
  }

  const finalAmount = validation.serverCost;
  const reference = `pay_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  const cleanMeta: Record<string, unknown> = {
    type: payType,
    user_email: cleanEmail,
  };
  if (metadata.ad_id) cleanMeta.ad_id = String(metadata.ad_id).slice(0, 64);
  if (metadata.highlight_id) cleanMeta.highlight_id = String(metadata.highlight_id).slice(0, 64);
  if (metadata.subscriber_id) cleanMeta.subscriber_id = String(metadata.subscriber_id).slice(0, 64);
  if (metadata.editingId) cleanMeta.editingId = String(metadata.editingId).slice(0, 64);
  if (metadata.addImpressions !== undefined) cleanMeta.addImpressions = Number(metadata.addImpressions);
  if (metadata.newCostPerImpression !== undefined) {
    cleanMeta.newCostPerImpression = Number(metadata.newCostPerImpression);
  }

  const initRes = await initializePayment({
    email: cleanEmail,
    amount: finalAmount,
    reference,
    callbackUrl,
    metadata: cleanMeta,
    customerName: String(metadata.name || cleanEmail.split("@")[0] || "XEA Customer").slice(0, 60),
  });

  if (!initRes.success || !initRes.authorization_url) {
    return errorResponse(
      initRes.error || "Could not initialize payment checkout right now.",
      503,
    );
  }

  const { error: insErr } = await supabase.from("payments").insert([
    {
      user_email: cleanEmail,
      reference: initRes.reference,
      amount: finalAmount,
      status: "pending",
      type: payType,
      description: `${initRes.provider} checkout (${payType})`,
      metadata: cleanMeta,
    },
  ]);

  if (insErr) {
    return errorResponse("Failed to create payment session record.", 500);
  }

  return jsonResponse({
    success: true,
    provider: initRes.provider,
    authorization_url: initRes.authorization_url,
    checkout_url: initRes.checkout_url,
    reference: initRes.reference,
    amount: finalAmount,
  });
}

export async function handleVerify(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  verifiedIdentity: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const reference = String(body?.reference || body?.tx_ref || "").trim();
  const gatewayRefParam = String(body?.gateway_reference || "").trim();
  if (!reference) {
    return errorResponse("Payment reference is required.", 400);
  }

  // 1. Require existing payment record in DB (fixes !existingPayment replay bypass)
  // Resolve by primary reference or stored gateway reference (e.g. kora_pay_*)
  // deno-lint-ignore no-explicit-any
  let existingPayment: any = null;
  let lookupErr: { message?: string } | null = null;
  for (const cand of [reference, gatewayRefParam].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i)) {
    const { data: d1, error: e1 } = await supabase
      .from("payments")
      .select("*")
      .eq("reference", cand)
      .maybeSingle();
    if (e1) {
      lookupErr = e1;
      break;
    }
    if (d1) {
      existingPayment = d1;
      break;
    }
    try {
      const { data: d2, error: e2 } = await supabase
        .from("payments")
        .select("*")
        .eq("gateway_reference", cand)
        .maybeSingle();
      if (!e2 && d2) {
        existingPayment = d2;
        break;
      }
    } catch {
      // Optional column
    }
    const [{ data: d3 }, { data: d4 }] = await Promise.all([
      supabase.from("payments").select("*").contains("metadata", { kora_reference: cand }).maybeSingle(),
      supabase.from("payments").select("*").contains("metadata", { gateway_reference: cand }).maybeSingle(),
    ]);
    if (d3 || d4) {
      existingPayment = d3 || d4;
      break;
    }
  }

  if (lookupErr || !existingPayment) {
    return errorResponse("Payment record not found for this reference.", 404);
  }

  const canonicalRef = String(existingPayment.reference || reference);
  const recordOwner = String(existingPayment.user_email || "").toLowerCase().trim();
  if (verifiedIdentity !== "service_role" && recordOwner !== cleanEmail) {
    return errorResponse("You do not own this payment reference.", 403);
  }

  const currentStatus = String(existingPayment.status || "").toLowerCase().trim();
  if (currentStatus === "success" || currentStatus === "completed") {
    return jsonResponse({
      success: true,
      status: "success",
      alreadyProcessed: true,
      reference: canonicalRef,
      message: "Payment has already been verified and applied.",
    });
  }

  // 2. Verify with gateway provider
  const preferredProvider = String(existingPayment.description || "").toLowerCase().includes("paystack")
    ? "paystack"
    : String(existingPayment.description || "").toLowerCase().includes("kora")
    ? "kora"
    : undefined;
  const targetGatewayRef = String(
    gatewayRefParam ||
      existingPayment.metadata?.gateway_reference ||
      existingPayment.metadata?.kora_reference ||
      existingPayment.gateway_reference ||
      canonicalRef,
  ).trim();

  const verified = await verifyPaymentWithProvider(targetGatewayRef, preferredProvider);
  if (!verified.success || verified.status !== "success") {
    if (verified.status === "pending") {
      return jsonResponse({
        success: false,
        status: "pending",
        reference: canonicalRef,
        message: verified.error || "Payment is still confirming on gateway.",
      });
    }
    return errorResponse(verified.error || "Gateway payment verification failed.", 400);
  }

  // 3. Server-side amount & currency verification
  const expectedAmount = Number(existingPayment.amount || 0);
  if (verified.currency !== "NGN" || !Number.isFinite(verified.amountPaid) || verified.amountPaid < expectedAmount - 0.5) {
    await supabase
      .from("payments")
      .update({
        status: "amount_mismatch",
        metadata: {
          ...(existingPayment.metadata || {}),
          gateway_paid: verified.amountPaid,
          gateway_currency: verified.currency,
        },
      })
      .eq("reference", canonicalRef)
      .eq("status", "pending");

    return errorResponse(
      `Paid amount (₦${verified.amountPaid}) does not match expected amount (₦${expectedAmount}).`,
      400,
    );
  }

  // 4. Atomic claim: transition `pending` -> `success` so concurrent verify/webhook cannot double-activate
  const { data: claimed, error: claimErr } = await supabase
    .from("payments")
    .update({
      status: "success",
      verified_at: new Date().toISOString(),
    })
    .eq("reference", canonicalRef)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimErr || !claimed) {
    return jsonResponse({
      success: true,
      status: "success",
      alreadyProcessed: true,
      reference: canonicalRef,
      message: "Payment already claimed and processed.",
    });
  }

  const payType = String(claimed.type || claimed.metadata?.type || "wallet_fund");
  const activation = await activatePaidResource(
    supabase,
    payType,
    recordOwner,
    expectedAmount,
    { ...(claimed.metadata || {}), reference: canonicalRef },
  );

  if (!activation.success) {
    // Credit user wallet atomically as safe fallback if resource activation failed after gateway settlement
    await refundWalletAtomic(
      supabase,
      recordOwner,
      expectedAmount,
      `gateway_activation_fallback:${payType}`,
      `fallback_${canonicalRef}`,
    );
    return jsonResponse({
      success: true,
      status: "success",
      fallbackCredited: true,
      reference: canonicalRef,
      message: `Payment succeeded, but activation could not complete (${activation.error}). Funds have been safely credited to your wallet.`,
    });
  }

  return jsonResponse({
    success: true,
    status: "success",
    provider: verified.provider,
    reference: canonicalRef,
    amount: expectedAmount,
    activatedId: activation.activatedId,
    message: activation.message || "Payment verified and applied successfully.",
  });
}
