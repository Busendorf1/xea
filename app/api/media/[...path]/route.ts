import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_BUCKETS = new Set(["ad-media", "news", "avatars", "dp", "banners"]);
const VIDEO_FILE_RE = /\.(mp4|webm|mov|m4v|m3u8|ts|3gp|avi|mkv)(?:$|\?)/i;

function resolveMediaOriginUrl(bucket: string, encodedPath: string): string | null {
  // Optional Cloudflare R2 hook (ready for future cutover when R2_PUBLIC_URL is configured)
  const r2Base = (
    process.env.R2_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (r2Base) {
    return `${r2Base}/${bucket}/${encodedPath}`;
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

/**
 * High-Speed Vercel Edge CDN Shield for Small Images + Direct Storage Redirect for Videos
 *
 * Designed for 500M+ users without Vercel Pro or R2 yet:
 *   - Small images (<2MB): Streamed once from Storage and cached globally on Vercel Anycast Edge CDN
 *     (`s-maxage=31536000, immutable`) so Supabase Storage egress drops by >95% without hitting
 *     Next.js's 2MB Data Cache ceiling.
 *   - Videos & HTTP 206 Byte-Range requests: Immediately 307-redirected directly to upstream
 *     Storage/R2 CDN so Vercel Hobby's 10s serverless timeout and 10GB Origin Transfer cap
 *     NEVER become a bottleneck.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await context.params;
    if (!pathSegments || pathSegments.length < 2) {
      return new NextResponse("Invalid media path.", { status: 400 });
    }

    const bucket = pathSegments[0];
    if (!ALLOWED_BUCKETS.has(bucket)) {
      return new NextResponse("Invalid storage bucket.", { status: 403 });
    }

    const rawFilePath = pathSegments.slice(1).join("/");
    // Guard against path traversal
    if (rawFilePath.includes("..") || rawFilePath.includes("\\")) {
      return new NextResponse("Invalid file path.", { status: 400 });
    }

    const encodedPath = rawFilePath
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const originUrl = resolveMediaOriginUrl(bucket, encodedPath);
    if (!originUrl) {
      return new NextResponse("Storage service unavailable.", { status: 503 });
    }

    // Never proxy video files or HTTP 206 byte-range streams through Vercel Serverless (C-21)
    const rangeHeader = req.headers.get("range");
    if (rangeHeader || VIDEO_FILE_RE.test(rawFilePath)) {
      const redirectHeaders = new Headers();
      redirectHeaders.set("Location", originUrl);
      redirectHeaders.set("Cache-Control", "public, max-age=300, s-maxage=300");
      redirectHeaders.set("CDN-Cache-Control", "public, s-maxage=300");
      redirectHeaders.set("Access-Control-Allow-Origin", "*");
      redirectHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      redirectHeaders.set("Access-Control-Allow-Headers", "Range, Accept-Encoding");
      return new NextResponse(null, { status: 307, headers: redirectHeaders });
    }

    // Images & small static assets: fetch without Next.js 2MB Data Cache (`cache: "no-store"`)
    // and let Vercel Anycast Edge CDN cache globally via `s-maxage=31536000, immutable`.
    const originRes = await fetch(originUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (!originRes.ok && originRes.status !== 206) {
      return new NextResponse(originRes.statusText || "Media not found.", {
        status: originRes.status,
      });
    }

    // If upstream serves a video MIME type or file > 2MB without video extension, redirect directly
    const contentType = originRes.headers.get("content-type") || "application/octet-stream";
    const contentLengthNum = Number(originRes.headers.get("content-length") || 0);
    if (contentType.startsWith("video/") || contentLengthNum > 2 * 1024 * 1024) {
      try {
        await originRes.body?.cancel();
      } catch {}
      const redirectHeaders = new Headers();
      redirectHeaders.set("Location", originUrl);
      redirectHeaders.set("Cache-Control", "public, max-age=300, s-maxage=300");
      redirectHeaders.set("Access-Control-Allow-Origin", "*");
      return new NextResponse(null, { status: 307, headers: redirectHeaders });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Accept-Ranges", "bytes");

    if (originRes.headers.get("content-range")) {
      responseHeaders.set("Content-Range", originRes.headers.get("content-range")!);
    }
    if (originRes.headers.get("content-length")) {
      responseHeaders.set("Content-Length", originRes.headers.get("content-length")!);
    }
    if (originRes.headers.get("etag")) {
      responseHeaders.set("ETag", originRes.headers.get("etag")!);
    }

    // Vercel Anycast Edge CDN Caching Headers (300+ global PoPs)
    responseHeaders.set(
      "Cache-Control",
      "public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400, immutable"
    );
    responseHeaders.set("CDN-Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    responseHeaders.set("Vercel-CDN-Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");

    // CORS for mobile app & web feed
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Range, Accept-Encoding");

    return new NextResponse(originRes.body, {
      status: originRes.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error("❌ Error proxying media through Vercel CDN:", err);
    return new NextResponse("Internal server error.", { status: 500 });
  }
}

export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await context.params;
    if (!pathSegments || pathSegments.length < 2) {
      return new NextResponse(null, { status: 400 });
    }

    const bucket = pathSegments[0];
    if (!ALLOWED_BUCKETS.has(bucket)) {
      return new NextResponse(null, { status: 403 });
    }

    const rawFilePath = pathSegments.slice(1).join("/");
    if (!rawFilePath || rawFilePath.includes("..") || rawFilePath.includes("\\")) {
      return new NextResponse(null, { status: 400 });
    }

    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
    if (!supabaseUrl) {
      return new NextResponse(null, { status: 503 });
    }

    const encodedPath = rawFilePath.split("/").map(encodeURIComponent).join("/");
    const originUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`;

    const originRes = await fetch(originUrl, {
      method: "HEAD",
      cache: "no-store",
      headers: req.headers.get("range") ? { Range: req.headers.get("range")! } : {},
    });

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", originRes.headers.get("content-type") || "application/octet-stream");
    responseHeaders.set("Accept-Ranges", "bytes");
    if (originRes.headers.get("content-length")) {
      responseHeaders.set("Content-Length", originRes.headers.get("content-length")!);
    }
    if (originRes.headers.get("content-range")) {
      responseHeaders.set("Content-Range", originRes.headers.get("content-range")!);
    }
    if (originRes.headers.get("etag")) {
      responseHeaders.set("ETag", originRes.headers.get("etag")!);
    }
    responseHeaders.set(
      "Cache-Control",
      "public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400, immutable"
    );
    responseHeaders.set("CDN-Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    responseHeaders.set("Vercel-CDN-Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(null, {
      status: originRes.status,
      headers: responseHeaders,
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Accept-Encoding, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
