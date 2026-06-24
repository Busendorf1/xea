import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import supabaseAdmin from "@/lib/utils/dbAdmin";

export async function POST(req: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = session.user.email?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "No email associated with session" }, { status: 400 });
    }

    const body = await req.json();
    const { type } = body;

    if (!type || (type !== "instant" && type !== "cancel")) {
      return NextResponse.json({ error: "Invalid monetization type" }, { status: 400 });
    }

    // Call database RPC activate_monetization using service_role bypass
    const { data, error } = await supabaseAdmin.rpc("activate_monetization", {
      p_email: email,
      p_type: type
    });

    if (error) {
      console.error("❌ RPC activate_monetization error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, result: data });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/monetize:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
