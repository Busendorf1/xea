import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { streamImpressionsToClickHouse } from "@/lib/clickhouse";
import {
  incrementCachedMonetizationClicks,
  invalidateCachedProfile,
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
import { checkRateLimit } from "@/lib/edgeRateLimit";
import { getEarnTokenSecret, verifyHmacSignature } from "@/lib/targetingEngine";
import { env } from "@/lib/env";

// L1 In-Memory click deduplication map (15s TTL) so CTA clicks never fail when Redis is in quota cooldown
const l1ClickLocks = new Map<string, number>();
// L1 per-token progress burn fallback so rapid click-type cycling cannot farm monetization clicks
const l1ProgressBurn = new Map<string, number>();

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

    const emailLower = email.toLowerCase().trim();

    // 0. Per-user strict rate limit (C-13)
    const rateLimit = await checkRateLimit(request, {
      limit: 20,
      windowSeconds: 60,
      identifierPrefix: "campaign_click",
      identifier: emailLower,
    });
    if (!rateLimit.allowed && rateLimit.response) {
      return rateLimit.response;
    }

    const body = await request.json();
    const { adId, clickType, token, servedAt } = body;

    if (!adId || !clickType) {
      return NextResponse.json({ error: "Missing adId or clickType" }, { status: 400 });
    }

    // 1. Cryptographic signed feed token verification + 30m expiry (C-13)
    if (!token || !servedAt) {
      return NextResponse.json(
        { error: "Verification token and timestamp are required." },
        { status: 403 }
      );
    }

    const secretKey = getEarnTokenSecret();
    const fallbackAuth0Key = env.AUTH0_SECRET || process.env.AUTH0_SECRET || "";
    const candidateKeys = Array.from(new Set([secretKey, fallbackAuth0Key].filter(Boolean)));
    if (candidateKeys.length === 0) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const rawEmail = email.trim();
    const payloads = [`${adId}:${emailLower}:${servedAt}`, `${adId}:${rawEmail}:${servedAt}`];
    if (!verifyHmacSignature(payloads, String(token), candidateKeys)) {
      return NextResponse.json(
        { error: "Cryptographic token verification failed." },
        { status: 403 }
      );
    }

    const now = Date.now();
    const parsedServedAt = Number.parseInt(String(servedAt), 10);
    if (!Number.isFinite(parsedServedAt) || parsedServedAt > now + 60_000 || now - parsedServedAt > 1_800_000) {
      return NextResponse.json(
        { error: "Feed token expired. Please refresh feed." },
        { status: 403 }
      );
    }

    // 2. Verify ad exists in addsactive, is active, and is NOT owned by caller (C-13)
    const { data: activeAd } = await supabaseAdmin
      .from("addsactive")
      .select("id, user_email, is_paused, completed_at, is_admin_post, impressions, impression_count, user_frequency_cap")
      .eq("id", adId)
      .maybeSingle();

    if (!activeAd || activeAd.is_paused || activeAd.completed_at) {
      return NextResponse.json({ error: "Active campaign not found." }, { status: 404 });
    }

    const adOwnerEmail = activeAd.user_email ? String(activeAd.user_email).toLowerCase().trim() : null;
    if (adOwnerEmail && adOwnerEmail === emailLower) {
      return NextResponse.json({
        success: true,
        isOwner: true,
        message: "Owner CTA click ignored to preserve campaign metrics.",
      });
    }

    const rawClickType = String(clickType).toLowerCase().trim();
    const canonicalClickType = CLICK_TYPE_CANONICAL_MAP[rawClickType] || "product_cta";

    const lockKey = `lock:click:${emailLower}:${adId}:${canonicalClickType}`;

    // 3. L1 In-Memory 15s deduplication check per (user, adId, clickType)
    const existingL1 = l1ClickLocks.get(lockKey);
    if (existingL1 && existingL1 > now) {
      return NextResponse.json({ success: true, duplicate: true });
    }
    l1ClickLocks.set(lockKey, now + 15_000);
    if (l1ClickLocks.size > 5000) {
      for (const [k, exp] of l1ClickLocks) {
        if (exp <= now) l1ClickLocks.delete(k);
      }
    }

    // 4. L2 Redis 15s deduplication check
    if (isRedisReady()) {
      const lockAcquired = await redisConnection.set(lockKey, "1", "EX", 15, "NX").catch(() => null);
      if (!lockAcquired) {
        return NextResponse.json({ success: true, duplicate: true });
      }
    }

    // 5. Decouple repeated CTA clicks from monetization progression & impression consumption:
    //    Burn unified `used:feed_progress:<tokenHash>` so at most ONE progression/seen credit
    //    is ever awarded per ad view across /earn, /seen, /monetize, and all 9 CTA click types (C-13/C-16).
    const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 32);
    const progressBurnKey = `used:feed_progress:${tokenHash}`;
    let canCreditProgress = false;
    const l1BurnExp = l1ProgressBurn.get(progressBurnKey);
    if (!l1BurnExp || l1BurnExp <= now) {
      l1ProgressBurn.set(progressBurnKey, now + 1_800_000);
      if (l1ProgressBurn.size > 5000) {
        for (const [k, exp] of l1ProgressBurn) {
          if (exp <= now) l1ProgressBurn.delete(k);
        }
      }
      if (isRedisReady()) {
        const burned = await redisConnection.set(progressBurnKey, "1", "EX", 1800, "NX").catch(() => null);
        canCreditProgress = Boolean(burned);
      } else {
        // When Redis is offline, require adId not already viewed up to cap in ad_impressions
        const { data: impRow } = await supabaseAdmin
          .from("ad_impressions")
          .select("view_count")
          .eq("ad_id", adId)
          .eq("user_email", emailLower)
          .maybeSingle();
        canCreditProgress = Number(impRow?.view_count || 0) < Math.max(1, Number(activeAd.user_frequency_cap || 1));
      }
    }

    const ua = request.headers.get("user-agent") || "";
    const deviceType = /Mobile|Android|iP(hone|od|ad)/i.test(ua) ? "mobile" : "desktop";
    const geoCountry =
      request.headers.get("x-vercel-ip-country") ||
      request.headers.get("cf-ipcountry") ||
      "Global";

    // 6. Always record CTA click analytics; ONLY credit seen impression & monetization click once per ad view
    let clicksCount: number | undefined;
    let isMonetized: boolean | undefined;
    let impressionCount: number | undefined;
    let resolvedAtwTier: string | null | undefined;
    let resolvedAtwScore: number | null | undefined;
    let resolvedIsExempt = isExemptFromBarriersAndInactivity(emailLower);
    let milestoneNotified = false;
    let monetizationUnlocked = false;
    let atwUpgraded = false;
    const nowIso = new Date(now).toISOString();

    await Promise.all([
      recordCoalescedAdClick(adId, canonicalClickType as CanonicalClickType),
      ...(canCreditProgress
        ? [
            (async () => {
              try {
                const updatedImp = await recordCoalescedAdSeen(adId, emailLower, {
                  userCap: Math.max(1, Number(activeAd.user_frequency_cap || 1)),
                  isPlatformPost: Boolean(activeAd.is_admin_post),
                  adOwnerEmail,
                  dbImpressionsTarget: Number(activeAd.impressions || 0),
                  dbImpressionCount: Number(activeAd.impression_count || 0),
                });
                if (typeof updatedImp === "number") {
                  impressionCount = updatedImp;
                }
              } catch {}
            })(),
            (async () => {
              const { data: prevUserRow } = await supabaseAdmin
                .from("users")
                .select("id, monetization_clicks, monetized, has_cancelled_monetization, atw_tier, attention_worth_score, is_affiliate, is_career")
                .eq("email", emailLower)
                .maybeSingle();

              const prevClicks = Number(prevUserRow?.monetization_clicks || 0);
              const prevMonetized =
                prevUserRow?.monetized === true ||
                prevUserRow?.monetized === "true" ||
                prevUserRow?.monetized === "yes" ||
                prevUserRow?.monetized === "1" ||
                prevUserRow?.monetized === "t";
              const hasCancelled = Boolean(prevUserRow?.has_cancelled_monetization);
              const existingAtwTier: string | null | undefined = prevUserRow?.atw_tier;
              const existingAtwScore: number | null | undefined = prevUserRow?.attention_worth_score;
              const isExempt = isExemptFromBarriersAndInactivity(emailLower, prevUserRow as any);
              resolvedIsExempt = isExempt;

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
                isMonetized = hasCancelled
                  ? false
                  : Boolean(isExempt || rpcRes.data[0].is_now_monetized || prevMonetized || clicksCount >= 500);
              } else {
                const nextDbClicks = Math.max(prevClicks + 1, liveVal || 0);
                const nextMon = hasCancelled ? false : (isExempt || prevMonetized || nextDbClicks >= 500);
                if (prevUserRow?.id) {
                  await supabaseAdmin
                    .from("users")
                    .update({
                      monetization_clicks: nextDbClicks,
                      ...(nextMon ? { monetized: "true" } : {}),
                      ...(nextMon && !prevMonetized ? { monetized_at: nowIso } : {}),
                    })
                    .eq("id", prevUserRow.id);
                }
                clicksCount = nextDbClicks;
                isMonetized = nextMon;
              }

              const tierDetails = computeAtwTierDetails(clicksCount || 0, existingAtwTier, isExempt, existingAtwScore);

              const needsUserSync =
                tierDetails.tierCode !== existingAtwTier ||
                (!hasCancelled && Boolean(isMonetized || isExempt) && !prevMonetized) ||
                (rpcCount !== null && clicksCount !== undefined && clicksCount > rpcCount);

              if (needsUserSync) {
                const syncPayload: Record<string, unknown> = {
                  atw_tier: tierDetails.tierCode,
                };
                if (rpcCount !== null && clicksCount !== undefined && clicksCount > rpcCount) {
                  syncPayload.monetization_clicks = clicksCount;
                }
                if (!hasCancelled && (isMonetized || isExempt) && !prevMonetized) {
                  syncPayload.monetized = "true";
                  syncPayload.monetized_at = nowIso;
                }
                const updateQuery = prevUserRow?.id
                  ? supabaseAdmin.from("users").update(syncPayload).eq("id", prevUserRow.id)
                  : supabaseAdmin.from("users").update(syncPayload).eq("email", emailLower);
                await Promise.resolve(updateQuery).catch(() => {});
              }

              const milestoneRes = await checkAndNotifyClickAndAtwMilestones({
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
              }).catch(() => null);

              if (milestoneRes) {
                monetizationUnlocked = Boolean(milestoneRes.monetizationNotified);
                atwUpgraded = Boolean(milestoneRes.atwNotified);
                milestoneNotified = monetizationUnlocked || atwUpgraded;
              }

              if (clicksCount !== undefined && clicksCount > 0 && isRedisReady()) {
                redisConnection.set(`user:live_clicks:v2:${emailLower}`, String(clicksCount), "EX", 86400 * 30).catch(() => {});
                redisConnection.del(`monetize:status:v2:${emailLower}`).catch(() => {});
              }
              invalidateCachedProfile(emailLower).catch(() => {});
              resolvedAtwTier = tierDetails.tierCode;
              resolvedAtwScore = existingAtwScore;
            })(),
          ]
        : []),
    ]);

    const tierDetails = computeAtwTierDetails(clicksCount || 0, resolvedAtwTier, resolvedIsExempt, resolvedAtwScore);
    if (typeof clicksCount === "number") {
      dispatchImpressionWebhook({
        event: "ad.seen",
        timestamp: Date.now(),
        data: {
          userEmail: emailLower,
          adId,
          clicksCount,
          isMonetized: Boolean(isMonetized || resolvedIsExempt),
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
      isMonetized: Boolean(isMonetized || resolvedIsExempt),
      atwTier: tierDetails.tierCode,
      holdingCap: tierDetails.isUnlimited ? null : tierDetails.holdingCap,
      impressionCount,
      milestoneNotified,
      monetizationUnlocked,
      atwUpgraded,
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/campaigns/click:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
