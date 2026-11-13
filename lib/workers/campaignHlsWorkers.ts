import { Worker } from "bullmq";
import supabaseAdmin from "../utils/dbAdmin";
import { invalidateAllHighlights } from "../utils/cache";
import { isAdminEmail } from "../adminHelper";
import { CampaignJobData, HlsJobData, connectionOptions } from "./config";

export const campaignsWorker = new Worker<CampaignJobData>(
  "campaigns-events",
  async (job) => {
    const { type, payload } = job.data;
    console.log(`👷 Campaigns Worker: Creating ${type} for user: ${payload.user_email}`);

    try {
      const isAuthorizedAdminPost = Boolean(payload.is_admin_post) && isAdminEmail(payload.user_email);
      if (type === "ad") {
        const targetTable = isAuthorizedAdminPost ? "addsactive" : "adds";
        const { data: insertedRows, error } = await supabaseAdmin.from(targetTable).insert([payload]).select("*");
        if (error) throw new Error(error.message);
        if (targetTable === "addsactive" && insertedRows?.[0]) {
          const { dispatchFeedDropWebhook } = await import("../webhookDispatcher");
          dispatchFeedDropWebhook(insertedRows[0]).catch(() => {});
        }
      } else if (type === "highlight") {
        const targetTable = isAuthorizedAdminPost ? "newsactive" : "news";
        const { error } = await supabaseAdmin.from(targetTable).insert([payload]);
        if (error) throw new Error(error.message);
        if (isAuthorizedAdminPost) {
          await invalidateAllHighlights();
        }
      }
    } catch (err: unknown) {
      console.error(`❌ Campaigns Worker: Failed to create ${type}:`, (err as Error)?.message || err);
      throw err;
    }
  },
  {
    connection: connectionOptions,
    concurrency: 2,
  }
);

campaignsWorker.on("completed", (job) => {
  console.log(`✅ Campaigns Worker: Job [${job.name}] successfully completed.`);
});

campaignsWorker.on("failed", (job, err) => {
  console.error(`❌ Campaigns Worker: Job [${job?.name}] failed:`, err.message);
});

export const hlsWorker = new Worker<HlsJobData>(
  "hls-transcode-events",
  async (job) => {
    const { sourceUrl, mediaId, bucketName, tableName, recordId } = job.data;
    console.log(`🎥 HLS Worker: Transcoding video [${mediaId}] from ${sourceUrl}...`);

    const { transcodeVideoToHLS } = await import("../utils/transcoder");
    const result = await transcodeVideoToHLS(sourceUrl, mediaId, bucketName || "ad-media");

    if (result.success && result.masterPlaylistUrl) {
      console.log(`✅ HLS Worker: Successfully generated HLS for [${mediaId}]. Updating DB table [${tableName}]...`);
      if (tableName && recordId) {
        await supabaseAdmin
          .from(tableName)
          .update({ hls_url: result.masterPlaylistUrl })
          .eq("id", recordId);
      }
    } else {
      console.warn(`⚠️ HLS Worker: Transcoding did not produce HLS URL. Reason: ${result.error}`);
    }
  },
  {
    connection: connectionOptions,
    concurrency: 1,
  }
);

hlsWorker.on("completed", (job) => {
  console.log(`✅ HLS Worker: Job [${job.name}] finished transcoding.`);
});

hlsWorker.on("failed", (job, err) => {
  console.error(`❌ HLS Worker: Job [${job?.name}] failed:`, err.message);
});
