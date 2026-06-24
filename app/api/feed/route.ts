import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import crypto from "crypto";

const SECRET_KEY = process.env.AUTH0_SECRET || "BhrjJEt523QxdiWWsOI73y5hJyVQkqlGoIp08xPUJBxlkoJ5q0ELp75RsmxfOF3S";

export async function GET() {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = session.user.email?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "No email associated with session" }, { status: 400 });
    }

    // Call Supabase RPC get_user_feed using admin key
    const { data: ads, error } = await supabaseAdmin.rpc("get_user_feed", {
      p_user_email: email,
      p_limit: 100,
      p_offset: 0
    });

    if (error) {
      console.error("❌ RPC get_user_feed error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const servedAt = Date.now();
    const userId = session.user.sub || email;

    // Sign each ad in memory
    const signedAds = (ads || []).map((ad: any) => {
      const payload = `${ad.id}:${userId}:${servedAt}`;
      const token = crypto.createHmac("sha256", SECRET_KEY).update(payload).digest("hex");
      return {
        ...ad,
        verification_token: token,
        served_at: servedAt,
      };
    });

    // Shuffle candidate ads in memory to resolve random() DB bottleneck
    const shuffled = signedAds.sort(() => 0.5 - Math.random());

    // Extract publisher emails to fetch basic profile info server-side
    const publisherEmails = Array.from(
      new Set((ads || []).map((ad: any) => ad.user_email).filter(Boolean))
    ) as string[];

    const profilesMap: Record<string, { business_name?: string; firstName?: string; profileImage?: string }> = {};

    if (publisherEmails.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("users")
        .select('email, business_name, "firstName", "profileImage"')
        .in("email", publisherEmails);

      if (!profilesError && profiles) {
        profiles.forEach((p: any) => {
          if (p.email) {
            profilesMap[p.email.toLowerCase()] = {
              business_name: p.business_name || "",
              firstName: p.firstName || "",
              profileImage: p.profileImage || ""
            };
          }
        });
      }
    }

    return NextResponse.json({ ads: shuffled, profiles: profilesMap });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/feed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
