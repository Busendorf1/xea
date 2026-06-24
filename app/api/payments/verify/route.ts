// app/api/payments/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { PaystackService } from "@/lib/payment/paystack";
import { processSuccessfulPayment } from "@/lib/payment/processPayment";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function GET(req: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const reference = req.nextUrl.searchParams.get("reference");
    if (!reference) {
      return NextResponse.json({ error: "Reference parameter is required" }, { status: 400 });
    }

    // 1. Fetch payment from DB to make sure it belongs to the current user
    const email = session.user.email?.toLowerCase();
    const { data: payment, error: dbError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();

    if (dbError) {
      console.error("❌ Error fetching payment for verification:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    if (!payment) {
      return NextResponse.json({ error: "Payment record not found" }, { status: 404 });
    }

    if (payment.user_email.toLowerCase() !== email) {
      return NextResponse.json({ error: "Unauthorized: Payment record owner mismatch" }, { status: 403 });
    }

    // 2. Verify with Paystack
    const paystackResult = await PaystackService.verifyTransaction(reference);

    if (paystackResult.status !== "success") {
      // Update local record to failed if Paystack says it failed
      if (paystackResult.status === "failed") {
        await supabaseAdmin
          .from("payments")
          .update({ status: "failed" })
          .eq("reference", reference);
      }
      return NextResponse.json({
        success: false,
        status: paystackResult.status,
        message: paystackResult.gateway_response,
      });
    }

    // 3. Process the successful payment
    const metadata = payment.metadata || paystackResult.metadata;
    const processResult = await processSuccessfulPayment(reference, metadata, paystackResult.amount / 100);

    return NextResponse.json({
      success: true,
      status: "success",
      alreadyProcessed: !!processResult.alreadyProcessed,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/payments/verify:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
