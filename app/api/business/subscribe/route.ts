import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";

// Zod Schema for Business Subscription Request Validation
const businessSubscribeSchema = z.object({
  business_name: z
    .string()
    .trim()
    .min(2, { message: "Business name must be at least 2 characters long." })
    .max(100, { message: "Business name is too long." }),
  domain: z
    .string()
    .trim()
    .min(3, { message: "Domain name is required." })
    .max(150, { message: "Domain name is too long." }),
  contact_email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: "Please provide a valid contact email address." })
    .optional()
    .nullable(),
  duration_months: z
    .number()
    .optional()
    .default(1),
});

const businessQuerySchema = z.object({
  domain: z.string().trim().toLowerCase().max(150).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const authEmail = await getAuthenticatedEmail(req);
    const rawBody = await req.json().catch(() => ({}));

    // Parse & Validate payload via Zod
    const parseResult = businessSubscribeSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues[0]?.message || "Invalid input parameters.";
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const { business_name, domain, contact_email, duration_months } = parseResult.data;

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

    const months = [1, 3, 6].includes(Number(duration_months)) ? Number(duration_months) : 1;
    const monthlyRate = 45000;
    const totalPrice = months * monthlyRate;

    // Clean domain (e.g. https://www.mystore.ng/path -> mystore.ng)
    let cleanDomain = domain.trim().toLowerCase();
    cleanDomain = cleanDomain.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].split("?")[0];

    if (!cleanDomain || !cleanDomain.includes(".")) {
      return NextResponse.json({ error: "Please enter a valid domain format (e.g., mystore.com)." }, { status: 400 });
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
    const rawDomain = searchParams.get("domain");

    const queryResult = businessQuerySchema.safeParse({ domain: rawDomain });
    const queryDomain = queryResult.success ? queryResult.data.domain : null;

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
