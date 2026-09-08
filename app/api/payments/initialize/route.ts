// app/api/payments/initialize/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { PaystackService } from "@/lib/payment/paystack";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type, amount, metadata, callbackUrl, channels } = body;

    // Validate payment type (Only Ad & Highlight campaigns)
    if (!["ad", "highlight"].includes(type)) {
      return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
    }

    const { isAdminEmail } = await import("@/lib/authHelper");
    const isAdmin = isAdminEmail(email);
    if (isAdmin && (type === "ad" || type === "highlight")) {
      return NextResponse.json({
        status: true,
        data: {
          authorization_url: `${callbackUrl || "/user/statement"}?admin_free=true`,
          reference: `ADMIN_FREE_${Date.now()}`,
        },
      });
    }

    // Verify advertiser account status before initializing external payment
    if (!isAdmin) {
      const { data: userRecord } = await supabaseAdmin
        .from("users")
        .select("ad_account_status, ad_ban_until, ad_ban_reason")
        .ilike("email", email)
        .maybeSingle();

      if (userRecord) {
        const isRestricted =
          userRecord.ad_account_status === "perm_banned" ||
          userRecord.ad_account_status === "deactivated" ||
          (userRecord.ad_account_status === "temp_banned" &&
            userRecord.ad_ban_until &&
            new Date(userRecord.ad_ban_until) > new Date());

        if (isRestricted) {
          const reasonText = userRecord.ad_ban_reason ? ` (${userRecord.ad_ban_reason})` : "";
          const message =
            userRecord.ad_account_status === "temp_banned"
              ? `Your advertising access is temporarily paused${reasonText}. Please check back once the review period ends or reach out via Help Center.`
              : `Your advertising access is currently paused${reasonText}. Please contact our Help Center if you'd like to appeal or learn more.`;

          return NextResponse.json({ error: message, restricted: true }, { status: 403 });
        }
      }
    }

    // Determine and enforce amount based on business rules
    let verifiedAmount = 0;
    if (type === "highlight") {
      const days = parseInt(metadata?.campaign_days || 1, 10);
      const isBidded = !!metadata?.is_bidded;
      const bidPrice = metadata?.bid_price ? parseFloat(metadata.bid_price) : 1000;
      verifiedAmount = isBidded ? bidPrice * Math.min(5, Math.max(1, days)) : 1000 * Math.min(5, Math.max(1, days));

      // Enforce 1 Edit per 24 Hours Rate Limit for Advertisers if editing
      const editingId = metadata?.editingId;
      if (editingId) {
        const editLimitKey = `ratelimit:edit_highlight:${editingId}`;
        const isEditLimited = await redisConnection.get(editLimitKey).catch(() => null);
        if (isEditLimited) {
          return NextResponse.json({ error: "Limit reached, try again later." }, { status: 429 });
        }
        await redisConnection.set(editLimitKey, "1", "EX", 86400).catch(() => {});
      }
    } else if (type === "ad") {
      // Ads have dynamic prices. We expect the client to pass the calculated amount.
      verifiedAmount = parseFloat(amount);
      if (isNaN(verifiedAmount) || verifiedAmount <= 0) {
        return NextResponse.json({ error: "Invalid ad amount" }, { status: 400 });
      }

      // Enforce 1 Edit per 24 Hours Rate Limit for Advertisers
      const adId = metadata?.adData?.id;
      if (adId) {
        const { data: existingAd } = await supabaseAdmin.from("adds").select("id").eq("id", adId).maybeSingle();
        const { data: existingActiveAd } = await supabaseAdmin.from("addsactive").select("id").eq("id", adId).maybeSingle();
        if (existingAd || existingActiveAd) {
          const editLimitKey = `ratelimit:edit_ad:${adId}`;
          const isEditLimited = await redisConnection.get(editLimitKey).catch(() => null);
          if (isEditLimited) {
            return NextResponse.json({
              error: "Limit reached, try again later."
            }, { status: 429 });
          }
          await redisConnection.set(editLimitKey, "1", "EX", 86400).catch(() => {});
        }
      }
    }

    const paystackMetadata = {
      type,
      user_email: email,
      ...(metadata || {}),
    };

    // Initialize with Paystack
    const paystackData = await PaystackService.initializeTransaction(
      email,
      verifiedAmount,
      callbackUrl || `${req.nextUrl.origin}/user/statement`,
      paystackMetadata,
      channels
    );

    // Insert pending payment record
    const { error: insertError } = await supabaseAdmin.from("payments").insert({
      user_email: email,
      reference: paystackData.reference,
      amount: verifiedAmount,
      status: "pending",
      type,
      description: `Payment for ${type.replace("_", " ")}`,
      metadata: paystackMetadata,
    });

    if (insertError) {
      console.error("❌ Error inserting payment record:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      authorization_url: paystackData.authorization_url,
      reference: paystackData.reference,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/payments/initialize:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
