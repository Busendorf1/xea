import { computeAtwTierDetails, getScoreIncrementForStars } from "../_shared/atwEngine.ts";
import { AFFILIATE_EMAILS, errorResponse, jsonResponse } from "../_shared/cors.ts";

export async function handlePauseOrCancel(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  action: "pause_ad" | "pause_highlight" | "cancel_ad" | "delete_highlight",
  body: Record<string, unknown>,
): Promise<Response> {
  if (action === "pause_ad") {
    const adId = String(body?.adId || "").trim();
    const isPaused = Boolean(body?.isPaused);
    const [activeRes, addsRes] = await Promise.all([
      supabase.from("addsactive").update({ is_paused: isPaused }).eq("id", adId).ilike("user_email", cleanEmail),
      supabase.from("adds").update({ is_paused: isPaused }).eq("id", adId).ilike("user_email", cleanEmail),
    ]);
    if (activeRes.error && addsRes.error) {
      return errorResponse("Could not update campaign status.", 400);
    }
    return jsonResponse({ success: true, isPaused });
  }

  if (action === "pause_highlight") {
    const highlightId = String(body?.highlightId || "").trim();
    const isPaused = Boolean(body?.isPaused);
    const [activeRes, newsRes] = await Promise.all([
      supabase.from("newsactive").update({ is_paused: isPaused }).eq("id", highlightId).ilike("user_email", cleanEmail),
      supabase.from("news").update({ is_paused: isPaused }).eq("id", highlightId).ilike("user_email", cleanEmail),
    ]);
    if (activeRes.error && newsRes.error) {
      return errorResponse("Could not update highlight status.", 400);
    }
    return jsonResponse({ success: true, isPaused });
  }

  if (action === "cancel_ad") {
    const adId = String(body?.adId || "").trim();
    const { data: activeAd } = await supabase
      .from("addsactive")
      .select("*")
      .eq("id", adId)
      .ilike("user_email", cleanEmail)
      .maybeSingle();

    if (activeAd) {
      const { error: archErr } = await supabase.rpc("archive_completed_ad", {
        p_ad_id: adId,
      });
      if (archErr) {
        const nowIso = new Date().toISOString();
        const completedAdRow = {
          id: activeAd.id,
          ad_type: activeAd.ad_type,
          industry: activeAd.industry,
          interest: activeAd.interest,
          lifestyle: activeAd.lifestyle,
          behavior: activeAd.behavior,
          personality: activeAd.personality,
          age_range: activeAd.age_range,
          targeting_all: activeAd.targeting_all,
          impressions: activeAd.impressions,
          country: activeAd.country,
          state: activeAd.state,
          province: activeAd.province,
          gender: activeAd.gender,
          employment_status: activeAd.employment_status,
          ad_media_type: activeAd.ad_media_type,
          ad_content: activeAd.ad_content,
          ad_media_url: activeAd.ad_media ?? activeAd.ad_media_url ?? null,
          ad_action_buttons: activeAd.ad_action_buttons,
          action_phone: activeAd.action_phone,
          action_whatsapp: activeAd.action_whatsapp,
          action_website: activeAd.action_website,
          action_email: activeAd.action_email,
          cost_per_impression: activeAd.cost_per_impression,
          total_cost: activeAd.total_cost,
          created_at: activeAd.created_at,
          completed_at: nowIso,
          user_id: activeAd.user_id,
          user_email: activeAd.user_email,
          impression_count: activeAd.impression_count ?? 0,
        };
        const addsCompletedRow = {
          ...activeAd,
          is_paused: true,
          completed_at: nowIso,
        };
        await Promise.allSettled([
          supabase.from("completed_ads").upsert([completedAdRow], { onConflict: "id" }),
          supabase.from("addscompleted").upsert([addsCompletedRow], { onConflict: "id" }),
          supabase.from("bidded_ads").delete().eq("ad_id", adId),
          supabase.from("addsactive").delete().eq("id", adId).ilike("user_email", cleanEmail),
        ]);
      }
      await supabase.from("adds").delete().eq("id", adId).ilike("user_email", cleanEmail);
      return jsonResponse({
        success: true,
        refunded: 0,
        message: "Campaign stopped and moved to completed campaigns.",
      });
    }

    await Promise.allSettled([
      supabase.from("adds").delete().eq("id", adId).ilike("user_email", cleanEmail),
      supabase.from("completed_ads").delete().eq("id", adId).ilike("user_email", cleanEmail),
      supabase.from("addscompleted").delete().eq("id", adId).ilike("user_email", cleanEmail),
    ]);
    return jsonResponse({ success: true, refunded: 0, message: "Campaign removed." });
  }

  const highlightId = String(body?.highlightId || "").trim();
  await Promise.allSettled([
    supabase.from("bidded_highlights").delete().eq("highlight_id", highlightId),
    supabase.from("news").delete().eq("id", highlightId).ilike("user_email", cleanEmail),
    supabase.from("newsactive").delete().eq("id", highlightId).ilike("user_email", cleanEmail),
  ]);
  return jsonResponse({ success: true });
}

export async function handleRecordSeen(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const adId = String(body?.adId || "").trim();
  if (!adId) return errorResponse("Ad ID is required.", 400);

  const { data: user } = await supabase
    .from("users")
    .select(
      "id, monetization_clicks, monetized, has_cancelled_monetization, attention_worth_score, atw_tier, is_affiliate, is_career, ad_account_status",
    )
    .ilike("email", cleanEmail)
    .maybeSingle();

  if (!user || user.ad_account_status === "deactivated") {
    return errorResponse("Account not active.", 403);
  }

  const [{ data: seenRpcRes, error: rpcErr }, { data: clickProgress }] =
    await Promise.all([
      supabase.rpc("record_ad_seen", { p_ad_id: adId, p_user_email: cleanEmail }),
      supabase.rpc("increment_user_click_progress", { p_email: cleanEmail, p_count: 1 }),
    ]);

  const seenFailed = Boolean(
    rpcErr ||
      seenRpcRes === false ||
      (typeof seenRpcRes === "object" && seenRpcRes !== null && (seenRpcRes as { success?: boolean }).success === false),
  );

  if (seenFailed) {
    const [{ data: adRow }, { data: existingImp }] = await Promise.all([
      supabase.from("addsactive").select("id, impression_count, impressions, user_frequency_cap").eq("id", adId).maybeSingle(),
      supabase.from("ad_impressions").select("id, view_count").eq("ad_id", adId).ilike("user_email", cleanEmail).maybeSingle(),
    ]);

    const cap = Math.max(1, Number(adRow?.user_frequency_cap ?? adRow?.frequency_cap ?? 1));
    if (!existingImp || Number(existingImp.view_count || 0) < cap) {
      if (existingImp?.id) {
        await supabase
          .from("ad_impressions")
          .update({ view_count: Number(existingImp.view_count || 0) + 1, last_viewed_at: new Date().toISOString() })
          .eq("id", existingImp.id);
      } else {
        await supabase
          .from("ad_impressions")
          .insert({ ad_id: adId, user_email: cleanEmail, view_count: 1, last_viewed_at: new Date().toISOString() });
      }
      if (adRow) {
        await supabase
          .from("addsactive")
          .update({ impression_count: Number(adRow.impression_count || 0) + 1 })
          .eq("id", adId);
      }
    }
  }

  let newCount =
    clickProgress && clickProgress.length > 0 && typeof clickProgress[0].new_click_count === "number"
      ? Number(clickProgress[0].new_click_count)
      : 0;
  let isMon = Boolean(clickProgress?.[0]?.is_now_monetized);

  const hasCancelled = Boolean(user.has_cancelled_monetization);
  if (!newCount) {
    newCount = Number(user.monetization_clicks || 0) + 1;
    const isExempt = Boolean(user.is_affiliate || user.is_career || AFFILIATE_EMAILS.has(cleanEmail));
    isMon =
      !hasCancelled &&
      (isExempt ||
        ["true", "yes", "1", "t"].includes(String(user.monetized || "").toLowerCase()) ||
        newCount >= 300);

    const atw = computeAtwTierDetails({
      email: cleanEmail,
      clicks: newCount,
      attentionWorthScore: user.attention_worth_score,
      currentTier: user.atw_tier,
      isAffiliate: user.is_affiliate,
      isCareer: user.is_career,
    });

    await supabase
      .from("users")
      .update({
        monetization_clicks: newCount,
        atw_tier: atw.tier,
        monetized: hasCancelled ? "false" : isMon ? "true" : "false",
        last_active_at: new Date().toISOString(),
      })
      .eq("id", user.id);
  }

  return jsonResponse({
    success: true,
    clicksCount: newCount || undefined,
    isMonetized: hasCancelled ? false : isMon,
  });
}

export async function handleRateListeners(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const adId = String(body?.ad_id || body?.adId || "").trim();
  const starRating = Number.parseInt(String(body?.star_rating ?? body?.starRating ?? 0), 10);

  if (!adId) {
    return errorResponse("Missing required field: ad_id", 400);
  }
  if (!Number.isFinite(starRating) || starRating < 1 || starRating > 5) {
    return errorResponse("Star rating must be an integer between 1 and 5.", 400);
  }

  // Strictly verify campaign ownership across active/completed/draft tables
  const [compRes, addsCompRes, activeRes, draftRes] = await Promise.all([
    supabase.from("completed_ads").select("id, user_email").eq("id", adId).maybeSingle(),
    supabase.from("addscompleted").select("id, user_email").eq("id", adId).maybeSingle(),
    supabase.from("addsactive").select("id, user_email").eq("id", adId).maybeSingle(),
    supabase.from("adds").select("id, user_email").eq("id", adId).maybeSingle(),
  ]);

  const ownedAd = compRes.data || addsCompRes.data || activeRes.data || draftRes.data;
  if (!ownedAd) {
    return errorResponse("Campaign not found.", 404);
  }
  if (String(ownedAd.user_email || "").toLowerCase().trim() !== cleanEmail) {
    return errorResponse("You do not own this campaign and cannot rate its listeners.", 403);
  }

  const { data: existingRating } = await supabase
    .from("completed_ads_ratings")
    .select("id, star_rating")
    .eq("ad_id", adId)
    .ilike("advertiser_email", cleanEmail)
    .maybeSingle();

  if (existingRating) {
    return errorResponse(
      `You have already rated this campaign (${existingRating.star_rating} Stars).`,
      409,
    );
  }

  const scoreIncrement = getScoreIncrementForStars(starRating);

  // Call authoritative SQL RPC directly FIRST (RPC inserts into completed_ads_ratings itself)
  const { error: rpcErr } = await supabase.rpc("apply_ad_rating_to_listeners", {
    p_ad_id: adId,
    p_advertiser_email: cleanEmail,
    p_star_rating: starRating,
  });

  if (rpcErr) {
    const errMsg = String(rpcErr.message || "").toLowerCase();
    if (errMsg.includes("already been rated") || errMsg.includes("duplicate")) {
      return errorResponse("You have already rated this campaign.", 409);
    }

    // Resilient fallback ONLY when RPC itself is unavailable/errors for another reason
    await supabase
      .from("completed_ads_ratings")
      .insert([
        {
          ad_id: adId,
          advertiser_email: cleanEmail,
          star_rating: starRating,
          score_increment: scoreIncrement,
        },
      ])
      .catch(() => {});

    const { data: impressions } = await supabase
      .from("ad_impressions")
      .select("user_email")
      .eq("ad_id", adId)
      .limit(500);

    const listenerEmails = Array.from(
      new Set(
        (impressions || [])
          .map((i: { user_email: string }) => String(i.user_email || "").toLowerCase().trim())
          .filter(Boolean),
      ),
    );

    if (listenerEmails.length > 0) {
      const { data: listeners } = await supabase
        .from("users")
        .select("id, email, monetization_clicks, attention_worth_score, atw_tier, is_affiliate, is_career")
        .in("email", listenerEmails);

      for (const l of listeners || []) {
        const nextScore = Math.min(
          1000000,
          Math.round((Number(l.attention_worth_score ?? 0.1) + scoreIncrement) * 10000) / 10000,
        );
        const atw = computeAtwTierDetails({
          email: l.email,
          clicks: l.monetization_clicks,
          attentionWorthScore: nextScore,
          currentTier: l.atw_tier,
          isAffiliate: l.is_affiliate,
          isCareer: l.is_career,
        });
        await supabase
          .from("users")
          .update({
            attention_worth_score: nextScore,
            atw_tier: atw.tier,
          })
          .eq("id", l.id);
      }
    }
  }

  return jsonResponse({
    success: true,
    star_rating: starRating,
    score_increment: scoreIncrement,
    message: `Thank you for rating! +${scoreIncrement.toFixed(2)} Attention Score applied to participating listeners.`,
  });
}

export async function handleReportAd(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const adId = String(body?.adId || body?.ad_id || "").trim();
  const rawType = String(body?.reportType || body?.type || "").toLowerCase().trim();
  let targetAdvertiser = String(body?.advertiserEmail || body?.advertiser_email || "").toLowerCase().trim();
  const reason = body?.reason ? String(body.reason).slice(0, 500) : null;

  const normalizedType =
    rawType === "block_ad" || rawType === "ad"
      ? "ad"
      : rawType === "block_advertiser" || rawType === "advertiser"
      ? "advertiser"
      : rawType === "dont_show"
      ? "dont_show"
      : "";

  if (!adId || !normalizedType) {
    return errorResponse("Valid adId and reportType (ad, advertiser, dont_show) are required.", 400);
  }

  if (!targetAdvertiser) {
    const [{ data: adRow }, { data: hlRow }] = await Promise.all([
      supabase.from("addsactive").select("user_email").eq("id", adId).maybeSingle(),
      supabase.from("newsactive").select("user_email").eq("id", adId).maybeSingle(),
    ]);
    targetAdvertiser = String(adRow?.user_email || hlRow?.user_email || "").toLowerCase().trim();
  }

  // Only escalate 'ad' and 'advertiser' to admin moderation table; never escalate simple 'dont_show'
  if (normalizedType === "ad" || normalizedType === "advertiser") {
    await supabase.from("ad_reports").insert({
      reporter_email: cleanEmail,
      ad_id: adId,
      advertiser_email: targetAdvertiser,
      report_type: normalizedType,
      reason,
      status: "pending",
    });
  }

  if (normalizedType === "ad" || normalizedType === "dont_show") {
    await supabase.from("blocked_ads").upsert(
      { reporter_email: cleanEmail, ad_id: adId },
      { onConflict: "reporter_email,ad_id" },
    );
  } else if (normalizedType === "advertiser" && targetAdvertiser) {
    await supabase.from("blocked_advertisers").upsert(
      { reporter_email: cleanEmail, advertiser_email: targetAdvertiser },
      { onConflict: "reporter_email,advertiser_email" },
    );
  }

  return jsonResponse({ success: true, message: "Report submitted successfully." });
}
