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
      .ilike("email", emailLower)
      .maybeSingle();

    if (uErr || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Auto-generate referral code if missing
    let refCode = user.referral_code;
    if (!refCode) {
      const crypto = await import("crypto");
      refCode = crypto.randomBytes(4).toString("hex").toUpperCase();
      await supabaseAdmin.from("users").update({ referral_code: refCode }).ilike("email", emailLower);
    }

    // 2. Fetch referral breakdown list (scrub referee_email PII from selection & payload)
    const { data: referralsList } = await supabaseReadOnly
      .from("referrals")
      .select("id, status, interactions_count, created_at, qualified_at")
      .ilike("referrer_email", emailLower)
      .order("created_at", { ascending: false })
      .limit(100);

    const activeReferrals = (referralsList || []).filter((r: any) => {
      const status = String(r?.status || "").toLowerCase().trim();
      const optOut = String(r?.opt_out_status || "").toLowerCase().trim();
      return (
        r?.is_opted_out !== true &&
        status !== "opted_out" &&
        optOut !== "accepted" &&
        optOut !== "forced"
      );
    });

    const sanitizedReferrals = activeReferrals.map((r: any) => ({
      id: r.id,
      status: r.status,
      interactions_count: r.interactions_count ?? 0,
      created_at: r.created_at,
      qualified_at: r.qualified_at ?? null,
    }));

    const qualifiedCount = user.referral_downloads_count ?? 0;
    const clicksCount = user.monetization_clicks ?? 0;
    const { tier, holdingLimit, level } = calculateAtwTier(clicksCount);

    return NextResponse.json({
      success: true,
      referralCode: refCode,
      referralLink: `https://xea.app/join?ref=${refCode}`,
      qualifiedCount,
      pendingCount: sanitizedReferrals.filter((r) => r.status === "pending").length,
      totalInvites: sanitizedReferrals.length,
      atwTier: user.atw_tier || tier,
      atwLevel: level,
      holdingLimit,
      referrals: sanitizedReferrals,
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/referrals:", err);
    return NextResponse.json({ error: "Try again later" }, { status: 500 });
  }
}
