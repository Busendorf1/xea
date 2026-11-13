import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { streamImpressionsToClickHouse } from "@/lib/clickhouse";
import {
  incrementCachedMonetizationClicks,
  invalidateCachedProfile,
  invalidateCachedUserCampaigns,
} from "@/lib/utils/cache";
import {
  recordCoalescedAdClick,
  recordCoalescedAdSeen,
  CanonicalClickType,
} from "@/lib/impressionBuffer";
import { dispatchImpressionWebhook } from "@/lib/webhookDispatcher";
import { isExemptFromBarriersAndInactivity } from "@/lib/adminHelper";
import { computeAtwTierDetails } from "@/lib/attentionTierEngine";
import { checkAndNotifyClickAndAtwMilestones } from "@/lib/notifications/milestoneNotifications";

// L1 In-Memory click deduplication map (15s TTL) so CTA clicks never fail when Redis is in quota cooldown
const l1ClickLocks = new Map<string, number>();

const CLICK_TYPE_CANONICAL_MAP: Record<string, string> = {
  phone: "phone",
  whatsapp: "whatsapp",
  website: "website",
  visit_website: "website",
  brand_visit: "website",
  share: "website",
  email: "email",
  ios: "ios",
  android: "android",
  read_more: "read_more",
  watch_now: "watch_now",
  action_watch_now: "watch_now",
  product_cta: "product_cta",
  buy: "product_cta",
  buy_now: "product_cta",
  shop: "product_cta",
  order: "product_cta",
  get: "product_cta",
  add: "product_cta",
  book: "product_cta",
  comment: "product_cta",
  learn_more: "product_cta",
  sign_up: "product_cta",
  download: "product_cta",
  apply: "product_cta",
  contact: "product_cta",
};

const CLICK_COLUMN_MAP: Record<string, string> = {
  phone: "clicks_phone",
  whatsapp: "clicks_whatsapp",
  website: "clicks_website",
  email: "clicks_email",
  ios: "clicks_ios",
  android: "clicks_android",
  read_more: "clicks_read_more",
  watch_now: "clicks_watch_now",
  product_cta: "clicks_product_cta",
};

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(request, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { adId, clickType } = body;

    if (!adId || !clickType) {
      return NextResponse.json({ error: "Missing adId or clickType" }, { status: 400 });
    }

    const rawClickType = String(clickType).toLowerCase().trim();
    const canonicalClickType = CLICK_TYPE_CANONICAL_MAP[rawClickType] || "product_cta";

    const emailLower = email.toLowerCase().trim();
    const now = Date.now();
    const lockKey = `lock:click:${emailLower}:${adId}:${canonicalClickType}`;

    // 1. L1 In-Memory 5s deduplication check
    const existingL1 = l1ClickLocks.get(lockKey);
    if (existingL1 && existingL1 > now) {
      return NextResponse.json({ success: true, duplicate: true });
    }
    l1ClickLocks.set(lockKey, now + 5000);
    if (l1ClickLocks.size > 5000) {
      for (const [k, exp] of l1ClickLocks) {
        if (exp <= now) l1ClickLocks.delete(k);
      }
    }

    // 2. L2 Redis 5s deduplication check (only enforced when Redis is ready)
    if (isRedisReady()) {
      const lockAcquired = await redisConnection.set(lockKey, "1", "EX", 5, "NX").catch(() => "OK");
      if (!lockAcquired) {
        return NextResponse.json({ success: true, duplicate: true });
      }
    }

    const ua = request.headers.get("user-agent") || "";
    const deviceType = /Mobile|Android|iP(hone|od|ad)/i.test(ua) ? "mobile" : "desktop";
    const geoCountry =
      request.headers.get("x-vercel-ip-country") ||
      request.headers.get("cf-ipcountry") ||
      "Global";

    // 3. Every form of click is also a Seen indicator:
    //    Persist CTA click + Seen impression + atomically increment user's monetization_clicks in DB & Redis
    let clicksCount: number | undefined;
    let isMonetized: boolean | undefined;
    let impressionCount: number | undefined;
    let resolvedAtwTier: string | null | undefined;
    let resolvedAtwScore: number | null | undefined;

    await Promise.all([
      recordCoalescedAdClick(adId, canonicalClickType as CanonicalClickType),
      (async () => {
        try {
          const updatedImp = await recordCoalescedAdSeen(adId, emailLower, {
            userCap: 1,
            isPlatformPost: false,
            adOwnerEmail: null,
            dbImpressionsTarget: 0,
            dbImpressionCount: 0,
          });
          if (typeof updatedImp === "number") {
            impressionCount = updatedImp;
          }
        } catch {}
      })(),
      (async () => {
        const { data: prevUserRow } = await supabaseAdmin
          .from("users")
          .select("id, monetization_clicks, monetized, has_cancelled_monetization, atw_tier, attention_worth_score")
          .eq("email", emailLower)
          .maybeSingle();

        const prevClicks = Number(prevUserRow?.monetization_clicks || 0);
        const prevMonetized =
          prevUserRow?.monetized === true ||
          prevUserRow?.monetized === "true" ||
          prevUserRow?.monetized === "yes";
        const hasCancelled = Boolean(prevUserRow?.has_cancelled_monetization);
        const existingAtwTier: string | null | undefined = prevUserRow?.atw_tier;
        const existingAtwScore: number | null | undefined = prevUserRow?.attention_worth_score;

        const [rpcRes, liveVal] = await Promise.all([
          supabaseAdmin.rpc("increment_user_click_progress", {
            p_email: emailLower,
            p_count: 1,
          }),
          incrementCachedMonetizationClicks(emailLower, 1).catch(() => 0),
        ]);

        const rpcCount =
          !rpcRes.error &&
          rpcRes.data &&
          rpcRes.data.length > 0 &&
          typeof rpcRes.data[0].new_click_count === "number"
            ? Number(rpcRes.data[0].new_click_count)
            : null;

        if (rpcCount !== null && rpcCount > 0) {
          clicksCount = Math.max(rpcCount, liveVal || 0);
          isMonetized = hasCancelled ? false : (!!rpcRes.data[0].is_now_monetized || clicksCount >= 300);
        } else {
          const nextDbClicks = Math.max(prevClicks + 1, liveVal || 0);
          const nextMon = hasCancelled ? false : (prevMonetized || nextDbClicks >= 300);
          if (prevUserRow?.id) {
            await supabaseAdmin
              .from("users")
              .update({
                monetization_clicks: nextDbClicks,
                ...(nextMon ? { monetized: "true" } : {}),
              })
              .eq("id", prevUserRow.id);
          }
          clicksCount = nextDbClicks;
          isMonetized = nextMon;
        }

        const isExempt = isExemptFromBarriersAndInactivity(emailLower);
        const tierDetails = computeAtwTierDetails(clicksCount || 0, existingAtwTier, isExempt, existingAtwScore);

        supabaseAdmin
          .from("users")
          .update({
            atw_tier: tierDetails.tierCode,
            ...(isMonetized || isExempt ? { monetized: "true" } : {}),
          })
          .eq("email", emailLower)
          .then(() => {});

        checkAndNotifyClickAndAtwMilestones({
          email: emailLower,
          prevClicks,
          prevMonetized,
          prevAtwTier: existingAtwTier,
          nextClicks: clicksCount || 0,
          nextMonetized: Boolean(isMonetized),
          nextAtwTier: tierDetails.tierCode,
          attentionWorthScore: existingAtwScore,
          isExempt,
          hasCancelled,
        }).catch(() => {});

        if (clicksCount !== undefined && clicksCount > 0 && isRedisReady()) {
          redisConnection.set(`user:live_clicks:v2:${emailLower}`, String(clicksCount), "EX", 86400 * 30).catch(() => {});
          redisConnection.del(`monetize:status:v2:${emailLower}`).catch(() => {});
        }
        invalidateCachedProfile(emailLower).catch(() => {});
        resolvedAtwTier = existingAtwTier;
        resolvedAtwScore = existingAtwScore;
      })(),
    ]);

    const isExempt = isExemptFromBarriersAndInactivity(emailLower);
    const tierDetails = computeAtwTierDetails(clicksCount || 0, resolvedAtwTier, isExempt, resolvedAtwScore);
    if (typeof clicksCount === "number") {
      dispatchImpressionWebhook({
        event: "ad.seen",
        timestamp: Date.now(),
        data: {
          userEmail: emailLower,
          adId,
          clicksCount,
          isMonetized: Boolean(isMonetized || isExempt),
          impressionCount,
          atwTier: tierDetails.tierCode,
        },
      }).catch(() => {});
    }

    // 4. Stream action click once to ClickHouse Cloud (non-blocking)
    streamImpressionsToClickHouse([
      {
        ad_id: adId,
        user_email: emailLower,
        cost_per_impression: 0,
        interaction_type: canonicalClickType,
        device_type: deviceType,
        country: geoCountry,
      },
    ]).catch(() => {});

    return NextResponse.json({
      success: true,
      clickType: canonicalClickType,
      clicksCount,
      isMonetized: Boolean(isMonetized || isExempt),
      atwTier: tierDetails.tierCode,
      holdingCap: tierDetails.isUnlimited ? null : tierDetails.holdingCap,
      impressionCount,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/campaigns/click:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
