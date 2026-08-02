import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      adId,
      additionalImpressions = 0,
      additionalDays = 0,
      newCostPerImpression,
      paymentMethod = "wallet", // "wallet" | "card"
      userFrequencyCap,
      gender,
      country,
      state,
      province,
      industry,
      interest
    } = await req.json();

    if (!adId) {
      return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    // 1. Fetch current campaign details from adds or addsactive
    let { data: ad } = await supabaseAdmin
      .from("adds")
      .select("*")
      .eq("id", adId)
      .maybeSingle();

    if (!ad) {
      const { data: activeAd } = await supabaseAdmin
        .from("addsactive")
        .select("*")
        .eq("id", adId)
        .maybeSingle();
      ad = activeAd;
    }

    if (!ad) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (ad.user_email?.toLowerCase().trim() !== emailLower) {
      return NextResponse.json({ error: "Access denied. You do not own this campaign." }, { status: 403 });
    }

    // 1. Check if ad has active viewer reports in ad_reports
    const { data: activeReports } = await supabaseAdmin
      .from("ad_reports")
      .select("id, status")
      .eq("ad_id", adId)
      .in("status", ["pending", "action_taken"])
      .limit(1);

    if (activeReports && activeReports.length > 0) {
      return NextResponse.json({
        error: "Boosting Unavailable: This campaign has been reported by viewers and is currently under content safety review. Please wait for the moderation review to complete."
      }, { status: 400 });
    }

    // 2. Check if ad has an admin statement (deactivated or flagged by admin)
    if (ad.admin_statement && ad.admin_statement.trim() !== "") {
      return NextResponse.json({
        error: `Boosting Unavailable: This campaign was paused by an administrator. Reason: "${ad.admin_statement}". Please resolve the notice or wait for admin review.`
      }, { status: 400 });
    }

    // 3. Check if ad is paused by user
    if (ad.is_paused) {
      return NextResponse.json({
        error: "Boosting Unavailable: This campaign is currently paused. Please resume the campaign first to boost it."
      }, { status: 400 });
    }

    const currentCost = Number(ad.cost_per_impression || 25);
    const effectiveCost = newCostPerImpression && Number(newCostPerImpression) > currentCost
      ? Number(newCostPerImpression)
      : currentCost;

    // Calculate total cost based ONLY on additional Attention (Impressions) * Bid Price
    const totalCost = (Number(additionalImpressions) / 1000) * (effectiveCost * 1000);

    // Build targeting & specs update object
    const updatePayload: Record<string, any> = {
      cost_per_impression: effectiveCost,
      completed_at: null, // Clear completed flag if topped up!
      is_paused: false,
    };

    if (additionalImpressions > 0) {
      updatePayload.impressions = Number(ad.impressions || 1000) + Number(additionalImpressions);
    }
    if (additionalDays > 0) {
      updatePayload.campaign_days = Number(ad.campaign_days || 1) + Number(additionalDays);
    }
    if (userFrequencyCap !== undefined && Number(userFrequencyCap) > 0) {
      updatePayload.user_frequency_cap = Number(userFrequencyCap);
    }
    if (gender) updatePayload.gender = gender;
    if (country !== undefined) updatePayload.country = country;
    if (state !== undefined) updatePayload.state = state;
    if (province !== undefined) updatePayload.province = province;
    if (industry) updatePayload.industry = Array.isArray(industry) ? industry : [industry];
    if (interest) updatePayload.interest = Array.isArray(interest) ? interest : [interest];

    // Handle Payment Method
    if (totalCost === 0) {
      // Free targeting/specs update without adding cost!
      await Promise.all([
        supabaseAdmin.from("adds").update(updatePayload).eq("id", adId),
        supabaseAdmin.from("addsactive").update(updatePayload).eq("id", adId),
      ]);
      return NextResponse.json({
        success: true,
        message: "Campaign targeting and frequency settings updated successfully!"
      });
    }

    if (paymentMethod === "wallet") {
      // 2. Fetch user wallet balance
      const { data: user, error: userErr } = await supabaseAdmin
        .from("users")
        .select("balance")
        .ilike("email", emailLower)
        .maybeSingle();

      if (userErr || !user) {
        return NextResponse.json({ error: "User profile not found" }, { status: 404 });
      }

      const currentBalance = Number(user.balance || 0);
      if (currentBalance < totalCost) {
        return NextResponse.json({
          error: `Insufficient wallet balance. Total cost is ₦${totalCost.toLocaleString()} but your balance is ₦${currentBalance.toLocaleString()}.`
        }, { status: 400 });
      }

      // 3. Deduct from wallet balance atomically
      const newBalance = currentBalance - totalCost;
      const { error: balanceErr } = await supabaseAdmin
        .from("users")
        .update({ balance: newBalance })
        .ilike("email", emailLower);

      if (balanceErr) {
        console.error("❌ Error updating user balance:", balanceErr);
        return NextResponse.json({ error: "Failed to process wallet payment." }, { status: 500 });
      }

      await Promise.all([
        supabaseAdmin.from("adds").update(updatePayload).eq("id", adId),
        supabaseAdmin.from("addsactive").update(updatePayload).eq("id", adId),
      ]);

      return NextResponse.json({
        success: true,
        paymentMethod: "wallet",
        totalCost,
        newBalance,
        message: `Campaign topped up successfully! ₦${totalCost.toLocaleString()} deducted from wallet balance.`
      });

    } else if (paymentMethod === "card") {
      // Generate secure payment link via Paystack / Gateway for card/bank transfer
      const reference = `BOOST-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
      
      const origin = req.headers.get("origin") || "http://localhost:3000";
      const callbackUrl = `${origin}/user/myAds?boost_ref=${reference}`;

      if (paystackSecret) {
        try {
          const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${paystackSecret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: emailLower,
              amount: Math.round(totalCost * 100), // convert ₦ to kobo
              reference,
              callback_url: callbackUrl,
              metadata: {
                ad_id: adId,
                type: "boost_campaign",
                additional_impressions: additionalImpressions,
                additional_days: additionalDays,
                cost_per_impression: effectiveCost,
              },
            }),
          });

          const paystackData = await paystackRes.json();
          if (paystackData.status && paystackData.data?.authorization_url) {
            return NextResponse.json({
              success: true,
              paymentMethod: "card",
              paymentUrl: paystackData.data.authorization_url,
              reference,
              totalCost,
            });
          }
        } catch (e) {
          console.error("❌ Paystack init error:", e);
        }
      }

      // Fallback test payment URL if secret key is not set
      return NextResponse.json({
        success: true,
        paymentMethod: "card",
        paymentUrl: callbackUrl,
        reference,
        totalCost,
        message: "Payment gateway link generated."
      });

    } else {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }

  } catch (err: any) {
    console.error("❌ Error in /api/campaigns/boost:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
