import { NextRequest, NextResponse } from "next/server";
import { registerReferralInvite } from "@/lib/referralEngine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { referrerCode, refereeEmail, deviceHash } = body;

    if (!referrerCode || !refereeEmail || !deviceHash) {
      return NextResponse.json(
        { error: "Missing required fields (referrerCode, refereeEmail, deviceHash)" },
        { status: 400 }
      );
    }

    // Extract client IP address for subnet rate limiting
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : req.headers.get("x-real-ip") || "127.0.0.1";

    const result = await registerReferralInvite({
      referrerCode,
      refereeEmail,
      deviceHash,
      ipAddress,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Referral invite registered successfully in pending status.",
      referrerEmail: result.referrerEmail,
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/referrals/register:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
