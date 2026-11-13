import { computeAtwTierDetails } from "./atwEngine.ts";
import { isAdminEmail } from "./cors.ts";

export interface ResourceValidationResult {
  valid: boolean;
  statusCode: number;
  error?: string;
  serverCost: number;
  draftRow?: Record<string, unknown>;
}

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

function isApprovedStatement(stmt: unknown, status: unknown): boolean {
  const s = String(stmt || "").trim();
  const st = String(status || "").toLowerCase().trim();
  return s.startsWith("APPROVED:") || st === "approved_pending_publish";
}

function isDraftExpired(row: Record<string, unknown>): boolean {
  const refDate = row.approved_at || row.created_at;
  if (!refDate) return false;
  const ts = new Date(String(refDate)).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts > SEVENTY_TWO_HOURS_MS;
}

/**
 * Validates resource ownership, existence, approval, 72h expiry, editingId ownership,
 * and server-computed cost BEFORE any wallet deduction or gateway checkout occurs.
 */
export async function validatePayableResource(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  params: {
    payType: string;
    userEmail: string;
    metadata?: Record<string, unknown>;
    requestedAmount?: number;
  },
): Promise<ResourceValidationResult> {
  const cleanEmail = params.userEmail.toLowerCase().trim();
  const isAdmin = isAdminEmail(cleanEmail);
  const payType = params.payType.toLowerCase().trim();
  const meta = params.metadata || {};

  if (payType === "wallet_fund") {
    const amt = Number(params.requestedAmount || meta.amount || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      return {
        valid: false,
        statusCode: 400,
        error: "Deposit amount must be greater than zero.",
        serverCost: 0,
      };
    }
    return { valid: true, statusCode: 200, serverCost: Math.round(amt * 100) / 100 };
  }

  if (payType === "publish_ad") {
    const adId = String(meta.ad_id || meta.adId || "").trim();
    if (!adId) {
      return {
        valid: false,
        statusCode: 400,
        error: "Campaign ad_id is required to publish.",
        serverCost: 0,
      };
    }

    const { data: ad, error } = await supabaseAdmin
      .from("adds")
      .select("*")
      .eq("id", adId)
      .maybeSingle();

    if (error || !ad) {
      return {
        valid: false,
        statusCode: 404,
        error: "Approved campaign draft not found.",
        serverCost: 0,
      };
    }

    if (String(ad.user_email || "").toLowerCase().trim() !== cleanEmail) {
      return {
        valid: false,
        statusCode: 403,
        error: "You do not have permission to publish this campaign.",
        serverCost: 0,
      };
    }

    if (!isApprovedStatement(ad.admin_statement, ad.status)) {
      return {
        valid: false,
        statusCode: 403,
        error: "This campaign has not been approved by moderation yet.",
        serverCost: 0,
      };
    }

    if (isDraftExpired(ad)) {
      return {
        valid: false,
        statusCode: 410,
        error: "Campaign approval expired after 72 hours. Please submit a new review.",
        serverCost: 0,
      };
    }

    // Verify editingId ownership if this draft updates an existing active ad
    const editingId = String(ad.editing_id || meta.editingId || "").trim();
    if (editingId) {
      const { data: activeRow } = await supabaseAdmin
        .from("addsactive")
        .select("id, user_email")
        .eq("id", editingId)
        .maybeSingle();
      if (!activeRow) {
        return {
          valid: false,
          statusCode: 404,
          error: "Referenced active campaign for edit does not exist.",
          serverCost: 0,
        };
      }
      if (String(activeRow.user_email || "").toLowerCase().trim() !== cleanEmail) {
        return {
          valid: false,
          statusCode: 403,
          error: "You do not own the active campaign referenced by editingId.",
          serverCost: 0,
        };
      }
    }

    const impCount = Math.max(0, Number(ad.impressions || 0));
    const cpi = Number(ad.bid_price || ad.cost_per_impression || 0);
    const computedFromRate = Math.round(impCount * cpi * 100) / 100;
    const storedTotal = Math.round(Number(ad.total_cost || 0) * 100) / 100;
    const serverCost = isAdmin ? 0 : (storedTotal > 0 ? storedTotal : computedFromRate);

    if (!isAdmin && (!Number.isFinite(serverCost) || serverCost <= 0)) {
      return {
        valid: false,
        statusCode: 400,
        error: "Campaign has invalid or zero server-computed cost and cannot be published free.",
        serverCost: 0,
      };
    }

    return { valid: true, statusCode: 200, serverCost, draftRow: ad };
  }

  if (payType === "publish_highlight") {
    const highlightId = String(meta.highlight_id || meta.highlightId || "").trim();
    if (!highlightId) {
      return {
        valid: false,
        statusCode: 400,
        error: "highlight_id is required to publish.",
        serverCost: 0,
      };
    }

    const { data: news, error } = await supabaseAdmin
      .from("news")
      .select("*")
      .eq("id", highlightId)
      .maybeSingle();

    if (error || !news) {
      return {
        valid: false,
        statusCode: 404,
        error: "Approved highlight draft not found.",
        serverCost: 0,
      };
    }

    if (String(news.user_email || "").toLowerCase().trim() !== cleanEmail) {
      return {
        valid: false,
        statusCode: 403,
        error: "You do not have permission to publish this highlight.",
        serverCost: 0,
      };
    }

    if (!isApprovedStatement(news.admin_statement, news.status)) {
      return {
        valid: false,
        statusCode: 403,
        error: "This highlight has not been approved by moderation yet.",
        serverCost: 0,
      };
    }

    if (isDraftExpired(news)) {
      return {
        valid: false,
        statusCode: 410,
        error: "Highlight approval expired after 72 hours. Please submit again.",
        serverCost: 0,
      };
    }

    const editingId = String(news.editing_id || meta.editingId || "").trim();
    if (editingId) {
      const { data: activeHl } = await supabaseAdmin
        .from("newsactive")
        .select("id, user_email")
        .eq("id", editingId)
        .maybeSingle();
      if (!activeHl) {
        return {
          valid: false,
          statusCode: 404,
          error: "Referenced active highlight for edit does not exist.",
          serverCost: 0,
        };
      }
      if (String(activeHl.user_email || "").toLowerCase().trim() !== cleanEmail) {
        return {
          valid: false,
          statusCode: 403,
          error: "You do not own the active highlight referenced by editingId.",
          serverCost: 0,
        };
      }
    }

    const serverCost = isAdmin ? 0 : Math.round(Number(news.total_cost || 0) * 100) / 100;
    if (!isAdmin && (!Number.isFinite(serverCost) || serverCost <= 0)) {
      return {
        valid: false,
        statusCode: 400,
        error: "Highlight has invalid or zero cost.",
        serverCost: 0,
      };
    }

    return { valid: true, statusCode: 200, serverCost, draftRow: news };
  }

  if (payType === "boost_campaign") {
    const adId = String(meta.ad_id || meta.adId || "").trim();
    if (!adId) {
      return { valid: false, statusCode: 400, error: "ad_id is required.", serverCost: 0 };
    }
    const { data: activeAd } = await supabaseAdmin
      .from("addsactive")
      .select("*")
      .eq("id", adId)
      .maybeSingle();
    if (!activeAd) {
      return { valid: false, statusCode: 404, error: "Active campaign not found.", serverCost: 0 };
    }
    if (String(activeAd.user_email || "").toLowerCase().trim() !== cleanEmail) {
      return { valid: false, statusCode: 403, error: "Unauthorized campaign boost.", serverCost: 0 };
    }
    const addImp = Math.max(0, Number(meta.addImpressions || meta.add_impressions || 0));
    const currentImp = Math.max(0, Number(activeAd.impressions || 0));
    const delivered = Math.max(0, Number(activeAd.impression_count || 0));
    const remaining = Math.max(0, currentImp - delivered);
    const currentCpi = Number(activeAd.bid_price || activeAd.cost_per_impression || 0);
    const newCpi = Number(meta.newCostPerImpression || meta.new_cpi || currentCpi);
    if (newCpi < currentCpi) {
      return { valid: false, statusCode: 400, error: "Bid CPI cannot be lowered below current CPI.", serverCost: 0 };
    }
    const upgradeCost = newCpi > currentCpi ? (newCpi - currentCpi) * remaining : 0;
    const serverCost = isAdmin ? 0 : Math.round((addImp * newCpi + upgradeCost) * 100) / 100;
    if (!isAdmin && (!Number.isFinite(serverCost) || serverCost <= 0)) {
      return { valid: false, statusCode: 400, error: "Computed boost cost must be greater than zero.", serverCost: 0 };
    }
    return { valid: true, statusCode: 200, serverCost, draftRow: activeAd };
  }

  if (payType === "boost_highlight") {
    const hlId = String(meta.highlight_id || meta.highlightId || "").trim();
    if (!hlId) {
      return { valid: false, statusCode: 400, error: "highlight_id is required.", serverCost: 0 };
    }
    const { data: activeHl } = await supabaseAdmin
      .from("newsactive")
      .select("*")
      .eq("id", hlId)
      .maybeSingle();
    if (!activeHl) {
      return { valid: false, statusCode: 404, error: "Active highlight not found.", serverCost: 0 };
    }
    if (String(activeHl.user_email || "").toLowerCase().trim() !== cleanEmail) {
      return { valid: false, statusCode: 403, error: "Unauthorized highlight boost.", serverCost: 0 };
    }
    const amt = Number(meta.boost_amount || meta.amount || params.requestedAmount || 0);
    if (!isAdmin && (!Number.isFinite(amt) || amt <= 0)) {
      return { valid: false, statusCode: 400, error: "Boost amount must be greater than zero.", serverCost: 0 };
    }
    return { valid: true, statusCode: 200, serverCost: isAdmin ? 0 : Math.round(amt * 100) / 100, draftRow: activeHl };
  }

  if (payType === "business_subscription") {
    const amt = Number(meta.amount || params.requestedAmount || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { valid: false, statusCode: 400, error: "Invalid subscription amount.", serverCost: 0 };
    }
    return { valid: true, statusCode: 200, serverCost: Math.round(amt * 100) / 100 };
  }

  const fallbackAmt = Number(params.requestedAmount || meta.amount || 0);
  if (!Number.isFinite(fallbackAmt) || fallbackAmt <= 0) {
    return { valid: false, statusCode: 400, error: "Payment amount must be greater than zero.", serverCost: 0 };
  }
  return { valid: true, statusCode: 200, serverCost: Math.round(fallbackAmt * 100) / 100 };
}

/**
 * Executes atomic wallet deduction via `deduct_wallet_atomic` / `spend_wallet_balance_atomic`.
 */
export async function deductWalletAtomic(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  userEmail: string,
  amount: number,
  reason: string,
  reference: string,
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const cleanEmail = userEmail.toLowerCase().trim();
  const payload = {
    p_user_email: cleanEmail,
    p_amount: Math.round(amount * 100) / 100,
    p_reason: reason,
    p_reference: reference,
  };

  let { data, error } = await supabaseAdmin.rpc("deduct_wallet_atomic", payload);
  if (error) {
    const fallback = await supabaseAdmin.rpc("spend_wallet_balance_atomic", payload);
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data?.success) {
    return {
      success: false,
      error: data?.error || error?.message || "Wallet deduction failed.",
    };
  }
  return {
    success: true,
    newBalance: Number(data.new_balance ?? 0),
  };
}

/**
 * Executes atomic wallet refund via `refund_wallet_atomic` / `refund_wallet_deduction_atomic`.
 */
export async function refundWalletAtomic(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  userEmail: string,
  amount: number,
  reason: string,
  reference: string,
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const cleanEmail = userEmail.toLowerCase().trim();
  const payload = {
    p_user_email: cleanEmail,
    p_amount: Math.round(amount * 100) / 100,
    p_reason: reason,
    p_reference: reference,
  };

  let { data, error } = await supabaseAdmin.rpc("refund_wallet_atomic", payload);
  if (error) {
    const fallback = await supabaseAdmin.rpc("refund_wallet_deduction_atomic", payload);
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data?.success) {
    return {
      success: false,
      error: data?.error || error?.message || "Wallet refund failed.",
    };
  }
  return {
    success: true,
    newBalance: Number(data.new_balance ?? 0),
  };
}

/**
 * Activates a validated & paid resource (wallet fund, campaign publish, highlight publish, boost, subscription).
 */
export async function activatePaidResource(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  payTypeRaw: string,
  userEmail: string,
  amountPaid: number,
  metadata: Record<string, unknown> = {},
): Promise<{ success: boolean; error?: string; activatedId?: string; message?: string }> {
  const payType = payTypeRaw.toLowerCase().trim();
  const cleanEmail = userEmail.toLowerCase().trim();
  const isAdmin = Boolean(metadata.is_admin_post || isAdminEmail(cleanEmail));

  if (payType === "wallet_fund") {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("balance, monetization_clicks, attention_worth_score, atw_tier, is_affiliate, is_career")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (!user) {
      return { success: false, error: "User account not found." };
    }

    const atw = computeAtwTierDetails({
      email: cleanEmail,
      clicks: user.monetization_clicks,
      attentionWorthScore: user.attention_worth_score,
      currentTier: user.atw_tier,
      isAffiliate: user.is_affiliate,
      isCareer: user.is_career,
    });
    const currentBal = Number(user.balance || 0);
    if (!atw.isUnlimited && currentBal + amountPaid > atw.holdingCap) {
      return {
        success: false,
        error: `Deposit exceeds your ${atw.tier} holding cap of ₦${atw.holdingCap.toLocaleString()}.`,
      };
    }

    const { data: refundRes, error: refErr } = await supabaseAdmin.rpc(
      "refund_wallet_atomic",
      {
        p_user_email: cleanEmail,
        p_amount: amountPaid,
        p_reason: "wallet_fund",
        p_reference: String(metadata.reference || `fund_${Date.now()}`),
      },
    );
    if (refErr || !refundRes?.success) {
      const fb = await supabaseAdmin.rpc("refund_wallet_deduction_atomic", {
        p_user_email: cleanEmail,
        p_amount: amountPaid,
        p_reason: "wallet_fund",
        p_reference: String(metadata.reference || `fund_${Date.now()}`),
      });
      if (fb.error || !fb.data?.success) {
        return { success: false, error: fb.data?.error || "Failed to credit wallet balance." };
      }
    }
    return { success: true, message: "Wallet funded successfully." };
  }

  if (payType === "publish_ad") {
    const adId = String(metadata.ad_id || metadata.adId || "").trim();
    if (!adId) return { success: false, error: "Missing ad_id." };

    const { data: draft } = await supabaseAdmin
      .from("adds")
      .select("*")
      .eq("id", adId)
      .maybeSingle();
    if (!draft) return { success: false, error: "Campaign draft not found." };
    if (String(draft.user_email || "").toLowerCase().trim() !== cleanEmail) {
      return { success: false, error: "Campaign ownership verification failed." };
    }

    const editingId = String(draft.editing_id || metadata.editingId || "").trim();
    if (editingId) {
      const { data: activeRow } = await supabaseAdmin
        .from("addsactive")
        .select("id, user_email")
        .eq("id", editingId)
        .maybeSingle();
      if (!activeRow || String(activeRow.user_email || "").toLowerCase().trim() !== cleanEmail) {
        return { success: false, error: "Cannot edit another user's active campaign." };
      }

      const { error: updErr } = await supabaseAdmin
        .from("addsactive")
        .update({
          ad_type: draft.ad_type,
          ad_content: draft.ad_content,
          ad_media_type: draft.ad_media_type,
          ad_media: draft.ad_media,
          ad_action_buttons: draft.ad_action_buttons,
          action_phone: draft.action_phone,
          action_whatsapp: draft.action_whatsapp,
          action_website: draft.action_website,
          action_email: draft.action_email,
          product_cta_type: draft.product_cta_type,
          product_cta_link: draft.product_cta_link,
          gender: draft.gender,
          age_range: draft.age_range,
          country: draft.country,
          state: draft.state,
          province: draft.province,
          interest: draft.interest,
          industry: draft.industry,
          behavior: draft.behavior,
          lifestyle: draft.lifestyle,
          personality: draft.personality,
          employment_status: draft.employment_status,
          impressions: draft.impressions,
          total_cost: isAdmin || Boolean(draft.is_admin_post) ? 0 : draft.total_cost,
          cost_per_impression: isAdmin || Boolean(draft.is_admin_post) ? 0 : draft.cost_per_impression,
          bid_price: isAdmin || Boolean(draft.is_admin_post) ? 0 : (draft.bid_price || draft.cost_per_impression),
          is_bidded: !(isAdmin || Boolean(draft.is_admin_post)) && Boolean(draft.is_bidded),
          is_admin_post: isAdmin || Boolean(draft.is_admin_post),
          user_frequency_cap: draft.user_frequency_cap ?? draft.frequency_cap ?? 1,
          admin_statement: draft.admin_statement,
        })
        .eq("id", editingId);
      if (updErr) return { success: false, error: updErr.message };
      await supabaseAdmin.from("adds").delete().eq("id", adId);
      return { success: true, activatedId: editingId, message: "Campaign updated and published." };
    }

    const activePayload: Record<string, unknown> = { ...draft };
    delete activePayload.status;
    delete activePayload.editing_id;
    activePayload.impression_count = draft.impression_count || 0;
    activePayload.status = "active";
    if (isAdmin || Boolean(draft.is_admin_post)) {
      activePayload.is_admin_post = true;
      activePayload.cost_per_impression = 0;
      activePayload.total_cost = 0;
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("addsactive")
      .insert([activePayload])
      .select("id")
      .single();

    if (insErr) return { success: false, error: insErr.message };
    await supabaseAdmin.from("adds").delete().eq("id", adId);
    return {
      success: true,
      activatedId: String(inserted?.id || adId),
      message: "Campaign published live!",
    };
  }

  if (payType === "publish_highlight") {
    const hlId = String(metadata.highlight_id || metadata.highlightId || "").trim();
    if (!hlId) return { success: false, error: "Missing highlight_id." };

    const { data: draft } = await supabaseAdmin
      .from("news")
      .select("*")
      .eq("id", hlId)
      .maybeSingle();
    if (!draft) return { success: false, error: "Highlight draft not found." };
    if (String(draft.user_email || "").toLowerCase().trim() !== cleanEmail) {
      return { success: false, error: "Highlight ownership verification failed." };
    }

    const days = Math.max(1, Math.min(90, Number(draft.campaign_days || metadata.campaign_days || 1)));
    const startAt = draft.scheduled_start_at ? new Date(draft.scheduled_start_at) : new Date();
    const expiresAt = draft.expires_at || draft.scheduled_end_at ||
      new Date(startAt.getTime() + days * 86400 * 1000).toISOString();

    const editingId = String(draft.editing_id || metadata.editingId || "").trim();
    if (editingId) {
      const { data: activeRow } = await supabaseAdmin
        .from("newsactive")
        .select("id, user_email")
        .eq("id", editingId)
        .maybeSingle();
      if (!activeRow || String(activeRow.user_email || "").toLowerCase().trim() !== cleanEmail) {
        return { success: false, error: "Cannot edit another user's active highlight." };
      }

      const { error: updErr } = await supabaseAdmin
        .from("newsactive")
        .update({
          title: draft.title,
          content: draft.content,
          media_url: draft.media_url,
          link: draft.link,
          category: draft.category,
          campaign_days: days,
          total_cost: isAdmin || Boolean(draft.is_admin_post) ? 0 : draft.total_cost,
          bid_price: isAdmin || Boolean(draft.is_admin_post) ? 0 : draft.bid_price,
          is_bidded: !(isAdmin || Boolean(draft.is_admin_post)) && Boolean(draft.is_bidded),
          is_admin_post: isAdmin || Boolean(draft.is_admin_post),
          expires_at: expiresAt,
          admin_statement: draft.admin_statement,
        })
        .eq("id", editingId);
      if (updErr) return { success: false, error: updErr.message };
      await supabaseAdmin.from("news").delete().eq("id", hlId);
      return { success: true, activatedId: editingId, message: "Highlight updated live!" };
    }

    const activePayload: Record<string, unknown> = { ...draft };
    delete activePayload.editing_id;
    activePayload.status = "active";
    activePayload.campaign_days = days;
    activePayload.expires_at = expiresAt;
    if (isAdmin || Boolean(draft.is_admin_post)) {
      activePayload.is_admin_post = true;
      activePayload.total_cost = 0;
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("newsactive")
      .insert([activePayload])
      .select("id")
      .single();
    if (insErr) return { success: false, error: insErr.message };
    await supabaseAdmin.from("news").delete().eq("id", hlId);
    return {
      success: true,
      activatedId: String(inserted?.id || hlId),
      message: "Highlight published live!",
    };
  }

  if (payType === "boost_campaign") {
    const adId = String(metadata.ad_id || metadata.adId || "").trim();
    const addImps = Math.max(0, Number(metadata.addImpressions || metadata.add_impressions || 0));
    const { data: ad } = await supabaseAdmin
      .from("addsactive")
      .select("*")
      .eq("id", adId)
      .maybeSingle();
    if (!ad) return { success: false, error: "Active campaign not found." };
    const isAdAdminPost = isAdmin || Boolean(ad.is_admin_post);
    const newCpi = isAdAdminPost
      ? 0
      : Number(metadata.newCostPerImpression || metadata.new_cpi || ad.cost_per_impression || 0);
    const nextImps = Number(ad.impressions || 0) + addImps;
    const nextTotal = isAdAdminPost ? 0 : Number(ad.total_cost || 0) + amountPaid;
    const isBidded = !isAdAdminPost && Boolean(ad.is_bidded || newCpi > Number(ad.cost_per_impression || 0));

    const { error: updErr } = await supabaseAdmin
      .from("addsactive")
      .update({
        impressions: nextImps,
        total_cost: nextTotal,
        cost_per_impression: newCpi,
        bid_price: isAdAdminPost ? 0 : Math.max(Number(ad.bid_price || 0), newCpi),
        is_bidded: isBidded,
        is_admin_post: isAdAdminPost,
      })
      .eq("id", adId);
    if (updErr) return { success: false, error: updErr.message };
    return { success: true, activatedId: adId, message: "Campaign boosted successfully." };
  }

  if (payType === "boost_highlight") {
    const hlId = String(metadata.highlight_id || metadata.highlightId || "").trim();
    const { data: hl } = await supabaseAdmin
      .from("newsactive")
      .select("*")
      .eq("id", hlId)
      .maybeSingle();
    if (!hl) return { success: false, error: "Active highlight not found." };
    const isHlAdminPost = isAdmin || Boolean(hl.is_admin_post);
    const newBid = isHlAdminPost
      ? 0
      : Number(metadata.newBidPrice || Number(hl.bid_price || 0) + amountPaid);
    const addDays = Math.max(0, Number(metadata.addDays || 0));
    const curExpiry = hl.expires_at ? new Date(hl.expires_at).getTime() : Date.now();
    const nextExpiry = addDays > 0
      ? new Date(curExpiry + addDays * 86400 * 1000).toISOString()
      : hl.expires_at;

    const { error: updErr } = await supabaseAdmin
      .from("newsactive")
      .update({
        bid_price: newBid,
        is_bidded: !isHlAdminPost,
        total_cost: isHlAdminPost ? 0 : Number(hl.total_cost || 0) + amountPaid,
        campaign_days: Number(hl.campaign_days || 1) + addDays,
        expires_at: nextExpiry,
        is_admin_post: isHlAdminPost,
      })
      .eq("id", hlId);
    if (updErr) return { success: false, error: updErr.message };
    return { success: true, activatedId: hlId, message: "Highlight boosted successfully." };
  }

  if (payType === "business_subscription") {
    const subId = String(metadata.subscriber_id || "").trim();
    if (subId) {
      const nextExpiry = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
      await supabaseAdmin
        .from("premium_subscribers")
        .update({ status: "active", expires_at: nextExpiry, paid_amount: amountPaid })
        .eq("id", subId);
    }
    return { success: true, message: "Business subscription activated." };
  }

  return { success: true, message: "Payment processed." };
}
