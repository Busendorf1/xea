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

    // 1. Run self-healing background cleanup (throttled)
    cleanupExpiredApprovedCampaigns().catch((err) =>
      console.warn("Background auto-cleanup notice:", err)
    );

    // 2. Check advertiser account status
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
    const { adData, editingId } = body;

    if (!adData) {
      return NextResponse.json({ error: "Missing campaign data." }, { status: 400 });
    }

    // 3. Enforce 2-Campaign Pending Limit
    // "not more than two ad or highlight will be pending publish for users so we dont bloat db...
    // if a user have more than one or exactly two ad approved and pending review they wont be able to submit another ad"
    if (!editingId) {
      const { data: userPendingAds, error: pendingErr } = await supabaseAdmin
        .from("adds")
        .select("id, admin_statement, completed_at")
        .eq("user_email", emailLower)
        .is("completed_at", null);

      if (!pendingErr && userPendingAds) {
        // Filter active pending or approved-to-publish ads (excluding completed, rejected, or expired >72h)
        const pendingCount = userPendingAds.filter((ad) => {
          if (ad.admin_statement?.startsWith("REJECTED:")) return false;
          if (ad.admin_statement?.startsWith("APPROVED:")) {
            const parts = ad.admin_statement.split("APPROVED:");
            if (parts[1]) {
              const approvedTime = new Date(parts[1].trim()).getTime();
              if (!isNaN(approvedTime) && Date.now() - approvedTime > 72 * 60 * 60 * 1000) {
                return false; // Expired approved ad waiting to be purged
              }
            }
            return true;
          }
          if (!ad.admin_statement) return true; // Newly submitted
          if (ad.admin_statement.startsWith("Status: Pending review")) return true;
          if (ad.admin_statement.startsWith("Approved:")) return true;
          return false;
        }).length;

        if (pendingCount >= 2) {
          return NextResponse.json(
            {
              error:
                "You have reached the limit of 2 campaigns awaiting review or publication. Please publish or delete an existing campaign before submitting a new one.",
              limitReached: true,
              pendingCount,
            },
            { status: 400 }
          );
        }
      }
    }

    const adId = editingId || adData.id;
    const isBidded = !!adData.isBidded;
    const bidPrice = adData.bidPrice ? parseFloat(adData.bidPrice) : null;
    const CATEGORY_FLOOR_RATES: Record<string, number> = {
      politics: 30,
      product: 25,
      service: 25,
      business: 25,
      event: 20,
      public: 20,
      individual: 15,
    };
    const adCategory = String(adData.adType || "business").toLowerCase();
    const floorRate = CATEGORY_FLOOR_RATES[adCategory] ?? 15;
    const clientCpi = Number(adData.costPerImpression || floorRate);
    const rawEffectiveRate = isBidded && bidPrice ? bidPrice : clientCpi;
    const effectiveRate = Math.max(floorRate, rawEffectiveRate);
    const impressionsCount = Math.max(100, Number(adData.impressions || 1000));
    const computedTotalCost = Math.round(effectiveRate * impressionsCount);

    const { isAdminEmail } = await import("@/lib/authHelper");
    const isAdmin = isAdminEmail(emailLower) || !!adData.isAdminPost;

    if (isAdmin) {
      // Admin bypasses all review queues and payment - publish directly to live active feed
      const activeAd = {
        id: adId,
        ad_type: adData.adType || "business",
        industry: adData.industry || [],
        interest: adData.interest || [],
        lifestyle: adData.lifestyle || [],
        behavior: adData.behavior || [],
        personality: adData.personality || [],
        age_range: adData.ageRange || [18, 65],
        targeting_all: adData.targetingAll ?? false,
        impressions: adData.impressions || 1000,
        campaign_days: adData.campaignDays || 1,
        user_frequency_cap: adData.userFrequencyCap || 1,
        country: adData.country || null,
        state: adData.state || null,
        province: adData.province || null,
        gender: adData.gender || null,
        employment_status: adData.employmentStatus || null,
        ad_media_type: adData.adMediaType || "image",
        ad_content: adData.adContent || "",
        ad_action_buttons: adData.adActionButtons || [],
        action_phone: adData.actionPhone || null,
        action_whatsapp: adData.actionWhatsapp || null,
        action_website: adData.actionWebsite || null,
        action_email: adData.actionEmail || null,
        action_ios: adData.actionIos || null,
        action_android: adData.actionAndroid || null,
        action_watch_now: adData.actionWatchNow || null,
        display_mutual_button: adData.displayMutualButton ?? true,
        cost_per_impression: 0,
        total_cost: 0,
        user_email: emailLower,
        ad_media: adData.adMedia || adData.ad_media || null,
        product_name: adData.productName || null,
        product_price: adData.productPrice || null,
        product_cta_type: adData.productCtaType || null,
        product_cta_link: adData.productCtaLink || null,
        is_ai_content: !!adData.isAiContent,
        is_admin_post: true,
        is_paused: false,
        created_at: new Date().toISOString(),
      };

      await supabaseAdmin.from("adds").delete().eq("id", adId);
      const { data: insertedRows, error: insertErr } = await supabaseAdmin
        .from("addsactive")
        .upsert(activeAd)
        .select("*");

      if (insertErr) {
        console.error("❌ Error activating admin ad directly:", insertErr);
        throw insertErr;
      }

      const publishedAd = insertedRows?.[0] || activeAd;
      const { dispatchFeedDropWebhook } = await import("@/lib/webhookDispatcher");
      dispatchFeedDropWebhook(publishedAd).catch(() => {});

      await invalidateCachedUserCampaigns(emailLower);
      return NextResponse.json({
        success: true,
        message: "Admin campaign published directly to live feed!",
        adId,
      });
    }

    // Check if editing an active delivering campaign
    let isDeliveringActive = false;
    let isBudgetIncreased = false;
    if (editingId) {
      const { data: activeAd } = await supabaseAdmin
        .from("addsactive")
        .select("id, total_cost")
        .eq("id", editingId)
        .maybeSingle();

      if (activeAd) {
        isDeliveringActive = true;
        isBudgetIncreased = computedTotalCost > Number(activeAd.total_cost || 0);
      }

      // Clean up previous review draft from adds if updating to prevent primary key collision
      await supabaseAdmin.from("adds").delete().eq("id", adId);
    }

    // 4. Submit to 'adds' table (Pending Moderation Queue) via RPC
    const { error: rpcError } = await supabaseAdmin.rpc("submit_ad_campaign", {
      p_id: adId,
      p_ad_type: adData.adType || "business",
      p_industry: adData.industry || [],
      p_interest: adData.interest || [],
      p_lifestyle: adData.lifestyle || [],
      p_behavior: adData.behavior || [],
      p_personality: adData.personality || [],
      p_age_range: adData.ageRange || [18, 65],
      p_targeting_all: adData.targetingAll ?? false,
      p_impressions: impressionsCount,
      p_campaign_days: adData.campaignDays || 1,
      p_user_frequency_cap: adData.userFrequencyCap || 1,
      p_country: adData.country || null,
      p_state: adData.state || null,
      p_province: adData.province || null,
      p_gender: adData.gender || null,
      p_employment_status: adData.employmentStatus || null,
      p_ad_media_type: adData.adMediaType || "image",
      p_ad_content: adData.adContent || "",
      p_ad_action_buttons: adData.adActionButtons || [],
      p_action_phone: adData.actionPhone || null,
      p_action_whatsapp: adData.actionWhatsapp || null,
      p_action_website: adData.actionWebsite || null,
      p_action_email: adData.actionEmail || null,
      p_cost_per_impression: effectiveRate,
      p_total_cost: computedTotalCost,
      p_user_email: emailLower,
      p_ad_media: adData.adMedia || adData.ad_media || null,
      p_display_mutual_button: adData.displayMutualButton ?? true,
      p_product_price: adData.productPrice || null,
      p_product_name: adData.productName || null,
      p_product_cta_type: adData.productCtaType || null,
      p_product_cta_link: adData.productCtaLink || null,
      p_action_ios: adData.actionIos || null,
      p_action_android: adData.actionAndroid || null,
      p_action_watch_now: adData.actionWatchNow || null,
    });

    if (rpcError) {
      console.error("❌ RPC submit_ad_campaign failed:", rpcError);
      return NextResponse.json(
        { error: "Failed to submit campaign for review: " + rpcError.message },
        { status: 500 }
      );
    }

    // Set initial moderation status to pending_review
    await supabaseAdmin
      .from("adds")
      .update({
        admin_statement: "Status: Pending review",
        status: "pending_review",
        payment_status: isDeliveringActive && !isBudgetIncreased ? "paid" : "unpaid",
        is_paused: false,
        is_ai_content: !!adData.isAiContent,
      })
      .eq("id", adId);

    // If NOT an active delivering ad, ensure it's not in active feed
    if (!isDeliveringActive) {
      await supabaseAdmin.from("addsactive").delete().eq("id", adId);
    }

    // Create user notification
    await supabaseAdmin.from("notifications").insert([
      {
        user_email: emailLower,
        title: editingId ? "Campaign Adjusted & Re-submitted" : "Campaign Submitted for Review",
        message: isDeliveringActive
          ? `Your active campaign updates have been submitted to admin for moderation review. Your current campaign continues delivering live.`
          : `Your campaign "${adData.adContent?.slice(0, 30) || "Ad"}..." has been submitted to admin for moderation review. Once approved, you can publish it from My Ads.`,
      },
    ]);

    await invalidateCachedUserCampaigns(emailLower);

    return NextResponse.json({
      success: true,
      message: "Campaign submitted for review! You will be notified once approved.",
      adId,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/campaigns/submit:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
