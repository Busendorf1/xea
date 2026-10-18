import supabaseAdmin from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";

export type WithdrawalOutcome = "success" | "failed" | "reversed";

export interface SettlementResult {
  success: boolean;
  alreadySettled: boolean;
  status: string;
  userEmail?: string;
  grossAmount?: number;
  error?: string;
}

/**
 * Atomically settles a withdrawal record ('success' | 'failed' | 'reversed')
 * using the authoritative gross ledger amount (`payments.amount`) and row-level
 * locking (`settle_withdrawal_atomic` RPC), with a safe optimistic-concurrency
 * fallback if the RPC is not yet deployed.
 */
export async function settleWithdrawalByReference(
  reference: string,
  outcome: WithdrawalOutcome,
  gatewayResponse?: string,
  extraMetadata?: Record<string, unknown>
): Promise<SettlementResult> {
  if (!reference) {
    return {
      success: false,
      alreadySettled: false,
      status: "invalid",
      error: "Missing withdrawal reference",
    };
  }

  // 1. Primary path: PostgreSQL atomic RPC (FOR UPDATE row lock on payments & users)
  const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc(
    "settle_withdrawal_atomic",
    {
      p_reference: reference,
      p_outcome: outcome,
      p_gateway_response: gatewayResponse || null,
    }
  );

  if (!rpcErr && rpcResult && rpcResult.success) {
    const userEmail = rpcResult.user_email as string | undefined;
    const grossAmount = Number(rpcResult.gross_amount || 0);
    const alreadySettled = Boolean(rpcResult.already_settled);

    if (!alreadySettled && userEmail) {
      if (extraMetadata && Object.keys(extraMetadata).length > 0) {
        const { data: currentPayment } = await supabaseAdmin
          .from("payments")
          .select("metadata")
          .eq("reference", reference)
          .maybeSingle();

        await supabaseAdmin
          .from("payments")
          .update({
            metadata: {
              ...(currentPayment?.metadata || {}),
              ...extraMetadata,
            },
          })
          .eq("reference", reference);
      }

      await invalidateCachedProfile(userEmail);
      await sendSettlementNotification(userEmail, grossAmount, outcome);
    }

    return {
      success: true,
      alreadySettled,
      status: rpcResult.status || outcome,
      userEmail,
      grossAmount,
    };
  }

  // 2. Fallback path: Optimistic concurrency guard on payments.status IN ('processing', 'queued', 'pending')
  const { data: payment, error: fetchErr } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("reference", reference)
    .eq("type", "withdrawal")
    .maybeSingle();

  if (fetchErr || !payment) {
    return {
      success: false,
      alreadySettled: false,
      status: "not_found",
      error: fetchErr?.message || "Withdrawal payment record not found",
    };
  }

  if (
    payment.status === "success" ||
    payment.status === "failed" ||
    payment.status === "reversed"
  ) {
    return {
      success: true,
      alreadySettled: true,
      status: payment.status,
      userEmail: payment.user_email,
      grossAmount: Number(payment.amount || 0),
    };
  }

  // Always use payment.amount (gross ledger deduction), NEVER gateway net amount
  const grossAmount = Number(payment.amount || 0);
  const userEmail = String(payment.user_email || "").toLowerCase().trim();

  // Conditional status transition to prevent concurrent webhook + verify double-settlement
  const { data: updatedPayment, error: updatePaymentErr } = await supabaseAdmin
    .from("payments")
    .update({
      status: outcome,
      metadata: {
        ...(payment.metadata || {}),
        ...(extraMetadata || {}),
        settled_at: new Date().toISOString(),
        gateway_response: gatewayResponse || outcome,
      },
    })
    .eq("id", payment.id)
    .in("status", ["processing", "queued", "pending"])
    .select("id")
    .maybeSingle();

  if (updatePaymentErr || !updatedPayment) {
    return {
      success: true,
      alreadySettled: true,
      status: outcome,
      userEmail,
      grossAmount,
    };
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("balance, withdrawal")
    .eq("email", userEmail)
    .maybeSingle();

  if (user) {
    const currentBalance = Number(user.balance || 0);
    const currentWithdrawal = Number(user.withdrawal || 0);
    const newWithdrawal = Math.max(0, Number((currentWithdrawal - grossAmount).toFixed(2)));

    if (outcome === "success") {
      await supabaseAdmin
        .from("users")
        .update({ withdrawal: newWithdrawal })
        .eq("email", userEmail);
    } else {
      const newBalance = Number((currentBalance + grossAmount).toFixed(2));
      await supabaseAdmin
        .from("users")
        .update({
          balance: newBalance,
          withdrawal: newWithdrawal,
        })
        .eq("email", userEmail);
    }
  }

  await invalidateCachedProfile(userEmail);
  await sendSettlementNotification(userEmail, grossAmount, outcome);

  return {
    success: true,
    alreadySettled: false,
    status: outcome,
    userEmail,
    grossAmount,
  };
}

async function sendSettlementNotification(
  userEmail: string,
  grossAmount: number,
  outcome: WithdrawalOutcome
): Promise<void> {
  const formattedAmount = grossAmount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (outcome === "success") {
    await supabaseAdmin.from("notifications").insert({
      user_email: userEmail,
      title: "Withdrawal Completed Successfully",
      message: `Your withdrawal of ₦${formattedAmount} has been processed and deposited into your bank account.`,
    });
  } else {
    await supabaseAdmin.from("notifications").insert({
      user_email: userEmail,
      title: "Withdrawal Failed - Balance Restored",
      message: `Your withdrawal of ₦${formattedAmount} could not be completed by the bank. The full ₦${formattedAmount} has been refunded to your wallet balance.`,
    });
  }
}

/**
 * Atomically deducts `amount` from a user's wallet balance using `spend_wallet_balance_atomic`
 * RPC (FOR UPDATE row lock), falling back to a guarded `.gte("balance", amount)` update.
 */
export async function spendWalletBalanceAtomic(
  userEmail: string,
  amount: number,
  reason: string,
  reference: string
): Promise<{
  success: boolean;
  previousBalance?: number;
  newBalance?: number;
  error?: string;
}> {
  const cleanEmail = userEmail.toLowerCase().trim();
  const normalizedAmount = Number(amount.toFixed(2));

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return { success: false, error: "Invalid spend amount" };
  }

  const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
    "spend_wallet_balance_atomic",
    {
      p_user_email: cleanEmail,
      p_amount: normalizedAmount,
      p_reason: reason,
      p_reference: reference,
    }
  );

  if (!rpcErr && rpcRes) {
    if (!rpcRes.success) {
      return {
        success: false,
        error: rpcRes.error || "Insufficient wallet balance",
      };
    }
    return {
      success: true,
      previousBalance: Number(rpcRes.previous_balance || 0),
      newBalance: Number(rpcRes.new_balance || 0),
    };
  }

  // Fallback if migration 007 RPC is not yet applied: guarded conditional update
  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("balance")
    .eq("email", cleanEmail)
    .maybeSingle();

  if (userErr || !user) {
    return { success: false, error: "User profile not found" };
  }

  const currentBalance = Number(user.balance || 0);
  if (currentBalance < normalizedAmount) {
    return { success: false, error: "Insufficient wallet balance" };
  }

  const newBalance = Number((currentBalance - normalizedAmount).toFixed(2));
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("users")
    .update({ balance: newBalance })
    .eq("email", cleanEmail)
    .gte("balance", normalizedAmount)
    .select("balance")
    .maybeSingle();

  if (updateErr || !updated) {
    return {
      success: false,
      error: "Concurrent wallet transaction conflict or insufficient balance",
    };
  }

  return {
    success: true,
    previousBalance: currentBalance,
    newBalance: Number(updated.balance),
  };
}

/**
 * Atomically refunds a wallet deduction if a downstream operation fails.
 */
export async function refundWalletDeductionAtomic(
  userEmail: string,
  amount: number,
  reason: string,
  reference: string
): Promise<void> {
  const cleanEmail = userEmail.toLowerCase().trim();
  const normalizedAmount = Number(amount.toFixed(2));
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return;

  const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
    "refund_wallet_deduction_atomic",
    {
      p_user_email: cleanEmail,
      p_amount: normalizedAmount,
      p_reason: reason,
      p_reference: reference,
    }
  );

  if (!rpcErr && rpcRes?.success) {
    return;
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("balance")
    .eq("email", cleanEmail)
    .maybeSingle();

  if (user) {
    const restored = Number((Number(user.balance || 0) + normalizedAmount).toFixed(2));
    await supabaseAdmin
      .from("users")
      .update({ balance: restored })
      .eq("email", cleanEmail);
  }
}
