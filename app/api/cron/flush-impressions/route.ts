import { NextRequest, NextResponse } from "next/server";
import { flushImpressionBuffersToDB } from "@/lib/impressionBuffer";
import { isAdminEmail } from "@/lib/adminHelper";
import { getAuthenticatedEmail } from "@/lib/authHelper";

export const dynamic = "force-dynamic";

/**
 * Scheduled/Triggered Impression Flush Endpoint.
 * Can be invoked by external schedulers (Vercel Cron, GitHub Actions, AWS EventBridge, QStash)
 * or by admin dashboard triggers to immediately flush accumulated Redis impression & click buffers to PostgreSQL.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    const isCronAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;
    let isUserAdmin = false;

    if (!isCronAuthorized) {
      const email = await getAuthenticatedEmail(request).catch(() => null);
      if (email && isAdminEmail(email)) {
        isUserAdmin = true;
      }
    }

    if (!isCronAuthorized && !isUserAdmin && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await flushImpressionBuffersToDB();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      flushedImpressions: result.flushedImpressions,
      flushedClicks: result.flushedClicks,
    });
  } catch (error: any) {
    console.error("❌ Cron flush impressions error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal error" },
      { status: 500 }
    );
  }
}
