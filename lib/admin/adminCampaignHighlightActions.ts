import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { purgeStorageMedia } from "@/lib/utils/storageCleaner";
import {
  ALLOWED_DIRECT_HIGHLIGHT_FIELDS,
  ALLOWED_HIGHLIGHT_EDIT_FIELDS,
  invalidateAdminCampaignCache,
  pickAllowedFields,
} from "./adminCampaignShared";

export async function handleAdminHighlightCampaignAction(
  action: string,
  adminEmail: string,
  now: string,
  id?: string,
  payload?: Record<string, any>
): Promise<NextResponse> {
  if (action === "approve_highlight") {
    if (!id) return NextResponse.json({ error: "Highlight ID is required" }, { status: 400 });

    const { data: pendingHighlight, error: fetchHlErr } = await supabaseAdmin
      .from("news")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchHlErr || !pendingHighlight) {
      return NextResponse.json({ error: "Highlight not found in pending review queue" }, { status: 404 });
    }

    if (pendingHighlight.admin_statement?.startsWith("APPROVED:") || pendingHighlight.status === "approved") {
      return NextResponse.json({
        success: true,
        message: "Highlight has already been approved and is awaiting payment.",
      });
    }

    const { data: activeHl } = await supabaseAdmin
      .from("newsactive")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const isDeliveringActive = !!activeHl;
    const origDays = activeHl?.campaign_days || 1;
    const origRate = activeHl?.is_bidded && activeHl?.bid_price ? Number(activeHl.bid_price) : 1000;
    const origCost = origDays * origRate;
    const newDays = pendingHighlight.campaign_days || 1;
    const newRate = pendingHighlight.is_bidded && pendingHighlight.bid_price ? Number(pendingHighlight.bid_price) : 1000;
    const newCost = newDays * newRate;
    const isBudgetIncreased = pendingHighlight.payment_status === "unpaid" && newCost > origCost;

    if (isDeliveringActive && !isBudgetIncreased) {
      const updatedHlFields = pickAllowedFields(pendingHighlight, ALLOWED_HIGHLIGHT_EDIT_FIELDS);

      const { error: updateActiveErr } = await supabaseAdmin
        .from("newsactive")
        .update(updatedHlFields)
        .eq("id", id);

      if (updateActiveErr) throw updateActiveErr;

      await supabaseAdmin.from("news").delete().eq("id", id);

      const notifRow = {
        user_email: pendingHighlight.user_email,
        title: "Highlight Edit Live",
        message: "Your highlight edit was approved and applied to your live highlight.",
      };
      await supabaseAdmin.from("notifications").insert([notifRow]);
      const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
      dispatchNotificationWebhook(notifRow).catch(() => {});

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, pendingHighlight.user_email);
      return NextResponse.json({
        success: true,
        message: "Active highlight edit approved! Applied directly to live feed without requiring payment.",
      });
    }

    const approvedStatement = `APPROVED:${now}`;
    await supabaseAdmin
      .from("news")
      .update({
        admin_statement: approvedStatement,
        is_paused: false,
      })
      .eq("id", id);

    const notifRow = {
      user_email: pendingHighlight.user_email,
      title: "Highlight Approved",
      message: "Your highlight is approved! Complete payment in My Highlights to go live.",
    };
    await supabaseAdmin.from("notifications").insert([notifRow]);
    const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
    dispatchNotificationWebhook(notifRow).catch(() => {});

    await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, pendingHighlight.user_email);
    return NextResponse.json({ success: true, message: "Highlight approved! Advertiser has 3 days to publish and pay." });
  }

  if (action === "reject_highlight") {
    if (!id) return NextResponse.json({ error: "Highlight ID is required" }, { status: 400 });

    const { data: hlToReject } = await supabaseAdmin
      .from("news")
      .select("user_email, image_url")
      .eq("id", id)
      .maybeSingle();

    if (!hlToReject) {
      return NextResponse.json({ error: "Highlight not found" }, { status: 404 });
    }

    const feedbackReason = payload?.statement || payload?.reason || "Did not meet highlight guidelines.";
    const rejectStatement = `REJECTED:${feedbackReason}`;

    await supabaseAdmin
      .from("news")
      .update({
        admin_statement: rejectStatement,
        is_paused: true,
      })
      .eq("id", id);

    await supabaseAdmin.from("notifications").insert([
      {
        user_email: hlToReject.user_email,
        title: "Highlight Revision Requested",
        message: `Admin feedback: "${feedbackReason}". Please visit My Highlights to adjust.`,
      },
    ]);

    await invalidateAdminCampaignCache(adminEmail, action, id, feedbackReason, payload, hlToReject.user_email);
    return NextResponse.json({ success: true, message: "Feedback dropped. User can now review and adjust the highlight." });
  }

  if (action === "pause_highlight" || action === "resume_highlight") {
    if (!id) return NextResponse.json({ error: "Highlight ID is required" }, { status: 400 });

    const isPaused = action === "pause_highlight";
    const activeHlUpdate: Record<string, any> = { is_paused: isPaused };
    const pendingHlUpdate: Record<string, any> = { is_paused: isPaused };

    if (isPaused) {
      if (payload?.statement !== undefined && payload?.statement !== null) {
        const cleanStmt = String(payload.statement).trim() || null;
        activeHlUpdate.admin_statement = cleanStmt;
        pendingHlUpdate.admin_statement = cleanStmt;
      }
    } else {
      activeHlUpdate.admin_statement = null;

      const { data: existingPendingHl } = await supabaseAdmin
        .from("news")
        .select("admin_statement")
        .eq("id", id)
        .maybeSingle();

      const pendingStmt = String(existingPendingHl?.admin_statement || "").trim();
      if (
        pendingStmt &&
        !pendingStmt.startsWith("APPROVED:") &&
        !pendingStmt.startsWith("REJECTED:") &&
        !pendingStmt.toLowerCase().startsWith("status:")
      ) {
        pendingHlUpdate.admin_statement = null;
      }
    }

    const [activeHlRes, pendingHlRes] = await Promise.all([
      supabaseAdmin.from("newsactive").update(activeHlUpdate).eq("id", id).select("*").maybeSingle(),
      supabaseAdmin.from("news").update(pendingHlUpdate).eq("id", id).select("user_email").maybeSingle(),
    ]);

    const targetEmail = activeHlRes?.data?.user_email || pendingHlRes?.data?.user_email;
    await invalidateAdminCampaignCache(
      adminEmail,
      action,
      id,
      payload?.statement || payload?.reason,
      payload,
      targetEmail
    );
    return NextResponse.json({
      success: true,
      is_paused: isPaused,
      highlight: activeHlRes?.data || null,
      message: `Highlight ${isPaused ? "paused" : "resumed"} successfully.`,
    });
  }

  if (action === "delete_highlight") {
    if (!id) return NextResponse.json({ error: "Highlight ID is required" }, { status: 400 });

    const [{ data: activeHl }, { data: pendingHl }] = await Promise.all([
      supabaseAdmin.from("newsactive").select("image_url, user_email").eq("id", id).maybeSingle(),
      supabaseAdmin.from("news").select("image_url, user_email").eq("id", id).maybeSingle(),
    ]);

    const targetEmail = activeHl?.user_email || pendingHl?.user_email;
    const imgUrl = activeHl?.image_url || pendingHl?.image_url;
    if (imgUrl) {
      await purgeStorageMedia(imgUrl, "news").catch(() => {});
    }

    const [delActive, delPending] = await Promise.all([
      supabaseAdmin.from("newsactive").delete().eq("id", id),
      supabaseAdmin.from("news").delete().eq("id", id),
    ]);

    if (delActive.error && delPending.error) {
      console.error("❌ Error deleting highlight:", delActive.error, delPending.error);
      return NextResponse.json({ error: delActive.error.message || delPending.error.message }, { status: 500 });
    }

    await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, targetEmail);
    return NextResponse.json({ success: true, message: "Highlight deleted permanently." });
  }

  if (action === "save_highlight_edit") {
    if (!id || !payload) return NextResponse.json({ error: "Highlight ID and payload are required" }, { status: 400 });

    const fieldsToUpdate = pickAllowedFields(payload, ALLOWED_HIGHLIGHT_EDIT_FIELDS);
    if (Object.keys(fieldsToUpdate).length === 0) {
      return NextResponse.json({ error: "No valid editable highlight fields provided" }, { status: 400 });
    }

    const [activeRes, pendingRes] = await Promise.all([
      supabaseAdmin.from("newsactive").update(fieldsToUpdate).eq("id", id),
      supabaseAdmin.from("news").update(fieldsToUpdate).eq("id", id),
    ]);

    if (activeRes.error && pendingRes.error) {
      return NextResponse.json(
        { error: activeRes.error.message || pendingRes.error.message },
        { status: 500 }
      );
    }

    await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, fieldsToUpdate);
    return NextResponse.json({ success: true, message: "Highlight details updated successfully." });
  }

  if (action === "direct_post_highlight") {
    if (!payload) return NextResponse.json({ error: "Payload is required" }, { status: 400 });

    const cleanHighlight = pickAllowedFields(payload, ALLOWED_DIRECT_HIGHLIGHT_FIELDS);
    const highlightRecord = {
      ...cleanHighlight,
      is_paused: false,
      created_at: now,
    };

    const { error: directHlErr } = await supabaseAdmin.from("newsactive").insert([highlightRecord]);
    if (directHlErr) throw directHlErr;

    await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, cleanHighlight);
    return NextResponse.json({ success: true, message: "Highlight published directly to active feed!" });
  }

  return NextResponse.json({ error: "Unhandled highlight action" }, { status: 400 });
}
