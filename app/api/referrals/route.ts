import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { calculateAtwTier } from "@/lib/referralEngine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();

    // 1. Fetch user referral stats
    const { data: user, error: uErr } = await supabaseReadOnly
      .from("users")
      .select("referral_code, referral_downloads_count, monetization_clicks, atw_tier")
      .eq("email", emailLower)
      .maybeSingle();

    if (uErr || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Auto-generate referral code if missing
    let refCode = user.referral_code;
    if (!refCode) {
      const crypto = await import("crypto");
      refCode = crypto.randomBytes(4).toString("hex").toUpperCase();
      await supabaseAdmin.from("users").update({ referral_code: refCode }).eq("email", emailLower);
    }

    // 2. Fetch referral breakdown list
    const { data: referralsList, error: refErr } = await supabaseReadOnly
      .from("referrals")
      .select("id, referee_email, status, interactions_count, created_at, qualified_at")
      .eq("referrer_email", emailLower)
      .order("created_at", { ascending: false })
      .limit(100);

    const qualifiedCount = user.referral_downloads_count ?? 0;
    const clicksCount = user.monetization_clicks ?? 0;
    const { tier, holdingLimit, level } = calculateAtwTier(clicksCount, qualifiedCount);

    return NextResponse.json({
      success: true,
      referralCode: refCode,
      referralLink: `https://xea.app/join?ref=${refCode}`,
      qualifiedCount,
      pendingCount: (referralsList || []).filter((r) => r.status === "pending").length,
      totalInvites: referralsList?.length || 0,
      atwTier: user.atw_tier || tier,
      atwLevel: level,
      holdingLimit,
      referrals: referralsList || [],
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/referrals:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
