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

    // 1. Fetch user's signup date and monetization status
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("created_at, monetized")
      .ilike("email", email)
      .maybeSingle();

    if (userErr || !user) {
      console.error("❌ Error fetching user info for notifications:", userErr);
      return NextResponse.json({ error: "Failed to load user info" }, { status: 500 });
    }

    const userSignupDate = user.created_at;
    const isMonetized = user.monetized === "yes" || user.monetized === true;

    // 2. Fetch private notifications
    const { data: privateNotifications, error: privErr } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .ilike("user_email", email);

    if (privErr) {
      console.error("❌ Error fetching private notifications:", privErr);
      return NextResponse.json({ error: privErr.message }, { status: 500 });
    }

    // 3. Fetch active global announcements
    let announcementQuery = supabaseAdmin
      .from("global_announcements")
      .select("*")
      .gte("created_at", userSignupDate); // Only fetch announcements made since user registered

    if (isMonetized) {
      announcementQuery = announcementQuery.in("target", ["all", "monetized"]);
    } else {
      announcementQuery = announcementQuery.eq("target", "all");
    }

    const { data: globalAnnouncements, error: annErr } = await announcementQuery;

    if (annErr) {
      console.error("❌ Error fetching global announcements:", annErr);
      return NextResponse.json({ error: annErr.message }, { status: 500 });
    }

    // 4. Fetch user's read announcements logs
    const { data: readLogs, error: logErr } = await supabaseAdmin
      .from("read_announcements")
      .select("announcement_id")
      .ilike("user_email", email);

    if (logErr) {
      console.error("❌ Error fetching read announcements logs:", logErr);
      return NextResponse.json({ error: logErr.message }, { status: 500 });
    }

    const readAnnIds = new Set(readLogs?.map((log) => log.announcement_id) || []);

    // 5. Merge and format results
    const formattedPrivate = (privateNotifications || []).map((n) => ({
      id: n.id,
      user_email: n.user_email,
      title: n.title,
      message: n.message,
      read: n.read,
      created_at: n.created_at,
      is_global: false,
    }));

    const formattedGlobal = (globalAnnouncements || []).map((ga) => ({
      id: ga.id,
      user_email: email,
      title: ga.title,
      message: ga.message,
      read: readAnnIds.has(ga.id),
      created_at: ga.created_at,
      is_global: true,
    }));

    const merged = [...formattedPrivate, ...formattedGlobal].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json(merged);
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

    if (all) {
      // 1. Mark all private notifications as read
      await supabaseAdmin
        .from("notifications")
        .update({ read: true })
        .ilike("user_email", email);

      // 2. Fetch all active announcements to write to read logs
      const { data: user } = await supabaseAdmin
        .from("users")
        .select("created_at, monetized")
        .ilike("email", email)
        .maybeSingle();

      if (user) {
        const userSignupDate = user.created_at;
        const isMonetized = user.monetized === "yes" || user.monetized === true;

        let annQuery = supabaseAdmin
          .from("global_announcements")
          .select("id")
          .gte("created_at", userSignupDate);

        if (isMonetized) {
          annQuery = annQuery.in("target", ["all", "monetized"]);
        } else {
          annQuery = annQuery.eq("target", "all");
        }

        const { data: activeAnns } = await annQuery;

        if (activeAnns && activeAnns.length > 0) {
          const upsertPayload = activeAnns.map((a) => ({
            user_email: email,
            announcement_id: a.id,
          }));

          await supabaseAdmin
            .from("read_announcements")
            .upsert(upsertPayload, { onConflict: "user_email,announcement_id" });
        }
      }

      return NextResponse.json({ success: true, message: "All notifications marked as read." });
    } else if (notificationId) {
      // Check if it's a global announcement
      const { data: isGlobal } = await supabaseAdmin
        .from("global_announcements")
        .select("id")
        .eq("id", notificationId)
        .maybeSingle();

      if (isGlobal) {
        // Log in read_announcements table
        await supabaseAdmin
          .from("read_announcements")
          .upsert(
            { user_email: email, announcement_id: notificationId },
            { onConflict: "user_email,announcement_id" }
          );
      } else {
        // Mark private notification as read
        await supabaseAdmin
          .from("notifications")
          .update({ read: true })
          .eq("id", notificationId)
          .ilike("user_email", email);
      }

      return NextResponse.json({ success: true, message: "Notification marked as read." });
    } else {
      return NextResponse.json({ error: "Missing notificationId or all parameters" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/notifications:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
