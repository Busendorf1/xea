import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function GET() {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = session.user.email?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "No email associated with session" }, { status: 400 });
    }

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("balance, mutual_count, mutuals, monetized, interest, suspended_until, last_mutual_spent, created_at, monetized_at, monetized_until, monetization_type")
      .ilike("email", email)
      .maybeSingle();

    if (error) {
      console.error("❌ Error fetching user profile:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(user);
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/profile:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
