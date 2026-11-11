import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getVerifiedUserEmail } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-email, x-user-authorization",
};

async function verifyHmacToken(token: string, payload: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const hashArray = Array.from(new Uint8Array(signature));
    const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex.toLowerCase() === token.toLowerCase();
  } catch {
    return false;
  }
}

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

    // 3. Cryptographic HMAC Token & 12s Dwell Time Check (for earn actions)
    let viewDuration = 0;
    if (actionType === "earn") {
      const token = body?.token;
      const servedAt = body?.servedAt;
      const secret = Deno.env.get("EARN_TOKEN_SECRET") || Deno.env.get("AUTH0_SECRET") || "";

      if (secret && (token || servedAt || Deno.env.get("ENVIRONMENT") === "production")) {
        if (!token || !servedAt) {
          return new Response(
            JSON.stringify({ success: false, error: "Verification token and timestamp required to claim reward." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const payloads = [
          `${adId}:${cleanEmail}:${servedAt}`,
          `${adId}:${requestedEmail}:${servedAt}`,
        ];

        let isValid = false;
        for (const p of payloads) {
          if (await verifyHmacToken(token, p, secret)) {
            isValid = true;
            break;
          }
        }

        if (!isValid) {
          return new Response(
            JSON.stringify({ success: false, error: "Cryptographic token verification failed. Reward rejected." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const now = Date.now();
        const parsedServedAt = parseInt(servedAt, 10);
        viewDuration = now - parsedServedAt;
        if (isNaN(parsedServedAt) || viewDuration < 12000) {
          return new Response(
            JSON.stringify({ success: false, error: "Minimum attention duration not met (12s required). Please view ad completely." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // 4. Proof-of-Human Telemetry Sanity Check
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

    // 4. Resolve Ad Details (check addsactive first, fallback to adds)
    let { data: adRow } = await supabase
      .from("addsactive")
      .select(
        "id, cost_per_impression, impressions, impression_count, user_frequency_cap, user_email, is_admin_post, completed_at"
      )
      .eq("id", adId)
      .maybeSingle();

    if (!adRow) {
      const { data: addsRow } = await supabase
        .from("adds")
        .select(
          "id, cost_per_impression, impressions, impression_count, user_frequency_cap, user_email, is_admin_post, completed_at"
        )
        .eq("id", adId)
        .maybeSingle();
      adRow = addsRow;
    }

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

    const isPlatformPost = Boolean(
      adRow.is_admin_post ||
      !adRow.cost_per_impression ||
      Number(adRow.cost_per_impression) <= 0 ||
      !adRow.impressions ||
      Number(adRow.impressions) <= 0
    );

    if (isPlatformPost) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "This is a platform post without an earning budget.",
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

    const targetImpressions = Number(adRow.impressions || 0);
    const currentImpressionCount = Number(adRow.impression_count || 0);
    if (adRow.completed_at || (targetImpressions > 0 && currentImpressionCount >= targetImpressions)) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "CAMPAIGN_COMPLETED",
          error: "This ad campaign has completed its impression budget.",
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
    // Dynamic attention share: 30% base (16s focus) scaling up to 50% max (32s focus)
    const clientBonusSeconds =
      typeof body?.bonusSeconds === "number" && Number.isFinite(body.bonusSeconds) ? body.bonusSeconds : 0;
    const serverMaxBonusSeconds = Math.max(0, Math.floor(viewDuration / 1000) - 16);
    const bonusSeconds = Math.max(0, Math.min(16, clientBonusSeconds, serverMaxBonusSeconds));
    const attentionSharePercent = 0.30 + (bonusSeconds / 16.0) * 0.20;
    const earnedRate = Math.round(rawCpi * attentionSharePercent * 100) / 100;
    const deviceId = String(body?.deviceId || "").trim() || null;

    // 5. Attempt Atomic Ad Earning Claim via authoritative PostgreSQL RPC
    let rpcResult: any = null;
    let rpcError: any = null;

    try {
      const res = await supabase.rpc("claim_ad_earning_atomic", {
        p_ad_id: adId,
        p_user_email: cleanEmail,
        p_expected_rate: earnedRate,
        p_device_id: deviceId,
        p_skip_ad_counter: false,
      });
      rpcResult = res.data;
      rpcError = res.error;
    } catch (e: any) {
      rpcError = e;
    }

    if (rpcError) {
      console.warn("⚠️ claim_ad_earning_atomic RPC failed in earn-payout:", rpcError?.message || rpcError);
    }

    const isLegitRejection =
      rpcResult &&
      !rpcResult.success &&
      (rpcResult.code === "CAMPAIGN_COMPLETED" ||
        rpcResult.code === "USER_SUSPENDED" ||
        rpcResult.code === "ALREADY_EARNED" ||
        rpcResult.code === "USER_NOT_FOUND");

    let finalResult = rpcResult;

    // 6. Direct Database Fallback if RPC failed or had unexpected rejection
    if (rpcError || !finalResult || (!finalResult.success && !isLegitRejection)) {
      console.info("⚙️ Running direct DB fallback in earn-payout Edge Function for user:", cleanEmail);

      const { data: dbUser, error: userFetchErr } = await supabase
        .from("users")
        .select("id, balance, monetization_clicks, monetized, referral_downloads_count, suspended_until, atw_tier, is_affiliate, is_career")
        .ilike("email", cleanEmail)
        .maybeSingle();

      if (userFetchErr || !dbUser) {
        return new Response(
          JSON.stringify({
            success: false,
            code: "USER_NOT_FOUND",
            error: "Viewer profile not found.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const isExempt = Boolean(
        dbUser.is_affiliate ||
        dbUser.is_career ||
        ["nonsom019@gmail.com", "nonsom2023@gmail.com"].includes(cleanEmail)
      );

      if (!isExempt && dbUser.suspended_until && new Date(dbUser.suspended_until).getTime() > Date.now()) {
        return new Response(
          JSON.stringify({
            success: false,
            code: "USER_SUSPENDED",
            error: "Account is currently suspended.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const currentBal = Number(dbUser.balance) || 0;
      const currentClicks = Number(dbUser.monetization_clicks) || 0;
      const currentInvites = Number(dbUser.referral_downloads_count) || 0;
      const isMonetized = Boolean(
        isExempt ||
        dbUser.monetized === true ||
        dbUser.monetized === "true" ||
        currentClicks >= 300 ||
        currentInvites >= 12
      );

      const userFreqCap = Number(adRow.user_frequency_cap || 1);

      // Check frequency cap in ad_impressions
      const { data: impRow } = await supabase
        .from("ad_impressions")
        .select("id, view_count")
        .eq("ad_id", adId)
        .ilike("user_email", cleanEmail)
        .maybeSingle();

      const existingViews = impRow ? Number(impRow.view_count || 0) : 0;
      if (existingViews >= userFreqCap) {
        return new Response(
          JSON.stringify({
            success: false,
            code: "ALREADY_EARNED",
            error: "Frequency cap reached for this ad campaign.",
            views: existingViews,
            cap: userFreqCap,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // ATW Holding Cap calculation
      const nextClicks = currentClicks + 1;
      const tierLevel = Math.min(3, Math.max(1, Math.floor(nextClicks / 300) + 1));
      const holdingCap = isExempt ? Infinity : tierLevel * 30000;
      let rateToApply = isMonetized ? earnedRate : 0;
      let isCapped = false;
      if (currentBal >= holdingCap) {
        rateToApply = 0;
        isCapped = true;
      }
      const newBal = isMonetized ? Math.min(holdingCap, Math.round((currentBal + rateToApply) * 100) / 100) : currentBal;
      const nextMonetized = (isMonetized || nextClicks >= 300) ? "true" : "false";

      // Upsert impression
      if (impRow) {
        await supabase
          .from("ad_impressions")
          .update({
            view_count: existingViews + 1,
            last_viewed_at: new Date().toISOString(),
          })
          .eq("id", impRow.id);
      } else {
        await supabase
          .from("ad_impressions")
          .insert({
            ad_id: adId,
            user_email: cleanEmail,
            view_count: 1,
            today_view_count: 1,
            last_viewed_at: new Date().toISOString(),
          });
      }

      // Increment ad impression count in addsactive
      const nextImpCount = currentImpressionCount + 1;
      const isNowCompleted = targetImpressions > 0 && nextImpCount >= targetImpressions;
      await supabase
        .from("addsactive")
        .update({
          impression_count: nextImpCount,
          completed_at: isNowCompleted ? new Date().toISOString() : adRow.completed_at,
        })
        .eq("id", adId);

      // Update user record
      await supabase
        .from("users")
        .update({
          balance: newBal,
          monetization_clicks: nextClicks,
          atw_tier: isExempt ? "Unlimited" : `ATW${tierLevel}`,
          monetized: nextMonetized,
          last_active_at: new Date().toISOString(),
        })
        .eq("id", dbUser.id);

      finalResult = {
        success: true,
        code: "EARN_SUCCESS",
        amount: rateToApply,
        raw_cpi: rawCpi,
        balance: newBal,
        clicks: nextClicks,
        views: existingViews + 1,
        cap: userFreqCap,
        holding_cap: holdingCap === Infinity ? 999999999 : holdingCap,
        is_capped: isCapped,
        monetized: nextMonetized === "true",
        affiliate_credited: false,
      };
    }

    if (finalResult && finalResult.success) {
      if (!finalResult.affiliate_credited) {
        try {
          await supabase.rpc("credit_affiliate_platform_share_atomic", {
            p_raw_cpi: rawCpi,
            p_ad_id: adId,
            p_earner_email: cleanEmail,
          });
        } catch {}
      }

      const grossEarned = Number(finalResult.amount ?? finalResult.result ?? 0);
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
            finalResult.amount = Number(
              commRes.net_earner_amount ?? grossEarned
            );
            finalResult.result = finalResult.amount;
            if (
              commRes.earner_new_balance !== undefined &&
              commRes.earner_new_balance !== null
            ) {
              finalResult.balance = Number(commRes.earner_new_balance);
            }
          }
        } catch {}
      }
    }

    if (finalResult) {
      return new Response(JSON.stringify(finalResult), {
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
    console.error("❌ Fatal error in earn-payout:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || "Unable to process reward right now. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
