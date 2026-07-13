import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { v4 as uuidv4 } from "uuid";
import { invalidateCachedProfile } from "@/lib/utils/cache";

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

    // Cost verification check to prevent parameter manipulation
    if (type === "ad") {
      const adData = metadata?.adData;
      if (!adData) {
        return NextResponse.json({ error: "Ad details missing from metadata" }, { status: 400 });
      }
      const rate = parseFloat(adData.costPerImpression || 15);
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
      const { title, content, image_url, interest } = metadata;

      const { error: insertHighlightError } = await supabaseAdmin.from("news").insert([
        {
          title,
          content,
          image_url,
          interest,
          user_email: email,
        },
      ]);

      if (insertHighlightError) {
        console.error("❌ Wallet pay: Error inserting news highlight:", insertHighlightError);
        return NextResponse.json({ error: "Payment succeeded but failed to post highlight" }, { status: 500 });
      }

      // Add user notification
      await supabaseAdmin.from("notifications").insert({
        user_email: email,
        title: "Highlight Posted 🚀",
        message: `Your highlight "${title}" has been paid using your wallet balance and submitted for review. It will be published shortly!`,
      });

    } else if (type === "ad") {
      const { adData } = metadata;
      if (!adData) {
        return NextResponse.json({ error: "Ad data missing from metadata" }, { status: 400 });
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
        p_user_email: email,
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
        console.error("❌ Wallet pay: RPC submit_ad_campaign failed:", rpcError);
        return NextResponse.json({ error: "Payment succeeded but failed to submit ad campaign" }, { status: 500 });
      }

      // Add user notification
      await supabaseAdmin.from("notifications").insert({
        user_email: email,
        title: "Ad Campaign Created 📢",
        message: `Your ad campaign with ${adData.impressions} impressions was paid using your wallet balance and submitted for review.`,
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
        title: "Monetization Subscription Active 🎉",
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
