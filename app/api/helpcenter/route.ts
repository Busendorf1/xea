import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { helpSchema } from "@/lib/validationSchemas";

export async function POST(req: NextRequest) {
  try {
    // 1. Require authenticated session (prevents unauthenticated spoofing & 48h rate-limit DoS)
    const authEmail = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!authEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const targetEmail = authEmail.toLowerCase().trim();

    // 2. Parse request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // 3. Extract submission data (account identity is strictly derived from authenticated session)
    const { name, category, subject, message } = body || {};

    // 4. Validate the input payload
    const validationInput = {
      name: typeof name === "string" ? name : "",
      email: targetEmail,
      category,
      subject,
      message,
    };

    const result = helpSchema.safeParse(validationInput);
    if (!result.success) {
      // Return first validation error message
      const firstError = result.error.issues[0]?.message || "Invalid input data";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    // 5. Check Rate Limit: 1 ticket every 48 hours for authenticated account
    const { data: lastTicket, error: dbError } = await supabaseAdmin
      .from("help_tickets")
      .select("created_at")
      .ilike("user_email", targetEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dbError) {
      console.error("❌ Database error checking rate limit:", dbError);
      return NextResponse.json({ error: "Service temporarily unavailable. Please try again later." }, { status: 500 });
    }

    if (lastTicket) {
      const lastSubmitted = new Date(lastTicket.created_at).getTime();
      const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
      if (lastSubmitted > fortyEightHoursAgo) {
        return NextResponse.json(
          { error: "Limit reached, try again later." },
          { status: 429 }
        );
      }
    }

    // 7. Insert the new ticket
    const { error: insertError } = await supabaseAdmin
      .from("help_tickets")
      .insert([
        {
          user_email: targetEmail,
          name: (name || "").trim(),
          category,
          subject: subject.trim(),
          message: message.trim(),
          status: "open",
        },
      ]);

    if (insertError) {
      console.error("❌ Database error inserting help ticket:", insertError);
      return NextResponse.json({ error: "Failed to submit request. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/helpcenter:", err);
    return NextResponse.json({ error: "Try again later" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authEmail = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!authEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cleanEmail = authEmail.toLowerCase().trim();
    const { data, error } = await supabaseAdmin
      .from("help_tickets")
      .select("*")
      .ilike("user_email", cleanEmail)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Database error fetching help tickets:", error);
      return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
    }

    return NextResponse.json({ success: true, tickets: data || [] });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/helpcenter:", err);
    return NextResponse.json({ error: "Try again later" }, { status: 500 });
  }
}
