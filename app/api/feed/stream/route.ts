import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";

export const dynamic = "force-dynamic";

/**
 * GET /api/feed/stream
 *
 * Retired long-lived SSE stream & leaked Redis subscriber connection (C-19/C-20):
 * On Vercel Hobby (10s function cap) and Upstash Free (connection cap), persistent SSE
 * connections crash every 10s and multiply client reconnect storms. Clients use standard
 * cached GET /api/feed pagination & foreground refresh instead.
 */
export async function GET(request: NextRequest) {
  const email = await getAuthenticatedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      status: "polling",
      mode: "poll",
      pollIntervalMs: 30000,
      timestamp: Date.now(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    }
  );
}
