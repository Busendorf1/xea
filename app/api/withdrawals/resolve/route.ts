// app/api/withdrawals/resolve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { PayoutProvider } from "@/lib/payment/payoutProvider";
// Note: To use Paystack directly instead, import { PaystackService } from "@/lib/payment/paystack";

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { accountNumber, bankCode } = body;

    if (!accountNumber || !bankCode) {
      return NextResponse.json({ error: "accountNumber and bankCode are required" }, { status: 400 });
    }

    // Resolves bank account via active gateway (Kora by default, with Paystack fallback)
    const resolved = await PayoutProvider.resolveAccount(accountNumber, bankCode);
    return NextResponse.json(resolved);
  } catch (err: any) {
    console.error("❌ Error in POST /api/withdrawals/resolve:", err);
    return NextResponse.json({ error: err.message || "Failed to resolve account details" }, { status: 500 });
  }
}
