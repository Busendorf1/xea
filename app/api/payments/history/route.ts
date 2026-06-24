// app/api/payments/history/route.ts
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

    // Fetch user payments ordered by created_at desc
    const { data: payments, error } = await supabaseAdmin
      .from("payments")
      .select("*")
      .ilike("user_email", email)
      .not("type", "eq", "withdrawal") // Filter out withdrawals since they go to withdrawals history
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Error fetching payment history:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(payments);
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/payments/history:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
