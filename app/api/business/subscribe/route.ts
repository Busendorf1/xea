import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

export async function POST(req: NextRequest) {
  try {
    const authEmail = await getAuthenticatedEmail(req);
    const body = await req.json();
    const { business_name, domain, contact_email, duration_months = 1 } = body;

    // Enforce 3 Submissions Per Day Rate Limit
    const userEmail = authEmail ? authEmail.toLowerCase().trim() : (contact_email ? contact_email.toLowerCase().trim() : null);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous_ip";
    const userIdentifier = userEmail ? `email_${userEmail}` : `ip_${ip}`;

    const rateLimitKey = `ratelimit:business_subscribe:${userIdentifier}`;
    try {
      const currentCount = await redisConnection.incr(rateLimitKey);
      if (currentCount === 1) {
        await redisConnection.expire(rateLimitKey, 86400); // 24 Hours TTL
      }
      if (currentCount > 3) {
        console.warn(`⚠️ Business Subscribe Rate Limit Exceeded for ${userIdentifier}: ${currentCount} attempts in 24h.`);
        return NextResponse.json(
          { error: "Daily limit reached. You can only submit up to 3 business applications per day." },
          { status: 429 }
        );
      }
    } catch (redisErr) {
      console.warn("⚠️ Business subscribe rate limit Redis check warning:", redisErr);
    }

    if (!business_name || !domain) {
      return NextResponse.json({ error: "Business name and domain are required" }, { status: 400 });
    }

    const months = [1, 3, 6].includes(Number(duration_months)) ? Number(duration_months) : 1;
    const monthlyRate = 45000;
    const totalPrice = months * monthlyRate;

    // Clean domain (e.g. https://www.mystore.ng/path -> mystore.ng)
    let cleanDomain = domain.trim().toLowerCase();
    cleanDomain = cleanDomain.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].split("?")[0];

    if (!cleanDomain || !cleanDomain.includes(".")) {
      return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
    }

    const emailToUse = authEmail || contact_email || null;

    const { data: existing } = await supabaseAdmin
      .from("premium_subscribers")
      .select("id, domain, status")
      .eq("domain", cleanDomain)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        message: `Domain Application Submitted! Your application for ${cleanDomain} has been received. Our team will review your business and contact you if deemed eligible. Response might take awhile.`,
        subscriber: existing,
      });
    }

    const { data: newSub, error: insertErr } = await supabaseAdmin
      .from("premium_subscribers")
      .insert({
        business_name: business_name.trim(),
        domain: cleanDomain,
        discount_percentage: 30.00,
        status: "active",
        contact_email: emailToUse,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("❌ Error registering premium subscriber:", insertErr);
      return NextResponse.json({ error: "Failed to submit domain application" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Domain Application Submitted! Your application for ${cleanDomain} has been received. Our team will review your business and contact you if deemed eligible. Response might take awhile.`,
      subscriber: newSub,
      total_price: totalPrice,
      duration_months: months,
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/business/subscribe:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryDomain = searchParams.get("domain");

    if (queryDomain) {
      let cleanDomain = queryDomain.trim().toLowerCase();
      cleanDomain = cleanDomain.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].split("?")[0];

      const { data: sub } = await supabaseAdmin
        .from("premium_subscribers")
        .select("domain, discount_percentage, status, business_name")
        .eq("domain", cleanDomain)
        .eq("status", "active")
        .maybeSingle();

      return NextResponse.json({
        is_subscriber: !!sub,
        discount_percentage: sub ? Number(sub.discount_percentage) : 0,
        business_name: sub?.business_name || null,
      });
    }

    const { data: subscribers } = await supabaseAdmin
      .from("premium_subscribers")
      .select("id, business_name, domain, discount_percentage, status, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    return NextResponse.json({ subscribers: subscribers || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
