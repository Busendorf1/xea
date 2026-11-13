import { NextRequest, NextResponse } from "next/server";
import { verifyAdminUser } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import {
  ADMIN_CAMPAIGNS_CACHE_PREFIX,
  CACHE_TTL_SECONDS,
  adminCampaignActionSchema,
  sanitizePostgrestSearch,
} from "@/lib/admin/adminCampaignShared";
import { handleAdminAdCampaignAction } from "@/lib/admin/adminCampaignAdActions";
import { handleAdminHighlightCampaignAction } from "@/lib/admin/adminCampaignHighlightActions";

export const dynamic = "force-dynamic";

const AD_ACTIONS = new Set([
  "approve_ad",
  "reject_ad",
  "pause_ad",
  "resume_ad",
  "deactivate_ad",
  "delete_ad",
  "save_ad_edit",
  "direct_post_ad",
]);

const HIGHLIGHT_ACTIONS = new Set([
  "approve_highlight",
  "reject_highlight",
  "pause_highlight",
  "resume_highlight",
  "delete_highlight",
  "save_highlight_edit",
  "direct_post_highlight",
]);

/**
 * GET /api/admin/campaigns?tab=active-ads&page=0&limit=10&search=
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "active-ads";
    const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10), 1), 50);
    const rawSearch = (searchParams.get("search") || "").trim();
    const search = sanitizePostgrestSearch(rawSearch);
    const fresh = searchParams.get("fresh") === "true";

    const cacheKey = `${ADMIN_CAMPAIGNS_CACHE_PREFIX}${tab}:${page}:${limit}:${search.toLowerCase()}`;

    if (!fresh && isRedisReady()) {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          return NextResponse.json(
            { ...JSON.parse(cached), cached: true },
            {
              headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "X-Cache": "HIT",
              },
            }
          );
        }
      } catch (err) {
        console.warn("⚠️ Redis cache read error in /api/admin/campaigns:", err);
      }
    }

    let targetTable = "addsactive";
    let isHighlight = false;

    if (tab === "ad-approvals") {
      targetTable = "adds";
    } else if (tab === "active-ads") {
      targetTable = "addsactive";
    } else if (tab === "highlight-approvals") {
      targetTable = "news";
      isHighlight = true;
    } else if (tab === "active-highlights") {
      targetTable = "newsactive";
      isHighlight = true;
    } else {
      return NextResponse.json({ error: `Invalid tab parameter: ${tab}` }, { status: 400 });
    }

    const dbClient = fresh ? supabaseAdmin : supabaseReadOnly;
    let query = dbClient.from(targetTable).select("*", { count: "exact" });

    if (search) {
      if (isHighlight) {
        query = query.or(
          `title.ilike.%${search}%,content.ilike.%${search}%,user_email.ilike.%${search}%,interest.ilike.%${search}%`
        );
      } else {
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(rawSearch);
        if (isUuid) {
          query = query.or(
            `id.eq.${rawSearch},ad_content.ilike.%${search}%,user_email.ilike.%${search}%,ad_type.ilike.%${search}%`
          );
        } else {
          query = query.or(
            `ad_content.ilike.%${search}%,user_email.ilike.%${search}%,ad_type.ilike.%${search}%`
          );
        }
      }
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (error) {
      console.error(`❌ Error fetching admin campaigns for ${tab}:`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rawItems = data || [];
    const emails = Array.from(new Set(rawItems.map((item: any) => item.user_email).filter(Boolean)));
    const profilesMap: Record<string, any> = {};

    if (emails.length > 0) {
      const { data: users } = await supabaseReadOnly
        .from("users")
        .select("email, username, business_name, firstName, lastName")
        .in("email", emails);

      (users || []).forEach((u: any) => {
        if (u.email) {
          profilesMap[u.email.toLowerCase()] = u;
        }
      });
    }

    const enrichedData = rawItems.map((item: any) => {
      const emailLower = (item.user_email || "").toLowerCase();
      const prof = profilesMap[emailLower] || null;
      const pubName =
        prof?.business_name ||
        (prof?.firstName ? `${prof.firstName} ${prof.lastName || ""}`.trim() : null) ||
        item.custom_sponsor_name ||
        null;
      const pubHandle = prof?.username
        ? `@${prof.username.replace(/^@/, "")}`
        : item.custom_sponsor_handle
          ? `@${item.custom_sponsor_handle.replace(/^@/, "")}`
          : item.user_email
            ? `@${item.user_email.split("@")[0]}`
            : "@user";

      return {
        ...item,
        publisher_name: pubName,
        publisher_handle: pubHandle,
        publisher_email: item.user_email,
      };
    });

    const responseData = {
      success: true,
      tab,
      data: enrichedData,
      count: count || 0,
      page,
      limit,
      cached: false,
    };

    if (isRedisReady()) {
      redisConnection.set(cacheKey, JSON.stringify(responseData), "EX", CACHE_TTL_SECONDS).catch(() => {});
    }

    return NextResponse.json(responseData, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/admin/campaigns:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/campaigns (Action handler)
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdminUser(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const rawBody = await req.json();
    const parseResult = adminCampaignActionSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid action payload", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const { action, id, payload } = parseResult.data;
    const now = new Date().toISOString();
    const adminEmail = admin.email.toLowerCase();

    if (AD_ACTIONS.has(action)) {
      return await handleAdminAdCampaignAction(action, adminEmail, now, id, payload);
    }

    if (HIGHLIGHT_ACTIONS.has(action)) {
      return await handleAdminHighlightCampaignAction(action, adminEmail, now, id, payload);
    }

    return NextResponse.json({ error: "Unhandled action" }, { status: 400 });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/admin/campaigns:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
