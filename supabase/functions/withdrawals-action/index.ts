import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-email",
};

const KORA_BASE_URL =
  Deno.env.get("KORA_BASE_URL") || "https://api.korapay.com/merchant/api/v1";

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
    const payoutProvider = (
      Deno.env.get("PAYOUT_PROVIDER") || "kora"
    )
      .toLowerCase()
      .trim();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "banks").toLowerCase();
    const rawEmail =
      req.headers.get("x-user-email") || String(body?.email || "");
    const cleanEmail = rawEmail.toLowerCase().trim();

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
            error: "Please provide a valid 10-digit NUBAN accountNumber and bankCode.",
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
          console.warn(
            "Kora resolveAccount failed, falling back to Paystack:",
            koraJson?.message
          );
        } catch (koraErr) {
          console.warn(
            "Kora resolveAccount error, falling back to Paystack:",
            koraErr
          );
        }
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

        return new Response(
          JSON.stringify({
            error: json?.message || "Could not verify bank account.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: "Could not resolve bank account details on Kora or Paystack.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Initiate Withdrawal Payout Request (`initiate`) — Kora Primary, Paystack Backup
    if (action === "initiate") {
      if (!cleanEmail) {
        return new Response(
          JSON.stringify({ error: "Authentication required." }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const amount = Number(body?.amount || 0);
      const accountNumber = String(body?.accountNumber || "")
        .replace(/\D/g, "")
        .trim();
      const bankCode = String(body?.bankCode || "").trim();
      const accountName = String(body?.accountName || "Paayh User").trim();

      if (amount < 1000 || accountNumber.length !== 10 || !bankCode) {
        return new Response(
          JSON.stringify({
            error: "Minimum withdrawal is ₦1,000 with valid 10-digit bank details.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Flush any buffered/sharded affiliate yield before checking balance
      try {
        await supabase.rpc("flush_affiliate_yield_shards_atomic", {
          p_target_email: cleanEmail,
        });
      } catch {}

      const { data: userRow } = await supabase
        .from("users")
        .select("balance")
        .ilike("email", cleanEmail)
        .maybeSingle();

      const currentBal = Number(userRow?.balance || 0);
      if (currentBal < amount) {
        return new Response(
          JSON.stringify({ error: "Insufficient balance for withdrawal." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Deduct balance first
      const nextBal = Math.round((currentBal - amount) * 100) / 100;
      await supabase
        .from("users")
        .update({ balance: nextBal })
        .ilike("email", cleanEmail);

      const ref = `kora_wdr_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;

      let payoutStatus = "pending";
      let usedProvider = "kora";

      // Try Kora Single Payout Primary
      let disbursed = false;
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
                  amount,
                  currency: "NGN",
                  narration: "Paayh Earnings Withdrawal",
                  bank_account: {
                    bank: bankCode,
                    account: accountNumber,
                  },
                  customer: {
                    name: accountName,
                    email: cleanEmail,
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
          } else {
            console.warn(
              "Kora single payout failed, trying Paystack backup:",
              koraJson?.message
            );
          }
        } catch (koraErr) {
          console.warn(
            "Kora single payout exception, trying Paystack backup:",
            koraErr
          );
        }
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
                amount: Math.round(amount * 100),
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
        } catch (psErr) {
          console.warn("Paystack backup transfer failed:", psErr);
        }
      }

      await supabase.from("payments").insert([
        {
          user_email: cleanEmail,
          reference: ref,
          amount,
          status: payoutStatus,
          type: "withdrawal",
          description: `Withdrawal via ${usedProvider.toUpperCase()} to ${accountName} (${accountNumber} / ${bankCode})`,
        },
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          provider: usedProvider,
          status: payoutStatus,
          reference: ref,
          balance: nextBal,
          message: disbursed
            ? `Withdrawal initiated via ${usedProvider.toUpperCase()}.`
            : "Withdrawal queued for processing.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "Unsupported action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
