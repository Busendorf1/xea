import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { cleanupExpiredApprovedCampaigns } from "@/lib/services/cleanupService";
import { invalidateCachedUserCampaigns } from "@/lib/utils/cache";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();

    // Run self-healing background cleanup
    cleanupExpiredApprovedCampaigns().catch(() => {});

    // Check advertiser account status
    const { data: userProfile } = await supabaseAdmin
      .from("users")
      .select("ad_account_status, ad_ban_until, ad_ban_reason")
      .ilike("email", emailLower)
      .maybeSingle();

    if (userProfile) {
      const isRestricted =
        userProfile.ad_account_status === "perm_banned" ||
        userProfile.ad_account_status === "deactivated" ||
        (userProfile.ad_account_status === "temp_banned" &&
          userProfile.ad_ban_until &&
          new Date(userProfile.ad_ban_until) > new Date());

      if (isRestricted) {
        const reasonText = userProfile.ad_ban_reason ? ` (${userProfile.ad_ban_reason})` : "";
        return NextResponse.json(
          {
            error: `Your advertising access is currently restricted${reasonText}. Please contact our Help Center.`,
          },
          { status: 403 }
        );
      }
    }

    const body = await req.json();
    const { highlightData, editingId } = body;

    if (!highlightData) {
      return NextResponse.json({ error: "Missing highlight data." }, { status: 400 });
    }

    // Enforce 2-Campaign Approved Payment Limit
    // Count highlights approved by admin for payment, excluding newly submitted highlights still awaiting review
    if (!editingId) {
      const { data: userPendingNews, error: pendingErr } = await supabaseAdmin
        .from("news")
        .select("id, admin_statement")
        .eq("user_email", emailLower);

      if (!pendingErr && userPendingNews) {
        const approvedUnpaidCount = userPendingNews.filter((hl) => {
          if (hl.admin_statement?.startsWith("APPROVED:")) {
            const parts = hl.admin_statement.split("APPROVED:");
            if (parts[1]) {
              const approvedTime = new Date(parts[1]).getTime();
              if (!isNaN(approvedTime) && Date.now() - approvedTime > 72 * 60 * 60 * 1000) {
                return false; // Expired approved highlight waiting to be purged
              }
            }
            return true;
          }
          return false;
        }).length;

        if (approvedUnpaidCount >= 2) {
          return NextResponse.json(
            {
              error:
                "You have reached the limit of 2 approved highlights awaiting payment. Please make payment or delete an existing approved highlight in My Ads before submitting another.",
              limitReached: true,
              pendingCount: approvedUnpaidCount,
            },
            { status: 400 }
          );
        }
      }
    }

    const isBidded = !!highlightData.isBidded;
    const bidPrice = highlightData.bidPrice ? parseFloat(highlightData.bidPrice) : null;
    const campaignDays = Math.max(1, Math.min(90, Number(highlightData.campaignDays || 1)));
    const finalImageUrl = highlightData.image_url || highlightData.imageUrl;

    const rawScheduledStart = highlightData.scheduledStartAt || highlightData.scheduled_start_at || null;
    let parsedScheduledStart: string | null = null;
    if (rawScheduledStart && typeof rawScheduledStart === "string" && rawScheduledStart !== "immediate") {
      const dt = new Date(rawScheduledStart);
      if (!isNaN(dt.getTime())) {
        parsedScheduledStart = dt.toISOString();
      }
    }

    if (!finalImageUrl) {
      return NextResponse.json({ error: "Highlight cover image is required." }, { status: 400 });
    }

    const { isAdminEmail } = await import("@/lib/authHelper");
    const isAdmin = isAdminEmail(emailLower);

    if (editingId) {
      // Check ownership across BOTH newsactive and news BEFORE modifying (prevents IDOR)
      const [{ data: activeHl }, { data: draftHl }] = await Promise.all([
        supabaseAdmin
          .from("newsactive")
          .select("id, user_email, campaign_days, bid_price, is_bidded")
          .eq("id", editingId)
          .maybeSingle(),
        supabaseAdmin
          .from("news")
          .select("id, user_email")
          .eq("id", editingId)
          .maybeSingle(),
      ]);

      const existingOwner = activeHl?.user_email || draftHl?.user_email || null;
      if (!activeHl && !draftHl) {
        return NextResponse.json({ error: "Highlight not found." }, { status: 404 });
      }
      if (existingOwner && String(existingOwner).toLowerCase().trim() !== emailLower && !isAdmin) {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to edit this highlight." },
          { status: 403 }
        );
      }

      const isDeliveringActive = !!activeHl;
      let isBudgetIncreased = false;
      if (activeHl) {
        const origDays = activeHl.campaign_days || 1;
        const origRate = activeHl.is_bidded && activeHl.bid_price ? Number(activeHl.bid_price) : 1000;
        const origCost = origDays * origRate;
        const newCost = campaignDays * (isBidded && bidPrice ? bidPrice : 1000);
        isBudgetIncreased = newCost > origCost;
      }

      // Upsert into news scoped to owner email so existing drafts cannot be hijacked
      const ownerEmailForUpdate = existingOwner ? String(existingOwner).toLowerCase().trim() : emailLower;
      const baseHighlightRow = {
        id: editingId,
        title: highlightData.title,
        content: highlightData.content,
        image_url: finalImageUrl,
        interest: highlightData.interest,
        country: highlightData.country || null,
        state: highlightData.state || null,
        province: highlightData.province || null,
        campaign_days: campaignDays,
        is_bidded: isBidded,
        bid_price: bidPrice,
        custom_sponsor_name: highlightData.customSponsorName || null,
        custom_sponsor_handle: highlightData.customSponsorHandle || null,
        admin_statement: "Status: Pending review",
        user_email: ownerEmailForUpdate,
        is_admin_post: isAdmin,
        is_paused: false,
      };

      if (draftHl) {
        let query = supabaseAdmin
          .from("news")
          .update({
            ...baseHighlightRow,
            is_ai_content: !!highlightData.isAiContent,
            status: "pending_review",
            approved_at: null,
            payment_status: isDeliveringActive && !isBudgetIncreased ? "paid" : "unpaid",
            ...(parsedScheduledStart ? { scheduled_start_at: parsedScheduledStart } : {}),
          })
          .eq("id", editingId);
        if (!isAdmin) {
          query = query.eq("user_email", emailLower);
        }
        const { error: updErr } = await query;
        if (updErr) {
          let fbQuery = supabaseAdmin.from("news").update(baseHighlightRow).eq("id", editingId);
          if (!isAdmin) fbQuery = fbQuery.eq("user_email", emailLower);
          const { error: fallbackErr } = await fbQuery;
          if (fallbackErr) throw fallbackErr;
        }
      } else {
        const { error: insErr } = await supabaseAdmin.from("news").insert({
          ...baseHighlightRow,
          is_ai_content: !!highlightData.isAiContent,
          status: "pending_review",
          approved_at: null,
          payment_status: isDeliveringActive && !isBudgetIncreased ? "paid" : "unpaid",
          ...(parsedScheduledStart ? { scheduled_start_at: parsedScheduledStart } : {}),
        });
        if (insErr) {
          const { error: fallbackErr } = await supabaseAdmin.from("news").insert(baseHighlightRow);
          if (fallbackErr) throw fallbackErr;
        }
      }

      if (!isDeliveringActive) {
        let delQuery = supabaseAdmin.from("newsactive").delete().eq("id", editingId);
        if (!isAdmin) delQuery = delQuery.eq("user_email", emailLower);
        await delQuery;
      }

      const notifRow = {
        user_email: emailLower,
        title: "Highlight In Review",
        message: `Your updated highlight "${highlightData.title}" is in review.`,
      };
      await supabaseAdmin.from("notifications").insert([notifRow]);
      const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
      dispatchNotificationWebhook(notifRow).catch(() => {});

      await invalidateCachedUserCampaigns(emailLower);
      return NextResponse.json({
        success: true,
        message: "Highlight updated and placed in review.",
        highlightId: editingId,
        status: "pending_review",
        admin_statement: "Status: Pending review",
      });
    }

    const baseInsertRow: Record<string, any> = {
      title: highlightData.title,
      content: highlightData.content,
      image_url: finalImageUrl,
      interest: highlightData.interest,
      country: highlightData.country || null,
      state: highlightData.state || null,
      province: highlightData.province || null,
      campaign_days: campaignDays,
      is_bidded: isBidded,
      bid_price: bidPrice,
      custom_sponsor_name: highlightData.customSponsorName || null,
      custom_sponsor_handle: highlightData.customSponsorHandle || null,
      user_email: emailLower,
      is_admin_post: false,
      is_ai_content: !!highlightData.isAiContent,
      admin_statement: "Status: Pending review",
      is_paused: false,
    };

    let { data: inserted, error: insertErr } = await supabaseAdmin
      .from("news")
      .insert([
        {
          ...baseInsertRow,
          ...(parsedScheduledStart ? { scheduled_start_at: parsedScheduledStart } : {}),
        },
      ])
      .select("id")
      .single();

    if (insertErr && parsedScheduledStart) {
      const fbInsert = await supabaseAdmin
        .from("news")
        .insert([baseInsertRow])
        .select("id")
        .single();
      inserted = fbInsert.data;
      insertErr = fbInsert.error;
    }

    if (insertErr) throw insertErr;

    if (inserted?.id) {
      await supabaseAdmin.from("newsactive").delete().eq("id", inserted.id);
    }

    const notifRow = {
      user_email: emailLower,
      title: "Highlight Submitted",
      message: `"${highlightData.title}" is in review. Pay in My Highlights once approved.`,
    };
    await supabaseAdmin.from("notifications").insert([notifRow]);
    const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
    dispatchNotificationWebhook(notifRow).catch(() => {});

    await invalidateCachedUserCampaigns(emailLower);

    return NextResponse.json({
      success: true,
      message: "Highlight submitted for review. Once approved, pay in My Highlights to go live.",
      highlightId: inserted?.id,
      status: "pending_review",
      admin_statement: "Status: Pending review",
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/highlights/submit:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
