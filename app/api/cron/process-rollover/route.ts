import { NextRequest, NextResponse } from "next/server";
import { runRolloverSweep } from "../../../../lib/services/rolloverService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const batchSize = Math.min(500, Math.max(10, parseInt(url.searchParams.get("batchSize") || "200", 10) || 200));
    const maxBatches = Math.min(25, Math.max(1, parseInt(url.searchParams.get("maxBatches") || "10", 10) || 10));

    const result = await runRolloverSweep({ batchSize, maxBatches });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("❌ Cron process-rollover failed:", err?.message || err);
    return NextResponse.json({ error: "Rollover sweep failed" }, { status: 500 });
  }
}
