import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getAuthenticatedEmail } from "@/lib/authHelper";

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
      adContent,
      adMedia,
      hlsUrl,
      title
    } = body;

    const emailLower = email.toLowerCase().trim();

    const { data, error } = await supabaseAdmin.from("adds").insert([
      {
        user_email: emailLower,
        ad_type: adType,
        industry,
        interest,
        lifestyle,
        behavior,
        personality,
        age_range: ageRange,
        impressions,
        country,
        state,
        province,
        gender,
        employment_status: employmentStatus,
        cost_per_impression: costPerImpression,
        cost: totalCost,
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
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
