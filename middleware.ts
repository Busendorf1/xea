import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

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

  try {
    return await auth0.middleware(request);
  } catch (error: any) {
    console.warn("Auth0 middleware discovery timeout bypassed:", error?.message || error);
    
    // For logout requests during Auth0 discovery outages, cleanly clear cookies and redirect home
    if (pathname.includes("/logout")) {
      const response = NextResponse.redirect(new URL("/", request.url));
      response.cookies.delete("appSession");
      response.cookies.delete("auth0.is.authenticated");
      return response;
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
