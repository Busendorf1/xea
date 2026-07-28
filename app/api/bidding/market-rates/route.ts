import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

// Standard Industry Floor Rates (in NGN)
const INDUSTRY_FLOOR_RATES: Record<string, number> = {
  politics: 1500,
  business: 45,
  government: 2000,
  individual: 25,
  religion: 1500,
  product_sales: 55,
};

const CACHE_TTL_SECONDS = 10; // 10s Redis caching for high scalability

export async function GET(req: NextRequest) {
  try {
    const cacheKey = "attention:market_rates";

    // 1. Try to fetch from Redis Cache for sub-millisecond response
    try {
      const cached = await redisConnection.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached), {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
          },
        });
      }
    } catch (err) {
      console.warn("⚠️ Redis read error in market-rates, falling back to DB:", err);
    }

    // 2. Query Supabase RPC get_industry_attention_prices
    const { data: dbRates, error } = await supabaseReadOnly.rpc("get_industry_attention_prices");

    let result: Record<string, { floorPrice: number; highestBid: number; totalBids: number }> = {};

    if (error || !dbRates || dbRates.length === 0) {
      console.warn("⚠️ RPC get_industry_attention_prices fallback to defaults:", error?.message);
      // Fallback response using baseline floor rates
      Object.entries(INDUSTRY_FLOOR_RATES).forEach(([ind, floor]) => {
        result[ind] = {
          floorPrice: floor,
          highestBid: floor,
          totalBids: 0,
        };
      });
    } else {
      dbRates.forEach((row: any) => {
        const indKey = (row.industry_name || "").toLowerCase();
        result[indKey] = {
          floorPrice: Number(row.floor_price || INDUSTRY_FLOOR_RATES[indKey] || 45),
          highestBid: Number(row.highest_bid || row.floor_price || INDUSTRY_FLOOR_RATES[indKey] || 45),
          totalBids: Number(row.total_active_bids || 0),
        };
      });

      // Fill in missing default industries if any
      Object.entries(INDUSTRY_FLOOR_RATES).forEach(([ind, floor]) => {
        if (!result[ind]) {
          result[ind] = {
            floorPrice: floor,
            highestBid: floor,
            totalBids: 0,
          };
        }
      });
    }

    const payload = {
      success: true,
      timestamp: Date.now(),
      marketRates: result,
    };

    // Cache in Redis asynchronously
    redisConnection.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL_SECONDS).catch((err) => {
      console.warn("⚠️ Redis cache set error in market-rates:", err);
    });

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
      },
    });
  } catch (error: any) {
    console.error("❌ Error fetching market rates:", error);
    return NextResponse.json({ error: "Failed to fetch market rates" }, { status: 500 });
  }
}
