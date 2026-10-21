// lib/payment/processPayment.ts
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

async function sendIdempotentNotification(userEmail: string, title: string, message: string) {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .ilike("user_email", userEmail.toLowerCase().trim())
      .eq("title", title)
      .gte("created_at", fiveMinutesAgo)
      .limit(1);

    if (!recent || recent.length === 0) {
      await supabaseAdmin.from("notifications").insert({
        user_email: userEmail.toLowerCase().trim(),
        title,
        message,
      });
    }
  } catch (err) {
    console.warn("⚠️ Notification insert notice:", err);
  }
}

export async function processSuccessfulPayment(
  reference: string,
  metadata: Record<string, unknown>,
  _amount?: number
) {
  // 1. Check if the payment has already been processed successfully
  const { data: existingPayment, error: fetchError } = await supabaseAdmin
    .from("payments")
    .select("status, user_email, type, metadata")
    .eq("reference", reference)
    .maybeSingle();

  if (fetchError) {
    console.error("❌ Error fetching payment status during processing:", fetchError);
    throw fetchError;
  }

  if (existingPayment && existingPayment.status === "success") {
    console.log(`ℹ️ Payment with reference ${reference} has already been processed successfully.`);
    return { alreadyProcessed: true };
  }

  const mergedMetadata = { ...(existingPayment?.metadata || {}), ...(metadata || {}) };
  const type = (mergedMetadata.type || existingPayment?.type) as string | undefined;
  const user_email = (mergedMetadata.user_email || mergedMetadata.userEmail || mergedMetadata.email || existingPayment?.user_email) as string | undefined;
  if (!type || !user_email) {
    throw new Error("Invalid payment metadata: missing type or user_email");
  }

  console.log(`🚀 Processing successful payment for ${user_email}, type: ${type}, reference: ${reference}`);

    // 2.A: Publish Approved Ad (Post-Review Direct-to-Feed)
  if (type === "publish_ad") {
    const adId = (mergedMetadata.adId || mergedMetadata.id) as string;
    if (!adId) throw new Error("Missing adId in publish_ad payment metadata");

    const { data: adToPublish, error: fetchErr } = await supabaseAdmin
      .from("adds")
      .select("*")
      .eq("id", adId)
      .maybeSingle();

    if (fetchErr || !adToPublish) {
      throw new Error("Ad not found in review queue for publishing");
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

    if (insertErr) throw insertErr;

    await supabaseAdmin.from("adds").delete().eq("id", adId);

    const publishedAd = insertedRows?.[0] || activeAd;
    const { dispatchFeedDropWebhook } = await import("@/lib/webhookDispatcher");
    dispatchFeedDropWebhook(publishedAd).catch(() => {});

    await sendIdempotentNotification(
      user_email,
      "Campaign Published & Live!",
      "Your approved campaign has been paid and is now live in the active feed!"
    );
  }

  // 2.B: Publish Approved Highlight (Post-Review Direct-to-Feed)
  if (type === "publish_highlight") {
    const highlightId = (mergedMetadata.highlightId || mergedMetadata.id) as string;
    if (!highlightId) throw new Error("Missing highlightId in publish_highlight payment metadata");

    const { data: hlToPublish, error: fetchErr } = await supabaseAdmin
      .from("news")
      .select("*")
      .eq("id", highlightId)
      .maybeSingle();

    if (fetchErr || !hlToPublish) {
      throw new Error("Highlight not found in review queue for publishing");
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

    const { error: insertErr } = await supabaseAdmin
      .from("newsactive")
      .insert([activeHl]);

    if (insertErr) {
      console.error("❌ Error activating highlight in newsactive via gateway:", insertErr);
      throw insertErr;
    }

    await supabaseAdmin.from("news").delete().eq("id", highlightId);

    await sendIdempotentNotification(
      user_email,
      "Highlight Published & Live!",
      "Your approved highlight is now live in the active feed!"
    );
  }

  // 2. Perform business action based on type (Closed-loop non-refundable payments only: Ad, Highlight, Boost, Brand Subscription)
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
    } = mergedMetadata as any;

    const isAiContent = !!(rawAiContent ?? rawAiContentAlt);

    if (editingId) {
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
      const targetTable = "news";
      const { error: insertError } = await supabaseAdmin.from(targetTable).insert([
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
          user_email,
          is_ai_content: isAiContent,
        },
      ]);

      if (insertError) {
        console.error(`❌ Error inserting highlight to ${targetTable} table:`, insertError);
        throw insertError;
      }
    }

    await sendIdempotentNotification(
      user_email,
      editingId ? "Highlight Updated 🚀" : "Highlight Submitted 🚀",
      `Your highlight "${title}" has been ${editingId ? "updated" : "submitted for review"}. It will be published after admin approval!`
    );
  } else if (type === "boost_campaign" || type === "boost" || type === "boost_highlight") {
    const {
      ad_id,
      additional_impressions = 0,
      additional_days = 0,
      cost_per_impression,
      user_frequency_cap,
      gender,
      country,
      state,
      province,
      industry,
      interest
    } = mergedMetadata as any;

    if (ad_id) {
      let { data: ad } = await supabaseAdmin.from("adds").select("*").eq("id", ad_id).maybeSingle();
      if (!ad) {
        const { data: activeAd } = await supabaseAdmin.from("addsactive").select("*").eq("id", ad_id).maybeSingle();
        ad = activeAd;
      }

      if (ad) {
        const currentCost = Math.max(15, Number(ad.cost_per_impression || 25));
        const effectiveCost = cost_per_impression && Number(cost_per_impression) > currentCost
          ? Number(cost_per_impression)
          : currentCost;

        const updatePayload: Record<string, any> = {
          cost_per_impression: effectiveCost,
          completed_at: null,
          is_paused: false,
        };

        if (Number(additional_impressions) > 0) {
          updatePayload.impressions = Number(ad.impressions || 1000) + Number(additional_impressions);
        }
        if (Number(additional_days) > 0) {
          updatePayload.campaign_days = Number(ad.campaign_days || 1) + Number(additional_days);
        }
        if (user_frequency_cap !== undefined && Number(user_frequency_cap) > 0) {
          updatePayload.user_frequency_cap = Number(user_frequency_cap);
        }
        if (gender) updatePayload.gender = gender;
        if (country !== undefined) updatePayload.country = country;
        if (state !== undefined) updatePayload.state = state;
        if (province !== undefined) updatePayload.province = province;
        if (industry) updatePayload.industry = Array.isArray(industry) ? industry : [industry];
        if (interest) updatePayload.interest = Array.isArray(interest) ? interest : [interest];

        await Promise.all([
          supabaseAdmin.from("adds").update(updatePayload).eq("id", ad_id),
          supabaseAdmin.from("addsactive").update(updatePayload).eq("id", ad_id),
        ]);

        if (effectiveCost > 25) {
          try {
            const adIndustry = (ad.ad_type || (Array.isArray(ad.industry) ? ad.industry[0] : ad.industry) || "business").toLowerCase();
            await supabaseAdmin.from("bidded_ads").delete().eq("ad_id", ad_id);
            await supabaseAdmin.from("bidded_ads").insert({
              ad_id,
              user_email: user_email.toLowerCase().trim(),
              industry: adIndustry,
              bid_price: effectiveCost,
              is_active: true,
            });
            await redisConnection.zadd(`bids:zset:${adIndustry}`, effectiveCost, ad_id).catch(() => {});
            await redisConnection.del("attention:market_rates").catch(() => {});
          } catch (bidErr) {
            console.warn("⚠️ bidded_ads update notice in processPayment boost:", bidErr);
          }
        }
      } else {
        // Check highlight tables
        let { data: hl } = await supabaseAdmin.from("newsactive").select("*").eq("id", ad_id).maybeSingle();
        if (!hl) {
          const { data: qHl } = await supabaseAdmin.from("news").select("*").eq("id", ad_id).maybeSingle();
          hl = qHl;
        }

        if (hl) {
          const currentRate = hl.is_bidded && hl.bid_price ? Number(hl.bid_price) : 1000;
          const effectiveRate = cost_per_impression && Number(cost_per_impression) > currentRate
            ? Number(cost_per_impression)
            : currentRate;

          const hlUpdate: Record<string, any> = {
            is_paused: false,
          };
          if (Number(additional_days) > 0) {
            hlUpdate.campaign_days = Number(hl.campaign_days || 1) + Number(additional_days);
          }
          if (effectiveRate > 1000) {
            hlUpdate.bid_price = effectiveRate;
            hlUpdate.is_bidded = true;
          }
          if (country !== undefined) hlUpdate.country = country;
          if (state !== undefined) hlUpdate.state = state;
          if (province !== undefined) hlUpdate.province = province;
          if (interest) hlUpdate.interest = Array.isArray(interest) ? interest[0] : interest;

          await Promise.all([
            supabaseAdmin.from("news").update(hlUpdate).eq("id", ad_id),
            supabaseAdmin.from("newsactive").update(hlUpdate).eq("id", ad_id),
          ]);
        }
      }

      await sendIdempotentNotification(
        user_email,
        "Campaign Priority Boosted ⚡",
        `Your campaign has been successfully boosted with priority bid ₦${cost_per_impression || 25}.`
      );
    }
  } else if (type === "ad") {
    const adData = mergedMetadata.adData as Record<string, unknown> | undefined;
    if (!adData) {
      throw new Error("Ad data missing from payment metadata");
    }

    const isBidded = !!adData.isBidded;
    const bidPrice = adData.bidPrice ? parseFloat(adData.bidPrice as string) : null;
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
      p_total_cost: adData.totalCost,
      p_user_email: user_email,
      p_ad_media: (adData.adMedia as string) || (adData.ad_media as string) || null,
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
      console.error("❌ RPC submit_ad_campaign failed:", rpcError);
      throw rpcError;
    }

    // Ensure newly submitted ad is only in 'adds' review queue and not in addsactive
    await supabaseAdmin.from("addsactive").delete().eq("id", adData.id);

    if (adData.isAiContent || adData.is_ai_content) {
      try {
        await supabaseAdmin.from("adds").update({
          is_ai_content: true,
        }).eq("id", adData.id);
      } catch {}
    }

    // If ad is bidded, record in bidded_ads table and Redis ZSET for instant priority auction inclusion
    if (isBidded && bidPrice) {
      const adIndustry = ((adData.adType as string) || "business").toLowerCase();
      const { error: bidInsertErr } = await supabaseAdmin.from("bidded_ads").insert({
        ad_id: adData.id,
        user_email,
        industry: adIndustry,
        bid_price: bidPrice,
        is_active: true,
      });
      if (bidInsertErr) {
        console.error("❌ Failed to insert bidded ad in processPayment:", bidInsertErr);
      }
      try {
        const redisConnection = (await import("@/lib/redis")).default;
        await redisConnection.zadd(`bids:zset:${adIndustry}`, bidPrice, String(adData.id));
        await redisConnection.del("attention:market_rates");
      } catch (redisErr) {
        console.warn("⚠️ Redis ZSET update warning in processPayment:", redisErr);
      }
    }

    // Insert user notification
    await sendIdempotentNotification(
      user_email,
      "Ad Campaign Created 📢",
      `Your ad campaign with ${adData.impressions} impressions was successfully created and submitted for review.`
    );
  } else if (type === "brand_subscription") {
    const subscriberId = (mergedMetadata.subscriber_id || mergedMetadata.brand_id) as string | undefined;
    if (subscriberId) {
      const { data: updatedSub } = await supabaseAdmin
        .from("premium_subscribers")
        .update({
          status: "active",
          payment_status: "paid",
          paid_at: new Date().toISOString(),
          payment_reference: reference,
        })
        .eq("id", subscriberId)
        .select("*")
        .maybeSingle();

      const domain = String(updatedSub?.domain || mergedMetadata.domain || "").toLowerCase().trim();
      const businessName = String(updatedSub?.business_name || mergedMetadata.business_name || "Premium Brand");

      if (domain) {
        try {
          const redisConnection = (await import("@/lib/redis")).default;
          await redisConnection.set(
            `cache:domain_subscriber:${domain}`,
            JSON.stringify({
              is_subscriber: true,
              discount_percentage: 30,
              business_name: businessName,
            }),
            "EX",
            600
          );
        } catch {}
      }

      await sendIdempotentNotification(
        user_email,
        "Brand Subscription Activated 🌟",
        `Your Premium Brand Subscription for ${businessName} (${domain}) is now active!`
      );
    }
  }

  // 3. Update the payment record status in DB
  const { error: updateError } = await supabaseAdmin
    .from("payments")
    .update({ status: "success" })
    .eq("reference", reference);

  if (updateError) {
    console.error("❌ Error updating payment record status to success:", updateError);
    throw updateError;
  }

  // 4. Invalidate cached profile, user campaigns, statement payments, and monetize status in Redis
  try {
    const { invalidateCachedProfile, invalidateCachedUserCampaigns } = await import("@/lib/utils/cache");
    await invalidateCachedProfile(String(user_email));
    await invalidateCachedUserCampaigns(String(user_email)).catch(() => {});
  } catch (cacheErr) {
    console.warn("⚠️ Cache invalidation notice in processPayment:", cacheErr);
  }

  console.log(`✅ Payment successfully recorded and business actions completed for: ${reference}`);
  return { success: true };
}
