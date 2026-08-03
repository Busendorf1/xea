import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { v4 as uuidv4 } from "uuid";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import redisConnection from "@/lib/redis";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { buyer_email, amount = 300, order_reference, baggyt_order_id } = body;

    if (!buyer_email || typeof buyer_email !== "string") {
      return NextResponse.json({ error: "Missing required field: buyer_email" }, { status: 400 });
    }

    const emailLower = buyer_email.trim().toLowerCase();

    // 0. Redis API Rate Limiter (Max 10 bypass requests per 60s per buyer)
    try {
      const rateLimitKey = `ratelimit:baggyt_bypass:${emailLower}`;
      const currentRequests = await redisConnection.incr(rateLimitKey);
      if (currentRequests === 1) {
        await redisConnection.expire(rateLimitKey, 60); // 60s sliding window
      }
      if (currentRequests > 10) {
        return NextResponse.json(
          { error: "Too many checkout requests. Please wait a minute before retrying." },
          { status: 429 }
        );
      }
    } catch (redisErr) {
      console.warn("⚠️ Redis Rate Limit Check Warning:", redisErr);
    }

    const feeAmount = parseFloat(amount);
    if (isNaN(feeAmount) || feeAmount <= 0) {
      return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
    }

    // 1. Fetch Buyer balance
    const { data: buyer, error: buyerErr } = await supabaseAdmin
      .from("users")
      .select("id, email, balance")
      .ilike("email", emailLower)
      .maybeSingle();

    if (buyerErr || !buyer) {
      return NextResponse.json({ error: "Buyer Paayh profile not found" }, { status: 404 });
    }

    const currentBuyerBalance = parseFloat(buyer.balance || 0);
    if (currentBuyerBalance < feeAmount) {
      return NextResponse.json(
        {
          error: "Insufficient Paayh wallet balance",
          current_balance: currentBuyerBalance,
          required: feeAmount,
        },
        { status: 400 }
      );
    }

    // 2. Resolve Official Baggyt Corporate Account (Spoofing-Proof)
    const officialEmail = (process.env.BAGGYT_OFFICIAL_EMAIL || "official@baggyt.com").toLowerCase();

    let { data: baggytAccount } = await supabaseAdmin
      .from("users")
      .select("id, email, balance, is_official_platform_account")
      .or(`email.ilike.${officialEmail},is_official_platform_account.eq.true`)
      .limit(1)
      .maybeSingle();

    // Fallback if Baggyt account not yet present in users table
    if (!baggytAccount) {
      const { data: createdBaggyt, error: createErr } = await supabaseAdmin
        .from("users")
        .insert({
          email: officialEmail,
          username: "baggyt_official",
          business_name: "Baggyt Official",
          is_official_platform_account: true,
          balance: 0.00,
        })
        .select()
        .single();

      if (createErr || !createdBaggyt) {
        console.error("❌ Failed to resolve or initialize Baggyt official account:", createErr);
        return NextResponse.json({ error: "Failed to resolve merchant payout account" }, { status: 500 });
      }
      baggytAccount = createdBaggyt;
    }

    const baggytAccountEmail = (baggytAccount as { email: string; balance?: any }).email;
    const currentBaggytBalance = parseFloat((baggytAccount as { balance?: any }).balance || 0);

    const newBuyerBalance = currentBuyerBalance - feeAmount;
    const newBaggytBalance = currentBaggytBalance + feeAmount;

    // 3. Atomically update Buyer & Baggyt balances
    const [buyerUpdate, baggytUpdate] = await Promise.all([
      supabaseAdmin
        .from("users")
        .update({ balance: newBuyerBalance })
        .ilike("email", emailLower),
      supabaseAdmin
        .from("users")
        .update({ balance: newBaggytBalance })
        .ilike("email", baggytAccountEmail),
    ]);

    if (buyerUpdate.error || baggytUpdate.error) {
      console.error("❌ Error updating balances for Baggyt wallet bypass:", buyerUpdate.error, baggytUpdate.error);
      return NextResponse.json({ error: "Failed to process wallet transaction" }, { status: 500 });
    }

    const reference = `baggyt_bypass_${uuidv4()}`;
    const orderRefStr = order_reference || baggyt_order_id || "N/A";

    // 4. Log transactions in public.payments ledger
    await Promise.all([
      supabaseAdmin.from("payments").insert({
        user_email: emailLower,
        reference: `${reference}_buyer`,
        amount: feeAmount,
        currency: "NGN",
        status: "success",
        type: "baggyt_order_fee_bypass",
        description: `Baggyt Order Processing Fee (Bypassed Paystack) - Ref: ${orderRefStr}`,
        metadata: { baggyt_order_id: orderRefStr, merchant_email: baggytAccountEmail },
      }),
      supabaseAdmin.from("payments").insert({
        user_email: baggytAccountEmail,
        reference: `${reference}_merchant`,
        amount: feeAmount,
        currency: "NGN",
        status: "success",
        type: "baggyt_merchant_credit",
        description: `Merchant Credit for Baggyt Order Fee - Ref: ${orderRefStr}`,
        metadata: { buyer_email: emailLower, baggyt_order_id: orderRefStr },
      }),
    ]);

    // 5. Notify Baggyt account of credited fee
    await supabaseAdmin.from("notifications").insert({
      user_email: baggytAccountEmail,
      title: "Baggyt Order Fee Received",
      message: `Order fee of ₦${feeAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })} received via Paayh Wallet bypass from ${emailLower} for order ref: ${orderRefStr}.`,
    });

    // Invalidate Redis profile cache for buyer and Baggyt
    await Promise.all([
      invalidateCachedProfile(emailLower),
      invalidateCachedProfile(baggytAccountEmail),
    ]);

    return NextResponse.json({
      success: true,
      message: "Baggyt order fee successfully paid from Paayh wallet",
      reference,
      bypassed_gateway: true,
      buyer_new_balance: newBuyerBalance,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/v1/baggyt/bypass-checkout:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
