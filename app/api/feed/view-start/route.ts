import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import { checkRateLimit } from "@/lib/edgeRateLimit";
import { env } from "@/lib/env";
import {
  getEarnTokenSecret,
  signAdViewStartToken,
  verifyHmacSignature,
} from "../../../../lib/targetingEngine";

const MAX_AD_SESSION_MS = 1800000; // 30 minutes (matches /api/earn window)
const FUTURE_SKEW_MS = 60000;
const MAX_CLIENT_DEBOUNCE_MS = 2500;

/**
 * POST /api/feed/view-start
 * Stateless, zero-Redis endpoint called after a 2.5s scroll debounce to mint
 * a per-card HMAC-signed `viewToken` anchored to `viewStartedAt`.
 */
export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, {
    limit: 120,
    windowSeconds: 60,
    identifierPrefix: "feed_view_start",
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const adId = String(body?.adId || body?.ad_id || "").trim();
    const token = String(body?.token || "").trim();
    const servedAtRaw = body?.servedAt ?? body?.served_at;
    const rawDebounce = Number(body?.debounceMs ?? body?.debounce_ms ?? 0);
    const clampedDebounceMs = Number.isFinite(rawDebounce)
      ? Math.min(MAX_CLIENT_DEBOUNCE_MS, Math.max(0, Math.round(rawDebounce)))
      : 0;

    if (!adId || !token || servedAtRaw === undefined || servedAtRaw === null) {
      return NextResponse.json(
        { error: "adId, token, and servedAt are required to start view verification." },
        { status: 400 }
      );
    }

    const secretKey = getEarnTokenSecret();
    const fallbackAuth0Key = env.AUTH0_SECRET || process.env.AUTH0_SECRET || "";
    if (!secretKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const parsedServedAt = Number.parseInt(String(servedAtRaw), 10);
    const now = Date.now();
    if (
      !Number.isFinite(parsedServedAt) ||
      parsedServedAt > now + FUTURE_SKEW_MS ||
      now - parsedServedAt > MAX_AD_SESSION_MS
    ) {
      return NextResponse.json(
        { error: "Feed session expired. Please refresh your feed." },
        { status: 403 }
      );
    }

    const emailKey = email.toLowerCase().trim();
    const candidateKeys = Array.from(new Set([secretKey, fallbackAuth0Key].filter(Boolean)));
    const fastPayloads = [
      `${adId}:${emailKey}:${servedAtRaw}`,
      `${adId}:${email.trim()}:${servedAtRaw}`,
    ];

    let verified = verifyHmacSignature(fastPayloads, token, candidateKeys);
    if (!verified) {
      // Lazy Auth0 cookie fallback only if a legacy token was signed with session.user.sub
      const session = await auth0.getSession().catch(() => null);
      const userId = session?.user?.sub;
      if (userId) {
        verified = verifyHmacSignature([`${adId}:${userId}:${servedAtRaw}`], token, candidateKeys);
      }
    }

    if (!verified) {
      return NextResponse.json(
        { error: "Cryptographic feed token verification failed." },
        { status: 403 }
      );
    }

    // 100% stateless timestamp anchored safely inside [parsedServedAt, now]
    const viewStartedAt = Math.max(parsedServedAt, now - clampedDebounceMs);
    const viewToken = signAdViewStartToken(adId, emailKey, viewStartedAt, String(servedAtRaw));
    return NextResponse.json({
      success: true,
      viewStartedAt,
      viewToken,
      servedAt: parsedServedAt,
    });
  } catch (err) {
    console.error("Error in POST /api/feed/view-start:", err);
    return NextResponse.json(
      { error: "Failed to initialize per-card attention timer." },
      { status: 500 }
    );
  }
}
