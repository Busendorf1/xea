import { NextRequest, NextResponse } from "next/server";
import { GET as getMarketRates } from "@/app/api/bidding/market-rates/route";

export const dynamic = "force-dynamic";

/**
 * Alias route for /api/market-metrics -> /api/bidding/market-rates
 * Prevents 404 errors from external extensions, dashboards, or widgets polling market metrics.
 */
export async function GET(req: NextRequest) {
  return getMarketRates(req);
}
