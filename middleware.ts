import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

function clearSessionCookies(response: NextResponse, request?: NextRequest) {
  const cookiesToClear = new Set([
    "appSession",
    "__session",
    "__Host-appSession",
    "auth0.is.authenticated",
    "paayh_statement_cache",
    "paayh_active_tab",
    "xea_session",
  ]);
  for (let i = 0; i <= 4; i++) {
    cookiesToClear.add(`appSession.${i}`);
    cookiesToClear.add(`appSession__${i}`);
    cookiesToClear.add(`__session.${i}`);
    cookiesToClear.add(`__session__${i}`);
    cookiesToClear.add(`__Host-appSession.${i}`);
  }
  if (request) {
    for (const c of request.cookies.getAll()) {
      if (
        c.name.startsWith("appSession") ||
        c.name.startsWith("__session") ||
        c.name.startsWith("__Host-appSession") ||
        c.name.startsWith("__txn_")
      ) {
        cookiesToClear.add(c.name);
      }
    }
  }
  for (const name of cookiesToClear) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      ...(name.startsWith("__Host-") ? { secure: true } : {}),
    });
  }
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, search, hostname } = request.nextUrl;

  // Canonicalize www.paayh.com -> paayh.com so Auth0 __txn_ state cookies are never split across subdomains
  if (hostname === "www.paayh.com") {
    const canonicalUrl = new URL(`https://paayh.com${pathname}${search}`);
    return NextResponse.redirect(canonicalUrl, 308);
  }

  // For public static or informative pages, bypass Auth0 middleware to eliminate discovery timeouts
  const isPublicPage =
    pathname === "/" ||
    pathname === "/modal" ||
    pathname.startsWith("/modal/") ||
    pathname === "/ubiai" ||
    pathname.startsWith("/ubiai/") ||
    pathname === "/about" ||
    pathname === "/login" ||
    pathname.startsWith("/.well-known/") ||
    pathname === "/apple-app-site-association" ||
    pathname.startsWith("/ad/") ||
    pathname === "/help" ||
    pathname === "/advert" ||
    pathname === "/advertiser-guidelines" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/faq" ||
    pathname === "/cookies" ||
    pathname === "/careers" ||
    pathname === "/join" ||
    pathname.startsWith("/api/feed") ||
    pathname.startsWith("/api/media") ||
    pathname.startsWith("/cdn/storage") ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/highlights") ||
    pathname.startsWith("/api/payments/webhook") ||
    pathname.startsWith("/api/payments/kora-webhook") ||
    pathname.startsWith("/api/payments/mobile-callback") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron");

  if (isPublicPage) {
    return NextResponse.next();
  }

  // Bypass auth0.middleware on /auth/logout so app/auth/logout/route.ts runs directly
  // with a validated absolute returnTo URL (preventing post_logout_redirect_uri=%2F errors).
  if (pathname === "/auth/logout") {
    return clearSessionCookies(NextResponse.next(), request);
  }

  try {
    const res = await auth0.middleware(request);
    if (pathname.includes("/logout") && res instanceof NextResponse) {
      res.cookies.delete("paayh_statement_cache");
      res.cookies.delete("xea_session");
      res.cookies.delete("auth0.is.authenticated");
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.headers.set("Pragma", "no-cache");
    }
    return res;
  } catch (error: any) {
    console.warn("Auth0 middleware discovery timeout bypassed:", error?.message || error);

    // For logout requests during Auth0 discovery outages, cleanly clear cookies and redirect home
    if (pathname.includes("/logout")) {
      const response = NextResponse.redirect(new URL("/", request.url));
      return clearSessionCookies(response, request);
    }

    if (pathname.startsWith("/auth/callback")) {
      return new NextResponse(
        `Authentication callback error: ${error?.message || error}. Please start a fresh login from /auth/login.`,
        { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    const isProtectedUiRoute =
      pathname.startsWith("/admin") ||
      pathname.startsWith("/logged-in") ||
      pathname.startsWith("/user");

    if (isProtectedUiRoute) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
