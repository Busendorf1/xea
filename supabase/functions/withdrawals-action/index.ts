import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getVerifiedUserEmail } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-email, x-user-authorization, x-idempotency-key",
};

const KORA_BASE_URL =
  Deno.env.get("KORA_BASE_URL") || "https://api.korapay.com/merchant/api/v1";

function getTransferFeeNaira(amount: number): number {
  if (amount <= 5000) return 10;
  if (amount <= 50000) return 25;
  return 50;
}

const FALLBACK_BANKS = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank (FCMB)", code: "214" },
  { name: "Guaranty Trust Bank (GTBank)", code: "058" },
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
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank for Africa (UBA)", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "VFD Microfinance Bank", code: "566" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const koraSecretKey = (
      Deno.env.get("KORA_SECRET_KEY") ||
      Deno.env.get("KORAPAY_SECRET_KEY") ||
      ""
    ).trim();
    const paystackSecretKey = (
      Deno.env.get("PAYSTACK_SECRET_KEY") || ""
    ).trim();
    const payoutProvider = (Deno.env.get("PAYOUT_PROVIDER") || "kora")
      .toLowerCase()
      .trim();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "banks").toLowerCase();

    // 0. List Supported Nigerian Banks (`banks`) — Kora Primary, Paystack Backup
    if (action === "banks") {
      if (koraSecretKey && payoutProvider !== "paystack") {
        try {
          const koraRes = await fetch(
            `${KORA_BASE_URL}/misc/banks?countryCode=NG`,
            {
              headers: {
                Authorization: `Bearer ${koraSecretKey}`,
                "Content-Type": "application/json",
              },
            }
          );
          const koraJson = await koraRes.json();
          if (
            koraRes.ok &&
            koraJson?.status &&
            Array.isArray(koraJson?.data) &&
            koraJson.data.length > 0
          ) {
            return new Response(
              JSON.stringify({
                provider: "kora",
                banks: koraJson.data.map((b: any) => ({
                  name: b.name,
                  code: b.code,
                })),
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
        } catch (err) {
          console.warn("Kora listBanks failed, trying Paystack backup:", err);
        }
      }

      if (paystackSecretKey) {
        try {
          const psRes = await fetch(
            "https://api.paystack.co/bank?country=nigeria",
            {
              headers: { Authorization: `Bearer ${paystackSecretKey}` },
            }
          );
          const psJson = await psRes.json();
          if (psRes.ok && psJson?.status && Array.isArray(psJson?.data)) {
            return new Response(
              JSON.stringify({
                provider: "paystack",
                banks: psJson.data.map((b: any) => ({
                  name: b.name,
                  code: b.code,
                })),
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
        } catch {}
      }

      return new Response(
        JSON.stringify({ provider: "fallback", banks: FALLBACK_BANKS }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. Resolve Bank Account Name (`resolve`) — Kora Primary, Paystack Backup
    if (action === "resolve") {
      const accountNumber = String(body?.accountNumber || "")
        .replace(/\D/g, "")
        .trim();
      const bankCode = String(body?.bankCode || "").trim();

      if (accountNumber.length !== 10 || !bankCode) {
        return new Response(
          JSON.stringify({
            error: "Please enter a valid 10-digit account number and select a bank.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Kora Primary
      if (koraSecretKey && payoutProvider !== "paystack") {
        try {
          const koraRes = await fetch(`${KORA_BASE_URL}/misc/banks/resolve`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${koraSecretKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              bank: bankCode,
              account: accountNumber,
              currency: "NGN",
            }),
          });
          const koraJson = await koraRes.json();
          if (koraRes.ok && koraJson?.status && koraJson?.data?.account_name) {
            return new Response(
              JSON.stringify({
                provider: "kora",
                account_number:
                  koraJson.data.account_number || accountNumber,
                account_name: koraJson.data.account_name,
                accountName: koraJson.data.account_name,
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
        } catch {}
      }

      // Paystack Backup
      if (paystackSecretKey) {
        const res = await fetch(
          `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(
            accountNumber
          )}&bank_code=${encodeURIComponent(bankCode)}`,
          {
            headers: { Authorization: `Bearer ${paystackSecretKey}` },
          }
        );
        const json = await res.json();
        if (res.ok && json?.status && json?.data?.account_name) {
          return new Response(
            JSON.stringify({
              provider: "paystack",
              account_number: accountNumber,
              account_name: json.data.account_name,
              accountName: json.data.account_name,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      return new Response(
        JSON.stringify({
          error: "Could not verify bank account. Please check the account number and bank.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Initiate Withdrawal Payout Request (`initiate`) — Kora Primary, Paystack Backup
    if (action === "initiate") {
      const verifiedEmail = await getVerifiedUserEmail(req);
      if (!verifiedEmail) {
        return new Response(
          JSON.stringify({
            error: "Please sign in again to initiate a withdrawal.",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const callerEmail = verifiedEmail;
      const amount = Number(body?.amount || 0);
      const accountNumber = String(body?.accountNumber || "")
        .replace(/\D/g, "")
        .trim();
      const bankCode = String(body?.bankCode || "").trim();
      const accountName = String(body?.accountName || "Paayh User").trim();

      if (amount < 10000 || accountNumber.length !== 10 || !bankCode) {
        return new Response(
          JSON.stringify({
            error: "Minimum withdrawal is ₦10,000 with a valid 10-digit bank account.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const transferFee = getTransferFeeNaira(amount);
      const netAmount = Math.round((amount - transferFee) * 100) / 100;

      // Flush any buffered/sharded affiliate yield before checking balance
      try {
        await supabase.rpc("flush_affiliate_yield_shards_atomic", {
          p_target_email: callerEmail,
        });
      } catch {}

      const ref = `kora_wdr_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;

      // Try atomic withdrawal RPC first
      let nextBal: number | null = null;
      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        "initiate_atomic_withdrawal",
        {
          p_email: callerEmail,
          p_amount: amount,
          p_reference: ref,
          p_description: `Withdrawal to ${accountName} (${accountNumber} / ${bankCode})`,
          p_metadata: {
            account_number: accountNumber,
            bank_code: bankCode,
            account_name: accountName,
            fee: transferFee,
            net_amount: netAmount,
          },
        }
      );

      if (!rpcErr && rpcRes) {
        if (!rpcRes.success) {
          return new Response(
            JSON.stringify({
              error: rpcRes.error || "Insufficient balance for withdrawal.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        nextBal = Number(rpcRes.new_balance ?? 0);
      } else {
        // Fallback guarded atomic deduction
        const { data: userRow } = await supabase
          .from("users")
          .select("id, balance")
          .eq("email", callerEmail)
          .maybeSingle();

        const currentBal = Number(userRow?.balance || 0);
        if (!userRow || currentBal < amount) {
          return new Response(
            JSON.stringify({ error: "Insufficient balance for withdrawal." }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const candidateBal = Math.round((currentBal - amount) * 100) / 100;
        const { data: updatedUser, error: deductErr } = await supabase
          .from("users")
          .update({ balance: candidateBal })
          .eq("id", userRow.id)
          .gte("balance", amount)
          .select("balance")
          .maybeSingle();

        if (deductErr || !updatedUser) {
          return new Response(
            JSON.stringify({
              error: "Withdrawal already in progress or insufficient balance.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        nextBal = Number(updatedUser.balance);

        await supabase.from("payments").insert([
          {
            user_email: callerEmail,
            reference: ref,
            amount,
            status: "pending",
            type: "withdrawal",
            description: `Withdrawal to ${accountName} (${accountNumber} / ${bankCode})`,
          },
        ]);
      }

      let payoutStatus = "pending";
      let usedProvider = "kora";
      let disbursed = false;

      // Try Kora Single Payout Primary (disburse netAmount after transfer fee)
      if (koraSecretKey && payoutProvider !== "paystack") {
        try {
          const koraRes = await fetch(
            `${KORA_BASE_URL}/transactions/disburse`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${koraSecretKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                reference: ref,
                destination: {
                  type: "bank_account",
                  amount: netAmount,
                  currency: "NGN",
                  narration: "Paayh Earnings Withdrawal",
                  bank_account: {
                    bank: bankCode,
                    account: accountNumber,
                  },
                  customer: {
                    name: accountName,
                    email: callerEmail,
                  },
                },
              }),
            }
          );
          const koraJson = await koraRes.json();
          if (koraRes.ok && koraJson?.status) {
            disbursed = true;
            payoutStatus = koraJson?.data?.status || "processing";
            usedProvider = "kora";
          }
        } catch {}
      }

      // Fallback to Paystack Transfer if Kora did not disburse
      if (!disbursed && paystackSecretKey) {
        try {
          const rcptRes = await fetch(
            "https://api.paystack.co/transferrecipient",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${paystackSecretKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                type: "nuban",
                name: accountName,
                account_number: accountNumber,
                bank_code: bankCode,
                currency: "NGN",
              }),
            }
          );
          const rcptJson = await rcptRes.json();
          const recipientCode = rcptJson?.data?.recipient_code;

          if (rcptRes.ok && recipientCode) {
            const trfRes = await fetch("https://api.paystack.co/transfer", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${paystackSecretKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                source: "balance",
                amount: Math.round(netAmount * 100),
                recipient: recipientCode,
                reason: "Paayh Wallet Withdrawal",
                reference: ref,
              }),
            });
            const trfJson = await trfRes.json();
            if (trfRes.ok && trfJson?.status) {
              disbursed = true;
              payoutStatus = trfJson?.data?.status || "processing";
              usedProvider = "paystack";
            }
          }
        } catch {}
      }

      if (!disbursed) {
        // Refund balance if neither gateway disbursed
        const { data: latestUser } = await supabase
          .from("users")
          .select("id, balance")
          .eq("email", callerEmail)
          .maybeSingle();
        if (latestUser) {
          const refundedBal =
            Math.round(((Number(latestUser.balance) || 0) + amount) * 100) /
            100;
          await supabase
            .from("users")
            .update({ balance: refundedBal })
            .eq("id", latestUser.id);
        }
        await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("reference", ref);

        return new Response(
          JSON.stringify({
            error:
              "Payout service is temporarily busy. Your balance has not been charged—please try again shortly.",
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      await supabase
        .from("payments")
        .update({ status: payoutStatus })
        .eq("reference", ref);

      return new Response(
        JSON.stringify({
          success: true,
          provider: usedProvider,
          status: payoutStatus,
          reference: ref,
          balance: nextBal,
          fee: transferFee,
          netAmount,
          message: "Withdrawal initiated successfully.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "Unsupported action." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "Unable to complete withdrawal right now. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
