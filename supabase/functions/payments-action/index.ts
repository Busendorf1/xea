import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-email, x-idempotency-key",
};

const KORA_BASE_URL =
  Deno.env.get("KORA_BASE_URL") || "https://api.korapay.com/merchant/api/v1";

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

    const body = await req.json();
    const action = String(body?.action || "initialize").toLowerCase();
    const rawEmail =
      req.headers.get("x-user-email") || String(body?.email || "");
    const cleanEmail = rawEmail.toLowerCase().trim();

    if (!cleanEmail) {
      return new Response(
        JSON.stringify({ error: "Authentication required." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. Atomic P2P Wallet Transfer
    if (action === "transfer") {
      const recipientEmail = String(body?.recipientEmail || "")
        .toLowerCase()
        .trim();
      const amount = Number(body?.amount || 0);
      const idempotencyKey =
        req.headers.get("x-idempotency-key") ||
        String(body?.idempotencyKey || `trf_${Date.now()}`);

      if (!recipientEmail || amount <= 0) {
        return new Response(
          JSON.stringify({ error: "Invalid recipient or transfer amount." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (recipientEmail === cleanEmail) {
        return new Response(
          JSON.stringify({ error: "Cannot transfer funds to your own wallet." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Atomic PostgreSQL RPC
      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        "transfer_wallet_atomic",
        {
          p_sender_email: cleanEmail,
          p_recipient_email: recipientEmail,
          p_amount: amount,
          p_idempotency_key: idempotencyKey,
        }
      );

      if (!rpcErr && rpcRes && rpcRes.success) {
        return new Response(JSON.stringify(rpcRes), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (rpcRes && rpcRes.error) {
        return new Response(JSON.stringify({ error: rpcRes.error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          error: rpcErr?.message || "Unable to complete transfer.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Wallet Payment (`wallet_pay`)
    if (action === "wallet_pay") {
      const amount = Number(body?.amount || 0);
      const payType = String(body?.type || "");

      if (amount <= 0) {
        return new Response(
          JSON.stringify({ error: "Invalid payment amount." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: userRow } = await supabase
        .from("users")
        .select("balance")
        .ilike("email", cleanEmail)
        .maybeSingle();

      const currentBal = Number(userRow?.balance || 0);
      if (currentBal < amount) {
        return new Response(
          JSON.stringify({ error: "Insufficient wallet balance." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const newBalance = Math.round((currentBal - amount) * 100) / 100;
      await supabase
        .from("users")
        .update({ balance: newBalance })
        .ilike("email", cleanEmail);

      const ref = `WAL_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;

      await supabase.from("payments").insert([
        {
          user_email: cleanEmail,
          reference: ref,
          amount,
          status: "success",
          type: payType || "wallet_payment",
          description: `Wallet payment (${payType})`,
        },
      ]);

      if (payType.startsWith("monetization_")) {
        const mType = payType.replace("monetization_", "");
        await supabase
          .from("users")
          .update({
            monetized: "true",
            monetization_type: mType,
            monetized_at: new Date().toISOString(),
          })
          .ilike("email", cleanEmail);
      }

      return new Response(
        JSON.stringify({
          success: true,
          reference: ref,
          balance: newBalance,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Initialize Payment (`initialize`) — Kora Primary, Paystack Backup
    if (action === "initialize") {
      if (!koraSecretKey && !paystackSecretKey) {
        return new Response(
          JSON.stringify({
            error: "Neither KORA_SECRET_KEY nor PAYSTACK_SECRET_KEY is configured.",
          }),
          {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const amountNaira = Number(body?.amount || 0);
      const callbackUrl = body?.callbackUrl || "xea-auth://payment-callback";
      const metadata = body?.metadata || {};
      const payType = String(body?.type || metadata?.type || "campaign");

      // Try Kora Primary first (unless PAYOUT_PROVIDER is explicitly set to paystack)
      if (koraSecretKey && payoutProvider !== "paystack") {
        try {
          const koraRef = `kora_pay_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 8)}`;
          const cleanMetadata: Record<string, string | number | boolean> = {
            type: String(payType).slice(0, 50),
            user_email: cleanEmail.slice(0, 50),
          };
          if (typeof metadata?.campaign_days === "number") {
            cleanMetadata.campaign_days = metadata.campaign_days;
          }
          if (typeof metadata?.subscriber_id === "string") {
            cleanMetadata.subscriber_id = metadata.subscriber_id.slice(0, 50);
          }

          const customerName =
            String(metadata?.name || cleanEmail.split("@")[0] || "Paayh Customer").slice(
              0,
              60
            );

          const koraRes = await fetch(`${KORA_BASE_URL}/charges/initialize`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${koraSecretKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              amount: amountNaira,
              currency: "NGN",
              reference: koraRef,
              narration: `Paayh ${payType} Payment`.slice(0, 100),
              redirect_url: callbackUrl,
              notification_url: "https://paayh.com/api/payments/kora-webhook",
              customer: {
                name: customerName,
                email: cleanEmail,
              },
              metadata: cleanMetadata,
            }),
          });

          const koraJson = await koraRes.json();
          if (koraRes.ok && koraJson?.status && koraJson?.data?.checkout_url) {
            const finalRef = koraJson.data.reference || koraRef;
            await supabase.from("payments").insert([
              {
                user_email: cleanEmail,
                reference: finalRef,
                amount: amountNaira,
                status: "pending",
                type: payType,
                description: `Kora checkout (${payType})`,
              },
            ]);

            return new Response(
              JSON.stringify({
                success: true,
                provider: "kora",
                authorization_url: koraJson.data.checkout_url,
                checkout_url: koraJson.data.checkout_url,
                reference: finalRef,
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
          console.warn(
            "Kora initializeCharge failed, falling back to Paystack:",
            koraJson?.message || koraJson
          );
        } catch (koraErr) {
          console.warn(
            "Kora initializeCharge exception, falling back to Paystack:",
            koraErr
          );
        }
      }

      // Paystack Backup / Fallback
      if (!paystackSecretKey) {
        return new Response(
          JSON.stringify({
            error: "Kora checkout failed and PAYSTACK_SECRET_KEY backup is not configured.",
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const psRes = await fetch(
        "https://api.paystack.co/transaction/initialize",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: cleanEmail,
            amount: Math.round(amountNaira * 100),
            callback_url: callbackUrl,
            metadata: {
              ...metadata,
              type: payType,
              user_email: cleanEmail,
            },
          }),
        }
      );

      const psJson = await psRes.json();
      if (!psRes.ok || !psJson?.status) {
        return new Response(
          JSON.stringify({
            error: psJson?.message || "Could not initialize payment checkout.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      await supabase.from("payments").insert([
        {
          user_email: cleanEmail,
          reference: psJson.data.reference,
          amount: amountNaira,
          status: "pending",
          type: payType,
          description: `Paystack backup checkout (${payType})`,
        },
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          provider: "paystack",
          authorization_url: psJson.data.authorization_url,
          checkout_url: psJson.data.authorization_url,
          reference: psJson.data.reference,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Verify Payment (`verify`) — Kora Primary, Paystack Backup
    if (action === "verify") {
      const reference = String(body?.reference || "").trim();
      if (!reference) {
        return new Response(
          JSON.stringify({ error: "Missing payment reference." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const isKoraRef = reference.startsWith("kora_");

      // Try Kora verification first if it's a Kora reference or Kora is primary
      if (koraSecretKey && (isKoraRef || payoutProvider !== "paystack")) {
        try {
          const koraRes = await fetch(
            `${KORA_BASE_URL}/charges/${encodeURIComponent(reference)}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${koraSecretKey}`,
                "Content-Type": "application/json",
              },
            }
          );
          const koraJson = await koraRes.json();
          const koraStatus = String(koraJson?.data?.status || "").toLowerCase();
          if (
            koraRes.ok &&
            koraJson?.status &&
            (koraStatus === "success" || koraStatus === "successful")
          ) {
            const amountPaid = parseFloat(
              koraJson.data.amount || koraJson.data.amount_paid || 0
            );
            await supabase
              .from("payments")
              .update({ status: "success" })
              .eq("reference", reference);

            return new Response(
              JSON.stringify({
                success: true,
                provider: "kora",
                reference,
                amount: amountPaid,
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
        } catch (koraVerifyErr) {
          console.warn(
            "Kora verification failed, checking Paystack backup:",
            koraVerifyErr
          );
        }
      }

      // Paystack Backup Verification
      if (paystackSecretKey && !isKoraRef) {
        const psRes = await fetch(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(
            reference
          )}`,
          {
            headers: {
              Authorization: `Bearer ${paystackSecretKey}`,
            },
          }
        );
        const psJson = await psRes.json();
        if (psJson?.status && psJson?.data?.status === "success") {
          const amountPaid = Number(psJson.data.amount || 0) / 100;
          await supabase
            .from("payments")
            .update({ status: "success" })
            .eq("reference", reference);

          return new Response(
            JSON.stringify({
              success: true,
              provider: "paystack",
              reference,
              amount: amountPaid,
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
          success: false,
          error: "Payment not yet confirmed.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unsupported payment action: ${action}` }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
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
