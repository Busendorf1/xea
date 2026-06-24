// app/api/withdrawals/banks/route.ts
import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { PaystackService } from "@/lib/payment/paystack";

export async function GET() {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const banks = await PaystackService.listBanks();
    return NextResponse.json(banks);
  } catch (err: any) {
    console.error("❌ Error in GET /api/withdrawals/banks:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
