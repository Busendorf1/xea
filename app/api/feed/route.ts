import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import crypto from "crypto";

const SECRET_KEY = process.env.AUTH0_SECRET || "BhrjJEt523QxdiWWsOI73y5hJyVQkqlGoIp08xPUJBxlkoJ5q0ELp75RsmxfOF3S";

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await auth0.getSession();

    // Call Supabase RPC get_user_feed using admin key with 15 ads batch limit (scaling optimization)
    const { data: ads, error } = await supabaseReadOnly.rpc("get_user_feed", {
      p_user_email: email,
      p_limit: 15,
      p_offset: 0
    });

    if (error) {
      console.error("❌ RPC get_user_feed error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const servedAt = Date.now();
    const userId = session?.user?.sub || email;
    const now = new Date();

    const activeAds: any[] = [];

    (ads || []).forEach((ad: any) => {
      if (ad.completed_at) return;

      const isPlatformAd = !ad.cost_per_impression || Number(ad.cost_per_impression) === 0;
      if (isPlatformAd && ad.created_at && ad.campaign_days) {
        const createdAt = new Date(ad.created_at);
        const diffTime = now.getTime() - createdAt.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        if (diffDays > ad.campaign_days) {
          return; // Exclude from feed (database archiving is handled by hourly cron)
        }
      }
      activeAds.push(ad);
    });

    // Sign each active ad in memory and prune unnecessary targeting fields
    const signedAds = activeAds.map((ad: any) => {
      const payload = `${ad.id}:${userId}:${servedAt}`;
      const token = crypto.createHmac("sha256", SECRET_KEY).update(payload).digest("hex");
      return {
        id: ad.id,
        ad_type: ad.ad_type || null,
        product_name: ad.product_name || null,
        product_price: ad.product_price || null,
        product_cta_type: ad.product_cta_type || null,
        product_cta_link: ad.product_cta_link || null,
        ad_content: ad.ad_content || "",
        ad_media: ad.ad_media || null,
        action_phone: ad.action_phone || null,
        action_email: ad.action_email || null,
        action_website: ad.action_website || null,
        action_whatsapp: ad.action_whatsapp || null,
        display_mutual_button: ad.display_mutual_button === true,
        mutual_targets: ad.mutual_targets || [],
        user_email: ad.user_email || null,
        verification_token: token,
        served_at: servedAt,
        created_at: ad.created_at || null,
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
      const { data: profiles, error: profilesError } = await supabaseReadOnly
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
