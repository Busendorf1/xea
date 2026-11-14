import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { PayoutProvider } from "@/lib/payment/payoutProvider";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { spendWalletBalanceAtomic } from "@/lib/services/payoutSettlementService";
import { invalidateCachedProfile, invalidateCachedUserCampaigns } from "@/lib/utils/cache";
import { verifyTransactionPin, resolveStoredWalletPinHash } from "@/lib/security/walletPinHelper";
import { bridgeMobilePaymentCallbackUrl } from "../../../../lib/payment/paymentLookup";
import {
  applyProductSalesSubsidy,
  getLocalizedAdFloorRate,
  getUserCurrency,
  MIN_AD_ATTENTIONS,
} from "../../../../lib/utils/currency";
import { isVerifiedSubscriberProductLink } from "../../../../lib/ads/pricingEnforcement";
import { assessAdDeliveryCapacity } from "../../../../lib/ads/capacityEstimator";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let walletLockKey: string | null = null;
  let lockAcquired = false;
  try {
    const email = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      adId: rawAdId,
      highlightId,
      additionalImpressions = 0,
      additionalDays = 0,
      newCostPerImpression,
      newBidPrice,
      paymentMethod = "wallet", // "wallet" | "card"
      callbackUrl: clientCallbackUrl,
      userFrequencyCap,
      gender,
      country,
      state,
      province,
      industry,
      interest,
      pin,
      walletPin,
    } = await req.json();

    const adId = rawAdId || highlightId;
    if (!adId) {
      return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });
    }

    const addImpressionsNum = Number(additionalImpressions || 0);
    const addDaysNum = Math.floor(Number(additionalDays || 0));
    if (!Number.isFinite(addImpressionsNum) || addImpressionsNum < 0 || !Number.isFinite(addDaysNum) || addDaysNum < 0) {
      return NextResponse.json({ error: "Additional impressions and days must be non-negative numbers" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    // 1. Fetch current campaign details from active tables first, then completed, then review queues
    let ad: any = null;
    let sourceTable: "addsactive" | "completed_ads" | "adds" | "newsactive" | "news" = "addsactive";
    let isHighlight = false;

    // Check live active ads first
    const { data: activeAd } = await supabaseAdmin
      .from("addsactive")
      .select("*")
      .eq("id", adId)
      .maybeSingle();

    if (activeAd) {
      ad = activeAd;
      sourceTable = "addsactive";
    } else {
      // Check recently completed ads (for re-boosting/top-up)
      const { data: completedAd } = await supabaseAdmin
        .from("completed_ads")
        .select("*")
        .eq("id", adId)
        .maybeSingle();

      if (completedAd) {
        ad = completedAd;
        sourceTable = "completed_ads";
      } else {
        // Check review queue
        const { data: queueAd } = await supabaseAdmin
          .from("adds")
          .select("*")
          .eq("id", adId)
          .maybeSingle();

        if (queueAd) {
          ad = queueAd;
          sourceTable = "adds";
        }
      }
    }

    // If not found in ad tables, check highlights
    if (!ad) {
      const { data: activeHl } = await supabaseAdmin
        .from("newsactive")
        .select("*")
        .eq("id", adId)
        .maybeSingle();

      if (activeHl) {
        ad = activeHl;
        sourceTable = "newsactive";
        isHighlight = true;
      } else {
        const { data: reviewHl } = await supabaseAdmin
          .from("news")
          .select("*")
          .eq("id", adId)
          .maybeSingle();

        if (reviewHl) {
          ad = reviewHl;
          sourceTable = "news";
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

    // 2. Check if ad has an admin statement (deactivated or flagged by admin for moderation)
    // NOTE: APPROVED:, STATUS:, and REJECTED: prefixes are system workflow timestamps, NOT admin pause penalties!
    const isPausedByAdmin = Boolean(
      ad.admin_statement &&
      typeof ad.admin_statement === "string" &&
      ad.admin_statement.trim() !== "" &&
      !ad.admin_statement.startsWith("APPROVED:") &&
      !ad.admin_statement.toLowerCase().startsWith("status:") &&
      !ad.admin_statement.startsWith("REJECTED:")
    );

    if (isPausedByAdmin) {
      return NextResponse.json({
        error: `Boosting Unavailable: This campaign was paused by an administrator. Reason: "${ad.admin_statement}". Please resolve the notice or wait for admin review.`
      }, { status: 400 });
    }

    // 3. Check if ad is manually paused by user (completed ads are reactivated by top-up)
    if (ad.is_paused && sourceTable !== "completed_ads") {
      return NextResponse.json({
        error: "Boosting Unavailable: This campaign is currently paused. Please resume the campaign first to boost it."
      }, { status: 400 });
    }

    let adFloorRate = 25;
    if (!isHighlight) {
      let userCountry: string | null = null;
      try {
        const { data: userRow } = await supabaseAdmin
          .from("users")
          .select("country")
          .ilike("email", emailLower)
          .maybeSingle();
        userCountry = userRow?.country || null;
      } catch {
        // Safe fallback to NGN if user profile mock does not expose country
      }

      const adCategory = String(
        ad.ad_type ||
          (Array.isArray(ad.industry) ? ad.industry[0] : ad.industry) ||
          "individual"
      )
        .trim()
        .toLowerCase();
      const baseFloor = getLocalizedAdFloorRate(adCategory, userCountry);
      const subsidyQualified =
        adCategory === "product_sales"
          ? await isVerifiedSubscriberProductLink(supabaseAdmin, ad.product_cta_link)
          : false;
      adFloorRate = subsidyQualified ? applyProductSalesSubsidy(baseFloor) : baseFloor;

      const requestedRaw = newCostPerImpression ?? newBidPrice;
      if (requestedRaw !== undefined && requestedRaw !== null && requestedRaw !== "") {
        const parsedRequested = Number(requestedRaw);
        const eps = getUserCurrency(userCountry) === "USD" ? 0.0005 : 0.001;
        if (!Number.isFinite(parsedRequested) || parsedRequested < adFloorRate - eps) {
          return NextResponse.json(
            { error: `Boost rate cannot be below category floor of ${adFloorRate}.` },
            { status: 400 }
          );
        }
      }
    }

    const currentCost = isHighlight
      ? (ad.is_bidded && ad.bid_price ? Number(ad.bid_price) : 1000)
      : Math.max(adFloorRate, Number(ad.cost_per_impression || adFloorRate));

    const requestedRate = newCostPerImpression ?? newBidPrice;
    const effectiveCost = requestedRate && Number(requestedRate) > currentCost
      ? Number(requestedRate)
      : currentCost;

    if (addDaysNum > 0 && Number(ad.campaign_days || 1) + addDaysNum > 90) {
      return NextResponse.json(
        { error: "Maximum campaign duration is 90 days." },
        { status: 400 }
      );
    }

    const remainingImpressions = Math.max(
      1,
      Number(ad.impressions || MIN_AD_ATTENTIONS) - Number(ad.impression_count || 0)
    );

    const normalizedUserFrequencyCap =
      userFrequencyCap !== undefined &&
      userFrequencyCap !== null &&
      userFrequencyCap !== "" &&
      Number.isFinite(Number(userFrequencyCap)) &&
      Number(userFrequencyCap) > 0
        ? Math.max(1, Math.min(100, Math.floor(Number(userFrequencyCap))))
        : undefined;

    if (!isHighlight && addImpressionsNum > 0) {
      const nextRemainingTarget =
        Math.max(0, Number(ad.impressions || 0) - Number(ad.impression_count || 0)) + addImpressionsNum;
      const capacity = await assessAdDeliveryCapacity(supabaseAdmin, {
        requestedImpressions: nextRemainingTarget,
        userFrequencyCap: normalizedUserFrequencyCap ?? Number(ad.user_frequency_cap || 1),
        campaignDays: Number(ad.campaign_days || 1) + addDaysNum,
        targetingAll: Boolean(ad.targeting_all),
        country: country !== undefined ? country : ad.country,
        state: state !== undefined ? state : ad.state,
        province: province !== undefined ? province : ad.province,
        gender: gender !== undefined ? gender : ad.gender,
        ageRange: ad.age_range ?? null,
        employmentStatus: ad.employment_status ?? null,
        industry: industry !== undefined ? industry : ad.industry,
        interest: interest !== undefined ? interest : ad.interest,
        lifestyle: ad.lifestyle ?? null,
        behavior: ad.behavior ?? null,
        personality: ad.personality ?? null,
        advertiserEmail: emailLower,
      });

      if (capacity.telemetryAvailable && !capacity.allowed) {
        return NextResponse.json(
          {
            error: capacity.message,
            capacityCapped: true,
            maxOrderableImpressions: capacity.maxOrderableImpressions,
          },
          { status: 400 }
        );
      }
    }

    // Calculate total cost (unified across Web, Mobile, and Edge Function)
    const totalCost = isHighlight
      ? Number((
          (addDaysNum > 0 ? addDaysNum * effectiveCost : 0) +
          (requestedRate && Number(requestedRate) > currentCost
            ? (Number(requestedRate) - currentCost) * Number(ad.campaign_days || 1)
            : 0)
        ).toFixed(2))
      : Number((
          (addImpressionsNum > 0 ? addImpressionsNum * effectiveCost : 0) +
          (effectiveCost > currentCost ? (effectiveCost - currentCost) * remainingImpressions : 0)
        ).toFixed(2));

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
        updatePayload.impressions = Number(ad.impressions || MIN_AD_ATTENTIONS) + addImpressionsNum;
      }
      if (addDaysNum > 0) {
        updatePayload.campaign_days = Number(ad.campaign_days || 1) + addDaysNum;
      }
      if (normalizedUserFrequencyCap !== undefined) {
        updatePayload.user_frequency_cap = normalizedUserFrequencyCap;
      }
      if (gender) updatePayload.gender = gender;
      if (country !== undefined) updatePayload.country = country;
      if (state !== undefined) updatePayload.state = state;
      if (province !== undefined) updatePayload.province = province;
      if (industry) updatePayload.industry = Array.isArray(industry) ? industry : [industry];
      if (interest) updatePayload.interest = Array.isArray(interest) ? interest : [interest];
    }

    // Helper to commit updates across PostgreSQL, Redis, and reactivation tables
    const applyCampaignDatabaseUpdates = async () => {
      if (isHighlight) {
        await Promise.all([
          supabaseAdmin.from("news").update(updatePayload).eq("id", adId),
          supabaseAdmin.from("newsactive").update(updatePayload).eq("id", adId),
        ]);
      } else if (sourceTable === "completed_ads") {
        // Reactivate completed ad back into live addsactive table
        const reactivatedAd = {
          ...ad,
          ...updatePayload,
          completed_at: null,
          is_paused: false,
          is_rollover: false,
          broadening_stage: 0,
          rollover_started_at: null,
          rollover_notified_at: null,
          approved_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        await Promise.all([
          supabaseAdmin.from("addsactive").upsert([reactivatedAd]),
          supabaseAdmin.from("adds").update(updatePayload).eq("id", adId),
          supabaseAdmin.from("completed_ads").delete().eq("id", adId),
        ]);
      } else {
        await Promise.all([
          supabaseAdmin.from("adds").update(updatePayload).eq("id", adId),
          supabaseAdmin.from("addsactive").update(updatePayload).eq("id", adId),
        ]);
      }

      // Update bidded_ads and Redis ranking whenever priority bid exceeds category floor
      if (!isHighlight && effectiveCost > adFloorRate) {
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
          console.warn("⚠️ bidded_ads update notice in boost:", bidErr);
        }
      }

      // Immediately invalidate L1 and L2 feed & highlight caches so the boost priority takes effect in 0ms
      try {
        const { evictAdFromL1FeedCaches, invalidateSharedHighlightsPool } = await import("@/lib/utils/cache");
        if (isHighlight) {
          invalidateSharedHighlightsPool();
        } else {
          evictAdFromL1FeedCaches();
        }
      } catch {}
      if (isRedisReady()) {
        redisConnection.del(`ad:detail:${adId}`, "campaigns:shared_pool:v1", "highlights:active_pool:v3").catch(() => {});
      }
    };

    // Handle Payment Method
    if (totalCost === 0) {
      // Free targeting/specs update or priority rate change without adding cost!
      await applyCampaignDatabaseUpdates();
      await invalidateCachedUserCampaigns(emailLower).catch(() => {});
      return NextResponse.json({
        success: true,
        message: "Campaign settings and priority rate updated successfully!"
      });
    }

    if (paymentMethod === "wallet") {
      // Enforce 4-digit Wallet PIN (fail closed when unset) before acquiring lock or deducting balance
      const { data: userPinData, error: userPinErr } = await supabaseAdmin
        .from("users")
        .select("wallet_pin_hash, passphrase")
        .ilike("email", emailLower)
        .maybeSingle();

      if (userPinErr) {
        return NextResponse.json(
          { error: "Unable to verify Wallet PIN right now. Please try again." },
          { status: 503 }
        );
      }

      const pinCheck = await verifyTransactionPin({
        email: emailLower,
        pin: pin ?? walletPin,
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

      walletLockKey = `lock:wallet:${emailLower}`;
      if (isRedisReady()) {
        const acquired = await redisConnection.set(walletLockKey, "1", "EX", 15, "NX").catch(() => "OK");
        if (!acquired) {
          return NextResponse.json(
            { error: "Another wallet transaction is currently in progress. Please wait a moment." },
            { status: 429 }
          );
        }
        lockAcquired = true;
      }

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
      try {
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
      } catch (payLogErr) {
        console.warn("⚠️ Boost payment log notice:", payLogErr);
      }

      // Update tables and bidded_ads
      await applyCampaignDatabaseUpdates();

      await invalidateCachedProfile(emailLower);
      await invalidateCachedUserCampaigns(emailLower).catch(() => {});

      // Insert concise notification & dispatch fast webhook
      const boostedAt = new Date().toISOString();
      try {
        const notifRow = {
          user_email: emailLower,
          title: isHighlight ? "Highlight Boosted" : "Campaign Boosted",
          message: isHighlight
            ? `Boosted with ₦${totalCost.toLocaleString()} (+${addDaysNum}d, ₦${effectiveCost.toLocaleString()}/day).`
            : `Boosted with ₦${totalCost.toLocaleString()} (+${addImpressionsNum.toLocaleString()} attentions, ₦${effectiveCost.toLocaleString()}/view).`,
          created_at: boostedAt,
        };
        await supabaseAdmin.from("notifications").insert(notifRow);
        const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
        dispatchNotificationWebhook(notifRow).catch(() => {});
      } catch (notifErr) {
        console.warn("⚠️ Boost notification notice:", notifErr);
      }

      return NextResponse.json({
        success: true,
        paymentMethod: "wallet",
        totalCost,
        boostedAmount: totalCost,
        boostedAt,
        newBalance,
        message: isHighlight
          ? `Boosted with ₦${totalCost.toLocaleString()}! Priority spotlight delivery is now active.`
          : `Boosted with ₦${totalCost.toLocaleString()}! Priority feed delivery is now active.`,
      });

    } else if (paymentMethod === "card") {
      // Generate secure payment link via Paystack / Gateway for card/bank transfer
      const reference = `BOOST-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

      const origin = req.headers.get("origin") || req.nextUrl?.origin || "http://localhost:3000";
      const isMobile = !!req.headers.get("x-user-email") && !req.headers.get("origin")?.includes("http");
      const baseCallback =
        typeof clientCallbackUrl === "string" && clientCallbackUrl.trim() !== ""
          ? clientCallbackUrl.trim()
          : isMobile
          ? "xea-auth://payment-callback"
          : `${origin}/logged-in`;
      const separator = baseCallback.includes("?") ? "&" : "?";
      const rawCallbackUrl = `${baseCallback}${separator}boost_ref=${encodeURIComponent(reference)}${
        isHighlight ? "&type=boost_highlight&tab=highlights" : "&type=boost_campaign"
      }`;
      const callbackUrl = bridgeMobilePaymentCallbackUrl(rawCallbackUrl, origin);

      const boostMetadata: Record<string, unknown> = {
        user_email: emailLower,
        ad_id: adId,
        type: isHighlight ? "boost_highlight" : "boost_campaign",
        is_highlight: isHighlight,
        additional_impressions: addImpressionsNum,
        additional_days: addDaysNum,
        cost_per_impression: effectiveCost,
        user_frequency_cap: normalizedUserFrequencyCap,
        gender,
        country,
        state,
        province,
        industry,
        interest,
        payment_method: "card",
      };

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
        metadata: boostMetadata,
      });

      try {
        const paymentData = await PayoutProvider.initializePayment({
          email: emailLower,
          amountInNaira: totalCost,
          callbackUrl,
          metadata: {
            ...boostMetadata,
            boost_reference: reference,
          },
          narration: isHighlight
            ? `Paayh Boost for Highlight #${adId.substring(0, 8)}`
            : `Paayh Boost for Ad #${adId.substring(0, 8)}`,
        });

        // If gateway generated a different reference (e.g. kora_pay_*), preserve full metadata + gateway reference so either resolves
        if (paymentData.reference && paymentData.reference !== reference) {
          await supabaseAdmin
            .from("payments")
            .update({
              metadata: {
                ...boostMetadata,
                boost_reference: reference,
                kora_reference: paymentData.reference,
                gateway_reference: paymentData.reference,
              },
            })
            .eq("reference", reference);

          try {
            await supabaseAdmin
              .from("payments")
              .update({ gateway_reference: paymentData.reference })
              .eq("reference", reference);
          } catch {
            // Optional column in older DB schemas
          }
        }

        return NextResponse.json({
          success: true,
          paymentMethod: "card",
          paymentUrl: paymentData.authorization_url,
          reference: paymentData.reference || reference,
          boostReference: reference,
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
