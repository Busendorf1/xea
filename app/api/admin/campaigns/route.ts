import { NextRequest, NextResponse } from "next/server";
import { verifyAdminUser } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { invalidateCachedUserCampaigns } from "@/lib/utils/cache";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ADMIN_CAMPAIGNS_CACHE_PREFIX = "admin:campaigns:";
const CACHE_TTL_SECONDS = 30; // 30-second TTL for instant tab switching with zero stale lag

const adminCampaignActionSchema = z.object({
  action: z.enum([
    "approve_ad",
    "reject_ad",
    "pause_ad",
    "resume_ad",
    "deactivate_ad",
    "delete_ad",
    "save_ad_edit",
    "approve_highlight",
    "reject_highlight",
    "pause_highlight",
    "resume_highlight",
    "delete_highlight",
    "save_highlight_edit",
    "direct_post_ad",
    "direct_post_highlight",
  ]),
  id: z.string().optional(),
  payload: z.record(z.string(), z.any()).optional(),
});

/**
 * Invalidate all cached campaign tabs in Redis when an admin performs an action
 */
async function invalidateAdminCampaignCache(
  adminEmail?: string,
  action?: string,
  targetId?: string,
  reason?: string,
  details?: any,
  targetUserEmail?: string
): Promise<void> {
  if (adminEmail && action) {
    await logAdminAudit(adminEmail, action, targetId, reason, details);
  }
  if (targetUserEmail) {
    await invalidateCachedUserCampaigns(targetUserEmail).catch(() => {});
  }
  if (!isRedisReady()) return;
  try {
    const keys = await redisConnection.keys(`${ADMIN_CAMPAIGNS_CACHE_PREFIX}*`);
    if (keys && keys.length > 0) {
      await redisConnection.del(keys);
    }
    // Also invalidate overview stats so pending/active counts update immediately
    await redisConnection.del("admin:overview:stats").catch(() => {});
    await redisConnection.del("admin:overview_stats").catch(() => {});

    // If campaign ad is approved, paused, resumed, or deleted, evict ad detail & feed caches
    if (action?.includes("ad")) {
      if (targetId) {
        await redisConnection.del(`ad:detail:${targetId}`).catch(() => {});
      }
      const feedKeys = await redisConnection.keys("feed:ads:*");
      if (feedKeys && feedKeys.length > 0) {
        await redisConnection.del(feedKeys);
      }
    }

    // If highlight is approved, paused, resumed, or deleted, evict highlights feed caches
    if (action?.includes("highlight")) {
      const highlightKeys = await redisConnection.keys("highlights:*");
      if (highlightKeys && highlightKeys.length > 0) {
        await redisConnection.del(highlightKeys);
      }
    }
  } catch (err) {
    console.warn("⚠️ Failed to invalidate admin campaign cache:", err);
  }
}

/**
 * Record an entry in public.admin_audit_logs
 */
async function logAdminAudit(adminEmail: string, action: string, targetId?: string, reason?: string, details?: any): Promise<void> {
  try {
    await supabaseAdmin.from("admin_audit_logs").insert([{
      admin_email: adminEmail.toLowerCase(),
      action,
      target_id: targetId || null,
      target_type: "campaign",
      reason: reason || null,
      new_state: details ? JSON.parse(JSON.stringify(details)) : null,
    }]);
  } catch (e) {
    console.warn("⚠️ Failed to write admin campaign audit log:", e);
  }
}

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
    const search = (searchParams.get("search") || "").trim();

    const cacheKey = `${ADMIN_CAMPAIGNS_CACHE_PREFIX}${tab}:${page}:${limit}:${search.toLowerCase()}`;

    // 1. Check Redis Cache for ultra-fast response (<2ms)
    if (isRedisReady()) {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          return NextResponse.json({ ...JSON.parse(cached), cached: true }, {
            headers: {
              "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
              "X-Cache": "HIT",
            },
          });
        }
      } catch (err) {
        console.warn("⚠️ Redis cache read error in /api/admin/campaigns:", err);
      }
    }

    // 2. Execute query on Read Replica Database with exact pagination range
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

    let query = supabaseReadOnly.from(targetTable).select("*", { count: "exact" });

    // Apply search filters efficiently
    if (search) {
      if (isHighlight) {
        query = query.or(
          `title.ilike.%${search}%,content.ilike.%${search}%,user_email.ilike.%${search}%,interest.ilike.%${search}%`
        );
      } else {
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(search);
        if (isUuid) {
          query = query.or(
            `id.eq.${search},ad_content.ilike.%${search}%,user_email.ilike.%${search}%,ad_type.ilike.%${search}%`
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

    // Fetch publisher profiles to enrich campaign items
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
      const pubName = prof?.business_name || (prof?.firstName ? `${prof.firstName} ${prof.lastName || ""}`.trim() : null) || item.custom_sponsor_name || null;
      const pubHandle = prof?.username ? `@${prof.username.replace(/^@/, "")}` : (item.custom_sponsor_handle ? `@${item.custom_sponsor_handle.replace(/^@/, "")}` : (item.user_email ? `@${item.user_email.split("@")[0]}` : "@user"));

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

    // 3. Cache response in Redis for fast pagination & tab hopping
    if (isRedisReady()) {
      redisConnection.set(cacheKey, JSON.stringify(responseData), "EX", CACHE_TTL_SECONDS).catch(() => {});
    }

    return NextResponse.json(responseData);
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
      return NextResponse.json({ error: "Invalid action payload", details: parseResult.error.format() }, { status: 400 });
    }

    const { action, id, payload } = parseResult.data;
    const now = new Date().toISOString();
    const adminEmail = admin.email.toLowerCase();

    // 1. APPROVE AD CAMPAIGN
    if (action === "approve_ad") {
      if (!id) return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });

      // Fetch ad from pending queue
      const { data: pendingAd, error: fetchErr } = await supabaseAdmin
        .from("adds")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr || !pendingAd) {
        return NextResponse.json({ error: "Ad not found in pending review queue" }, { status: 404 });
      }

      const activeAd = {
        ...pendingAd,
        is_paused: false,
        approved_at: now,
      };

      // Insert into active ads
      const { error: insertErr } = await supabaseAdmin.from("addsactive").insert([activeAd]);
      if (insertErr) throw insertErr;

      // Delete from pending queue
      await supabaseAdmin.from("adds").delete().eq("id", id);

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, pendingAd.user_email);
      return NextResponse.json({ success: true, message: "Ad approved and published to active feed!" });
    }

    // 2. REJECT AD CAMPAIGN
    if (action === "reject_ad") {
      if (!id) return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });

      // Optional refund & notification
      const { data: adToDelete } = await supabaseAdmin.from("adds").select("user_email, total_cost").eq("id", id).maybeSingle();
      if (adToDelete?.user_email && payload?.refund) {
        const refundAmount = Number(adToDelete.total_cost || 0);
        if (refundAmount > 0) {
          const { data: userRecord } = await supabaseAdmin.from("users").select("balance").ilike("email", adToDelete.user_email).maybeSingle();
          if (userRecord) {
            const newBal = (Number(userRecord.balance) || 0) + refundAmount;
            await supabaseAdmin.from("users").update({ balance: newBal }).ilike("email", adToDelete.user_email);
          }
        }
      }

      await supabaseAdmin.from("adds").delete().eq("id", id);
      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, adToDelete?.user_email);
      return NextResponse.json({ success: true, message: "Ad campaign rejected." });
    }

    // 3. PAUSE / RESUME AD CAMPAIGN
    if (action === "pause_ad" || action === "resume_ad") {
      if (!id) return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });

      const isPaused = action === "pause_ad";
      const updateData: any = { is_paused: isPaused };
      if (payload?.statement) {
        updateData.admin_statement = payload.statement;
      }

      // Update in both active and pending tables
      await Promise.all([
        supabaseAdmin.from("addsactive").update(updateData).eq("id", id),
        supabaseAdmin.from("adds").update(updateData).eq("id", id),
      ]);

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload);
      return NextResponse.json({ success: true, message: `Ad campaign ${isPaused ? "paused" : "resumed"} successfully.` });
    }

    // 4. DEACTIVATE AD CAMPAIGN
    if (action === "deactivate_ad") {
      if (!id) return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });

      const updateData: any = {
        completed_at: now,
        is_paused: true,
      };
      if (payload?.statement) {
        updateData.admin_statement = payload.statement;
      }

      await Promise.all([
        supabaseAdmin.from("addsactive").update(updateData).eq("id", id),
        supabaseAdmin.from("adds").update(updateData).eq("id", id),
      ]);

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload);
      return NextResponse.json({ success: true, message: "Ad campaign deactivated successfully." });
    }

    // 5. DELETE AD CAMPAIGN
    if (action === "delete_ad") {
      if (!id) return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });

      await Promise.all([
        supabaseAdmin.from("addsactive").delete().eq("id", id),
        supabaseAdmin.from("adds").delete().eq("id", id),
      ]);

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload);
      return NextResponse.json({ success: true, message: "Ad campaign deleted permanently." });
    }

    // 6. SAVE AD EDIT
    if (action === "save_ad_edit") {
      if (!id || !payload) return NextResponse.json({ error: "Ad ID and payload are required" }, { status: 400 });

      const { id: _, created_at: __, ...fieldsToUpdate } = payload;
      await Promise.all([
        supabaseAdmin.from("addsactive").update(fieldsToUpdate).eq("id", id),
        supabaseAdmin.from("adds").update(fieldsToUpdate).eq("id", id),
      ]);

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload);
      return NextResponse.json({ success: true, message: "Ad details updated successfully." });
    }

    // 7. APPROVE HIGHLIGHT
    if (action === "approve_highlight") {
      if (!id) return NextResponse.json({ error: "Highlight ID is required" }, { status: 400 });

      const { data: pendingHighlight, error: fetchHlErr } = await supabaseAdmin
        .from("news")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (fetchHlErr || !pendingHighlight) {
        return NextResponse.json({ error: "Highlight not found in pending review queue" }, { status: 404 });
      }

      const activeHighlight = {
        ...pendingHighlight,
        is_paused: false,
        created_at: now,
      };

      const { error: insertHlErr } = await supabaseAdmin.from("newsactive").insert([activeHighlight]);
      if (insertHlErr) throw insertHlErr;

      await supabaseAdmin.from("news").delete().eq("id", id);
      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, pendingHighlight.user_email);
      return NextResponse.json({ success: true, message: "Highlight approved and published to active feed!" });
    }

    // 8. REJECT HIGHLIGHT
    if (action === "reject_highlight") {
      if (!id) return NextResponse.json({ error: "Highlight ID is required" }, { status: 400 });

      const { data: hlToDelete } = await supabaseAdmin.from("news").select("user_email").eq("id", id).maybeSingle();
      await supabaseAdmin.from("news").delete().eq("id", id);
      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, hlToDelete?.user_email);
      return NextResponse.json({ success: true, message: "Highlight rejected and deleted." });
    }

    // 9. PAUSE / RESUME HIGHLIGHT
    if (action === "pause_highlight" || action === "resume_highlight") {
      if (!id) return NextResponse.json({ error: "Highlight ID is required" }, { status: 400 });

      const isPaused = action === "pause_highlight";
      await supabaseAdmin.from("newsactive").update({ is_paused: isPaused }).eq("id", id);

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload);
      return NextResponse.json({ success: true, message: `Highlight ${isPaused ? "paused" : "resumed"} successfully.` });
    }

    // 10. DELETE HIGHLIGHT
    if (action === "delete_highlight") {
      if (!id) return NextResponse.json({ error: "Highlight ID is required" }, { status: 400 });

      await Promise.all([
        supabaseAdmin.from("newsactive").delete().eq("id", id),
        supabaseAdmin.from("news").delete().eq("id", id),
      ]);

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload);
      return NextResponse.json({ success: true, message: "Highlight deleted successfully." });
    }

    // 10b. SAVE HIGHLIGHT EDIT
    if (action === "save_highlight_edit") {
      if (!id || !payload) return NextResponse.json({ error: "Highlight ID and payload are required" }, { status: 400 });

      const { id: _, created_at: __, ...fieldsToUpdate } = payload;
      await Promise.all([
        supabaseAdmin.from("newsactive").update(fieldsToUpdate).eq("id", id),
        supabaseAdmin.from("news").update(fieldsToUpdate).eq("id", id),
      ]);

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload);
      return NextResponse.json({ success: true, message: "Highlight details updated successfully." });
    }

    // 11. DIRECT POST AD (Route straight to active addsactive!)
    if (action === "direct_post_ad") {
      if (!payload) return NextResponse.json({ error: "Payload is required" }, { status: 400 });

      const adRecord = {
        ...payload,
        is_paused: false,
        is_admin_post: true,
        created_at: now,
      };

      const { error: directAdErr } = await supabaseAdmin.from("addsactive").insert([adRecord]);
      if (directAdErr) throw directAdErr;

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload);
      return NextResponse.json({ success: true, message: "Ad published directly to active feed!" });
    }

    // 12. DIRECT POST HIGHLIGHT (Route straight to active newsactive!)
    if (action === "direct_post_highlight") {
      if (!payload) return NextResponse.json({ error: "Payload is required" }, { status: 400 });

      const highlightRecord = {
        ...payload,
        is_paused: false,
        is_admin_post: true,
        created_at: now,
      };

      const { error: directHlErr } = await supabaseAdmin.from("newsactive").insert([highlightRecord]);
      if (directHlErr) throw directHlErr;

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload);
      return NextResponse.json({ success: true, message: "Highlight published directly to active feed!" });
    }

    return NextResponse.json({ error: "Unhandled action" }, { status: 400 });
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/admin/campaigns:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
