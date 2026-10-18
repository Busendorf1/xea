import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { v4 as uuidv4 } from "uuid";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import redisConnection from "@/lib/redis";
import { PayoutProvider } from "@/lib/payment/payoutProvider";
import {
  spendWalletBalanceAtomic,
  refundWalletDeductionAtomic,
} from "@/lib/services/payoutSettlementService";

const USD_TO_NGN_RATE = 1500;

export async function POST(req: NextRequest) {
  let walletLockKey: string | null = null;
  let lockAcquired = false;
  try {
    const authEmail = await getAuthenticatedEmail(req);
    if (!authEmail) {
      return NextResponse.json({ error: "Unauthorized. Please log in to complete payment." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { subscriber_id, payment_method, callback_url } = body;

    if (!subscriber_id) {
      return NextResponse.json({ error: "Missing subscriber application ID." }, { status: 400 });
    }

    const cleanEmail = authEmail.toLowerCase().trim();

    // 1. Fetch subscriber application
    const { data: subscriber, error: subErr } = await supabaseAdmin
      .from("premium_subscribers")
      .select("*")
      .eq("id", subscriber_id)
      .maybeSingle();

    if (subErr || !subscriber) {
      return NextResponse.json({ error: "Brand subscription application not found." }, { status: 404 });
    }

    // Verify ownership
    const isOwner =
      (subscriber.user_email && subscriber.user_email.toLowerCase() === cleanEmail) ||
      (subscriber.contact_email && subscriber.contact_email.toLowerCase() === cleanEmail);

    const { isAdminEmail } = await import("@/lib/authHelper");
    const isAdmin = isAdminEmail(cleanEmail);

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "You are not authorized to pay for this application." }, { status: 403 });
    }

    if (subscriber.status === "active" && subscriber.payment_status === "paid") {
      return NextResponse.json({
        success: true,
        message: "This brand subscription is already active and paid for.",
        subscriber,
      });
    }

    if (subscriber.status !== "approved") {
      return NextResponse.json({
        error: `Cannot proceed to payment. Application status is currently '${subscriber.status}'. It must be approved by an administrator first.`,
      }, { status: 400 });
    }

    const rawAmount = Number(subscriber.amount || 150000);
    const currency = String(subscriber.currency || "NGN").toUpperCase();
    // Convert USD ($100) to NGN (₦150,000) so NGN wallets and NGN payment gateways charge the true Naira equivalent
    const requiredAmountNgn = currency === "USD" ? rawAmount * USD_TO_NGN_RATE : rawAmount;

    // 2. Handle Wallet Payment
    if (payment_method === "wallet") {
      walletLockKey = `lock:wallet:${cleanEmail}`;
      const acquired = await redisConnection.set(walletLockKey, "1", "EX", 15, "NX").catch(() => "OK");
      if (!acquired) {
        return NextResponse.json(
          { error: "Another wallet transaction is currently in progress. Please wait a moment." },
          { status: 429 }
        );
      }
      lockAcquired = true;

      const paymentRef = `sub_wallet_${uuidv4()}`;
      const spendRes = await spendWalletBalanceAtomic(
        cleanEmail,
        requiredAmountNgn,
        "brand_subscription",
        paymentRef
      );

      if (!spendRes.success) {
        return NextResponse.json({
          error: `Insufficient wallet balance. ₦${requiredAmountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2 })} is required.`,
        }, { status: 400 });
      }

      const newBalance = spendRes.newBalance ?? 0;

      // Update subscriber status to active and payment_status to paid
      const { data: updatedSub, error: updateSubErr } = await supabaseAdmin
        .from("premium_subscribers")
        .update({
          status: "active",
          payment_status: "paid",
          paid_at: new Date().toISOString(),
          payment_reference: paymentRef,
        })
        .eq("id", subscriber.id)
        .select()
        .single();

      if (updateSubErr) {
        console.error("❌ Error updating subscriber status after payment:", updateSubErr);
        await refundWalletDeductionAtomic(cleanEmail, requiredAmountNgn, "brand_sub_update_failed", paymentRef);
        return NextResponse.json({ error: "Failed to activate subscription. Wallet balance has been restored." }, { status: 500 });
      }

      // Record transaction ledger entry
      try {
        await supabaseAdmin.from("payments").insert({
          user_email: cleanEmail,
          amount: requiredAmountNgn,
          currency: "ngn",
          status: "success",
          type: "brand_subscription",
          reference: paymentRef,
          description: `Non-refundable Brand Subscription for ${subscriber.business_name} (${subscriber.domain})`,
          metadata: {
            brand_id: subscriber.id,
            subscriber_id: subscriber.id,
            business_name: subscriber.business_name,
            domain: subscriber.domain,
            original_amount: rawAmount,
            original_currency: currency,
            non_refundable: true,
            type: "brand_subscription",
          },
        });
      } catch (logErr) {
        console.warn("⚠️ Warning: could not log payment to payments table:", logErr);
      }

      // Update Redis cache for instant 0.5ms lookup across system
      try {
        const cacheKey = `cache:domain_subscriber:${subscriber.domain.toLowerCase().trim()}`;
        await redisConnection.set(
          cacheKey,
          JSON.stringify({
            is_subscriber: true,
            discount_percentage: 30,
            business_name: subscriber.business_name,
          }),
          "EX",
          600
        );
      } catch (cacheErr) {}

      // Invalidate profile cache
      try {
        await invalidateCachedProfile(cleanEmail);
      } catch (cacheErr) {}

      return NextResponse.json({
        success: true,
        message: `Payment of ₦${requiredAmountNgn.toLocaleString()} successful! ${subscriber.business_name} (${subscriber.domain}) is now an active Premium Subscriber brand. All advertisers promoting links from this domain will receive a 30% discount!`,
        subscriber: updatedSub || subscriber,
        new_balance: newBalance,
      });
    }

    // 3. Handle Card Payment Initialization (via active gateway Kora or Paystack)
    if (payment_method === "card") {
      try {
        const callback = callback_url || `${process.env.NEXT_PUBLIC_BASE_URL || ""}/business/subscribe?payment=success`;
        const paymentMetadata = {
          type: "brand_subscription",
          subscriber_id: subscriber.id,
          brand_id: subscriber.id,
          business_name: subscriber.business_name,
          domain: subscriber.domain,
          user_email: cleanEmail,
          non_refundable: true,
          provider: PayoutProvider.getActiveGateway(),
        };

        const initData = await PayoutProvider.initializePayment({
          email: cleanEmail,
          amountInNaira: requiredAmountNgn,
          callbackUrl: callback,
          metadata: paymentMetadata,
          narration: `Brand Subscription for ${subscriber.business_name} (${subscriber.domain})`,
        });

        // Insert pending payment record so /api/payments/verify and webhooks can fulfill it
        await supabaseAdmin.from("payments").insert({
          user_email: cleanEmail,
          reference: initData.reference,
          amount: requiredAmountNgn,
          status: "pending",
          type: "brand_subscription",
          description: `Non-refundable Brand Subscription for ${subscriber.business_name} (${subscriber.domain})`,
          metadata: paymentMetadata,
        });

        return NextResponse.json({
          success: true,
          authorization_url: initData.authorization_url,
          access_code: initData.access_code,
          reference: initData.reference,
        });
      } catch (payErr: any) {
        console.error("❌ Card payment initialization error for brand subscription:", payErr);
        return NextResponse.json({
          error: payErr.message || "Failed to initialize card payment. Please use wallet balance or try again.",
        }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Invalid payment method. Supported methods: 'wallet', 'card'." }, { status: 400 });
  } catch (err: any) {
    console.error("❌ Error in POST /api/business/subscribe/pay:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  } finally {
    if (lockAcquired && walletLockKey) {
      await redisConnection.del(walletLockKey).catch(() => {});
    }
  }
}
