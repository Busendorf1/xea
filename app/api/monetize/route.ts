import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import redisConnection, { isRedisReady } from "@/lib/redis";

export const dynamic = "force-dynamic";

const MONETIZE_STATUS_TTL_SECONDS = 15;

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const cacheKey = `monetize:status:${emailLower}`;

    // 1. Edge Redis Cache Read Path for Ultra-Low Latency (<5ms response time)
    if (isRedisReady()) {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          return NextResponse.json(JSON.parse(cached), {
            headers: {
              "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
            },
          });
        }
      } catch (e: any) {
        if (e?.message !== "Connection is closed.") {
          console.warn("⚠️ Redis get notice in /api/monetize:", e.message || e);
        }
      }
    }

    // 2. High-Scale Direct Query Path (Fast Index Read, ~10ms)
    const { data: uData, error: uErr } = await supabaseReadOnly
      .from("users")
      .select("monetized, monetization_clicks, referral_downloads_count, referral_code, atw_tier, last_active_at, created_at")
      .eq("email", emailLower)
      .maybeSingle();

    let payload: any;

    // Check live real-time clicks from Redis counter (instant real-time updates)
    let liveClicksDelta = 0;
    try {
      const liveVal = await redisConnection.get(`user:live_clicks:${emailLower}`);
      if (liveVal) liveClicksDelta = Number(liveVal) || 0;
    } catch {}

    if (uErr || !uData) {
      // Fallback to RPC if single-read fails or user row not found
      const { data: statusData } = await supabaseAdmin.rpc("check_and_update_monetization_status", {
        p_email: emailLower,
      });

      const row = statusData?.[0];
      const clicksCount = Math.max(Number(row?.monetization_clicks || 0), liveClicksDelta);
      const invitesCount = Number(row?.referral_downloads_count || 0);
      const isMonetized = !!row?.monetized || clicksCount >= 300;

      payload = {
        success: true,
        isMonetized,
        clicksCount,
        clicksRemaining: Math.max(0, 300 - clicksCount),
        targetClicks: 300,
        invitesCount,
        invitesRemaining: Number(row?.invites_remaining || Math.max(0, 12 - invitesCount)),
        targetInvites: 12,
        atwTier: row?.atw_tier || "ATW1",
        daysInactive: Number(row?.days_inactive || 0),
        statusMessage: row?.status_message || null,
      };
    } else {
      const dbClicks = uData.monetization_clicks ?? 0;
      const clicks = Math.max(dbClicks, liveClicksDelta);
      const invites = uData.referral_downloads_count ?? 0;
      const isMonetized = !!(
        uData.monetized === "true" ||
        uData.monetized === "yes" ||
        uData.monetized === true ||
        clicks >= 300 ||
        invites >= 12
      );

      // Fast in-memory calculation of inactive days
      let daysInactive = 0;
      if (uData.last_active_at) {
        const lastActive = new Date(uData.last_active_at).getTime();
        const now = Date.now();
        daysInactive = Math.max(0, Math.floor((now - lastActive) / (1000 * 60 * 60 * 24)));
      }

      const { calculateAtwTier } = await import("@/lib/referralEngine");
      const { tier: computedTier } = calculateAtwTier(clicks, invites);

      payload = {
        success: true,
        isMonetized,
        clicksCount: clicks,
        clicksRemaining: Math.max(0, 300 - clicks),
        targetClicks: 300,
        invitesCount: invites,
        invitesRemaining: Math.max(0, 12 - invites),
        targetInvites: 12,
        atwTier: uData.atw_tier || computedTier,
        referralCode: uData.referral_code || null,
        daysInactive,
        lastActiveAt: uData.last_active_at || null,
      };

      // Asynchronously trigger status update check in background if inactive >= 7 days
      if (isMonetized && daysInactive >= 7) {
        Promise.resolve(supabaseAdmin.rpc("check_and_update_monetization_status", { p_email: emailLower })).catch(() => {});
      }
    }

    // Cache payload in Redis to absorb traffic surges
    redisConnection.set(cacheKey, JSON.stringify(payload), "EX", MONETIZE_STATUS_TTL_SECONDS).catch(() => {});

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
      },
    });
  } catch (err: any) {
    console.error("❌ Error in GET /api/monetize:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();

    // Increment click progress atomically
    const { data, error } = await supabaseAdmin.rpc("increment_user_click_progress", {
      p_email: emailLower,
    });

    if (error) {
      console.error("❌ RPC increment_user_click_progress error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    invalidateCachedProfile(emailLower).catch(() => {});
    redisConnection.del(`monetize:status:${emailLower}`).catch(() => {});

    const row = data?.[0] || { new_click_count: 0, is_now_monetized: false };
    return NextResponse.json({
      success: true,
      clicksCount: Number(row.new_click_count || 0),
      clicksRemaining: Math.max(0, 300 - Number(row.new_click_count || 0)),
      isMonetized: !!row.is_now_monetized,
    });
  } catch (err: any) {
    console.error("❌ Error in POST /api/monetize:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
