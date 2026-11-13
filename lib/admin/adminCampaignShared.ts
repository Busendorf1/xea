import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady, scanDeletePattern } from "@/lib/redis";
import { invalidateCachedUserCampaigns } from "@/lib/utils/cache";
import { z } from "zod";

export const ADMIN_CAMPAIGNS_CACHE_PREFIX = "admin:campaigns:";
export const CACHE_TTL_SECONDS = 30;

export const adminCampaignActionSchema = z.object({
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

// Strict field allowlists to prevent mass assignment of financial/ownership/system columns
export const ALLOWED_AD_EDIT_FIELDS = [
  "headline",
  "content",
  "ad_content",
  "cta_link",
  "cta_button_text",
  "ad_type",
  "ad_media_type",
  "ad_media",
  "ad_media_url",
  "media_url",
  "ad_action_buttons",
  "action_phone",
  "action_whatsapp",
  "action_website",
  "action_email",
  "impressions",
  "campaign_days",
  "daily_impression_cap",
  "user_frequency_cap",
  "industry",
  "interest",
  "country",
  "state",
  "location",
  "gender",
  "age_range",
  "employment",
  "lifestyle",
  "behavior",
  "personality",
  "custom_sponsor_name",
  "custom_sponsor_handle",
  "custom_sponsor_logo",
  "admin_statement",
  "is_paused",
] as const;

export const ALLOWED_HIGHLIGHT_EDIT_FIELDS = [
  "title",
  "content",
  "interest",
  "image_url",
  "campaign_days",
  "scheduled_start_at",
  "scheduled_end_at",
  "expires_at",
  "admin_statement",
  "is_paused",
] as const;

export const ALLOWED_DIRECT_AD_FIELDS = [
  "id",
  "user_email",
  "headline",
  "content",
  "ad_content",
  "cta_link",
  "cta_button_text",
  "ad_type",
  "ad_media_type",
  "media_url",
  "ad_media",
  "ad_media_url",
  "impressions",
  "impressions_remaining",
  "campaign_days",
  "daily_impression_cap",
  "daily_impression_count",
  "user_frequency_cap",
  "ad_action_buttons",
  "action_phone",
  "action_whatsapp",
  "action_website",
  "action_email",
  "industry",
  "interest",
  "country",
  "state",
  "location",
  "gender",
  "age_range",
  "custom_sponsor_name",
  "custom_sponsor_handle",
  "custom_sponsor_logo",
] as const;

export const ALLOWED_DIRECT_HIGHLIGHT_FIELDS = [
  "id",
  "title",
  "content",
  "image_url",
  "interest",
  "user_email",
  "campaign_days",
  "scheduled_start_at",
  "scheduled_end_at",
  "expires_at",
] as const;

export function pickAllowedFields<T extends readonly string[]>(
  source: Record<string, any> | undefined | null,
  allowedKeys: T
): Record<string, any> {
  const result: Record<string, any> = {};
  if (!source || typeof source !== "object") return result;
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

export function sanitizePostgrestSearch(raw: string): string {
  return raw.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
}

export async function logAdminAudit(
  adminEmail: string,
  action: string,
  targetId?: string,
  reason?: string,
  details?: any
): Promise<void> {
  try {
    await supabaseAdmin.from("admin_audit_logs").insert([
      {
        admin_email: adminEmail.toLowerCase(),
        action,
        target_id: targetId || null,
        target_type: "campaign",
        reason: reason || null,
        new_state: details ? JSON.parse(JSON.stringify(details)) : null,
      },
    ]);
  } catch (e) {
    console.warn("⚠️ Failed to write admin campaign audit log:", e);
  }
}

export async function invalidateAdminCampaignCache(
  adminEmail?: string,
  action?: string,
  targetId?: string,
  reason?: string,
  details?: any,
  targetUserEmail?: string
): Promise<void> {
  const tasks: Promise<any>[] = [];

  if (adminEmail && action) {
    tasks.push(
      logAdminAudit(adminEmail, action, targetId, reason, details).catch((e) =>
        console.warn("Audit log error:", e)
      )
    );
  }
  if (targetUserEmail) {
    tasks.push(invalidateCachedUserCampaigns(targetUserEmail).catch(() => {}));
  }

  if (isRedisReady()) {
    tasks.push(
      (async () => {
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
      })()
    );
  }

  await Promise.race([
    Promise.all(tasks),
    new Promise((resolve) => setTimeout(resolve, 450)),
  ]);
}
