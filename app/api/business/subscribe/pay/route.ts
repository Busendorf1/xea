import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { v4 as uuidv4 } from "uuid";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import redisConnection from "@/lib/redis";
import { PaystackService } from "@/lib/payment/paystack";

export async function POST(req: NextRequest) {
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

    const requiredAmount = Number(subscriber.amount || 150000);
    const currency = subscriber.currency || "NGN";

    // 2. Handle Wallet Payment
    if (payment_method === "wallet") {
      // Fetch user's current wallet balance
      const { data: userProfile, error: userErr } = await supabaseAdmin
        .from("users")
        .select("id, balance, email")
        .ilike("email", cleanEmail)
        .maybeSingle();

      if (userErr || !userProfile) {
        return NextResponse.json({ error: "User wallet account not found." }, { status: 404 });
      }

      const currentBalance = parseFloat(userProfile.balance || "0");
      if (currentBalance < requiredAmount) {
        return NextResponse.json({
          error: `Insufficient wallet balance. You have ${currency === "NGN" ? "₦" + currentBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 }) : "$" + currentBalance.toFixed(2)}, but ${currency === "NGN" ? "₦" + requiredAmount.toLocaleString() : "$" + requiredAmount} is required.`,
        }, { status: 400 });
      }

      const newBalance = currentBalance - requiredAmount;

      // Deduct balance atomically
      const { error: balanceErr } = await supabaseAdmin
        .from("users")
        .update({ balance: newBalance })
        .eq("id", userProfile.id);

      if (balanceErr) {
        console.error("❌ Error deducting wallet balance for brand subscription:", balanceErr);
        return NextResponse.json({ error: "Failed to deduct wallet balance. Please try again." }, { status: 500 });
      }

      const paymentRef = `sub_wallet_${uuidv4()}`;

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
      }

      // Record transaction ledger entry
      try {
        await supabaseAdmin.from("payments").insert({
          user_email: cleanEmail,
          amount: requiredAmount,
          currency: currency.toLowerCase(),
          status: "success",
          type: "brand_subscription",
          reference: paymentRef,
          metadata: {
            brand_id: subscriber.id,
            business_name: subscriber.business_name,
            domain: subscriber.domain,
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
        message: `Payment of ${currency === "NGN" ? "₦" + requiredAmount.toLocaleString() : "$" + requiredAmount} successful! ${subscriber.business_name} (${subscriber.domain}) is now an active Premium Subscriber brand. All advertisers promoting links from this domain will receive a 30% discount!`,
        subscriber: updatedSub || subscriber,
        new_balance: newBalance,
      });
    }

    // 3. Handle Paystack Card Payment Initialization
    if (payment_method === "card") {
      try {
        const callback = callback_url || `${process.env.NEXT_PUBLIC_BASE_URL || ""}/business/subscribe?payment=success`;
        const initData = await PaystackService.initializeTransaction(
          cleanEmail,
          requiredAmount,
          callback,
          {
            type: "brand_subscription",
            subscriber_id: subscriber.id,
            domain: subscriber.domain,
            user_email: cleanEmail,
          }
        );

        return NextResponse.json({
          success: true,
          authorization_url: initData.authorization_url,
          access_code: initData.access_code,
          reference: initData.reference,
        });
      } catch (paystackErr: any) {
        console.error("❌ Paystack initialization error for brand subscription:", paystackErr);
        return NextResponse.json({
          error: paystackErr.message || "Failed to initialize card payment. Please use wallet balance or try again.",
        }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Invalid payment method. Supported methods: 'wallet', 'card'." }, { status: 400 });
  } catch (err: any) {
    console.error("❌ Error in POST /api/business/subscribe/pay:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
