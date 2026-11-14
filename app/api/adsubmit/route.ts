import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import { assessAdDeliveryCapacity } from "../../../lib/ads/capacityEstimator";
import { validateAndComputeAdPricing } from "../../../lib/ads/pricingEnforcement";

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    console.log("📥 Received ad submission payload:", JSON.stringify(body, null, 2));

    const {
      adType,
      industry,
      interest,
      lifestyle,
      behavior,
      personality,
      ageRange,
      impressions,
      country,
      state,
      province,
      gender,
      employmentStatus,
      costPerImpression,
      totalCost,
      productCtaLink,
      isBidded,
      bidPrice,
      adContent,
      adMedia,
      hlsUrl,
      title
    } = body;

    const emailLower = email.toLowerCase().trim();
    const isAdmin = isAdminEmail(emailLower);

    // Verify advertiser account status and pricing country before allowing ad creation
    const { data: userProfile } = await supabaseAdmin
      .from("users")
      .select("ad_account_status, ad_ban_until, ad_ban_reason, country")
      .ilike("email", emailLower)
      .maybeSingle();
 
    if (userProfile) {
      const isRestricted =
        userProfile.ad_account_status === "perm_banned" ||
        userProfile.ad_account_status === "deactivated" ||
        (userProfile.ad_account_status === "temp_banned" &&
          userProfile.ad_ban_until &&
          new Date(userProfile.ad_ban_until) > new Date());
 
      if (isRestricted) {
        const reasonText = userProfile.ad_ban_reason ? ` (${userProfile.ad_ban_reason})` : "";
        const message =
          userProfile.ad_account_status === "temp_banned"
            ? `Your advertising access is temporarily paused${reasonText}. Please check back once the review period ends or reach out via Help Center.`
            : `Your advertising access is currently paused${reasonText}. Please contact our Help Center if you'd like to appeal or learn more.`;

        return NextResponse.json(
          {
            error: message,
            restricted: true,
            status: userProfile.ad_account_status,
          },
          { status: 403 }
        );
      }
    }

    const pricing = await validateAndComputeAdPricing(supabaseAdmin, {
      adType,
      impressions,
      costPerImpression,
      isBidded,
      bidPrice,
      clientTotalCost: totalCost,
      productCtaLink,
      userCountry: userProfile?.country,
      isAdmin,
    });

    if (!pricing.ok) {
      return NextResponse.json({ error: pricing.error }, { status: pricing.status });
    }

    if (!pricing.isAdminFreePost) {
      const capacity = await assessAdDeliveryCapacity(supabaseAdmin, {
        requestedImpressions: pricing.impressionsCount,
        userFrequencyCap: body?.userFrequencyCap ?? body?.user_frequency_cap ?? 1,
        campaignDays: body?.campaignDays ?? body?.campaign_days ?? 1,
        targetingAll: Boolean(body?.targetingAll),
        country: country || null,
        state: state || null,
        province: province || null,
        gender: gender || null,
        ageRange: ageRange || null,
        employmentStatus: employmentStatus || null,
        industry: industry || [],
        interest: interest || [],
        lifestyle: lifestyle || [],
        behavior: behavior || [],
        personality: personality || [],
        advertiserEmail: emailLower,
      });

      if (capacity.telemetryAvailable && !capacity.allowed) {
        return NextResponse.json(
          {
            error: capacity.message,
            capacityCapped: true,
            maxOrderableImpressions: capacity.maxOrderableImpressions,
          },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabaseAdmin.from("adds").insert([
      {
        user_email: emailLower,
        ad_type: pricing.adCategory,
        industry,
        interest,
        lifestyle,
        behavior,
        personality,
        age_range: ageRange,
        impressions: pricing.impressionsCount,
        country,
        state,
        province,
        gender,
        employment_status: employmentStatus,
        cost_per_impression: pricing.effectiveRate,
        cost: pricing.computedTotalCost,
        ad_content: adContent || "",
        ad_media: adMedia || null,
        hls_url: hlsUrl || null,
        title: title || null,
        created_at: new Date().toISOString()
      },
    ]).select();

    if (error) {
      console.error("❌ Supabase insert error:", JSON.stringify(error, null, 2));
      return NextResponse.json({ error: "Database insert failed: " + error.message }, { status: 500 });
    }

    console.log("✅ Ad inserted successfully for user:", emailLower);
    return NextResponse.json({ message: "Ad inserted successfully", data }, { status: 200 });
  } catch (error: any) {
    console.error("❌ Unexpected error in POST /api/adsubmit:", error);
    return NextResponse.json({ error: "Try again later" }, { status: 500 });
  }
}
