import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthenticatedEmail, revokeUserTokensLocally } from "@/lib/authHelper";

export const dynamic = "force-dynamic";

function isSameOriginHeader(headerValue: string | null, expectedOrigin: string): boolean {
  if (!headerValue) return true; // Direct navigation / mobile client with no Origin/Referer
  try {
    return new URL(headerValue).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

async function revokeSessionAndCaches(req: NextRequest): Promise<void> {
  try {
    const email = await getAuthenticatedEmail(req, { allowMobileHeader: false }).catch(() => null);
    const authHeader = req.headers.get("Authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";

    const { default: redisConnection, isRedisReady } = await import("@/lib/redis");
    if (bearerToken && isRedisReady()) {
      const digest = crypto.createHash("sha256").update(bearerToken).digest("hex");
      await redisConnection.del(`auth:bearer:${digest}`).catch(() => {});
    }

    if (email) {
      const emailLower = email.toLowerCase().trim();
      revokeUserTokensLocally(emailLower);
      if (isRedisReady()) {
        await Promise.allSettled([
          redisConnection.set(`revoked_before:${emailLower}`, String(Date.now()), "EX", 86400),
          redisConnection.del(`auth:status:${emailLower}`),
        ]);
      }
      const { invalidateCachedProfile } = await import("@/lib/utils/cache");
      await invalidateCachedProfile(emailLower).catch(() => {});
    }
  } catch {
    // Best-effort revocation; never block logout flow
  }
}

function isValidHttpUrl(value: string | undefined | null): value is string {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveSafeAbsoluteBaseUrl(req: NextRequest): string {
  const candidates = [process.env.APP_BASE_URL, process.env.AUTH0_BASE_URL];
  for (const candidate of candidates) {
    if (isValidHttpUrl(candidate)) {
      return new URL(candidate.trim()).origin;
    }
  }
  const reqOrigin = req.nextUrl?.origin;
  if (isValidHttpUrl(reqOrigin)) {
    return new URL(reqOrigin).origin;
  }
  return "http://localhost:3000";
}

function resolveSafeReturnTo(req: NextRequest, baseUrl: string): string {
  const rawReturnTo = req.nextUrl?.searchParams?.get("returnTo")?.trim();
  if (!rawReturnTo || rawReturnTo === "/") {
    return baseUrl;
  }
  try {
    const baseParsed = new URL(baseUrl);
    const resolved = new URL(rawReturnTo, baseParsed);
    if (
      (resolved.protocol === "http:" || resolved.protocol === "https:") &&
      resolved.origin === baseParsed.origin
    ) {
      if (resolved.pathname === "/" && !resolved.search && !resolved.hash) {
        return baseParsed.origin;
      }
      return resolved.toString();
    }
  } catch {
    // Fall back to baseUrl below
  }
  return baseUrl;
}

export async function GET(req: NextRequest) {
  const rawDomain =
    process.env.AUTH0_DOMAIN ||
    process.env.AUTH0_ISSUER_BASE_URL ||
    "auth.paayh.com";
  const cleanDomain = rawDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const clientId = process.env.AUTH0_CLIENT_ID || "";
  const baseUrl = resolveSafeAbsoluteBaseUrl(req);
  const returnToUrl = resolveSafeReturnTo(req, baseUrl);

  // Mitigate cross-site logout CSRF (C-09): reject cross-origin Referer/Origin requests
  const originHeader = req.headers.get("origin");
  const refererHeader = req.headers.get("referer");
  const reqOrigin = req.nextUrl?.origin || baseUrl;
  const originAllowed =
    isSameOriginHeader(originHeader, baseUrl) || isSameOriginHeader(originHeader, reqOrigin);
  const refererAllowed =
    isSameOriginHeader(refererHeader, baseUrl) || isSameOriginHeader(refererHeader, reqOrigin);
  if ((originHeader && !originAllowed) || (refererHeader && !refererAllowed)) {
    return NextResponse.json({ error: "Cross-origin logout request rejected" }, { status: 403 });
  }

  await revokeSessionAndCaches(req);

  // Build direct Auth0 v2 logout URL with a guaranteed absolute http(s) returnTo URL
  const auth0LogoutUrl =
    clientId && clientId !== "placeholder-client-id"
      ? `https://${cleanDomain}/v2/logout?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent(returnToUrl)}`
      : returnToUrl;

  const response = NextResponse.redirect(auth0LogoutUrl);

  const cookiesToClear = new Set<string>([
    "appSession",
    "__session",
    "__Host-appSession",
    "auth0.is.authenticated",
    "xea_session",
    "paayh_statement_cache",
    "paayh_active_tab",
  ]);

  for (let i = 0; i <= 4; i++) {
    cookiesToClear.add(`appSession.${i}`);
    cookiesToClear.add(`appSession__${i}`);
    cookiesToClear.add(`__session.${i}`);
    cookiesToClear.add(`__session__${i}`);
    cookiesToClear.add(`__Host-appSession.${i}`);
  }

  for (const c of req.cookies.getAll()) {
    cookiesToClear.add(c.name);
  }

  cookiesToClear.forEach((name) => {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      ...(name.startsWith("__Host-") ? { secure: true } : {}),
    });
  });

  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}

/**
 * POST /auth/logout — Server-side session & Bearer token revocation endpoint for Mobile & Web clients.
 */
export async function POST(req: NextRequest) {
  await revokeSessionAndCaches(req);
  const response = NextResponse.json({ success: true });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
