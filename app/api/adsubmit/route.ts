import { NextResponse } from "next/server";
import supabase from "@/lib/utils/db";
import { auth0 } from "@/lib/auth0";

export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
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
    } = body;

    // Calculate cost
const costPerImpression = body.costPerImpression;
const totalCost = body.totalCost;

const { data, error } = await supabase.from("ads").insert([
  {
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
    impression: costPerImpression, // this is cost per impression
    cost: totalCost, // this is total cost
  },
]);

    if (error) {
      console.error("❌ Supabase insert error:", JSON.stringify(error, null, 2));
      return NextResponse.json({ error: "Database insert failed" }, { status: 500 });
    }

    console.log("✅ Ad inserted successfully:", data);
    return NextResponse.json({ message: "Ad inserted successfully", data }, { status: 200 });
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
