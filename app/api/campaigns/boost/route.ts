import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { PayoutProvider } from "@/lib/payment/payoutProvider";
import redisConnection from "@/lib/redis";
import { spendWalletBalanceAtomic } from "@/lib/services/payoutSettlementService";
import { invalidateCachedProfile, invalidateCachedUserCampaigns } from "@/lib/utils/cache";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let walletLockKey: string | null = null;
  let lockAcquired = false;
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

    const addImpressionsNum = Number(additionalImpressions || 0);
    const addDaysNum = Number(additionalDays || 0);
    if (!Number.isFinite(addImpressionsNum) || addImpressionsNum < 0 || !Number.isFinite(addDaysNum) || addDaysNum < 0) {
      return NextResponse.json({ error: "Additional impressions and days must be non-negative numbers" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    // 1. Fetch current campaign details from adds, addsactive, news, or newsactive
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

    let isHighlight = false;
    if (!ad) {
      const { data: activeHl } = await supabaseAdmin
        .from("newsactive")
        .select("*")
        .eq("id", adId)
        .maybeSingle();
      if (activeHl) {
        ad = activeHl;
        isHighlight = true;
      } else {
        const { data: reviewHl } = await supabaseAdmin
          .from("news")
          .select("*")
          .eq("id", adId)
          .maybeSingle();
        if (reviewHl) {
          ad = reviewHl;
          isHighlight = true;
        }
      }
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

    const currentCost = isHighlight
      ? (ad.is_bidded && ad.bid_price ? Number(ad.bid_price) : 1000)
      : Math.max(15, Number(ad.cost_per_impression || 25));

    const effectiveCost = newCostPerImpression && Number(newCostPerImpression) > currentCost
      ? Number(newCostPerImpression)
      : currentCost;

    // Calculate total cost
    const totalCost = isHighlight
      ? Number((
          (addDaysNum > 0 ? addDaysNum * effectiveCost : 0) +
          (newCostPerImpression && Number(newCostPerImpression) > currentCost
            ? (Number(newCostPerImpression) - currentCost) * Number(ad.campaign_days || 1)
            : 0)
        ).toFixed(2))
      : Number((addImpressionsNum * effectiveCost).toFixed(2));

    // Build targeting & specs update object
    const updatePayload: Record<string, any> = {
      is_paused: false,
    };

    if (isHighlight) {
      if (addDaysNum > 0) {
        updatePayload.campaign_days = Number(ad.campaign_days || 1) + addDaysNum;
      }
      if (effectiveCost > 1000) {
        updatePayload.bid_price = effectiveCost;
        updatePayload.is_bidded = true;
      }
      if (country !== undefined) updatePayload.country = country;
      if (state !== undefined) updatePayload.state = state;
      if (province !== undefined) updatePayload.province = province;
      if (interest) updatePayload.interest = Array.isArray(interest) ? interest[0] : interest;
    } else {
      updatePayload.cost_per_impression = effectiveCost;
      updatePayload.completed_at = null; // Clear completed flag if topped up!
      if (addImpressionsNum > 0) {
        updatePayload.impressions = Number(ad.impressions || 1000) + addImpressionsNum;
      }
      if (addDaysNum > 0) {
        updatePayload.campaign_days = Number(ad.campaign_days || 1) + addDaysNum;
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
    }

    // Handle Payment Method
    if (totalCost === 0) {
      // Free targeting/specs update without adding cost!
      if (isHighlight) {
        await Promise.all([
          supabaseAdmin.from("news").update(updatePayload).eq("id", adId),
          supabaseAdmin.from("newsactive").update(updatePayload).eq("id", adId),
        ]);
      } else {
        await Promise.all([
          supabaseAdmin.from("adds").update(updatePayload).eq("id", adId),
          supabaseAdmin.from("addsactive").update(updatePayload).eq("id", adId),
        ]);
      }
      await invalidateCachedUserCampaigns(emailLower).catch(() => {});
      return NextResponse.json({
        success: true,
        message: "Campaign targeting and frequency settings updated successfully!"
      });
    }

    if (paymentMethod === "wallet") {
      walletLockKey = `lock:wallet:${emailLower}`;
      const acquired = await redisConnection.set(walletLockKey, "1", "EX", 15, "NX").catch(() => "OK");
      if (!acquired) {
        return NextResponse.json(
          { error: "Another wallet transaction is currently in progress. Please wait a moment." },
          { status: 429 }
        );
      }
      lockAcquired = true;

      const reference = `wallet_boost_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
      const spendRes = await spendWalletBalanceAtomic(
        emailLower,
        totalCost,
        "boost_campaign",
        reference
      );

      if (!spendRes.success) {
        return NextResponse.json({
          error: spendRes.error || `Insufficient wallet balance. Total cost is ₦${totalCost.toLocaleString()}.`
        }, { status: 400 });
      }

      const newBalance = spendRes.newBalance ?? 0;

      // Log wallet transaction in payments table
      await supabaseAdmin.from("payments").insert({
        user_email: emailLower,
        reference,
        amount: totalCost,
        status: "success",
        type: isHighlight ? "boost_highlight" : "boost_campaign",
        description: isHighlight
          ? `Non-refundable Boost priority top-up for Highlight #${adId.substring(0, 8)}`
          : `Non-refundable Boost priority top-up for Ad #${adId.substring(0, 8)}`,
        metadata: {
          ad_id: adId,
          type: isHighlight ? "boost_highlight" : "boost_campaign",
          is_highlight: isHighlight,
          additional_impressions: addImpressionsNum,
          additional_days: addDaysNum,
          cost_per_impression: effectiveCost,
          payment_method: "wallet",
          non_refundable: true,
        }
      });

      // Update both review and active tables
      if (isHighlight) {
        await Promise.all([
          supabaseAdmin.from("news").update(updatePayload).eq("id", adId),
          supabaseAdmin.from("newsactive").update(updatePayload).eq("id", adId),
        ]);
      } else {
        await Promise.all([
          supabaseAdmin.from("adds").update(updatePayload).eq("id", adId),
          supabaseAdmin.from("addsactive").update(updatePayload).eq("id", adId),
        ]);
      }

      if (!isHighlight && effectiveCost > 25) {
        try {
          const adIndustry = (ad.ad_type || (Array.isArray(ad.industry) ? ad.industry[0] : ad.industry) || "business").toLowerCase();
          await supabaseAdmin.from("bidded_ads").delete().eq("ad_id", adId);
          await supabaseAdmin.from("bidded_ads").insert({
            ad_id: adId,
            user_email: emailLower,
            industry: adIndustry,
            bid_price: effectiveCost,
            is_active: true,
          });
          await redisConnection.zadd(`bids:zset:${adIndustry}`, effectiveCost, adId).catch(() => {});
          await redisConnection.del("attention:market_rates").catch(() => {});
        } catch (bidErr) {
          console.warn("⚠️ bidded_ads update notice in wallet boost:", bidErr);
        }
      }

      await invalidateCachedProfile(emailLower);
      await invalidateCachedUserCampaigns(emailLower).catch(() => {});

      // Insert notification
      await supabaseAdmin.from("notifications").insert({
        user_email: emailLower,
        title: isHighlight ? "Highlight Priority Boosted" : "Campaign Priority Boosted",
        message: isHighlight
          ? `Your highlight has been successfully boosted with priority daily bid ₦${effectiveCost.toLocaleString()} and ${addDaysNum} additional days.`
          : `Your campaign has been successfully boosted with priority bid ₦${effectiveCost.toLocaleString()} and ${addImpressionsNum} additional impressions.`,
      });

      return NextResponse.json({
        success: true,
        paymentMethod: "wallet",
        totalCost,
        newBalance,
        message: isHighlight
          ? `Highlight boosted successfully! Schedule duration and priority delivery have been updated and are actively delivering.`
          : `Campaign topped up successfully! ₦${totalCost.toLocaleString()} deducted from wallet balance.`
      });

    } else if (paymentMethod === "card") {
      // Generate secure payment link via Paystack / Gateway for card/bank transfer
      const reference = `BOOST-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
      
      const origin = req.headers.get("origin") || "http://localhost:3000";
      const isMobile = !!req.headers.get("x-user-email") && !req.headers.get("origin")?.includes("http");
      const callbackUrl = isMobile 
        ? "xea-auth://payment-callback"
        : `${origin}/logged-in?boost_ref=${reference}${isHighlight ? "&type=highlight&tab=highlights" : ""}`;

      // Insert pending payment record so verify endpoint and webhooks recognize it
      await supabaseAdmin.from("payments").insert({
        user_email: emailLower,
        reference,
        amount: totalCost,
        status: "pending",
        type: isHighlight ? "boost_highlight" : "boost_campaign",
        description: isHighlight
          ? `Card payment boost top-up for Highlight #${adId.substring(0, 8)}`
          : `Card payment boost top-up for Ad #${adId.substring(0, 8)}`,
        metadata: {
          user_email: emailLower,
          ad_id: adId,
          type: isHighlight ? "boost_highlight" : "boost_campaign",
          is_highlight: isHighlight,
          additional_impressions: additionalImpressions,
          additional_days: additionalDays,
          cost_per_impression: effectiveCost,
          user_frequency_cap: userFrequencyCap,
          gender,
          country,
          state,
          province,
          industry,
          interest,
          payment_method: "card"
        }
      });

      try {
        const paymentData = await PayoutProvider.initializePayment({
          email: emailLower,
          amountInNaira: totalCost,
          callbackUrl,
          metadata: {
            user_email: emailLower,
            ad_id: adId,
            type: isHighlight ? "boost_highlight" : "boost_campaign",
            is_highlight: isHighlight,
            additional_impressions: additionalImpressions,
            additional_days: additionalDays,
            cost_per_impression: effectiveCost,
            boost_reference: reference,
          },
          narration: isHighlight
            ? `Paayh Boost for Highlight #${adId.substring(0, 8)}`
            : `Paayh Boost for Ad #${adId.substring(0, 8)}`,
        });

        // If gateway generated a different reference (e.g. kora_pay_*), update payment record so either reference can be resolved
        if (paymentData.reference && paymentData.reference !== reference) {
          await supabaseAdmin
            .from("payments")
            .update({
              gateway_reference: paymentData.reference,
              metadata: {
                user_email: emailLower,
                ad_id: adId,
                type: "boost_campaign",
                additional_impressions: additionalImpressions,
                additional_days: additionalDays,
                cost_per_impression: effectiveCost,
                user_frequency_cap: userFrequencyCap,
                gender,
                country,
                state,
                province,
                industry,
                interest,
                payment_method: "card",
                kora_reference: paymentData.reference,
                gateway_reference: paymentData.reference,
              },
            })
            .eq("reference", reference);
        }

        return NextResponse.json({
          success: true,
          paymentMethod: "card",
          paymentUrl: paymentData.authorization_url,
          reference: paymentData.reference || reference,
          totalCost,
        });
      } catch (err: any) {
        console.error("❌ PayoutProvider boost init error:", err);
        if (process.env.NODE_ENV === "production") {
          return NextResponse.json({ error: "Failed to initialize payment gateway" }, { status: 502 });
        }
      }

      // Fallback test payment URL only in non-production environments
      const mockUrl = new URL(callbackUrl);
      mockUrl.searchParams.set("reference", reference);
      mockUrl.searchParams.set("trxref", reference);
      if (isHighlight) {
        mockUrl.searchParams.set("type", "highlight");
        mockUrl.searchParams.set("tab", "highlights");
      }

      return NextResponse.json({
        success: true,
        paymentMethod: "card",
        paymentUrl: mockUrl.toString(),
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
  } finally {
    if (lockAcquired && walletLockKey) {
      await redisConnection.del(walletLockKey).catch(() => {});
    }
  }
}
