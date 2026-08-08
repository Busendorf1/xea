import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getAuthenticatedEmail } from "@/lib/authHelper";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username") || "";
    const cleanUsername = username.trim().toLowerCase().replace(/^@/, "");

    if (!cleanUsername || cleanUsername.length < 3) {
      return NextResponse.json(
        { available: false, message: "Username must be at least 3 characters long." },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_@.-]+$/.test(cleanUsername)) {
      return NextResponse.json(
        { available: false, message: "Username can contain letters, numbers, underscores, hyphens, periods, or email address format." },
        { status: 400 }
      );
    }

    const currentEmail = (await getAuthenticatedEmail(req)) || null;

    let query = supabaseAdmin
      .from("users")
      .select("id", { count: "exact", head: true })
      .ilike("username", cleanUsername);

    if (currentEmail) {
      query = query.neq("email", currentEmail);
    }

    const { count, error } = await query;

    if (error) {
      console.error("❌ Username check database error:", error);
      return NextResponse.json({ available: false, message: "Database query error" }, { status: 500 });
    }

    const isAvailable = count === 0;

    return NextResponse.json({
      available: isAvailable,
      username: cleanUsername,
      message: isAvailable
        ? `@${cleanUsername} is available!`
        : `@${cleanUsername} is already taken. Please choose another.`
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/profile/check-username:", err);
    return NextResponse.json({ available: false, message: "Server error" }, { status: 500 });
  }
}
