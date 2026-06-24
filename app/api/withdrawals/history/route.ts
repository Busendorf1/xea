// app/api/withdrawals/history/route.ts
import { NextRequest, NextResponse } from "next/server";
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

    // Fetch user withdrawals ordered by created_at desc
    const { data: withdrawals, error } = await supabaseAdmin
      .from("payments")
      .select("*")
      .ilike("user_email", email)
      .eq("type", "withdrawal")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Error fetching withdrawal history:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(withdrawals);
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/withdrawals/history:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
