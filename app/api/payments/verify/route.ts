// app/api/payments/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { PayoutProvider } from "@/lib/payment/payoutProvider";
import { KoraService } from "@/lib/payment/kora";
import { processSuccessfulPayment } from "@/lib/payment/processPayment";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import { captureApiException } from "@/lib/logger";
import { settleWithdrawalByReference } from "@/lib/services/payoutSettlementService";

export async function GET(req: NextRequest) {
  let email: string | null = null;
  let reference: string | null = null;
  try {
    email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    reference = req.nextUrl.searchParams.get("reference");
    const paramGatewayRef = req.nextUrl.searchParams.get("gateway_reference");
    if (!reference) {
      return NextResponse.json({ error: "Reference parameter is required" }, { status: 400 });
    }

    // 1. Fetch payment from DB to make sure it belongs to the current user
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

    if (payment.user_email.toLowerCase().trim() !== email.toLowerCase().trim()) {
      return NextResponse.json({ error: "Unauthorized: Payment record owner mismatch" }, { status: 403 });
    }

    // If already marked as success (e.g. by webhook), return immediately
    if (payment.status === "success") {
      return NextResponse.json({
        success: true,
        status: "success",
        type: payment.type,
        amount: payment.amount,
        alreadyProcessed: true,
      });
    }

    // 2. Branch A: Withdrawal Verification
    if (payment.type === "withdrawal") {
      let payoutStatus = "processing";
      try {
        const payoutData = await KoraService.verifyPayout(reference);
        payoutStatus = payoutData?.status || "processing";

        if (payoutStatus === "success") {
          await settleWithdrawalByReference(reference, "success", "Verified via Kora verifyPayout", {
            gateway_status: "success",
          });

          return NextResponse.json({
            success: true,
            status: "success",
            type: "withdrawal",
            amount: payment.amount,
          });
        } else if (payoutStatus === "failed" || payoutStatus === "reversed") {
          const outcome = payoutStatus === "reversed" ? "reversed" : "failed";
          await settleWithdrawalByReference(reference, outcome, `Verified ${payoutStatus} via Kora verifyPayout`, {
            gateway_status: payoutStatus,
          });

          return NextResponse.json({
            success: false,
            status: "failed",
            message: "Withdrawal failed on payment gateway. Balance has been restored.",
          });
        }

        return NextResponse.json({
          success: false,
          status: payoutStatus,
          message: "Withdrawal is currently processing with the bank.",
        });
      } catch (err: any) {
        console.warn("⚠️ Error verifying withdrawal payout:", err);
        return NextResponse.json({
          success: false,
          status: "processing",
          message: "Withdrawal is processing.",
        });
      }
    }

    // 3. Branch B: Inbound Payment Verification (Ads, Highlights, Brand Subscriptions)
    // Use gateway reference (e.g. kora_pay_*) if available from query param, metadata, or column
    const targetGatewayRef =
      paramGatewayRef ||
      (payment.metadata?.gateway_reference as string) ||
      (payment.metadata?.kora_reference as string) ||
      (payment.gateway_reference as string) ||
      reference;
    
    let verifyResult: {
      success: boolean;
      status: string;
      amount: number;
      reference: string;
      metadata?: Record<string, unknown>;
    };

    try {
      verifyResult = await PayoutProvider.verifyPayment(targetGatewayRef);
    } catch (gatewayErr: any) {
      console.warn(`⚠️ Gateway verification check for [${targetGatewayRef}]:`, gatewayErr?.message || gatewayErr);
      return NextResponse.json({
        success: false,
        status: "pending",
        message: gatewayErr?.message || "Payment is pending verification or charge was not found.",
      }, { status: 200 });
    }

    if (!verifyResult.success) {
      if (verifyResult.status === "failed") {
        await supabaseAdmin
          .from("payments")
          .update({ status: "failed" })
          .eq("reference", reference);
      }
      return NextResponse.json({
        success: false,
        status: verifyResult.status,
        message: `Payment status on gateway is: ${verifyResult.status}`,
      });
    }

    // 3. Process the successful payment (activates ad/highlight/brand subscription)
    const metadata = {
      ...(payment.metadata || {}),
      ...(verifyResult.metadata || {}),
    };
    const processResult = await processSuccessfulPayment(reference, metadata, verifyResult.amount);

    // Invalidate user cache and statement cache
    await invalidateCachedProfile(email);

    return NextResponse.json({
      success: true,
      status: "success",
      type: payment.type,
      amount: verifyResult.amount,
      alreadyProcessed: !!processResult.alreadyProcessed,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/payments/verify:", err);
    captureApiException(err, {
      route: "GET /api/payments/verify",
      email: (typeof email !== "undefined" && email) ? email : undefined,
      reference: (typeof reference !== "undefined" && reference) ? reference : undefined,
    });
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
