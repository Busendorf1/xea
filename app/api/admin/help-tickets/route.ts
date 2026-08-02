import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getAuthenticatedEmail } from "@/lib/authHelper";

export async function POST(req: NextRequest) {
  try {
    const authEmail = await getAuthenticatedEmail(req);

    const body = await req.json();
    const { action, ticketId, replyText } = body;

    if (!ticketId) {
      return NextResponse.json({ error: "Missing ticketId" }, { status: 400 });
    }

    if (action === "close" || action === "resolve") {
      const now = new Date().toISOString();
      const { data: ticket, error: fetchErr } = await supabaseAdmin
        .from("help_tickets")
        .select("*")
        .eq("id", ticketId)
        .single();

      if (fetchErr || !ticket) {
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      }

      const { error: updateErr } = await supabaseAdmin
        .from("help_tickets")
        .update({
          status: "closed",
          resolved_at: now,
        })
        .eq("id", ticketId);

      if (updateErr) {
        console.error("❌ Error updating ticket to closed:", updateErr);
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      // Send notification to ticket owner
      if (ticket.user_email) {
        await supabaseAdmin.from("notifications").insert({
          user_email: ticket.user_email.toLowerCase().trim(),
          title: "Support Ticket Closed",
          message: `Your help request ("${ticket.subject || "Support Request"}") has been marked as CLOSED by our Help Center team and will be automatically deleted in 24 hours.`,
        });
      }

      return NextResponse.json({ success: true, status: "closed", resolved_at: now });
    }

    if (action === "delete") {
      const { error: deleteErr } = await supabaseAdmin
        .from("help_tickets")
        .delete()
        .eq("id", ticketId);

      if (deleteErr) {
        console.error("❌ Error deleting help ticket:", deleteErr);
        return NextResponse.json({ error: deleteErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "reply") {
      if (!replyText || !replyText.trim()) {
        return NextResponse.json({ error: "Reply text is required" }, { status: 400 });
      }

      const { error: replyErr } = await supabaseAdmin
        .from("help_tickets")
        .update({
          admin_reply: replyText.trim(),
          status: "replied",
          replied_at: new Date().toISOString(),
        })
        .eq("id", ticketId);

      if (replyErr) {
        console.error("❌ Error replying to help ticket:", replyErr);
        return NextResponse.json({ error: replyErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/admin/help-tickets:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
