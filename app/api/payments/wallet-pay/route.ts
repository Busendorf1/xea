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

export async function POST(req: NextRequest) {
  let walletLockKey: string | null = null;
  let lockAcquired = false;
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const body = await req.json();
    const { type, amount, metadata } = body;

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

    if (!isAdmin && (!Number.isFinite(amountNum) || amountNum <= 0)) {
      return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
    }

    // 1. Pre-validate payload & rate limits BEFORE touching user balance
    if (type === "ad") {
      const adData = metadata?.adData;
      if (!adData) {
        return NextResponse.json({ error: "Ad details missing from metadata" }, { status: 400 });
      }
      const isBidded = !!adData.isBidded;
      const bidPrice = adData.bidPrice ? parseFloat(adData.bidPrice) : null;
      const rate = isBidded && bidPrice ? bidPrice : parseFloat(adData.costPerImpression || 15);
      const impressions = parseInt(adData.impressions || 1000, 10);
      if (!isAdmin && (rate < 10 || impressions < 1000)) {
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
          supabaseAdmin.from("adds").select("id").eq("id", adData.id).maybeSingle(),
          supabaseAdmin.from("addsactive").select("id").eq("id", adData.id).maybeSingle(),
        ]);
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
        const editLimitKey = `ratelimit:edit_highlight:${metadata.editingId}`;
        const isEditLimited = await redisConnection.get(editLimitKey).catch(() => null);
        if (isEditLimited) {
          return NextResponse.json({ error: "Limit reached, try again later." }, { status: 429 });
        }
      }
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

    // 4. Deduct user balance atomically (skip if admin)
    if (!isAdmin) {
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
      amount: isAdmin ? 0 : amountNum,
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
      if (!adId) {
        return NextResponse.json({ error: "Missing adId parameter" }, { status: 400 });
      }

      const { data: adToPublish, error: fetchErr } = await supabaseAdmin
        .from("adds")
        .select("*")
        .eq("id", adId)
        .ilike("user_email", emailLower)
        .maybeSingle();

      if (fetchErr || !adToPublish) {
        return NextResponse.json({ error: "Campaign not found in review queue" }, { status: 404 });
      }

      if (!adToPublish.admin_statement || !adToPublish.admin_statement.startsWith("APPROVED:")) {
        return NextResponse.json({ error: "Campaign has not been approved for publishing by admin." }, { status: 400 });
      }

      const approvedTimestamp = adToPublish.admin_statement.replace("APPROVED:", "").trim();
      const approvedDate = new Date(approvedTimestamp);
      if (!isNaN(approvedDate.getTime()) && approvedDate.getTime() < Date.now() - 72 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "This approved campaign has expired (exceeded 3 days)." }, { status: 400 });
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
        .insert([activeAd])
        .select("*");

      if (insertErr) {
        console.error("❌ Error activating ad in addsactive:", insertErr);
        if (!isAdmin) {
          await refundWalletDeductionAtomic(emailLower, amountNum, "publish_ad_insert_failed", reference);
        }
        return NextResponse.json({ error: "Failed to publish ad. Balance has been restored." }, { status: 500 });
      }

      await supabaseAdmin.from("adds").delete().eq("id", adId);

      const publishedAd = insertedRows?.[0] || activeAd;
      const { dispatchFeedDropWebhook } = await import("@/lib/webhookDispatcher");
      dispatchFeedDropWebhook(publishedAd).catch(() => {});

      await supabaseAdmin.from("notifications").insert([
        {
          user_email: emailLower,
          title: "Campaign Published & Live!",
          message: "Your approved campaign has been paid and is now live in the active feed!",
        },
      ]);

      const { invalidateCachedUserCampaigns, invalidateCachedProfile } = await import("@/lib/utils/cache");
      await Promise.all([
        invalidateCachedUserCampaigns(emailLower),
        invalidateCachedProfile(emailLower),
      ]);

      return NextResponse.json({
        success: true,
        message: "Campaign published and live in feed!",
        ad: publishedAd,
      });
    }

    if (type === "publish_highlight") {
      const highlightId = metadata?.highlightId || body.highlightId;
      if (!highlightId) {
        return NextResponse.json({ error: "Missing highlightId parameter" }, { status: 400 });
      }

      const { data: hlToPublish, error: fetchErr } = await supabaseAdmin
        .from("news")
        .select("*")
        .eq("id", highlightId)
        .ilike("user_email", emailLower)
        .maybeSingle();

      if (fetchErr || !hlToPublish) {
        return NextResponse.json({ error: "Highlight not found in review queue" }, { status: 404 });
      }

      // Check 3-day approval expiry if applicable
      if (hlToPublish.admin_statement && hlToPublish.admin_statement.startsWith("APPROVED:")) {
        const approvedTimestamp = hlToPublish.admin_statement.replace("APPROVED:", "").trim();
        const approvedDate = new Date(approvedTimestamp);
        if (!isNaN(approvedDate.getTime()) && approvedDate.getTime() < Date.now() - 72 * 60 * 60 * 1000) {
          return NextResponse.json({ error: "This approved highlight has expired (exceeded 3 days)." }, { status: 400 });
        }
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
        .insert([activeHl])
        .select("*");

      if (insertErr) {
        console.error("❌ Error activating highlight in newsactive:", insertErr);
        if (!isAdmin) {
          await refundWalletDeductionAtomic(emailLower, amountNum, "publish_highlight_insert_failed", reference);
        }
        return NextResponse.json({ error: "Failed to publish highlight. Balance has been restored." }, { status: 500 });
      }

      await supabaseAdmin.from("news").delete().eq("id", highlightId);

      const publishedHl = insertedHlRows?.[0] || activeHl;

      await supabaseAdmin.from("notifications").insert([
        {
          user_email: emailLower,
          title: "Highlight Published & Live!",
          message: "Your approved highlight is now live in the active feed!",
        },
      ]);

      const { invalidateCachedUserCampaigns, invalidateCachedProfile } = await import("@/lib/utils/cache");
      await Promise.all([
        invalidateCachedUserCampaigns(emailLower),
        invalidateCachedProfile(emailLower),
      ]);

      return NextResponse.json({
        success: true,
        message: "Highlight published and live in feed!",
        highlight: activeHl,
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

        await Promise.all([
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
          }).eq("id", editingId),
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
          }).eq("id", editingId),
        ]);
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
          if (!isAdmin) {
            await refundWalletDeductionAtomic(emailLower, amountNum, "highlight_insert_failed", reference);
          }
          await supabaseAdmin.from("payments").update({ status: "failed" }).eq("reference", reference);
          return NextResponse.json({ error: "Failed to post highlight. Wallet balance has been restored." }, { status: 500 });
        }
      }

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
        if (!isAdmin) {
          await refundWalletDeductionAtomic(emailLower, amountNum, "ad_rpc_failed", reference);
        }
        await supabaseAdmin.from("payments").update({ status: "failed" }).eq("reference", reference);
        return NextResponse.json({ error: "Failed to submit ad campaign. Wallet balance has been restored." }, { status: 500 });
      }

      // Ensure newly submitted ad is only in 'adds' review queue and not in addsactive
      await supabaseAdmin.from("addsactive").delete().eq("id", adData.id);

      if (isAdmin || adData.isAdminPost) {
        await supabaseAdmin.from("adds").update({
          is_admin_post: true,
          custom_sponsor_name: adData.customSponsorName || null,
          custom_sponsor_handle: adData.customSponsorHandle || null,
          custom_sponsor_logo: adData.customSponsorLogo || null,
          cost_per_impression: 0,
        }).eq("id", adData.id);
      }

      if (adData.isAiContent || adData.is_ai_content) {
        try {
          await supabaseAdmin.from("adds").update({
            is_ai_content: true,
          }).eq("id", adData.id);
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
    // Invalidate cached profile and user campaigns in Redis
    await invalidateCachedProfile(emailLower);
    const { invalidateCachedUserCampaigns } = await import("@/lib/utils/cache");
    await invalidateCachedUserCampaigns(emailLower).catch(() => {});

    return NextResponse.json({
      success: true,
      reference,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/payments/wallet-pay:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  } finally {
    if (lockAcquired && walletLockKey) {
      await redisConnection.del(walletLockKey).catch(() => {});
    }
  }
}
