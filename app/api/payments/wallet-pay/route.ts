import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { v4 as uuidv4 } from "uuid";
import { invalidateCachedProfile, invalidateTargetedHighlightCache } from "@/lib/utils/cache";
import redisConnection from "@/lib/redis";

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type, amount, metadata } = body;

    // Validate type
    const validTypes = ["ad", "highlight", "monetization_standard", "monetization_instant"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
    }

    if (type === "ad") {
      const adData = metadata?.adData;
      if (!adData) {
        return NextResponse.json({ error: "Ad details missing from metadata" }, { status: 400 });
      }
      const isBidded = !!adData.isBidded;
      const bidPrice = adData.bidPrice ? parseFloat(adData.bidPrice) : null;
      const rate = isBidded && bidPrice ? bidPrice : parseFloat(adData.costPerImpression || 15);
      const impressions = parseInt(adData.impressions || 1000, 10);
      const expectedCost = rate * impressions;
      if (Math.abs(amountNum - expectedCost) > 0.01) {
        return NextResponse.json({ error: "Cost validation mismatch. Payment amount does not match campaign configurations." }, { status: 400 });
      }
    }

    // 1. Fetch current user balance
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("balance")
      .ilike("email", email)
      .maybeSingle();

    if (userError || !user) {
      console.error("❌ Error fetching user balance for wallet payment:", userError);
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const currentBalance = parseFloat(user.balance || 0);
    if (currentBalance < amountNum) {
      return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
    }

    const newBalance = currentBalance - amountNum;

    // 2. Deduct user balance
    const { error: balanceUpdateError } = await supabaseAdmin
      .from("users")
      .update({ balance: newBalance })
      .ilike("email", email);

    if (balanceUpdateError) {
      console.error("❌ Error updating user balance:", balanceUpdateError);
      return NextResponse.json({ error: "Failed to update wallet balance" }, { status: 500 });
    }

    // 3. Create successful payment record
    const reference = `wallet_${uuidv4()}`;
    const paystackMetadata = {
      type,
      user_email: email,
      ...(metadata || {}),
    };

    const { error: insertPaymentError } = await supabaseAdmin.from("payments").insert({
      user_email: email,
      reference,
      amount: amountNum,
      status: "success",
      type,
      description: `Payment for ${type} using Wallet Balance`,
      metadata: paystackMetadata,
    });

    if (insertPaymentError) {
      console.error("❌ Error logging wallet payment record:", insertPaymentError);
      // Note: We don't rollback balance here because balance deduction has already occurred, but we log the warning.
    }

    // 4. Perform business logic
    if (type === "highlight") {
      const { title, content, image_url, interest, country, state, province, campaign_days, is_bidded, bid_price, editingId } = metadata;

      // Enforce 1 Edit per 24 Hours Rate Limit for Advertisers if editing
      if (editingId) {
        const editLimitKey = `ratelimit:edit_highlight:${editingId}`;
        const isEditLimited = await redisConnection.get(editLimitKey).catch(() => null);
        if (isEditLimited) {
          return NextResponse.json({ error: "Limit reached, try again later." }, { status: 429 });
        }
        await redisConnection.set(editLimitKey, "1", "EX", 86400).catch(() => {});

        // Update existing highlight across news and newsactive
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
            bid_price: bid_price ? parseFloat(bid_price) : null
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
            bid_price: bid_price ? parseFloat(bid_price) : null
          }).eq("id", editingId)
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
            user_email: email,
          },
        ]);

        if (insertHighlightError) {
          console.error("❌ Wallet pay: Error inserting news highlight:", insertHighlightError);
          return NextResponse.json({ error: "Payment succeeded but failed to post highlight" }, { status: 500 });
        }
      }

      // Highlights cache relies on natural 30-second TTL expiry for maximum 100M+ write throughput

      // Add user notification
      await supabaseAdmin.from("notifications").insert({
        user_email: email,
        title: editingId ? "Highlight Updated" : "Highlight Posted",
        message: `Your highlight "${title}" has been ${editingId ? "updated" : "paid using your wallet balance"} and submitted for review. It will be published shortly!`,
      });

    } else if (type === "ad") {
      const { adData } = metadata;
      if (!adData) {
        return NextResponse.json({ error: "Ad data missing from metadata" }, { status: 400 });
      }

      // Enforce 1 Edit per 24 Hours Rate Limit for Advertisers
      if (adData.id) {
        const { data: existingAd } = await supabaseAdmin
          .from("adds")
          .select("id")
          .eq("id", adData.id)
          .maybeSingle();

        const { data: existingActiveAd } = await supabaseAdmin
          .from("addsactive")
          .select("id")
          .eq("id", adData.id)
          .maybeSingle();

        if (existingAd || existingActiveAd) {
          const editLimitKey = `ratelimit:edit_ad:${adData.id}`;
          const isEditLimited = await redisConnection.get(editLimitKey).catch(() => null);
          if (isEditLimited) {
            return NextResponse.json({
              error: "Limit reached, try again later."
            }, { status: 429 });
          }
          await redisConnection.set(editLimitKey, "1", "EX", 86400).catch(() => {});
        }
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
        p_ad_media: adData.adMedia || null,
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
        return NextResponse.json({ error: "Payment succeeded but failed to submit ad campaign" }, { status: 500 });
      }

      // If ad is bidded, record in bidded_ads table and update Redis ZSET
      if (isBidded && bidPrice) {
        const adIndustry = (adData.adType || "business").toLowerCase();
        const { error: bidInsertErr } = await supabaseAdmin.from("bidded_ads").insert({
          ad_id: adData.id,
          user_email: email,
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
        user_email: email,
        title: isBidded ? "Priority Ad Campaign Created" : "Ad Campaign Created",
        message: isBidded
          ? `Your priority bidded campaign with ${adData.impressions} attentions was paid using your wallet balance and submitted for priority delivery!`
          : `Your ad campaign with ${adData.impressions} attentions was paid using your wallet balance and submitted for review.`,
      });
    } else if (type === "monetization_standard" || type === "monetization_instant") {
      const planType = type === "monetization_instant" ? "instant" : "standard";

      const { error: rpcError } = await supabaseAdmin.rpc("activate_monetization", {
        p_email: email,
        p_type: planType,
      });

      if (rpcError) {
        console.error(`❌ Wallet pay: activate_monetization RPC failed for ${email}:`, rpcError);
        return NextResponse.json({ error: "Payment succeeded but failed to activate monetization" }, { status: 500 });
      }

      await supabaseAdmin.from("notifications").insert({
        user_email: email,
        title: "Monetization Subscription Active",
        message: `Your account monetization is now active on the ${planType} plan. Payment was deducted from your wallet balance.`,
      });
    }
    // Invalidate cached profile in Redis
    await invalidateCachedProfile(email);

    return NextResponse.json({
      success: true,
      reference,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/payments/wallet-pay:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
