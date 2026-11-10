import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { isAdminEmail } from "@/lib/adminHelper";
import { campaignsQueue } from "@/lib/queue";

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type, payload } = body;

    if (!type || !payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Missing type or payload" }, { status: 400 });
    }

    if (type !== "ad" && type !== "highlight") {
      return NextResponse.json({ error: "Invalid type. Must be 'ad' or 'highlight'" }, { status: 400 });
    }

    // Force lower case email validation
    const cleanEmail = email.toLowerCase().trim();
    payload.user_email = cleanEmail;

    // Security Hardening: Prevent unprivileged users from injecting admin flags or pre-filled metrics
    const userIsAdmin = isAdminEmail(cleanEmail);
    if (!userIsAdmin) {
      payload.is_admin_post = false;
      payload.status = "pending";
      payload.payment_status = "pending";
      delete payload.approved;
      delete payload.approved_at;
      delete payload.impression_count;
      delete payload.impressions_delivered;
      delete payload.clicks_count;
    } else {
      payload.is_admin_post = Boolean(payload.is_admin_post);
    }

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
