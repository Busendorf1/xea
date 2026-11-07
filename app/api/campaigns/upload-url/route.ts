import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { checkRateLimit } from "@/lib/edgeRateLimit";

const ALLOWED_BUCKETS = new Set(["ad-media", "news", "avatars"]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "mp4", "webm", "mov"]);

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, {
    limit: 20,
    windowSeconds: 60,
    identifierPrefix: "upload_url",
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const bucket = String(body.bucket || "ad-media").trim();
    const rawFileName = String(body.fileName || "").trim();

    if (!ALLOWED_BUCKETS.has(bucket)) {
      return NextResponse.json({ error: "Invalid storage bucket." }, { status: 400 });
    }

    const sanitizedBase = rawFileName.replace(/[^\w.-]/g, "_");
    const ext = sanitizedBase.split(".").pop()?.toLowerCase() || "jpg";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: "Unsupported media file extension." }, { status: 400 });
    }

    const cleanEmailPrefix = email.toLowerCase().trim().replace(/[^a-z0-9]/g, "_").slice(0, 24);
    const finalPath = sanitizedBase.startsWith(`${Date.now().toString().slice(0, 5)}`)
      ? sanitizedBase
      : `${Date.now()}_${cleanEmailPrefix}_${sanitizedBase}`;

    const { data: signedData, error: signErr } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUploadUrl(finalPath);

    if (signErr || !signedData) {
      return NextResponse.json(
        { error: signErr?.message || "Failed to generate signed upload URL." },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(finalPath);
    let publicUrl = publicUrlData?.publicUrl || "";

    // Enterprise CDN rewrite (uses NEXT_STORAGE_CDN_URL or NEXT_PUBLIC_STORAGE_CDN_URL, defaults to https://paayh.com in production)
    const rawCdnBase =
      process.env.NEXT_STORAGE_CDN_URL?.trim() ||
      process.env.NEXT_PUBLIC_STORAGE_CDN_URL?.trim() ||
      (process.env.NODE_ENV === "production" ? "https://paayh.com" : "");
    const cdnBase = rawCdnBase.replace(/\/+$/, "");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
    if (cdnBase && supabaseUrl && publicUrl.startsWith(supabaseUrl)) {
      const storagePrefix = `${supabaseUrl}/storage/v1/object/public/`;
      if (publicUrl.startsWith(storagePrefix)) {
        const relativeAssetPath = publicUrl.slice(storagePrefix.length);
        publicUrl = cdnBase.endsWith("/cdn/storage")
          ? `${cdnBase}/${relativeAssetPath}`
          : `${cdnBase}/cdn/storage/${relativeAssetPath}`;
      } else {
        publicUrl = publicUrl.replace(supabaseUrl, cdnBase);
      }
    }

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
      { error: err?.message || "Failed to create upload URL." },
      { status: 500 }
    );
  }
}
