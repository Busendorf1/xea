import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Android App Links verification file (/.well-known/assetlinks.json).
 * Allows Paayh links (https://paayh.com/*) to open directly in the Android app when installed,
 * falling back seamlessly to web when not installed.
 */
export async function GET() {
  const packageName = (process.env.ANDROID_APP_PACKAGE || "com.paayh.app").trim();
  const rawFingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const payload = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: rawFingerprints,
      },
    },
  ];

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
