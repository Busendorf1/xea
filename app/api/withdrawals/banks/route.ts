// app/api/withdrawals/banks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PayoutProvider } from "@/lib/payment/payoutProvider";
import { checkRateLimit } from "@/lib/edgeRateLimit";

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(req, {
      limit: 60,
      windowSeconds: 60,
      identifierPrefix: "withdrawals_banks",
    });
    if (!rl.allowed && rl.response) {
      return rl.response;
    }

    const banks = await PayoutProvider.listBanks();
    return NextResponse.json(banks, {
      headers: {
        // Shield Supabase/Payment Gateway egress via Vercel Edge CDN (banks rarely change)
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        "CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err: any) {
    console.error("Error in GET /api/withdrawals/banks:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
