import { NextRequest, NextResponse } from "next/server";
import { registerReferralInvite } from "@/lib/referralEngine";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { checkRateLimit, getTrustedClientIp } from "@/lib/edgeRateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await checkRateLimit(req, {
      limit: 10,
      windowSeconds: 300,
      identifierPrefix: "referrals_register",
    });
    if (!rateLimit.allowed && rateLimit.response) {
      return rateLimit.response;
    }

    // Security (C-17): Strictly require a verified authenticated session matching refereeEmail
    const sessionEmail = await getAuthenticatedEmail(req);
    if (!sessionEmail) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to register a referral invite." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { referrerCode, refereeEmail, deviceHash } = body;

    if (!referrerCode || !refereeEmail || !deviceHash) {
      return NextResponse.json(
        { error: "Missing required fields (referrerCode, refereeEmail, deviceHash)" },
        { status: 400 }
      );
    }

    const cleanReferee = String(refereeEmail).toLowerCase().trim();
    if (sessionEmail.toLowerCase().trim() !== cleanReferee) {
      return NextResponse.json(
        { error: "Forbidden: You can only register referrals for your own authenticated account." },
        { status: 403 }
      );
    }

    const ipAddress = getTrustedClientIp(req);

    const result = await registerReferralInvite({
      referrerCode,
      refereeEmail: cleanReferee,
      deviceHash,
      ipAddress,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Referral invite registered successfully in pending status.",
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/referrals/register:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
