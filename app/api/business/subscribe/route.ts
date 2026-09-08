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
});

const businessQuerySchema = z.object({
  domain: z.string().trim().toLowerCase().max(150).optional().nullable(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
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

    const { business_name, domain, contact_email } = parseResult.data;

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

    // Clean domain (e.g. https://www.mystore.ng/path -> mystore.ng)
    let cleanDomain = domain.trim().toLowerCase();
    cleanDomain = cleanDomain.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].split("?")[0];

    if (!cleanDomain || !cleanDomain.includes(".")) {
      return NextResponse.json({ error: "Please enter a valid domain format (e.g., mystore.com)." }, { status: 400 });
    }

    const emailToUse = authEmail || contact_email || null;

    // Resolve user country to determine pricing (150,000 NGN vs $100 USD)
    let isNigeria = true;
    if (emailToUse) {
      const { data: userProfile } = await supabaseAdmin
        .from("users")
        .select("country")
        .ilike("email", emailToUse)
        .maybeSingle();

      if (userProfile?.country) {
        const c = userProfile.country.toLowerCase().trim();
        isNigeria = c === "nigeria" || c === "ng" || c === "ngn";
      }
    }

    const amount = isNigeria ? 150000 : 100;
    const currency = isNigeria ? "NGN" : "USD";

    // Check if domain already exists in system
    const { data: existing } = await supabaseAdmin
      .from("premium_subscribers")
      .select("*")
      .eq("domain", cleanDomain)
      .maybeSingle();

    if (existing) {
      if (existing.status === "active") {
        return NextResponse.json({
          success: true,
          message: `The domain ${cleanDomain} is already an active verified Premium Subscriber brand.`,
          subscriber: existing,
        });
      }

      if (existing.status === "approved" && existing.payment_status !== "paid") {
        return NextResponse.json({
          success: true,
          message: `Your application for ${cleanDomain} has already been approved! You can complete payment to activate your 30% discount subsidy.`,
          subscriber: existing,
        });
      }

      if (existing.status === "pending") {
        return NextResponse.json({
          success: true,
          message: `Your application for ${cleanDomain} is currently under review by our administrators. You will be able to complete payment once approved.`,
          subscriber: existing,
        });
      }

      // If previously rejected, update and re-submit for review
      if (existing.status === "rejected") {
        const { data: updatedSub, error: updateErr } = await supabaseAdmin
          .from("premium_subscribers")
          .update({
            business_name: business_name.trim(),
            status: "pending",
            payment_status: "unpaid",
            amount,
            currency,
            user_email: emailToUse,
            contact_email: contact_email || emailToUse,
            rejection_reason: null,
            created_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (updateErr) {
          console.error("❌ Error updating rejected subscriber application:", updateErr);
          return NextResponse.json({ error: "Failed to re-submit application" }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: `Application Re-submitted! Your application for ${cleanDomain} has been submitted for admin approval. Once approved, you can complete payment of ${currency === "NGN" ? "₦" + amount.toLocaleString() : "$" + amount} to activate.`,
          subscriber: updatedSub,
        });
      }
    }

    // Insert new application with 'pending' status awaiting admin approval
    const { data: newSub, error: insertErr } = await supabaseAdmin
      .from("premium_subscribers")
      .insert({
        business_name: business_name.trim(),
        domain: cleanDomain,
        discount_percentage: 30.00,
        status: "pending",
        payment_status: "unpaid",
        amount,
        currency,
        user_email: emailToUse,
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
      message: `Domain Application Submitted! Your application for ${cleanDomain} has been received for admin review. Once approved, you can complete payment of ${currency === "NGN" ? "₦" + amount.toLocaleString() : "$" + amount} to activate your 30% discount subsidy.`,
      subscriber: newSub,
      amount,
      currency,
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
    const rawEmail = searchParams.get("email");

    const queryResult = businessQuerySchema.safeParse({
      domain: rawDomain,
      email: rawEmail,
    });
    
    const queryDomain = queryResult.success ? queryResult.data.domain : null;
    const queryEmail = queryResult.success ? queryResult.data.email : null;

    // 1. If email is queried, fetch user's brand subscription standing
    if (queryEmail) {
      const cleanEmail = queryEmail.trim().toLowerCase();
      const { data: sub } = await supabaseAdmin
        .from("premium_subscribers")
        .select("id, business_name, domain, discount_percentage, status, payment_status, amount, currency, contact_email, user_email, rejection_reason, created_at, paid_at")
        .or(`user_email.ilike.${cleanEmail},contact_email.ilike.${cleanEmail}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return NextResponse.json({ subscriber: sub || null });
    }

    // 2. If domain is queried, check Redis cache first for sub-millisecond lookup at scale
    if (queryDomain) {
      let cleanDomain = queryDomain.trim().toLowerCase();
      cleanDomain = cleanDomain.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].split("?")[0];

      const cacheKey = `cache:domain_subscriber:${cleanDomain}`;
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          return NextResponse.json(parsed);
        }
      } catch (redisErr) {
        // Fall through to DB on redis error
      }

      const { data: sub } = await supabaseAdmin
        .from("premium_subscribers")
        .select("domain, discount_percentage, status, business_name, payment_status")
        .eq("domain", cleanDomain)
        .eq("status", "active")
        .maybeSingle();

      const isPaidAndActive = !!sub && sub.status === "active" && (sub.payment_status === "paid" || cleanDomain === "baggyt.com");

      const responsePayload = {
        is_subscriber: isPaidAndActive,
        discount_percentage: isPaidAndActive ? Number(sub?.discount_percentage || 30) : 0,
        business_name: isPaidAndActive ? (sub?.business_name || null) : null,
      };

      try {
        await redisConnection.set(cacheKey, JSON.stringify(responsePayload), "EX", 600);
      } catch (e) {}

      return NextResponse.json(responsePayload);
    }

    // 3. Fallback: list active verified & paid subscribers
    const { data: subscribers } = await supabaseAdmin
      .from("premium_subscribers")
      .select("id, business_name, domain, discount_percentage, status, payment_status, created_at")
      .eq("status", "active")
      .or("payment_status.eq.paid,domain.eq.baggyt.com")
      .order("created_at", { ascending: false });

    return NextResponse.json({ subscribers: subscribers || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
