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

async function activatePaidResource(
  supabase: any,
  userEmail: string,
  payType: string,
  metadata: Record<string, any> = {},
  amountPaid = 0
) {
  const cleanType = String(payType || metadata?.type || "").toLowerCase();
  const adId = metadata?.ad_id || metadata?.adId || metadata?.campaign_id || null;
  const highlightId =
    metadata?.highlight_id || metadata?.highlightId || metadata?.ad_id || null;

  // 1. Monetization Activation
  if (cleanType.startsWith("monetization_")) {
    const mType = cleanType.replace("monetization_", "");
    await supabase
      .from("users")
      .update({
        monetized: "true",
        monetization_type: mType,
        monetized_at: new Date().toISOString(),
        monetization_clicks: 0,
        suspended_until: null,
      })
      .eq("email", userEmail);
    return;
  }

  // 2. Publish Approved Ad (`adds` -> `addsactive`)
  if (cleanType === "publish_ad" && adId) {
    const { data: queuedAd } = await supabase
      .from("adds")
      .select("*")
      .eq("id", adId)
      .maybeSingle();

    if (queuedAd) {
      const {
        status: _s,
        approved_at: _a,
        payment_status: _p,
        ...cleanAd
      } = queuedAd;
      const activePayload: Record<string, any> = {
        ...cleanAd,
        admin_statement: null,
        is_paused: false,
        created_at: new Date().toISOString(),
      };

      const { error: moveErr } = await supabase
        .from("addsactive")
        .upsert([activePayload], { onConflict: "id" });

      if (!moveErr) {
        await supabase.from("adds").delete().eq("id", adId);
        try {
          await supabase.from("notifications").insert([
            {
              user_email: userEmail,
              title: "Campaign Published Live",
              message: "Your ad campaign is now live and delivering to viewers.",
              type: "campaign_live",
              is_read: false,
            },
          ]);
        } catch {}
      }
    }
    return;
  }

  // 3. Publish Approved Highlight (`news` -> `newsactive`)
  if (cleanType === "publish_highlight" && highlightId) {
    const { data: queuedNews } = await supabase
      .from("news")
      .select("*")
      .eq("id", highlightId)
      .maybeSingle();

    if (queuedNews) {
      const {
        status: _s,
        approved_at: _a,
        payment_status: _p,
        is_admin_post: _ap,
        custom_sponsor_name: _csn,
        custom_sponsor_handle: _csh,
        custom_sponsor_logo: _csl,
        ...cleanNews
      } = queuedNews;
      const activePayload: Record<string, any> = {
        ...cleanNews,
        admin_statement: null,
        is_paused: false,
        created_at: new Date().toISOString(),
      };

      const { error: moveErr } = await supabase
        .from("newsactive")
        .upsert([activePayload], { onConflict: "id" });

      if (!moveErr) {
        await supabase.from("news").delete().eq("id", highlightId);
        try {
          await supabase.from("notifications").insert([
            {
              user_email: userEmail,
              title: "Highlight Published Live",
              message: "Your highlight campaign is now live on the feed.",
              type: "campaign_live",
              is_read: false,
            },
          ]);
        } catch {}
      }
    }
    return;
  }

  // 4. Boost Ad Campaign
  if (cleanType === "boost_campaign" && adId) {
    const addImp = Math.max(0, Number(metadata?.additional_impressions || 0));
    const addDays = Math.max(0, Number(metadata?.additional_days || 0));
    const newCpi = Number(metadata?.cost_per_impression || 0);

    const [{ data: activeAd }, { data: queuedAd }, { data: completedAd }] =
      await Promise.all([
        supabase.from("addsactive").select("*").eq("id", adId).maybeSingle(),
        supabase.from("adds").select("*").eq("id", adId).maybeSingle(),
        supabase.from("completed_ads").select("*").eq("id", adId).maybeSingle(),
      ]);

    const target = activeAd || queuedAd || completedAd;
    if (target) {
      const effectiveCpi =
        newCpi > Number(target.cost_per_impression || 25)
          ? newCpi
          : Number(target.cost_per_impression || 25);
      const activeUpdatePayload: Record<string, any> = {
        is_paused: false,
        completed_at: null,
        cost_per_impression: effectiveCpi,
      };
      if (addImp > 0) {
        activeUpdatePayload.impressions = Number(target.impressions || 1000) + addImp;
      }
      if (addDays > 0) {
        activeUpdatePayload.campaign_days =
          Number(target.campaign_days || 1) + addDays;
      }

      const queueUpdatePayload: Record<string, any> = {
        ...activeUpdatePayload,
        is_bidded: effectiveCpi > 25,
        bid_price: effectiveCpi > 25 ? effectiveCpi : target.bid_price,
      };
      if (amountPaid > 0) {
        queueUpdatePayload.total_cost = Number(target.total_cost || 0) + amountPaid;
      }

      if (completedAd && !activeAd && addImp > 0) {
        const {
          status: _s,
          approved_at: _a,
          payment_status: _p,
          is_bidded: _ib,
          bid_price: _bp,
          total_cost: _tc,
          ...cleanCompleted
        } = completedAd;
        const reactivated = {
          ...cleanCompleted,
          ...activeUpdatePayload,
          completed_at: null,
          is_paused: false,
          created_at: new Date().toISOString(),
        };
        await supabase
          .from("addsactive")
          .upsert([reactivated], { onConflict: "id" });
        await supabase.from("completed_ads").delete().eq("id", adId);
      } else {
        await Promise.all([
          supabase.from("addsactive").update(activeUpdatePayload).eq("id", adId),
          supabase.from("adds").update(queueUpdatePayload).eq("id", adId),
        ]);
      }

      if (effectiveCpi > 25) {
        try {
          const adIndustry = (
            target.ad_type ||
            (Array.isArray(target.industry) ? target.industry[0] : target.industry) ||
            "business"
          ).toLowerCase();
          await supabase.from("bidded_ads").delete().eq("ad_id", adId);
          await supabase.from("bidded_ads").insert([
            {
              ad_id: adId,
              user_email: userEmail,
              industry: adIndustry,
              bid_price: effectiveCpi,
              is_active: true,
            },
          ]);
        } catch {}
      }
    }
    return;
  }

  // 5. Boost Highlight Campaign
  if (cleanType === "boost_highlight" && highlightId) {
    const addDays = Math.max(0, Number(metadata?.additional_days || 0));
    const newBid = Number(
      metadata?.bid_price || metadata?.cost_per_impression || 0
    );

    const [{ data: activeNews }, { data: queuedNews }] = await Promise.all([
      supabase
        .from("newsactive")
        .select("*")
        .eq("id", highlightId)
        .maybeSingle(),
      supabase.from("news").select("*").eq("id", highlightId).maybeSingle(),
    ]);

    const target = activeNews || queuedNews;
    if (target) {
      const updatePayload: Record<string, any> = {
        is_paused: false,
        campaign_days: Number(target.campaign_days || 1) + addDays,
      };
      if (newBid > 1000) {
        updatePayload.is_bidded = true;
        updatePayload.bid_price = newBid;
      }
      await Promise.all([
        supabase
          .from("newsactive")
          .update(updatePayload)
          .eq("id", highlightId),
        supabase.from("news").update(updatePayload).eq("id", highlightId),
      ]);
    }
  }
}

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

    const body = await req.json();
    const action = String(body?.action || "initialize").toLowerCase();

    // Verify caller authentication via Auth0/OAuth JWT token
    const verifiedEmail = await getVerifiedUserEmail(req);
    const rawEmail =
      req.headers.get("x-user-email") || String(body?.email || "");
    const requestedEmail = rawEmail.toLowerCase().trim();

    if (!verifiedEmail) {
      return new Response(
        JSON.stringify({
          error: "Please sign in again to complete this transaction.",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (
      verifiedEmail !== "service_role" &&
      requestedEmail &&
      verifiedEmail !== requestedEmail
    ) {
      return new Response(
        JSON.stringify({
          error: "Session mismatch. Please sign in again.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cleanEmail =
      verifiedEmail === "service_role" ? requestedEmail : verifiedEmail;

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
          JSON.stringify({
            error: "Cannot transfer funds to your own wallet.",
          }),
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
          error: "Unable to complete transfer right now. Please try again.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Wallet Payment (`wallet_pay`)
    if (action === "wallet_pay") {
      const amount = Number(body?.amount ?? 0);
      const payType = String(body?.type || body?.metadata?.type || "");
      const metadata = body?.metadata || {};
      const isZeroCostPublish =
        amount === 0 &&
        (payType === "publish_ad" || payType === "publish_highlight");

      if (amount < 0 || (amount === 0 && !isZeroCostPublish)) {
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
        .select("id, balance")
        .ilike("email", cleanEmail)
        .maybeSingle();

      const currentBal = Number(userRow?.balance || 0);
      if (!userRow || currentBal < amount) {
        return new Response(
          JSON.stringify({ error: "Insufficient wallet balance." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      let newBalance = currentBal;
      if (amount > 0) {
        newBalance = Math.round((currentBal - amount) * 100) / 100;
        const { data: updatedUser, error: deductErr } = await supabase
          .from("users")
          .update({ balance: newBalance })
          .eq("id", userRow.id)
          .gte("balance", amount)
          .select("balance")
          .maybeSingle();

        if (deductErr || !updatedUser) {
          return new Response(
            JSON.stringify({
              error: "Insufficient wallet balance or concurrent payment in progress.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      const ref = `WAL_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;

      if (amount > 0) {
        await supabase.from("payments").insert([
          {
            user_email: cleanEmail,
            reference: ref,
            amount,
            status: "success",
            type: payType || "wallet_payment",
            description: `Wallet payment (${payType})`,
            metadata: {
              ...metadata,
              type: payType,
              payment_method: "wallet",
            },
          },
        ]);
      }

      await activatePaidResource(
        supabase,
        cleanEmail,
        payType,
        metadata,
        amount
      );

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
            error: "Payment gateway is temporarily unavailable.",
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

      if (amountNaira <= 0) {
        return new Response(
          JSON.stringify({ error: "Invalid payment amount." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

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
          if (metadata?.ad_id) cleanMetadata.ad_id = String(metadata.ad_id).slice(0, 50);
          if (metadata?.highlight_id) {
            cleanMetadata.highlight_id = String(metadata.highlight_id).slice(0, 50);
          }
          if (typeof metadata?.campaign_days === "number") {
            cleanMetadata.campaign_days = metadata.campaign_days;
          }
          if (typeof metadata?.subscriber_id === "string") {
            cleanMetadata.subscriber_id = metadata.subscriber_id.slice(0, 50);
          }

          const customerName = String(
            metadata?.name || cleanEmail.split("@")[0] || "Paayh Customer"
          ).slice(0, 60);

          const buildKoraInitBody = (redirectTarget: string) =>
            JSON.stringify({
              amount: amountNaira,
              currency: "NGN",
              reference: koraRef,
              narration: `Paayh ${payType} Payment`.slice(0, 100),
              redirect_url: redirectTarget,
              notification_url: "https://paayh.com/api/payments/kora-webhook",
              customer: {
                name: customerName,
                email: cleanEmail,
              },
              metadata: cleanMetadata,
            });

          let koraRes = await fetch(`${KORA_BASE_URL}/charges/initialize`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${koraSecretKey}`,
              "Content-Type": "application/json",
            },
            body: buildKoraInitBody(callbackUrl),
          });

          let koraJson = await koraRes.json();
          if (
            (!koraRes.ok || !koraJson?.status) &&
            callbackUrl &&
            !callbackUrl.startsWith("http://") &&
            !callbackUrl.startsWith("https://")
          ) {
            const bounceUrl = `https://paayh.com/api/payments/mobile-callback?redirect=${encodeURIComponent(
              callbackUrl
            )}`;
            koraRes = await fetch(`${KORA_BASE_URL}/charges/initialize`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${koraSecretKey}`,
                "Content-Type": "application/json",
              },
              body: buildKoraInitBody(bounceUrl),
            });
            koraJson = await koraRes.json();
          }
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
                metadata: {
                  ...metadata,
                  type: payType,
                  user_email: cleanEmail,
                },
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
            error: "Could not initialize payment checkout right now. Please try again.",
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
            error: "Could not initialize payment checkout. Please try again.",
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
          metadata: {
            ...metadata,
            type: payType,
            user_email: cleanEmail,
          },
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

    // 4. Verify Payment (`verify`) — Kora Primary, Paystack Backup + Resource Activation
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

      // Check existing payment record for idempotency & metadata
      const { data: existingPayment } = await supabase
        .from("payments")
        .select("*")
        .eq("reference", reference)
        .maybeSingle();

      if (existingPayment?.status === "success") {
        return new Response(
          JSON.stringify({
            success: true,
            alreadyProcessed: true,
            reference,
            amount: Number(existingPayment.amount || 0),
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const isKoraRef = reference.startsWith("kora_");
      let verifiedProvider: string | null = null;
      let amountPaid = 0;
      let gatewayMeta: Record<string, any> = {};

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
            verifiedProvider = "kora";
            amountPaid = parseFloat(
              koraJson.data.amount || koraJson.data.amount_paid || 0
            );
            gatewayMeta = koraJson.data.metadata || {};
          }
        } catch (koraVerifyErr) {
          console.warn(
            "Kora verification failed, checking Paystack backup:",
            koraVerifyErr
          );
        }
      }

      // Paystack Backup Verification
      if (!verifiedProvider && paystackSecretKey && !isKoraRef) {
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
          verifiedProvider = "paystack";
          amountPaid = Number(psJson.data.amount || 0) / 100;
          gatewayMeta = psJson.data.metadata || {};
        }
      }

      if (verifiedProvider) {
        // Atomically transition payment from pending -> success so concurrent calls cannot double-activate
        const { data: updatedPayment } = await supabase
          .from("payments")
          .update({ status: "success" })
          .eq("reference", reference)
          .neq("status", "success")
          .select("*")
          .maybeSingle();

        const mergedMeta = {
          ...gatewayMeta,
          ...(existingPayment?.metadata || {}),
          ...(body?.metadata || {}),
        };
        const payType = String(
          existingPayment?.type ||
            mergedMeta?.type ||
            body?.type ||
            ""
        );
        const ownerEmail = (
          existingPayment?.user_email ||
          mergedMeta?.user_email ||
          cleanEmail
        )
          .toLowerCase()
          .trim();

        // Only activate if we transitioned from non-success (or if no row existed yet)
        if (updatedPayment || !existingPayment) {
          await activatePaidResource(
            supabase,
            ownerEmail,
            payType,
            mergedMeta,
            amountPaid
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            provider: verifiedProvider,
            reference,
            amount: amountPaid,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment has not been confirmed yet.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unsupported payment action." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "Unable to process payment request right now. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
