import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { campaignsQueue } from "@/lib/queue";

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type, payload } = body;

    if (!type || !payload) {
      return NextResponse.json({ error: "Missing type or payload" }, { status: 400 });
    }

    if (type !== "ad" && type !== "highlight") {
      return NextResponse.json({ error: "Invalid type. Must be 'ad' or 'highlight'" }, { status: 400 });
    }

    // Force lower case email validation
    payload.user_email = email.toLowerCase().trim();

    // Enqueue the creation request
    await campaignsQueue.add(`create-${type}`, {
      type,
      payload
    });

    return NextResponse.json({ success: true, queued: true });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/campaigns/create:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
