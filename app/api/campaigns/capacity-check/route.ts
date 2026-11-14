import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { checkRateLimit } from "@/lib/edgeRateLimit";
import { assessAdDeliveryCapacity } from "@/lib/ads/capacityEstimator";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rateLimit = await checkRateLimit(req, {
    limit: 15,
    windowSeconds: 60,
    identifierPrefix: "ad_capacity_check",
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const email = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const emailLower = email.toLowerCase().trim();
    const isAdmin = isAdminEmail(emailLower);

    if (isAdmin && body?.bypassForAdmin === true) {
      return NextResponse.json({
        telemetryAvailable: true,
        allowed: true,
        status: "optimal",
        requestedImpressions: Number(body?.impressions || 0),
        maxOrderableImpressions: 5_000_000,
        strictTierImpressions: 5_000_000,
        broadeningApplied: false,
        message: "Admin delivery capacity verified.",
      });
    }

    const assessment = await assessAdDeliveryCapacity(supabaseAdmin, {
      requestedImpressions: Number(body?.impressions || body?.requestedImpressions || 0),
      userFrequencyCap: body?.userFrequencyCap ?? body?.user_frequency_cap ?? 1,
      campaignDays: body?.campaignDays ?? body?.campaign_days ?? 1,
      targetingAll: Boolean(body?.targetingAll ?? body?.targeting_all),
      country: body?.country ?? null,
      state: body?.state ?? null,
      province: body?.province ?? null,
      gender: body?.gender ?? null,
      ageRange: body?.ageRange ?? body?.age_range ?? null,
      employmentStatus: body?.employmentStatus ?? body?.employment_status ?? null,
      industry: body?.industry ?? null,
      interest: body?.interest ?? null,
      lifestyle: body?.lifestyle ?? null,
      behavior: body?.behavior ?? null,
      personality: body?.personality ?? null,
      advertiserEmail: emailLower,
    });

    return NextResponse.json(assessment);
  } catch (err: any) {
    console.error("❌ Error in POST /api/campaigns/capacity-check:", err);
    return NextResponse.json(
      { error: "Unable to verify delivery capacity." },
      { status: 500 }
    );
  }
}
