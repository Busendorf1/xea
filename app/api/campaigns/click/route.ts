import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import redisConnection, { isRedisReady } from "@/lib/redis";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { streamImpressionsToClickHouse } from "@/lib/clickhouse";
import {
  incrementCachedMonetizationClicks,
  invalidateCachedUserCampaigns,
} from "@/lib/utils/cache";
import { recordCoalescedAdClick, CanonicalClickType } from "@/lib/impressionBuffer";

// L1 In-Memory click deduplication map (15s TTL) so CTA clicks never fail when Redis is in quota cooldown
const l1ClickLocks = new Map<string, number>();

const CLICK_TYPE_CANONICAL_MAP: Record<string, string> = {
  phone: "phone",
  whatsapp: "whatsapp",
  website: "website",
  visit_website: "website",
  brand_visit: "website",
  email: "email",
  ios: "ios",
  android: "android",
  read_more: "read_more",
  watch_now: "watch_now",
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
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { adId, clickType } = body;

    if (!adId || !clickType) {
      return NextResponse.json({ error: "Missing adId or clickType" }, { status: 400 });
    }

    const rawClickType = String(clickType).toLowerCase().trim();
    const canonicalClickType = CLICK_TYPE_CANONICAL_MAP[rawClickType];
    if (!canonicalClickType) {
      return NextResponse.json({ error: "Invalid clickType" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();
    const now = Date.now();
    const lockKey = `lock:click:${emailLower}:${adId}:${canonicalClickType}`;

    // 1. L1 In-Memory 15s deduplication check
    const existingL1 = l1ClickLocks.get(lockKey);
    if (existingL1 && existingL1 > now) {
      return NextResponse.json({ success: true, duplicate: true });
    }
    l1ClickLocks.set(lockKey, now + 15000);
    if (l1ClickLocks.size > 5000) {
      for (const [k, exp] of l1ClickLocks) {
        if (exp <= now) l1ClickLocks.delete(k);
      }
    }

    // 2. L2 Redis 15s deduplication check (only enforced when Redis is ready)
    if (isRedisReady()) {
      const lockAcquired = await redisConnection.set(lockKey, "1", "EX", 15, "NX").catch(() => "OK");
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

    // 3. Persist click via Hot-Row Coalescing Write-Behind Batcher (0ms on idle, batched on burst) & increment monetization progress
    await Promise.all([
      recordCoalescedAdClick(adId, canonicalClickType as CanonicalClickType),
      incrementCachedMonetizationClicks(emailLower, 1).catch(() => 0),
    ]);

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
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/campaigns/click:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
