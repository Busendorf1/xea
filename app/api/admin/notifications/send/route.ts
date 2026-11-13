// app/api/admin/notifications/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminUser } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { adminNotificationSchema } from "@/lib/validationSchemas";
import redisConnection from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await verifyAdminUser(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    const body = await req.json();

    // 1. Synchronous Zod Validation (Zero CPU / Zero DB overhead on invalid payload)
    const validation = adminNotificationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message || "Invalid notification payload" },
        { status: 400 }
      );
    }

    const { target, title, message, targetEmail } = validation.data;

    if (target === "user" && targetEmail) {
      const emailLower = targetEmail.toLowerCase().trim();

      // 2. High-Performance Redis Cache Lookup for User Existence (Eliminates redundant DB roundtrips)
      const cacheKey = `cache:user_exists:${emailLower}`;
      let userExists = false;

      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached === "true") {
          userExists = true;
        }
      } catch (redisErr) {
        console.warn("⚠️ Redis cache read warning:", redisErr);
      }

      if (!userExists) {
        const escapedEmail = emailLower.replace(/[%_\\]/g, "\\$&");
        const { data: dbUser, error: checkErr } = await supabaseAdmin
          .from("users")
          .select("email")
          .ilike("email", escapedEmail)
          .maybeSingle();

        if (checkErr) {
          console.error("❌ Database error checking user existence:", checkErr);
          return NextResponse.json({ error: "Internal database error" }, { status: 500 });
        }

        if (!dbUser) {
          return NextResponse.json({ error: `User with email ${targetEmail} does not exist.` }, { status: 400 });
        }

        userExists = true;
        try {
          await redisConnection.set(cacheKey, "true", "EX", 3600); // Cache for 1 hour
        } catch (redisErr) {
          console.warn("⚠️ Redis cache write warning:", redisErr);
        }
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
