// app/api/withdrawals/banks/route.ts
import { NextResponse } from "next/server";
import { PayoutProvider } from "@/lib/payment/payoutProvider";
// Note: To use Paystack directly instead, import { PaystackService } from "@/lib/payment/paystack";

export async function GET() {
  try {
    const banks = await PayoutProvider.listBanks();
    return NextResponse.json(banks);
  } catch (err: any) {
    console.error("Error in GET /api/withdrawals/banks:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
