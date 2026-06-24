// app/api/withdrawals/resolve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { PaystackService } from "@/lib/payment/paystack";

export async function POST(req: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { accountNumber, bankCode } = body;

    if (!accountNumber || !bankCode) {
      return NextResponse.json({ error: "accountNumber and bankCode are required" }, { status: 400 });
    }

    const resolved = await PaystackService.resolveAccount(accountNumber, bankCode);
    return NextResponse.json(resolved);
  } catch (err: any) {
    console.error("❌ Error in POST /api/withdrawals/resolve:", err);
    return NextResponse.json({ error: err.message || "Failed to resolve account details" }, { status: 500 });
  }
}
