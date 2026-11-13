import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getVerifiedUserEmail } from "../_shared/auth.ts";
import { computeAtwTierDetails } from "../_shared/atwEngine.ts";
import { AFFILIATE_EMAILS, corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { evaluateKinematics } from "../_shared/kinematics.ts";

async function verifyHmacToken(
  token: string,
  payload: string,
  secret: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const hexMatch = token.match(/.{1,2}/g);
    if (!hexMatch || hexMatch.length !== 32) return false;
    const sigBytes = new Uint8Array(hexMatch.map((byte) => parseInt(byte, 16)));
    return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(payload));
  } catch {
    return false;
  }
}

async function archiveExhaustedAd(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  adRow: Record<string, unknown>,
  finalImpressionCount: number,
): Promise<void> {
  const adId = String(adRow.id || "");
  if (!adId) return;

  // Prefer canonical atomic archival RPC (handles completed_ads, addscompleted, bidded_ads, addsactive)
  const { error: rpcErr } = await supabase.rpc("archive_completed_ad", {
    p_ad_id: adId,
  });
  if (!rpcErr) return;

  const nowIso = new Date().toISOString();
  const completedAdSnapshot = {
    id: adRow.id,
    ad_type: adRow.ad_type,
    industry: adRow.industry,
    interest: adRow.interest,
    lifestyle: adRow.lifestyle,
    behavior: adRow.behavior,
    personality: adRow.personality,
    age_range: adRow.age_range,
    targeting_all: adRow.targeting_all,
    impressions: adRow.impressions,
    country: adRow.country,
    state: adRow.state,
    province: adRow.province,
    gender: adRow.gender,
    employment_status: adRow.employment_status,
    ad_media_type: adRow.ad_media_type,
    ad_content: adRow.ad_content,
    ad_media_url: adRow.ad_media ?? adRow.ad_media_url ?? null,
    ad_action_buttons: adRow.ad_action_buttons,
    action_phone: adRow.action_phone,
    action_whatsapp: adRow.action_whatsapp,
    action_website: adRow.action_website,
    action_email: adRow.action_email,
    cost_per_impression: adRow.cost_per_impression,
    total_cost: adRow.total_cost,
    created_at: adRow.created_at || nowIso,
    completed_at: nowIso,
    user_id: adRow.user_id,
    user_email: adRow.user_email,
    impression_count: finalImpressionCount,
  };

  const addsCompletedSnapshot = {
    ...adRow,
    impression_count: finalImpressionCount,
    completed_at: nowIso,
  };

  await Promise.allSettled([
    supabase.from("completed_ads").upsert(completedAdSnapshot, { onConflict: "id" }),
    supabase.from("addscompleted").upsert(addsCompletedSnapshot, { onConflict: "id" }),
    supabase.from("bidded_ads").delete().eq("ad_id", adId),
    supabase.from("addsactive").delete().eq("id", adId),
  ]);
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
    const actionType = String(body?.type || body?.action || "earn").toLowerCase().trim();
    const adId = String(body?.adId || body?.ad_id || "").trim();

    const verifiedEmail = await getVerifiedUserEmail(req);
    const requestedEmail = (
      req.headers.get("x-user-email") || String(body?.userEmail || body?.email || "")
    )
      .toLowerCase()
      .trim();

    if (!verifiedEmail) {
      return errorResponse("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (
      verifiedEmail !== "service_role" &&
      requestedEmail &&
      verifiedEmail !== requestedEmail
    ) {
      return errorResponse("Session identity mismatch. Please sign in again.", 403);
    }

    const cleanEmail =
      verifiedEmail === "service_role" ? requestedEmail : verifiedEmail;
    if (!adId || !cleanEmail) {
      return errorResponse("Missing campaign ID or user session.", 400);
    }

    // Check deactivated tombstone immediately
    const { data: tombstone } = await supabase
      .from("deactivated_users")
      .select("email")
      .eq("email", cleanEmail)
      .maybeSingle();
    if (tombstone) {
      return jsonResponse(
        {
          success: false,
          code: "ACCOUNT_DEACTIVATED",
          error: "This account has been deactivated.",
        },
        403,
      );
    }

    // 1. Mutual Click Action
    if (actionType === "mutual") {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        "handle_mutual_click",
        { p_ad_id: adId, p_user_email: cleanEmail },
      );
      if (!rpcErr && rpcRes) {
        return jsonResponse({ success: true, ...rpcRes });
      }
      return jsonResponse({ success: true });
    }

    // 2. Seen / Dismiss Action
    if (actionType === "seen") {
      await supabase.rpc("record_ad_seen", {
        p_ad_id: adId,
        p_user_email: cleanEmail,
      });
      return jsonResponse({ success: true });
    }

    // 3. Validate Kinematics PoH BEFORE token/lock verification & earn claim
    let viewDuration = 0;
    if (actionType === "earn") {
      const rawVectors = body?.kinematicVectors ?? body?.vectors ?? body?.kinematics;
      const poh = evaluateKinematics(rawVectors);
      if (!poh.isHuman) {
        return jsonResponse(
          {
            success: false,
            code: "BOT_ACTIVITY_DETECTED",
            botScore: poh.botScore,
            reasons: poh.reasons,
            error: "Automated or synthetic interaction detected. Earning reward rejected.",
          },
          403,
        );
      }

      // 4. Mandatory Cryptographic HMAC Token & Dwell Window Verification (12s..30m)
      const token = String(body?.token || "").trim();
      const servedAtRaw = body?.servedAt;
      const secret =
        Deno.env.get("EARN_TOKEN_SECRET") ||
        Deno.env.get("NEXTAUTH_SECRET") ||
        Deno.env.get("AUTH0_SECRET") ||
        "";

      if (secret) {
        if (!token || !servedAtRaw) {
          return jsonResponse(
            {
              success: false,
              code: "TOKEN_REQUIRED",
              error: "Verification token and timestamp are required to claim reward.",
            },
            403,
          );
        }

        const parsedServedAt = Number.parseInt(String(servedAtRaw), 10);
        const nowMs = Date.now();
        viewDuration = nowMs - parsedServedAt;
        if (!Number.isFinite(parsedServedAt) || viewDuration < 12000) {
          return jsonResponse(
            {
              success: false,
              code: "DWELL_TOO_SHORT",
              error: "Minimum attention duration not met (12s required). Please view ad completely.",
            },
            400,
          );
        }
        if (viewDuration > 1800000) {
          return jsonResponse(
            {
              success: false,
              code: "TOKEN_EXPIRED",
              error: "Ad session expired (30-minute limit exceeded). Please refresh your feed.",
            },
            403,
          );
        }

        const payloads = [
          `${adId}:${cleanEmail}:${servedAtRaw}`,
          `${adId}:${requestedEmail}:${servedAtRaw}`,
        ];
        let tokenValid = false;
        for (const p of payloads) {
          if (await verifyHmacToken(token, p, secret)) {
            tokenValid = true;
            break;
          }
        }
        if (!tokenValid) {
          return jsonResponse(
            {
              success: false,
              code: "INVALID_TOKEN",
              error: "Cryptographic token verification failed. Reward rejected.",
            },
            403,
          );
        }
      } else {
        // When EARN_TOKEN_SECRET isn't configured in dev, still enforce 12s dwell if servedAt supplied
        if (servedAtRaw) {
          viewDuration = Date.now() - Number.parseInt(String(servedAtRaw), 10);
          if (!Number.isFinite(viewDuration) || viewDuration < 12000 || viewDuration > 1800000) {
            return jsonResponse(
              {
                success: false,
                code: "INVALID_DWELL",
                error: "Invalid ad viewing duration.",
              },
              400,
            );
          }
        } else {
          viewDuration = 16000;
        }
      }
    }

    // 5. Look up active campaign in `addsactive` ONLY (never fallback to unapproved `public.adds`)
    const { data: adRow, error: adErr } = await supabase
      .from("addsactive")
      .select("*")
      .eq("id", adId)
      .maybeSingle();

    if (adErr || !adRow) {
      return jsonResponse({
        success: false,
        code: "CAMPAIGN_COMPLETED",
        error: "This campaign has ended.",
      });
    }

    if (
      adRow.is_admin_post ||
      !adRow.cost_per_impression ||
      Number(adRow.cost_per_impression) <= 0 ||
      !adRow.impressions ||
      Number(adRow.impressions) <= 0
    ) {
      return jsonResponse({
        success: false,
        code: "NO_BUDGET",
        error: "This is a platform post without an earning budget.",
      });
    }

    if (String(adRow.user_email || "").toLowerCase().trim() === cleanEmail) {
      return jsonResponse({
        success: false,
        code: "SELF_VIEW_REJECTED",
        error: "You cannot earn from your own campaign.",
      });
    }

    const targetImpressions = Number(adRow.impressions || 0);
    const currentImpCount = Number(adRow.impression_count || 0);
    if (adRow.completed_at || (targetImpressions > 0 && currentImpCount >= targetImpressions)) {
      await archiveExhaustedAd(supabase, adRow, Math.max(currentImpCount, targetImpressions));
      return jsonResponse({
        success: false,
        code: "CAMPAIGN_COMPLETED",
        error: "This ad campaign has completed its impression budget.",
      });
    }

    const rawCpi = Number(adRow.cost_per_impression);
    const clientBonusSeconds =
      typeof body?.bonusSeconds === "number" && Number.isFinite(body.bonusSeconds)
        ? body.bonusSeconds
        : 0;
    const serverMaxBonusSeconds = Math.max(0, Math.floor(viewDuration / 1000) - 16);
    const bonusSeconds = Math.max(0, Math.min(16, clientBonusSeconds, serverMaxBonusSeconds));
    const attentionSharePercent = 0.3 + (bonusSeconds / 16.0) * 0.2;
    const earnedRate = Math.round(rawCpi * attentionSharePercent * 100) / 100;
    const deviceId = String(body?.deviceId || "").trim() || null;

    // 6. Execute authoritative PostgreSQL atomic earning RPC
    let rpcResult: Record<string, unknown> | null = null;
    let rpcError: unknown = null;

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
    } catch (e) {
      rpcError = e;
    }

    if (!rpcError && rpcResult) {
      if (rpcResult.success === false) {
        const code = String(rpcResult.code || "EARN_REJECTED");
        const status =
          code === "ALREADY_EARNED" || code === "FREQUENCY_CAP_REACHED"
            ? 409
            : code === "ACCOUNT_DEACTIVATED"
            ? 403
            : 200;
        return jsonResponse(
          {
            success: false,
            code,
            error: String(rpcResult.error || "Unable to claim ad reward."),
            balance: rpcResult.new_balance ?? rpcResult.balance,
            clicks: rpcResult.new_clicks ?? rpcResult.clicks,
          },
          status,
        );
      }

      // Ensure ad exhaustion archival if target impressions reached
      const nextImpCount = currentImpCount + 1;
      if (targetImpressions > 0 && nextImpCount >= targetImpressions) {
        await archiveExhaustedAd(supabase, adRow, nextImpCount);
      }

      const netCredited = Number(rpcResult.net_credited ?? rpcResult.amount ?? 0);
      return jsonResponse({
        success: true,
        code: String(rpcResult.code || "EARN_SUCCESS"),
        amount: netCredited,
        net_credited: netCredited,
        raw_earn_rate: Number(rpcResult.raw_earn_rate ?? earnedRate),
        capped: Boolean(rpcResult.capped ?? rpcResult.is_capped),
        balance: Number(rpcResult.new_balance ?? rpcResult.balance ?? 0),
        clicks: Number(rpcResult.new_clicks ?? rpcResult.clicks ?? 0),
        atw_tier: rpcResult.atw_tier,
        atw_level: rpcResult.atw_level,
        holding_cap: rpcResult.holding_cap,
        attention_worth_score: rpcResult.attention_worth_score,
        monetized: Boolean(rpcResult.monetized ?? rpcResult.is_monetized),
      });
    }

    // 7. Resilient Direct DB Fallback (ONLY when RPC function itself failed/unavailable)
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select(
        "id, email, balance, monetization_clicks, monetized, has_cancelled_monetization, suspended_until, ad_account_status, attention_worth_score, atw_tier, is_affiliate, is_career",
      )
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (userErr || !user) {
      return errorResponse("User profile not found.", 404);
    }

    if (
      user.ad_account_status === "deactivated" ||
      user.ad_account_status === "banned" ||
      (user.suspended_until && new Date(user.suspended_until).getTime() > Date.now())
    ) {
      return jsonResponse(
        { success: false, code: "USER_SUSPENDED", error: "Account is currently restricted." },
        403,
      );
    }

    // Enforce ALREADY_EARNED strictly per user frequency cap
    const freqCap = Math.max(1, Number(adRow.user_frequency_cap ?? adRow.frequency_cap ?? 1));
    const { data: existingImp } = await supabase
      .from("ad_impressions")
      .select("id, view_count, today_view_count, last_viewed_at")
      .eq("ad_id", adId)
      .ilike("user_email", cleanEmail)
      .maybeSingle();

    const existingViews = Number(existingImp?.view_count || 0);
    if (existingViews >= freqCap) {
      return jsonResponse(
        {
          success: false,
          code: "ALREADY_EARNED",
          error: "You have already earned from this campaign.",
        },
        409,
      );
    }

    // Atomic optimistic lock on addsactive impression_count to prevent concurrent double-pay
    const nextImpCount = currentImpCount + 1;
    const isNowExhausted = targetImpressions > 0 && nextImpCount >= targetImpressions;
    let adUpdQuery = supabase
      .from("addsactive")
      .update({
        impression_count: nextImpCount,
        completed_at: isNowExhausted ? new Date().toISOString() : adRow.completed_at,
      })
      .eq("id", adId);
    adUpdQuery = adRow.impression_count == null
      ? adUpdQuery.is("impression_count", null)
      : adUpdQuery.eq("impression_count", currentImpCount);
    const { data: updatedAd, error: adUpdErr } = await adUpdQuery
      .select("id")
      .maybeSingle();

    if (adUpdErr || !updatedAd) {
      return jsonResponse(
        {
          success: false,
          code: "ALREADY_EARNED",
          error: "Impression slot claimed concurrently. Please refresh.",
        },
        409,
      );
    }

    // Record per-user impression
    const todayIso = new Date().toISOString().slice(0, 10);
    const lastDay = existingImp?.last_viewed_at
      ? String(existingImp.last_viewed_at).slice(0, 10)
      : "";
    if (existingImp?.id) {
      await supabase
        .from("ad_impressions")
        .update({
          view_count: existingViews + 1,
          today_view_count: lastDay === todayIso ? Number(existingImp.today_view_count || 0) + 1 : 1,
          last_viewed_at: new Date().toISOString(),
        })
        .eq("id", existingImp.id);
    } else {
      await supabase.from("ad_impressions").insert([
        {
          ad_id: adId,
          user_email: cleanEmail,
          view_count: 1,
          today_view_count: 1,
          last_viewed_at: new Date().toISOString(),
        },
      ]);
    }

    // Compute canonical ATW tier, holding cap, and monetization progress
    const isExempt = Boolean(
      user.is_affiliate || user.is_career || AFFILIATE_EMAILS.has(cleanEmail),
    );
    const hasCancelled = Boolean(user.has_cancelled_monetization);
    const currentlyMonetized =
      !hasCancelled &&
      (isExempt ||
        ["true", "yes", "1", "t"].includes(String(user.monetized || "").toLowerCase()));

    const nextClicks = Number(user.monetization_clicks || 0) + 1;
    const atwAfter = computeAtwTierDetails({
      email: cleanEmail,
      clicks: nextClicks,
      attentionWorthScore: user.attention_worth_score,
      currentTier: user.atw_tier,
      isAffiliate: user.is_affiliate,
      isCareer: user.is_career,
    });

    const currentBal = Number(user.balance || 0);
    let netCredited = 0;
    let isCapped = false;
    if (currentlyMonetized) {
      if (atwAfter.isUnlimited) {
        netCredited = earnedRate;
      } else {
        const room = Math.max(0, atwAfter.holdingCap - currentBal);
        netCredited = Math.round(Math.min(earnedRate, room) * 100) / 100;
        isCapped = netCredited < earnedRate;
      }
    }

    const nextBalance = Math.round((currentBal + netCredited) * 100) / 100;
    const nextMonetized = hasCancelled
      ? "false"
      : currentlyMonetized || nextClicks >= 300
      ? "true"
      : "false";

    await supabase
      .from("users")
      .update({
        balance: nextBalance,
        monetization_clicks: nextClicks,
        atw_tier: atwAfter.tier,
        monetized: nextMonetized,
        last_active_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    // Direct 1%/2% commission only when monetized and netCredited > 0
    if (currentlyMonetized && netCredited > 0) {
      await supabase
        .rpc("credit_affiliate_platform_share_atomic", {
          p_raw_cpi: rawCpi,
          p_ad_id: adId,
          p_earner_email: cleanEmail,
        })
        .catch(() => {});
    }

    if (isNowExhausted) {
      await archiveExhaustedAd(supabase, adRow, nextImpCount);
    }

    return jsonResponse({
      success: true,
      code: "EARN_SUCCESS",
      amount: netCredited,
      net_credited: netCredited,
      raw_earn_rate: earnedRate,
      capped: isCapped,
      balance: nextBalance,
      clicks: nextClicks,
      atw_tier: atwAfter.tier,
      atw_level: atwAfter.tierLevel,
      holding_cap: atwAfter.isUnlimited ? null : atwAfter.holdingCap,
      attention_worth_score: atwAfter.score,
      monetized: nextMonetized === "true",
    });
  } catch (err: unknown) {
    console.error("earn-payout error:", err);
    return errorResponse("Failed to process reward claim right now.", 500);
  }
});
