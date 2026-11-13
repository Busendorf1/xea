import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
