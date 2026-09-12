// lib/payment/processPayment.ts
import supabaseAdmin from "@/lib/utils/dbAdmin";

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
    .select("status")
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

  const type = metadata.type as string | undefined;
  const user_email = metadata.user_email as string | undefined;
  if (!type || !user_email) {
    throw new Error("Invalid payment metadata: missing type or user_email");
  }

  console.log(`🚀 Processing successful payment for ${user_email}, type: ${type}, reference: ${reference}`);

  // 2. Perform business action based on type (Only Ad & Highlight campaigns)
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
      is_admin_post,
      custom_sponsor_name,
      custom_sponsor_handle
    } = metadata as any;

    // All submitted user highlights strictly go to 'news' review queue for admin moderation
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
      },
    ]);

    if (insertError) {
      console.error(`❌ Error inserting highlight to ${targetTable} table:`, insertError);
      throw insertError;
    }

    // Insert user notification
    await sendIdempotentNotification(
      user_email,
      "Highlight Submitted 🚀",
      `Your highlight "${title}" has been submitted for review. It will be published after admin approval!`
    );
  } else if (type === "boost_campaign" || type === "boost") {
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
    } = metadata as any;

    if (ad_id) {
      let { data: ad } = await supabaseAdmin.from("adds").select("*").eq("id", ad_id).maybeSingle();
      if (!ad) {
        const { data: activeAd } = await supabaseAdmin.from("addsactive").select("*").eq("id", ad_id).maybeSingle();
        ad = activeAd;
      }

      if (ad) {
        const currentCost = Number(ad.cost_per_impression || 25);
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

        await sendIdempotentNotification(
          user_email,
          "Campaign Priority Boosted ⚡",
          `Your campaign has been successfully boosted with priority bid ₦${effectiveCost}.`
        );
      }
    }
  } else if (type === "ad") {
    const adData = metadata.adData as Record<string, unknown> | undefined;
    if (!adData) {
      throw new Error("Ad data missing from payment metadata");
    }

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
      p_cost_per_impression: adData.costPerImpression,
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

    // If ad is bidded, record in bidded_ads table for instant priority auction inclusion
    const isBidded = !!adData.isBidded;
    const bidPrice = adData.bidPrice ? parseFloat(adData.bidPrice as string) : null;
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
    }

    // Insert user notification
    await sendIdempotentNotification(
      user_email,
      "Ad Campaign Created 📢",
      `Your ad campaign with ${adData.impressions} impressions was successfully created and submitted for review.`
    );
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

  // 4. Invalidate cached profile, statement payments, and monetize status in Redis
  try {
    const { invalidateCachedProfile } = await import("@/lib/utils/cache");
    await invalidateCachedProfile(String(user_email));
  } catch (cacheErr) {
    console.warn("⚠️ Cache invalidation notice in processPayment:", cacheErr);
  }

  console.log(`✅ Payment successfully recorded and business actions completed for: ${reference}`);
  return { success: true };
}
