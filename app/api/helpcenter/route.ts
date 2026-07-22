import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { helpSchema } from "@/lib/validationSchemas";

export async function POST(req: NextRequest) {
  try {
    // 1. Resolve authentication email (web session or mobile Bearer JWT)
    const authEmail = await getAuthenticatedEmail(req);

    // 2. Parse request body
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // 3. Extract submission data
    const { name, email, category, subject, message } = body;

    // 4. Determine which email to validate and associate with the ticket.
    // If user is authenticated, force using their authenticated email to prevent spoofing.
    // Otherwise, use the email provided in the body.
    const targetEmail = (authEmail || email || "").toLowerCase().trim();

    // 5. Validate the input payload
    const validationInput = {
      name: name || "",
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

    // 6. Check Rate Limit: 1 ticket every 48 hours for targetEmail
    const { data: lastTicket, error: dbError } = await supabaseAdmin
      .from("help_tickets")
      .select("created_at")
      .eq("user_email", targetEmail)
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
        const remainingMs = lastSubmitted - fortyEightHoursAgo;
        const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
        return NextResponse.json(
          { error: `You have already submitted a request recently. Please wait ${remainingHours} hours before submitting another.` },
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
