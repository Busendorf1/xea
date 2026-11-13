import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { purgeStorageMedia } from "@/lib/utils/storageCleaner";
import { dispatchFeedDropWebhook } from "@/lib/webhookDispatcher";
import {
  ALLOWED_AD_EDIT_FIELDS,
  ALLOWED_DIRECT_AD_FIELDS,
  invalidateAdminCampaignCache,
  pickAllowedFields,
} from "./adminCampaignShared";

export async function handleAdminAdCampaignAction(
  action: string,
  adminEmail: string,
  now: string,
  id?: string,
  payload?: Record<string, any>
): Promise<NextResponse> {
  if (action === "approve_ad") {
    if (!id) return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });

    const { data: pendingAd, error: fetchErr } = await supabaseAdmin
      .from("adds")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !pendingAd) {
      return NextResponse.json({ error: "Ad not found in pending review queue" }, { status: 404 });
    }

    if (pendingAd.admin_statement?.startsWith("APPROVED:") || pendingAd.status === "approved") {
      return NextResponse.json({
        success: true,
        message: "Ad campaign has already been approved and is awaiting payment.",
      });
    }

    const { data: activeAd } = await supabaseAdmin
      .from("addsactive")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const isDeliveringActive = !!activeAd;
    const isBudgetIncreased =
      pendingAd.payment_status === "unpaid" &&
      Number(pendingAd.total_cost || 0) > Number(activeAd?.total_cost || 0);

    if (isDeliveringActive && !isBudgetIncreased) {
      const updatedFields = pickAllowedFields(pendingAd, ALLOWED_AD_EDIT_FIELDS);
      const { error: updateActiveErr } = await supabaseAdmin
        .from("addsactive")
        .update(updatedFields)
        .eq("id", id);

      if (updateActiveErr) throw updateActiveErr;

      await supabaseAdmin.from("adds").delete().eq("id", id);

      const notifRow = {
        user_email: pendingAd.user_email,
        title: "Ad Edit Live",
        message: "Your ad edit was approved and applied to your live campaign.",
      };
      await supabaseAdmin.from("notifications").insert([notifRow]);
      const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
      dispatchNotificationWebhook(notifRow).catch(() => {});

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, pendingAd.user_email);
      return NextResponse.json({
        success: true,
        message: "Active ad edit approved! Applied directly to live campaign without requiring payment.",
      });
    }

    const approvedStatement = `APPROVED:${now}`;
    await supabaseAdmin
      .from("adds")
      .update({
        admin_statement: approvedStatement,
        is_paused: false,
      })
      .eq("id", id);

    const notifRow = {
      user_email: pendingAd.user_email,
      title: "Ad Approved",
      message: "Your ad is approved! Complete payment in My Ads within 3 days to go live.",
    };
    await supabaseAdmin.from("notifications").insert([notifRow]);
    const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
    dispatchNotificationWebhook(notifRow).catch(() => {});

    await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, pendingAd.user_email);
    return NextResponse.json({
      success: true,
      message: "Ad campaign approved! Advertiser has 3 days to publish and pay.",
    });
  }

  if (action === "reject_ad") {
    if (!id) return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });

    const { data: adToReject } = await supabaseAdmin
      .from("adds")
      .select("user_email, total_cost, ad_media, ad_media_url")
      .eq("id", id)
      .maybeSingle();

    if (!adToReject) {
      return NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }

    const feedbackReason = payload?.statement || payload?.reason || "Did not meet advertising guidelines.";
    const rejectStatement = `REJECTED:${feedbackReason}`;

    await supabaseAdmin
      .from("adds")
      .update({
        admin_statement: rejectStatement,
        is_paused: true,
      })
      .eq("id", id);

    await supabaseAdmin.from("notifications").insert([
      {
        user_email: adToReject.user_email,
        title: "Ad Revision Requested",
        message: `Admin feedback: "${feedbackReason}". Please visit My Ads to edit and re-submit your campaign.`,
      },
    ]);

    await invalidateAdminCampaignCache(adminEmail, action, id, feedbackReason, payload, adToReject.user_email);
    return NextResponse.json({ success: true, message: "Feedback dropped. Advertiser can now review and adjust the campaign." });
  }

  if (action === "pause_ad" || action === "resume_ad") {
    if (!id) return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });

    const isPaused = action === "pause_ad";
    const activeUpdateData: Record<string, any> = { is_paused: isPaused };
    const pendingUpdateData: Record<string, any> = { is_paused: isPaused };

    if (isPaused) {
      if (payload?.statement !== undefined && payload?.statement !== null) {
        const cleanStmt = String(payload.statement).trim() || null;
        activeUpdateData.admin_statement = cleanStmt;
        pendingUpdateData.admin_statement = cleanStmt;
      }
    } else {
      activeUpdateData.admin_statement = null;

      const { data: existingPending } = await supabaseAdmin
        .from("adds")
        .select("admin_statement")
        .eq("id", id)
        .maybeSingle();

      const pendingStmt = String(existingPending?.admin_statement || "").trim();
      if (
        pendingStmt &&
        !pendingStmt.startsWith("APPROVED:") &&
        !pendingStmt.startsWith("REJECTED:") &&
        !pendingStmt.toLowerCase().startsWith("status:")
      ) {
        pendingUpdateData.admin_statement = null;
      }
    }

    const [activeRes, pendingRes] = await Promise.all([
      supabaseAdmin.from("addsactive").update(activeUpdateData).eq("id", id).select("*").maybeSingle(),
      supabaseAdmin.from("adds").update(pendingUpdateData).eq("id", id).select("user_email").maybeSingle(),
    ]);

    if (!isPaused && activeRes?.data) {
      dispatchFeedDropWebhook(activeRes.data).catch(() => {});
    }

    const targetEmail = activeRes?.data?.user_email || pendingRes?.data?.user_email;
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
      ad: activeRes?.data || null,
      message: `Ad campaign ${isPaused ? "paused" : "resumed"} successfully.`,
    });
  }

  if (action === "deactivate_ad") {
    if (!id) return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });

    const updateData: Record<string, any> = {
      completed_at: now,
      is_paused: true,
    };
    if (payload?.statement) {
      updateData.admin_statement = String(payload.statement);
    }

    await Promise.all([
      supabaseAdmin.from("addsactive").update(updateData).eq("id", id),
      supabaseAdmin.from("adds").update(updateData).eq("id", id),
    ]);

    await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload);
    return NextResponse.json({ success: true, message: "Ad campaign deactivated successfully." });
  }

  if (action === "delete_ad") {
    if (!id) return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });

    const [{ data: activeAd }, { data: pendingAd }] = await Promise.all([
      supabaseAdmin.from("addsactive").select("ad_media, ad_media_url, user_email").eq("id", id).maybeSingle(),
      supabaseAdmin.from("adds").select("ad_media, ad_media_url, user_email").eq("id", id).maybeSingle(),
    ]);

    const targetEmail = activeAd?.user_email || pendingAd?.user_email;
    const mediaUrls = activeAd?.ad_media || activeAd?.ad_media_url || pendingAd?.ad_media || pendingAd?.ad_media_url;
    if (mediaUrls) {
      await purgeStorageMedia(mediaUrls, "ad-media").catch(() => {});
    }

    await Promise.allSettled([
      supabaseAdmin.from("bidded_ads").delete().eq("ad_id", id),
      supabaseAdmin.from("ad_reports").delete().eq("ad_id", id),
      supabaseAdmin.from("blocked_ads").delete().eq("ad_id", id),
      supabaseAdmin.from("completed_ads").delete().eq("id", id),
    ]);

    const [delActive, delPending] = await Promise.all([
      supabaseAdmin.from("addsactive").delete().eq("id", id),
      supabaseAdmin.from("adds").delete().eq("id", id),
    ]);

    if (delActive.error && delPending.error) {
      console.error("❌ Error deleting ad:", delActive.error, delPending.error);
      return NextResponse.json({ error: delActive.error.message || delPending.error.message }, { status: 500 });
    }

    await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, targetEmail);
    return NextResponse.json({ success: true, message: "Ad campaign deleted permanently." });
  }

  if (action === "save_ad_edit") {
    if (!id || !payload) return NextResponse.json({ error: "Ad ID and payload are required" }, { status: 400 });

    const fieldsToUpdate = pickAllowedFields(payload, ALLOWED_AD_EDIT_FIELDS);
    if (Object.keys(fieldsToUpdate).length === 0) {
      return NextResponse.json({ error: "No valid editable ad fields provided" }, { status: 400 });
    }

    const [activeRes, pendingRes] = await Promise.all([
      supabaseAdmin.from("addsactive").update(fieldsToUpdate).eq("id", id),
      supabaseAdmin.from("adds").update(fieldsToUpdate).eq("id", id),
    ]);

    if (activeRes.error && pendingRes.error) {
      return NextResponse.json(
        { error: activeRes.error.message || pendingRes.error.message },
        { status: 500 }
      );
    }

    await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, fieldsToUpdate);
    return NextResponse.json({ success: true, message: "Ad details updated successfully." });
  }

  if (action === "direct_post_ad") {
    if (!payload) return NextResponse.json({ error: "Payload is required" }, { status: 400 });

    const cleanAd = pickAllowedFields(payload, ALLOWED_DIRECT_AD_FIELDS);
    const adRecord = {
      ...cleanAd,
      cost_per_impression: 0,
      total_cost: 0,
      impression_count: 0,
      seen_users: [],
      is_paused: false,
      is_admin_post: true,
      created_at: now,
    };

    const { data: insertedRows, error: directAdErr } = await supabaseAdmin
      .from("addsactive")
      .insert([adRecord])
      .select("*");
    if (directAdErr) throw directAdErr;

    const publishedAd = insertedRows?.[0] || adRecord;
    dispatchFeedDropWebhook(publishedAd).catch(() => {});

    await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, cleanAd);
    return NextResponse.json({ success: true, message: "Ad published directly to active feed!" });
  }

  return NextResponse.json({ error: "Unhandled ad action" }, { status: 400 });
}
