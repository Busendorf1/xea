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

    // 3. Enforce 2-Campaign Approved Payment Limit
    // Count campaigns approved by admin for payment, excluding newly submitted campaigns still awaiting review
    if (!editingId) {
      const { data: userPendingAds, error: pendingErr } = await supabaseAdmin
        .from("adds")
        .select("id, admin_statement, completed_at")
        .eq("user_email", emailLower)
        .is("completed_at", null);

      if (!pendingErr && userPendingAds) {
        const approvedUnpaidCount = userPendingAds.filter((ad) => {
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
          return false;
        }).length;

        if (approvedUnpaidCount >= 2) {
          return NextResponse.json(
            {
              error:
                "You have reached the limit of 2 approved campaigns awaiting payment. Please make payment or delete an existing approved campaign in My Ads before submitting a new one.",
              limitReached: true,
              pendingCount: approvedUnpaidCount,
            },
            { status: 400 }
          );
        }
      }
    }

    const adId = editingId || adData.id || crypto.randomUUID();
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

    // Check if editing an active delivering campaign & verify ownership (prevents IDOR)
    let isDeliveringActive = false;
    let isBudgetIncreased = false;
    if (editingId) {
      const [{ data: activeAd }, { data: draftAd }] = await Promise.all([
        supabaseAdmin
          .from("addsactive")
          .select("id, user_email, total_cost")
          .eq("id", editingId)
          .maybeSingle(),
        supabaseAdmin
          .from("adds")
          .select("id, user_email")
          .eq("id", editingId)
          .maybeSingle(),
      ]);

      const existingOwner = activeAd?.user_email || draftAd?.user_email || null;
      const { isAdminEmail } = await import("@/lib/authHelper");
      const isAdmin = isAdminEmail(emailLower);

      if (!activeAd && !draftAd) {
        return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      }
      if (existingOwner && String(existingOwner).toLowerCase().trim() !== emailLower && !isAdmin) {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to edit this campaign." },
          { status: 403 }
        );
      }

      if (activeAd) {
        isDeliveringActive = true;
        isBudgetIncreased = computedTotalCost > Number(activeAd.total_cost || 0);
      }

      // Clean up previous review draft from adds scoped by ownership
      let delDraft = supabaseAdmin.from("adds").delete().eq("id", adId);
      if (!isAdmin) delDraft = delDraft.eq("user_email", emailLower);
      await delDraft;
    }

    // 4. Submit directly to 'adds' table (Pending Moderation Queue) — never auto-insert into addsactive!
    const baseAdRow: Record<string, any> = {
      id: adId,
      ad_type: adData.adType || "business",
      industry: adData.industry || [],
      interest: adData.interest || [],
      lifestyle: adData.lifestyle || [],
      behavior: adData.behavior || [],
      personality: adData.personality || [],
      age_range: adData.ageRange || [18, 65],
      targeting_all: adData.targetingAll ?? false,
      impressions: impressionsCount,
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
      cost_per_impression: effectiveRate,
      total_cost: computedTotalCost,
      user_email: emailLower,
      ad_media: adData.adMedia || adData.ad_media || null,
      display_mutual_button: adData.displayMutualButton ?? true,
      product_price: adData.productPrice || null,
      product_name: adData.productName || null,
      product_cta_type: adData.productCtaType || null,
      product_cta_link: adData.productCtaLink || null,
      action_ios: adData.actionIos || null,
      action_android: adData.actionAndroid || null,
      action_watch_now: adData.actionWatchNow || null,
      admin_statement: "Status: Pending review",
      is_paused: false,
      is_admin_post: false,
    };

    const rawScheduledStart = adData.scheduledStartAt || adData.scheduled_start_at || null;
    let parsedScheduledStart: string | null = null;
    if (rawScheduledStart && typeof rawScheduledStart === "string" && rawScheduledStart !== "immediate") {
      const dt = new Date(rawScheduledStart);
      if (!isNaN(dt.getTime())) {
        parsedScheduledStart = dt.toISOString();
      }
    }

    const { error: upsertErr } = await supabaseAdmin.from("adds").upsert({
      ...baseAdRow,
      status: "pending_review",
      approved_at: null,
      payment_status: isDeliveringActive && !isBudgetIncreased ? "paid" : "unpaid",
      is_ai_content: !!adData.isAiContent,
      ...(parsedScheduledStart ? { scheduled_start_at: parsedScheduledStart } : {}),
    });

    if (upsertErr) {
      const { error: fallbackErr } = await supabaseAdmin.from("adds").upsert(baseAdRow);
      if (fallbackErr) {
        console.error("❌ Direct insert to adds failed:", fallbackErr);
        return NextResponse.json(
          { error: "Failed to submit campaign for review: " + fallbackErr.message },
          { status: 500 }
        );
      }
    }

    // If NOT an active delivering ad, guarantee it is removed from active feed
    if (!isDeliveringActive) {
      await supabaseAdmin.from("addsactive").delete().eq("id", adId);
    }

    const notifRow = {
      user_email: emailLower,
      title: editingId ? "Ad In Review" : "Ad Submitted",
      message: editingId
        ? "Your updated ad is in review. Pay to publish once approved."
        : "Your ad is in review. Once approved, pay in My Ads to go live.",
    };
    await supabaseAdmin.from("notifications").insert([notifRow]);
    const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
    dispatchNotificationWebhook(notifRow).catch(() => {});

    await invalidateCachedUserCampaigns(emailLower);

    return NextResponse.json({
      success: true,
      message: editingId
        ? "Ad updated and placed in review. You will be notified once approved."
        : "Ad submitted for review. Once approved, complete payment in My Ads to go live.",
      adId,
      status: "pending_review",
      admin_statement: "Status: Pending review",
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/campaigns/submit:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
