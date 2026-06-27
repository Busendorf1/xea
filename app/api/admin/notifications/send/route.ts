// app/api/admin/notifications/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import supabaseAdmin from "@/lib/utils/dbAdmin";

// Admin email whitelist logic
const getAdminEmails = (): string[] => {
  const defaultAdmins = ["admin@xea.com", "nonsom019@gmail.com", "nonsom2023@gmail.com"];
  const envAdmins = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
    : [];
  return envAdmins.length > 0 ? envAdmins : defaultAdmins;
};

// Middleware-like verification helper
async function verifyAdmin() {
  const session = await auth0.getSession();
  if (!session || !session.user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), email: null };
  }

  const email = session.user.email?.toLowerCase();
  if (!email) {
    return { errorResponse: NextResponse.json({ error: "No email associated with session" }, { status: 400 }), email: null };
  }

  const adminEmails = getAdminEmails();
  if (!adminEmails.includes(email)) {
    return { errorResponse: NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 }), email };
  }

  return { errorResponse: null, email };
}

export async function POST(req: NextRequest) {
  const { errorResponse } = await verifyAdmin();
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const { target, title, message, targetEmail } = body;

    if (!target || !title || !message) {
      return NextResponse.json({ error: "target, title, and message are required" }, { status: 400 });
    }

    if (target === "user" && !targetEmail) {
      return NextResponse.json({ error: "targetEmail is required when target is user" }, { status: 400 });
    }

    if (!["all", "monetized", "user"].includes(target)) {
      return NextResponse.json({ error: "Invalid target. Must be 'all', 'monetized', or 'user'" }, { status: 400 });
    }

    if (target === "user") {
      const emailLower = targetEmail.toLowerCase().trim();

      // Check if user exists
      const { data: userExists, error: checkErr } = await supabaseAdmin
        .from("users")
        .select("email")
        .ilike("email", emailLower)
        .maybeSingle();

      if (checkErr) {
        console.error("❌ Database error checking user existence:", checkErr);
        return NextResponse.json({ error: "Internal database error" }, { status: 500 });
      }

      if (!userExists) {
        return NextResponse.json({ error: `User with email ${targetEmail} does not exist.` }, { status: 400 });
      }

      // Insert private notification
      const { error: insertErr } = await supabaseAdmin.from("notifications").insert({
        user_email: emailLower,
        title,
        message,
      });

      if (insertErr) {
        console.error("❌ Error inserting private notification:", insertErr);
        return NextResponse.json({ error: "Failed to send private notification" }, { status: 500 });
      }
    } else {
      // Broadcast announcement (single row insertion)
      const { error: insertErr } = await supabaseAdmin.from("global_announcements").insert({
        title,
        message,
        target, // 'all' or 'monetized'
      });

      if (insertErr) {
        console.error("❌ Error inserting global announcement:", insertErr);
        return NextResponse.json({ error: "Failed to broadcast announcement" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: "Announcement processed successfully." });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/admin/notifications/send:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
