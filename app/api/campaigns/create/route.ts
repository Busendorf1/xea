import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { isAdminEmail } from "@/lib/adminHelper";
import { campaignsQueue } from "@/lib/queue";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { validateAndComputeAdPricing } from "@/lib/ads/pricingEnforcement";
import { getCanonicalHighlightFloorRateNgn, getUserCurrency, convertUsdToNgn } from "@/lib/utils/currency";
import { checkRateLimit } from "@/lib/edgeRateLimit";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimit(request, {
      limit: 15,
      windowSeconds: 60,
      identifierPrefix: "campaigns_create",
    });
    if (!rateLimit.allowed && rateLimit.response) {
      return rateLimit.response;
    }

    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type, payload } = body;

    if (!type || !payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Missing type or payload" }, { status: 400 });
    }

    if (type !== "ad" && type !== "highlight") {
      return NextResponse.json({ error: "Invalid type. Must be 'ad' or 'highlight'" }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const userIsAdmin = isAdminEmail(cleanEmail);

    // Check advertiser account restrictions & country
    const { data: userProfile } = await supabaseAdmin
      .from("users")
      .select("ad_account_status, ad_ban_until, ad_ban_reason, country")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (!userIsAdmin && userProfile) {
      const isRestricted =
        userProfile.ad_account_status === "perm_banned" ||
        userProfile.ad_account_status === "deactivated" ||
        (userProfile.ad_account_status === "temp_banned" &&
          userProfile.ad_ban_until &&
          new Date(userProfile.ad_ban_until) > new Date());
      if (isRestricted) {
        return NextResponse.json(
          { error: "Your advertising access is currently restricted." },
          { status: 403 }
        );
      }
    }

    // Enforce 2 approved unpaid drafts limit
    if (!userIsAdmin) {
      const table = type === "ad" ? "adds" : "news";
      const { data: pendingRows } = await supabaseAdmin
        .from(table)
        .select("id, admin_statement")
        .eq("user_email", cleanEmail)
        .like("admin_statement", "APPROVED:%")
        .limit(5);
      if ((pendingRows?.length || 0) >= 2) {
        return NextResponse.json(
          { error: "You have reached the limit of 2 approved drafts awaiting payment." },
          { status: 400 }
        );
      }
    }

    // Strict allowlist sanitization (C-15): strip admin_statement, approved_at, is_admin_post, total_cost, etc.
    const sanitizedPayload: Record<string, unknown> = {
      id: crypto.randomUUID(),
      user_email: cleanEmail,
      admin_statement: "Status: Pending review",
      status: "pending_review",
      payment_status: "unpaid",
      approved_at: null,
      is_paused: false,
      is_admin_post: false,
    };

    if (type === "ad") {
      const pricing = await validateAndComputeAdPricing(supabaseAdmin, {
        adType: payload.ad_type ?? payload.adType,
        impressions: payload.impressions,
        costPerImpression: payload.cost_per_impression ?? payload.costPerImpression,
        isBidded: payload.is_bidded ?? payload.isBidded,
        bidPrice: payload.bid_price ?? payload.bidPrice,
        clientTotalCost: payload.total_cost ?? payload.totalCost,
        productCtaLink: payload.product_cta_link ?? payload.productCtaLink,
        userCountry: userProfile?.country,
        isAdmin: userIsAdmin,
      });
      if (!pricing.ok) {
        return NextResponse.json({ error: pricing.error }, { status: pricing.status });
      }
      const days = Number(payload.campaign_days ?? payload.campaignDays ?? 1);
      if (!Number.isFinite(days) || days < 1 || days > 90) {
        return NextResponse.json({ error: "Campaign duration must be between 1 and 90 days." }, { status: 400 });
      }
      Object.assign(sanitizedPayload, {
        ad_type: pricing.adCategory,
        ad_content: String(payload.ad_content ?? payload.adContent ?? "").slice(0, 2000),
        ad_media_type: String(payload.ad_media_type ?? payload.adMediaType ?? "image"),
        ad_media: payload.ad_media ?? payload.adMedia ?? null,
        impressions: pricing.impressionsCount,
        campaign_days: Math.floor(days),
        user_frequency_cap: Math.max(1, Math.min(5_000_000, Math.floor(Number(payload.user_frequency_cap ?? payload.userFrequencyCap ?? 1)))),
        cost_per_impression: pricing.canonicalRateNgn,
        bid_price: pricing.isBidded ? pricing.canonicalRateNgn : null,
        is_bidded: pricing.isBidded,
        total_cost: pricing.canonicalTotalCostNgn,
        is_admin_post: pricing.isAdminFreePost,
        targeting_all: Boolean(payload.targeting_all ?? payload.targetingAll),
        country: payload.country ?? null,
        state: payload.state ?? null,
        province: payload.province ?? null,
        gender: payload.gender ?? null,
        industry: Array.isArray(payload.industry) ? payload.industry : [],
        interest: Array.isArray(payload.interest) ? payload.interest : [],
        lifestyle: Array.isArray(payload.lifestyle) ? payload.lifestyle : [],
        behavior: Array.isArray(payload.behavior) ? payload.behavior : [],
        personality: Array.isArray(payload.personality) ? payload.personality : [],
        product_cta_type: payload.product_cta_type ?? payload.productCtaType ?? null,
        product_cta_link: payload.product_cta_link ?? payload.productCtaLink ?? null,
        is_ai_content: Boolean(payload.is_ai_content ?? payload.isAiContent),
      });
    } else {
      const title = String(payload.title || "").trim().slice(0, 160);
      const content = String(payload.content || "").trim().slice(0, 4000);
      if (!title || !content) {
        return NextResponse.json({ error: "Highlight title and content are required." }, { status: 400 });
      }
      const days = Math.max(1, Math.min(90, Math.floor(Number(payload.campaign_days ?? 1))));
      const floorNgn = getCanonicalHighlightFloorRateNgn(userProfile?.country);
      const isUsd = getUserCurrency(userProfile?.country) === "USD";
      const rawBid = payload.bid_price ? Number(payload.bid_price) : 0;
      const bidNgn = rawBid > 0 ? (isUsd && rawBid < 500 ? convertUsdToNgn(rawBid) : rawBid) : floorNgn;
      const dailyRateNgn = userIsAdmin ? 0 : Math.max(floorNgn, bidNgn);
      Object.assign(sanitizedPayload, {
        title,
        content,
        image_url: payload.image_url ?? null,
        interest: payload.interest ?? null,
        country: payload.country ?? null,
        state: payload.state ?? null,
        province: payload.province ?? null,
        campaign_days: days,
        is_bidded: !userIsAdmin && dailyRateNgn > floorNgn,
        bid_price: dailyRateNgn,
        total_cost: Math.round(dailyRateNgn * days),
        is_ai_content: Boolean(payload.is_ai_content ?? payload.isAiContent),
      });
    }

    await campaignsQueue.add(`create-${type}`, {
      type,
      payload: sanitizedPayload,
    });

    return NextResponse.json({ success: true, queued: true });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/campaigns/create:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
