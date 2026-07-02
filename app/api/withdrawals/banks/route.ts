// app/api/withdrawals/banks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { PaystackService } from "@/lib/payment/paystack";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const banks = await PaystackService.listBanks();
    return NextResponse.json(banks);
  } catch (err: any) {
    console.error("❌ Error in GET /api/withdrawals/banks:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
