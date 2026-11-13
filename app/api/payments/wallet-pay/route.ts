import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { v4 as uuidv4 } from "uuid";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import redisConnection from "@/lib/redis";
import {
  spendWalletBalanceAtomic,
  refundWalletDeductionAtomic,
} from "@/lib/services/payoutSettlementService";
import {
  verifyTransactionPin,
  resolveStoredWalletPinHash,
} from "@/lib/security/walletPinHelper";

function isApprovalValidWithin72Hours(adminStatement: string | null | undefined): {
  valid: boolean;
  reason?: string;
} {
  if (!adminStatement || !adminStatement.startsWith("APPROVED:")) {
    return { valid: false, reason: "Campaign has not been approved for publishing." };
  }
  const approvedTimestamp = adminStatement.replace("APPROVED:", "").trim();
  const approvedDate = new Date(approvedTimestamp);
  if (!approvedTimestamp || isNaN(approvedDate.getTime())) {
    return { valid: false, reason: "Approval timestamp is invalid." };
  }
  if (approvedDate.getTime() < Date.now() - 72 * 60 * 60 * 1000) {
    return { valid: false, reason: "Approval expired (exceeded 3 days)." };
  }
  return { valid: true };
}

export async function POST(req: NextRequest) {
  let walletLockKey: string | null = null;
  let lockAcquired = false;
  let walletDeducted = false;
  let deductionCompleted = false;
  let emailLowerRef = "";
  let amountNumRef = 0;
  let referenceRef = "";
  let deductionType = "";

  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    emailLowerRef = emailLower;
    const body = await req.json();
    const { type, amount, metadata } = body;
    deductionType = String(type || "");

    // Closed-loop non-refundable policy: Only Ad & Highlight campaigns allowed (no wallet deposits)
    const validTypes = ["ad", "highlight", "publish_ad", "publish_highlight"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid payment type. Only non-refundable payments for ads and highlights are allowed." },
        { status: 400 }
      );
    }

    const { isAdminEmail } = await import("@/lib/authHelper");
    const isAdmin = isAdminEmail(emailLower);
    const amountNum = parseFloat(amount);
    amountNumRef = amountNum;

    if (!isAdmin && (!Number.isFinite(amountNum) || amountNum <= 0)) {
      return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
    }

    // Verify 4-Digit Wallet PIN (fail closed when unset)
    const { data: userPinData } = await supabaseAdmin
      .from("users")
      .select("wallet_pin_hash, passphrase")
      .ilike("email", emailLower)
      .maybeSingle();

    const pinCheck = await verifyTransactionPin({
      email: emailLower,
      pin: body?.pin,
      storedPinHash: resolveStoredWalletPinHash(userPinData),
    });

    if (!pinCheck.valid) {
      return NextResponse.json(
        {
          error: pinCheck.error,
          code: pinCheck.code,
          attemptsRemaining: pinCheck.attemptsRemaining,
          retryAfter: pinCheck.retryAfter,
        },
        { status: pinCheck.statusCode || 401 }
      );
    }

    // 1. Pre-validate payload, ownership, approval, expiry, cost & rate limits BEFORE deducting balance
    let prevalidatedAd: Record<string, any> | null = null;
    let prevalidatedHl: Record<string, any> | null = null;

    if (type === "ad") {
      const adData = metadata?.adData;
      if (!adData) {
        return NextResponse.json({ error: "Ad details missing from metadata" }, { status: 400 });
      }
      const isBidded = !!adData.isBidded;
      const bidPrice = adData.bidPrice ? parseFloat(adData.bidPrice) : null;
      const rate = isBidded && bidPrice ? bidPrice : parseFloat(adData.costPerImpression || 15);
      const impressions = parseInt(adData.impressions || 1000, 10);
      if (!isAdmin && (!Number.isFinite(rate) || !Number.isFinite(impressions) || rate < 10 || impressions < 1000)) {
        return NextResponse.json({ error: "Invalid campaign rate or impressions configuration." }, { status: 400 });
      }
      const expectedCost = rate * impressions;
      if (!isAdmin && Math.abs(amountNum - expectedCost) > 1) {
        return NextResponse.json(
          { error: "Cost validation mismatch. Payment amount does not match campaign configurations." },
          { status: 400 }
        );
      }

      if (adData.id) {
        const [{ data: existingAd }, { data: existingActiveAd }] = await Promise.all([
          supabaseAdmin.from("adds").select("id, user_email").eq("id", adData.id).maybeSingle(),
          supabaseAdmin.from("addsactive").select("id, user_email").eq("id", adData.id).maybeSingle(),
        ]);
        const existingOwner = existingAd?.user_email || existingActiveAd?.user_email;
        if (existingOwner && String(existingOwner).toLowerCase().trim() !== emailLower) {
          return NextResponse.json({ error: "Forbidden: You do not own this campaign." }, { status: 403 });
        }
        if (existingAd || existingActiveAd) {
          const editLimitKey = `ratelimit:edit_ad:${adData.id}`;
          const isEditLimited = await redisConnection.get(editLimitKey).catch(() => null);
          if (isEditLimited) {
            return NextResponse.json({ error: "Limit reached, try again later." }, { status: 429 });
          }
        }
      }
    } else if (type === "highlight") {
      if (!metadata?.title || !metadata?.content) {
        return NextResponse.json({ error: "Highlight title and content are required" }, { status: 400 });
      }
      const days = Math.min(5, Math.max(1, parseInt(metadata?.campaign_days || 1, 10)));
      const isBidded = !!metadata?.is_bidded;
      const bidPrice = metadata?.bid_price ? parseFloat(metadata.bid_price) : 1000;
      const expectedHighlightCost = (isBidded ? Math.max(1000, bidPrice) : 1000) * days;
      if (!isAdmin && Math.abs(amountNum - expectedHighlightCost) > 1) {
        return NextResponse.json(
          { error: "Cost validation mismatch for highlight campaign." },
          { status: 400 }
        );
      }
      if (metadata?.editingId) {
        const [{ data: existingHl }, { data: existingActiveHl }] = await Promise.all([
          supabaseAdmin.from("news").select("id, user_email").eq("id", metadata.editingId).maybeSingle(),
          supabaseAdmin.from("newsactive").select("id, user_email").eq("id", metadata.editingId).maybeSingle(),
        ]);
        const targetHl = existingHl || existingActiveHl;
        if (!targetHl) {
          return NextResponse.json({ error: "Highlight not found for editing." }, { status: 404 });
        }
        if (String(targetHl.user_email || "").toLowerCase().trim() !== emailLower) {
          return NextResponse.json({ error: "Forbidden: You do not own this highlight." }, { status: 403 });
        }
        const editLimitKey = `ratelimit:edit_highlight:${metadata.editingId}`;
        const isEditLimited = await redisConnection.get(editLimitKey).catch(() => null);
        if (isEditLimited) {
          return NextResponse.json({ error: "Limit reached, try again later." }, { status: 429 });
        }
      }
    } else if (type === "publish_ad") {
      const adId = metadata?.adId || body.adId;
      if (!adId) {
        return NextResponse.json({ error: "Missing adId parameter" }, { status: 400 });
      }
      const { data: adCheck, error: adCheckErr } = await supabaseAdmin
        .from("adds")
        .select("*")
        .eq("id", adId)
        .ilike("user_email", emailLower)
        .maybeSingle();

      if (adCheckErr || !adCheck) {
        return NextResponse.json({ error: "Campaign not found in review queue" }, { status: 404 });
      }
      const approvalCheck = isApprovalValidWithin72Hours(adCheck.admin_statement);
      if (!approvalCheck.valid) {
        return NextResponse.json({ error: approvalCheck.reason }, { status: 400 });
      }
      const expectedAdCost = Number(adCheck.total_cost || 0);
      if (!isAdmin && (expectedAdCost <= 0 || Math.abs(amountNum - expectedAdCost) > 1)) {
        return NextResponse.json(
          { error: "Cost validation mismatch. Payment amount does not match campaign configuration." },
          { status: 400 }
        );
      }
      prevalidatedAd = adCheck;
    } else if (type === "publish_highlight") {
      const highlightId = metadata?.highlightId || body.highlightId;
      if (!highlightId) {
        return NextResponse.json({ error: "Missing highlightId parameter" }, { status: 400 });
      }
      const { data: hlCheck, error: hlCheckErr } = await supabaseAdmin
        .from("news")
        .select("*")
        .eq("id", highlightId)
        .ilike("user_email", emailLower)
        .maybeSingle();

      if (hlCheckErr || !hlCheck) {
        return NextResponse.json({ error: "Highlight not found in review queue" }, { status: 404 });
      }
      const approvalCheck = isApprovalValidWithin72Hours(hlCheck.admin_statement);
      if (!approvalCheck.valid) {
        return NextResponse.json({ error: approvalCheck.reason }, { status: 400 });
      }
      const days = Math.max(1, Number(hlCheck.campaign_days || 1));
      const rate = hlCheck.is_bidded && hlCheck.bid_price ? Math.max(1000, Number(hlCheck.bid_price)) : 1000;
      const expectedHlCost = days * rate;
      if (!isAdmin && (expectedHlCost <= 0 || Math.abs(amountNum - expectedHlCost) > 1)) {
        return NextResponse.json(
          { error: "Cost validation mismatch for highlight campaign." },
          { status: 400 }
        );
      }
      prevalidatedHl = hlCheck;
    }

    // 2. Acquire per-user wallet mutex to prevent concurrent double-spend
    walletLockKey = `lock:wallet:${emailLower}`;
    const acquired = await redisConnection.set(walletLockKey, "1", "EX", 15, "NX").catch(() => "OK");
    if (!acquired) {
      return NextResponse.json(
        { error: "Another wallet transaction is currently in progress. Please wait a moment." },
        { status: 429 }
      );
    }
    lockAcquired = true;

    // 3. Check advertiser account restrictions
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("balance, ad_account_status, ad_ban_until, ad_ban_reason")
      .ilike("email", emailLower)
      .maybeSingle();

    if (userError || !user) {
      console.error("❌ Error fetching user balance for wallet payment:", userError);
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    if (!isAdmin) {
      const isRestricted =
        user.ad_account_status === "perm_banned" ||
        user.ad_account_status === "deactivated" ||
        (user.ad_account_status === "temp_banned" &&
          user.ad_ban_until &&
          new Date(user.ad_ban_until) > new Date());

      if (isRestricted) {
        const reasonText = user.ad_ban_reason ? ` (${user.ad_ban_reason})` : "";
        const message =
          user.ad_account_status === "temp_banned"
            ? `Your advertising access is temporarily paused${reasonText}. Please check back once the review period ends or reach out via Help Center.`
            : `Your advertising access is currently paused${reasonText}. Please contact our Help Center if you'd like to appeal or learn more.`;

        return NextResponse.json({ error: message, restricted: true }, { status: 403 });
      }
    }

    const reference = `wallet_${uuidv4()}`;
    referenceRef = reference;

    const rollbackWallet = async (reason: string) => {
      if (walletDeducted && !deductionCompleted && amountNum > 0) {
        await refundWalletDeductionAtomic(emailLower, amountNum, reason, reference);
        walletDeducted = false;
      }
      await supabaseAdmin.from("payments").update({ status: "reversed" }).eq("reference", reference);
    };

    // 4. Deduct user balance atomically when amount > 0
    if (amountNum > 0) {
      const spendRes = await spendWalletBalanceAtomic(
        emailLower,
        amountNum,
        `wallet_pay_${type}`,
        reference
      );
      if (!spendRes.success) {
        return NextResponse.json(
          { error: spendRes.error || "Insufficient wallet balance" },
          { status: 400 }
        );
      }
      walletDeducted = true;
    }

    // 5. Create payment record
    const paystackMetadata = {
      type,
      user_email: emailLower,
      non_refundable: true,
      ...(metadata || {}),
    };

    const { error: insertPaymentError } = await supabaseAdmin.from("payments").insert({
      user_email: emailLower,
      reference,
      amount: amountNum,
      status: "success",
      type,
      description: `payment for ${type} using Wallet Balance`,
      metadata: paystackMetadata,
    });

    if (insertPaymentError) {
      console.error("❌ Error logging wallet payment record:", insertPaymentError);
    }

    // 6. Perform business logic (with automatic balance rollback if DB write fails)
    // Handle publish_ad
    if (type === "publish_ad") {
      const adId = metadata?.adId || body.adId;
      const adToPublish = prevalidatedAd;
      if (!adId || !adToPublish) {
        await rollbackWallet("publish_ad_missing");
        return NextResponse.json({ error: "Campaign not found in review queue" }, { status: 404 });
      }

      const recheckApproval = isApprovalValidWithin72Hours(adToPublish.admin_statement);
      if (!recheckApproval.valid) {
        await rollbackWallet("publish_ad_approval_invalid");
        return NextResponse.json({ error: recheckApproval.reason }, { status: 400 });
      }

      // Strip review/approval queue specific fields that don't exist on addsactive
      const {
        status: _status,
        approved_at: _appAt,
        payment_status: _payStatus,
        ...cleanAd
      } = adToPublish;

      const activeAd = {
        ...cleanAd,
        admin_statement: null,
        is_paused: false,
        created_at: new Date().toISOString(),
      };

      const { data: insertedRows, error: insertErr } = await supabaseAdmin
        .from("addsactive")
        .upsert([activeAd])
        .select("*");

      if (insertErr) {
        console.error("❌ Error activating ad in addsactive:", insertErr);
        await rollbackWallet("publish_ad_insert_failed");
        return NextResponse.json({ error: "Failed to publish ad. Balance has been restored." }, { status: 500 });
      }

      await supabaseAdmin.from("adds").delete().eq("id", adId).ilike("user_email", emailLower);
      deductionCompleted = true;

      const publishedAd = insertedRows?.[0] || activeAd;
      const { dispatchFeedDropWebhook, dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
      dispatchFeedDropWebhook(publishedAd).catch(() => {});

      const notifRow = {
        user_email: emailLower,
        title: "Ad Live",
        message: "Payment confirmed! Your ad is now live in the feed.",
      };
      await supabaseAdmin.from("notifications").insert([notifRow]);
      dispatchNotificationWebhook(notifRow).catch(() => {});

      const { invalidateCachedUserCampaigns, invalidateCachedProfile: invProfile } = await import("@/lib/utils/cache");
      await Promise.all([
        invalidateCachedUserCampaigns(emailLower),
        invProfile(emailLower),
        redisConnection.incr(`statement:ver:${emailLower}`).catch(() => {}),
        redisConnection.del(`statement:payments:${emailLower}`, `statement:all:${emailLower}`).catch(() => {}),
      ]);

      return NextResponse.json({
        success: true,
        message: "Campaign published and live in feed!",
        ad: publishedAd,
      });
    }

    if (type === "publish_highlight") {
      const highlightId = metadata?.highlightId || body.highlightId;
      const hlToPublish = prevalidatedHl;
      if (!highlightId || !hlToPublish) {
        await rollbackWallet("publish_highlight_missing");
        return NextResponse.json({ error: "Highlight not found in review queue" }, { status: 404 });
      }

      const recheckHlApproval = isApprovalValidWithin72Hours(hlToPublish.admin_statement);
      if (!recheckHlApproval.valid) {
        await rollbackWallet("publish_highlight_approval_invalid");
        return NextResponse.json({ error: recheckHlApproval.reason }, { status: 400 });
      }

      // Strip review/approval queue specific fields that don't exist on newsactive
      const {
        status: _status,
        approved_at: _appAt,
        payment_status: _payStatus,
        is_admin_post: _adminPost,
        custom_sponsor_name: _csName,
        custom_sponsor_handle: _csHandle,
        custom_sponsor_logo: _csLogo,
        ...cleanHl
      } = hlToPublish;

      const activeHl = {
        ...cleanHl,
        admin_statement: null,
        is_paused: false,
        created_at: new Date().toISOString(),
      };

      const { data: insertedHlRows, error: insertErr } = await supabaseAdmin
        .from("newsactive")
        .upsert([activeHl])
        .select("*");

      if (insertErr) {
        console.error("❌ Error activating highlight in newsactive:", insertErr);
        await rollbackWallet("publish_highlight_insert_failed");
        return NextResponse.json({ error: "Failed to publish highlight. Balance has been restored." }, { status: 500 });
      }

      await supabaseAdmin.from("news").delete().eq("id", highlightId).ilike("user_email", emailLower);
      deductionCompleted = true;

      const publishedHl = insertedHlRows?.[0] || activeHl;

      const notifRow = {
        user_email: emailLower,
        title: "Highlight Live",
        message: "Payment confirmed! Your highlight is now live in the feed.",
      };
      await supabaseAdmin.from("notifications").insert([notifRow]);
      const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
      dispatchNotificationWebhook(notifRow).catch(() => {});

      const { invalidateCachedUserCampaigns, invalidateCachedProfile: invProfile } = await import("@/lib/utils/cache");
      await Promise.all([
        invalidateCachedUserCampaigns(emailLower),
        invProfile(emailLower),
        redisConnection.incr(`statement:ver:${emailLower}`).catch(() => {}),
        redisConnection.del(`statement:payments:${emailLower}`, `statement:all:${emailLower}`).catch(() => {}),
      ]);

      return NextResponse.json({
        success: true,
        message: "Highlight published and live in feed!",
        highlight: publishedHl,
      });
    }

    if (type === "highlight") {
      const {
        title,
        content,
        image_url,
        interest,
        country,
        state,
        province,
        campaign_days,
        is_bidded,
        bid_price,
        custom_sponsor_name,
        custom_sponsor_handle,
        is_ai_content: rawAiContent,
        isAiContent: rawAiContentAlt,
        editingId,
      } = metadata;

      const isAiContent = !!(rawAiContent ?? rawAiContentAlt);

      if (editingId) {
        const editLimitKey = `ratelimit:edit_highlight:${editingId}`;
        await redisConnection.set(editLimitKey, "1", "EX", 86400).catch(() => {});

        const [newsUpdateRes, newsActiveUpdateRes] = await Promise.all([
          supabaseAdmin.from("news").update({
            title,
            content,
            image_url,
            interest,
            country: country || null,
            state: state || null,
            province: province || null,
            campaign_days: campaign_days || 1,
            is_bidded: !!is_bidded,
            bid_price: bid_price ? parseFloat(bid_price) : null,
            custom_sponsor_name: custom_sponsor_name || null,
            custom_sponsor_handle: custom_sponsor_handle || null,
            is_ai_content: isAiContent,
          }).eq("id", editingId).ilike("user_email", emailLower).select("id"),
          supabaseAdmin.from("newsactive").update({
            title,
            content,
            image_url,
            interest,
            country: country || null,
            state: state || null,
            province: province || null,
            campaign_days: campaign_days || 1,
            is_bidded: !!is_bidded,
            bid_price: bid_price ? parseFloat(bid_price) : null,
            custom_sponsor_name: custom_sponsor_name || null,
            custom_sponsor_handle: custom_sponsor_handle || null,
            is_ai_content: isAiContent,
          }).eq("id", editingId).ilike("user_email", emailLower).select("id"),
        ]);

        const updatedCount = (newsUpdateRes.data?.length || 0) + (newsActiveUpdateRes.data?.length || 0);
        if (updatedCount === 0 || newsUpdateRes.error || newsActiveUpdateRes.error) {
          await rollbackWallet("highlight_edit_failed");
          return NextResponse.json({ error: "Failed to update highlight. Wallet balance has been restored." }, { status: 500 });
        }
      } else {
        const { error: insertHighlightError } = await supabaseAdmin.from("news").insert([
          {
            title,
            content,
            image_url,
            interest,
            country: country || null,
            state: state || null,
            province: province || null,
            campaign_days: campaign_days || 1,
            is_bidded: !!is_bidded,
            bid_price: bid_price ? parseFloat(bid_price) : null,
            custom_sponsor_name: custom_sponsor_name || null,
            custom_sponsor_handle: custom_sponsor_handle || null,
            user_email: emailLower,
            is_ai_content: isAiContent,
          },
        ]);

        if (insertHighlightError) {
          console.error("❌ Wallet pay: Error inserting news highlight:", insertHighlightError);
          await rollbackWallet("highlight_insert_failed");
          return NextResponse.json({ error: "Failed to post highlight. Wallet balance has been restored." }, { status: 500 });
        }
      }
      deductionCompleted = true;

      await supabaseAdmin.from("notifications").insert({
        user_email: emailLower,
        title: editingId ? "Highlight Updated" : "Highlight Posted",
        message: `Your highlight "${title}" has been ${editingId ? "updated" : "paid using your wallet balance"} and submitted for review. It will be published shortly!`,
      });
    } else if (type === "ad") {
      const { adData } = metadata;
      if (adData.id) {
        const editLimitKey = `ratelimit:edit_ad:${adData.id}`;
        await redisConnection.set(editLimitKey, "1", "EX", 86400).catch(() => {});
      }

      const isBidded = !!adData.isBidded;
      const bidPrice = adData.bidPrice ? parseFloat(adData.bidPrice) : null;
      const effectiveRate = isBidded && bidPrice ? bidPrice : adData.costPerImpression;

      // Call submit_ad_campaign RPC using supabaseAdmin
      const { error: rpcError } = await supabaseAdmin.rpc("submit_ad_campaign", {
        p_id: adData.id,
        p_ad_type: adData.adType,
        p_industry: adData.industry,
        p_interest: adData.interest,
        p_lifestyle: adData.lifestyle,
        p_behavior: adData.behavior,
        p_personality: adData.personality,
        p_age_range: adData.ageRange,
        p_targeting_all: adData.targetingAll ?? false,
        p_impressions: adData.impressions,
        p_campaign_days: adData.campaignDays,
        p_user_frequency_cap: adData.userFrequencyCap,
        p_country: adData.country || null,
        p_state: adData.state || null,
        p_province: adData.province || null,
        p_gender: adData.gender || null,
        p_employment_status: adData.employmentStatus || null,
        p_ad_media_type: adData.adMediaType,
        p_ad_content: adData.adContent,
        p_ad_action_buttons: adData.adActionButtons,
        p_action_phone: adData.actionPhone || null,
        p_action_whatsapp: adData.actionWhatsapp || null,
        p_action_website: adData.actionWebsite || null,
        p_action_email: adData.actionEmail || null,
        p_cost_per_impression: effectiveRate,
        p_total_cost: amountNum,
        p_user_email: email,
        p_ad_media: adData.adMedia || adData.ad_media || null,
        p_display_mutual_button: adData.displayMutualButton ?? true,
        p_product_price: adData.productPrice || null,
        p_product_name: adData.productName || null,
        p_product_cta_type: adData.productCtaType || null,
        p_product_cta_link: adData.productCtaLink || null,
        p_action_ios: adData.actionIos || null,
        p_action_android: adData.actionAndroid || null,
        p_action_watch_now: adData.actionWatchNow || null,
      });

      if (rpcError) {
        console.error("❌ Wallet pay: RPC submit_ad_campaign failed:", rpcError);
        await rollbackWallet("ad_rpc_failed");
        return NextResponse.json({ error: "Failed to submit ad campaign. Wallet balance has been restored." }, { status: 500 });
      }
      deductionCompleted = true;

      // Ensure newly submitted ad is only in 'adds' review queue and not in addsactive (ownership-scoped)
      await supabaseAdmin.from("addsactive").delete().eq("id", adData.id).ilike("user_email", emailLower);

      if (isAdmin) {
        try {
          await supabaseAdmin.from("adds").update({
            is_admin_post: true,
            cost_per_impression: 0,
          }).eq("id", adData.id).ilike("user_email", emailLower);
        } catch {}
      }

      if (adData.isAiContent || adData.is_ai_content) {
        try {
          await supabaseAdmin.from("adds").update({
            is_ai_content: true,
          }).eq("id", adData.id).ilike("user_email", emailLower);
        } catch {}
      }

      // If ad is bidded, record in bidded_ads table and update Redis ZSET
      if (isBidded && bidPrice) {
        const adIndustry = (adData.adType || "business").toLowerCase();
        const { error: bidInsertErr } = await supabaseAdmin.from("bidded_ads").insert({
          ad_id: adData.id,
          user_email: emailLower,
          industry: adIndustry,
          bid_price: bidPrice,
          is_active: true,
        });

        if (bidInsertErr) {
          console.error("❌ Wallet pay: Error inserting bidded_ads record:", bidInsertErr);
        }

        try {
          const zsetKey = `bids:zset:${adIndustry}`;
          await redisConnection.zadd(zsetKey, bidPrice, adData.id);
          await redisConnection.del("attention:market_rates");
        } catch (redisErr) {
          console.warn("⚠️ Redis ZSET update warning:", redisErr);
        }
      }

      // Add user notification
      await supabaseAdmin.from("notifications").insert({
        user_email: emailLower,
        title: isBidded ? "Priority Ad Campaign Created" : "Ad Campaign Created",
        message: isBidded
          ? `Your priority bidded campaign with ${adData.impressions} attentions was paid using your wallet balance and submitted for priority delivery!`
          : `Your ad campaign with ${adData.impressions} attentions was paid using your wallet balance and submitted for review.`,
      });
    }
    // Invalidate cached profile, statement cache, and user campaigns in Redis
    await invalidateCachedProfile(emailLower);
    const { invalidateCachedUserCampaigns } = await import("@/lib/utils/cache");
    await Promise.all([
      invalidateCachedUserCampaigns(emailLower).catch(() => {}),
      redisConnection.incr(`statement:ver:${emailLower}`).catch(() => {}),
      redisConnection.del(`statement:payments:${emailLower}`, `statement:all:${emailLower}`).catch(() => {}),
    ]);

    return NextResponse.json({
      success: true,
      reference,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/payments/wallet-pay:", err);
    if (walletDeducted && !deductionCompleted && emailLowerRef && amountNumRef > 0 && referenceRef) {
      await refundWalletDeductionAtomic(
        emailLowerRef,
        amountNumRef,
        `wallet_pay_${deductionType}_exception`,
        referenceRef
      ).catch(() => {});
      try {
        await supabaseAdmin.from("payments").update({ status: "reversed" }).eq("reference", referenceRef);
      } catch {}
    }
    return NextResponse.json({ error: "Try again later" }, { status: 500 });
  } finally {
    if (lockAcquired && walletLockKey) {
      await redisConnection.del(walletLockKey).catch(() => {});
    }
  }
}
