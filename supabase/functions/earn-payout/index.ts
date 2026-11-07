import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getVerifiedUserEmail } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-email, x-user-authorization",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const adId = String(body?.adId || "").trim();
    const actionType = String(body?.type || "earn").toLowerCase();

    // Zero-Trust caller verification: strictly require verified token
    const verifiedEmail = await getVerifiedUserEmail(req);
    const rawEmail =
      req.headers.get("x-user-email") || String(body?.email || "");
    const requestedEmail = rawEmail.toLowerCase().trim();

    if (!verifiedEmail) {
      return new Response(
        JSON.stringify({ error: "Please sign in to earn from ads." }),
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

    if (!adId || !cleanEmail) {
      return new Response(
        JSON.stringify({ error: "Missing campaign or user session." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. Mutual Click Action
    if (actionType === "mutual") {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        "handle_mutual_click",
        {
          p_ad_id: adId,
          p_user_email: cleanEmail,
        }
      );

      if (!rpcErr && rpcRes) {
        return new Response(JSON.stringify({ success: true, ...rpcRes }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Seen / Dismiss Action
    if (actionType === "seen") {
      await supabase.rpc("record_ad_seen", {
        p_ad_id: adId,
        p_user_email: cleanEmail,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Proof-of-Human Telemetry Sanity Check
    const telemetry = Array.isArray(body?.telemetry) ? body.telemetry : [];
    if (telemetry.length > 0) {
      const untrusted = telemetry.some((v: any) => v?.isTrusted === false);
      const startTime = Number(telemetry[0]?.t || 0);
      const endTime = Number(telemetry[telemetry.length - 1]?.t || 0);
      const durationMs = Math.max(0, endTime - startTime);
      const mode =
        telemetry[0]?.mode || (telemetry.length <= 3 ? "tap" : "swipe");
      const tooFast =
        (mode === "hold" && durationMs < 400) ||
        (mode === "tap" && (telemetry.length < 3 || durationMs < 110)) ||
        (mode === "swipe" && (telemetry.length < 3 || durationMs < 60));

      if (untrusted || tooFast) {
        return new Response(
          JSON.stringify({
            success: false,
            code: "POH_RETRY",
            error: "Please interact naturally to verify.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          code: "POH_RETRY",
          error: "Verification gesture required. Please try again.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Atomic Ad Earning Claim via PostgreSQL RPC (50% Viewer / 50% Platform Split)
    const { data: adRow } = await supabase
      .from("addsactive")
      .select(
        "cost_per_impression, impressions, impression_count, user_frequency_cap, user_email"
      )
      .eq("id", adId)
      .maybeSingle();

    if (!adRow) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "This campaign has ended.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (
      String(adRow.user_email || "")
        .toLowerCase()
        .trim() === cleanEmail
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "You cannot earn from your own campaign.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const rawCpi =
      adRow?.cost_per_impression && Number(adRow.cost_per_impression) > 0
        ? Number(adRow.cost_per_impression)
        : 25.0;
    const earnedRate = Math.max(12.5, Math.round(rawCpi * 0.5 * 100) / 100);

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "claim_ad_earning_atomic",
      {
        p_ad_id: adId,
        p_user_email: cleanEmail,
        p_expected_rate: earnedRate,
      }
    );

    if (!rpcError && rpcResult) {
      if (rpcResult.success) {
        if (!rpcResult.affiliate_credited) {
          try {
            await supabase.rpc("credit_affiliate_platform_share_atomic", {
              p_raw_cpi: rawCpi,
              p_ad_id: adId,
              p_earner_email: cleanEmail,
            });
          } catch {}
        }

        const grossEarned = Number(rpcResult.amount ?? rpcResult.result ?? 0);
        if (grossEarned > 0) {
          try {
            const { data: commRes } = await supabase.rpc(
              "apply_agent_commission_atomic",
              {
                p_earner_email: cleanEmail,
                p_gross_amount: grossEarned,
                p_ad_id: adId,
              }
            );
            if (commRes?.applied) {
              rpcResult.amount = Number(
                commRes.net_earner_amount ?? grossEarned
              );
              rpcResult.result = rpcResult.amount;
              if (
                commRes.earner_new_balance !== undefined &&
                commRes.earner_new_balance !== null
              ) {
                rpcResult.balance = Number(commRes.earner_new_balance);
              }
            }
          } catch {}
        }
      }

      return new Response(JSON.stringify(rpcResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Unable to process reward right now. Please try again.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "Unable to process reward right now. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
