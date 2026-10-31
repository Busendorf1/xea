import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { cleanupExpiredApprovedCampaigns } from "@/lib/services/cleanupService";
import { invalidateCachedUserCampaigns } from "@/lib/utils/cache";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
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

    // Enforce 2-Campaign Pending Limit
    if (!editingId) {
      const { data: userPendingNews, error: pendingErr } = await supabaseAdmin
        .from("news")
        .select("id, admin_statement")
        .eq("user_email", emailLower);

      if (!pendingErr && userPendingNews) {
        const pendingCount = userPendingNews.filter((hl) => {
          if (hl.admin_statement?.startsWith("REJECTED:")) return false;
          if (hl.admin_statement?.startsWith("APPROVED:")) {
            const parts = hl.admin_statement.split("APPROVED:");
            if (parts[1]) {
              const approvedTime = new Date(parts[1]).getTime();
              if (!isNaN(approvedTime) && Date.now() - approvedTime > 72 * 60 * 60 * 1000) {
                return false; // Expired approved highlight waiting to be purged
              }
            }
          }
          if (!hl.admin_statement) return true;
          if (hl.admin_statement.startsWith("Status: Pending review")) return true;
          if (hl.admin_statement.startsWith("APPROVED:")) return true;
          return false;
        }).length;

        if (pendingCount >= 2) {
          return NextResponse.json(
            {
              error:
                "You have reached the limit of 2 highlights awaiting review or publication. Please publish or delete an existing highlight before submitting another.",
              limitReached: true,
              pendingCount,
            },
            { status: 400 }
          );
        }
      }
    }

    const isBidded = !!highlightData.isBidded;
    const bidPrice = highlightData.bidPrice ? parseFloat(highlightData.bidPrice) : null;
    const campaignDays = highlightData.campaignDays || 1;
    const finalImageUrl = highlightData.image_url || highlightData.imageUrl;

    if (!finalImageUrl) {
      return NextResponse.json({ error: "Highlight cover image is required." }, { status: 400 });
    }

    const { isAdminEmail } = await import("@/lib/authHelper");
    const isAdmin = isAdminEmail(emailLower);

    if (isAdmin) {
      // Admin bypasses all review and payment - publish directly to active feed
      const activeHl = {
        ...(editingId ? { id: editingId } : {}),
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
        is_ai_content: !!highlightData.isAiContent,
        is_admin_post: true,
        is_paused: false,
        created_at: new Date().toISOString(),
      };

      if (editingId) {
        await supabaseAdmin.from("news").delete().eq("id", editingId);
      }

      const { data: insertedHl, error: insertErr } = await supabaseAdmin
        .from("newsactive")
        .upsert(activeHl)
        .select("*");

      if (insertErr) {
        console.error("❌ Error activating admin highlight directly:", insertErr);
        throw insertErr;
      }

      await invalidateCachedUserCampaigns(emailLower);
      return NextResponse.json({
        success: true,
        message: "Admin highlight published directly to active feed!",
        highlightId: insertedHl?.[0]?.id || editingId,
      });
    }

    if (editingId) {
      // Check if editing an active delivering highlight
      const { data: activeHl } = await supabaseAdmin
        .from("newsactive")
        .select("id, campaign_days, bid_price, is_bidded")
        .eq("id", editingId)
        .maybeSingle();

      const isDeliveringActive = !!activeHl;
      let isBudgetIncreased = false;
      if (activeHl) {
        const origDays = activeHl.campaign_days || 1;
        const origRate = activeHl.is_bidded && activeHl.bid_price ? Number(activeHl.bid_price) : 1000;
        const origCost = origDays * origRate;
        const newCost = campaignDays * (isBidded && bidPrice ? bidPrice : 1000);
        isBudgetIncreased = newCost > origCost;
      }

      // Upsert into news so review draft is created or updated
      const { error: upsertErr } = await supabaseAdmin
        .from("news")
        .upsert({
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
          is_ai_content: !!highlightData.isAiContent,
          admin_statement: "Status: Pending review",
          status: "pending_review",
          payment_status: isDeliveringActive && !isBudgetIncreased ? "paid" : "unpaid",
          user_email: emailLower,
          is_admin_post: isAdmin,
          is_paused: false,
        });

      if (upsertErr) throw upsertErr;

      await invalidateCachedUserCampaigns(emailLower);
      return NextResponse.json({
        success: true,
        message: "Highlight updated and re-submitted for review!",
        highlightId: editingId,
      });
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("news")
      .insert([
        {
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
          is_admin_post: isAdmin,
          is_ai_content: !!highlightData.isAiContent,
          admin_statement: "Status: Pending review",
          is_paused: false,
        },
      ])
      .select("id")
      .single();

    if (insertErr) throw insertErr;

    // Send confirmation notification
    await supabaseAdmin.from("notifications").insert([
      {
        user_email: emailLower,
        title: "Highlight Submitted for Review",
        message: `Your highlight "${highlightData.title}" has been submitted for admin moderation. You will be notified once approved to publish it.`,
      },
    ]);

    await invalidateCachedUserCampaigns(emailLower);

    return NextResponse.json({
      success: true,
      message: "Highlight submitted for review! Once approved, you can publish it from My Highlights.",
      highlightId: inserted?.id,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/highlights/submit:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
