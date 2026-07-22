import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import supabaseAdmin from "./dbAdmin";

const execAsync = promisify(exec);

export interface TranscodeResult {
  success: boolean;
  masterPlaylistUrl?: string;
  error?: string;
}

/**
 * Transcodes an input video file into HLS multi-bitrate streams (.m3u8 + .ts segments)
 * and uploads the result to Supabase Storage bucket (`ad-media`).
 */
export async function transcodeVideoToHLS(
  sourceUrl: string,
  mediaId: string,
  bucketName: string = "ad-media"
): Promise<TranscodeResult> {
  const tempDir = path.join(os.tmpdir(), `hls_${mediaId}_${Date.now()}`);
  const inputFilePath = path.join(tempDir, "input.mp4");

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    // 1. Download original video
    console.log(`📹 HLS Transcoder: Downloading source video from ${sourceUrl}...`);
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch source video: ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(inputFilePath, Buffer.from(arrayBuffer));

    // 2. Check if ffmpeg is available
    let hasFfmpeg = false;
    try {
      await execAsync("ffmpeg -version");
      hasFfmpeg = true;
    } catch {
      console.warn("⚠️ HLS Transcoder: ffmpeg binary not detected on PATH. Skipping HLS generation fallback.");
    }

    if (!hasFfmpeg) {
      return {
        success: false,
        error: "ffmpeg is not installed on this system environment.",
      };
    }

    // 3. Execute FFmpeg to generate dual-stream HLS (720p and 360p) + Master Playlist
    const ffmpegCmd = [
      `ffmpeg -i "${inputFilePath}"`,
      `-filter_complex "[0:v]split=2[v1][v2]; [v1]scale=w=1280:h=720:force_original_aspect_ratio=decrease[v1out]; [v2]scale=w=640:h=360:force_original_aspect_ratio=decrease[v2out]"`,
      `-map "[v1out]" -c:v:0 libx264 -b:v:0 2500k -maxrate:v:0 2675k -bufsize:v:0 3750k -map 0:a? -c:a:0 aac -b:a:0 128k`,
      `-map "[v2out]" -c:v:1 libx264 -b:v:1 800k -maxrate:v:1 856k -bufsize:v:1 1200k -map 0:a? -c:a:1 aac -b:a:1 96k`,
      `-f hls -hls_time 4 -hls_playlist_type vod`,
      `-hls_flags independent_segments`,
      `-hls_segment_filename "${tempDir}/segment_%v_%03d.ts"`,
      `-master_pl_name master.m3u8`,
      `"${tempDir}/variant_%v.m3u8"`
    ].join(" ");

    console.log(`🎬 HLS Transcoder: Executing FFmpeg command...`);
    await execAsync(ffmpegCmd);

    // 4. Upload generated HLS files to Supabase Storage
    const generatedFiles = fs.readdirSync(tempDir).filter(f => f.endsWith(".m3u8") || f.endsWith(".ts"));
    console.log(`⬆️ HLS Transcoder: Uploading ${generatedFiles.length} HLS files to Supabase Storage...`);

    const uploadPrefix = `hls/${mediaId}`;

    for (const file of generatedFiles) {
      const filePath = path.join(tempDir, file);
      const fileBuffer = fs.readFileSync(filePath);
      const storagePath = `${uploadPrefix}/${file}`;

      const contentType = file.endsWith(".m3u8") 
        ? "application/x-mpegURL" 
        : "video/MP2T";

      const { error: uploadError } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(storagePath, fileBuffer, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error(`❌ Upload failed for ${file}:`, uploadError.message);
      }
    }

    // 5. Get Master Playlist Public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from(bucketName)
      .getPublicUrl(`${uploadPrefix}/master.m3u8`);

    console.log(`✅ HLS Transcoding complete: ${publicUrlData.publicUrl}`);

    return {
      success: true,
      masterPlaylistUrl: publicUrlData.publicUrl,
    };
  } catch (err: any) {
    console.error("❌ HLS Transcoder Error:", err.message);
    return {
      success: false,
      error: err.message,
    };
  } finally {
    // Cleanup temporary directory
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn("Temporary dir cleanup failed:", cleanupErr);
      }
    }
  }
}
