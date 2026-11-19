import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { checkRateLimit } from "@/lib/edgeRateLimit";

const ALLOWED_VIDEO_BUCKETS = new Set(["ad-media", "news"]);
const ALLOWED_VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);
const MAX_VIDEO_DURATION_SECONDS = 180;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB direct to Storage (bypasses Vercel 4.5MB Serverless cap)

/**
 * POST /api/campaigns/upload-video-url
 * Issues a direct Supabase Storage presigned upload URL for verified campaign videos
 * (<= 180s, <= 50MB) so Web & Mobile upload video binaries directly to Storage without
 * hitting Vercel Serverless's 4.5MB request body ceiling.
 */
export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, {
    limit: 12,
    windowSeconds: 60,
    identifierPrefix: "upload_video_url",
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const email = await getAuthenticatedEmail(request, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const bucket = String(body.bucket || "ad-media").trim();
    const rawFileName = String(body.fileName || "video.mp4").trim();
    const durationSeconds = Number(body.durationSeconds);
    const fileSizeBytes = Number(body.fileSizeBytes || 0);

    if (!ALLOWED_VIDEO_BUCKETS.has(bucket)) {
      return NextResponse.json({ error: "Invalid storage bucket." }, { status: 400 });
    }

    if (
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > MAX_VIDEO_DURATION_SECONDS
    ) {
      return NextResponse.json(
        { error: `Video duration must be verified and at most ${MAX_VIDEO_DURATION_SECONDS} seconds.` },
        { status: 400 }
      );
    }

    if (Number.isFinite(fileSizeBytes) && fileSizeBytes > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: "Video file exceeds the 50MB maximum upload size." },
        { status: 400 }
      );
    }

    const sanitizedBase = rawFileName.replace(/[^\w.-]/g, "_");
    const ext = sanitizedBase.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_VIDEO_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: "Unsupported video format. Allowed: mp4, webm, mov, m4v." },
        { status: 400 }
      );
    }

    const cleanEmailPrefix = email
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "_")
      .slice(0, 24);
    const finalPath = `${Date.now()}_${cleanEmailPrefix}_${sanitizedBase}`;

    const { data: signedData, error: signErr } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUploadUrl(finalPath);

    if (signErr || !signedData) {
      return NextResponse.json(
        { error: signErr?.message || "Failed to generate signed video upload URL." },
        { status: 500 }
      );
    }

    // Serve videos directly from R2 (if configured later) or Supabase Storage CDN — never proxied through Vercel Serverless
    const r2Base = (
      process.env.R2_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
      ""
    )
      .trim()
      .replace(/\/+$/, "");

    const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(finalPath);
    const publicUrl = r2Base
      ? `${r2Base}/${bucket}/${finalPath.split("/").map(encodeURIComponent).join("/")}`
      : publicUrlData?.publicUrl || "";

    return NextResponse.json({
      success: true,
      bucket,
      path: finalPath,
      token: signedData.token,
      signedUrl: signedData.signedUrl,
      publicUrl,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to create video upload URL." },
      { status: 500 }
    );
  }
}
