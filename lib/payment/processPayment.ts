// lib/payment/processPayment.ts
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function processSuccessfulPayment(reference: string, metadata: any, amount: number) {
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

  const { type, user_email } = metadata;
  if (!type || !user_email) {
    throw new Error("Invalid payment metadata: missing type or user_email");
  }

  console.log(`🚀 Processing successful payment for ${user_email}, type: ${type}, reference: ${reference}`);

  // 2. Perform business action based on type
  if (type === "monetization_standard" || type === "monetization_instant") {
    const isInstant = type === "monetization_instant";
    const planType = isInstant ? "instant" : "standard";

    const { error: rpcError } = await supabaseAdmin.rpc("activate_monetization", {
      p_email: user_email,
      p_type: planType,
    });

    if (rpcError) {
      console.error(`❌ RPC activate_monetization failed for ${user_email}:`, rpcError);
      throw rpcError;
    }

    // Insert user notification
    await supabaseAdmin.from("notifications").insert({
      user_email,
      title: "Monetization Subscription Active 🎉",
      message: `Your account monetization is now active on the ${planType} plan. Thank you for your subscription!`,
    });
  } else if (type === "highlight") {
    const { title, content, image_url, interest } = metadata;

    const { error: insertError } = await supabaseAdmin.from("news").insert([
      {
        title,
        content,
        image_url,
        interest,
        user_email,
      },
    ]);

    if (insertError) {
      console.error("❌ Error inserting highlight to news table:", insertError);
      throw insertError;
    }

    // Insert user notification
    await supabaseAdmin.from("notifications").insert({
      user_email,
      title: "Highlight Posted 🚀",
      message: `Your highlight "${title}" has been submitted for review. It will be published shortly!`,
    });
  } else if (type === "ad") {
    const { adData } = metadata;
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
      p_ad_media: adData.adMedia || null,
      p_display_mutual_button: adData.displayMutualButton ?? true,
      p_product_price: adData.productPrice || null,
      p_product_name: adData.productName || null,
      p_product_cta_type: adData.productCtaType || null,
      p_product_cta_link: adData.productCtaLink || null,
      p_action_ios: adData.actionIos || null,
      p_action_android: adData.actionAndroid || null,
    });

    if (rpcError) {
      console.error("❌ RPC submit_ad_campaign failed:", rpcError);
      throw rpcError;
    }

    // Insert user notification
    await supabaseAdmin.from("notifications").insert({
      user_email,
      title: "Ad Campaign Created 📢",
      message: `Your ad campaign with ${adData.impressions} impressions was successfully created and submitted for review.`,
    });
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

  console.log(`✅ Successfully processed payment reference ${reference}`);
  return { success: true };
}
