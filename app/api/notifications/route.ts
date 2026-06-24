// app/api/notifications/route.ts
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

    // Fetch user notifications ordered by created_at desc
    const { data: notifications, error } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .ilike("user_email", email)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Error fetching notifications:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(notifications);
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/notifications:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
    const { notificationId, all } = body;

    let query = supabaseAdmin
      .from("notifications")
      .update({ read: true });

    if (all) {
      query = query.ilike("user_email", email);
    } else if (notificationId) {
      query = query.eq("id", notificationId).ilike("user_email", email);
    } else {
      return NextResponse.json({ error: "Missing notificationId or all parameters" }, { status: 400 });
    }

    const { data, error } = await query.select();

    if (error) {
      console.error("❌ Error updating notifications:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data?.length || 0 });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/notifications:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
