import { NextRequest, NextResponse } from "next/server";
import { verifyAdminUser } from "@/lib/authHelper";
import { isAdminEmail } from "@/lib/adminHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady, scanDeletePattern } from "@/lib/redis";
import { invalidateCachedUserCampaigns } from "@/lib/utils/cache";
import { purgeStorageMedia } from "@/lib/utils/storageCleaner";
import { dispatchFeedDropWebhook } from "@/lib/webhookDispatcher";
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
  const tasks: Promise<any>[] = [];

  if (adminEmail && action) {
    tasks.push(logAdminAudit(adminEmail, action, targetId, reason, details).catch((e) => console.warn("Audit log error:", e)));
  }
  if (targetUserEmail) {
    tasks.push(invalidateCachedUserCampaigns(targetUserEmail).catch(() => {}));
  }

  if (isRedisReady()) {
    tasks.push((async () => {
      try {
        const pipeline = redisConnection.pipeline();
        pipeline.del("admin:overview:stats");
        pipeline.del("admin:overview_stats");
        pipeline.del(`${ADMIN_CAMPAIGNS_CACHE_PREFIX}active-ads:0:10:`);
        pipeline.del(`${ADMIN_CAMPAIGNS_CACHE_PREFIX}ad-approvals:0:10:`);
        pipeline.del(`${ADMIN_CAMPAIGNS_CACHE_PREFIX}active-highlights:0:10:`);
        pipeline.del(`${ADMIN_CAMPAIGNS_CACHE_PREFIX}highlight-approvals:0:10:`);
        if (targetId) {
          pipeline.del(`ad:detail:${targetId}`);
        }
        await pipeline.exec().catch(() => {});

        const scanTasks: Promise<unknown>[] = [
          scanDeletePattern(`${ADMIN_CAMPAIGNS_CACHE_PREFIX}*`),
        ];
        if (action?.includes("ad")) {
          scanTasks.push(scanDeletePattern("feed:ads:*"));
          scanTasks.push(scanDeletePattern("feed:ad_ids:*"));
        }
        if (action?.includes("highlight")) {
          scanTasks.push(scanDeletePattern("highlights:*"));
        }
        await Promise.all(scanTasks);
      } catch (err) {
        console.warn("⚠️ Failed to invalidate admin campaign cache:", err);
      }
    })());
  }

  // Allow up to 450ms for critical Redis + user campaign cache evictions before releasing response
  await Promise.race([
    Promise.all(tasks),
    new Promise((resolve) => setTimeout(resolve, 450)),
  ]);
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
    const fresh = searchParams.get("fresh") === "true";

    const cacheKey = `${ADMIN_CAMPAIGNS_CACHE_PREFIX}${tab}:${page}:${limit}:${search.toLowerCase()}`;

    // 1. Check Redis Cache for ultra-fast response (<2ms) unless fresh=true
    if (!fresh && isRedisReady()) {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          return NextResponse.json({ ...JSON.parse(cached), cached: true }, {
            headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate",
              "X-Cache": "HIT",
            },
          });
        }
      } catch (err) {
        console.warn("⚠️ Redis cache read error in /api/admin/campaigns:", err);
      }
    }

    // 2. Execute query on Primary DB when fresh=true (zero replication lag after mutations), otherwise Read Replica
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

      // Block duplicate approval if already approved
      if (pendingAd.admin_statement?.startsWith("APPROVED:") || pendingAd.status === "approved") {
        return NextResponse.json({
          success: true,
          message: "Ad campaign has already been approved and is awaiting payment.",
        });
      }

      // Check if this ad exists in addsactive (an active delivering campaign edit)
      const { data: activeAd } = await supabaseAdmin
        .from("addsactive")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      const isDeliveringActive = !!activeAd;
      const isBudgetIncreased = pendingAd.payment_status === "unpaid" && Number(pendingAd.total_cost || 0) > Number(activeAd?.total_cost || 0);

      // If active delivering ad and user didn't increase budget: DO NOT REQUIRE PAYMENT!
      if (isDeliveringActive && !isBudgetIncreased) {
        const {
          status: _s,
          approved_at: _a,
          payment_status: _p,
          impression_count: _ic,
          seen_users: _su,
          created_at: _ca,
          id: _id,
          ...updatedFields
        } = pendingAd;

        const { error: updateActiveErr } = await supabaseAdmin
          .from("addsactive")
          .update(updatedFields)
          .eq("id", id);

        if (updateActiveErr) throw updateActiveErr;

        // Clean up review draft from adds
        await supabaseAdmin.from("adds").delete().eq("id", id);

        const notifRow = {
          user_email: pendingAd.user_email,
          title: "Ad Edit Live",
          message: "Your ad edit was approved and applied to your live campaign.",
        };
        await supabaseAdmin.from("notifications").insert([notifRow]);
        const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
        dispatchNotificationWebhook(notifRow).catch(() => {});

        await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, pendingAd.user_email);
        return NextResponse.json({
          success: true,
          message: "Active ad edit approved! Applied directly to live campaign without requiring payment.",
        });
      }

      // Advertiser Campaign: Approve and require publisher to pay to publish within 3 days
      const approvedStatement = `APPROVED:${now}`;
      await supabaseAdmin
        .from("adds")
        .update({
          admin_statement: approvedStatement,
          is_paused: false,
        })
        .eq("id", id);

      const notifRow = {
        user_email: pendingAd.user_email,
        title: "Ad Approved",
        message: "Your ad is approved! Complete payment in My Ads within 3 days to go live.",
      };
      await supabaseAdmin.from("notifications").insert([notifRow]);
      const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
      dispatchNotificationWebhook(notifRow).catch(() => {});

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, pendingAd.user_email);
      return NextResponse.json({
        success: true,
        message: "Ad campaign approved! Advertiser has 3 days to publish and pay.",
      });
    }

    // 2. REJECT AD CAMPAIGN (With Admin Feedback for Advertiser to Adjust)
    if (action === "reject_ad") {
      if (!id) return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });

      const { data: adToReject } = await supabaseAdmin
        .from("adds")
        .select("user_email, total_cost, ad_media, ad_media_url")
        .eq("id", id)
        .maybeSingle();

      if (!adToReject) {
        return NextResponse.json({ error: "Ad not found" }, { status: 404 });
      }

      const feedbackReason = payload?.statement || payload?.reason || "Did not meet advertising guidelines.";
      const rejectStatement = `REJECTED:${feedbackReason}`;

      await supabaseAdmin
        .from("adds")
        .update({
          admin_statement: rejectStatement,
          is_paused: true,
        })
        .eq("id", id);

      await supabaseAdmin.from("notifications").insert([
        {
          user_email: adToReject.user_email,
          title: "Ad Revision Requested",
          message: `Admin feedback: "${feedbackReason}". Please visit My Ads to edit and re-submit your campaign.`,
        },
      ]);

      await invalidateAdminCampaignCache(adminEmail, action, id, feedbackReason, payload, adToReject.user_email);
      return NextResponse.json({ success: true, message: "Feedback dropped. Advertiser can now review and adjust the campaign." });
    }

    // 3. PAUSE / RESUME AD CAMPAIGN
    if (action === "pause_ad" || action === "resume_ad") {
      if (!id) return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });

      const isPaused = action === "pause_ad";
      const activeUpdateData: Record<string, any> = { is_paused: isPaused };
      const pendingUpdateData: Record<string, any> = { is_paused: isPaused };

      if (isPaused) {
        if (payload?.statement !== undefined && payload?.statement !== null) {
          const cleanStmt = String(payload.statement).trim() || null;
          activeUpdateData.admin_statement = cleanStmt;
          pendingUpdateData.admin_statement = cleanStmt;
        }
      } else {
        // Resuming ad: clear any admin pause statement so advertiser/UI sees the ad as active and unpaused
        activeUpdateData.admin_statement = null;

        const { data: existingPending } = await supabaseAdmin
          .from("adds")
          .select("admin_statement")
          .eq("id", id)
          .maybeSingle();

        const pendingStmt = String(existingPending?.admin_statement || "").trim();
        if (
          pendingStmt &&
          !pendingStmt.startsWith("APPROVED:") &&
          !pendingStmt.startsWith("REJECTED:") &&
          !pendingStmt.toLowerCase().startsWith("status:")
        ) {
          pendingUpdateData.admin_statement = null;
        }
      }

      // Update in both active and pending tables
      const [activeRes, pendingRes] = await Promise.all([
        supabaseAdmin.from("addsactive").update(activeUpdateData).eq("id", id).select("*").maybeSingle(),
        supabaseAdmin.from("adds").update(pendingUpdateData).eq("id", id).select("user_email").maybeSingle(),
      ]);

      if (!isPaused && activeRes?.data) {
        dispatchFeedDropWebhook(activeRes.data).catch(() => {});
      }

      const targetEmail = activeRes?.data?.user_email || pendingRes?.data?.user_email;
      await invalidateAdminCampaignCache(
        adminEmail,
        action,
        id,
        payload?.statement || payload?.reason,
        payload,
        targetEmail
      );
      return NextResponse.json({
        success: true,
        is_paused: isPaused,
        ad: activeRes?.data || null,
        message: `Ad campaign ${isPaused ? "paused" : "resumed"} successfully.`,
      });
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

      // Purge uploaded media from ad-media bucket
      const [{ data: activeAd }, { data: pendingAd }] = await Promise.all([
        supabaseAdmin.from("addsactive").select("ad_media, ad_media_url, user_email").eq("id", id).maybeSingle(),
        supabaseAdmin.from("adds").select("ad_media, ad_media_url, user_email").eq("id", id).maybeSingle(),
      ]);

      const targetEmail = activeAd?.user_email || pendingAd?.user_email;
      const mediaUrls = activeAd?.ad_media || activeAd?.ad_media_url || pendingAd?.ad_media || pendingAd?.ad_media_url;
      if (mediaUrls) {
        await purgeStorageMedia(mediaUrls, "ad-media").catch(() => {});
      }

      // Clean up related tracking/report records safely
      await Promise.allSettled([
        supabaseAdmin.from("bidded_ads").delete().eq("ad_id", id),
        supabaseAdmin.from("ad_reports").delete().eq("ad_id", id),
        supabaseAdmin.from("blocked_ads").delete().eq("ad_id", id),
        supabaseAdmin.from("completed_ads").delete().eq("id", id),
      ]);

      const [delActive, delPending] = await Promise.all([
        supabaseAdmin.from("addsactive").delete().eq("id", id),
        supabaseAdmin.from("adds").delete().eq("id", id),
      ]);

      if (delActive.error && delPending.error) {
        console.error("❌ Error deleting ad:", delActive.error, delPending.error);
        return NextResponse.json({ error: delActive.error.message || delPending.error.message }, { status: 500 });
      }

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, targetEmail);
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

      // Block duplicate approval if already approved
      if (pendingHighlight.admin_statement?.startsWith("APPROVED:") || pendingHighlight.status === "approved") {
        return NextResponse.json({
          success: true,
          message: "Highlight has already been approved and is awaiting payment.",
        });
      }

      // Check if this highlight exists in newsactive (an active delivering highlight edit)
      const { data: activeHl } = await supabaseAdmin
        .from("newsactive")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      const isDeliveringActive = !!activeHl;
      const origDays = activeHl?.campaign_days || 1;
      const origRate = activeHl?.is_bidded && activeHl?.bid_price ? Number(activeHl.bid_price) : 1000;
      const origCost = origDays * origRate;
      const newDays = pendingHighlight.campaign_days || 1;
      const newRate = pendingHighlight.is_bidded && pendingHighlight.bid_price ? Number(pendingHighlight.bid_price) : 1000;
      const newCost = newDays * newRate;
      const isBudgetIncreased = pendingHighlight.payment_status === "unpaid" && newCost > origCost;

      // If active delivering highlight and user didn't increase budget: DO NOT REQUIRE PAYMENT!
      if (isDeliveringActive && !isBudgetIncreased) {
        const {
          status: _s,
          approved_at: _a,
          payment_status: _p,
          is_admin_post: _ap,
          created_at: _ca,
          id: _id,
          ...updatedHlFields
        } = pendingHighlight;

        const { error: updateActiveErr } = await supabaseAdmin
          .from("newsactive")
          .update(updatedHlFields)
          .eq("id", id);

        if (updateActiveErr) throw updateActiveErr;

        // Clean up review draft from news
        await supabaseAdmin.from("news").delete().eq("id", id);

        const notifRow = {
          user_email: pendingHighlight.user_email,
          title: "Highlight Edit Live",
          message: "Your highlight edit was approved and applied to your live highlight.",
        };
        await supabaseAdmin.from("notifications").insert([notifRow]);
        const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
        dispatchNotificationWebhook(notifRow).catch(() => {});

        await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, pendingHighlight.user_email);
        return NextResponse.json({
          success: true,
          message: "Active highlight edit approved! Applied directly to live feed without requiring payment.",
        });
      }

      const approvedStatement = `APPROVED:${now}`;
      await supabaseAdmin
        .from("news")
        .update({
          admin_statement: approvedStatement,
          is_paused: false,
        })
        .eq("id", id);

      const notifRow = {
        user_email: pendingHighlight.user_email,
        title: "Highlight Approved",
        message: "Your highlight is approved! Complete payment in My Highlights to go live.",
      };
      await supabaseAdmin.from("notifications").insert([notifRow]);
      const { dispatchNotificationWebhook } = await import("@/lib/webhookDispatcher");
      dispatchNotificationWebhook(notifRow).catch(() => {});

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, pendingHighlight.user_email);
      return NextResponse.json({ success: true, message: "Highlight approved! Advertiser has 3 days to publish and pay." });
    }

    // 8. REJECT HIGHLIGHT
    if (action === "reject_highlight") {
      if (!id) return NextResponse.json({ error: "Highlight ID is required" }, { status: 400 });

      const { data: hlToReject } = await supabaseAdmin
        .from("news")
        .select("user_email, image_url")
        .eq("id", id)
        .maybeSingle();

      if (!hlToReject) {
        return NextResponse.json({ error: "Highlight not found" }, { status: 404 });
      }

      const feedbackReason = payload?.statement || payload?.reason || "Did not meet highlight guidelines.";
      const rejectStatement = `REJECTED:${feedbackReason}`;

      await supabaseAdmin
        .from("news")
        .update({
          admin_statement: rejectStatement,
          is_paused: true,
        })
        .eq("id", id);

      await supabaseAdmin.from("notifications").insert([
        {
          user_email: hlToReject.user_email,
          title: "Highlight Revision Requested",
          message: `Admin feedback: "${feedbackReason}". Please visit My Highlights to adjust.`,
        },
      ]);

      await invalidateAdminCampaignCache(adminEmail, action, id, feedbackReason, payload, hlToReject.user_email);
      return NextResponse.json({ success: true, message: "Feedback dropped. User can now review and adjust the highlight." });
    }

    // 9. PAUSE / RESUME HIGHLIGHT
    if (action === "pause_highlight" || action === "resume_highlight") {
      if (!id) return NextResponse.json({ error: "Highlight ID is required" }, { status: 400 });

      const isPaused = action === "pause_highlight";
      const activeHlUpdate: Record<string, any> = { is_paused: isPaused };
      const pendingHlUpdate: Record<string, any> = { is_paused: isPaused };

      if (isPaused) {
        if (payload?.statement !== undefined && payload?.statement !== null) {
          const cleanStmt = String(payload.statement).trim() || null;
          activeHlUpdate.admin_statement = cleanStmt;
          pendingHlUpdate.admin_statement = cleanStmt;
        }
      } else {
        // Resuming highlight: clear any admin pause statement so UI & advertiser see it as active and unpaused
        activeHlUpdate.admin_statement = null;

        const { data: existingPendingHl } = await supabaseAdmin
          .from("news")
          .select("admin_statement")
          .eq("id", id)
          .maybeSingle();

        const pendingStmt = String(existingPendingHl?.admin_statement || "").trim();
        if (
          pendingStmt &&
          !pendingStmt.startsWith("APPROVED:") &&
          !pendingStmt.startsWith("REJECTED:") &&
          !pendingStmt.toLowerCase().startsWith("status:")
        ) {
          pendingHlUpdate.admin_statement = null;
        }
      }

      const [activeHlRes, pendingHlRes] = await Promise.all([
        supabaseAdmin.from("newsactive").update(activeHlUpdate).eq("id", id).select("*").maybeSingle(),
        supabaseAdmin.from("news").update(pendingHlUpdate).eq("id", id).select("user_email").maybeSingle(),
      ]);

      const targetEmail = activeHlRes?.data?.user_email || pendingHlRes?.data?.user_email;
      await invalidateAdminCampaignCache(
        adminEmail,
        action,
        id,
        payload?.statement || payload?.reason,
        payload,
        targetEmail
      );
      return NextResponse.json({
        success: true,
        is_paused: isPaused,
        highlight: activeHlRes?.data || null,
        message: `Highlight ${isPaused ? "paused" : "resumed"} successfully.`,
      });
    }

    // 10. DELETE HIGHLIGHT
    if (action === "delete_highlight") {
      if (!id) return NextResponse.json({ error: "Highlight ID is required" }, { status: 400 });

      const [{ data: activeHl }, { data: pendingHl }] = await Promise.all([
        supabaseAdmin.from("newsactive").select("image_url, user_email").eq("id", id).maybeSingle(),
        supabaseAdmin.from("news").select("image_url, user_email").eq("id", id).maybeSingle(),
      ]);

      const targetEmail = activeHl?.user_email || pendingHl?.user_email;
      const imgUrl = activeHl?.image_url || pendingHl?.image_url;
      if (imgUrl) {
        await purgeStorageMedia(imgUrl, "news").catch(() => {});
      }

      const [delActive, delPending] = await Promise.all([
        supabaseAdmin.from("newsactive").delete().eq("id", id),
        supabaseAdmin.from("news").delete().eq("id", id),
      ]);

      if (delActive.error && delPending.error) {
        console.error("❌ Error deleting highlight:", delActive.error, delPending.error);
        return NextResponse.json({ error: delActive.error.message || delPending.error.message }, { status: 500 });
      }

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload, targetEmail);
      return NextResponse.json({ success: true, message: "Highlight deleted permanently." });
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

      const { data: insertedRows, error: directAdErr } = await supabaseAdmin
        .from("addsactive")
        .insert([adRecord])
        .select("*");
      if (directAdErr) throw directAdErr;

      const publishedAd = insertedRows?.[0] || adRecord;
      dispatchFeedDropWebhook(publishedAd).catch(() => {});

      await invalidateAdminCampaignCache(adminEmail, action, id, payload?.statement || payload?.reason, payload);
      return NextResponse.json({ success: true, message: "Ad published directly to active feed!" });
    }

    // 12. DIRECT POST HIGHLIGHT (Route straight to active newsactive!)
    if (action === "direct_post_highlight") {
      if (!payload) return NextResponse.json({ error: "Payload is required" }, { status: 400 });

      const {
        status: _status,
        approved_at: _appAt,
        payment_status: _payStatus,
        is_admin_post: _adminPost,
        custom_sponsor_name: _csName,
        custom_sponsor_handle: _csHandle,
        custom_sponsor_logo: _csLogo,
        ...cleanPayload
      } = payload;

      const highlightRecord = {
        ...cleanPayload,
        is_paused: false,
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
