import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import redisConnection from "@/lib/redis";
import { newsletterSchema } from "@/lib/validationSchemas";

export async function POST(req: NextRequest) {
  try {
    // 1. IP-Based Anti-Bot & Velocity Rate Limiting (Max 5 requests per 15 minutes per IP)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anonymous";
    const ipRateLimitKey = `ratelimit:newsletter_ip:${ip}`;

    try {
      const currentIpCount = await redisConnection.incr(ipRateLimitKey);
      if (currentIpCount === 1) {
        await redisConnection.expire(ipRateLimitKey, 900); // 15 Minutes TTL
      }

      if (currentIpCount > 5) {
        return NextResponse.json(
          { error: "Too many newsletter subscription requests from your IP. Please try again in 15 minutes." },
          { status: 429 }
        );
      }
    } catch (redisErr) {
      console.warn("⚠️ Newsletter Redis IP rate limit warning:", redisErr);
    }

    // 2. Parse & Validate Payload using Zod
    const body = await req.json().catch(() => ({}));
    const parseResult = newsletterSchema.safeParse(body);

    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues[0]?.message || "Invalid email input.";
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const cleanEmail = parseResult.data.email;

    // 3. Authenticated User Lifetime Limit Check (Max 3 emails per account lifetime)
    const authUserEmail = (await getAuthenticatedEmail(req)) || null;
    const cleanUserEmail = authUserEmail ? authUserEmail.toLowerCase().trim() : null;

    if (cleanUserEmail) {
      const { count, error: countErr } = await supabaseAdmin
        .from("newsletter_subscribers")
        .select("id", { count: "exact", head: true })
        .ilike("added_by_user", cleanUserEmail);

      if (!countErr && count !== null && count >= 3) {
        return NextResponse.json(
          { error: "You have reached the maximum account limit of 3 newsletter email subscriptions per account lifetime." },
          { status: 400 }
        );
      }
    }

    // 4. Insert Subscriber Record
    const { error: insertErr } = await supabaseAdmin.from("newsletter_subscribers").insert({
      email: cleanEmail,
      added_by_user: cleanUserEmail,
    });

    if (insertErr) {
      // Duplicate email check
      if (
        insertErr.code === "23505" ||
        insertErr.message?.includes("already exists") ||
        insertErr.message?.includes("unique constraint")
      ) {
        return NextResponse.json({
          success: true,
          message: "You are already subscribed to our newsletter updates!",
        });
      }
      console.error("❌ Error inserting newsletter subscriber:", insertErr.message);
      return NextResponse.json({ error: "Failed to process subscription. Please try again." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Thank you for subscribing to Paayh newsletter updates!",
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/newsletter/subscribe:", err);
    return NextResponse.json({ error: "Server error. Please try again later." }, { status: 500 });
  }
}
