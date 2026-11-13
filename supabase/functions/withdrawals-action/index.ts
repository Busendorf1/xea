import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getVerifiedUserEmail } from "../_shared/auth.ts";
import { computePhoneHash, corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { decryptSensitiveFieldEdge } from "../_shared/crypto.ts";
import { deductWalletAtomic, refundWalletAtomic } from "../_shared/paymentActivation.ts";
import {
  calculateTransferFee,
  getActiveGateway,
  initiatePayout,
  listBanks,
  resolveBankAccount,
} from "../_shared/payoutProvider.ts";
import { verifyTransactionPinEdge } from "../_shared/walletPin.ts";

function normalizeLast10Digits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "banks").toLowerCase().trim();

    if (action === "banks") {
      const res = await listBanks();
      if (!res.success) {
        return errorResponse(res.error || "Unable to fetch bank list.", 503);
      }
      return jsonResponse({ provider: res.provider, banks: res.banks });
    }

    if (action === "resolve") {
      const accountNumber = String(body?.accountNumber || body?.account_number || "").trim();
      const bankCode = String(body?.bankCode || body?.bank_code || "").trim();
      if (!/^\d{10}$/.test(accountNumber) || !bankCode) {
        return errorResponse("Valid 10-digit account number and bank code are required.", 400);
      }
      const res = await resolveBankAccount(accountNumber, bankCode);
      if (!res.success) {
        return errorResponse(
          res.error || "Could not verify bank account. Please check the account number and bank.",
          400,
        );
      }
      return jsonResponse({
        provider: res.provider,
        account_number: res.account_number,
        account_name: res.account_name,
        accountName: res.account_name,
      });
    }

    if (action === "initiate") {
      const verifiedEmail = await getVerifiedUserEmail(req);
      if (!verifiedEmail) {
        return errorResponse("Please sign in again to initiate a withdrawal.", 401);
      }

      const requestedEmail = (
        req.headers.get("x-user-email") || String(body?.email || "")
      )
        .toLowerCase()
        .trim();

      if (
        verifiedEmail !== "service_role" &&
        requestedEmail &&
        verifiedEmail !== requestedEmail
      ) {
        return errorResponse("Session mismatch. Please sign in again.", 403);
      }

      const cleanEmail =
        verifiedEmail === "service_role" ? requestedEmail : verifiedEmail;
      if (!cleanEmail) {
        return errorResponse("Authentication required.", 401);
      }

      const amount = Math.round(Number(body?.amount || 0) * 100) / 100;
      const bankCode = String(body?.bankCode || body?.bank_code || "").trim();
      const accountNumber = String(body?.accountNumber || body?.account_number || "").trim();
      const accountName = String(body?.accountName || body?.account_name || "").trim();
      const bankName = String(body?.bankName || body?.bank_name || "").trim();
      const pin = body?.pin ?? body?.walletPin ?? body?.transactionPin;
      const providedPhone = String(
        body?.phone || body?.phoneNumber || body?.registeredPhone || "",
      ).trim();

      if (!Number.isFinite(amount) || amount < 100) {
        return errorResponse("Minimum withdrawal amount is ₦100.", 400);
      }
      if (!/^\d{10}$/.test(accountNumber) || !bankCode || !accountName) {
        return errorResponse("Complete 10-digit bank account details are required.", 400);
      }

      // 1. Enforce mandatory Wallet PIN + DB brute-force lockout
      const pinCheck = await verifyTransactionPinEdge(supabase, cleanEmail, pin);
      if (!pinCheck.valid) {
        return errorResponse(pinCheck.error || "Invalid Wallet PIN.", pinCheck.statusCode, {
          attemptsLeft: pinCheck.attemptsLeft,
          retryAfter: pinCheck.retryAfter,
        });
      }

      // 2. Reject deactivated / banned / suspended accounts
      const { data: tomb } = await supabase
        .from("deactivated_users")
        .select("email")
        .eq("email", cleanEmail)
        .maybeSingle();
      if (tomb) {
        return errorResponse("This account has been deactivated.", 403);
      }

      const { data: user, error: userErr } = await supabase
        .from("users")
        .select(
          "email, balance, withdrawal, phone, phone_hash, ad_account_status, suspended_until, firstName, lastName, username",
        )
        .ilike("email", cleanEmail)
        .maybeSingle();

      if (userErr || !user) {
        return errorResponse("User profile not found.", 404);
      }

      if (
        user.ad_account_status === "banned" ||
        user.ad_account_status === "deactivated" ||
        (user.suspended_until && new Date(user.suspended_until).getTime() > Date.now())
      ) {
        return errorResponse("Your account is restricted from withdrawals.", 403);
      }

      // 3. Enforce registered phone verification
      const inputDigits = normalizeLast10Digits(providedPhone);
      if (inputDigits.length < 10) {
        return errorResponse(
          "Registered phone number verification is required to withdraw.",
          400,
        );
      }

      const decryptedStoredPhone = user.phone
        ? await decryptSensitiveFieldEdge(String(user.phone))
        : "";
      const storedDigits = normalizeLast10Digits(decryptedStoredPhone);
      const inputHash = await computePhoneHash(providedPhone);
      const phoneMatches =
        (storedDigits.length >= 10 && storedDigits === inputDigits) ||
        (Boolean(user.phone_hash) && user.phone_hash === inputHash);

      if (!storedDigits && !user.phone_hash) {
        return errorResponse(
          "Please update your profile with a verified phone number before withdrawing.",
          403,
        );
      }
      if (!phoneMatches) {
        return errorResponse(
          "Phone number does not match the registered phone number on this account.",
          403,
        );
      }

      // 4. Unified fee calculation from active gateway schedule
      const primaryProvider = getActiveGateway();
      const quotedFee = calculateTransferFee(amount, primaryProvider);
      const totalDebit = Math.round((amount + quotedFee) * 100) / 100;

      if (Number(user.balance || 0) < totalDebit) {
        return errorResponse(
          `Insufficient balance. You need ₦${totalDebit.toLocaleString()} (including ₦${quotedFee} fee).`,
          400,
        );
      }

      const reference = `wd_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

      // 5. Atomic wallet deduction BEFORE disbursement
      const deduction = await deductWalletAtomic(
        supabase,
        cleanEmail,
        totalDebit,
        "withdrawal",
        reference,
      );
      if (!deduction.success) {
        return errorResponse(deduction.error || "Insufficient balance.", 400);
      }

      const customerName =
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        user.username ||
        accountName;

      // 6. Execute disbursement via unified payout provider
      const payout = await initiatePayout({
        reference,
        amount,
        bankCode,
        accountNumber,
        accountName,
        customerEmail: cleanEmail,
        customerName,
        narration: `XEA Withdrawal - ${reference}`,
      });

      if (!payout.success) {
        await refundWalletAtomic(
          supabase,
          cleanEmail,
          totalDebit,
          "withdrawal_failed_rollback",
          `refund_${reference}`,
        );
        return errorResponse(
          payout.error || "Withdrawal payout failed. Your wallet balance has been refunded.",
          502,
        );
      }

      // Refund any positive fee delta if fallback provider had a lower fee
      if (payout.fee < quotedFee) {
        const feeDelta = Math.round((quotedFee - payout.fee) * 100) / 100;
        if (feeDelta > 0) {
          await refundWalletAtomic(
            supabase,
            cleanEmail,
            feeDelta,
            "withdrawal_fee_adjustment",
            `fee_adj_${reference}`,
          );
        }
      }

      const actualFee = Math.min(quotedFee, payout.fee);
      const nextWithdrawn = Math.round((Number(user.withdrawal || 0) + amount) * 100) / 100;
      await supabase
        .from("users")
        .update({ withdrawal: nextWithdrawn })
        .ilike("email", cleanEmail);

      await supabase.from("payments").insert([
        {
          user_email: cleanEmail,
          reference: payout.reference || reference,
          amount,
          status: payout.status === "success" ? "completed" : "processing",
          type: "withdrawal",
          description: `Withdrawal to ${bankName || bankCode} (${accountNumber.slice(-4)})`,
          metadata: {
            provider: payout.provider,
            fee: actualFee,
            bank_code: bankCode,
            bank_name: bankName,
            account_last4: accountNumber.slice(-4),
            account_name: accountName,
            transfer_code: payout.transferCode || null,
          },
        },
      ]);

      return jsonResponse({
        success: true,
        provider: payout.provider,
        reference: payout.reference || reference,
        status: payout.status,
        amount,
        fee: actualFee,
        totalDebited: Math.round((amount + actualFee) * 100) / 100,
        newBalance: deduction.newBalance,
        message: "Withdrawal initiated successfully.",
      });
    }

    return errorResponse("Unsupported withdrawal action.", 400);
  } catch (err: unknown) {
    console.error("withdrawals-action error:", err);
    return errorResponse(
      "Unable to process withdrawal request right now. Please try again.",
      500,
    );
  }
});
