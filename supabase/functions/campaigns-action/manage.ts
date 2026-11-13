import { errorResponse, isAdminEmail, jsonResponse, sanitizeCsvArray } from "../_shared/cors.ts";
import { deductWalletAtomic, refundWalletAtomic } from "../_shared/paymentActivation.ts";
import { initializePayment } from "../_shared/payoutProvider.ts";
import { validateSafeMediaUrl, validateSafeUrl } from "../_shared/urlValidation.ts";
import { verifyTransactionPinEdge } from "../_shared/walletPin.ts";
import { buildEdgeCampaignAnalyticsPayload, computeAdSpendMetricsEdge } from "./analytics.ts";

const MIN_CPI = 5;
const MAX_HIGHLIGHT_DAYS = 90;
const HIGHLIGHT_DAILY_RATE = 500;

async function ensureActiveAdvertiser(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const [{ data: tomb }, { data: user }] = await Promise.all([
    supabase.from("deactivated_users").select("email").eq("email", cleanEmail).maybeSingle(),
    supabase
      .from("users")
      .select("ad_account_status, suspended_until")
      .ilike("email", cleanEmail)
      .maybeSingle(),
  ]);
  if (tomb || user?.ad_account_status === "deactivated") {
    return { ok: false, status: 403, error: "This account is deactivated." };
  }
  if (user?.ad_account_status === "banned") {
    return { ok: false, status: 403, error: "Your ad account is permanently restricted." };
  }
  if (user?.suspended_until && new Date(user.suspended_until).getTime() > Date.now()) {
    return { ok: false, status: 403, error: "Your account is temporarily suspended." };
  }
  return { ok: true };
}

export async function handleSubmitAd(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const advCheck = await ensureActiveAdvertiser(supabase, cleanEmail);
  if (!advCheck.ok) return errorResponse(advCheck.error!, advCheck.status);

  const adContentRaw = String(body?.ad_content ?? body?.adContent ?? body?.description ?? "").trim();
  const titleRaw = String(body?.title || "").trim();
  const adContent = adContentRaw || titleRaw;
  const adType = String(body?.ad_type ?? body?.adType ?? body?.category ?? "business").trim();
  const editingId = String(body?.editingId || body?.editing_id || "").trim() || null;

  if (!adContent) {
    return errorResponse("Campaign content is required.", 400);
  }

  const mediaCheck = validateSafeMediaUrl(body?.ad_media ?? body?.adMedia ?? body?.media_url ?? body?.mediaUrl);
  if (!mediaCheck.valid) {
    return errorResponse(mediaCheck.error || "Invalid media URL.", 400);
  }
  const ctaCheck = validateSafeUrl(
    body?.action_website ?? body?.actionWebsite ?? body?.cta_link ?? body?.ctaLink,
    { allowRelativePath: false },
  );
  if (!ctaCheck.valid) {
    return errorResponse(ctaCheck.error || "Invalid CTA link URL.", 400);
  }
  const prodCtaCheck = validateSafeUrl(body?.product_cta_link ?? body?.productCtaLink, {
    allowRelativePath: false,
  });
  if (!prodCtaCheck.valid) {
    return errorResponse(prodCtaCheck.error || "Invalid product CTA URL.", 400);
  }

  // Strictly enforce editingId ownership BEFORE insert/update
  if (editingId) {
    const [{ data: activeRow }, { data: draftRow }] = await Promise.all([
      supabase.from("addsactive").select("id, user_email").eq("id", editingId).maybeSingle(),
      supabase.from("adds").select("id, user_email").eq("id", editingId).maybeSingle(),
    ]);
    const ownerRow = activeRow || draftRow;
    if (!ownerRow) {
      return errorResponse("Referenced campaign for editing was not found.", 404);
    }
    if (String(ownerRow.user_email || "").toLowerCase().trim() !== cleanEmail) {
      return errorResponse("You do not own the campaign specified by editingId.", 403);
    }
  }

  // Enforce 2 approved unpaid drafts limit
  const { count: unpaidApprovedCount } = await supabase
    .from("adds")
    .select("id", { count: "exact", head: true })
    .ilike("user_email", cleanEmail)
    .like("admin_statement", "APPROVED:%");

  if ((unpaidApprovedCount || 0) >= 2 && !editingId) {
    return errorResponse(
      "You already have 2 approved unpaid campaigns. Please publish or cancel one before submitting another.",
      400,
    );
  }

  const isAdmin = isAdminEmail(cleanEmail);
  const impressions = Math.max(100, Math.floor(Number(body?.impressions || 1000)));
  const requestedCpi = Number(body?.bid_price ?? body?.cost_per_impression ?? (isAdmin ? 0 : MIN_CPI));
  const cpi = isAdmin
    ? 0
    : Math.max(MIN_CPI, Math.round(requestedCpi * 100) / 100);
  const totalCost = isAdmin ? 0 : Math.round(impressions * cpi * 100) / 100;
  const isBidded = !isAdmin && Boolean(body?.is_bidded || cpi > MIN_CPI);

  const payload = {
    user_email: cleanEmail,
    ad_type: adType,
    ad_content: adContent.slice(0, 2000),
    ad_media_type: String(body?.ad_media_type ?? body?.adMediaType ?? "image"),
    ad_media: mediaCheck.sanitized,
    ad_action_buttons: body?.ad_action_buttons ?? body?.adActionButtons ?? null,
    action_phone: body?.action_phone ?? body?.actionPhone ?? null,
    action_whatsapp: body?.action_whatsapp ?? body?.actionWhatsapp ?? null,
    action_website: ctaCheck.sanitized,
    action_email: body?.action_email ?? body?.actionEmail ?? null,
    product_cta_type: body?.product_cta_type ?? body?.productCtaType ?? null,
    product_cta_link: prodCtaCheck.sanitized,
    gender: String(body?.gender || "all"),
    age_range: String(body?.age_range ?? body?.ageRange ?? body?.age ?? "all"),
    country: String(body?.country || "all"),
    state: String(body?.state || "all"),
    province: String(body?.province ?? body?.location ?? "all"),
    interest: sanitizeCsvArray(body?.interest),
    industry: sanitizeCsvArray(body?.industry),
    behavior: sanitizeCsvArray(body?.behavior),
    lifestyle: sanitizeCsvArray(body?.lifestyle),
    personality: sanitizeCsvArray(body?.personality),
    employment_status: String(body?.employment_status ?? body?.employmentStatus ?? body?.employment ?? "all"),
    user_frequency_cap: Math.max(
      1,
      Math.min(10, Math.floor(Number(body?.user_frequency_cap ?? body?.userFrequencyCap ?? body?.frequency_cap ?? 1))),
    ),
    impressions,
    cost_per_impression: cpi,
    bid_price: cpi,
    is_bidded: isBidded,
    total_cost: totalCost,
    is_admin_post: isAdmin,
    editing_id: editingId,
    status: "pending_review",
  };

  const { data: inserted, error } = await supabase
    .from("adds")
    .insert([payload])
    .select("*")
    .single();

  if (error) {
    return errorResponse(error.message || "Failed to submit campaign.", 400);
  }

  return jsonResponse({ success: true, ad: inserted });
}

export async function handleSubmitHighlight(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const advCheck = await ensureActiveAdvertiser(supabase, cleanEmail);
  if (!advCheck.ok) return errorResponse(advCheck.error!, advCheck.status);

  const title = String(body?.title || "").trim();
  const content = String(body?.content || body?.description || "").trim();
  const editingId = String(body?.editingId || body?.editing_id || "").trim() || null;

  if (!title || !content) {
    return errorResponse("Highlight title and content are required.", 400);
  }

  const mediaCheck = validateSafeMediaUrl(body?.media_url ?? body?.mediaUrl);
  if (!mediaCheck.valid) return errorResponse(mediaCheck.error || "Invalid media URL.", 400);
  const linkCheck = validateSafeUrl(body?.link ?? body?.cta_link, { allowRelativePath: false });
  if (!linkCheck.valid) return errorResponse(linkCheck.error || "Invalid link URL.", 400);

  if (editingId) {
    const [{ data: activeHl }, { data: draftHl }] = await Promise.all([
      supabase.from("newsactive").select("id, user_email").eq("id", editingId).maybeSingle(),
      supabase.from("news").select("id, user_email").eq("id", editingId).maybeSingle(),
    ]);
    const ownerRow = activeHl || draftHl;
    if (!ownerRow) {
      return errorResponse("Referenced highlight for editing was not found.", 404);
    }
    if (String(ownerRow.user_email || "").toLowerCase().trim() !== cleanEmail) {
      return errorResponse("You do not own the highlight specified by editingId.", 403);
    }
  }

  const isAdmin = isAdminEmail(cleanEmail);
  const campaignDays = Math.max(
    1,
    Math.min(MAX_HIGHLIGHT_DAYS, Math.floor(Number(body?.campaign_days || body?.days || 1))),
  );
  const dailyRate = isAdmin
    ? 0
    : Math.max(HIGHLIGHT_DAILY_RATE, Number(body?.bid_price || HIGHLIGHT_DAILY_RATE));
  const bidBonus = isAdmin ? 0 : Math.max(0, Number(body?.bid_bonus || 0));
  const totalCost = isAdmin ? 0 : Math.round((campaignDays * dailyRate + bidBonus) * 100) / 100;

  const { data: inserted, error } = await supabase
    .from("news")
    .insert([
      {
        user_email: cleanEmail,
        title: title.slice(0, 160),
        content: content.slice(0, 4000),
        media_url: mediaCheck.sanitized,
        link: linkCheck.sanitized,
        category: String(body?.category || "general"),
        campaign_days: campaignDays,
        bid_price: dailyRate + bidBonus,
        is_bidded: !isAdmin && (bidBonus > 0 || dailyRate > HIGHLIGHT_DAILY_RATE),
        total_cost: totalCost,
        is_admin_post: isAdmin,
        editing_id: editingId,
        status: "pending_review",
      },
    ])
    .select("*")
    .single();

  if (error) {
    return errorResponse(error.message || "Failed to submit highlight.", 400);
  }

  return jsonResponse({ success: true, highlight: inserted });
}

export async function handleBoostCampaignOrHighlight(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  action: "boost_ad" | "boost_highlight",
  body: Record<string, unknown>,
): Promise<Response> {
  const targetId = String(body?.adId || body?.ad_id || body?.highlightId || body?.highlight_id || "").trim();
  if (!targetId) {
    return errorResponse("Campaign or highlight ID is required.", 400);
  }

  const tableCandidates =
    action === "boost_ad" ? ["addsactive", "adds", "completed_ads"] : ["newsactive", "news"];
  // deno-lint-ignore no-explicit-any
  let item: any = null;
  let table = tableCandidates[0];
  for (const candidate of tableCandidates) {
    const { data: found, error: findErr } = await supabase
      .from(candidate)
      .select("*")
      .eq("id", targetId)
      .maybeSingle();
    if (!findErr && found) {
      item = found;
      table = candidate;
      break;
    }
  }

  if (!item) {
    return errorResponse("Campaign not found.", 404);
  }
  if (String(item.user_email || "").toLowerCase().trim() !== cleanEmail) {
    return errorResponse("You do not own this campaign.", 403);
  }

  // Check moderation blocks on ad_reports or admin_statement BEFORE boosting
  const stmt = String(item.admin_statement || "").toUpperCase();
  if (stmt.startsWith("REJECTED:") || stmt.startsWith("BLOCKED:")) {
    return errorResponse("Moderated or blocked campaigns cannot be boosted.", 403);
  }
  const { count: escalatedReports } = await supabase
    .from("ad_reports")
    .select("id", { count: "exact", head: true })
    .eq("ad_id", targetId)
    .in("status", ["suspended", "rejected", "removed", "banned"]);
  if ((escalatedReports || 0) > 0) {
    return errorResponse("This campaign has active moderation holds and cannot be boosted.", 403);
  }

  const isAdmin = isAdminEmail(cleanEmail);
  let totalCost = 0;
  let effectiveCostPerUnit = MIN_CPI;
  let addImpNum = 0;
  let addDays = 0;
  let updateFields: Record<string, unknown> = {};

  if (action === "boost_ad") {
    addImpNum = Math.max(
      0,
      Math.floor(Number(body?.additionalImpressions ?? body?.addImpressions ?? body?.add_impressions ?? 0)),
    );
    addDays = Math.max(0, Math.floor(Number(body?.additionalDays ?? body?.addDays ?? body?.add_days ?? 0)));
    const currentImp = Math.max(0, Number(item.impressions || 0));
    const deliveredImp = Math.max(0, Number(item.impression_count || 0));
    const remainingImp = Math.max(0, currentImp - deliveredImp);

    const currentCpi = Math.max(15, Number(item.cost_per_impression || item.bid_price || 25));
    const requestedNewCpi = Number(
      body?.newCostPerImpression ?? body?.newBidPrice ?? body?.new_cpi ?? body?.bidPrice ?? currentCpi,
    );
    if (!isAdmin && requestedNewCpi < currentCpi) {
      return errorResponse("Cannot decrease cost per impression during boost.", 400);
    }

    const effectiveCpi = isAdmin ? 0 : Math.round(Math.max(requestedNewCpi, currentCpi) * 100) / 100;
    effectiveCostPerUnit = effectiveCpi;
    const upgradeCost = effectiveCpi > currentCpi ? (effectiveCpi - currentCpi) * remainingImp : 0;
    totalCost = isAdmin
      ? 0
      : Math.round(
          (addImpNum > 0 ? addImpNum * effectiveCpi + (effectiveCpi > currentCpi ? upgradeCost : 0) : upgradeCost) *
            100,
        ) / 100;

    updateFields = {
      impressions: currentImp + addImpNum,
      ...(addDays > 0 ? { campaign_days: Number(item.campaign_days || 1) + addDays } : {}),
      cost_per_impression: effectiveCpi,
      bid_price: isAdmin ? 0 : Math.max(Number(item.bid_price || 0), effectiveCpi),
      is_bidded: !isAdmin && Boolean(item.is_bidded || effectiveCpi > currentCpi),
      total_cost: isAdmin ? 0 : Number(item.total_cost || 0) + totalCost,
      is_admin_post: isAdmin || Boolean(item.is_admin_post),
      completed_at: null,
      is_paused: false,
    };
  } else {
    addDays = Math.max(0, Math.floor(Number(body?.additionalDays ?? body?.addDays ?? body?.add_days ?? 0)));
    const currentDaily =
      item.is_bidded && Number(item.bid_price || 0) >= HIGHLIGHT_DAILY_RATE
        ? Number(item.bid_price)
        : 1000;
    const requestedDaily = Number(body?.newBidPrice ?? body?.newCostPerImpression ?? currentDaily);
    const effectiveDaily = requestedDaily > currentDaily ? requestedDaily : currentDaily;
    effectiveCostPerUnit = effectiveDaily;
    const explicitIncrease = Number(body?.bidIncrease ?? body?.amount ?? 0);
    const rateUpgradeCost =
      effectiveDaily > currentDaily
        ? (effectiveDaily - currentDaily) * Math.max(1, Number(item.campaign_days || 1))
        : explicitIncrease > 0
        ? explicitIncrease
        : 0;
    totalCost = isAdmin ? 0 : Math.round((addDays * effectiveDaily + rateUpgradeCost) * 100) / 100;

    const currentDays = Math.max(1, Number(item.campaign_days || 1));
    if (currentDays + addDays > MAX_HIGHLIGHT_DAYS) {
      return errorResponse(`Highlights cannot exceed ${MAX_HIGHLIGHT_DAYS} total campaign days.`, 400);
    }
    const baseExpiry = item.expires_at ? new Date(item.expires_at).getTime() : Date.now();
    updateFields = {
      campaign_days: currentDays + addDays,
      expires_at: addDays > 0 ? new Date(baseExpiry + addDays * 86400 * 1000).toISOString() : item.expires_at,
      bid_price: isAdmin ? 0 : Math.max(effectiveDaily, currentDaily),
      is_bidded: !isAdmin && (Boolean(item.is_bidded) || effectiveDaily > 1000),
      total_cost: isAdmin ? 0 : Number(item.total_cost || 0) + totalCost,
      is_admin_post: isAdmin || Boolean(item.is_admin_post),
      is_paused: false,
    };
  }

  if (!isAdmin && (!Number.isFinite(totalCost) || totalCost <= 0)) {
    return errorResponse("Boost cost must be greater than zero.", 400);
  }

  const paymentMethod = String(body?.paymentMethod || "wallet").toLowerCase();
  if (!isAdmin && paymentMethod !== "wallet") {
    const boostRef = `BOOST-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const baseCallback = String(body?.callbackUrl || "xea-auth://payment-callback").trim();
    const sep = baseCallback.includes("?") ? "&" : "?";
    const fullCallback = `${baseCallback}${sep}boost_ref=${encodeURIComponent(boostRef)}${
      action === "boost_highlight" ? "&type=boost_highlight&tab=highlights" : "&type=boost_campaign"
    }`;
    const boostMeta: Record<string, unknown> = {
      user_email: cleanEmail,
      ad_id: targetId,
      type: action === "boost_ad" ? "boost_campaign" : "boost_highlight",
      is_highlight: action === "boost_highlight",
      additional_impressions: addImpNum,
      additional_days: addDays,
      cost_per_impression: effectiveCostPerUnit,
      boost_reference: boostRef,
      payment_method: "card",
    };

    const initRes = await initializePayment({
      email: cleanEmail,
      amount: totalCost,
      reference: boostRef,
      callbackUrl: fullCallback,
      metadata: boostMeta,
      customerName: cleanEmail.split("@")[0] || "Paayh Advertiser",
    });

    if (!initRes.success || !initRes.authorization_url) {
      return errorResponse(initRes.error || "Failed to initialize payment gateway.", 502);
    }

    await supabase.from("payments").insert([
      {
        user_email: cleanEmail,
        reference: boostRef,
        amount: totalCost,
        status: "pending",
        type: action === "boost_ad" ? "boost_campaign" : "boost_highlight",
        description: `Card payment boost top-up (${action})`,
        metadata: {
          ...boostMeta,
          provider: initRes.provider,
          kora_reference: initRes.reference !== boostRef ? initRes.reference : undefined,
          gateway_reference: initRes.reference !== boostRef ? initRes.reference : undefined,
        },
      },
    ]);

    return jsonResponse({
      success: true,
      paymentMethod: "card",
      paymentUrl: initRes.authorization_url,
      authorization_url: initRes.authorization_url,
      reference: initRes.reference || boostRef,
      boostReference: boostRef,
      totalCost,
      type: action === "boost_ad" ? "boost_campaign" : "boost_highlight",
    });
  }

  // Wallet payment requires Wallet PIN verification + atomic deduction + rollback on failure
  const pin = body?.pin ?? body?.walletPin ?? body?.transactionPin;
  const pinCheck = await verifyTransactionPinEdge(supabase, cleanEmail, pin);
  if (!pinCheck.valid) {
    return errorResponse(pinCheck.error || "Invalid Wallet PIN.", pinCheck.statusCode, {
      attemptsLeft: pinCheck.attemptsLeft,
      retryAfter: pinCheck.retryAfter,
    });
  }

  const boostRef = `boost_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const effectiveCost = isAdmin && totalCost === 0 ? 0 : totalCost;
  let newBalance: number | undefined = undefined;
  if (effectiveCost > 0) {
    const deduction = await deductWalletAtomic(supabase, cleanEmail, effectiveCost, action, boostRef);
    if (!deduction.success) {
      return errorResponse(deduction.error || "Insufficient wallet balance.", 400);
    }
    newBalance = deduction.newBalance;
  }

  const applyError = await (async () => {
    if (table === "completed_ads") {
      const reactivated = { ...item, ...updateFields, created_at: new Date().toISOString() };
      const { error: upErr } = await supabase.from("addsactive").upsert([reactivated]);
      if (upErr) return upErr;
      await Promise.all([
        supabase.from("adds").update(updateFields).eq("id", targetId),
        supabase.from("completed_ads").delete().eq("id", targetId),
      ]);
      return null;
    }
    const { error: updErr } = await supabase.from(table).update(updateFields).eq("id", targetId);
    if (!updErr && action === "boost_ad") {
      const peer = table === "addsactive" ? "adds" : "addsactive";
      await supabase.from(peer).update(updateFields).eq("id", targetId);
    } else if (!updErr && action === "boost_highlight") {
      const peer = table === "newsactive" ? "news" : "newsactive";
      await supabase.from(peer).update(updateFields).eq("id", targetId);
    }
    return updErr;
  })();

  if (applyError) {
    if (effectiveCost > 0) {
      await refundWalletAtomic(supabase, cleanEmail, effectiveCost, `${action}_rollback`, `refund_${boostRef}`);
    }
    return errorResponse(
      effectiveCost > 0
        ? "Failed to update campaign during boost; wallet refunded."
        : "Failed to update campaign during boost.",
      500,
    );
  }

  await supabase.from("payments").insert([
    {
      user_email: cleanEmail,
      reference: boostRef,
      amount: effectiveCost,
      status: "success",
      type: action === "boost_ad" ? "boost_campaign" : "boost_highlight",
      description: effectiveCost === 0 && isAdmin ? `Admin free boost (${action})` : `Wallet boost (${action})`,
      metadata: {
        ad_id: action === "boost_ad" ? targetId : undefined,
        highlight_id: action === "boost_highlight" ? targetId : undefined,
        amount: effectiveCost,
        is_admin_post: isAdmin || undefined,
      },
    },
  ]);

  return jsonResponse({
    success: true,
    paymentMethod: "wallet",
    reference: boostRef,
    totalCost: effectiveCost,
    boostedAmount: effectiveCost,
    boostedAt: new Date().toISOString(),
    newBalance,
    message: "Boost applied successfully!",
  });
}

export async function handleListCampaigns(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
): Promise<Response> {
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const todayUtc = new Date().toISOString().slice(0, 10);

  const [
    adsQueueRes,
    adsActiveRes,
    adsCompletedRes,
    addsCompletedRes,
    highlightsQueueRes,
    highlightsActiveRes,
    ratingsRes,
    advBlockRes,
    boostPaymentsRes,
  ] = await Promise.all([
    supabase.from("adds").select("*").ilike("user_email", cleanEmail).order("created_at", { ascending: false }),
    supabase.from("addsactive").select("*").ilike("user_email", cleanEmail).order("created_at", { ascending: false }),
    supabase
      .from("completed_ads")
      .select("*")
      .ilike("user_email", cleanEmail)
      .gte("completed_at", seventyTwoHoursAgo)
      .order("completed_at", { ascending: false })
      .limit(100),
    supabase
      .from("addscompleted")
      .select("*")
      .ilike("user_email", cleanEmail)
      .gte("completed_at", seventyTwoHoursAgo)
      .order("completed_at", { ascending: false })
      .limit(100),
    supabase.from("news").select("*").ilike("user_email", cleanEmail).order("created_at", { ascending: false }),
    supabase.from("newsactive").select("*").ilike("user_email", cleanEmail).order("created_at", { ascending: false }),
    supabase.from("completed_ads_ratings").select("ad_id").ilike("advertiser_email", cleanEmail),
    supabase
      .from("blocked_advertisers")
      .select("id", { count: "exact", head: true })
      .ilike("advertiser_email", cleanEmail),
    supabase
      .from("payments")
      .select("amount, created_at, type, metadata")
      .ilike("user_email", cleanEmail)
      .eq("status", "success")
      .in("type", ["boost_campaign", "boost_highlight", "boost"])
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const boostTotals = new Map<string, { boosted_amount: number; boosted_at: string }>();
  for (const p of boostPaymentsRes.data || []) {
    const meta = (typeof p.metadata === "object" && p.metadata ? p.metadata : {}) as Record<string, unknown>;
    const targetId = String(meta.ad_id || meta.adId || meta.highlight_id || meta.highlightId || "");
    if (!targetId) continue;
    const prev = boostTotals.get(targetId);
    boostTotals.set(targetId, {
      boosted_amount: Math.round(((prev?.boosted_amount || 0) + Number(p.amount || 0)) * 100) / 100,
      boosted_at: prev?.boosted_at || String(p.created_at),
    });
  }

  // Deduplicate active & completed campaigns by id accurately
  const seenAdIds = new Set<string>();
  const combinedAds: Record<string, unknown>[] = [];
  for (const ad of [
    ...(adsActiveRes.data || []),
    ...(adsCompletedRes.data || []),
    ...(addsCompletedRes.data || []),
  ]) {
    const id = String(ad?.id || ad?.ad_id || "");
    if (!id || seenAdIds.has(id)) continue;
    seenAdIds.add(id);
    combinedAds.push(ad);
  }

  const adIds: string[] = Array.from(
    new Set([
      ...(adsQueueRes.data || []).map((a: Record<string, unknown>) => String(a?.id || "")),
      ...combinedAds.map((a) => String(a?.id || "")),
    ].filter(Boolean)),
  );

  const reportsMap: Record<string, number> = {};
  const dismissalsMap: Record<string, number> = {};
  const advertiserBlockCount = Number(advBlockRes?.count || 0);

  if (adIds.length > 0) {
    const [reportsRes, blockedAdsRes] = await Promise.all([
      supabase.from("ad_reports").select("ad_id").in("ad_id", adIds).limit(5000),
      supabase.from("blocked_ads").select("ad_id").in("ad_id", adIds).limit(5000),
    ]);
    for (const r of reportsRes?.data || []) {
      if (r?.ad_id) reportsMap[String(r.ad_id)] = (reportsMap[String(r.ad_id)] || 0) + 1;
    }
    for (const b of blockedAdsRes?.data || []) {
      if (b?.ad_id) dismissalsMap[String(b.ad_id)] = (dismissalsMap[String(b.ad_id)] || 0) + 1;
    }
  }

  const attachStats = (list: Record<string, unknown>[]) =>
    list.map((item) => {
      const id = String(item.id || "");
      const boost = boostTotals.get(id);
      const targetImps = Math.max(0, Number(item.impressions || 0));
      const deliveredImps = Math.max(0, Number(item.impression_count || 0));
      const progressPct = targetImps > 0 ? Math.min(100, Math.round((deliveredImps / targetImps) * 100)) : 0;
      const staleReset =
        item.last_reset_date &&
        String(item.last_reset_date).slice(0, 10) < todayUtc &&
        Number(item.daily_impression_count || 0) > 0;
      const normalized = {
        ...item,
        ...(staleReset ? { daily_impression_count: 0 } : {}),
        impression_count: deliveredImps,
        remaining_impressions: Math.max(0, targetImps - deliveredImps),
        progress_percent: progressPct,
        ...(boost ? { is_boosted: true, ...boost } : {}),
      };
      const { total_spend, effective_cpc, total_clicks } = computeAdSpendMetricsEdge(normalized);
      return {
        ...normalized,
        total_spend,
        effective_cpc,
        total_clicks,
      };
    });

  const sanitizedAdsQueue = attachStats(adsQueueRes.data || []);
  const sanitizedAdsActive = attachStats(combinedAds);
  const { analyticsSeries, analyticsSummary, adAnalyticsMap } = await buildEdgeCampaignAnalyticsPayload({
    supabase,
    adIds,
    adsQueue: sanitizedAdsQueue,
    adsActive: sanitizedAdsActive,
  });

  return jsonResponse({
    adsQueue: sanitizedAdsQueue,
    adsActive: sanitizedAdsActive,
    highlightsQueue: attachStats(highlightsQueueRes.data || []),
    highlightsActive: attachStats(highlightsActiveRes.data || []),
    ratedAdIds: (ratingsRes.data || []).map((r: { ad_id: string }) => r.ad_id),
    reportsMap,
    dismissalsMap,
    advertiserBlockCount,
    analyticsSeries,
    analyticsSummary,
    adAnalyticsMap,
  });
}
