// app/api/payments/initialize/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { PaystackService } from "@/lib/payment/paystack";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function POST(req: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = session.user.email?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "No email associated with session" }, { status: 400 });
    }

    const body = await req.json();
    const { type, amount, metadata, callbackUrl, channels } = body;

    // Validate payment type
    if (!["ad", "highlight", "monetization_standard", "monetization_instant"].includes(type)) {
      return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
    }

    // Determine and enforce amount based on business rules
    let verifiedAmount = 0;
    if (type === "monetization_standard") {
      verifiedAmount = 28000;
    } else if (type === "monetization_instant") {
      verifiedAmount = 60000;
    } else if (type === "highlight") {
      verifiedAmount = 10000;
    } else if (type === "ad") {
      // Ads have dynamic prices. We expect the client to pass the calculated amount.
      verifiedAmount = parseFloat(amount);
      if (isNaN(verifiedAmount) || verifiedAmount <= 0) {
        return NextResponse.json({ error: "Invalid ad amount" }, { status: 400 });
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
