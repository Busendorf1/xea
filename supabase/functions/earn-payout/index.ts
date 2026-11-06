import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-email",
};

const PRECONFIGURED_AFFILIATE_EMAILS = [
  "nonsom019@gmail.com",
  "nonsom2023@gmail.com",
];

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
    const rawEmail =
      req.headers.get("x-user-email") || String(body?.email || "");
    const cleanEmail = rawEmail.toLowerCase().trim();

    if (!adId || !cleanEmail) {
      return new Response(
        JSON.stringify({ error: "Missing adId or authenticated user email." }),
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
      const mode = telemetry[0]?.mode || (telemetry.length <= 3 ? "tap" : "swipe");
      const tooFast =
        (mode === "hold" && durationMs < 400) ||
        (mode === "tap" && (telemetry.length < 3 || durationMs < 110)) ||
        (mode === "swipe" && (telemetry.length < 3 || durationMs < 60));

      if (untrusted || tooFast) {
        return new Response(
          JSON.stringify({
            success: false,
            code: "POH_RETRY",
            error: "Synthetic touch gesture detected. Please interact naturally.",
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
          error: "Physical verification telemetry required.",
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
      .select("cost_per_impression, impressions, impression_count, user_frequency_cap")
      .eq("id", adId)
      .maybeSingle();

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
        // Ensure Affiliate 10% platform share is credited if RPC didn't already mark affiliate_credited
        if (!rpcResult.affiliate_credited) {
          try {
            await supabase.rpc("credit_affiliate_platform_share_atomic", {
              p_raw_cpi: rawCpi,
              p_ad_id: adId,
              p_earner_email: cleanEmail,
            });
          } catch {}
        }

        // Apply Agent 1% / 2% commission split if viewer earned > 0
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
              rpcResult.amount = Number(commRes.net_earner_amount ?? grossEarned);
              rpcResult.result = rpcResult.amount;
              if (commRes.earner_new_balance !== undefined && commRes.earner_new_balance !== null) {
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

    // Fallback atomic update if RPC is not yet installed
    const { data: dbUser } = await supabase
      .from("users")
      .select("balance, monetization_clicks, monetized, cooldown_until, is_affiliate, is_career")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (!dbUser) {
      return new Response(
        JSON.stringify({ error: "User profile not found." }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const isExemptUser =
      Boolean((dbUser as any).is_affiliate) ||
      Boolean((dbUser as any).is_career) ||
      PRECONFIGURED_AFFILIATE_EMAILS.includes(cleanEmail);

    if (
      !isExemptUser &&
      dbUser.cooldown_until &&
      new Date(dbUser.cooldown_until).getTime() > Date.now()
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "COOLDOWN_ACTIVE",
          cooldownUntil: dbUser.cooldown_until,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const liveClicks = (Number(dbUser.monetization_clicks) || 0) + 1;
    const isMonetized =
      isExemptUser ||
      dbUser.monetized === true ||
      dbUser.monetized === "true" ||
      dbUser.monetized === "yes" ||
      liveClicks >= 300;
    let finalEarned = isMonetized ? earnedRate : 0;
    let updatedBalance = isMonetized
      ? Math.round(((Number(dbUser.balance) || 0) + finalEarned) * 100) / 100
      : Number(dbUser.balance) || 0;

    await supabase
      .from("users")
      .update({
        balance: updatedBalance,
        monetization_clicks: liveClicks,
        monetized: isMonetized ? "true" : dbUser.monetized,
      })
      .ilike("email", cleanEmail);

    // Credit 10% of rawCpi from Platform's 50% share to each Affiliate
    const affiliateCut = Math.round(rawCpi * 0.10 * 100) / 100;
    if (affiliateCut > 0) {
      try {
        const { data: rpcAff } = await supabase.rpc(
          "credit_affiliate_platform_share_atomic",
          {
            p_raw_cpi: rawCpi,
            p_ad_id: adId,
            p_earner_email: cleanEmail,
          }
        );
        if (!rpcAff?.success) {
          for (const affEmail of PRECONFIGURED_AFFILIATE_EMAILS) {
            const { data: affRow } = await supabase
              .from("users")
              .select("id, balance")
              .ilike("email", affEmail)
              .maybeSingle();
            if (affRow) {
              const nextAffBal =
                Math.round(((Number(affRow.balance) || 0) + affiliateCut) * 100) /
                100;
              await supabase
                .from("users")
                .update({ balance: nextAffBal, monetized: "true" })
                .eq("id", affRow.id);
              if (affEmail === cleanEmail) {
                updatedBalance = nextAffBal;
              }
            }
          }
        }
      } catch {}
    }

    // Apply Agent 1% / 2% commission if monetized
    if (finalEarned > 0) {
      try {
        const { data: commRes } = await supabase.rpc(
          "apply_agent_commission_atomic",
          {
            p_earner_email: cleanEmail,
            p_gross_amount: finalEarned,
            p_ad_id: adId,
          }
        );
        if (commRes?.applied) {
          finalEarned = Number(commRes.net_earner_amount ?? finalEarned);
          if (commRes.earner_new_balance !== undefined && commRes.earner_new_balance !== null) {
            updatedBalance = Number(commRes.earner_new_balance);
          }
        }
      } catch {}
    }

    return new Response(
      JSON.stringify({
        success: true,
        result: finalEarned,
        amount: finalEarned,
        balance: updatedBalance,
        clicks: liveClicks,
      }),
      {
        status: 200,
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
